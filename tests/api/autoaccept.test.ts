import { describe, it, expect, beforeEach, vi } from "vitest";

// Auto-accept policy proofs: it is NOT a new write path — it drives
// acceptProposal (the gate) for confident EMAIL proposals only, is off by
// default, tags what it accepts, and every acceptance is undoable.

const currentUser = { id: "" };
vi.mock("@/lib/auth", () => ({
  getUserId: async () => currentUser.id || null,
  requireUser: async () => ({ id: currentUser.id }),
}));

import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { extractFromSource } from "@/lib/extraction";
import { extractSources } from "@/lib/gmail/sync";
import { acceptProposal, autoAcceptConfident } from "@/lib/proposals";
import { POST as undoProposal } from "@/app/api/proposals/[id]/undo/route";
import { GET as listProposals } from "@/app/api/proposals/route";
import { PATCH as patchSettings } from "@/app/api/gmail/settings/route";

// stub backend emits: task @0.92, event @0.85, task @0.55 → only the first
// clears the 0.9 auto-accept bar

async function makeUser(email: string) {
  const user = await db.user.create({ data: { email, timezone: "Asia/Kolkata" } });
  currentUser.id = user.id;
  return user;
}

async function makeEmailSource(userId: string) {
  const key = await storage.put(
    Buffer.from("From: teacher@bis.edu.in\nSubject: PS4\n\nProblem set 4 due Friday"),
    { originalName: "msg.txt" },
  );
  return db.source.create({
    data: {
      userId,
      type: "EMAIL",
      gmailMessageId: `msg-${Math.random()}`,
      fileKey: key,
      mimeType: "text/plain",
      originalName: "PS4",
    },
  });
}

async function enableAutoAccept(userId: string) {
  await db.gmailSyncState.upsert({
    where: { userId },
    update: { autoAccept: true },
    create: { userId, autoAccept: true },
  });
}

function undo(id: string) {
  return undoProposal(new Request(`http://test/api/proposals/${id}/undo`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Account", "Session", "Course", "Task", "Event", "Source", "Proposal", "ExtractionCache", "GmailSyncState" CASCADE',
  );
});

describe("auto-accept policy", () => {
  it("accepts only confident items, via the gate, and tags them", async () => {
    const user = await makeUser("auto@test.dev");
    await enableAutoAccept(user.id);
    const source = await makeEmailSource(user.id);
    await extractFromSource(source.id);

    const result = await autoAcceptConfident(source.id);
    expect(result).toEqual({ accepted: 1, considered: 1 });

    // the 0.92 task landed, with provenance and the undo link
    const task = await db.task.findFirstOrThrow({ where: { userId: user.id } });
    expect(task.sourceId).toBe(source.id);
    const accepted = await db.proposal.findFirstOrThrow({ where: { status: "ACCEPTED" } });
    expect(accepted.autoAccepted).toBe(true);
    expect(accepted.acceptedItemId).toBe(task.id);

    // the 0.85 event and 0.55 task still wait for review
    expect(await db.proposal.count({ where: { status: "PENDING" } })).toBe(2);
    expect(await db.event.count()).toBe(0);
  });

  it("is off by default", async () => {
    const user = await makeUser("default@test.dev");
    const source = await makeEmailSource(user.id);
    await extractFromSource(source.id);

    expect(await autoAcceptConfident(source.id)).toEqual({ accepted: 0, considered: 0 });
    expect(await db.task.count()).toBe(0);
    expect(await db.proposal.count({ where: { status: "PENDING" } })).toBe(3);
  });

  it("never touches UPLOAD sources, however confident", async () => {
    const user = await makeUser("upload@test.dev");
    await enableAutoAccept(user.id);
    const key = await storage.put(Buffer.from("fixture"), { originalName: "f.png" });
    const source = await db.source.create({
      data: { userId: user.id, type: "UPLOAD", fileKey: key, mimeType: "image/png" },
    });
    await extractFromSource(source.id);

    expect(await autoAcceptConfident(source.id)).toEqual({ accepted: 0, considered: 0 });
    expect(await db.task.count()).toBe(0);
  });

  it("matches courseGuess to the user's courses", async () => {
    const user = await makeUser("course@test.dev");
    await enableAutoAccept(user.id);
    const course = await db.course.create({
      data: { userId: user.id, name: "Computer Science", code: "CS201", color: "#6366f1" },
    });
    const source = await makeEmailSource(user.id);
    await extractFromSource(source.id);

    await autoAcceptConfident(source.id);
    const task = await db.task.findFirstOrThrow({ where: { userId: user.id } });
    expect(task.courseId).toBe(course.id);
  });

  it("runs inside the sync extraction pipeline", async () => {
    const user = await makeUser("pipeline@test.dev");
    await enableAutoAccept(user.id);
    const source = await makeEmailSource(user.id);

    await extractSources([source.id]); // what "Sync now" and the scheduler call
    expect(await db.task.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.proposal.count({ where: { autoAccepted: true } })).toBe(1);
  });
});

describe("undo", () => {
  it("deletes the created item and returns the proposal to review", async () => {
    const user = await makeUser("undo@test.dev");
    await enableAutoAccept(user.id);
    const source = await makeEmailSource(user.id);
    await extractFromSource(source.id);
    await autoAcceptConfident(source.id);

    const accepted = await db.proposal.findFirstOrThrow({ where: { autoAccepted: true } });
    const res = await undo(accepted.id);
    expect(res.status).toBe(200);

    expect(await db.task.count()).toBe(0);
    const reverted = await db.proposal.findUniqueOrThrow({ where: { id: accepted.id } });
    expect(reverted.status).toBe("PENDING");
    expect(reverted.autoAccepted).toBe(false);
    expect(reverted.acceptedItemId).toBeNull();
    expect(reverted.resolvedAt).toBeNull();

    // second undo has nothing to undo
    expect((await undo(accepted.id)).status).toBe(409);
  });

  it("refuses to undo a manual accept", async () => {
    const user = await makeUser("manual@test.dev");
    const source = await makeEmailSource(user.id);
    await extractFromSource(source.id);
    const proposal = await db.proposal.findFirstOrThrow({ where: { kind: "TASK" } });
    await acceptProposal(user.id, proposal.id);

    expect((await undo(proposal.id)).status).toBe(409);
    expect(await db.task.count()).toBe(1); // untouched
  });
});

describe("banner feed + settings", () => {
  it("lists only auto-accepted proposals", async () => {
    const user = await makeUser("feed@test.dev");
    await enableAutoAccept(user.id);
    const source = await makeEmailSource(user.id);
    await extractFromSource(source.id);
    await autoAcceptConfident(source.id);
    // manually accept one of the remaining pendings
    const pending = await db.proposal.findFirstOrThrow({
      where: { status: "PENDING", kind: "TASK" },
    });
    await acceptProposal(user.id, pending.id);

    const res = await listProposals(
      new Request("http://test/api/proposals?status=ACCEPTED&autoAccepted=true"),
    );
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].autoAccepted).toBe(true);
  });

  it("PATCH /api/gmail/settings upserts the flags", async () => {
    await makeUser("settings@test.dev");
    const res = await patchSettings(
      new Request("http://test/api/gmail/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSync: true, autoAccept: true }),
      }),
    );
    expect(await res.json()).toEqual({ autoSync: true, autoAccept: true });
    const state = await db.gmailSyncState.findUniqueOrThrow({
      where: { userId: currentUser.id },
    });
    expect(state.autoSync).toBe(true);
    expect(state.autoAccept).toBe(true);
  });
});
