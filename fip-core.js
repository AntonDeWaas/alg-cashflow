(function(global){
'use strict';
const VERSION='6.5.8';

function load(src){
  return new Promise((resolve,reject)=>{
    const key=src+'@'+VERSION;
    if(document.querySelector(`script[data-fip="${key}"]`))return resolve();
    const separator=src.includes('?')?'&':'?';
    const s=document.createElement('script');
    s.src=src+separator+'fip='+encodeURIComponent(VERSION);
    s.dataset.fip=key;
    s.onload=resolve;
    s.onerror=()=>reject(new Error('Could not load '+src+' for FIP '+VERSION));
    document.head.appendChild(s);
  });
}
function esc(v){return global.FIP_COMPONENTS.esc(v)}
function rowsForConfig(cfg){
  return {
    entity:cfg.entities.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.label)}</td><td>${esc(x.country)}</td><td>${esc(x.currency)}</td><td>${x.active?'Active':'Inactive'}</td></tr>`).join(''),
    division:Object.entries(cfg.divisions).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v.join(', '))}</td></tr>`).join(''),
    country:Object.entries(cfg.countries).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v.join(', '))}</td></tr>`).join(''),
    fx:Object.entries(cfg.fx).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join(''),
    threshold:Object.entries(cfg.thresholds).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
  };
}
function rulesPane(){
  const rules=[
    global.FIP_RULES.explain('DIVISION','MCWP'),
    global.FIP_RULES.explain('DIVISION','PA'),
    global.FIP_RULES.explain('COUNTRY','ALPS'),
    global.FIP_RULES.explain('FX','OMR'),
    global.FIP_RULES.explain('COLLECTION',95),
    global.FIP_RULES.explain('RECONCILIATION',0)
  ];
  return `<div class="fip-rule-grid">${rules.map(global.FIP_COMPONENTS.ruleCard).join('')}</div>
    <div class="fip-rule-tester">
      <h4>Test a Business Rule</h4>
      <div>
        <select data-rule-type>
          <option value="DIVISION">Division classification</option>
          <option value="COUNTRY">Entity country</option>
          <option value="FX">FX rate</option>
          <option value="CORE">Core operations</option>
          <option value="COLLECTION">Collection status</option>
          <option value="RECONCILIATION">Reconciliation status</option>
        </select>
        <input data-rule-input placeholder="Enter MCWP, ALPS, OMR, 95, etc.">
        <button data-rule-run>Evaluate</button>
      </div>
      <pre data-rule-output>Choose a rule and enter a value.</pre>
    </div>`;
}
function healthPane(){
  const checks=global.FIP_RULES.diagnostics();
  const issues=global.FIP_RULES.validateConfiguration();
  return `<div class="fip-health-summary">
      ${global.FIP_COMPONENTS.kpi({label:'Rules Passed',value:String(checks.filter(x=>x.ok).length),meta:`of ${checks.length}`,status:checks.every(x=>x.ok)?'green':'amber'})}
      ${global.FIP_COMPONENTS.kpi({label:'Configuration Issues',value:String(issues.length),meta:issues.length?'Review required':'Configuration healthy',status:issues.length?'red':'green'})}
      ${global.FIP_COMPONENTS.kpi({label:'Rules Engine',value:'6.2.0',meta:'Central business logic',status:'green'})}
    </div>
    <h3>Business Rules Diagnostics</h3>
    <table><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead>
    <tbody>${checks.map(global.FIP_COMPONENTS.healthRow.bind(global.FIP_COMPONENTS)).join('')}</tbody></table>
    <h3 style="margin-top:18px">Configuration Exceptions</h3>
    ${issues.length?issues.map(x=>global.FIP_COMPONENTS.alert({severity:x.severity,title:x.area,message:x.message})).join(''):
      global.FIP_COMPONENTS.alert({severity:'green',title:'Configuration Healthy',message:'All required mappings and rates are available.'})}`;
}
function renderManager(){
  const overlay=document.createElement('div');overlay.className='fip-manager-overlay';
  const cfg=global.FIP_CONFIG.data,status=global.FIP_CONFIG.status,r=rowsForConfig(cfg);
  const sourceStatus=status.error?'error':status.source;
  overlay.innerHTML=`<div class="fip-manager">
    <header><div><h2>Al Laith Finance Intelligence Platform</h2><p>FIP 6.5.8 · Cash Flow Focus & Aging Colour Alignment</p></div><button data-close>×</button></header>
    <div class="fip-manager-toolbar">
      <div><strong>Configuration:</strong> ${global.FIP_COMPONENTS.statusBadge(sourceStatus)}
        <strong>Rules:</strong> ${global.FIP_COMPONENTS.statusBadge('loaded')}
        <span>${status.loadedAt?new Date(status.loadedAt).toLocaleString():''}</span></div>
      <div><button data-refresh>Refresh Configuration</button><button data-nav>Arrange Navigation</button><button data-diagnostics>Quick Diagnostics</button></div>
    </div>
    ${status.error?`<div class="fip-manager-error">${esc(status.error)}</div>`:''}
    <div class="fip-manager-tabs">
      <button class="active" data-tab="rules">Business Rules</button>
      <button data-tab="health">Platform Health</button>
      <button data-tab="entities">Entities</button>
      <button data-tab="countries">Countries</button>
      <button data-tab="divisions">Divisions</button>
      <button data-tab="fx">FX Rates</button>
      <button data-tab="thresholds">Thresholds</button>
    </div>
    <div class="fip-manager-content">
      <section data-pane="rules">${rulesPane()}</section>
      <section data-pane="health" hidden>${healthPane()}</section>
      <section data-pane="entities" hidden><h3>Entities</h3><table><thead><tr><th>ID</th><th>Label</th><th>Country</th><th>Currency</th><th>Status</th></tr></thead><tbody>${r.entity}</tbody></table></section>
      <section data-pane="countries" hidden><h3>Country Mapping</h3><table><thead><tr><th>Country</th><th>Entities</th></tr></thead><tbody>${r.country}</tbody></table></section>
      <section data-pane="divisions" hidden><h3>Division Mapping</h3><table><thead><tr><th>Business Classification</th><th>Profit Centre Codes</th></tr></thead><tbody>${r.division}</tbody></table></section>
      <section data-pane="fx" hidden><h3>FX Rates</h3><table><thead><tr><th>Currency</th><th>AED Rate</th></tr></thead><tbody>${r.fx}</tbody></table></section>
      <section data-pane="thresholds" hidden><h3>KPI Thresholds</h3><table><thead><tr><th>Rule</th><th>Value</th></tr></thead><tbody>${r.threshold}</tbody></table></section>
    </div>
    <footer><span>FIP 6.2 centralizes classification, country, FX, status, reconciliation and movement rules. Existing finance modules remain unchanged until controlled migration.</span></footer>
  </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  overlay.querySelector('[data-refresh]').onclick=async()=>{
    const b=overlay.querySelector('[data-refresh]');b.disabled=true;b.textContent='Refreshing…';
    await global.FIP_CONFIG.load();overlay.remove();renderManager();
  };
  overlay.querySelector('[data-nav]').onclick=()=>global.FIP_NAVIGATION.open();
  overlay.querySelector('[data-diagnostics]').onclick=()=>{
    const failed=global.FIP_RULES.diagnostics().filter(x=>!x.ok);
    alert(failed.length
      ? failed.map(x=>`${x.name}: expected ${x.expected}, received ${x.actual}`).join('\n')
      : 'All FIP 6.2 business rules diagnostics passed.');
  };
  overlay.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
    overlay.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));
    overlay.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==b.dataset.tab);
  });
  const run=overlay.querySelector('[data-rule-run]');
  if(run)run.onclick=()=>{
    const type=overlay.querySelector('[data-rule-type]').value;
    const raw=overlay.querySelector('[data-rule-input]').value;
    const input=['COLLECTION','RECONCILIATION'].includes(type)?Number(raw):raw;
    const result=global.FIP_RULES.explain(type,input);
    overlay.querySelector('[data-rule-output]').textContent=JSON.stringify(result,null,2);
  };
}
function managerButton(){
  let b=document.getElementById('fipManagerButton');
  if(!b){b=document.createElement('button');b.id='fipManagerButton';b.type='button';document.body.appendChild(b)}
  b.innerHTML='<span>FIP</span><small>6.5.8</small>';b.title='Open FIP 6.5.8';b.onclick=renderManager;
}
function styles(){
  if(document.getElementById('fipManagerStyles'))document.getElementById('fipManagerStyles').remove();
  const s=document.createElement('style');s.id='fipManagerStyles';s.textContent=`
#fipManagerButton{position:fixed;right:18px;bottom:18px;z-index:99990;width:58px;height:58px;border-radius:50%;border:0;background:#153a66;color:#fff;box-shadow:0 10px 28px rgba(18,48,84,.32);font-weight:900;cursor:pointer;display:grid;place-content:center}
#fipManagerButton span{font-size:1rem;line-height:1}#fipManagerButton small{font-size:.62rem;opacity:.8;margin-top:2px}
.fip-manager-overlay{position:fixed;inset:0;z-index:100001;background:rgba(8,18,32,.58);display:grid;place-items:center;padding:18px}
.fip-manager{width:min(1120px,97vw);height:min(800px,94vh);background:#f8f6f1;border-radius:15px;box-shadow:0 34px 90px rgba(0,0,0,.3);display:grid;grid-template-rows:auto auto auto 1fr auto;overflow:hidden}
.fip-manager>header{background:#fff;border-bottom:1px solid #e1dbd1;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}.fip-manager h2{margin:0;color:#12365f}.fip-manager header p{margin:4px 0 0;color:#6f7885}.fip-manager header button{font-size:1.8rem;border:0;background:transparent;cursor:pointer;color:#687382}
.fip-manager-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid #e7e1d7}.fip-manager-toolbar>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fip-manager-toolbar button{border:1px solid #cec7bc;background:#fff;border-radius:8px;padding:8px 11px;font-weight:700;cursor:pointer}
.fip-manager-error{background:#fde7e4;color:#a12920;padding:10px 20px;font-weight:700}
.fip-manager-tabs{display:flex;gap:6px;padding:10px 20px;background:#f8f6f1;border-bottom:1px solid #dfd9cf;overflow:auto}.fip-manager-tabs button{border:1px solid #d7d0c5;background:#fff;padding:8px 12px;border-radius:8px;font-weight:700;white-space:nowrap;cursor:pointer}.fip-manager-tabs button.active{background:#153a66;color:#fff;border-color:#153a66}
.fip-manager-content{overflow:auto;padding:18px 20px}.fip-manager-content section{background:#fff;border:1px solid #e0dad0;border-radius:11px;padding:15px}.fip-manager-content h3{margin:0 0 12px;color:#153a66}.fip-manager-content table{width:100%;border-collapse:collapse}.fip-manager-content th{background:#153a66;color:#fff;text-align:left;padding:9px}.fip-manager-content td{padding:8px 9px;border-bottom:1px solid #ece7df}.fip-manager-content tr:nth-child(even){background:#f7fafc}
.fip-manager footer{padding:11px 20px;background:#fff;border-top:1px solid #e1dbd1;color:#697481;font-size:.8rem}
.fip-rule-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fip-rule-tester{margin-top:16px;border-top:1px solid #e5dfd5;padding-top:14px}.fip-rule-tester>div{display:grid;grid-template-columns:1fr 1fr auto;gap:8px}.fip-rule-tester select,.fip-rule-tester input{padding:9px;border:1px solid #d6d0c6;border-radius:7px}.fip-rule-tester button{padding:9px 13px;border:0;border-radius:7px;background:#153a66;color:#fff;font-weight:800}.fip-rule-tester pre{background:#f3f6f9;border-radius:8px;padding:12px;white-space:pre-wrap}
.fip-health-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
@media(max-width:760px){.fip-manager-toolbar{align-items:flex-start;flex-direction:column}.fip-manager{height:96vh}.fip-rule-grid{grid-template-columns:1fr}.fip-rule-tester>div{grid-template-columns:1fr}.fip-health-summary{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}
async function boot(){
  try{
    await load('fip-config.js');
    await load('fip-analytics.js');
    await load('fip-components.js');
    await load('fip-navigation.js');
    await load('fip-rules.js');
    await load('fip-smart-search.js');
    await load('fip-presentation.js');

    global.FIP={
      version:VERSION,
      config:global.FIP_CONFIG,
      analytics:global.FIP_ANALYTICS,
      components:global.FIP_COMPONENTS,
      navigation:global.FIP_NAVIGATION,
      rules:global.FIP_RULES,
      smartSearch:global.FIP_SMART_SEARCH,
      open:renderManager
    };
    styles();managerButton();
    const nav=global.FIP_CONFIG.navigation();
    if(nav.length&&!localStorage.getItem('alg-fip-navigation-v6.2')){
      global.FIP_NAVIGATION.apply(nav.map(x=>x.id));
    }

    global.dispatchEvent(new CustomEvent('fip:ready',{detail:global.FIP}));
    console.info('Al Laith Finance Intelligence Platform',VERSION,'ready');
  }catch(err){
    console.error('FIP '+VERSION+' boot failed',err);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
