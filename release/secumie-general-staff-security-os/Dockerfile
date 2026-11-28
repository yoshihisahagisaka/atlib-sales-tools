FROM asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:c6fd4d6ec75a90f153381487b9ee0a4ca85567c8ceebecc70c45e81cc201142c
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION com.atlib.security.overlay.base="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:c6fd4d6ec75a90f153381487b9ee0a4ca85567c8ceebecc70c45e81cc201142c"
USER root
COPY patch.cjs /tmp/staff-os-patch.cjs
RUN set -eu; apt-get update; node /tmp/staff-os-patch.cjs; rm -rf /var/lib/apt/lists/* /tmp/staff-os-patch.cjs
USER node
RUN test "$(id -u)" != 0 && ! command -v npm && ! command -v npx \
 && node --check /app/dist/server.js \
 && node -e 'const a=require("node:assert/strict");const n=require("/app/node_modules/nodemailer");a.equal(require("/app/node_modules/nodemailer/package.json").version,"10.6.1");a.equal(require("/app/node_modules/zod/package.json").version,"3.25.76");const m=require("/app/dist/runtime/secumie-general-staff-mount.cjs");a.equal(typeof m.mount,"function");(async()=>{const t=n.createTransport({streamTransport:true,buffer:true,newline:"unix"});const r=await t.sendMail({from:"test@example.invalid",to:"test2@example.invalid",subject:"Synthetic",text:"test",disableFileAccess:true,disableUrlAccess:true});a.deepEqual(r.envelope.to,["test2@example.invalid"]);a.ok(Buffer.isBuffer(r.message));console.log("NONROOT_MAIL_ENVELOPE_AND_STAFF_LOAD=PASS")})().catch(()=>process.exit(1))'
RUN node -e 'const a=require("node:assert/strict");const {chromium}=require("/app/node_modules/playwright");(async()=>{const b=await chromium.launch({headless:true,args:["--no-sandbox"]});try{const p=await b.newPage();await p.setContent("<html><body>synthetic</body></html>");const pdf=await p.pdf();a.equal(pdf.subarray(0,5).toString(),"%PDF-");console.log("CHROMIUM_PDF=PASS")}finally{await b.close()}})().catch(()=>process.exit(1))'
