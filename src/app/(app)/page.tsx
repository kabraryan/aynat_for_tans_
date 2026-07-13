import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Hi{user.name ? `, ${user.name.split(" ")[0]}` : ""}.
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          You&apos;re signed in. Calendar and tasks arrive in Phase 1.
        </p>
      </div>
    </div>
  );
}
