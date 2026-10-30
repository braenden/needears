## What and why

<!-- What does this change, and why? Link the issue: Closes #123 -->

## How to test

<!-- Steps a reviewer can follow locally. -->

## Checklist

- [ ] The title follows Conventional Commits (`feat: ...`, `fix: ...`)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally
- [ ] Tests added or updated for new behaviour
- [ ] Database changes have a migration and pgTAP tests for RLS
- [ ] No secrets, keys or personal data in the diff
- [ ] UI changes include a screenshot and work with keyboard and screen reader
- [ ] Docs updated (README, `docs/`, or an ADR) if behaviour or architecture changed
