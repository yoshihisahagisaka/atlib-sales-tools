# Exact staff security candidate; four WSC files and the conditional public-target guard prerequisite.
FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:4909dbae09d33a927de125d72343d3612020ffe9164b8071735f3c6c6f48ecad AS baseline
FROM baseline AS verify
COPY manifest.json verify.cjs staff-regression.cjs schema-probe.cjs /tmp/wsc-staff/
COPY test/ /tmp/wsc-staff/test/
USER node
RUN node /tmp/wsc-staff/verify.cjs before
COPY src/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs /app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs
COPY src/wsc/vendor/tools/wsc-vs1/engine.mjs /app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs
COPY src/wsc/vendor/tools/wsc-vs1/explanations.json /app/dist/wsc/vendor/tools/wsc-vs1/explanations.json
COPY src/wsc/vendor/tools/wsc-vs1/rules.json /app/dist/wsc/vendor/tools/wsc-vs1/rules.json
COPY src/wsc/vendor/tools/wsc-phase2a/safe-executor.mjs /tmp/wsc-staff/approved-safe-executor.mjs
# The verified baseline is root-owned; write the guard only if its old known blob is present.
USER root
RUN node /tmp/wsc-staff/verify.cjs guard
USER node
RUN node /tmp/wsc-staff/verify.cjs after

FROM baseline AS runtime
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION com.atlib.overlay.base="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:4909dbae09d33a927de125d72343d3612020ffe9164b8071735f3c6c6f48ecad" com.atlib.wsc.source="50a1ed5fcdf1529ce946e16e00feafa16c753500"
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs /app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs /app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-vs1/explanations.json /app/dist/wsc/vendor/tools/wsc-vs1/explanations.json
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-vs1/rules.json /app/dist/wsc/vendor/tools/wsc-vs1/rules.json
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-phase2a/safe-executor.mjs /app/dist/wsc/vendor/tools/wsc-phase2a/safe-executor.mjs
USER node
RUN node -e 'const fs=require("node:fs"),c=require("node:crypto"),a=require("node:assert/strict");for(const [p,h] of Object.entries({"/app/dist/wsc/vendor/tools/wsc-phase2a/safe-executor.mjs":"e24e52714f0a34ec1a5a9f66ef604d7019806e3e","/app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs":"25cccef9d3f6639f03e0f604709128a5e65a496f","/app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs":"0d577a4d8c58b1c413c890ef80f5cc455ea9ecb8","/app/dist/wsc/vendor/tools/wsc-vs1/explanations.json":"e6563ffd68d9e083e8b66fb7c991cdf1801ea51c","/app/dist/wsc/vendor/tools/wsc-vs1/rules.json":"ad3aa436079aacd96275d5c4a56b5b5215a836fa"})){const b=fs.readFileSync(p);a.equal(c.createHash("sha1").update("blob "+b.length+String.fromCharCode(0)).update(b).digest("hex"),h)}a.notEqual(process.getuid(),0);console.log("FINAL_STAFF_WSC_AND_GUARD_BLOBS=PASS")'
