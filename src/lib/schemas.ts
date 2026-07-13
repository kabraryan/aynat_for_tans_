import { z } from "zod";

/** Shared API input schemas (courses/tasks/events grow here through Phase 1). */

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #rrggbb");

export const courseCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(20).nullish(),
  color: hexColor,
  term: z.string().trim().max(40).nullish(),
});

export const courseUpdateSchema = courseCreateSchema.partial();

export type CourseCreate = z.infer<typeof courseCreateSchema>;
export type CourseUpdate = z.infer<typeof courseUpdateSchema>;

/**
 * Task inputs. Deliberately no `sourceId` field: manual CRUD can never claim
 * extraction provenance — only proposal acceptance sets it (the gate, §10.1).
 */
export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullish(),
  courseId: z.string().nullish(),
  dueAt: z.iso.datetime().nullish(),
  allDayDue: z.boolean().default(false),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const taskUpdateSchema = taskCreateSchema
  .extend({
    status: z.enum(["TODO", "DONE"]),
  })
  .partial();

export const taskReorderSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
});

export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;
