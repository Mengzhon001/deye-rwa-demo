/* The URL selects a fixed backend. A wallet network alone never changes the business context. */
(() => {
  const match=location.pathname.match(/^\/networks\/(private|base-sepolia)\//);
  const active=!!match;
  const requestedNetwork=new URLSearchParams(location.search).get('network');
  let id=match?.[1]||(['private','base-sepolia'].includes(requestedNetwork)?requestedNetwork:(localStorage.getItem('revenue.preferred-network')==='base-sepolia'?'base-sepolia':'private')), directory, switching=false;
  if(active)localStorage.setItem('revenue.preferred-network',id);
  const chainIds={'private':20261008,'base-sepolia':84532};
  const lang=()=>localStorage.getItem('revenue.lang')==='en'?'en':'zh';
  const tr=(zh,en)=>lang()==='zh'?zh:en;
  const prefix=()=>active||directory?`/networks/${id}`:'';
  let directoryReady=Promise.resolve();
  const fetchAPI=async(path,init)=>{if(!active)await directoryReady;return fetch(path.startsWith('/api/')?prefix()+path:path,init);};
  const key=k=>active||directory?`${k}:chain:${chainIds[id]}`:k;
  const appPath=(suffix='')=>`${prefix()}/app/${suffix}`;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.RevenueNetworks={get active(){return active||!!directory;},id,chainId:chainIds[id],fetch:fetchAPI,storageKey:key,appPath,
    requestedRole:new URLSearchParams(location.search).get('role'),refresh:()=>render(),open:()=>open(),isSwitching:()=>switching};
  function render(){
    if(!directory)return;
    const host=document.querySelector('.header-tools')||document.querySelector('.site-nav');if(!host)return;
    let b=document.getElementById('network-select');if(!b){b=document.createElement('button');b.id='network-select';b.className='btn btn-outline btn-sm network-select';b.type='button';host.prepend(b);b.addEventListener('click',open);}
    const label=id==='private'?tr('私有演示链','Private demo'):'Base Sepolia';
    if(b.dataset.networkLabel!==label){b.dataset.networkLabel=label;const icon=id==='base-sepolia'?'<circle cx="16" cy="16" r="16" fill="#0052ff"/><path d="M6 16h19" stroke="white" stroke-width="3.1"/>':'<rect width="32" height="32" rx="11" fill="#b8f2c8"/><path d="m9 12 7-4 7 4v8l-7 4-7-4v-8Zm0 0 7 4 7-4m-7 4v8" stroke="#173f35" stroke-width="1.5" fill="none" stroke-linejoin="round"/>';b.innerHTML=`<svg class="network-select-icon" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">${icon}</svg><span>${label}</span><svg class="network-select-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}b.setAttribute('aria-label',tr('当前网络，点击切换','Current network, click to switch'));b.setAttribute('aria-haspopup','dialog');
  }
  function open(){
    if(document.querySelector('#network-dialog[open]'))return;
    const box=document.createElement('dialog');box.id='network-dialog';box.className='network-dialog';box.setAttribute('aria-labelledby','network-title');
    box.innerHTML=`<header><h2 id="network-title">${tr('选择网络','Select network')}</h2><button type="button" data-network-close aria-label="${tr('关闭','Close')}">×</button></header><p>${tr('两条链使用相同角色地址，但产品、余额和交易记录分别保存。切换不会转移资金。','Both chains use the same role addresses, with separate products, balances and transactions. Switching does not bridge funds.')}</p><div class="network-options">${directory.networks.map(n=>`<button type="button" data-network="${n.id}" aria-pressed="${n.id===id}"><b>${escape(n.label[lang()])}${n.id===id?' ✓':''}</b><small>${n.chainId===84532?tr('公开测试链 · Circle 测试 USDC · 真实区块时间','Public testnet · Circle test USDC · Real block time'):tr('完整生命周期演示 · mUSDC · 可推进演示财务时间','Full lifecycle demo · mUSDC · Controlled demo financial time')}</small><small>Chain ID ${n.chainId}</small></button>`).join('')}</div><p role="status" data-network-message>${tr('选择后请在钱包确认网络，并重新签名登录。','Confirm the selected network in your wallet, then sign in again.')}</p><button type="button" data-network-close>${tr('返回','Back')}</button>`;
    box.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-network-close')){if(!switching)box.close();return;}if(b.dataset.network)await change(b.dataset.network,box);});
    box.addEventListener('cancel',e=>{if(switching)e.preventDefault();});box.addEventListener('close',()=>box.remove());document.body.append(box);box.showModal();
  }
  async function change(target,box){
    if(switching)return;const status=box.querySelector('[data-network-message]');
    if(target===id){status.textContent=tr('当前已经是此网络。','This network is already selected.');return;}
    const pending=sessionStorage.getItem(key('revenue.pending'));
    if(pending){status.textContent=tr('当前网络还有待确认操作。请返回页面或交易日志，先核对该笔操作的结果，再切换网络。系统不会重复提交这笔交易。','An operation on this network still needs confirmation. Return to the page or transaction log and reconcile it before switching. The transaction will not be resubmitted.');return;}
    switching=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const r=await fetch(`/networks/${target}/api/network`,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(tr('所选网络服务暂不可用，请稍后重试。','The selected network service is unavailable. Retry later.'));
      const n=await r.json();if(n.chainId!==chainIds[target])throw Error(tr('网络配置不匹配，已停止切换。','Network configuration mismatch. Switching stopped.'));
      const p=window.RoleLogin?.provider?.();
      window.RevenueGuide?.clear?.();
      if(p){
        status.textContent=tr('请在钱包中确认切换网络。拒绝后会留在当前网络。','Confirm the network switch in your wallet. Declining keeps the current application network.');
        if(String(await p.request({method:'eth_chainId'})).toLowerCase()!==n.chainIdHex.toLowerCase()){
          try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:n.chainIdHex}]});}
          catch(e){const unknown=e.code===4902||p.isRabby&&e.code===-32603&&/^Unrecognized chain ID /i.test(e.message||'');if(!unknown)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:n.chainIdHex,chainName:n.chainName,rpcUrls:[n.rpcUrl],blockExplorerUrls:[n.explorerUrl],nativeCurrency:n.nativeCurrency}]});await p.request({method:'wallet_switchEthereumChain',params:[{chainId:n.chainIdHex}]});}
        }
        if(String(await p.request({method:'eth_chainId'})).toLowerCase()!==n.chainIdHex.toLowerCase())throw Error(tr('钱包尚未切换到目标网络，请重试。','The wallet has not switched to the selected network. Retry.'));
      }
      const oldRole=window.RoleLogin?.selectedRole?.() || localStorage.getItem(key('revenue.role'));
      const logout=await fetchAPI('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!logout.ok)throw Error(tr('原网络会话尚未退出，请重试。','The previous network session could not be closed. Retry.'));
      localStorage.setItem('revenue.preferred-network',target);
      const query=new URLSearchParams({lang:lang(),wallet:localStorage.getItem('revenue.wallet')||'rabby'});if(['owner','agent','trustee','investor'].includes(oldRole))query.set('role',oldRole);
      location.assign(`/networks/${target}/app/?${query}`);
    }catch(e){status.textContent=e.code===4001?tr('你已取消钱包网络切换。当前应用网络没有改变，可以重试。','You declined the wallet network switch. The current application network is unchanged; you can retry.'):e.message;switching=false;box.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  if(active){
    // Links opened in a new tab retain the same chain, including receipt reconciliation.
    document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(u.pathname.startsWith('/app/'))a.href=prefix()+u.pathname+u.search+u.hash;else if(u.pathname.startsWith('/docs/')||u.pathname==='/'){u.searchParams.set('network',id);a.href=u.href;}},true);
  }
  directoryReady=fetch('/networks.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).then(d=>{if(d?.version!==1||d.networks?.length!==2||d.networks.some(n=>chainIds[n.id]!==n.chainId))return;directory=d;render();new MutationObserver(render).observe(document.body,{childList:true,subtree:true});}).catch(()=>{});
})();
