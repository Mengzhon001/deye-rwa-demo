const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').resolve(__dirname,'../../public/revenue/app.js'),'utf8');
const api=source.slice(source.indexOf('async function api('),source.indexOf('async function publicGet('));
function context(responses,pending=false){
 const storage=new Map([['revenue.selected-product','old-vault'],...(pending?[['revenue.pending','operation']]:[])]);
 const calls=[];
 const c=vm.createContext({selectedProduct:'old-vault',state:{manifest:{addresses:{vault:'old-vault'}}},networkConfig:{walletRequired:true},sessionStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},fetch:async(path,options)=>{calls.push({path,options});const value=responses.shift();return {ok:value.ok,status:500,json:async()=>value.data};}});
 vm.runInContext(source.slice(0,source.indexOf("function walletProvider"))+api,c);return {c,storage,calls};
}
test('stale vault navigation recovers after reset without carrying the obsolete header',async()=>{
 const f=context([{ok:false,data:{error:'Product not found. Refresh the product list / 产品不存在，请刷新列表'}},{ok:true,data:{manifest:{addresses:{vault:'new-vault'}}}}]);
 const result=await vm.runInContext("api('/api/state')",f.c);
 assert.equal(result.manifest.addresses.vault,'new-vault');assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].options.headers['X-Revenue-Product'],'old-vault');
 assert.equal(f.calls[1].options.headers['X-Revenue-Product'],undefined);
 assert.equal(f.storage.has('revenue.selected-product'),false);
});
test('pending wallet operations prevent automatic product switching',async()=>{
 const f=context([{ok:false,data:{error:'Product not found'}}],true);
 await assert.rejects(vm.runInContext("api('/api/state')",f.c),/Product not found/);
 assert.equal(f.calls.length,1);assert.equal(f.storage.get('revenue.selected-product'),'old-vault');
});
test('mutations are never retried against a different product',async()=>{
 const f=context([{ok:false,data:{error:'Product not found'}}]);
 await assert.rejects(vm.runInContext("api('/api/actions',{action:'subscribe'})",f.c),/Product not found/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'POST');
 assert.equal(f.storage.get('revenue.selected-product'),'old-vault');
});
