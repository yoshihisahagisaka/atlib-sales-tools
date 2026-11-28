FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:00dccf6f3dca6da1f1efe31635710c7df2e6215cfe93c117203213d0bd0ffedb
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION com.atlib.security.overlay.base="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:00dccf6f3dca6da1f1efe31635710c7df2e6215cfe93c117203213d0bd0ffedb"
USER root
COPY patch.cjs probe.cjs /tmp/
RUN set -eu; chmod 0644 /tmp/patch.cjs /tmp/probe.cjs; node /tmp/patch.cjs before; node /tmp/probe.cjs /tmp/zod-before.json; node /tmp/patch.cjs install; node /tmp/patch.cjs after
USER node
RUN set -eu; test "$(id -u)" != 0; ! command -v npm; ! command -v npx; node /tmp/probe.cjs /tmp/zod-after.json; node -e 'const a=require("node:assert/strict"),fs=require("node:fs");a.deepEqual(JSON.parse(fs.readFileSync("/tmp/zod-after.json")),JSON.parse(fs.readFileSync("/tmp/zod-before.json")));a.equal(require("/app/node_modules/zod/package.json").version,"4.6.7");a.equal(require("/app/node_modules/nodemailer/package.json").version,"10.6.1");a.equal(typeof require("/app/dist/runtime/secumie-general-staff-mount.cjs").mount,"function");console.log("ZOD_COMPATIBILITY_PROBES=PASS")'
USER root
RUN rm -f /tmp/patch.cjs /tmp/probe.cjs /tmp/zod-before.json /tmp/zod-after.json /tmp/zod-fingerprint.json
USER node
