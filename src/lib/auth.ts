import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [Google],
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    // Auth.js only writes Account tokens at first link. Incremental consent
    // (Connect Gmail) re-authenticates with wider scopes — persist the fresh
    // tokens/scope so the Gmail client can use them.
    async signIn({ account }) {
      if (!account || account.provider !== "google") return;
      await db.account.updateMany({
        where: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
        data: {
          access_token: account.access_token ?? undefined,
          expires_at: account.expires_at ?? undefined,
          scope: account.scope ?? undefined,
          // absent unless prompt=consent — never overwrite with null
          ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
        },
      });
    },
  },
});

/** Page-side guard: returns the signed-in user or redirects to /signin. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user as { id: string; email: string; name?: string | null; image?: string | null };
}

/** API-side guard: returns the userId or null (caller responds 401). */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
