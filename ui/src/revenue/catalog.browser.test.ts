import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import {chromium} from "playwright";
import {startRevenueServer} from "./server";

test("new issuance dialog deploys through the UI, survives lost response and stays out of investor hall",async()=>{
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));
  const port=(socket.address() as any).port;await new Promise<void>(r=>socket.close(()=>r()));
  const origin=`http://127.0.0.1:${port}`;
  Object.assign(process.env,{REVENUE_MONITOR_LIVE:"false",REVENUE_WALLET_REQUIRED:"false",REVENUE_ALLOWED_ORIGINS:origin});
  const {server,catalog}=await startRevenueServer(port,mkdtempSync(join(tmpdir(),"deye-catalog-ui-")));
  const browser=await chromium.launch({headless:true});
  try{
    const p=await browser.newPage();await p.goto(origin+"/app/");
    await p.locator('#roles [data-role="agent"]').click();
    await p.locator('#product-create').click();
    await p.locator('.product-create-dialog input[name=title]').fill('新一期测试产品');
    await p.locator('.product-create-dialog input[type=checkbox]').check();
    // Simulate a dropped HTTP response after successful deployment. A retry must recover it.
    let lost=true;
    await p.route('**/api/products/create',async route=>{
      const response=await route.fetch();
      if(lost){lost=false;await route.abort('failed');}else await route.fulfill({response});
    });
    await p.locator('.product-create-dialog button:not([type])').click();
    await p.waitForFunction(()=>document.querySelector('.product-create-dialog [role=status]')?.textContent?.includes('fetch'));
    assert.equal(catalog.runtimes.size,2);
    await p.reload();await p.locator('#product-create').click();
    assert.equal(await p.locator('.product-create-dialog input[name=title]').inputValue(),'新一期测试产品');
    assert.equal(await p.locator('.product-create-dialog input[name=title]').isDisabled(),true);
    await p.locator('.product-create-dialog button:not([type])').click();
    await p.locator('.product-create-dialog').waitFor({state:'detached'});
    assert.equal(catalog.runtimes.size,2,'retry cannot deploy a third product');
    const selected=await p.evaluate(()=>sessionStorage.getItem('revenue.selected-product'));
    const runtime=await catalog.select(selected!);
    assert.equal(runtime.repo.read().applications.length,0);
    await p.locator('#roles [data-role="owner"]').click();
    await p.waitForFunction(()=>document.querySelector('#nav [data-page="owner_apply"]'));
    assert.equal(await p.evaluate(()=>sessionStorage.getItem('revenue.selected-product')),selected);
    await p.locator('#roles [data-role="investor"]').click();
    await p.waitForFunction(()=>document.querySelector('#nav [data-page="product_hall"]'));
    await p.locator('#nav [data-page="product_hall"]').click();
    assert.equal(await p.locator('.iv-product-card').count(),0);
    assert.match(await p.locator('#main').innerText(),/0 个已发布产品/);
  }finally{
    await browser.close();catalog.monitor.stop();await new Promise<void>(r=>server.close(()=>r()));
  }
});
