# T-03: pdf

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-03. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [ ] Produce real PDF from CV fields, with all entries, long-word/text wrapping and page breaks.
- [ ] Preserve Norwegian letters; omit empty sections; no invented content.
- [ ] PDF contact fields follow email/phone sharing flags.
- [ ] Bundle licensed font assets and document runtime tracing.

## Blocking dependencies

T-00: https://github.com/Helix-NMBU/helix-webpage/issues/52

## Verification

Real PDF extraction/privacy tests, multipage sample and visual inspection.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: ready
