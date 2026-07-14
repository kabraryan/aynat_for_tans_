import { SCHOOL_DOMAINS, SCHOOL_KEYWORDS } from "@/config/gmail-filters";

export type EmailHeaders = {
  from: string; // raw From header
  subject: string;
  snippet: string;
};

/**
 * THE pre-filter (spec 6.5): true = school-related, eligible for extraction.
 * False = skipped; the email's content never reaches the model.
 */
export function matchesSchoolEmail(email: EmailHeaders): boolean {
  const domain = senderDomain(email.from);
  if (
    domain &&
    SCHOOL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
  ) {
    return true;
  }

  const haystack = `${email.subject} ${email.snippet}`.toLowerCase();
  return SCHOOL_KEYWORDS.some((keyword) =>
    new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack),
  );
}

/** "Name <user@host>" | "user@host" → "host" (lowercase), else null. */
function senderDomain(from: string): string | null {
  const match = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  const address = match?.[1] ?? "";
  const at = address.lastIndexOf("@");
  if (at === -1) return null;
  return address
    .slice(at + 1)
    .trim()
    .replace(/[>"\s]/g, "")
    .toLowerCase();
}
