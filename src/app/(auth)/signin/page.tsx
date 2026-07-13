import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Aynat</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Calendar, tasks, and dump-anything capture.
        </p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
