(function(global){
'use strict';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const C={
  kpi({label,value,meta='',status=''}){return `<div class="fip-card fip-kpi ${status}"><div class="fip-kpi-label">${esc(label)}</div><div class="fip-kpi-value">${esc(value)}</div><div class="fip-kpi-meta">${esc(meta)}</div></div>`;},
  alert({severity='info',title,message,action=''}){return `<div class="fip-alert ${esc(severity)}"><strong>${esc(title)}</strong><span>${esc(message)}</span>${action?`<button type="button">${esc(action)}</button>`:''}</div>`;},
  table({headers,rows,classes=''}){return `<div class="fip-table-wrap"><table class="fip-table ${esc(classes)}"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;},
  panel(title,body,subtitle=''){return `<section class="fip-card fip-panel"><header><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></header>${body}</section>`;}
};
function styles(){if(document.getElementById('fipComponentStyles'))return;const s=document.createElement('style');s.id='fipComponentStyles';s.textContent=`
.fip-card{background:#fff;border:1px solid #e3ded5;border-radius:12px;box-shadow:0 2px 10px rgba(20,35,55,.04)}
.fip-kpi{padding:16px}.fip-kpi-label{font-size:.75rem;font-weight:800;color:#6d7785;text-transform:uppercase}.fip-kpi-value{font-size:1.45rem;font-weight:900;color:#153a66;margin-top:7px}.fip-kpi-meta{font-size:.76rem;color:#7b8490;margin-top:5px}.fip-kpi.green{border-left:5px solid #299764}.fip-kpi.amber{border-left:5px solid #cf8a16}.fip-kpi.red{border-left:5px solid #c0392b}
.fip-panel{padding:0;overflow:hidden}.fip-panel>header{padding:14px 16px;border-bottom:1px solid #ece7df}.fip-panel h3{margin:0;color:#153a66}.fip-panel header p{margin:4px 0 0;color:#77808d;font-size:.78rem}
.fip-table-wrap{overflow:auto;max-height:540px}.fip-table{width:100%;border-collapse:separate;border-spacing:0}.fip-table th{position:sticky;top:0;z-index:4;background:#153a66;color:#fff;padding:9px;text-align:left}.fip-table td{padding:8px 9px;border-bottom:1px solid #ece7df}.fip-table tbody tr:nth-child(even){background:#f8fafc}
.fip-alert{display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:12px;border-radius:9px;margin:8px 0}.fip-alert.red{background:#fde7e4;color:#9f241b}.fip-alert.amber{background:#fff3d8;color:#855600}.fip-alert.green{background:#e8f6ef;color:#176844}.fip-alert.info{background:#eaf2fb;color:#204f7c}
`;document.head.appendChild(s);}
styles();global.FIP_COMPONENTS=C;
})(window);
