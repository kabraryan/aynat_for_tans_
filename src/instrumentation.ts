/** Runs once per server boot (Next.js instrumentation hook). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startGmailAutoSync } = await import("@/lib/gmail/scheduler");
  startGmailAutoSync();
}
