# Assessment Device initial import — acceptance / remaining gates (2026-11-18)

Status: DRAFT PR #48 / LOCAL ONLY / NO FACTACT WRITES

## Confirmed
- CSV deterministic parser and preview; browser preview of CSV and one-sheet XLSX; no direct Device, Relation, status, or FACTACT writes.
- Earlier CI: 13 domain tests, 5 Chromium tests passed.
- Latest formula safety: reject any XLSX cell containing `<f>` rather than trusting cached value; reject numeric styled cells rather than silently converting dates/identifiers.
- Formula-browser fixture initially invalid (XML parse failure); replaced with well-formed synthetic XLSX fixture. **Latest CI result must be inspected before PASS declaration.**
- Existing dependency npm audit reports 17 findings (1 critical / 10 high / 6 moderate) during CI; release security gate remains open.

## Remaining implementation / acceptance gates
1. Consolidate CSV and XLSX into a common typed `ParsedRow {sourceRowNumber,originalCells}` → mapping/validation/preview function; browser currently duplicates the TS domain mapping logic. Do not call it shared until deduplicated and parity-tested.
2. Verify the Excel reader against real-world synthetic cases: single worksheet with sparse rows, inline/shared strings, leading-zero asset IDs, numeric identifiers, dates, formula, error cells, multiple worksheets, oversized ZIP, malformed workbook and ZIP traversal. Fail closed where not supported.
3. Avoid an independently maintained ZIP parser long-term without a targeted security review; check decompression ratio, ZIP64, CRC, XML namespace and workbook relationship edge cases, and file size limits. No new npm dependency without license/advisory review.
4. Confirm actual route/access control before linking to staff UI. An unlinked static `public/admin/` page is not proof of protected staff access.
5. Validate authorized customer Organization and typed Device create/update contract from FACTACT Product before any submit button or authoritative comparison.
6. Human acceptance: no row silently dropped, no automatic AVAILABLE/Relation, no false VERIFIED, no bulk delete, no cross-customer match.

No migration, Production deploy, or PR merge in this slice.
