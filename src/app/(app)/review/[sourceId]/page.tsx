import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SourceReview } from "@/components/review/SourceReview";

export default async function SourceReviewPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const user = await requireUser();
  const { sourceId } = await params;
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });

  return (
    <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
      <div>
        <Link href="/review" className="text-xs text-ink-muted hover:text-ink">
          ← All reviews
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Review</h1>
      </div>
      <div className="w-full max-w-2xl">
        <SourceReview sourceId={sourceId} tz={dbUser?.timezone ?? "Asia/Kolkata"} />
      </div>
    </div>
  );
}
