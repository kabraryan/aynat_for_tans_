import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CalendarView } from "@/components/calendar/CalendarView";

export default async function CalendarPage() {
  const user = await requireUser();
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <CalendarView tz={dbUser?.timezone ?? "Asia/Kolkata"} />
    </div>
  );
}
