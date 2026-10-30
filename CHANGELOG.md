# Changelog

All notable changes to Need Ears. From 1.0.0 on, this file is written by [release-please](https://github.com/googleapis/release-please) from the conventional commits on `main`.

## [1.0.0](https://github.com/braenden/needears/releases/tag/v1.0.0) (2026-10-30)

The first public release.

### Features

- **Track page:** waveform player (wavesurfer.js with precomputed peaks), comment markers you can hover, focus or long press, click to jump, keyboard shortcuts, and links to a moment with `?t=`.
- **Timestamped comments** with a category (Vibe, Mix, Arrangement, Vocals, Sound design), a comment box that follows the playhead, and filters for Helpful and trusted ears.
- **Helpful and reputation:** the uploader marks comments Helpful, which is the only source of reputation (New ear, Listener, Trusted ear, Golden ear). Reputation raises the rate limits.
- **Upload in the browser:** Web Audio decodes mp3, wav, aiff and flac (with an AIFF reader where Web Audio can't), computes the peaks and encodes a 192 kbps mp3 in a Web Worker while you fill in the details. Files go straight to Supabase Storage with signed URLs.
- **Feed** with Needs ears, Latest and Trending, genre filters and an open ranking that gives a small lift to people who recently gave Helpful feedback.
- **Profiles, settings, notifications,** reactions, a JSON export of your data and account deletion.
- **Reporting and moderation:** reports with reasons, auto hide after three reports from accounts in good standing, an admin queue with hide, restore and shadow ban, and `/admin/stats` with today's numbers and the 48 hour north star.
- **Sign in** with Google or a magic link, and a welcome step to pick a handle.
- **Static pages** in MDX: about, guidelines, terms, privacy and copyright, with sitemap, robots and OG images of the waveform.
- **Monitoring:** Sentry for server and browser errors, off unless `SENTRY_DSN` is set, with no cookies, IP addresses or user identity.

### Security

- Row Level Security on every table, column grants, and triggers for counters, reputation, rate limits and auto hide, covered by pgTAP tests.
- Private audio and peaks buckets with signed URLs, so hidden and taken down tracks stop playing; uploads need a reservation and are verified by magic bytes, size, duration and peaks format.
- A nonce based Content Security Policy with `strict-dynamic`, HSTS and the usual hardening headers.
- Trust rules for reputation and auto hide, moderation records that survive edits, deletes and account deletion, and rate limits on reactions.

### Quality

- CI runs ESLint, Prettier, TypeScript strict, knip, Vitest, pgTAP, Playwright (the main flow and the security headers) and Lighthouse budgets, plus CodeQL and Gitleaks.
