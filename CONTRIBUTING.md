# Contributing to Need Ears

Thanks for wanting to help. Need Ears is small and young, so every issue, bug report and pull request matters.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Look for issues labelled [`good first issue`](../../labels/good%20first%20issue) or [`help wanted`](../../labels/help%20wanted).

## Local setup

You need Node 24 (see `.nvmrc`), pnpm (`corepack enable`), Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
pnpm install
supabase start
pnpm r2:start                # local stand-in for the R2 audio bucket
cp .env.example .env.local   # fill in the keys printed by `supabase status`
pnpm dev
```

## Checks

CI runs the same commands you can run locally. Run them before you open a pull request:

| Command                | What it does                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`    | Prettier                                                                                                                      |
| `pnpm lint`            | ESLint                                                                                                                        |
| `pnpm typecheck`       | TypeScript in strict mode                                                                                                     |
| `pnpm knip`            | Unused files, exports and dependencies                                                                                        |
| `pnpm test`            | Unit tests (Vitest)                                                                                                           |
| `pnpm build`           | Production build                                                                                                              |
| `pnpm test:db`         | Database tests (pgTAP), needs `supabase start`                                                                                |
| `pnpm test:e2e`        | End to end and accessibility tests (Playwright, axe-core) against `pnpm start` and the local Supabase, run `pnpm build` first |
| `pnpm test:lighthouse` | Lighthouse budgets (`lighthouserc.json`), same setup as `test:e2e`                                                            |
| `pnpm secrets:scan`    | Gitleaks over the git history, needs Docker                                                                                   |

`pnpm format` fixes formatting. The first time you run the end to end tests, install the browser with `pnpm exec playwright install chromium`.

## Pull requests

- Branch from `main` and keep each pull request focused on one thing.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and the pull request title, for example `feat(player): add keyboard shortcuts`.
- Database changes go in a new migration under `supabase/migrations/`, with pgTAP tests for any RLS policy.
- Never commit secrets. Use `.env.local`, which is ignored by git.
- Fill in the pull request template. CI must be green before merge.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
