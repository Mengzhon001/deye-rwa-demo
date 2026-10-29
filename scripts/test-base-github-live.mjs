// Compatibility entry. The homepage now opens the shared network application.
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
process.env.REVENUE_UNIFIED_PUBLIC_CONFIG ||= resolve(import.meta.dirname,'../ui/site-dist/networks.json');
process.env.REVENUE_UNIFIED_DATA_DIR ||= process.env.BASE_PAGES_QA_DIR || resolve(import.meta.dirname,'../.data/unified-app');
mkdirSync(process.env.REVENUE_UNIFIED_DATA_DIR+'/validation',{recursive:true});
process.env.REVENUE_PAGES_LIVE="true";
await import('./test-unified-pages.mjs');
