# Business KAIZEN Package B1 source evidence

Date: 2026-11-22
Scope: read-only source comparison for diagnosis logic version `1.0`

## Canonical references

- Sales Tools Package A / PR #78 base: `996e0705a2744a5bed30da0c5c46007f876f8c9b`
- Corporate main: `eb9b229dd09ecee9c15a161cc03bdb289215458a`
- Corporate PR #74: `a7c14308a01da253d4842266ed3d9f94ac0bcb29`
- Corporate source path: `public/business-web/self-check/self-check.js`
- Implementation Contract v1: supplied `gyomu-kaizen-v1-implementation-contract-20261014.md`

Corporate Git blob IDs:

- main: `c5ba4f914c341cb3584a35b8fe7b3b5f4c9bf39c`
- PR #74: `8015efaa07ab0e9748c9ffc4bdbb77296eaf6a6a`

The full file differs by 29 additions and 8 deletions. The PR changes Q03 and result/form presentation wording, styling and service-host release behavior. It does not change the effective axis, fact, Direction, Coverage, Confidence, Bottleneck or UNKNOWN decision functions.

## Logic identity

The normalized source segment from `function axis(...)` through the active second `diagnose(...)`, ending before `let state=`, is 8,626 UTF-8 bytes and has SHA-256:

`28f4c23022ea6074adb3c16aa200307ca8f5ccd1b5fd8cc05c0b42d781a9c4cd`

That value is identical for:

- Corporate main
- Corporate PR #74
- the reachable public asset at `https://www.atlib.jp/business-web/self-check/self-check.js` on 2026-11-22

The reachable public full-file SHA-256 was:

`7635c8feada22a84a93e9b2173bbb172e488781baadebe0077ffc764c47231ec`

`https://service.atlib.jp/business-web/self-check/self-check.js` was not DNS-resolvable during this check. No inference was made from that unavailable host.

The Corporate file contains an older compact `diagnose()` followed by the corrected function with the same name. JavaScript function declaration resolution makes the latter active. Package B1 ports only the active latter implementation.

## Distribution boundary

Sales Tools now owns the reusable TypeScript pure function and Snapshot adapter in `src/domain/businessKaizenDiagnosis.ts`. Package B1 does not alter or publish the Corporate asset. Until a later release package establishes a shared build artifact, Corporate remains the browser-distributed source and the following tests are the drift gate:

- all question IDs and option codes
- all six determined Direction classes
- UNKNOWN, N_A, Coverage and Confidence
- full Snapshot T05/T10 oracle hashes
- browser regression against the existing Corporate self-check

The T05 and T10 Corporate PR #74 runtime results were evaluated in Chromium and compared field-for-field with the TypeScript port for answers, six axes, facts, unknowns, bottlenecks, Direction, status and Confidence. Both matched. The Snapshot adapter adds the existing version fields and PR #74/public result text; the resulting full Snapshot hashes are asserted by the Golden test.
