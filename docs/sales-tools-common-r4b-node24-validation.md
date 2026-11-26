# Sales Tools Common Foundation R4b Node.js 24 validation

## Source identity

- Base: Draft PR #120, `cfaa6c2c55b958c993e68623d0927509ebd6e7e7`
- R4a evidence: GitHub Actions `45742378700`
- R4a runtime base: `node:20-bookworm-slim`
- R4b runtime candidate: `node:24-bookworm-slim` (Debian 12 / bookworm)

R4b changes only the supported Node.js runtime and the validation required for that change. It does not change the CRM, diagnosis, KPI, database, or authentication contracts.

## Runtime and hardening contract

- Every application Docker stage uses Node.js 24 on Debian 12.
- The migration and cleanup release helper images use the corresponding Node.js 24 Alpine image; their existing OS family is unchanged.
- GitHub Actions Node.js execution uses Node.js 24. The candidate workflow uses the Node.js 24-based `checkout@v5`, `setup-node@v5`, and `upload-artifact@v5` actions rather than retaining a deprecated Node.js 20 action runtime.
- Runtime remains `USER node`.
- npm and npx remain absent from the final runtime image.
- The R4a Debian package pins remain in force.
- Chromium remains installed by the pinned Playwright dependency.
- `xvfb` is removed after Playwright dependency installation. Headless Chromium does not invoke it; the real runtime Chromium/PDF smoke is the acceptance gate for this removal.
- The exact PR Head is checked out, verified, and written to the OCI revision label.

## Compatibility gates

The candidate must pass all of the following on its exact Git SHA:

1. clean npm install and TypeScript build on Node.js 24;
2. CRM, Marketing Initiative, Portal KPI, Nodemailer 10, Zod 4, Google SDK, Staff Proxy, and Case Guard regressions;
3. public diagnosis and administrative browser tests on desktop/mobile;
4. PostgreSQL 16 validation using migrations 027, 033, and 035;
5. final-image non-root, npm/npx absence, Node.js major version, Debian pin, and `xvfb` absence checks;
6. real Chromium launch and PDF byte generation inside the final image;
7. production-only npm audit and Trivy Critical/High scan.

## Security comparison method

R4a's `r4a-runtime-security-evidence/trivy-runtime.json` is the before identity: Critical 4, High 147, total 151, with no remaining `FixedVersion`. R4b publishes a new unfiltered JSON artifact under the same severity and `ignore-unfixed: false` conditions. Findings are compared by vulnerability ID, package, installed version, fixed version, and status. New or removed findings are not inferred from totals alone.

No finding is suppressed. Findings without a vendor fix remain a release-risk decision rather than an automatic acceptance.

## Rollback boundary

R4b is a child of PR #120. Rejecting or reverting this single commit returns the source and runtime image definition to the tested R4a Node.js 20 state. No database or Production state change is required for rollback.
