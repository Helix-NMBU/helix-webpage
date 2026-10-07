# T-03: pdf

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-03. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [x] Produce real PDF from CV fields, with all entries, long-word/text wrapping and page breaks.
- [x] Preserve Norwegian letters; omit empty sections; no invented content.
- [x] PDF contact fields follow email/phone sharing flags.
- [x] Bundle licensed font assets and document runtime tracing.

## Blocking dependencies

T-00: https://github.com/Helix-NMBU/helix-webpage/issues/52

## Verification

Real PDF extraction/privacy tests, multipage sample and visual inspection.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: closed on the integrated feature branch.

Evidence: worker 7fa6ccb integrated as 431bb98 and revalidated in 79b73a9. Nine real-PDF tests passed, including contact redaction, Nordic text, long wrapping and multipage output. All four pages of /private/tmp/helix-member-cv-sample.pdf were visually inspected. Font assets and Vercel tracing are included. Independent Spec and correctness review found no PDF findings. Live Vercel/Supabase transport remains a rollout prerequisite.

Emitted-runtime repair: reopened after a local Vercel bundle failed to import the PDF model. Worker 942a1e0 was integrated as 825eed8, with a source-only NodeNext CI guard at b846e39. All nine PDF tests, the runtime typecheck and bundled-font handler/PDF smoke passed independently. The full integrated suite passed 103 tests. Ticket closed again after independent review found no remaining material issue. This does not establish the cause of the separate remote preview failure.
