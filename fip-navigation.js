(function(global){
'use strict';
const STORE='alg-fip-navigation-v6';
function navRoot(){return document.querySelector('.sidebar nav,.sidebar .nav,nav.sidebar-nav,#sidebar nav');}
function items(root){return [...root.querySelectorAll('[data-view],a[href^="#"],button')].filter(x=>x.textContent.trim());}
function idOf(el){return el.dataset.view||el.getAttribute('href')||el.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');}
function saved(){try{return JSON.parse(localStorage.getItem(STORE)||'null');}catch(_){return null;}}
function apply(order){const root=navRoot();if(!root||!order)return;const map=new Map(items(root).map(x=>[idOf(x),x]));order.forEach(id=>{const el=map.get(id);if(el)root.appendChild(el);});}
function save(order){localStorage.setItem(STORE,JSON.stringify(order));apply(order);global.dispatchEvent(new CustomEvent('fip:navigation',{detail:order}));}
function open(){
  const root=navRoot();if(!root)return alert('Navigation container not detected.');
  const list=items(root),overlay=document.createElement('div');overlay.className='fip-nav-overlay';
  overlay.innerHTML=`<div class="fip-nav-modal"><h3>Arrange Navigation</h3><p>Drag pages into your preferred order. This setting is saved in this browser.</p><div class="fip-nav-list">${list.map(el=>`<div draggable="true" data-id="${idOf(el)}"><span>⋮⋮</span>${el.textContent.trim()}</div>`).join('')}</div><div class="fip-nav-actions"><button data-reset>Restore Default</button><button data-cancel>Cancel</button><button class="primary" data-save>Save Order</button></div></div>`;
  document.body.appendChild(overlay);
  let drag=null;const rows=[...overlay.querySelectorAll('.fip-nav-list>div')];
  rows.forEach(r=>{r.ondragstart=()=>{drag=r};r.ondragover=e=>{e.preventDefault();if(drag&&drag!==r){const box=r.getBoundingClientRect();r.parentNode.insertBefore(drag,e.clientY<box.top+box.height/2?r:r.nextSibling)}}});
  overlay.querySelector('[data-cancel]').onclick=()=>overlay.remove();
  overlay.querySelector('[data-reset]').onclick=()=>{localStorage.removeItem(STORE);location.reload()};
  overlay.querySelector('[data-save]').onclick=()=>{save([...overlay.querySelectorAll('.fip-nav-list>div')].map(x=>x.dataset.id));overlay.remove()};
}
function styles(){if(document.getElementById('fipNavStyles'))return;const s=document.createElement('style');s.id='fipNavStyles';s.textContent=`
.fip-nav-overlay{position:fixed;inset:0;z-index:99999;background:rgba(9,20,35,.55);display:grid;place-items:center;padding:20px}.fip-nav-modal{width:min(560px,96vw);max-height:86vh;overflow:auto;background:#fff;border-radius:14px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.25)}.fip-nav-modal h3{margin:0;color:#153a66}.fip-nav-modal p{color:#6f7885}.fip-nav-list>div{border:1px solid #ddd7cd;border-radius:8px;padding:11px;margin:7px 0;background:#fff;cursor:grab;font-weight:700}.fip-nav-list span{color:#9aa1aa;margin-right:10px}.fip-nav-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.fip-nav-actions button{padding:9px 13px;border:1px solid #ccc5ba;background:#fff;border-radius:8px;font-weight:700}.fip-nav-actions .primary{background:#153a66;color:#fff;border-color:#153a66}
`;document.head.appendChild(s);}
styles();apply(saved());global.FIP_NAVIGATION={open,apply,save,reset(){localStorage.removeItem(STORE);location.reload();}};
})(window);
