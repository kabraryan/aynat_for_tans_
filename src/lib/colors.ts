/** Curated course palette — muted enough for the clean-minimal direction. */
export const COURSE_COLORS = [
  { name: "Indigo", hex: "#6366f1" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Orange", hex: "#f97316" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Violet", hex: "#8b5cf6" },
] as const;

export const COURSE_COLOR_HEXES = COURSE_COLORS.map((c) => c.hex);

export const DEFAULT_COURSE_COLOR = COURSE_COLORS[0].hex;
