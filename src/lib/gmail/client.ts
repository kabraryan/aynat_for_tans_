import { db } from "@/lib/db";

/**
 * Minimal Gmail REST client (read-only). Tokens live on the Auth.js Account
 * row; access tokens are refreshed on demand. A missing/expired refresh token
 * throws GmailAuthError — the UI turns that into a one-click reconnect,
 * never data loss (spec §11).
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export type GmailMessageMeta = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

async function getAccount(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) throw new GmailAuthError("No Google account linked");
  if (!account.scope?.includes(GMAIL_SCOPE))
    throw new GmailAuthError("Gmail access not granted yet");
  if (!account.refresh_token)
    throw new GmailAuthError("No refresh token — reconnect Gmail");
  return account;
}

/** True when the account already carries the Gmail scope + refresh token. */
export async function gmailConnected(userId: string): Promise<boolean> {
  try {
    await getAccount(userId);
    return true;
  } catch {
    return false;
  }
}

async function accessToken(userId: string): Promise<string> {
  const account = await getAccount(userId);

  // reuse a still-valid access token (60s safety margin)
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at * 1000 > Date.now() + 60_000
  ) {
    return account.access_token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token!,
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    // invalid_grant = refresh token expired/revoked (Testing-mode apps: ~7 days)
    throw new GmailAuthError(`Token refresh failed: ${body.error ?? res.status}`);
  }

  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: body.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    },
  });
  return body.access_token;
}

async function gmailGet<T>(userId: string, path: string): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new GmailAuthError(`Gmail API auth failed (${res.status})`);
  }
  if (!res.ok) throw new Error(`Gmail API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

/** Message ids in the inbox since the given time (paginated). */
export async function listMessageIds(userId: string, after: Date): Promise<string[]> {
  const query = encodeURIComponent(`in:inbox after:${Math.floor(after.getTime() / 1000)}`);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gmailGet<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(
      userId,
      `messages?q=${query}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < 500);
  return ids;
}

type MessagePayload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePayload[];
};

export async function getMessageMeta(userId: string, id: string): Promise<GmailMessageMeta> {
  const msg = await gmailGet<{
    id: string;
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[] };
  }>(userId, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
  const header = (name: string) =>
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return {
    id: msg.id,
    from: header("From"),
    subject: header("Subject"),
    date: header("Date"),
    snippet: msg.snippet ?? "",
  };
}

/** Plain-text body (text/plain part preferred; falls back to stripped HTML). */
export async function getMessageBody(userId: string, id: string): Promise<string> {
  const msg = await gmailGet<{ payload?: MessagePayload }>(userId, `messages/${id}?format=full`);
  const plain = findPart(msg.payload, "text/plain");
  if (plain) return decode(plain);
  const html = findPart(msg.payload, "text/html");
  if (html) return decode(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

function findPart(payload: MessagePayload | undefined, mime: string): string | null {
  if (!payload) return null;
  if (payload.mimeType === mime && payload.body?.data) return payload.body.data;
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mime);
    if (found) return found;
  }
  return null;
}

function decode(b64url: string): string {
  return Buffer.from(b64url.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
