import { describe, it, expect } from "vitest";
import { matchesSchoolEmail } from "@/lib/gmail/filter";

// Pre-filter gate (spec 6.5): sender allowlist OR subject/snippet keywords.
// Anything that fails this never reaches the model.

describe("matchesSchoolEmail", () => {
  it("matches senders from the school domain", () => {
    expect(
      matchesSchoolEmail({
        from: "Prof. Menon <s.menon@bis.edu.in>",
        subject: "Reading for next week",
        snippet: "Please look at chapter 3 before class.",
      }),
    ).toBe(true);
  });

  it("matches subdomains of allowlisted domains", () => {
    expect(
      matchesSchoolEmail({
        from: "notifications@mail.instructure.com",
        subject: "Recent Canvas activity",
        snippet: "You have new activity.",
      }),
    ).toBe(true);
  });

  it("does not let a lookalike domain through (notbis.edu.in)", () => {
    expect(
      matchesSchoolEmail({
        from: "phish@notbis.edu.in",
        subject: "hello",
        snippet: "hi",
      }),
    ).toBe(false);
  });

  it("rescues unknown senders when the subject has a deadline keyword", () => {
    expect(
      matchesSchoolEmail({
        from: "ta.person@gmail.com",
        subject: "Assignment 2 deadline extended",
        snippet: "The new date is Friday.",
      }),
    ).toBe(true);
  });

  it("rescues unknown senders when the snippet has a keyword", () => {
    expect(
      matchesSchoolEmail({
        from: "someone@example.com",
        subject: "Quick note",
        snippet: "Reminder that the quiz is on Monday in class.",
      }),
    ).toBe(true);
  });

  it("keyword matching is word-bounded (no 'due' inside 'endued')", () => {
    expect(
      matchesSchoolEmail({
        from: "newsletter@shopping.com",
        subject: "Endued with savings",
        snippet: "Residue-free cleaning products for you.",
      }),
    ).toBe(false);
  });

  it("skips ordinary promotional mail", () => {
    expect(
      matchesSchoolEmail({
        from: "deals@amazon.com",
        subject: "Big sale this weekend",
        snippet: "Save 20% on electronics.",
      }),
    ).toBe(false);
  });
});
