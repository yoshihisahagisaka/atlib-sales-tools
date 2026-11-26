# Sales Tools Common Foundation R4a Security Remediation

Date: 2026-11-26 (JST)

## Source identity

- Base Draft PR: #119
- Base HEAD: `a9ed1ee163094855b20e9043ce444cdf34f71ef6`
- R3 Run: `45729200901`
- R3 Artifact: `r3-runtime-security-evidence`

R4a changes only dependency compatibility, runtime package patching, exact-head CI identity, and security evidence. It does not change a database schema, migration, domain contract, deployment, or Production configuration.

## R3 classification

The R3 Trivy JSON contains 155 Critical/High findings: 4 Critical and 151 High. Each JSON entry remains the authoritative Package, CVE/GHSA, Installed Version, Fixed Version, and Status record.

Only four entries had a non-empty Fixed Version:

| Finding | Package | Installed | Fixed | Severity | Status |
| --- | --- | --- | --- | --- | --- |
| CVE-2026-109518 | apt | 2.6.1 | 2.6.2 | HIGH | fixed |
| CVE-2026-109518 | libapt-pkg6.0 | 2.6.1 | 2.6.2 | HIGH | fixed |
| CVE-2026-90776 | nodemailer | 9.1.1 | 10.0.5 | HIGH | fixed |
| GHSA-v53p-9fqp-m79j | nodemailer | 9.1.1 | 10.0.6 | HIGH | fixed |

The four Critical findings had no vendor Fixed Version:

| Finding | Package | Installed | Status | Relevant path assessment |
| --- | --- | --- | --- | --- |
| CVE-2026-58016 | libglib2.0-0 2.74.6-2+deb12u9 | fix_deferred | Chromium dependency; malformed D-Bus introspection XML is not accepted by a Sales Tools API, but Chromium runtime loading means absence of reachability is not proven. |
| CVE-2025-7458 | libsqlite3-0 3.40.1-2+deb12u2 | affected | Chromium dependency; the application uses PostgreSQL and does not execute caller-supplied SQLite statements. Chromium can load the library, so acceptance remains pending. |
| CVE-2026-6653 | libxml2 2.9.14+dfsg-1.3~deb12u6 | fix_deferred | Chromium/OS dependency; Sales Tools has no XML upload or XML parsing API, but indirect browser parsing cannot be declared unreachable. |
| CVE-2023-45853 | zlib1g 1:1.2.13.dfsg-1 | will_not_fix | The issue is in unsupported MiniZip APIs. Application source does not use MiniZip, but the OS finding is retained rather than suppressed. |

The other 147 High findings also had no Fixed Version in the R3 scanner database. They are grouped primarily under Chromium-required Debian libraries and remain present in the full JSON rather than being allowlisted or hidden.

## Remediation

- Upgrade `nodemailer` from 9.1.1 to 10.6.1.
- Upgrade `zod` from 3.25.76 to 4.6.7 and make only the required v4 typing/API compatibility changes (`z.record` key schemas and inferred parser helpers).
- Upgrade `@google-cloud/secret-manager` to 8.0.0 and `google-auth-library` to 11.3.4, removing the vulnerable `uuid`, `gaxios`, `google-gax`, `retry-request`, and `teeny-request` versions.
- Override only transitive `qs` to 6.17.1 while retaining Express 4.22.2; an unrelated Express 5 migration is not introduced.
- Upgrade `apt` and `libapt-pkg6.0` to Debian 2.6.2 in both the primary runtime Dockerfile and inherited security overlay.
- Preserve the non-root `node` user and removal of runtime npm/npx.

No `npm audit fix --force` is used. Nodemailer address-envelope behavior is tested with its JSON transport. Full Public and Staff schema regressions provide the Zod v4 compatibility evidence. Chromium must launch inside the built runtime image and generate bytes beginning with `%PDF-`.

## Exact-head evidence contract

Every R4a GitHub Actions job checks out `${pull_request.head.sha}` explicitly, verifies `git rev-parse HEAD`, and labels the image with the same SHA. A PR merge commit is not used as the reviewed artifact identity. No runtime image is pushed.

## Release boundary

Fixed findings must disappear in the new Trivy and npm artifacts. Findings without a vendor fix remain unaccepted Release Gates until their updated count and actual runtime path are reviewed. A green evidence-producing scan does not by itself waive residual Critical or High findings.
