# Finance CSV import limits

Finance accepts at most 500 nonblank data rows and 256 KiB of UTF-8 text per department import. The selected department may contain at most 500 existing ordinary items, including cancelled items. These limits bound the replacement diff; protected unallocated items are excluded. A preview response is limited to 1 MiB and parsing stops after 100 errors. Preview also rejects more than 5,000 relevant systems, earmarked items or funding parts rather than loading an unbounded snapshot.

An import replaces the selected department's set of ordinary budget items. Do not split one department into multiple imports: each import would cancel items omitted from that file. If a department exceeds a limit, contact an administrator to reduce the budget size or arrange an implementation change. Failed previews and imports write no budget changes.
