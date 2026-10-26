# Neon member platform and Recruiting delivery

## Scope and source

- Repository: `Helix-NMBU/helix-webpage`
- Tracker: Linear issue `HELIX-29`, project milestone `Recruitment`
- Scope in this delivery: Neon-only application services and partner OTP, local API development mode, and role-gated Recruiting in the member portal.
- PR target: `main`; hosted staging was canceled by the user.
- Feature branch: `codex/google-account-chooser`
- Local base before this delivery: `42dd583` (staging merge commit). The target branch was refreshed to `origin/main` before preparing the PR.

## Verification

- Focused Vitest run: 4 files, 60 tests passed, including Neon application authorization/rate limiting and the `/recruiting` member route.
- `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`, and `npm run lint` passed.
- `npm run build` passed; static output was 8.93 MB of the 10 MB deployment limit.
- `git diff --check` passed.
- Full-suite evidence is recorded in [verification.md](verification.md): 647 tests passed before the last route and submission-limit updates.

## Review and delivery state

- Independent review found a public submission abuse risk. Migration 007 and a Neon-backed limit now cap valid applications at ten per client IP per hour before object storage or confirmation email.
- The member path is `/recruiting`. Existing `/recruitment` links redirect to it and preserve query and hash.
- Current code review follow-up and PR checks: pending.
- Linear issue and milestone state: pending final PR handoff.
- Production deployment: not performed. Migration 007 must be applied to the intended Neon database before deploying code that uses it.
