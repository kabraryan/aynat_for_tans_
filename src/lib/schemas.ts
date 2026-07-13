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
