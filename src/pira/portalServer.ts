import { createPortal } from './portal';
import { coreTransport } from './boundary';
import { portalConfig } from './runtimeConfig';
try{const c=portalConfig(process.env);createPortal(coreTransport(c.coreOrigin),c.origin).listen(Number(process.env.PORT??8080));}
catch{console.error(JSON.stringify({event:'pira_portal_startup_failed'}));process.exitCode=1;}
