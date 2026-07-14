import { describe, it, expect, beforeEach, vi } from "vitest";

const currentUser = { id: "" };
vi.mock("@/lib/auth", () => ({
  getUserId: async () => currentUser.id || null,
  requireUser: async () => ({ id: currentUser.id }),
}));

import { db } from "@/lib/db";
import { PATCH as patchTask } from "@/app/api/tasks/[id]/route";

function patch(id: string, body: unknown) {
  return patchTask(
    new Request(`http://test/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Course", "Task", "Event", "Source", "Proposal" CASCADE',
  );
  const user = await db.user.create({
    data: { email: "r@test.dev", timezone: "Asia/Kolkata" },
  });
  currentUser.id = user.id;
});

describe("repeating tasks", () => {
  it("completing a weekly task spawns the next occurrence a week later", async () => {
    const task = await db.task.create({
      data: {
        userId: currentUser.id,
        title: "Weekly reading",
        dueAt: new Date("2026-07-17T11:30:00Z"), // Fri 17:00 IST
        repeat: "WEEKLY",
      },
    });

    const res = await patch(task.id, { status: "DONE" });
    expect(res.status).toBe(200);

    const tasks = await db.task.findMany({ orderBy: { dueAt: "asc" } });
    expect(tasks).toHaveLength(2);
    expect(tasks[0].status).toBe("DONE");
    expect(tasks[1].status).toBe("TODO");
    expect(tasks[1].dueAt?.toISOString()).toBe("2026-07-24T11:30:00.000Z");
    expect(tasks[1].repeat).toBe("WEEKLY");
  });

  it("stops the chain past repeatUntil", async () => {
    const task = await db.task.create({
      data: {
        userId: currentUser.id,
        title: "Short-lived habit",
        dueAt: new Date("2026-07-17T11:30:00Z"),
        repeat: "WEEKLY",
        repeatUntil: new Date("2026-07-20T00:00:00Z"), // before next Friday
      },
    });

    await patch(task.id, { status: "DONE" });
    expect(await db.task.count()).toBe(1); // no spawn
  });

  it("re-completing an already-done task does not spawn twice", async () => {
    const task = await db.task.create({
      data: {
        userId: currentUser.id,
        title: "Weekly reading",
        dueAt: new Date("2026-07-17T11:30:00Z"),
        repeat: "WEEKLY",
      },
    });

    await patch(task.id, { status: "DONE" });
    await patch(task.id, { status: "DONE" }); // idempotent re-complete
    expect(await db.task.count()).toBe(2);
  });

  it("uncompleting does not spawn", async () => {
    const task = await db.task.create({
      data: {
        userId: currentUser.id,
        title: "One-off",
        dueAt: new Date("2026-07-17T11:30:00Z"),
        repeat: "WEEKLY",
      },
    });
    await patch(task.id, { status: "DONE" });
    await patch(task.id, { status: "TODO" });
    await patch(task.id, { status: "DONE" });
    // spawn on first DONE and on the DONE after a genuine reopen
    expect(await db.task.count()).toBe(3);
  });
});
