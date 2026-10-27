import {launchRole,initializeRole} from './metamask.mjs';
import {roles} from './environment.mjs';
const [stage='rehearsal',one]=process.argv.slice(2);
for(const role of one?[one]:roles){const s=await launchRole(stage,role);try{await initializeRole(s);}catch (e) {console.error('Wallet setup needs inspection at',s.wallet.url(),String(e.message).split('\n')[0]);if(!/password|recovery|unlock/.test(s.wallet.url())){await s.wallet.screenshot({path:s.config.dir+'/setup-'+role+'.png'});console.log((await s.wallet.locator('body').innerText()).slice(-1800));}process.exitCode=1;}finally{await s.context.close();}}
