// FIP 6.4.0 — Stakeholder cache, live status and Smart Finance Search
(function(global){
'use strict';

const DB_NAME='alg-fip-cache';
const STORE='payloads';
const CACHE_KEY='latest-full-payload';
const AUTO_REFRESH_MINUTES=15;
const state={
  restored:false,
  restoring:false,
  lastSaved:null,
  lastError:null,
  searchOpen:false
};

const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const esc=v=>clean(v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  .replace(/'/g,'&#039;');

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE)){
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Cache database unavailable.'));
  });
}

async function savePayload(payload){
  if(!payload||!payload.sheets||!Object.keys(payload.sheets).length)return false;
  const record={
    savedAt:new Date().toISOString(),
    payload
  };
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(record,CACHE_KEY);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||new Error('Could not save dashboard cache.'));
  });
  db.close();
  state.lastSaved=record.savedAt;
  localStorage.setItem('fip640_last_cache',record.savedAt);
  updateStatus();
  return true;
}

async function readPayload(){
  const db=await openDb();
  const record=await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).get(CACHE_KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Could not read dashboard cache.'));
  });
  db.close();
  return record;
}

function payloadSheetCount(payload){
  return payload&&payload.sheets?Object.keys(payload.sheets).length:0;
}

function applyCached(record){
  if(!record||!record.payload||!payloadSheetCount(record.payload))return false;
  global.GOOGLE_SHEET_RAW_PAYLOAD=record.payload;
  state.lastSaved=record.savedAt||record.payload.lastUpdated||null;

  if(typeof global.applyGoogleWorkingPayload==='function'){
    try{
      global.applyGoogleWorkingPayload(
        record.payload,
        ['cached-stakeholder-data'],
        [],
        'cache-restored'
      );
    }catch(error){
      console.warn('[FIP_CACHE] Core cache apply warning',error);
      global.dispatchEvent(new CustomEvent('googleSheetPayloadReady',{
        detail:record.payload
      }));
      global.dispatchEvent(new CustomEvent('fip:data-ready',{
        detail:{stage:'cache-restored',payload:record.payload}
      }));
    }
  }else{
    global.dispatchEvent(new CustomEvent('googleSheetPayloadReady',{
      detail:record.payload
    }));
  }

  state.restored=true;
  updateStatus('Cached dashboard loaded');
  return true;
}

function isStale(timestamp){
  if(!timestamp)return true;
  const age=Date.now()-new Date(timestamp).getTime();
  return !Number.isFinite(age)||age>AUTO_REFRESH_MINUTES*60000;
}

function statusText(){
  if(state.restoring)return 'Loading saved dashboard data…';
  if(global.getGoogleRefreshProgress){
    const p=global.getGoogleRefreshProgress();
    if(p&&p.active)return p.current||'Refreshing live Google Sheet data…';
  }
  if(state.lastError)return 'Live refresh warning · showing last successful data';
  if(state.lastSaved){
    const d=new Date(state.lastSaved);
    if(Number.isFinite(d.getTime()))return 'Data available · last saved '+d.toLocaleString();
  }
  return 'Dashboard ready';
}

function updateStatus(prefix){
  const text=document.getElementById('fip640StatusText');
  if(text)text.textContent=prefix||statusText();
}

function injectStatus(){
  if(document.getElementById('fip640StakeholderBar'))return;
  const bar=document.createElement('div');
  bar.id='fip640StakeholderBar';
  bar.innerHTML=`
    <div class="fip640-status">
      <span class="fip640-dot"></span>
      <span id="fip640StatusText">Preparing dashboard…</span>
    </div>
    <div class="fip640-actions">
      <button type="button" id="fip640SearchButton">Ask FIP</button>
      <button type="button" id="fip640LiveRefreshButton">Refresh all reports</button>
    </div>`;
  document.body.appendChild(bar);

  document.getElementById('fip640SearchButton').onclick=openSearch;
  document.getElementById('fip640LiveRefreshButton').onclick=()=>{
    if(typeof global.refreshFromGoogleSheet==='function')global.refreshFromGoogleSheet();
  };
}

function sheetIndex(){
  const payload=global.GOOGLE_SHEET_RAW_PAYLOAD||{};
  const sheets=payload.sheets||{};
  const index=[];

  Object.entries(sheets).forEach(([sheetName,matrix])=>{
    if(!Array.isArray(matrix))return;
    matrix.forEach((row,rowIndex)=>{
      if(!Array.isArray(row))return;
      const cells=row.map(clean);
      const text=cells.filter(Boolean).join(' | ');
      if(!text)return;
      index.push({
        sheet:sheetName,
        row:rowIndex+1,
        cells,
        text,
        normalized:text.toLowerCase()
      });
    });
  });
  return index;
}

function tokenize(query){
  const stop=new Set(['show','find','give','me','the','all','for','of','in','and','to','with','from','please','what','which']);
  return clean(query).toLowerCase()
    .replace(/[^\p{L}\p{N}>.-]+/gu,' ')
    .split(/\s+/).filter(x=>x&&!stop.has(x));
}

function intentFor(query){
  const q=clean(query).toLowerCase();
  if(/capex|capital expenditure/.test(q))return {view:'capex',sheet:/capex/i};
  if(/receivable|aging|customer|debtor|over 180|over 90/.test(q))return {view:'receivables',sheet:/^dr-|receiv|coll vs target/i};
  if(/bank loan|debt summary|facility/.test(q))return {view:'bank-loans',sheet:/debt summary/i};
  if(/bank balance|cash at bank/.test(q))return {view:'bank-balance',sheet:/bank balance/i};
  if(/collection|target/.test(q))return {view:'receivables',sheet:/coll vs target/i};
  if(/forecast|cash flow|cashflow/.test(q))return {view:'forecast',sheet:/-cb$|dashboard|exe sum/i};
  return {view:null,sheet:null};
}

function search(query){
  const tokens=tokenize(query);
  const intent=intentFor(query);
  const rows=sheetIndex();
  const scored=[];

  rows.forEach(item=>{
    let score=0;
    tokens.forEach(token=>{
      if(item.normalized.includes(token))score+=token.length>5?5:3;
      if(item.sheet.toLowerCase().includes(token))score+=6;
    });
    if(intent.sheet&&intent.sheet.test(item.sheet))score+=4;
    if(score>0)scored.push({...item,score});
  });

  scored.sort((a,b)=>b.score-a.score||a.sheet.localeCompare(b.sheet)||a.row-b.row);
  return {
    query,
    intent,
    total:scored.length,
    results:scored.slice(0,60)
  };
}

function navigate(view){
  if(!view)return;
  const button=document.querySelector(`[data-view="${view}"]`);
  if(button)button.click();
}

function renderResults(result){
  const root=document.getElementById('fip640SearchResults');
  if(!root)return;
  if(!result.results.length){
    root.innerHTML=`<div class="fip640-empty">
      No matching rows were found in the currently loaded finance data.
      Try a customer, entity, division, month, sheet name or amount.
    </div>`;
    return;
  }

  const groups={};
  result.results.forEach(item=>{
    (groups[item.sheet]||(groups[item.sheet]=[])).push(item);
  });

  root.innerHTML=`
    <div class="fip640-result-summary">
      <strong>${result.total.toLocaleString()} matches</strong>
      ${result.intent.view?`<button type="button" data-open-view="${esc(result.intent.view)}">Open related report</button>`:''}
    </div>
    ${Object.entries(groups).map(([sheet,items])=>`
      <section class="fip640-result-group">
        <h3>${esc(sheet)} <small>${items.length} shown</small></h3>
        ${items.slice(0,12).map(item=>`
          <button type="button" class="fip640-result-row" data-sheet="${esc(sheet)}" data-row="${item.row}">
            <span>Row ${item.row}</span>
            <strong>${esc(item.cells.filter(Boolean).slice(0,6).join(' · '))}</strong>
          </button>`).join('')}
      </section>`).join('')}`;

  root.querySelectorAll('[data-open-view]').forEach(button=>{
    button.onclick=()=>{
      navigate(button.dataset.openView);
      closeSearch();
    };
  });
}

function runSearch(){
  const input=document.getElementById('fip640SearchInput');
  if(!input)return;
  const query=clean(input.value);
  if(!query)return;
  renderResults(search(query));
}

function openSearch(){
  let overlay=document.getElementById('fip640SearchOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='fip640SearchOverlay';
    overlay.innerHTML=`
      <div class="fip640-search-panel">
        <header>
          <div>
            <h2>Ask FIP</h2>
            <p>Search the finance data already loaded in this dashboard.</p>
          </div>
          <button type="button" data-close>×</button>
        </header>
        <div class="fip640-search-box">
          <input id="fip640SearchInput" type="search"
            placeholder="Try: Qiddiya receivables, Oman forecast, capex, over 180, Events collections">
          <button id="fip640SearchRun" type="button">Search</button>
        </div>
        <div class="fip640-examples">
          <button>Over 180 receivables</button>
          <button>Qiddiya</button>
          <button>ALPS forecast</button>
          <button>Capex Summary</button>
          <button>Collections target</button>
        </div>
        <div id="fip640SearchResults" class="fip640-search-results">
          <div class="fip640-empty">Enter a finance question or search term.</div>
        </div>
        <footer>
          Smart Search runs locally in the browser. No finance data is sent to an external AI service.
        </footer>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('[data-close]').onclick=closeSearch;
    overlay.onclick=e=>{if(e.target===overlay)closeSearch()};
    document.getElementById('fip640SearchRun').onclick=runSearch;
    document.getElementById('fip640SearchInput').onkeydown=e=>{
      if(e.key==='Enter')runSearch();
    };
    overlay.querySelectorAll('.fip640-examples button').forEach(button=>{
      button.onclick=()=>{
        document.getElementById('fip640SearchInput').value=button.textContent;
        runSearch();
      };
    });
  }
  overlay.hidden=false;
  state.searchOpen=true;
  setTimeout(()=>document.getElementById('fip640SearchInput')?.focus(),30);
}

function closeSearch(){
  const overlay=document.getElementById('fip640SearchOverlay');
  if(overlay)overlay.hidden=true;
  state.searchOpen=false;
}

function injectStyles(){
  if(document.getElementById('fip640Styles'))return;
  const style=document.createElement('style');
  style.id='fip640Styles';
  style.textContent=`
#fip640StakeholderBar{position:fixed;left:16px;right:88px;bottom:16px;z-index:99980;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 13px;background:rgba(255,255,255,.96);border:1px solid #d9d4ca;border-radius:12px;box-shadow:0 10px 30px rgba(27,42,62,.18);backdrop-filter:blur(8px)}
.fip640-status,.fip640-actions{display:flex;align-items:center;gap:8px}.fip640-status{font-size:.82rem;font-weight:700;color:#344154}.fip640-dot{width:9px;height:9px;border-radius:50%;background:#16835f;box-shadow:0 0 0 4px rgba(22,131,95,.12)}
.fip640-actions button{border:1px solid #cfc7ba;background:#fff;border-radius:8px;padding:7px 10px;font-weight:800;color:#12395f;cursor:pointer}.fip640-actions button:first-child{background:#12395f;color:#fff;border-color:#12395f}
#fip640SearchOverlay{position:fixed;inset:0;z-index:100200;background:rgba(7,19,34,.62);display:grid;place-items:center;padding:18px}
#fip640SearchOverlay[hidden]{display:none}
.fip640-search-panel{width:min(1040px,96vw);height:min(760px,92vh);background:#faf8f3;border-radius:16px;display:grid;grid-template-rows:auto auto auto 1fr auto;overflow:hidden;box-shadow:0 32px 90px rgba(0,0,0,.34)}
.fip640-search-panel header{display:flex;justify-content:space-between;align-items:center;padding:17px 20px;background:#fff;border-bottom:1px solid #e4ded4}.fip640-search-panel h2{margin:0;color:#12395f}.fip640-search-panel header p{margin:3px 0 0;color:#697481}.fip640-search-panel header button{border:0;background:transparent;font-size:1.8rem;cursor:pointer}
.fip640-search-box{display:grid;grid-template-columns:1fr auto;gap:8px;padding:14px 20px 8px}.fip640-search-box input{border:1px solid #cfc8bd;border-radius:10px;padding:12px 14px;font-size:1rem}.fip640-search-box button{border:0;border-radius:10px;background:#0d4f49;color:#fff;padding:0 18px;font-weight:900}
.fip640-examples{display:flex;gap:7px;flex-wrap:wrap;padding:5px 20px 12px}.fip640-examples button{border:1px solid #d7d0c6;background:#fff;border-radius:999px;padding:6px 10px;cursor:pointer}
.fip640-search-results{overflow:auto;padding:0 20px 16px}.fip640-empty{padding:28px;text-align:center;color:#697481;background:#fff;border:1px dashed #d6cfc4;border-radius:11px}
.fip640-result-summary{display:flex;justify-content:space-between;align-items:center;margin:4px 0 10px}.fip640-result-summary button{border:0;background:#12395f;color:#fff;border-radius:8px;padding:7px 10px;font-weight:800}
.fip640-result-group{background:#fff;border:1px solid #dfd8ce;border-radius:11px;margin:10px 0;overflow:hidden}.fip640-result-group h3{margin:0;padding:10px 12px;background:#edf2f7;color:#12395f}.fip640-result-group h3 small{font-weight:500;color:#6f7985}
.fip640-result-row{width:100%;display:grid;grid-template-columns:70px 1fr;gap:10px;text-align:left;border:0;border-top:1px solid #eee9e1;background:#fff;padding:9px 12px;cursor:pointer}.fip640-result-row:hover{background:#f7fbfc}.fip640-result-row span{color:#718091;font-size:.76rem}.fip640-result-row strong{font-size:.84rem;white-space:normal}
.fip640-search-panel footer{padding:10px 20px;background:#fff;border-top:1px solid #e4ded4;color:#74808d;font-size:.76rem}
@media(max-width:700px){#fip640StakeholderBar{right:16px;flex-direction:column;align-items:stretch}.fip640-actions button{flex:1}.fip640-actions{display:flex}.fip640-search-panel{height:96vh}.fip640-result-row{grid-template-columns:55px 1fr}}`;
  document.head.appendChild(style);
}

async function restore(){
  if(state.restoring||state.restored)return false;
  state.restoring=true;
  updateStatus();
  try{
    const record=await readPayload();
    if(record)applyCached(record);
    return Boolean(record);
  }catch(error){
    state.lastError=error;
    console.warn('[FIP_CACHE] Restore failed',error);
    return false;
  }finally{
    state.restoring=false;
    updateStatus();
  }
}

function bindEvents(){
  global.addEventListener('googleSheetPayloadReady',event=>{
    const payload=event&&event.detail?event.detail:global.GOOGLE_SHEET_RAW_PAYLOAD;
    if(payloadSheetCount(payload)>=5){
      savePayload(payload).catch(error=>console.warn('[FIP_CACHE] Save failed',error));
    }
    updateStatus();
  });

  global.addEventListener('fip:data-ready',event=>{
    const payload=event&&event.detail&&event.detail.payload
      ? event.detail.payload
      : global.GOOGLE_SHEET_RAW_PAYLOAD;
    if(payloadSheetCount(payload)>=5){
      savePayload(payload).catch(error=>console.warn('[FIP_CACHE] Save failed',error));
    }
    updateStatus();
  });

  setInterval(updateStatus,1000);
}

async function boot(){
  injectStyles();
  injectStatus();
  bindEvents();

  const restored=await restore();
  const last=state.lastSaved||localStorage.getItem('cf_google_last_refresh');

  setTimeout(()=>{
    if(typeof global.refreshFromGoogleSheet!=='function')return;
    if(!restored||isStale(last)){
      global.refreshFromGoogleSheet().catch(error=>{
        state.lastError=error;
        updateStatus();
      });
    }
  },restored?2500:800);
}

global.FIP_SMART_SEARCH={
  version:'6.4.0',
  open:openSearch,
  close:closeSearch,
  search,
  restore,
  save:()=>savePayload(global.GOOGLE_SHEET_RAW_PAYLOAD),
  state
};

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',boot,{once:true});
}else{
  boot();
}
})(window);
