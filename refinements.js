'use strict';

function readPrefs() {
  try { return JSON.parse(localStorage.getItem('ct-preferences-v1')) || {}; } catch { return {}; }
}
const prefs = readPrefs();
prefs.favorites = Array.isArray(prefs.favorites) ? prefs.favorites : [];
prefs.archived = Array.isArray(prefs.archived) ? prefs.archived : [];
prefs.order = Array.isArray(prefs.order) ? prefs.order : [];
Object.assign(routeVariants, prefs.variants || {});
Object.entries(routeVariants).forEach(([id, key]) => { if (!getType(id)?.variants?.[key]) delete routeVariants[id]; });
function savePrefs() { prefs.variants = {...routeVariants}; localStorage.setItem('ct-preferences-v1', JSON.stringify(prefs)); }
function node(tag, text, cls) { const el = document.createElement(tag); if(text != null) el.textContent=text; if(cls) el.className=cls; return el; }
function button(text, action, cls='btn btn-ghost btn-sm') { const el=node('button',text,cls); el.type='button'; el.onclick=action; return el; }
function notice(text) { const el=document.getElementById('notice'); el.textContent=text; clearTimeout(notice.timer); notice.timer=setTimeout(()=>el.textContent='',6000); }
function orderedRoutes() { return Object.entries(allTypes()).sort(([a],[b]) => { const rank=id=>prefs.order.includes(id)?prefs.order.indexOf(id):999; return rank(a)-rank(b); }); }

// Route cards use native buttons and retain their mode between visits.
function routeCard(id, td) {
  const wrap=node('div',null,'route-option');
  const start=button('',()=>selectType(id),'trip-card route-start');
  start.append(node('span',td.icon), node('span',td.name,'trip-card-name'), node('span','Start trip →','trip-card-desc'));
  wrap.append(start);
  if(td.variants) {
    const sel=node('select',null,'form-input'); sel.setAttribute('aria-label',td.name+' travel mode');
    Object.entries(td.variants).forEach(([key,v])=>sel.add(new Option(v.label,key)));
    sel.value=routeVariants[id]||td.defaultVariant;
    sel.onchange=()=>{routeVariants[id]=sel.value;savePrefs();}; wrap.append(sel);
  }
  return wrap;
}
renderTripGrid = function() {
  const root=document.getElementById('step-choose'); root.replaceChildren();
  const visible=orderedRoutes().filter(([id])=>!prefs.archived.includes(id));
  const suggested=new Date().getHours()<12?'commute-am':'commute-pm';
  const ids=[...new Set([...prefs.favorites,suggested,...trips.map(t=>t.type),'commute-am','commute-pm'])].filter(id=>visible.some(([key])=>key===id)).slice(0,4);
  root.append(node('h2','Quick start','quick-heading'),node('p','Your favorites and recent routes, ready to go.','muted'));
  const quick=node('div',null,'grid-2'); quick.style.margin='14px 0 24px';
  ids.forEach(id=>quick.append(routeCard(id,getType(id)))); root.append(quick);
  const details=node('details',null,'route-group'); details.append(node('summary','All routes'));
  const grid=node('div',null,'grid-2'); visible.forEach(([id,td])=>grid.append(routeCard(id,td))); details.append(grid);root.append(details);
  const actions=node('div',null,'toolbar'); actions.append(button('+ Add route',()=>openRouteEditor()),button('Manage routes',()=>switchTab('settings')));root.append(actions);
};
const originalSelectType=selectType;
selectType=function(type) { if(activeTrip){switchTab('log');showActiveTrip();return;} originalSelectType(type);refreshAccessibility(); };

const originalRenderActive=renderActiveCPs;
renderActiveCPs=function(){
  originalRenderActive();
  document.querySelectorAll('#cp-list .cp-btn').forEach(el=>el.remove());
  document.querySelectorAll('#cp-list .cp-row').forEach((row,i)=>{
    row.querySelector('.cp-time-edit').setAttribute('aria-label','Edit time for '+activeTrip.checkpoints[i].name);
    row.querySelectorAll('.cp-undo,.cp-skip').forEach(el=>el.setAttribute('aria-label',el.textContent+' '+activeTrip.checkpoints[i].name));
  });
  document.getElementById('end-early').disabled=!activeTrip.checkpoints.some(cp=>cp.time);
  refreshAccessibility();
};
const originalLogCP=logCP;
logCP=function(i){ if(!activeTrip || i!==activeTrip.checkpoints.findIndex(cp=>!cp.time&&!cp.skipped)) return; originalLogCP(i); };
const originalApplyTime=applyActiveCPTime;
applyActiveCPTime=function(i){
  const date=document.getElementById('active-cp-date-'+i).value;
  const time=document.getElementById('active-cp-time-'+i).value;
  if(!date||!time)return;
  const value=localDateTimeValue(date+'T'+time);
  const before=activeTrip.checkpoints.slice(0,i).filter(c=>c.time).at(-1);
  const after=activeTrip.checkpoints.slice(i+1).find(c=>c.time);
  if((before&&value<localDateTimeValue(before.time))||(after&&value>localDateTimeValue(after.time))){notice('Choose a time between the previous and next recorded checkpoints.');return;}
  originalApplyTime(i);
};

// Plan only with matching, recent, complete trips. No external schedule API needed.
function usableTrips(id, variant) {
  return trips.filter(t=>t.type===id&&!t.inProgress&&!t.incomplete&&!t.excluded&&(!variant||(t.variantKey||getType(id)?.defaultVariant)===variant));
}
function estimateSamples(list, from, to) {
  return list.flatMap(t=>{
    const a=t.checkpoints.find(c=>c.name===from), b=t.checkpoints.find(c=>c.name===to);
    const duration=a?.time&&b?.time?localDateTimeValue(b.time)-localDateTimeValue(a.time):NaN;
    return Number.isFinite(duration)&&duration>=0?[{duration,date:t.startedAt}]:[];
  });
}
function refreshPlanMode(){
  const id=document.getElementById('plan-type').value,td=getType(id),select=document.getElementById('plan-mode');select.replaceChildren();
  Object.entries(td?.variants||{default:{label:'Default'}}).forEach(([key,v])=>select.add(new Option(v.label,key)));
  select.value=routeVariants[id]||td?.defaultVariant||'default';select.closest('.suggest-field').hidden=!td?.variants;
}
renderPlanTab=function(){
  const select=document.getElementById('plan-type'),previous=select.value;select.replaceChildren();
  orderedRoutes().filter(([id])=>!prefs.archived.includes(id)).forEach(([id,td])=>select.add(new Option(td.icon+' '+td.name,id)));
  if([...select.options].some(o=>o.value===previous))select.value=previous;
  if(!document.getElementById('plan-arrive').value)document.getElementById('plan-arrive').value=PLAN_DEFAULT_ARRIVE[select.value]||defaultPlanTime();
  refreshPlanMode();renderPlan();
};
handlePlanTypeChange=function(){refreshPlanMode();renderPlan();};
renderPlan=function(){
  const id=document.getElementById('plan-type').value,td=getType(id); if(!td){document.getElementById('plan-result').textContent='Restore a route in Settings to start planning.';document.getElementById('plan-segments').replaceChildren();return;}
  const mode=td.variants?(routeVariants[id]||td.defaultVariant):null;
  const cps=td.variants?td.variants[mode].cps:td.cps;
  const train=(id==='commute-am'||id==='commute-pm')&&mode==='transit';
  const target=train?(id==='commute-am'?'Arrived at station':'Boarded train'):cps.at(-1);
  document.getElementById('plan-time-label').textContent=train?(id==='commute-am'?'Train departs at':'Board train by'):(td.dir==='dep'?'Flight departs at':'Arrive by');
  const rawTime=document.getElementById('plan-arrive').value; if(!rawTime)return;
  const date=document.getElementById('plan-date').value||localDateString(localDateTimeNow());
  const targetValue=localDateTimeValue(date+'T'+rawTime);
  const bufferInput=document.getElementById('plan-buffer');const buffer=Math.min(120,Math.max(0,Number(bufferInput.value)||0));bufferInput.value=buffer;
  const days=Number(document.getElementById('plan-window').value);
  const cutoff=localDateTimeValue(localDateTimeNow())-days*86400000;
  const list=usableTrips(id,mode).filter(t=>!days||localDateTimeValue(t.startedAt)>=cutoff);
  const samples=estimateSamples(list,cps[0],target),stats=durationStats(samples.map(s=>s.duration));
  const result=document.getElementById('plan-result');result.replaceChildren();document.getElementById('plan-segments').replaceChildren();
  if(!stats){result.append(node('p','Log a trip with both '+cps[0]+' and '+target+' to build an estimate.','muted'),button('Log this route',()=>{switchTab('log');selectType(id);}));return;}
  const metrics=node('div',null,'metric-grid');
  [['Typical',stats.med],['Safer · p90',stats.p90]].forEach(([label,duration])=>{
    const leave=localDateTimeFromFloatingValue(targetValue-duration-buffer*60000),box=node('div',label,'metric');
    box.append(node('strong',fmtTime(leave)),node('span',localDateString(leave)!==date?fmtDate(leave):'Leave by','muted'));metrics.append(box);
  });result.append(metrics);
  const latest=samples.map(s=>s.date).sort().at(-1);
  result.append(node('p',`${stats.n} matching trip${stats.n===1?'':'s'} · latest ${fmtDate(latest)} · ${buffer} min buffer. ${stats.n<5?'Early estimate: limited data.':stats.n<10?'Building confidence: fewer than 10 samples.':'Based on your observed travel times.'}`,'muted'));
  result.append(node('p','Safer uses the 90th percentile of recorded durations; it is not a guarantee.','muted'));
  if(td.dir==='dep')result.append(node('p','Historical flight delays are included. Check airline check-in and boarding deadlines separately.','muted'));
  const rows=[];for(let i=0;i<cps.length-1;i++){const s=durationStats(estimateSamples(list,cps[i],cps[i+1]).map(x=>x.duration));if(s)rows.push({label:cps[i]+' → '+cps[i+1],s});}
  renderSafeBreakdown(rows,document.getElementById('plan-segments'));
};
function renderSafeBreakdown(rows,root){
  root.replaceChildren();if(!rows.length)return;
  const card=node('div',null,'insight-card');const max=Math.max(...rows.map(r=>r.s.med),1);
  rows.forEach(({label,s})=>{const row=node('div',null,'seg-row'),bar=node('div',null,'seg-bar-bg'),fill=node('div',null,'seg-bar');fill.style.width=s.med/max*100+'%';bar.append(fill);row.append(node('div',label,'seg-label'),bar,node('span',fmtDur(s.med),'seg-med'),node('span',s.n+' sample'+(s.n===1?'':'s'),'seg-range'));card.append(row);});root.append(card);
}
renderInsights=function(){
  const root=document.getElementById('insights-body');root.replaceChildren();
  document.getElementById('insights-filter-panel').hidden=!trips.some(t=>!t.inProgress);
  renderFilterPanel('insights-filter-panel','renderInsights');
  let count=0;
  orderedRoutes().forEach(([id,td])=>Object.entries(td.variants||{default:{label:'',cps:td.cps}}).forEach(([key,v])=>{
    const list=applyTimeFilters(usableTrips(id,td.variants?key:null));
    const stats=durationStats(estimateSamples(list,v.cps[0],v.cps.at(-1)).map(s=>s.duration));if(!stats)return;count++;
    const card=node('div',null,'insight-card');card.append(node('h2',td.name+(v.label?' · '+v.label:''),'insight-title'),node('p',`${stats.n} complete sample${stats.n===1?'':'s'} · typical ${fmtDur(stats.med)} · p90 ${fmtDur(stats.p90)}`,'muted'));
    const breakdown=node('div');const rows=[];for(let i=0;i<v.cps.length-1;i++){const s=durationStats(estimateSamples(list,v.cps[i],v.cps[i+1]).map(x=>x.duration));if(s)rows.push({label:v.cps[i]+' → '+v.cps[i+1],s});}renderSafeBreakdown(rows,breakdown);card.append(breakdown);root.append(card);
  }));
  if(!count){const empty=node('div',hasActiveTimeFilter()?'No usable trips match these filters.':'Log your first trip to discover typical travel times. Estimates improve as you record more trips.','empty');empty.append(node('br'),button('Log a trip',()=>switchTab('log')));root.append(empty);}
  refreshAccessibility();
};

// Settings keeps backup and route maintenance away from the daily logging flow.
function renderSettings(){
  const root=document.getElementById('settings-routes');root.replaceChildren();
  orderedRoutes().forEach(([id,td],index)=>{
    const row=node('div',null,'manage-row');row.append(node('strong',td.name+(prefs.archived.includes(id)?' · Archived':'')));
    const actions=node('div',null,'route-controls');
    actions.append(button(prefs.favorites.includes(id)?'★ Favorite':'☆ Favorite',()=>{prefs.favorites=prefs.favorites.includes(id)?prefs.favorites.filter(x=>x!==id):[...prefs.favorites,id];savePrefs();renderSettings();}),button('Edit',()=>openRouteEditor(id)),button('Duplicate',()=>openRouteEditor(id,true)),button(prefs.archived.includes(id)?'Restore':'Archive',()=>{prefs.archived=prefs.archived.includes(id)?prefs.archived.filter(x=>x!==id):[...prefs.archived,id];savePrefs();renderSettings();}));
    const up=button('↑',()=>{const order=orderedRoutes().map(([key])=>key);[order[index-1],order[index]]=[order[index],order[index-1]];prefs.order=order;savePrefs();renderSettings();});up.disabled=index===0;up.setAttribute('aria-label','Move '+td.name+' up');actions.append(up);row.append(actions);root.append(row);
  });
  document.getElementById('backup-status').textContent=prefs.lastBackup?'Last backup: '+fmtDate(prefs.lastBackup):'Your trips are saved in this browser. Export a backup to protect against cleared browser data.';
}
function openRouteEditor(id=null,duplicate=false){
  const td=id?getType(id):null;
  const modal=document.getElementById('modal-manage'),body=document.getElementById('route-editor');body.replaceChildren();
  const name=node('input',null,'form-input');name.value=td?td.name+(duplicate?' copy':''):'';name.placeholder='e.g. Home → Office';name.setAttribute('aria-label','Route name');body.append(node('label','Route name','form-label'),name);
  const groups=node('div');body.append(groups);
  const variants=td?.variants||{default:{label:'',cps:td?.cps||['Left home','Arrived at destination']}};
  const editors=[];
  Object.entries(variants).forEach(([key,v])=>{
    const section=node('div');if(v.label)section.append(node('h3',v.label));const list=node('div');section.append(list);
    function add(name='',optional=false){
      const row=node('div',null,'checkpoint-editor'),input=node('input',null,'form-input');input.value=name;input.setAttribute('aria-label','Checkpoint name');
      const up=button('↑',()=>{if(row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);});up.setAttribute('aria-label','Move checkpoint up');
      const down=button('↓',()=>{if(row.nextElementSibling)list.insertBefore(row.nextElementSibling,row);});down.setAttribute('aria-label','Move checkpoint down');
      const remove=button('×',()=>row.remove());remove.setAttribute('aria-label','Remove checkpoint');
      const label=node('label'),check=node('input');check.type='checkbox';check.checked=optional;label.append(check,document.createTextNode(' Optional checkpoint'));row.append(input,up,down,remove,label);list.append(row);
    }
    v.cps.forEach((cp,i)=>add(cp,(v.optional||td?.optional||[]).includes(i)||!!td?.skippable?.has?.(i)));
    section.append(button('+ Checkpoint',()=>add()));groups.append(section);editors.push({key,v,list});
  });
  body.append(node('p','Changes apply to new trips. Recorded checkpoints are preserved. First and last checkpoints are required.','muted'));
  body.append(button('Save route',()=>{
    if(!name.value.trim()){notice('Enter a route name.');return;}
    const collected=editors.map(({key,v,list})=>({key,label:v.label,cps:[...list.children].map(row=>row.querySelector('input').value.trim()),optional:[...list.children].flatMap((row,i)=>row.querySelector('[type=checkbox]').checked?[i]:[])}));
    if(collected.some(v=>v.cps.length<2||v.cps.some(cp=>!cp)||new Set(v.cps).size!==v.cps.length)){notice('Use at least two distinct, nonempty checkpoint names per mode.');return;}
    const route={...(td||{icon:'🗺️',group:'custom'}),name:name.value.trim()};delete route.skippable;
    collected.forEach(v=>v.optional=v.optional.filter(i=>i>0&&i<v.cps.length-1));
    if(td?.variants)route.variants=Object.fromEntries(collected.map(v=>[v.key,{label:v.label,cps:v.cps,optional:v.optional}]));else Object.assign(route,{cps:collected[0].cps,optional:collected[0].optional});
    customRoutes[id&&!duplicate?id:'custom-'+Date.now()]=route;persist();closeModal('modal-manage');renderSettings();renderTripGrid();notice('Route saved.');
  },'btn btn-primary'));
  modal.classList.add('open');activateDialog(modal);
}
const originalStart=startTrip;
startTrip=function(){originalStart();if(activeTrip){const td=getType(activeTrip.type),v=td.variants?.[activeTrip.variantKey];activeTrip.optional=v?.optional||td.optional||[...(td.skippable||[])];syncActiveTrip();}};
const originalSkip=skipCP;
skipCP=function(i){if(i===0||i===activeTrip.checkpoints.length-1)return;originalSkip(i);};
const originalAction=renderActiveAction;
renderActiveAction=function(){
  originalAction();if(!activeTrip)return;
  const i=activeTrip.checkpoints.findIndex(c=>!c.time&&!c.skipped);
  if(i>0&&i<activeTrip.checkpoints.length-1&&(activeTrip.optional||getType(activeTrip.type)?.optional||[]).includes(i))document.querySelector('.active-action').append(button('Skip optional checkpoint',()=>skipCP(i)));
};

const originalHistoryItem=buildHistItem;
buildHistItem=function(trip,td){
  const item=originalHistoryItem(trip,td),row=item.querySelector('.hist-row');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-expanded',expandedTrips.has(trip.id));row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleTrip(trip.id);}};
  if(trip.incomplete||trip.excluded)row.querySelector('.hist-sub').append(document.createTextNode(trip.incomplete?' · Ended early':' · Excluded from estimates'));
  const footer=item.querySelector('.hist-detail-footer');if(!trip.inProgress)footer.append(button(trip.excluded?'Include in estimates':'Exclude from estimates',()=>{trip.excluded=!trip.excluded;persist();renderHistory();}));
  const tags=node('div',null,'hist-detail-footer');tags.setAttribute('aria-label','Trip context');
  ['Traffic','Weather','Train delay','Checked bag'].forEach(tag=>{const selected=Array.isArray(trip.tags)&&trip.tags.includes(tag);const b=button(tag,()=>{trip.tags=selected?trip.tags.filter(t=>t!==tag):[...(trip.tags||[]),tag];persist();renderHistory();},'filter-chip'+(selected?' active':''));b.setAttribute('aria-pressed',String(selected));tags.append(b);});item.querySelector('.hist-detail').append(tags);
  return item;
};
const originalHistory=renderHistory;
renderHistory=function(){originalHistory();if(!trips.length){const root=document.getElementById('history-body');root.replaceChildren(node('p','Your completed trips will appear here.','empty'));root.append(button('Log your first trip',()=>switchTab('log')));}refreshAccessibility();};
exportData=function(){
  const blob=new Blob([JSON.stringify({version:4,trips,customRoutes,preferences:prefs,exportedAt:localDateTimeNow()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='commute-tracker-'+localDateString(localDateTimeNow())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  prefs.lastBackup=localDateTimeNow();savePrefs();renderSettings();notice('Backup downloaded.');
};
importData=async function(event){
  const file=event.target.files[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text()),incoming=Array.isArray(data)?data:data.trips,routes=data.customRoutes||{};
    if(!Array.isArray(incoming)||!routes||Array.isArray(routes)||typeof routes!=='object')throw Error('Invalid format');
    const validNames=cps=>Array.isArray(cps)&&cps.length>=2&&cps.every(cp=>typeof cp==='string');
    for(const [id,r] of Object.entries(routes)){
      if(!/^[a-zA-Z0-9_-]+$/.test(id)||['__proto__','constructor','prototype'].includes(id)||typeof r?.name!=='string'||typeof r?.icon!=='string')throw Error('Invalid route');
      if(r.variants){if(!r.variants[r.defaultVariant]||!Object.values(r.variants).every(v=>typeof v.label==='string'&&validNames(v.cps)))throw Error('Invalid modes');}
      else if(!validNames(r.cps))throw Error('Invalid checkpoints');
    }
    if(!incoming.every(t=>Number.isSafeInteger(t?.id)&&typeof t.type==='string'&&(getType(t.type)||routes[t.type])&&isLocalDateTime(localDateTimeFromValue(t.startedAt))&&Array.isArray(t.checkpoints)&&t.checkpoints.length>=2&&t.checkpoints.every(c=>typeof c.name==='string'&&(c.time==null||isLocalDateTime(localDateTimeFromValue(c.time))))))throw Error('Invalid trips');
    // Validate everything before modifying local data; preserve existing routes and IDs.
    const newRoutes={...routes,...customRoutes};const ids=new Set(trips.map(t=>t.id));const added=[];
    incoming.forEach(t=>{if(!ids.has(t.id)){ids.add(t.id);added.push(normalizeLegacyTrip({...t,inProgress:false,incomplete:!!t.incomplete||!!t.inProgress}));}});
    customRoutes=newRoutes;trips=[...trips,...added].sort((a,b)=>localDateTimeValue(b.startedAt)-localDateTimeValue(a.startedAt));persist();
    const p=data.preferences;if(p&&typeof p==='object'){for(const key of ['favorites','archived','order'])if(Array.isArray(p[key]))prefs[key]=[...new Set([...prefs[key],...p[key].filter(id=>typeof id==='string'&&getType(id))])];for(const [id,key] of Object.entries(p.variants||{}))if(getType(id)?.variants?.[key])routeVariants[id]=key;savePrefs();}
    renderSettings();renderTripGrid();notice(`Imported ${added.length} trips. Existing trips were kept.`);
  }catch{notice('Could not import this backup. Check its format; existing data was kept.');}
  event.target.value='';
};

renderFilterPanel=function(containerId,callbackName){
  const el=document.getElementById(containerId);el.replaceChildren();const panel=node('div',null,'filter-panel'),open=!!filterPanelOpen[containerId];
  const toggle=button((open?'Hide':'Show')+' filters'+(hasActiveTimeFilter()?' · Active':''),()=>{filterPanelOpen[containerId]=!open;renderFilterPanel(containerId,callbackName);});toggle.setAttribute('aria-expanded',String(open));panel.append(toggle);
  const refresh=()=>window[callbackName]();
  if(open){
    if(containerId==='hist-time-filter-panel'){
      const select=node('select',null,'form-input');select.setAttribute('aria-label','Filter route');select.add(new Option('All routes','all'));orderedRoutes().forEach(([id,td])=>select.add(new Option(td.name,id)));select.value=histFilter;select.onchange=()=>{histFilter=select.value;refresh();};panel.append(select);
    }
    const days=node('div',null,'toolbar');DAY_LABELS.forEach((label,i)=>{const b=button(label,()=>{timeFilters.days.has(i)?timeFilters.days.delete(i):timeFilters.days.add(i);refresh();},'day-chip'+(timeFilters.days.has(i)?' active':''));b.setAttribute('aria-pressed',String(timeFilters.days.has(i)));b.setAttribute('aria-label',['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]);days.append(b);});panel.append(days);
    const times=node('div',null,'toolbar');['timeFrom','timeTo'].forEach((key,i)=>{const label=node('label',i?'End time ':'Start time '),input=node('input',null,'time-input');input.type='time';input.value=timeFilters[key];input.onchange=()=>{timeFilters[key]=input.value;refresh();};label.append(input);times.append(label);});panel.append(times,button('Clear filters',()=>{timeFilters.days.clear();timeFilters.timeFrom='';timeFilters.timeTo='';histFilter='all';refresh();}));
  }el.append(panel);
};

// Keyboard navigation and dialogs.
let lastFocus=null;
function activateDialog(modal){lastFocus=document.activeElement;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const title=modal.querySelector('.modal-title');if(title){title.id=modal.id+'-title';modal.setAttribute('aria-labelledby',title.id);}modal.querySelector('input,button,textarea,select')?.focus();}
const originalCloseModal=closeModal;
closeModal=function(id){originalCloseModal(id);lastFocus?.focus();};
function refreshAccessibility(){
  const active=document.querySelector('.section.active')?.id;
  document.querySelectorAll('.tab').forEach((tab,i)=>{const id=['log','plan','insights','history','settings'][i];tab.setAttribute('role','tab');tab.id='nav-'+id;tab.setAttribute('aria-controls','tab-'+id);tab.setAttribute('aria-selected',active==='tab-'+id);tab.tabIndex=active==='tab-'+id?0:-1;if(i===0)tab.textContent=activeTrip?'Log · Active':'Log trip';});
  document.querySelectorAll('.section').forEach(el=>{el.setAttribute('role','tabpanel');el.setAttribute('aria-labelledby','nav-'+el.id.replace('tab-',''));});
  document.querySelectorAll('.filter-panel-row[onclick]').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};});
  document.querySelectorAll('input[type=time],input[type=date]').forEach(el=>{if(!el.hasAttribute('aria-label')&&!el.labels?.length)el.setAttribute('aria-label',el.id||'Checkpoint time');});
}
switchTab=function(name){
  document.querySelectorAll('.section').forEach(el=>el.classList.toggle('active',el.id==='tab-'+name));
  document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('active',['log','plan','insights','history','settings'][i]===name));
  if(name==='log'){renderTripGrid();if(activeTrip)showActiveTrip();}
  if(name==='plan')renderPlanTab();if(name==='insights')renderInsights();if(name==='history')renderHistory();if(name==='settings')renderSettings();refreshAccessibility();
};
document.addEventListener('keydown',e=>{
  const modal=document.querySelector('.modal-bg.open');
  if(modal){if(e.key==='Escape')closeModal(modal.id);if(e.key==='Tab'){const els=[...modal.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  else if(e.target.matches('.tab')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...document.querySelectorAll('.tab')],i=tabs.indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();}
});
const modalObserver=new MutationObserver(changes=>changes.forEach(({target,oldValue})=>{if(target.classList.contains('open')&&!oldValue?.includes('open'))activateDialog(target);}));
document.querySelectorAll('.modal-bg').forEach(el=>modalObserver.observe(el,{attributes:true,attributeFilter:['class'],attributeOldValue:true}));

function initializeRefinements(){
  const tabs=document.querySelector('.tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Main navigation');tabs.append(button('Settings',()=>switchTab('settings'),'tab'));
  const settings=node('div',null,'section');settings.id='tab-settings';settings.innerHTML='<h2 class="quick-heading">Routes & data</h2><div class="toolbar" id="settings-actions"></div><div id="settings-routes"></div><div class="data-panel"><h2 class="quick-heading">Backup & offline access</h2><p id="backup-status" class="muted"></p><p class="muted">Export regularly. Backups contain your trip times and notes; keep them somewhere private. Data stays on this device unless you export it.</p><div id="data-actions" class="toolbar"></div><p id="offline-status" class="muted">Open this site over HTTPS to enable offline access.</p><p class="muted">To install, use your browser’s Install app or Add to Home Screen option when available.</p></div>';document.querySelector('.container').append(settings);
  document.getElementById('settings-actions').append(button('+ Add route',()=>openRouteEditor()));
  const history=document.getElementById('tab-history');document.getElementById('data-actions').append(history.firstElementChild);document.getElementById('data-actions').append(document.getElementById('import-banner'));
  const modal=node('div',null,'modal-bg');modal.id='modal-manage';modal.innerHTML='<div class="modal"><div class="toolbar"><h2 class="modal-title">Route editor</h2><button class="btn btn-ghost" onclick="closeModal(\'modal-manage\')">Close</button></div><div id="route-editor"></div></div>';document.body.append(modal);modal.onclick=e=>{if(e.target===modal)closeModal(modal.id);};
  const n=node('div');n.id='notice';n.setAttribute('role','status');document.body.append(n);
  const end=button('End early',()=>{if(!activeTrip)return;const reason=prompt('Optional reason for ending early:','');if(reason===null)return;activeTrip.comment=reason||undefined;saveTrip(true);refreshAccessibility();});end.id='end-early';document.querySelector('#step-log .btn-row').append(end);
  const routeField=document.getElementById('plan-type').closest('.suggest-field');
  const fields=node('div');fields.innerHTML='<div class="suggest-field"><label for="plan-mode">Travel mode</label><select id="plan-mode" class="suggest-input"></select></div><div class="suggest-field"><label for="plan-date">Travel date</label><input type="date" id="plan-date" class="suggest-input"></div><div class="suggest-field"><label for="plan-window">Use trips from</label><select id="plan-window" class="suggest-input"><option value="60">Last 60 days</option><option value="180">Last 6 months</option><option value="0">All history</option></select></div>';routeField.after(fields);
  document.getElementById('plan-date').value=localDateString(localDateTimeNow());
  document.getElementById('plan-mode').onchange=e=>{routeVariants[document.getElementById('plan-type').value]=e.target.value;savePrefs();renderPlan();};
  ['plan-date','plan-window'].forEach(id=>document.getElementById(id).onchange=renderPlan);
  ['plan-type','plan-arrive','plan-buffer'].forEach(id=>document.getElementById(id).closest('.suggest-field').querySelector('label').htmlFor=id);
  renderTripGrid();if(activeTrip)showActiveTrip();refreshAccessibility();
  setInterval(()=>{if(activeTrip&&document.getElementById('tab-log').classList.contains('active'))renderActiveAction();},30000);
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{document.getElementById('offline-status').textContent='Offline access is ready on this device.';}).catch(()=>{document.getElementById('offline-status').textContent='Offline setup is unavailable. The app still works while online.';});
}
initializeRefinements();
