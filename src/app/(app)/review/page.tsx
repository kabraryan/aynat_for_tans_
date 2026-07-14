import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReviewIndex } from "@/components/review/ReviewIndex";

export default async function ReviewPage() {
  const user = await requireUser();
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });

  return (
    <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Review</h1>
        <p className="mt-1 text-xs text-ink-muted">
          Everything extracted lands here first — nothing reaches your calendar or tasks
          without your approval.
        </p>
      </div>
      <ReviewIndex tz={dbUser?.timezone ?? "Asia/Kolkata"} />
    </div>
  );
}
