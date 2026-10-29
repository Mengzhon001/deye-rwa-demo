import{chromium}from'playwright';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const base='https://mengzhon001.github.io/deye-rwa-demo/',expected=JSON.parse(readFileSync('docs/manual/base-sepolia.public.json'));
const config=await(await fetch(base+'base-sepolia.json',{cache:'no-store'})).json();assert.equal(config.app,expected.app);assert.equal(config.chainId,84532);
for(const lang of['zh','en']){const r=await fetch(base+`manual/manual.${lang}.pdf`,{cache:'no-store'});assert.equal(r.status,200);const live=Buffer.from(await r.arrayBuffer()),local=readFileSync(`docs/manual/manual.${lang}.pdf`);assert.equal(createHash('sha256').update(live).digest('hex'),createHash('sha256').update(local).digest('hex'));console.log('PASS live manual checksum',lang);}
const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({reducedMotion:'reduce'}),p=await context.newPage();await p.goto(base);await p.locator('[data-base-launch]').waitFor({timeout:30000});await p.locator('[data-base-launch]').click();await p.waitForURL(config.app+'/app/**',{timeout:60000});await p.locator('[data-wl-role]').first().waitFor({timeout:60000});assert.equal(await p.locator('[data-wl-role]').count(),4);
 const net=await(await context.request.get(config.app+'/api/network')).json();assert.equal(net.chainId,84532);assert.equal(net.paymentToken.symbol,'USDC');assert.equal(net.demoTimeAdvanceEnabled,false);
 await p.goto(base+'docs/en/base-sepolia/');assert.match(await p.getByRole('heading',{level:1}).innerText(),/Base Sepolia/);await p.reload();await p.getByRole('heading',{level:1}).waitFor();
 console.log('PASS live GitHub homepage, Base launch, role-first login, Circle network metadata and English docs refresh');
}finally{await browser.close();}
