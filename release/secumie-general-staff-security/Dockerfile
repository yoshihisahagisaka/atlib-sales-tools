# Existing staff overlay; do not rebuild common application or dependencies.
FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:49e25ba4a8ce41d1cb06f6184d6451e24ad98e67a4872641e468ab3d792e3e9a
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION com.atlib.security.overlay.base="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:49e25ba4a8ce41d1cb06f6184d6451e24ad98e67a4872641e468ab3d792e3e9a"
USER root
COPY patch.cjs /tmp/staff-security-patch.cjs
RUN set -eu; \
    node /tmp/staff-security-patch.cjs before; \
    apt-get update; \
    apt-cache policy apt libapt-pkg6.0 libglib2.0-0; \
    aptv="$(apt-cache policy apt | awk '/Candidate:/ {print $2}')"; \
    libv="$(apt-cache policy libapt-pkg6.0 | awk '/Candidate:/ {print $2}')"; \
    if [ "$aptv" != "(none)" ] && [ "$libv" != "(none)" ] && dpkg --compare-versions "$aptv" ge 2.6.2 && dpkg --compare-versions "$libv" ge 2.6.2; then \
      for p in apt libapt-pkg6.0; do current="$(dpkg-query -W -f='\${Version}' "$p")"; candidate="$(apt-cache policy "$p" | awk '/Candidate:/ {print $2}')"; dpkg --compare-versions "$candidate" ge "$current"; done; \
      apt-get -s install --no-install-recommends --only-upgrade apt libapt-pkg6.0 > /tmp/apt-plan; \
      awk '/^Remv / {bad=1} /^Inst / && $2 !~ /^(apt|libapt-pkg6.0)(:amd64)?$/ {bad=1} END {exit bad}' /tmp/apt-plan; \
      apt-get install -y --no-install-recommends --only-upgrade apt libapt-pkg6.0; \
    else echo APT_FIX_NOT_AVAILABLE; fi; \
    rm -rf /var/lib/apt/lists/* /tmp/apt-plan; \
    node /tmp/staff-security-patch.cjs install; \
    node /tmp/staff-security-patch.cjs after; \
    rm -f /tmp/staff-security-patch.cjs /tmp/staff-security-before.json
USER node
RUN test "$(id -u)" != 0 && ! command -v npm && ! command -v npx \
 && node --check /app/dist/server.js \
 && node -e 'const a=require("node:assert/strict");const n=require("/app/node_modules/nodemailer");a.equal(require("/app/node_modules/nodemailer/package.json").version,"10.6.1");a.equal(require("/app/node_modules/zod/package.json").version,"3.25.76");const m=require("/app/dist/runtime/secumie-general-staff-mount.cjs");a.equal(typeof m.mount,"function");(async()=>{const t=n.createTransport({streamTransport:true,buffer:true,newline:"unix"});const r=await t.sendMail({from:"test@example.invalid",to:"test2@example.invalid",subject:"Synthetic",text:"test",disableFileAccess:true,disableUrlAccess:true});a.deepEqual(r.envelope.to,["test2@example.invalid"]);a.ok(Buffer.isBuffer(r.message));console.log("NONROOT_MAIL_ENVELOPE_AND_STAFF_LOAD=PASS")})().catch(()=>process.exit(1))'
RUN node -e 'const a=require("node:assert/strict");const {chromium}=require("/app/node_modules/playwright");(async()=>{const b=await chromium.launch({headless:true,args:["--no-sandbox"]});try{const p=await b.newPage();await p.setContent("<html><body>synthetic</body></html>");const pdf=await p.pdf();a.equal(pdf.subarray(0,5).toString(),"%PDF-");console.log("CHROMIUM_PDF=PASS")}finally{await b.close()}})().catch(()=>process.exit(1))'
