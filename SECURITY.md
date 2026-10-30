# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report it privately through GitHub: go to the **Security** tab of this repository and click **Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker could do with it.

You will get a reply within 72 hours. Once the issue is confirmed, we will agree on a fix and a disclosure date with you, and credit you in the release notes if you want.

## Scope

In scope:

- This repository (the Next.js app, route handlers, Supabase migrations and RLS policies).
- The production site once it is live.

Out of scope:

- Denial of service and volumetric attacks.
- Findings in third party services (Supabase, Vercel, Resend, Sentry). Report those to the vendor.
- Missing best practice headers without a concrete impact.

## Duplicates

If a report turns out to be something we already know about, we will say so. Tell us anyway if you can do more with it than we expect.

## Supported versions

Only the latest commit on `main` (and the deployment built from it) is supported.
