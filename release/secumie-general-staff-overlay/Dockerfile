# Pinned actual running amd64 manifest, not the mutable service template.
FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-general@sha256:a5c507d825e67377cd12a58d84a42c4794110b3c17e17acc6d241830439ba24f AS general
FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:e681628f03c83258ce12332a4abe5bfea46704a97ae09e3a9123d1449139f263 AS patcher
USER root
COPY patch.cjs /tmp/secumie-patch.cjs
RUN node /tmp/secumie-patch.cjs
FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:e681628f03c83258ce12332a4abe5bfea46704a97ae09e3a9123d1449139f263 AS runtime
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION \
      com.atlib.overlay.base="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:e681628f03c83258ce12332a4abe5bfea46704a97ae09e3a9123d1449139f263" \
      com.atlib.overlay.general="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-general@sha256:a5c507d825e67377cd12a58d84a42c4794110b3c17e17acc6d241830439ba24f"
COPY --from=patcher /overlay-out/server.js /app/dist/server.js
COPY --from=general /app/dist/routes/adminSecumieGeneral.js /app/dist/routes/adminSecumieGeneral.js
COPY --from=general /app/dist/services/secumieGeneralAdminRepo.js /app/dist/services/secumieGeneralAdminRepo.js
COPY mount.cjs /app/dist/runtime/secumie-general-staff-mount.cjs
COPY secumie-general-leads.html secumie-general-leads.js /app/public/admin/
# No apt/npm install, no base runtime dependency changes, no existing DB migrations.
RUN node --check /app/dist/server.js && node --check /app/public/admin/secumie-general-leads.js \
 && node -e 'const a=require("/app/dist/runtime/secumie-general-staff-mount.cjs"); const assert=require("node:assert/strict"); assert.equal(typeof a.mount,"function"); assert.throws(()=>a.config({})); assert.equal(a.config({SECUMIE_GENERAL_DB_NAME:"secumie_general",SECUMIE_GENERAL_DB_STAFF_USER:"secumie_general_staff_prod",SECUMIE_GENERAL_DB_HOST:"127.0.0.1",SECUMIE_GENERAL_DB_PORT:"5432",SECUMIE_GENERAL_DB_STAFF_PASSWORD:"x".repeat(40)}).max,1); console.log("STAFF_OVERLAY_MODULE_LOAD=PASS")'
