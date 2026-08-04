(function(global){
'use strict';
const STORE='alg-fip-navigation-v6.2';
const KNOWN=[
  'Consolidated','Executive Summary','Liquidity Excl. Qiddiya','Group Forecast',
  'By Business Unit','Transactions','Settings & Data','Bank Balance','PDC Issued',
  'Bank Loans','Capex','Intercompany','Receivables'
];
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const slug=v=>clean(v).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function candidateItems(){
  const all=[...document.querySelectorAll('button,a,[role="tab"],[data-view]')];
  return all.filter(el=>{
    const t=clean(el.textContent);
    if(!t||!KNOWN.some(k=>t===k||t.startsWith(k)))return false;
    const s=getComputedStyle(el);
    return s.display!=='none'&&s.visibility!=='hidden';
  });
}
function navContext(){
  const candidates=candidateItems();
  if(!candidates.length)return null;
  const counts=new Map();
  candidates.forEach(el=>{
    let p=el.parentElement,depth=0;
    while(p&&depth<4){
      counts.set(p,(counts.get(p)||0)+1);
      p=p.parentElement;depth++;
    }
  });
  const root=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(!root)return null;
  const items=candidates.filter(el=>root.contains(el));
  return {root,items};
}
function idOf(el){return el.dataset.view||el.getAttribute('href')||slug(el.textContent)}
function saved(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch(_){return null}}
function configured(){
  return global.FIP_CONFIG?.navigation?.().filter(x=>x.visible!==false).map(x=>x.id)||null;
}
function apply(order){
  const ctx=navContext();if(!ctx||!order?.length)return false;
  const map=new Map(ctx.items.map(x=>[slug(idOf(x)),x]));
  order.forEach(id=>{
    const el=map.get(slug(id));
    if(el)ctx.root.appendChild(el);
  });
  return true;
}
function save(order){
  localStorage.setItem(STORE,JSON.stringify(order));
  apply(order);
  global.dispatchEvent(new CustomEvent('fip:navigation',{detail:order}));
}
function currentRows(){
  const ctx=navContext();if(!ctx)return[];
  return ctx.items.map(el=>({id:slug(idOf(el)),label:clean(el.textContent)}));
}
function open(){
  const rows=currentRows();
  if(!rows.length)return alert('Main navigation could not be detected.');
  const overlay=document.createElement('div');overlay.className='fip-nav-overlay';
  overlay.innerHTML=`<div class="fip-nav-modal">
    <h3>Arrange Main Navigation</h3>
    <p>Drag pages into your preferred order. The order is saved in this browser.</p>
    <div class="fip-nav-list">${rows.map(x=>`<div draggable="true" data-id="${x.id}"><span>⋮⋮</span>${x.label}</div>`).join('')}</div>
    <div class="fip-nav-actions">
      <button data-config>Use Configuration Order</button>
      <button data-reset>Restore Original</button>
      <button data-cancel>Cancel</button>
      <button class="primary" data-save>Save Order</button>
    </div></div>`;
  document.body.appendChild(overlay);
  let drag=null;
  overlay.querySelectorAll('.fip-nav-list>div').forEach(r=>{
    r.ondragstart=()=>{drag=r;r.classList.add('dragging')};
    r.ondragend=()=>r.classList.remove('dragging');
    r.ondragover=e=>{
      e.preventDefault();
      if(drag&&drag!==r){
        const box=r.getBoundingClientRect();
        r.parentNode.insertBefore(drag,e.clientY<box.top+box.height/2?r:r.nextSibling);
      }
    };
  });
  overlay.querySelector('[data-cancel]').onclick=()=>overlay.remove();
  overlay.querySelector('[data-reset]').onclick=()=>{localStorage.removeItem(STORE);location.reload()};
  overlay.querySelector('[data-config]').onclick=()=>{
    const order=configured();
    if(order){save(order);overlay.remove()}else alert('No navigation order exists in FIP Configuration.');
  };
  overlay.querySelector('[data-save]').onclick=()=>{
    save([...overlay.querySelectorAll('.fip-nav-list>div')].map(x=>x.dataset.id));
    overlay.remove();
  };
}
function styles(){
  if(document.getElementById('fipNavStyles'))return;
  const s=document.createElement('style');s.id='fipNavStyles';s.textContent=`
.fip-nav-overlay{position:fixed;inset:0;z-index:100002;background:rgba(9,20,35,.58);display:grid;place-items:center;padding:20px}
.fip-nav-modal{width:min(620px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:14px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.28)}
.fip-nav-modal h3{margin:0;color:#153a66}.fip-nav-modal p{color:#6f7885}
.fip-nav-list>div{border:1px solid #ddd7cd;border-radius:8px;padding:11px;margin:7px 0;background:#fff;cursor:grab;font-weight:700}
.fip-nav-list>div.dragging{opacity:.45}.fip-nav-list span{color:#9aa1aa;margin-right:10px}
.fip-nav-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:16px}
.fip-nav-actions button{padding:9px 13px;border:1px solid #ccc5ba;background:#fff;border-radius:8px;font-weight:700;cursor:pointer}
.fip-nav-actions .primary{background:#153a66;color:#fff;border-color:#153a66}`;
  document.head.appendChild(s);
}
styles();
setTimeout(()=>apply(saved()||configured()),800);
global.FIP_NAVIGATION={open,apply,save,current:currentRows,reset(){localStorage.removeItem(STORE);location.reload()}};
})(window);
