import Link from "next/link";
import Image from "next/image";
import { requireUser, signOut } from "@/lib/auth";

const nav = [
  { href: "/", label: "Home" },
  { href: "/calendar", label: "Calendar" },
  { href: "/todos", label: "Tasks" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-panel px-3 py-5 sm:flex">
        <div className="px-2 text-base font-semibold tracking-tight">Aynat</div>
        <nav className="mt-6 flex flex-col gap-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-line px-2 pt-4">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={28}
              height={28}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
              {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{user.name ?? user.email}</div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="text-xs text-ink-faint transition-colors hover:text-ink"
              title="Sign out"
            >
              Out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
