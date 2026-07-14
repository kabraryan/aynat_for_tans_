import { describe, it, expect, beforeEach, vi } from "vitest";

// The proposal gate proofs (spec §10.1 + plan §6): manual CRUD can never claim
// provenance; only acceptProposal creates Tasks/Events with a sourceId; every
// query is userId-scoped; re-extraction replaces pending proposals only.

// Mock auth before importing anything that pulls in next-auth.
const currentUser = { id: "" };
vi.mock("@/lib/auth", () => ({
  getUserId: async () => currentUser.id || null,
  requireUser: async () => ({ id: currentUser.id }),
}));

import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { extractFromSource } from "@/lib/extraction";
import { acceptProposal, rejectProposal, acceptAllPending } from "@/lib/proposals";
import { POST as createTask } from "@/app/api/tasks/route";
import { GET as listProposals } from "@/app/api/proposals/route";

async function makeUser(email: string) {
  return db.user.create({ data: { email, timezone: "Asia/Kolkata" } });
}

async function makeSource(userId: string) {
  const key = await storage.put(Buffer.from(`fixture-${Math.random()}`), {
    originalName: "fixture.png",
  });
  return db.source.create({
    data: { userId, type: "UPLOAD", fileKey: key, mimeType: "image/png", originalName: "fixture.png" },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Account", "Session", "Course", "Task", "Event", "Source", "Proposal", "ExtractionCache" CASCADE',
  );
});

describe("gate proof 1: manual CRUD cannot claim provenance", () => {
  it("strips sourceId smuggled into POST /api/tasks", async () => {
    const user = await makeUser("a@test.dev");
    currentUser.id = user.id;
    const source = await makeSource(user.id);

    const res = await createTask(
      new Request("http://test/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "sneaky", sourceId: source.id }),
      }),
    );
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.sourceId).toBeNull();
  });
});

describe("gate proof 2: acceptance is the only write path with provenance", () => {
  it("creates a Task with sourceId and resolves the proposal atomically", async () => {
    const user = await makeUser("a@test.dev");
    const source = await makeSource(user.id);
    await extractFromSource(source.id); // stub backend → 3 proposals

    const proposal = await db.proposal.findFirstOrThrow({
      where: { sourceId: source.id, kind: "TASK" },
    });
    const result = await acceptProposal(user.id, proposal.id);
    expect(result.ok).toBe(true);

    const task = await db.task.findFirstOrThrow({ where: { userId: user.id } });
    expect(task.sourceId).toBe(source.id);

    const resolved = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(resolved.status).toBe("ACCEPTED");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("rejects a double-accept and creates no duplicate", async () => {
    const user = await makeUser("a@test.dev");
    const source = await makeSource(user.id);
    await extractFromSource(source.id);
    const proposal = await db.proposal.findFirstOrThrow({
      where: { sourceId: source.id, kind: "TASK" },
    });

    expect((await acceptProposal(user.id, proposal.id)).ok).toBe(true);
    const second = await acceptProposal(user.id, proposal.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("already_resolved");
    expect(await db.task.count({ where: { userId: user.id } })).toBe(1);
  });

  it("re-validates edits through ExtractedItem — bad edits write nothing", async () => {
    const user = await makeUser("a@test.dev");
    const source = await makeSource(user.id);
    await extractFromSource(source.id);
    const proposal = await db.proposal.findFirstOrThrow({
      where: { sourceId: source.id, kind: "TASK" },
    });

    const result = await acceptProposal(user.id, proposal.id, {
      edits: { dueAt: "not-a-datetime" as never },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_payload");
    expect(await db.task.count()).toBe(0);
    expect(
      (await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } })).status,
    ).toBe("PENDING");
  });
});

describe("gate proof 3: re-extraction replaces PENDING only", () => {
  it("keeps accepted/rejected proposals and dedupes them from new pendings", async () => {
    const user = await makeUser("a@test.dev");
    const source = await makeSource(user.id);
    await extractFromSource(source.id);

    const [p1, p2] = await db.proposal.findMany({
      where: { sourceId: source.id },
      orderBy: { createdAt: "asc" },
    });
    await acceptProposal(user.id, p1.id);
    await rejectProposal(user.id, p2.id);

    await extractFromSource(source.id); // stub returns the same 3 items

    const byStatus = await db.proposal.groupBy({
      by: ["status"],
      where: { sourceId: source.id },
      _count: true,
    });
    const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
    // accepted + rejected untouched; their items NOT re-proposed; only the
    // third (previously pending) item comes back as pending
    expect(counts.ACCEPTED).toBe(1);
    expect(counts.REJECTED).toBe(1);
    expect(counts.PENDING).toBe(1);
  });
});

describe("gate proof 4: userId scoping", () => {
  it("user B cannot list or accept user A's proposals", async () => {
    const alice = await makeUser("alice@test.dev");
    const bob = await makeUser("bob@test.dev");
    const source = await makeSource(alice.id);
    await extractFromSource(source.id);

    currentUser.id = bob.id;
    const res = await listProposals(new Request("http://test/api/proposals?status=pending"));
    expect(await res.json()).toEqual([]);

    const aliceProposal = await db.proposal.findFirstOrThrow({
      where: { userId: alice.id },
    });
    const steal = await acceptProposal(bob.id, aliceProposal.id);
    expect(steal.ok).toBe(false);
    if (!steal.ok) expect(steal.code).toBe("not_found");
  });
});

describe("accept-all", () => {
  it("accepts everything pending for a source and reports skips", async () => {
    const user = await makeUser("a@test.dev");
    const source = await makeSource(user.id);
    await extractFromSource(source.id);

    const result = await acceptAllPending(user.id, source.id);
    expect(result.accepted).toBe(3);
    expect(result.skipped).toEqual([]);
    expect(await db.task.count()).toBe(2);
    expect(await db.event.count()).toBe(1);
    expect(await db.proposal.count({ where: { status: "PENDING" } })).toBe(0);
  });
});

describe("recent sources listing", () => {
  it("includes zero-proposal sources with honest counts", async () => {
    const user = await makeUser("empty@test.dev");
    currentUser.id = user.id;
    const source = await makeSource(user.id);
    await db.source.update({ where: { id: source.id }, data: { status: "EXTRACTED" } });

    const { GET: listSources } = await import("@/app/api/sources/route");
    const res = await listSources();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: source.id,
      status: "EXTRACTED",
      totalCount: 0,
      pendingCount: 0,
    });
  });
});
