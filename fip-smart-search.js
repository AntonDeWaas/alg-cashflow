// FIP 6.4.1 — Conversational Ask FIP
(function(global){
'use strict';

const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const esc=v=>clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const state={history:JSON.parse(localStorage.getItem('fip641_history')||'[]')};

function rows(){
  const sheets=(global.GOOGLE_SHEET_RAW_PAYLOAD||{}).sheets||{};
  const out=[];
  Object.entries(sheets).forEach(([sheet,matrix])=>{
    if(!Array.isArray(matrix))return;
    matrix.forEach((row,i)=>{
      if(!Array.isArray(row))return;
      const cells=row.map(clean);
      const text=cells.filter(Boolean).join(' | ');
      if(text)out.push({sheet,row:i+1,cells,text,lower:text.toLowerCase()});
    });
  });
  return out;
}

function tokens(q){
  const stop=new Set(['show','find','give','me','the','all','for','of','in','and','to','with','from','please','what','which','who','is','are']);
  return clean(q).toLowerCase().replace(/[^\p{L}\p{N}>.-]+/gu,' ').split(/\s+/).filter(x=>x&&!stop.has(x));
}

function intent(q){
  q=clean(q).toLowerCase();
  if(/over\s*180|180\+|older than 180/.test(q))return {kind:'aging180',view:'receivables',label:'Receivables over 180 days'};
  if(/receivable|aging|customer|debtor/.test(q))return {kind:'receivables',view:'receivables',label:'Receivables analysis'};
  if(/capex|capital expenditure/.test(q))return {kind:'capex',view:'capex',label:'CAPEX analysis'};
  if(/collection|target/.test(q))return {kind:'collections',view:'receivables',label:'Collections performance'};
  if(/bank loan|debt|facility/.test(q))return {kind:'debt',view:'bank-loans',label:'Debt and facilities'};
  if(/bank balance|cash at bank/.test(q))return {kind:'bank',view:'bank-balance',label:'Bank balances'};
  if(/forecast|cash flow|cashflow/.test(q))return {kind:'forecast',view:'forecast',label:'Forecast analysis'};
  return {kind:'general',view:null,label:'Finance search'};
}

function relevant(kind,sheet){
  sheet=sheet.toLowerCase();
  if(kind==='aging180'||kind==='receivables')return /^dr-|receiv|coll vs target/.test(sheet);
  if(kind==='capex')return /capex/.test(sheet);
  if(kind==='collections')return /coll vs target|collection/.test(sheet);
  if(kind==='debt')return /debt summary/.test(sheet);
  if(kind==='bank')return /bank balance/.test(sheet);
  if(kind==='forecast')return /-cb$|dashboard|exe sum/.test(sheet);
  return true;
}

function search(q){
  const t=tokens(q), it=intent(q), found=[];
  rows().forEach(r=>{
    let score=relevant(it.kind,r.sheet)?4:0;
    t.forEach(x=>{
      if(r.lower.includes(x))score+=x.length>5?6:3;
      if(r.sheet.toLowerCase().includes(x))score+=7;
    });
    if(it.kind==='aging180'&&/181|211|241|271|301|331|366|731/.test(r.lower))score+=5;
    if(score>0)found.push({...r,score});
  });
  found.sort((a,b)=>b.score-a.score||a.sheet.localeCompare(b.sheet)||a.row-b.row);
  return {query:q,intent:it,total:found.length,results:found.slice(0,60)};
}

function summary(result){
  const sheets=[...new Set(result.results.map(x=>x.sheet))];
  if(!result.results.length)return {
    title:'I could not find a reliable match in the loaded dashboard data.',
    bullets:['Try a customer name, entity, division, month or report name.']
  };
  const top=result.results[0].cells.filter(Boolean).slice(0,4).join(' · ');
  if(result.intent.kind==='aging180')return {
    title:`I found ${result.total.toLocaleString()} likely matches related to receivables over 180 days.`,
    bullets:[`Sources checked: ${sheets.slice(0,4).join(', ')}`,`Top match: ${top}`,'Open Receivables for the full Aging Analysis Detail.']
  };
  if(result.intent.kind==='capex')return {
    title:`I found ${result.total.toLocaleString()} CAPEX-related matches.`,
    bullets:[`Top match: ${top}`,'Open CAPEX for the full summary.']
  };
  if(result.intent.kind==='forecast')return {
    title:`I found ${result.total.toLocaleString()} forecast-related matches across ${sheets.length} source sheet${sheets.length===1?'':'s'}.`,
    bullets:[`Top match: ${top}`,'Open Group Forecast for the complete cash flow profile.']
  };
  if(result.intent.kind==='collections')return {
    title:`I found ${result.total.toLocaleString()} collection and target matches.`,
    bullets:[`Top match: ${top}`,'Open Collections Performance for the monthly comparison.']
  };
  return {
    title:`I found ${result.total.toLocaleString()} relevant finance matches.`,
    bullets:[`Top match: ${top}`,`Sources: ${sheets.slice(0,4).join(', ')}`]
  };
}

function openView(view){
  if(!view)return;
  const b=document.querySelector(`[data-view="${view}"]`);
  if(b)b.click();
}

function remember(q){
  q=clean(q); if(!q)return;
  state.history=[q,...state.history.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,6);
  localStorage.setItem('fip641_history',JSON.stringify(state.history));
  renderHistory();
}

function renderHistory(){
  const root=document.getElementById('fip641History'); if(!root)return;
  root.innerHTML=state.history.length?state.history.map(x=>`<button>${esc(x)}</button>`).join(''):'<span>No recent questions yet.</span>';
  root.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{
    document.getElementById('fip641Input').value=state.history[i];
    run();
  });
}

function render(result){
  const root=document.getElementById('fip641Results'); if(!root)return;
  const s=summary(result), groups={};
  result.results.forEach(r=>(groups[r.sheet]||(groups[r.sheet]=[])).push(r));
  root.innerHTML=`
    <section class="fip641-answer">
      <div class="fip641-badge">FIP</div>
      <div>
        <h3>${esc(s.title)}</h3>
        <ul>${s.bullets.filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        ${result.intent.view?`<button class="fip641-open" data-view="${esc(result.intent.view)}">Open related report</button>`:''}
      </div>
    </section>
    ${result.results.length?`
      <section class="fip641-support">
        <header><strong>Supporting data</strong><span>${result.total.toLocaleString()} matches</span></header>
        ${Object.entries(groups).slice(0,5).map(([sheet,items])=>`
          <div class="fip641-group">
            <h4>${esc(sheet)} <small>${items.length} shown</small></h4>
            ${items.slice(0,7).map(x=>`<div class="fip641-row"><span>Row ${x.row}</span><strong>${esc(x.cells.filter(Boolean).slice(0,6).join(' · '))}</strong></div>`).join('')}
          </div>`).join('')}
      </section>`:''}`;
  root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{openView(b.dataset.view);close();});
}

function run(){
  const input=document.getElementById('fip641Input'); if(!input)return;
  const q=clean(input.value); if(!q)return;
  remember(q); render(search(q));
}

function open(){
  let panel=document.getElementById('fip641Panel');
  if(!panel){
    panel=document.createElement('aside');
    panel.id='fip641Panel';
    panel.hidden=true;
    panel.innerHTML=`
      <header>
        <div><small>FINANCE ASSISTANT</small><h2>Ask FIP</h2><p>Ask a finance question in plain English.</p></div>
        <button data-close>×</button>
      </header>
      <div class="fip641-box"><textarea id="fip641Input" rows="3" placeholder="Example: Which customers are over 180 days?"></textarea><button id="fip641Ask">Ask</button></div>
      <section class="fip641-suggest"><h3>Suggested questions</h3><div>
        <button>Which customers are over 180 days?</button>
        <button>Show Qiddiya receivables</button>
        <button>Show ALPS forecast</button>
        <button>Show the largest CAPEX items</button>
        <button>Show collection targets</button>
      </div></section>
      <section class="fip641-history"><h3>Recent questions</h3><div id="fip641History"></div></section>
      <div id="fip641Results" class="fip641-results"><div class="fip641-empty">Ask a question to get a short finance answer and supporting data.</div></div>
      <footer>Smart Search runs locally in the browser. No finance data is sent to an external AI service.</footer>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').onclick=close;
    document.getElementById('fip641Ask').onclick=run;
    document.getElementById('fip641Input').onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')run();};
    panel.querySelectorAll('.fip641-suggest button').forEach(b=>b.onclick=()=>{document.getElementById('fip641Input').value=b.textContent;run();});
    renderHistory();
  }
  panel.hidden=false;
  document.body.classList.add('fip641-open');
  setTimeout(()=>document.getElementById('fip641Input')?.focus(),20);
}

function close(){
  const panel=document.getElementById('fip641Panel');
  if(panel)panel.hidden=true;
  document.body.classList.remove('fip641-open');
}

function style(){
  if(document.getElementById('fip641Style'))return;
  const s=document.createElement('style');
  s.id='fip641Style';
  s.textContent=`
#fip641Panel{position:fixed;top:0;right:0;bottom:0;width:min(520px,94vw);z-index:100300;background:#f7f5f0;box-shadow:-20px 0 60px rgba(8,24,42,.24);display:grid;grid-template-rows:auto auto auto auto 1fr auto;border-left:1px solid #d9d3ca}
#fip641Panel[hidden]{display:none}
#fip641Panel>header{display:flex;justify-content:space-between;padding:20px;background:#fff;border-bottom:1px solid #e3ddd4}
#fip641Panel h2{margin:2px 0 4px;color:#12395f;font-size:1.65rem}#fip641Panel header p{margin:0;color:#697481}#fip641Panel header small{color:#16835f;font-weight:900;letter-spacing:.08em}
#fip641Panel header>button{border:0;background:transparent;font-size:1.8rem;cursor:pointer}
.fip641-box{display:grid;grid-template-columns:1fr auto;gap:8px;padding:16px 18px 10px}.fip641-box textarea{resize:none;border:1px solid #cfc8bd;border-radius:11px;padding:12px;font:inherit}.fip641-box button{border:0;border-radius:10px;background:#0d4f49;color:#fff;padding:0 18px;font-weight:900}
.fip641-suggest,.fip641-history{padding:4px 18px 10px}.fip641-suggest h3,.fip641-history h3{margin:0 0 7px;font-size:.8rem;color:#596574}.fip641-suggest div,.fip641-history div{display:flex;gap:7px;flex-wrap:wrap}.fip641-suggest button,.fip641-history button{border:1px solid #d7d0c6;background:#fff;border-radius:999px;padding:7px 10px;cursor:pointer;font-size:.78rem}
.fip641-results{overflow:auto;padding:6px 18px 18px}.fip641-empty{padding:28px;text-align:center;color:#697481;background:#fff;border:1px dashed #d6cfc4;border-radius:11px}
.fip641-answer{display:grid;grid-template-columns:44px 1fr;gap:12px;background:#fff;border:1px solid #d8e0e8;border-radius:13px;padding:15px;box-shadow:0 8px 22px rgba(25,52,80,.08)}.fip641-badge{width:44px;height:44px;border-radius:11px;background:#12395f;color:#fff;display:grid;place-items:center;font-weight:900}.fip641-answer h3{margin:0 0 8px;color:#183451;line-height:1.35}.fip641-answer ul{margin:0;padding-left:18px;color:#4f5d6b}.fip641-open{margin-top:10px;border:0;background:#0d4f49;color:#fff;border-radius:8px;padding:8px 11px;font-weight:800}
.fip641-support{margin-top:12px}.fip641-support>header{display:flex;justify-content:space-between;padding:0 2px 6px;color:#4f5d6b}.fip641-group{background:#fff;border:1px solid #dfd8ce;border-radius:11px;margin:8px 0;overflow:hidden}.fip641-group h4{margin:0;padding:9px 11px;background:#edf2f7;color:#12395f}.fip641-row{display:grid;grid-template-columns:60px 1fr;gap:9px;border-top:1px solid #eee9e1;padding:8px 10px}.fip641-row span{color:#718091;font-size:.72rem}.fip641-row strong{font-size:.8rem;white-space:normal}
#fip641Panel>footer{padding:10px 18px;background:#fff;border-top:1px solid #e4ded4;color:#74808d;font-size:.73rem}
body.fip641-open{overflow:hidden}
@media(max-width:700px){#fip641Panel{width:100vw}.fip641-box{grid-template-columns:1fr}.fip641-box button{padding:11px}}`;
  document.head.appendChild(s);
}

function replaceOldButton(){
  const old=document.getElementById('fip640SearchButton');
  if(old){
    old.textContent='Ask FIP';
    old.onclick=open;
  }
  const oldBar=document.getElementById('fip640StakeholderBar');
  if(oldBar){
    oldBar.id='fip641StakeholderBar';
  }
}

function boot(){
  style();
  replaceOldButton();
  global.FIP_SMART_SEARCH={version:'6.5.4',open,close,search,state};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
