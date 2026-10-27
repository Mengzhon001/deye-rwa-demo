(function(){
'use strict';
let redrawVersion=0,headerObserver,refreshError='',polling=false,pollToken=0;
let refreshJob=null,manualRefresh=null,lastCheck=null,clockJob=null;
let context,model=[],prefs={},key='',identity='',focus,driver,busy=null,timer,locating=false,active='',intro,notice,locateVersion=0;
const label={owner:['Household','业主'],agent:['Intermediary','中介机构'],trustee:['Trustee','受托管理人'],investor:['Investor','投资者']};
const statuses={processing:['Operation pending reconciliation','操作待核对恢复'],ready:['Ready','可执行'],blocked:['Prerequisites missing','条件未满足'],'waiting-role':['Awaiting another participant','等待其他参与者'],'waiting-time':['Awaiting the scheduled date','等待规定日期'],failed:['Needs attention','需要处理'],complete:['Confirmed complete','已确认完成']};
const section={rights:['Application and agreement','申请与协议'],issuance:['Valuation and publication','估值与发行'],subscription:['Eligibility and subscription','资格与认购'],operations:['Collections and distributions','回款与分配'],exits:['Transfers and redemptions','转让与赎回'],servicing:['Independent servicing','独立处置'],closing:['Expiry and closure','到期关闭']};
const tr=(en,zh)=>context?.lang==='en'?en:zh;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=x=>document.querySelector(x);
function read(k,defaults){try{return {...defaults,...JSON.parse(localStorage.getItem(k)||'{}')};}catch{return {...defaults};}}
function save(){if(key)localStorage.setItem(key,JSON.stringify(prefs));}
function clearHighlight(){driver?.destroy();driver=null;document.body.classList.remove('guide-spotlight');document.querySelectorAll('.guide-blocked-target').forEach(e=>e.classList.remove('guide-blocked-target'));}
function dismissIntro(){if(intro){if(intro.open)intro.close();intro.remove();intro=null;}}
function dismissNotice(){if(notice){if(notice.open)notice.close();notice.remove();notice=null;}}
function clear(){refreshJob=null;manualRefresh=null;lastCheck=null;locateVersion++;locating=false;dismissNotice();pollToken++;polling=false;refreshError='';headerObserver?.disconnect();headerObserver=null;document.documentElement.style.removeProperty("--guide-header-height");redrawVersion++;clearHighlight();dismissIntro();$('#guide-panel')?.remove();$('#guide-launch')?.remove();document.body.classList.remove('guide-open','guide-enabled');clearInterval(timer);timer=null;identity='';context=null;busy=null;}
function readLatest(){
 if(refreshJob?.identity===identity)return refreshJob.promise;
 const job={identity},refresh=context?.refresh;
 refreshJob=job;job.promise=Promise.resolve().then(()=>refresh?.()).finally(()=>{if(refreshJob===job)refreshJob=null;});return job.promise;
}
function hookPolling(){clearInterval(timer);timer=null;if(!prefs.open||prefs.paused||!model.some(x=>x.status==='waiting-role'||x.status==='waiting-time')||busy)return;
 timer=setInterval(()=>{if(document.visibilityState!=='visible'||busy||polling||manualRefresh||notice?.open||sessionStorage.getItem('revenue.pending'))return;const id=identity,token=++pollToken;polling=true;readLatest().catch(error=>{if(context&&identity===id){refreshError=error.message;render();}}).finally(()=>{if(pollToken===token)polling=false;});},15000);
}
function update(c){
 const previousTour=driver&&!locating?{id:active,index:driver.getActiveIndex(),identity}:null;
 if(!c?.network?.guidanceEnabled||!c.state||c.network.walletRequired&&!c.session){clear();return;}
 const wallet=c.session?.address||c.state.accounts?.[c.actor]?.address||c.actor;
 const nextIdentity=[c.network.chainId,wallet.toLowerCase(),c.role,c.state.manifest.addresses.vault].join(':');
 if(identity!==nextIdentity){refreshJob=null;manualRefresh=null;lastCheck=null;locateVersion++;locating=false;dismissNotice();clearHighlight();dismissIntro();busy=null;active='';identity=nextIdentity;key=`${RevenueGuideModel.version}:${identity}`;prefs=read(key,{open:true,paused:false,mode:'participant',selected:'',entity:'',selectedExplicit:false});}
 context=c;refreshError='';
 // A staff handoff is acknowledged only after an investor actually opens this product's holdings.
 try{const handoff=JSON.parse(sessionStorage.getItem('revenue.guide-investor-handoff')||'null'),account=c.state.accounts?.[c.actor];if(handoff&&c.role==='investor'&&c.page==='position'&&handoff.chainId===c.network.chainId&&handoff.vault.toLowerCase()===c.state.manifest.addresses.vault.toLowerCase()&&Date.now()-handoff.at<86400000&&(account?.claims||[]).some(r=>Number(r.id)===handoff.distributionId&&(BigInt(r.amountUSDC6||0)>0n||BigInt(r.paidUSDC6||0)>0n))){const original=read(handoff.preferenceKey,{});original.read||={};original.read[handoff.taskId]=true;localStorage.setItem(handoff.preferenceKey,JSON.stringify(original));sessionStorage.removeItem('revenue.guide-investor-handoff');}}catch{/* Only a presentation preference; business progress never depends on this record. */}

 document.body.classList.add('guide-enabled');
 if(!headerObserver){const header=document.querySelector('.topbar');const measure=()=>{if(context)document.documentElement.style.setProperty('--guide-header-height',header.getBoundingClientRect().height+'px');};headerObserver=new ResizeObserver(measure);headerObserver.observe(header);measure();}
 model=RevenueGuideModel.resolve(c);
 if(prefs.entity&&!model.some(x=>x.entity===prefs.entity))prefs.entity='';
 for(const form of document.querySelectorAll('form[data-action]')){form.dataset.guideAction=form.dataset.action;let payload;try{payload=JSON.parse(form.dataset.payload||'{}');}catch{payload={};}form.dataset.guideEntity=payload.applicationId||payload.incomeId||payload.caseId||payload.distributionId||payload.tradeId||payload.id||payload.investor||(payload.index!==undefined?c.state.applications.find(a=>a.chainAdmission?.rightIndex===payload.index)?.id:'')||'';}
 if(driver&&!locating){clearHighlight();}
 render();hookPolling();
 const revision=++redrawVersion;
 if(previousTour&&previousTour.identity===identity&&!busy&&prefs.open&&!prefs.paused){const task=model.find(t=>t.id===previousTour.id);if(task&&task.page===c.page&&task.role===c.role&&task.status==='ready')queueMicrotask(()=>{if(redrawVersion===revision)locate({navigate:false,index:previousTour.index});});}
 const introKey=`${RevenueGuideModel.version}:intro:${c.network.chainId}:${wallet.toLowerCase()}:${c.role}`;
 if(!localStorage.getItem(introKey)&&!busy&&!sessionStorage.getItem('revenue.pending')&&!$('#wallet-login')?.open&&!document.querySelector('.wallet-login[open]'))showIntro(introKey);
}
function tasks(){const all=model.filter(x=>!prefs.entity||x.entity===prefs.entity||!x.applicationId);if(prefs.mode==='demo')return all;const own=all.filter(x=>x.role===context.role);const waiting=all.filter(x=>x.role!==context.role&&x.status!=='complete'&&(!x.actor||context.role!=='investor'||x.actor===context.actor));return own.some(x=>x.status==='ready'&&!x.optional&&!x.informational)?own:[...own,...waiting.slice(0,2)];}
function current(){return RevenueGuideModel.selectCurrent(tasks(),prefs,context.role);}
function fundingHelpMarkup(task){return task?.fundingHelp?`<section class="guide-notice-next guide-funding-help"><h3>${tr('How to complete funding','补足资金操作')}</h3><p>${esc(task.fundingHelp.summary)}</p><ol>${task.fundingHelp.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><button type="button" class="btn btn-outline" data-guide-funding>${tr('Open the investor subscription entrance','打开投资者认购入口')} →</button></section>`:'';}
async function openFunding(){if(!current()?.fundingHelp||!context||busy&&busy.stage!=='failed')return;dismissNotice();clearHighlight();await context.handoff?.({role:'investor',page:'subscribe'});}
function render(){
 if(!context)return;
 let button=$('#guide-launch');if(!button){button=document.createElement('button');button.id='guide-launch';button.type='button';button.className='btn btn-outline btn-sm';button.dataset.guideUi='';document.querySelector('.header-tools').append(button);button.onclick=()=>{prefs.open=!prefs.open;save();render();hookPolling();};}
 button.textContent=tr('Operation guide','操作引导');button.setAttribute('aria-expanded',String(prefs.open));
 document.body.classList.toggle('guide-open',!!prefs.open);
 if(!prefs.open){const panel=$('#guide-panel');if(panel?.contains(document.activeElement))button.focus();panel?.remove();clearHighlight();return;}
 let panel=$('#guide-panel');if(!panel){panel=document.createElement('aside');panel.id='guide-panel';panel.setAttribute('aria-label',tr('Business operation guide','业务操作引导'));panel.dataset.guideUi='';document.body.append(panel);panel.addEventListener('click',clicked);panel.addEventListener('change',changed);}
 panel.setAttribute('aria-label',tr('Business operation guide','业务操作引导'));
 const focused=panel.contains(document.activeElement)?document.activeElement:null;
 const focusAttribute=focused?[...focused.attributes].find(a=>a.name.startsWith('data-guide-')&&a.name!=='data-guide-ui'):null;
 const oldScroll=panel.scrollTop;
 const task=current(),list=tasks(),sections=[...new Set(list.map(x=>x.section))];
 const last=(context.state.operations||[]).filter(x=>x.status==='confirmed'&&(task?.entity==='payment'?x.action==='settle':task?.entity==='holding'?['collect-revenue','distribute'].includes(x.action)||x.action==='claim'&&x.actor===context.actor:x.action===task?.action&&(!task.applicationId||x.body?.applicationId===task.applicationId)&&(!task.actor||x.body?.investor===task.actor||x.actor===task.actor))).at(-1);
 const receipts=Object.values(last?.steps||{});
 const receiptNote=receipts.length?`<div class="guide-operation" role="status"><b>${tr('Latest related confirmed record','最近一笔相关确认记录')}</b><br>${esc(RevenueGuideModel.content[last.action]?.[context.lang==='en'?0:1]||last.action)}<br>${receipts.every(x=>x.indexed===true)?tr('Chain confirmed · explorer indexed','链上已确认，浏览器已索引'):tr('Chain confirmed · explorer indexing separately','链上已确认，浏览器索引单独更新')}<br>${receipts.map(x=>`<a target="_blank" rel="noopener" href="${esc(context.network.explorerUrl)}/tx/${esc(x.hash)}">${esc(x.hash.slice(0,12))}… ↗</a>`).join(' ')}</div>`:'';
 const state=busy?.stage==='failed'?'failed':busy?'processing':task?.status;
 const stageText={wallet:tr('Confirm in your wallet','请在钱包中确认'),submitted:tr('Wallet submitted · awaiting chain receipt','钱包已提交，等待链上回执'),confirmed:tr('Chain confirmed · reconciling business state','链上已确认，正在核对业务状态'),indexed:tr('Explorer indexed the confirmed transaction','区块链浏览器已索引确认交易'),failed:tr('Not completed. Review the reason and retry.','尚未完成，请核对原因后重试。')};
 const objects=[...new Map(model.filter(x=>x.applicationId).map(x=>[x.entity,x])).values()];
 panel.innerHTML=`<header><div><small>DEYE · ${tr('TASK ASSISTANT','业务引导')}</small><h2>${tr('Your current task','当前任务')}</h2></div><button data-guide-collapse data-guide-ui aria-label="${tr('Collapse guide','收起引导')}">×</button></header><p class="guide-product">${esc(context.state.selectedProduct?.title?.[context.lang]||tr('Selected product','当前产品'))}<br><span>${esc(label[context.role]?.[context.lang==='en'?0:1])} · ${esc((context.session?.address||context.state.accounts?.[context.actor]?.address||context.actor).slice(0,10))}…</span></p><div class="guide-options"><label>${tr('Mode','模式')}<select data-guide-mode data-guide-ui><option value="participant" ${prefs.mode==='participant'?'selected':''}>${tr('Participant','参与者模式')}</option><option value="demo" ${prefs.mode==='demo'?'selected':''}>${tr('Four-role demonstration','四角色演示')}</option></select></label><button data-guide-pause data-guide-ui>${prefs.paused?tr('Resume','恢复'):tr('Pause','暂停')}</button></div>${objects.length>1?`<label class="guide-object">${tr('Application','处理申请')}<select data-guide-entity data-guide-ui><option value="">${tr('Current priorities','当前优先事项')}</option>${objects.map(x=>`<option value="${esc(x.entity)}" ${prefs.entity===x.entity?'selected':''}>${esc(x.entity.slice(0,16))}</option>`).join('')}</select></label>`:''}${refreshError?`<p class="guide-blockers" role="status">${tr('Latest status could not be read. Refresh before continuing.','未能读取最新状态，请刷新后再继续。')} ${esc(refreshError)}</p><button data-guide-refresh data-guide-ui>${tr('Refresh status','刷新状态')}</button>`:''}${prefs.paused?`<p class="guide-status">${tr('The guide is paused. Normal business actions remain available.','引导已暂停，仍可正常办理业务。')}</p>`:task?`<section class="guide-current" data-guide-task="${esc(task.action)}"><span class="guide-status" data-guide-state="${esc(state)}">${esc(busy?stageText[busy.stage]||tr('Processing','处理中'):(task.readOnly?tr('Available to inspect','可查看最新进度'):textStatus(task.status)))}</span><h3>${esc(task.title)}</h3><small>${esc(section[task.section]?.[context.lang==='en'?0:1]||'')}</small>${task.applicationId?`<small>${tr('Application','申请')} ${esc(task.applicationId.slice(0,16))}</small>`:''}<p>${esc(task.purpose)}</p>${task.prerequisites?.length?`<details class="guide-prerequisites"><summary>${tr('Required conditions','必要条件')}</summary><ul>${task.prerequisites.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}${task.blockers?.length?`<ul class="guide-blockers">${task.blockers.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${task.waitDate&&task.status==='waiting-time'?`<p>${tr('Scheduled financial date','财务时钟规定日期')} ${esc(new Date(task.waitDate*1000).toISOString().slice(0,16).replace('T',' '))} UTC</p>`:''}${busy?`<p role="status" class="guide-operation">${esc(busy.message||'')}${busy.hash?`<br><a target="_blank" rel="noopener" href="${esc(context.network.explorerUrl)}/tx/${esc(busy.hash)}">${tr('Open transaction in explorer','在浏览器查看交易')} ↗</a>`:''}</p>`:''}<div class="guide-result"><b>${tr('Expected result','预期结果')}</b><p>${esc(task.result)}</p><small>${tr('Next handler','完成后的处理人')} · ${esc(label[task.nextRole]?.[context.lang==='en'?0:1]||'')}</small></div>${task.role!==context.role||task.assignee&&task.assignee!==context.actor?`<p>${tr('Next participant','下一位处理人')} <b>${esc(assigneeLabel(task))}</b>。${tr('Only that wallet can approve or sign.','只有该角色的钱包可以批准或签名。')}</p>${prefs.mode==='demo'?`<button data-guide-handoff data-guide-ui ${busy?'disabled':''}>${tr('Select the next role and wallet','选择下一角色并连接钱包')} →</button>`:`<button data-guide-refresh data-guide-ui>${tr('Check latest status','查看最新状态')}</button>`}`:`<button class="btn btn-primary" data-guide-locate data-guide-ui>${task.status==='complete'?tr('Review result','查看结果'):tr('Locate the operation','定位操作')} →</button>`}${task.informational&&!prefs.read?.[task.id]?`<button data-guide-understood data-guide-ui>${tr('I understand; continue','我已了解，继续')}</button>`:''}</section>`:`<p>${tr('No pending task. Inspect the current records or choose a product.','当前没有待办，请查看业务记录或选择产品。')}</p>`}${receiptNote}<details class="guide-checklist"><summary>${tr('Stages and tasks','阶段与任务')}</summary>${sections.map(group=>`<section><h4>${esc(section[group]?.[context.lang==='en'?0:1]||group)}</h4>${list.filter(x=>x.section===group).map(x=>`<button data-guide-task-id="${esc(x.id)}" data-guide-ui><span>${x.status==='complete'?'✓':'○'}</span><span>${esc(x.title)}<small>${esc(textStatus(x.status))}${x.optional?' · '+tr('Optional','可选'):''}</small></span></button>`).join('')}</section>`).join('')}</details><footer><button data-guide-intro data-guide-ui>${tr('Product and role overview','查看业务与角色全貌')}</button><a href="/docs/${context.lang}/walkthrough/" target="_blank" rel="noopener">${tr('Detailed instructions','详细说明')} ↗</a></footer>`;
 if(task?.handoff&&!prefs.paused){panel.querySelector('.guide-current')?.insertAdjacentHTML('beforeend',handoffMarkup(task));}
 if(task?.fundingHelp&&!prefs.paused){const details=document.createElement('details');details.className='guide-funding';details.innerHTML=`<summary>${tr('Funding shortfall and next steps','资金差额与补足步骤')}</summary>${fundingHelpMarkup(task)}`;panel.querySelector('.guide-current')?.append(details);}
 if(lastCheck){const status=document.createElement('p');status.className='guide-last-check';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent=tr('Last checked at ','最近查询时间 ')+new Date(lastCheck.at).toLocaleTimeString(context.lang==='en'?'en-US':'zh-CN')+' · '+(lastCheck.changed?tr('task updated','任务已更新'):tr('no task change','任务暂无变化'));panel.querySelector('.guide-options').after(status);}
 panel.querySelectorAll('[data-guide-refresh]').forEach(b=>{b.setAttribute('aria-busy',String(!!manualRefresh));if(manualRefresh)b.textContent=tr('Checking latest status…','正在查询最新状态…');});
 panel.scrollTop=oldScroll;
 if(focusAttribute){const next=[...panel.querySelectorAll('button,select')].find(e=>e.getAttribute(focusAttribute.name)===focusAttribute.value);(next||button).focus({preventScroll:true});}
}
function assigneeLabel(task){const suffix=task.assignee==='trustee2'||task.assignee==='investor2'?' B':task.assignee==='trustee'||task.assignee==='investor'?' A':'';const address=context.state.manifest.accounts?.[task.assignee];return (label[task.role]?.[context.lang==='en'?0:1]||task.role)+suffix+(address?' · '+address.slice(0,10)+'…':'');}
function textStatus(status){return statuses[status]?.[context.lang==='en'?0:1]||status;}
function showIntro(storageKey){
 if(intro)return;focus=document.activeElement;intro=document.createElement('dialog');intro.className='guide-intro';intro.dataset.guideUi='';
 intro.innerHTML=`<h2>${tr('Understand your part in the product','了解你在产品中的角色')}</h2><p>${tr('The household owns the equipment. It assigns defined revenue rights to the pool; investors hold shares in those rights, not the solar panels.','业主持有设备，并把约定收益权交给资产池；投资者持有的是这些收益权的份额，不是光伏设备。')}</p><div class="guide-overview" aria-label="${tr('Responsibilities and handoffs','职责与交接')}"><div>${tr('Household','业主')}<small>${tr('Keeps equipment; pays discounted electricity bills','保留设备，支付折扣电费')}</small></div><span>→</span><div>${tr('Intermediary','中介机构')}<small>${tr('Reviews evidence, values rights and operates the pool','审核证据、估值并运营资产池')}</small></div><span>→</span><div>${tr('Trustee','受托管理人')}<small>${tr('Independently approves values and servicing','独立审批估值与处置')}</small></div><span>→</span><div>${tr('Investor','投资者')}<small>${tr('Subscribes and claims variable collected cash','认购并领取浮动回款')}</small></div></div><div class="guide-money-map" aria-label="${tr('Rights and money flows','收益权与资金流')}"><div><b>${tr('Household','业主')}</b><span>${tr('Revenue rights → pool → DRS shares','收益权 → 资产池 → DRS 份额')}</span><b>${tr('Investor','投资者')}</b></div><div><b>${tr('Purchase proceeds','购买款')}</b><span>← ${tr('Pool cash ← subscription','资产池现金 ← 认购款')}</span><b>${tr('Test USDC','测试 USDC')}</b></div><div><b>${tr('Discounted bills + export receipts','折扣电费＋售电回款')}</b><span>→ ${tr('Pool after agreed costs','资产池扣除约定费用')} →</span><b>${tr('Variable distributions','浮动分配')}</b></div><p>${tr('Solar equipment stays with the household throughout. The intermediary operates the pool; trustees independently supervise it.','光伏设备始终归业主。中介运营资产池，受托人独立监督。')}</p></div><p>${tr('Household bills plus export receipts fund the pool. Agreed costs are deducted before distributions. A quote is an estimate; it does not guarantee income or return of principal.','业主电费与售电回款形成资产池现金流，扣除约定费用后按规则分配。报价属于估计，不保证收益或返还原始本金。')}</p><p>${tr('An NFT identifies the station; the vault records rights terms. USDC is the demo payment token and DRS shares issue only after settlement. A login message is not a payment transaction.','NFT 标识电站，收益权条款记录在资产池中。USDC 是演示付款代币，DRS 份额只在成功结算后发行。登录消息不是付款交易。')}</p><p>${tr('The assistant locates real controls and explains results. You must still read, approve and sign personally.','引导会定位真实控件并解释结果，但仍须由你本人阅读、批准和签名。')}</p><div><button class="btn btn-primary" data-guide-start data-guide-ui>${tr('Start my current task','开始当前任务')}</button><button class="btn btn-outline" data-guide-later data-guide-ui>${tr('Later','稍后了解')}</button></div>`;
 document.body.append(intro);intro.showModal();
 const finish=start=>{if(storageKey)localStorage.setItem(storageKey,'seen');prefs.open=true;prefs.paused=!start;save();dismissIntro();render();hookPolling();focus?.focus?.();};
 intro.querySelector('[data-guide-start]').onclick=()=>finish(true);intro.querySelector('[data-guide-later]').onclick=()=>finish(false);intro.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
}
async function investorHandoff(){if(!context)return;const task=model.find(t=>t.handoff);if(task)sessionStorage.setItem('revenue.guide-investor-handoff',JSON.stringify({preferenceKey:key,taskId:task.id,distributionId:task.distributionId,chainId:context.network.chainId,vault:context.state.manifest.addresses.vault,at:Date.now()}));clearHighlight();dismissNotice();await context.handoff?.({role:'investor',page:'position'});}
function handoffMarkup(task){return `<section class="guide-notice-next"><h3>${tr('Investor viewing and claiming','投资者查看与领取')}</h3><p>${tr('Connect the investor’s own wallet. This opens their position; no claim is submitted until they confirm it.','请连接投资者自己的钱包。进入持仓页不会自动领取，仍须投资者核对并确认交易。')}</p><button type="button" class="btn btn-primary" data-guide-investor-handoff data-guide-ui>${tr('Switch to investor · view / claim','切换到投资者 · 查看或领取')} →</button><button type="button" class="btn btn-outline" data-guide-handoff-later data-guide-ui>${tr('Review later; continue operations','稍后查看，继续运营')}</button></section>`;}
async function clicked(e){const button=e.target.closest('button');if(!button)return;e.stopPropagation();
 if(button.hasAttribute('data-guide-investor-handoff')){await investorHandoff();return;}
 else if(button.hasAttribute('data-guide-handoff-later')){prefs.read||={};prefs.read[current().id]=true;prefs.selected='';prefs.selectedExplicit=false;clearHighlight();}
 else if(button.hasAttribute('data-guide-collapse')){prefs.open=false;clearHighlight();}
 else if(button.hasAttribute('data-guide-pause')){prefs.paused=!prefs.paused;clearHighlight();}
 else if(button.dataset.guideTaskId){prefs.selected=button.dataset.guideTaskId;prefs.selectedExplicit=true;prefs.reviewComplete=model.some(x=>x.id===prefs.selected&&x.status==='complete');busy=null;clearHighlight();}
 else if(button.hasAttribute('data-guide-understood')){prefs.read||={};prefs.read[current().id]=true;prefs.selected='';prefs.selectedExplicit=false;clearHighlight();}
 else if(button.hasAttribute('data-guide-refresh')){await checkLatest();return;}
 else if(button.hasAttribute('data-guide-funding')){await openFunding();return;}
 else if(button.hasAttribute('data-guide-intro'))showIntro();
 else if(button.hasAttribute('data-guide-locate')){await locate();return;}
 else if(button.hasAttribute('data-guide-handoff')){clearHighlight();const task=current();await context.handoff?.(task);return;}
 save();render();hookPolling();
}
function changed(e){if(e.target.hasAttribute('data-guide-mode')){prefs.mode=e.target.value;clearHighlight();}if(e.target.hasAttribute('data-guide-entity')){prefs.entity=e.target.value;prefs.selected='';clearHighlight();}save();render();}
function target(task){
 if(task.readOnly)return document.querySelector(task.selector);
 if(task.status==='complete')return document.querySelector('.wf-detail-title,.iv-facts,#main');
 if(task.operationId)return document.querySelector(task.selector);
 const forms=[...document.querySelectorAll(`form[data-guide-action="${CSS.escape(task.action)}"]`)].filter(f=>!f.closest(".wf-next,.wf-owner-intro,.iv-steps"));
 let form=forms.find(f=>task.entity&&JSON.parse(f.dataset.payload||'{}').incomeId===task.entity);
 if(!form)form=forms.find(f=>task.applicationId&&f.dataset.guideEntity===task.applicationId||task.entity&&f.dataset.guideEntity===task.entity);
 if(!form&&forms.length===1)form=forms[0];
 if(!form&&forms.length>1&&new Set(forms.map(f=>f.dataset.payload||'{}')).size===1)form=forms.find(f=>f.getClientRects().length)||forms[0];
 if(!form&&forms.length>1){form=forms.find(f=>{const field=f.querySelector('[name="investor"], [name="tradeId"], [name="id"], [name="applicationId"]');return field?.value===(task.actor||task.entity||task.applicationId);});}
 return form||(forms.length>1?null:document.querySelector(task.selector));
}
let assets;
function loadDriver(){if(assets)return assets;return assets=(async()=>{const css=document.createElement('link');css.rel='stylesheet';css.href='/guidance-driver.css';document.head.append(css);if(!window.driver){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/guidance-driver.js';script.onload=resolve;script.onerror=reject;document.head.append(script);});}return window.driver.js.driver;})().catch(()=>{assets=null;throw Error(tr('Local guide resources could not load. Retry after the service recovers.','本地引导资源未能加载，请在服务恢复后重试。'));});}
function remedyFor(task){
 if(!task||task.handoff)return null;
 const next=context.product?.operations?.next;
 if(task.section==='operations'&&next){const match=model.find(x=>x.action===next.action&&x.id!==task.id&&x.status!=='complete'&&(!next.period||Number(x.period)===Number(next.period))&&(!next.entity||x.entity===next.entity));if(match)return match;}
 if(task.remedyAction){const next=model.find(x=>x.action===task.remedyAction&&x.status!=='complete');if(next)return next;}
 const eligible=model.filter(x=>x.id!==task.id&&x.role===context.role&&(!x.assignee||x.assignee===context.actor)&&x.status==='ready'&&!x.optional&&!x.informational);
 const dependencies={settle:['review-subscription','eligible','prepare-valuation','approve-valuation'],subscribe:['faucet','apply-eligibility'],publish:['prepare-valuation','approve-valuation'],'prepare-valuation':['book-revenue','fund-export','pay-household-bill','confirm-receipt','collect-revenue'],'accrue-fee':['book-revenue','fund-export','pay-household-bill','confirm-receipt','collect-revenue','prepare-valuation'],distribute:['accrue-fee','collect-revenue'],close:['collect-revenue','accrue-fee','prepare-valuation']};
 for(const action of dependencies[task.action]||[]){const next=eligible.find(x=>x.action===action)||model.find(x=>x.action===action&&x.id!==task.id&&x.status!=='complete'&&!x.optional);if(next)return next;}
 if(task.action==='accrue-fee'){const approval=model.find(x=>x.action==='approve-valuation'&&x.role==='trustee'&&x.status!=='complete');if(approval)return approval;}
 return eligible.find(x=>x.section===task.section);
}
function refreshSnapshot(){const s=context.state,a=s.accounts?.[context.actor];return JSON.stringify([model.map(t=>[t.id,t.status,t.blockers]),s.chain?.phase,s.chain?.totalSubscriptions,s.chain?.vaultCash,s.chain?.feeMonths,s.chain?.distributionCount,s.chain?.fresh,s.income?.map(r=>[r.id,r.collected,r.amountUSDC6,r.payment?.householdPaid,r.payment?.exportPaid,r.payment?.confirmed]),a?.claims,a?.subscription,a?.eligible,a?.economicShares]);}
function latestExplanation(task){
 const s=context.state,a=s.accounts?.[context.actor],phase=Number(s.chain?.phase);
 if(context.role==='investor'&&phase===2)return model.find(t=>t.entity==='holding')?.purpose||task?.purpose||tr('Confirmed distributions are listed in My holdings.','已确认分配列在「我的持仓」。');
 if(context.role==='investor'&&phase===1&&BigInt(a?.subscription?.amount||'0')>0n){
  const amount=(Number(a.subscription.amount)/1e6).toLocaleString(context.lang==='en'?'en-US':'zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  return a.subscription.approved
   ? tr(`The intermediary has approved your cumulative ${amount} USDC subscription. Shares issue only after the pool meets all settlement conditions and the intermediary settles it.`,`中介已审核通过你的累计 ${amount} USDC 认购。仍须满足全部募集结算条件，并由中介执行统一结算后，才会发行份额。`)
   : tr(`Your cumulative ${amount} USDC subscription is still awaiting intermediary review. This button only reads the latest status; it cannot approve the order on the intermediary's behalf.`,`你的累计 ${amount} USDC 认购仍在等待中介机构审核。本按钮只查询最新状态，不会替中介批准订单。`);
 }
 return task?tr(`Latest status read. The current task is “${task.title}” (${textStatus(task.status)}). The handling participant is ${assigneeLabel(task)}.`,`已读取最新状态。当前任务为“${task.title}”，状态是“${textStatus(task.status)}”，处理人为${assigneeLabel(task)}。`):tr('Latest status read. There is no pending task in the current view.','已读取最新状态，当前视图没有待办任务。');
}
async function checkLatest(){
 if(!context)return;
 if(busy&&busy.stage!=='failed'){showNotice(current(),{title:tr('An operation is still in progress','当前操作仍在处理中'),reason:busy.message||tr('Reconcile the wallet request or transaction before querying again.','请先核对钱包请求或交易状态，再重新查询。'),retry:false,returnFocus:'[data-guide-refresh]'});return;}
 if(manualRefresh){showNotice(current(),{title:tr('Checking latest status','正在查询最新状态'),reason:tr('The query is already in progress. No additional request or transaction is needed.','正在读取最新状态，无需重复发起查询或交易。'),loading:true,returnFocus:'[data-guide-refresh]'});return;}
 const job={identity},before=refreshSnapshot();manualRefresh=job;clearHighlight();render();
 const valid=()=>!!context&&identity===job.identity&&manualRefresh===job;
 showNotice(current(),{title:tr('Checking latest status','正在查询最新状态'),reason:tr('Reading the latest business record and confirmed chain state.','正在读取最新业务记录与已确认链上状态。'),loading:true,returnFocus:'[data-guide-refresh]'});
 try{
  const applied=await readLatest();if(!valid())return;
  if(applied===false||busy&&busy.stage!=='failed'){showNotice(current(),{title:tr('The current operation is still in progress','当前操作尚未结束'),reason:tr('The query did not replace the in-progress operation. Reconcile its original wallet request or receipt first.','查询没有覆盖正在进行的操作，请先核对原钱包请求或交易回执。'),retry:false,returnFocus:'[data-guide-refresh]'});return;}
  const changed=before!==refreshSnapshot();lastCheck={at:Date.now(),changed};refreshError='';
  showNotice(current(),{title:changed?tr('Task status updated','任务状态已更新'):tr('Status checked · no change','状态查询完成，暂无变化'),reason:latestExplanation(current()),remedy:remedyFor(current())||(current()?.role!==context.role?current():null),retry:false,returnFocus:'[data-guide-refresh]'});
 }catch(error){if(valid()){refreshError=error.message;showNotice(current(),{title:tr('Latest status could not be read','最新状态查询失败'),reason:error.message,retryAction:'refresh',returnFocus:'[data-guide-refresh]'});}}
 finally{if(manualRefresh===job){manualRefresh=null;render();hookPolling();}}
}
function showClockConfirmation(task){
 const cutoff=task?.clockJump?.cutoff;if(!cutoff||!context||busy&&busy.stage!=='failed')return;
 const originalIdentity=identity,session=context.session,taskId=task.id;
 const date=new Date(cutoff*1000).toISOString().replace('T',' ').slice(0,19)+' UTC';
 showNotice(task,{title:tr('Confirm shared demo time advancement','确认推进共享演示时间'),reason:tr(`Advance the local test chain to ${date}. All products on this chain share its clock; fundraising deadlines, valuation validity and lock periods will also move forward. This is a node administration action, not a wallet payment. It will not approve NAV, accrue fees or create new station observations.`,`将本地测试链推进到 ${date}。这条链上的所有产品共用时钟，募集截止日、估值有效期及锁定期都会受影响。这是节点管理操作，不是钱包付款，不会自动审批净值、计提费用或生成电站采集数据。`),retry:false,clock:false});
 const expires=Number(context.state.chain.proposedValuationValidUntil||context.product?.proposalValidUntil);
 if(expires>0&&expires<=cutoff&&!context.state.approvedReports.includes(context.state.activeReports.aggregate)){const warning=document.createElement('p');warning.className='guide-blockers';warning.textContent=tr('The pending report will have expired by this target date. After advancing, record any completed-month receivables and ask the intermediary to prepare a current report before trustee approval.','待批准报告在目标日期已过期。推进后，请先登记已结束月份的应收款，再由中介编制当前报告，交受托人审批。');notice.querySelector('.guide-notice-actions').before(warning);}
 const confirm=document.createElement('button');confirm.type='button';confirm.className='btn btn-primary';confirm.dataset.guideClockConfirm='';confirm.textContent=tr('Confirm and advance to this cutoff','确认并推进至本月截止日');notice.querySelector('.guide-notice-actions').prepend(confirm);
 confirm.onclick=async()=>{
  if(clockJob||!context||identity!==originalIdentity||context.session!==session)return;
  const job={identity:originalIdentity};clockJob=job;confirm.disabled=true;
  const valid=()=>!!context&&identity===originalIdentity&&context.session===session&&clockJob===job;
  try{
   const result=await context.advanceMonth(cutoff);if(!valid())return;if(!result?.ok)throw Error(result?.error||tr('The operation could not be confirmed. Refresh its status before retrying.','未能确认操作结果，请刷新状态后再重试。'));
   const next=model.find(t=>t.id===taskId)||current();
   showNotice(next,{title:tr('Monthly fee cutoff reached','已推进至本月计费截止日'),reason:tr(`The financial clock now reads ${new Date(context.state.financialTime*1000).toISOString().replace('T',' ').slice(0,19)} UTC. Station observation timestamps are unchanged. Review the remaining conditions below. If the opening NAV is missing, prepare it and obtain trustee approval before accruing fees.`,`财务时钟已到 ${new Date(context.state.financialTime*1000).toISOString().replace('T',' ').slice(0,19)} UTC。电站采集时间保持不变。请继续处理下方剩余条件；计费基准净值尚未批准时，先编制估值并交受托人审批，再计提费用。`),remedy:next?.status==='ready'?next:remedyFor(next||task),retry:false,clock:false});
  }catch(error){if(valid())showNotice(current()||task,{title:tr('Time advancement could not be confirmed','未能确认时间推进结果'),reason:error.message,retry:true,clock:false});}
  finally{if(clockJob===job)clockJob=null;}
 };
}
function showNotice(task,{title,reason,loading=false,remedy=null,retry=true,retryAction='locate',returnFocus='[data-guide-locate]',clock=true}={}){
 dismissNotice();notice=document.createElement('dialog');notice.className='guide-notice';notice.dataset.guideUi='';notice.setAttribute('aria-labelledby','guide-notice-title');
 const blockers=[...new Set(task?.blockers||[])],handling=task?assigneeLabel(task):'';
 notice.innerHTML=`<small>${tr('OPERATION GUIDE','操作引导')}</small><h2 id="guide-notice-title">${esc(title||task?.title||tr('Operation guidance','操作说明'))}</h2>${task?`<p class="guide-notice-task">${esc(task.title)} · ${esc(handling)}</p>`:''}<p role="status">${esc(reason||'')}</p>${task&&!loading?`${task.handoff?'':`<p>${esc(task.purpose)}</p>`}${blockers.length?`<section><h3>${tr('What is still required','当前未满足的条件')}</h3><ul>${blockers.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}${task.waitDate&&task.status==='waiting-time'?`<p>${tr('Wait until the financial cutoff','请等待财务截止日')} ${esc(new Date(task.waitDate*1000).toISOString().slice(0,16).replace('T',' '))} UTC。</p>`:''}${remedy?`<section class="guide-notice-next"><h3>${tr('Available next step','可以先处理的下一步')}</h3><p>${esc(remedy.title)}</p><p>${esc(remedy.purpose)}</p></section>`:''}${task.readOnly?'':`<p>${tr('This explanation does not approve an order, change a prerequisite or submit a transaction.','本说明不会批准订单、改变必要条件或提交交易。')}</p>`}`:''}<div class="guide-notice-actions">${remedy?`<button class="btn btn-primary" data-guide-remedy>${tr('Locate','定位')} ${esc(remedy.title)} →</button>`:''}${!loading&&retry?`<button class="btn btn-outline" data-guide-retry>${retryAction==='refresh'?tr('Retry status query','重新查询状态'):tr('Refresh and locate again','刷新状态并重新定位')}</button>`:''}<button class="btn btn-outline" data-guide-notice-close>${loading?tr('Close','关闭'):tr('Return to the page','返回页面')}</button></div>`;
 const panel=notice;if(task?.handoff&&!loading)panel.querySelector('.guide-notice-actions').insertAdjacentHTML('beforebegin',handoffMarkup(task));document.body.append(panel);panel.showModal();
 panel.querySelector('[data-guide-investor-handoff]')?.addEventListener('click',investorHandoff);
 panel.querySelector('[data-guide-handoff-later]')?.addEventListener('click',()=>{prefs.read||={};prefs.read[task.id]=true;prefs.selected='';prefs.selectedExplicit=false;save();dismissNotice();render();});
 if(clock&&!loading&&task?.clockJump&&context.role==='agent'&&(!busy||busy.stage==='failed')){
  const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.dataset.guideClock='';button.textContent=tr('Advance to this month’s fee cutoff','推进至本月计费截止日');panel.querySelector('.guide-notice-actions').prepend(button);button.onclick=()=>showClockConfirmation(task);
 }
 if(remedy&&remedy.role!==context.role){const button=panel.querySelector('[data-guide-remedy]');if(button)button.textContent=tr('Open ','打开')+assigneeLabel(remedy)+tr(' workspace','工作台')+' →';}
 if(!loading&&task?.fundingHelp){const help=document.createElement('div');help.innerHTML=fundingHelpMarkup(task);panel.querySelector('.guide-notice-actions').before(help);help.querySelector('[data-guide-funding]').onclick=()=>openFunding();}
 const heading=panel.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});panel.scrollTop=0;
 const finish=()=>{dismissNotice();($('#guide-panel '+returnFocus)||$('#guide-launch'))?.focus({preventScroll:true});};
 panel.querySelector('[data-guide-notice-close]').onclick=finish;
 panel.addEventListener('cancel',e=>{e.preventDefault();finish();});
 panel.querySelector('[data-guide-remedy]')?.addEventListener('click',()=>{dismissNotice();if(remedy.role!==context.role){clearHighlight();context.handoff?.(remedy);return;}prefs.selected=remedy.id;prefs.selectedExplicit=true;save();render();locate();});
 panel.querySelector('[data-guide-retry]')?.addEventListener('click',()=>{dismissNotice();if(retryAction==='refresh')checkLatest();else locate();});
}
async function locate({navigate=true,index=0}={}){
 let task=current();if(!task)return;
 if(busy&&busy.stage!=='failed'){showNotice(task,{title:tr('An operation is still in progress','当前操作仍在处理中'),reason:busy.message||tr('Check the wallet request or original transaction receipt before starting another operation.','请先核对钱包请求或原交易回执，再开始下一项操作。'),retry:false});return;}
 if(locating){showNotice(task,{title:tr('Opening the operation','正在定位操作'),reason:tr('The guide is reading the latest state and opening the related record.','引导正在读取最新状态并打开相关记录。'),loading:true});return;}
 prefs.entity=task.applicationId||prefs.entity;prefs.selectedExplicit=prefs.selected===task.id&&!!prefs.selectedExplicit;prefs.selected=task.id;save();dismissNotice();clearHighlight();locating=true;
 const token=++locateVersion,originalIdentity=identity,taskId=task.id;
 const valid=()=>token===locateVersion&&identity===originalIdentity&&!!context;
 try{
  if(navigate){
   showNotice(task,{title:tr('Opening the operation','正在定位操作'),reason:tr('Reading the latest state before locating this record.','正在读取最新业务状态，再定位到这条记录。'),loading:true});
   await readLatest();if(!valid())return;
   task=model.find(x=>x.id===taskId);
   if(!task){const next=current();showNotice(next,{title:tr('The task has changed','当前任务已变化'),reason:tr('The prior task no longer applies. The current next step is shown below.','原任务已不再适用，下方显示当前可处理的下一步。'),remedy:next,retry:false});return;}
  }
  active=task.id;
  if(task.role!==context.role||task.assignee&&task.assignee!==context.actor){showNotice(task,{title:tr('Continue with the handling participant','请交由对应参与者继续'),reason:tr(`This step belongs to ${assigneeLabel(task)}. Open that workspace using the handling wallet; selecting a role does not grant its permissions.`,`此步骤由${assigneeLabel(task)}处理。请通过下方入口使用对应钱包登录，选择角色本身不会授予权限。`),remedy:task,retry:false});return;}
  if(navigate)await context.navigate(task);
  if(!valid())return;
  let element=target(task);for(let i=0;i<15&&!element&&valid();i++){await new Promise(r=>setTimeout(r,100));element=target(task);}
  if(!valid())return;
  if(!element)throw Error(tr('This operation is not available on the current record. Refresh its status or open its detail.','当前记录未提供该操作，请刷新状态或打开记录详情。'));
  for(let parent=element;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  if(!element.getClientRects().length||getComputedStyle(element).visibility==='hidden')throw Error(tr('The related page is open, but its control is not visible. Review the current task conditions or refresh this record.','已打开相关页面，但当前控件尚未显示，请核对任务条件或刷新记录。'));
  const submit=element.matches('form')?[...element.querySelectorAll('button[type=submit],button:not([type])')].at(-1):element;
  if(!task.readOnly&&(task.status==='blocked'||task.status==='waiting-time'||task.status==='waiting-role'||submit?.disabled)){
   element.scrollIntoView({block:'center',behavior:'instant'});element.classList.add('guide-blocked-target');
   showNotice(task,{title:tr('Prerequisites are not yet met','当前尚未满足操作条件'),reason:remedyFor(task)?tr('The target control is highlighted behind this dialog. Complete the concrete next step below with its handling participant, then return to this operation.','目标操作已在弹窗后方标出。请先通过下方入口，由对应处理人完成下一步，再返回此操作。'):task.clockJump?tr('This month has not reached its cutoff. Use the explicit local demo time option below, then reconcile bills and fees.','本月尚未到截止日。可使用下方本地演示时间选项，再核对本月账单和费用。'):tr('Review the highlighted control and the specific missing conditions below. This task remains pending until the actual business state changes.','请核对已标出的控件和下方具体条件。只有实际业务状态变化后，此任务才会更新。'),remedy:remedyFor(task)});return;
  }
  const driverFactory=await loadDriver();if(!valid())return;dismissNotice();document.body.classList.add('guide-spotlight');
  const steps=[{element:submit||element,popover:{title:task.title,description:task.status==='complete'?tr('This operation is already confirmed. Review the record; no approval or payment is repeated.','此操作已经确认完成。这里仅核对记录，不会重复审批或付款。')+'<br><br>'+task.result:task.purpose+'<br><br>'+task.result}}];
  const fields={
   'approve-valuation':[['[name="acceptProvisional"]','Review the assumptions before approving','审核假设并确认','Read the current report and its provisional-data warnings, then confirm the review before signing the approval. This does not declare a cash distribution.','请阅读本期报告及暂定数据提示，核对假设后勾选确认，再签署估值批准交易。这一步不会宣告现金分配。']],
   'approve-offer':[['[name="acceptProvisional"]','Review the offer assumptions','审核报价假设','Review the evidence and assumptions before confirming independent approval.','请阅读报价的证据与假设，核对后勾选确认，再进行独立审批。']],
   apply:[['[name="stationId"]','Select the station evidence','选择电站证据','Check the station identity and captured date.','请核对电站标识和采集日期。'],['textarea','Explain ownership and collection','说明所有权和收款责任','Equipment stays yours. Explain who collects the household bill and export payments.','设备仍归你所有。请说明业主电费和售电款由谁收取。']],
   offer:[['[name="wf_baselineMethod"]','Review the energy baseline','复核电量基线','Compare historical and recent periods before choosing the seasonal forecast basis.','请先比较历史与近期期间，再选择季节性预测依据。'],['[name="wf_gridTariffLocal"]','Check electricity prices and savings','核对电价和电费优惠','Grid reference price, household discount and export tariff are separate assumptions.','电网参考价、业主折扣和上网电价是不同假设，请分别核对。'],['[name="wf_discount"]','Check discounting and FX','核对折现与汇率','The discount rate values dated cashflows; it is not a guaranteed investor return.','折现率用于计算各期现金流现值，不是保证投资收益。'],['.wf-costs','Review expense responsibility','核对费用承担方','Only agreed revenue-paid costs are deductible. Inspect each payer and schedule.','仅扣除约定由收益承担的费用，请逐项核对承担方和发生时间。'],['[name="priceUSDC6"]','Compare model value and agreed price','比较模型估值与协议价格','A blank price uses the model value. Saving submits the quote for independent approval.','留空时采用模型估值。保存报价后须经独立审批。']],
   'prepare-reassessment':[['[name="wf_baselineReviewNote"]','Explain the evidence change','说明证据变化','Record the discrepancy and basis. Owner and trustee consent remain separate.','请记录差异及依据，业主和受托人的确认仍分别进行。']],
   subscribe:[['[name="amountUSDC6"]','Choose an affordable amount','填写可负担的金额','Your wallet balance is available cash. Approval is followed by the separate escrow payment.','钱包余额是可用现金。授权之后还须完成单独的托管付款。']]
  };
  for(const [selector,en,zh,descriptionEn,descriptionZh] of [...(task.status==='complete'?[]:fields[task.action]||[])].reverse()){
   const field=element.querySelector(selector);if(field){for(let parent=field;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;steps.unshift({element:field,popover:{title:tr(en,zh),description:tr(descriptionEn,descriptionZh)}});}
  }
  if(task.status!=='complete'&&['accept','subscribe'].includes(task.action)){
   const kind=task.action==='accept'?'owner':'investor';
   const timeline=document.querySelector(`[data-period-timeline="${kind}"] .pt-tools`);
   if(timeline)steps.unshift({element:timeline,popover:{title:tr('Read each cashflow period','查看每一期现金流'),description:task.action==='accept'?tr('Move left to right through generation, exports, self-use, your discounted payment and present value. Compare your bill with buying the same energy from the grid.','请从左到右查看发电、售电、自用、电费优惠和现值，并比较这些电量全部从电网购买时的费用。'):tr('Compare monthly collection, expenses and scheduled payouts. The initial subscription is an outflow, and terminal cash is counted once.','请比较各期回款、费用和按期分配。期初认购是支出，到期剩余现金只计入一次。')}});
  }
  if(task.readOnly){const next=document.querySelector('[data-investor-next-step]');if(next)steps.push({element:next,popover:{title:tr('Who acts next and where','下一步由谁处理、在哪里处理'),description:task.result}});}
  focus=$('#guide-panel [data-guide-locate]')||document.activeElement;
  driver=driverFactory({animate:!matchMedia('(prefers-reduced-motion: reduce)').matches,allowClose:true,overlayClickBehavior:'close',showProgress:true,progressText:'{{current}} / {{total}}',nextBtnText:tr('Read next tip','查看下一提示'),prevBtnText:tr('Previous tip','上一提示'),doneBtnText:tr('Return to task','返回任务'),showButtons:['next','previous','close'],steps,onDestroyed:()=>{document.body.classList.remove('guide-spotlight');driver=null;(focus?.isConnected?focus:$('#guide-launch'))?.focus?.();}});driver.drive(Math.min(index,steps.length-1));
 }catch(error){if(valid())showNotice(task,{title:tr('This operation could not be highlighted','暂时无法高亮此操作'),reason:error.message,remedy:task?remedyFor(task):null});}finally{if(token===locateVersion)locating=false;}
}
function operation(event){if(!context)return;locateVersion++;locating=false;dismissNotice();if(event.stage==='done'){prefs.selected='';prefs.selectedExplicit=false;prefs.reviewComplete=false;save();}clearHighlight();dismissIntro();busy=event.stage==='done'?null:event;render();hookPolling();if(event.stage==='done'&&event.action==='distribute'&&prefs.open&&!prefs.paused){const task=current();if(task?.handoff)showNotice(task,{title:tr('Distribution confirmed · investor handoff','分配已确认，请交接投资者'),reason:tr('The distribution is confirmed. Open investor holdings to inspect the amount and claim any available cash; the next NAV update does not block claiming.','分配交易已确认。请通过下方入口打开投资者持仓，核对金额并领取可用余额。后续净值更新不会阻止领取。'),retry:false});}}
window.addEventListener('revenue-wallet-invalidated',clear);
window.addEventListener('revenue-guide-invalidated',clear);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')clearHighlight();});
async function openNextOperation(){
 const claim=model.find(t=>t.action==='claim'&&t.role===context?.role&&t.status==='ready');
 const next=claim||context?.product?.operations?.next;if(!next)return;
 const task=model.find(t=>t.action===next.action&&t.status!=='complete'&&(!next.period||Number(t.period)===Number(next.period))&&(!next.entity||t.entity===next.entity));
 if(!task){showNotice(current(),{title:tr('Read the current operating task','查看当前运营任务'),reason:tr('Refresh the latest state to locate the current handling step.','请刷新最新状态，以定位当前处理步骤。'),remedy:remedyFor(current())});return;}
 if(task.role!==context.role){showNotice(task,{title:tr('Continue with the handling participant','请交由对应参与者继续'),reason:tr(`The next step is handled by ${assigneeLabel(task)}. Open their workspace below; their wallet must sign in independently.`,`下一步由${assigneeLabel(task)}处理。请点击下方入口打开工作台，仍须该角色的钱包独立登录。`),remedy:task,retry:false});return;}
 prefs.selected=task.id;prefs.selectedExplicit=true;save();render();await locate();
}
document.addEventListener('click',event=>{if(event.target.closest('[data-guide-investor-handoff]')&&!event.target.closest('[data-guide-ui]')){event.preventDefault();investorHandoff();return;}if(event.target.closest('[data-guide-next-operation]')){event.preventDefault();openNextOperation();}});
window.RevenueGuide={update,clear,operation,model:()=>model,isProcessing:()=>!!busy&&busy.stage!=='failed'};
})();
