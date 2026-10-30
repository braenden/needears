// Site wide constants. The contact address, repository link and legal
// dates live here and nowhere else in the app.

export const site = {
  name: "Need Ears",
  description:
    "An open feed where producers share unfinished tracks and get timestamped feedback.",
  contactEmail: "contact@needears.com",
  githubUrl: "https://github.com/braenden/needears",
  // "Last updated" on the terms and the privacy policy.
  legalUpdated: "31 October 2026",
} as const;

// Absolute base URL for metadata, OG images and auth redirects.
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
