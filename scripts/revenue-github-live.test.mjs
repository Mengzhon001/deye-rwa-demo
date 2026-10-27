import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pages,dir} from './revenue-remote.mjs';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
test('published GitHub Pages: bilingual direct links, refresh, local source assets, mobile and guarded wallet entry',async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pages,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('h1');
  assert.match(await page.locator('h1').innerText(),/清洁能源/);
  assert.equal(await page.locator('.wallet-login').count(),0);
  const paths=await page.locator('a[href^="/"]').evaluateAll(a=>a.map(e=>e.getAttribute('href')));
  assert.ok(paths.every(p=>p.startsWith('/deye-rwa-demo/')));
  const config=await (await page.request.get(pages+'remote.json')).json();
  assert.equal(config.chainId,20261008);
  if(config.walletEntryStatus!=='verified'){
   await page.getByRole('button',{name:'Launch App'}).first().click();
   assert.match(await page.locator('#remote-unavailable').innerText(),/钱包安全检查|验证/);
   assert.equal(page.url(),pages);
  }else{
   assert.equal(config.preferredWallet,'rabby');
   assert.equal(config.wallets?.rabby,'verified');
   await page.waitForSelector('.remote-wallet-notice');
   assert.match(await page.locator('.remote-wallet-notice').innerText(),/Rabby/);
   await page.getByRole('button',{name:'Launch App'}).first().click();
   await page.waitForURL(config.app+'/app/?lang=zh&wallet=rabby');
   await page.waitForSelector('[data-wl-wallet]');
   assert.equal(await page.locator('[data-wl-wallet]').inputValue(),'rabby');
   assert.equal(new URL(page.url()).origin,config.app);
  }
  for(const language of ['zh','en'])for(const slug of ['overview','roles','data','valuation','accounting','lifecycle','subscriptions','exits','servicing','contracts','architecture','walkthrough','limitations']){
   const url=pages+`docs/${language}/${slug}/`;
   const response=await page.goto(url,{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200,url);
   await page.waitForSelector('.docs-article h1');
   await page.waitForFunction(lang=>document.documentElement.lang.startsWith(lang),language);
   if(slug==='accounting')assert.ok(await page.locator('[data-cashflow-example]').count()>0);
   results.push({url,status:response.status()});
  }
  await page.goto(pages+'docs/zh/contracts/');await page.reload();
  await page.waitForFunction(()=>document.querySelector('#source-content')?.textContent.includes('contract RevenueShareVault'));
  const archive=await page.request.get(pages+'contracts/deye-rwa-source.tar.gz');
  assert.equal(archive.status(),200);assert.ok((await archive.body()).length>10000);
  await page.setViewportSize({width:390,height:844});
  await page.goto(pages);await page.waitForSelector('h1');
  await page.screenshot({path:join(dir,'github-pages-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  writeFileSync(join(dir,'github-pages-check.json'),JSON.stringify({passed:true,testedAt:new Date().toISOString(),pages:results,walletEntryStatus:config.walletEntryStatus},null,2));
 }finally{await browser.close();}
});
