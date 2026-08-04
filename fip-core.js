(function(global){
'use strict';
const VERSION='6.1.0';
function load(src){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`script[data-fip="${src}"]`)||global[src.replace(/[-.]/g,'_')])return resolve();
    const s=document.createElement('script');s.src=src;s.dataset.fip=src;
    s.onload=resolve;s.onerror=()=>reject(new Error('Could not load '+src));
    document.head.appendChild(s);
  });
}
function rowsForConfig(cfg){
  const esc=global.FIP_COMPONENTS.esc;
  const entity=cfg.entities.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.label)}</td><td>${esc(x.country)}</td><td>${esc(x.currency)}</td><td>${x.active?'Active':'Inactive'}</td></tr>`).join('');
  const division=Object.entries(cfg.divisions).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v.join(', '))}</td></tr>`).join('');
  const country=Object.entries(cfg.countries).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v.join(', '))}</td></tr>`).join('');
  const fx=Object.entries(cfg.fx).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  const threshold=Object.entries(cfg.thresholds).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  return {entity,division,country,fx,threshold};
}
function renderManager(){
  const overlay=document.createElement('div');overlay.className='fip-manager-overlay';
  const cfg=global.FIP_CONFIG.data,status=global.FIP_CONFIG.status,r=rowsForConfig(cfg);
  const badge=global.FIP_COMPONENTS.statusBadge(status.error?'error':status.source);
  overlay.innerHTML=`<div class="fip-manager">
    <header><div><h2>Al Laith Finance Intelligence Platform</h2><p>FIP 6.1 · Configuration Manager</p></div><button data-close>×</button></header>
    <div class="fip-manager-toolbar">
      <div><strong>Configuration source:</strong> ${badge}<span>${status.loadedAt?new Date(status.loadedAt).toLocaleString():''}</span></div>
      <div><button data-refresh>Refresh Configuration</button><button data-nav>Arrange Navigation</button><button data-diagnostics>Diagnostics</button></div>
    </div>
    ${status.error?`<div class="fip-manager-error">${global.FIP_COMPONENTS.esc(status.error)}</div>`:''}
    <div class="fip-manager-tabs">
      <button class="active" data-tab="entities">Entities</button>
      <button data-tab="countries">Countries</button>
      <button data-tab="divisions">Divisions</button>
      <button data-tab="fx">FX Rates</button>
      <button data-tab="thresholds">Thresholds</button>
    </div>
    <div class="fip-manager-content">
      <section data-pane="entities"><h3>Entities</h3><table><thead><tr><th>ID</th><th>Label</th><th>Country</th><th>Currency</th><th>Status</th></tr></thead><tbody>${r.entity}</tbody></table></section>
      <section data-pane="countries" hidden><h3>Country Mapping</h3><table><thead><tr><th>Country</th><th>Entities</th></tr></thead><tbody>${r.country}</tbody></table></section>
      <section data-pane="divisions" hidden><h3>Division Mapping</h3><table><thead><tr><th>Business Classification</th><th>Profit Centre Codes</th></tr></thead><tbody>${r.division}</tbody></table></section>
      <section data-pane="fx" hidden><h3>FX Rates</h3><table><thead><tr><th>Currency</th><th>AED Rate</th></tr></thead><tbody>${r.fx}</tbody></table></section>
      <section data-pane="thresholds" hidden><h3>KPI Thresholds</h3><table><thead><tr><th>Rule</th><th>Value</th></tr></thead><tbody>${r.threshold}</tbody></table></section>
    </div>
    <footer><span>To change business rules, update the <strong>FIP Configuration</strong> Google Sheet and click Refresh Configuration.</span></footer>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  overlay.querySelector('[data-refresh]').onclick=async()=>{
    const b=overlay.querySelector('[data-refresh]');b.disabled=true;b.textContent='Refreshing…';
    await global.FIP_CONFIG.load();
    overlay.remove();renderManager();
  };
  overlay.querySelector('[data-nav]').onclick=()=>global.FIP_NAVIGATION.open();
  overlay.querySelector('[data-diagnostics]').onclick=()=>{
    const tests=[
      ['FIP version',VERSION],
      ['Config source',global.FIP_CONFIG.status.source],
      ['MCWP classification',global.FIP_CONFIG.division('MCWP')],
      ['PA classification',global.FIP_CONFIG.division('PA')],
      ['UAE entities',global.FIP_CONFIG.countryEntities('UAE').join(', ')],
      ['OMR rate',global.FIP_CONFIG.fx('OMR')]
    ];
    alert(tests.map(x=>x[0]+': '+x[1]).join('\n'));
  };
  overlay.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
    overlay.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));
    overlay.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==b.dataset.tab);
  });
}
function managerButton(){
  if(document.getElementById('fipManagerButton'))return;
  const b=document.createElement('button');b.id='fipManagerButton';b.type='button';
  b.innerHTML='<span>FIP</span><small>6.1</small>';b.title='Open FIP Configuration Manager';
  b.onclick=renderManager;document.body.appendChild(b);
}
function styles(){
  if(document.getElementById('fipManagerStyles'))return;
  const s=document.createElement('style');s.id='fipManagerStyles';s.textContent=`
#fipManagerButton{position:fixed;right:18px;bottom:18px;z-index:99990;width:58px;height:58px;border-radius:50%;border:0;background:#153a66;color:#fff;box-shadow:0 10px 28px rgba(18,48,84,.32);font-weight:900;cursor:pointer;display:grid;place-content:center}
#fipManagerButton span{font-size:1rem;line-height:1}#fipManagerButton small{font-size:.62rem;opacity:.8;margin-top:2px}
.fip-manager-overlay{position:fixed;inset:0;z-index:100001;background:rgba(8,18,32,.58);display:grid;place-items:center;padding:18px}
.fip-manager{width:min(1040px,97vw);height:min(760px,92vh);background:#f8f6f1;border-radius:15px;box-shadow:0 34px 90px rgba(0,0,0,.3);display:grid;grid-template-rows:auto auto auto 1fr auto;overflow:hidden}
.fip-manager>header{background:#fff;border-bottom:1px solid #e1dbd1;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}.fip-manager h2{margin:0;color:#12365f}.fip-manager header p{margin:4px 0 0;color:#6f7885}.fip-manager header button{font-size:1.8rem;border:0;background:transparent;cursor:pointer;color:#687382}
.fip-manager-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid #e7e1d7}.fip-manager-toolbar>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fip-manager-toolbar button{border:1px solid #cec7bc;background:#fff;border-radius:8px;padding:8px 11px;font-weight:700;cursor:pointer}
.fip-manager-error{background:#fde7e4;color:#a12920;padding:10px 20px;font-weight:700}
.fip-manager-tabs{display:flex;gap:6px;padding:10px 20px;background:#f8f6f1;border-bottom:1px solid #dfd9cf;overflow:auto}.fip-manager-tabs button{border:1px solid #d7d0c5;background:#fff;padding:8px 12px;border-radius:8px;font-weight:700;white-space:nowrap;cursor:pointer}.fip-manager-tabs button.active{background:#153a66;color:#fff;border-color:#153a66}
.fip-manager-content{overflow:auto;padding:18px 20px}.fip-manager-content section{background:#fff;border:1px solid #e0dad0;border-radius:11px;padding:15px}.fip-manager-content h3{margin:0 0 12px;color:#153a66}.fip-manager-content table{width:100%;border-collapse:collapse}.fip-manager-content th{background:#153a66;color:#fff;text-align:left;padding:9px}.fip-manager-content td{padding:8px 9px;border-bottom:1px solid #ece7df}.fip-manager-content tr:nth-child(even){background:#f7fafc}
.fip-manager footer{padding:11px 20px;background:#fff;border-top:1px solid #e1dbd1;color:#697481;font-size:.8rem}
@media(max-width:760px){.fip-manager-toolbar{align-items:flex-start;flex-direction:column}.fip-manager{height:95vh}}`;
  document.head.appendChild(s);
}
async function boot(){
  try{
    await load('fip-config.js');await load('fip-analytics.js');
    await load('fip-components.js');await load('fip-navigation.js');
    global.FIP={version:VERSION,config:global.FIP_CONFIG,analytics:global.FIP_ANALYTICS,
      components:global.FIP_COMPONENTS,navigation:global.FIP_NAVIGATION,open:renderManager};
    styles();managerButton();
    await global.FIP_CONFIG.load();
    const nav=global.FIP_CONFIG.navigation();
    if(nav.length&&!localStorage.getItem('alg-fip-navigation-v6.1'))global.FIP_NAVIGATION.apply(nav.map(x=>x.id));
    global.dispatchEvent(new CustomEvent('fip:ready',{detail:global.FIP}));
    console.info('Al Laith Finance Intelligence Platform',VERSION,'ready');
  }catch(err){console.error('FIP 6.1 boot failed',err);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
