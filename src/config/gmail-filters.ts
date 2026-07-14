/**
 * Gmail pre-filter (spec 6.5): decides which emails are school-related
 * BEFORE anything is sent to the model. Everything else is skipped and never
 * leaves the inbox. Edit freely — no code changes needed elsewhere.
 */

/** Sender domains that always count as school email (suffix match). */
export const SCHOOL_DOMAINS = [
  "bis.edu.in", // the user's school
  "instructure.com", // Canvas
  "canvaslms.com",
  "blackboard.com",
  "moodle.com",
  "gradescope.com",
  "classroom.google.com",
];

/** Subject/snippet keywords that rescue emails from unknown senders. */
export const SCHOOL_KEYWORDS = [
  "due",
  "deadline",
  "assignment",
  "homework",
  "problem set",
  "exam",
  "quiz",
  "submit",
  "submission",
  "syllabus",
  "lecture",
  "midterm",
];

/** How far back the first sync looks. */
export const INITIAL_LOOKBACK_DAYS = 30;
