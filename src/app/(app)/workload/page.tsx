import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { WorkloadView } from "@/components/workload/WorkloadView";

export default async function WorkloadPage() {
  const user = await requireUser();
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });

  return (
    <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Workload</h1>
        <p className="mt-1 text-xs text-ink-muted">
          The next 16 weeks by deliverable count — red weeks are crushing. Click a week to
          open it on the calendar.
        </p>
      </div>
      <WorkloadView tz={dbUser?.timezone ?? "Asia/Kolkata"} />
    </div>
  );
}
