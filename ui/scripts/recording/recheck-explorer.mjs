import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';

const out=resolve(process.argv[2]||''),rows=JSON.parse(readFileSync(join(out,'交易核对清单.json'),'utf8'));
const selected=rows.filter(r=>r.videoTimeKind==='visible'||r.businessReferences?.role==='investor'&&r.action.startsWith('faucet-'));
assert(selected.length>20,'Visible transaction index is unexpectedly incomplete');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:1080}}),results=[];
try{
 for(const row of selected){
  assert(row.matched);
  await page.goto(row.url,{waitUntil:'domcontentloaded'});
  await page.getByText(row.hash,{exact:true}).first().waitFor({timeout:30000});
  await page.getByText('Success',{exact:true}).first().waitFor({timeout:30000});
  const names=[...new Set((row.events||[]).map(e=>e.name))];
  if(names.length){await page.getByRole('tab',{name:'Logs',exact:true}).click();for(const name of names)await page.getByText(new RegExp('^'+name+'\\(')).first().waitFor({timeout:20000});}
  results.push({hash:row.hash,url:row.url,videoTime:row.videoTime,actualPageOpened:true,decodedEventNames:names,passed:true});
  console.log('PASS reopened',results.length+'/'+selected.length,row.method);
 }
 writeFileSync(join(out,'explorer-reopen-qa.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
}finally{await browser.close();}
