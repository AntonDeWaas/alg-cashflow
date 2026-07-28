// Receivables Intelligence Module v18
// Dynamic, self-contained dashboard module for Al Laith Group.
// Reads current ERP aging sheets and optional history/collection sheets.
(function(){
'use strict';
const C={entities:[
{id:'GROUP',label:'Group',currency:'AED',fx:1,sheets:[]},
{id:'ALPS',label:'ALPS',currency:'AED',fx:1,sheets:['DR-ALPS-System']},
{id:'ALU',label:'ALU',currency:'SAR',fx:.975,sheets:['DR-ALU-System']},
{id:'ALIS',label:'ALIS',currency:'OMR',fx:9.5,sheets:['DR-ALIS-System']},
{id:'ALICLER',label:'ALICLER',currency:'AED',fx:1,sheets:['DR-ALICLER-System']},
{id:'ALPS_UZ',label:'ALPS UZ',currency:'AED',fx:1,sheets:['DR-ALPS UZ-System']},
{id:'ALPS_PE',label:'ALPS PE',currency:'AED',fx:1,sheets:['DR-ALPS-PE-System','DR-ALPS PE-System']}
],history:['Receivable History','Receivables History'],targets:['Collection Targets'],actuals:['Collection Actuals'],movement:['Receivable Movement','Receivables Movement']};

const MOVEMENT_CONFIG={
  movementSheet:'DR-Movement Details',
  lastPeriodSheet:'DR-Last Period',
  currentBlocks:[
    {id:'ALPS',label:'ALPS',country:'UAE',fx:1,start:0,end:9},
    {id:'ALICLER',label:'ALICLER',country:'UAE',fx:1,start:11,end:20},
    {id:'ALPS_UZ',label:'ALPS UZ',country:'UZBEKISTAN',fx:1,start:22,end:31},
    {id:'ALU',label:'ALU',country:'KSA',fx:.975,start:33,end:42},
    {id:'ALIS',label:'ALIS',country:'OMAN',fx:9.5,start:44,end:53}
  ],
  lastBlocks:[
    {id:'ALPS',start:0,end:19},
    {id:'ALU',start:22,end:41},
    {id:'ALIS',start:44,end:63},
    {id:'ALICLER',start:66,end:85},
    {id:'ALPS_UZ',start:88,end:107}
  ]
};

const S={payload:null,entity:'GROUP',section:'overview',parsed:{},updated:null,wrapped:false};
const $=id=>document.getElementById(id),clean=v=>String(v==null?'':v).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const esc=v=>clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
function num(v){const s=clean(v);if(!s||s==='-'||s==='—')return 0;const neg=/^\(.*\)$/.test(s),n=Number(s.replace(/[(),]/g,'').replace(/\b(?:AED|SAR|OMR)\b/gi,'').replace(/[^\d.-]/g,''));return Number.isFinite(n)?(neg?-Math.abs(n):n):0}
const fmt=v=>{const n=Number(v)||0,s=Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0});return n<0?'('+s+')':s};
const pct=v=>(Number(v)||0).toLocaleString('en-US',{maximumFractionDigits:1})+'%';
const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9><]/g,'');
function sheets(){return S.payload&&(S.payload.sheets||S.payload)||{}}
function matrix(name){const sh=sheets();if(Array.isArray(sh[name]))return sh[name];const k=Object.keys(sh).find(x=>clean(x).toLowerCase()===clean(name).toLowerCase());return k&&Array.isArray(sh[k])?sh[k]:[]}
function first(names){for(const n of names){const m=matrix(n);if(m.length)return{name:n,matrix:m}}return null}
const cfg=id=>C.entities.find(e=>e.id===id)||C.entities[0];
function headerRow(m){let best=-1,score=-1;m.forEach((r,i)=>{const c=(r||[]).map(norm);let s=0;if(c.some(x=>x.includes('accountname')||x==='customername'))s+=4;if(c.some(x=>x.includes('outstandingamount')||x==='totalreceivable'))s+=4;if(c.some(x=>x==='dimension'||x==='division'))s+=3;if(c.some(x=>x.includes('030')||x.includes('3160')||x.includes('>731')))s+=3;if(s>score){score=s;best=i}});return score>=7?best:-1}
function hmap(headers){const m={};headers.forEach((h,i)=>{const n=norm(h);if(!n)return;if(m.customer==null&&(n.includes('accountname')||n==='customername'||n==='customer'))m.customer=i;if(m.code==null&&(n.includes('accountcode')||n==='account'))m.code=i;if(m.division==null&&(n==='dimension'||n==='division'))m.division=i;if(m.divCode==null&&n==='div')m.divCode=i;if(m.total==null&&(n.includes('outstandingamount')||n==='totalreceivable'||n==='total'))m.total=i;[
['0_30',/^(a)?030$|^0to30$|^1m/],['31_60',/^3160$|^31to60$|^2m/],['61_90',/^6190$|^61to90$|^3m/],['91_120',/^91120$|^91to120$|^4m/],['121_150',/^121150$|^121to150$|^5m/],['151_180',/^151180$|^151to180$|^6m/],['181_210',/^181210$|^181to210$|^7m/],['211_240',/^211240$|^211to240$|^8m/],['241_270',/^241270$|^241to270$|^9m/],['271_300',/^271300$|^271to300$|^10m/],['301_330',/^301330$|^301to330$|^11m/],['331_365',/^331365$|^331to365$|^12m/],['366_730',/^366730$|^>1yr/],['gt731',/^>731$|^>2yr/],['gt180',/^>180$|^over180/],['gt90',/^>90$|^above90days|^over90/]
].forEach(([k,rx])=>{if(m[k]==null&&rx.test(n))m[k]=i})});return m}
const BK=['0_30','31_60','61_90','91_120','121_150','151_180','181_210','211_240','241_270','271_300','301_330','331_365','366_730','gt731'];
function parseEntity(e){
  const src=first(e.sheets);
  if(!src)return{entity:e,rows:[]};

  const m=src.matrix,h=headerRow(m);
  if(h<0)return{entity:e,rows:[]};

  const map=hmap((m[h]||[]).map(clean)),rows=[];

  for(let i=h+1;i<m.length;i++){
    const r=m[i]||[],
      customer=clean(r[map.customer]),
      division=clean(r[map.division]),
      total=Math.max(0,num(r[map.total]));

    if(!customer||/^total$|^check$/i.test(customer))continue;

    const b={};
    BK.forEach(k=>b[k]=map[k]==null?0:Math.max(0,num(r[map[k]])));

    if(!total&&!BK.some(k=>b[k]))continue;

    // Derive overdue balances only from the detailed aging buckets.
    // The summary columns (>90 / >180) in the ERP sheet can sit in a
    // separate report block and may not align with the customer row.
    const bucketTotal=BK.reduce((a,k)=>a+b[k],0);
    const bucketOver90=BK.slice(3).reduce((a,k)=>a+b[k],0);
    const bucketOver180=BK.slice(6).reduce((a,k)=>a+b[k],0);

    // Never allow an aging balance to exceed the customer's total.
    // This also protects ALU and ALIS from misaligned summary columns.
    const reliableBase=total>0?total:bucketTotal;
    const over90=Math.min(reliableBase,Math.max(0,bucketOver90));
    const over180=Math.min(over90,Math.max(0,bucketOver180));

    rows.push({
      customer,
      code:clean(r[map.code]),
      division:division||'Unassigned',
      divCode:clean(r[map.divCode])||'',
      entityId:e.id,
      entityLabel:e.label,
      total:reliableBase,
      over90,
      over180,
      buckets:b,
      fx:e.fx,
      totalAED:reliableBase*e.fx,
      over90AED:over90*e.fx,
      over180AED:over180*e.fx
    });
  }

  return{entity:e,source:src.name,rows};
}
function parseAll(){S.parsed={};C.entities.filter(e=>e.id!=='GROUP').forEach(e=>S.parsed[e.id]=parseEntity(e))}
function rows(){return S.entity==='GROUP'?Object.values(S.parsed).flatMap(x=>x.rows):(S.parsed[S.entity]||{rows:[]}).rows}
function aggregate(rs){
  const o={
    total:0,over60:0,over90:0,over180:0,over1yr:0,over2yr:0,current:0,
    customers:rs.length,divisions:{},buckets:{}
  };
  BK.forEach(k=>o.buckets[k]=0);

  rs.forEach(r=>{
    const f=S.entity==='GROUP'?r.fx:1,
      t=S.entity==='GROUP'?r.totalAED:r.total,
      o60=(BK.slice(2).reduce((a,k)=>a+(r.buckets[k]||0),0))*f,
      o90=S.entity==='GROUP'?r.over90AED:r.over90,
      o180=S.entity==='GROUP'?r.over180AED:r.over180,
      o1=((r.buckets['366_730']||0)+(r.buckets.gt731||0))*f,
      o2=(r.buckets.gt731||0)*f;

    o.total+=t;
    o.over60+=Math.min(t,Math.max(0,o60));
    o.over90+=o90;
    o.over180+=o180;
    o.over1yr+=Math.min(t,Math.max(0,o1));
    o.over2yr+=Math.min(t,Math.max(0,o2));
    o.current+=t-o90;

    const key=r.division||'Unassigned';
    if(!o.divisions[key])o.divisions[key]={total:0,over60:0,over90:0,over180:0,over1yr:0,over2yr:0};
    o.divisions[key].total+=t;
    o.divisions[key].over60+=Math.min(t,Math.max(0,o60));
    o.divisions[key].over90+=o90;
    o.divisions[key].over180+=o180;
    o.divisions[key].over1yr+=Math.min(t,Math.max(0,o1));
    o.divisions[key].over2yr+=Math.min(t,Math.max(0,o2));

    BK.forEach(k=>o.buckets[k]+=(r.buckets[k]||0)*f);
  });
  return o;
}
const currency=()=>S.entity==='GROUP'?'AED':cfg(S.entity).currency;
function entityTabs(){const root=$('recvEntityTabs');if(!root)return;root.innerHTML=C.entities.map(e=>{const ok=e.id==='GROUP'||(S.parsed[e.id]&&S.parsed[e.id].rows.length);return`<button class="recv-pill ${S.entity===e.id?'active':''}" data-e="${e.id}" ${ok?'':'disabled'}>${esc(e.label)}${e.id==='ALU'?' · SAR':e.id==='ALIS'?' · OMR':''}</button>`}).join('');root.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{S.entity=b.dataset.e;render()})}
function sectionTabs(){const root=$('recvSectionTabs');if(!root)return;const t=[['overview','Overview'],['aging','Aging Analysis'],['customers','Top Customers'],['movement','Movement Analysis'],['collections','Collections Performance']];root.innerHTML=t.map(x=>`<button class="recv-subtab ${S.section===x[0]?'active':''}" data-s="${x[0]}">${x[1]}</button>`).join('');root.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{S.section=b.dataset.s;sectionTabs();content()})}
function kpi(l,v,m,c){return`<div class="card kpi recv-kpi"><div class="lbl">${esc(l)}</div><div class="val num ${c||''}">${esc(v)}</div><div class="meta">${esc(m)}</div></div>`}
function bars(items,ccy){const max=Math.max(1,...items.map(x=>Math.abs(x.value)));return`<div class="recv-bars">${items.map(x=>`<div class="recv-bar-row"><div class="recv-bar-label">${esc(x.label)}</div><div class="recv-bar-track"><div class="recv-bar-fill" style="width:${Math.max(1,Math.abs(x.value)/max*100)}%"></div></div><div class="recv-bar-value">${ccy} ${fmt(x.value)}</div></div>`).join('')}</div>`}
function topTable(rs,field,title){
  const ccy=currency(),
    f=S.entity==='GROUP'?field+'AED':field,
    sorted=rs.filter(r=>r[f]>0).sort((a,b)=>b[f]-a[f]),
    grand=sorted.reduce((a,r)=>a+r[f],0);

  return`<div class="card panel recv-panel">
    <div class="panelhead"><div>
      <h3>${esc(title.replace(/^Top 10 /,'All '))}</h3>
      <p class="hint">${sorted.length} customers · Amount descending</p>
    </div></div>
    <div class="recv-table-wrap"><table class="recv-table recv-customer-table">
      <thead><tr>
        <th>#</th><th>Customer</th><th>Entity</th><th>Division</th>
        <th>Amount (${ccy})</th><th class="recv-pct-head">%</th>
      </tr></thead>
      <tbody>${sorted.map((r,i)=>`<tr>
        <td>${i+1}</td>
        <td class="recv-customer-name">${esc(r.customer)}</td>
        <td>${esc(r.entityLabel||r.entityId||cfg(S.entity).label)}</td>
        <td>${esc(r.division)}</td>
        <td class="num">${fmt(r[f])}</td>
        <td class="num recv-pct-cell">${pct(grand?r[f]/grand*100:0)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function divisionClass(name){
  const n=clean(name).toUpperCase();
  if(['CONSTRUCTION','MAST CLIMBERS','EVENTS'].includes(n))return'EPC';
  if(['POWERED ACCESS','SITE SERVICES'].includes(n))return'S&R';
  if(n==='FILM PRODUCTION')return'FP';
  if(n==='GENERAL')return'GEN';
  if(n==='OIL & GAS'||n==='OIL AND GAS')return'O&G';
  return'OTHER';
}

function divisionClassSummary(rs){
  const c=currency(),groups={EPC:0,'S&R':0,FP:0,GEN:0,'O&G':0,OTHER:0};
  rs.forEach(r=>{
    const amount=S.entity==='GROUP'?r.totalAED:r.total;
    groups[divisionClass(r.division)]+=amount;
  });
  const total=Object.values(groups).reduce((a,v)=>a+v,0);
  const order=['EPC','S&R','FP','GEN','O&G','OTHER'];
  const rows=order.filter(k=>groups[k]!==0||k!=='OTHER').map(k=>`
    <tr>
      <td class="rowhead">${esc(k)}</td>
      <td class="num">${fmt(groups[k])}</td>
      <td class="num recv-pct-cell">${pct(total?groups[k]/total*100:0)}</td>
    </tr>`).join('');
  return`<div class="card panel recv-panel">
    <div class="panelhead"><div>
      <h3>Receivables by Business Classification</h3>
      <p class="hint">EPC: Construction, Mast Climbers, Events · S&amp;R: Powered Access, Site Services</p>
    </div></div>
    <div class="recv-table-wrap"><table class="recv-table">
      <thead><tr><th>DIV</th><th>Amount (${esc(c)})</th><th class="recv-pct-head">%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function entityDivisionSummary(rs){
  const c=currency(),grouped={};

  rs.forEach(r=>{
    const factor=S.entity==='GROUP'?r.fx:1;
    const entity=S.entity==='GROUP'?(r.entityLabel||r.entityId||'Unknown'):cfg(S.entity).label;
    const division=r.division||'Unassigned';
    const divCode=r.divCode||'';
    const key=[entity,division,divCode].join('|');

    if(!grouped[key])grouped[key]={
      entity,division,divCode,total:0,under90:0,over90:0,over1yr:0,over2yr:0
    };

    const total=(S.entity==='GROUP'?r.totalAED:r.total);
    const over90=(S.entity==='GROUP'?r.over90AED:r.over90);
    const over1yr=((r.buckets['366_730']||0)+(r.buckets.gt731||0))*factor;
    const over2yr=(r.buckets.gt731||0)*factor;

    grouped[key].total+=total;
    grouped[key].over90+=Math.min(total,Math.max(0,over90));
    grouped[key].under90+=Math.max(0,total-Math.min(total,Math.max(0,over90)));
    grouped[key].over1yr+=Math.min(total,Math.max(0,over1yr));
    grouped[key].over2yr+=Math.min(total,Math.max(0,over2yr));
  });

  const detail=Object.values(grouped).sort((a,b)=>
    a.entity.localeCompare(b.entity)||b.total-a.total||a.division.localeCompare(b.division)
  );

  const totals={};
  detail.forEach(x=>{
    if(!totals[x.entity])totals[x.entity]={
      entity:x.entity,division:'Total Receivable',divCode:'',
      total:0,under90:0,over90:0,over1yr:0,over2yr:0
    };
    ['total','under90','over90','over1yr','over2yr'].forEach(k=>totals[x.entity][k]+=x[k]);
  });

  const rows=[];
  let lastEntity='';
  detail.forEach(x=>{
    if(lastEntity&&lastEntity!==x.entity)rows.push(totals[lastEntity]);
    rows.push(x);
    lastEntity=x.entity;
  });
  if(lastEntity)rows.push(totals[lastEntity]);

  if(S.entity==='GROUP'){
    const g={entity:'Group',division:'Group Receivable',divCode:'',total:0,under90:0,over90:0,over1yr:0,over2yr:0};
    Object.values(totals).forEach(x=>['total','under90','over90','over1yr','over2yr'].forEach(k=>g[k]+=x[k]));
    rows.push(g);
  }

  const body=rows.map(x=>{
    const isTotal=/total receivable|group receivable/i.test(x.division);
    const p90=x.total?x.over90/x.total*100:0;
    const p1=x.total?x.over1yr/x.total*100:0;
    const p2=x.total?x.over2yr/x.total*100:0;
    return `<tr class="${isTotal?'recv-summary-total':''}">
      <td class="rowhead">${esc(x.entity)}</td>
      <td>${esc(x.division)}</td>
      <td>${esc(x.divCode)}</td>
      <td class="num">${fmt(x.total)}</td>
      <td class="num">${fmt(x.under90)}</td>
      <td class="num">${fmt(x.over90)}</td>
      <td class="num recv-pct-cell">${pct(p90)}</td>
      <td class="num">${fmt(x.over1yr)}</td>
      <td class="num recv-pct-cell">${pct(p1)}</td>
      <td class="num">${fmt(x.over2yr)}</td>
      <td class="num recv-pct-cell">${pct(p2)}</td>
    </tr>`;
  }).join('');

  return `<div class="card panel recv-panel">
    <div class="panelhead"><div>
      <h3>Receivables by Entity & Division</h3>
      <p class="hint">EPC, S&amp;R and other division classifications · ${esc(c)}</p>
    </div></div>
    <div class="recv-table-wrap"><table class="recv-table recv-summary-table">
      <thead><tr>
        <th>Entity</th><th>Division</th><th>DIV</th><th>Total</th>
        <th>&lt;90 Days</th><th>&gt;90 Days</th><th class="recv-pct-head">&gt;90 %</th>
        <th>&gt;1 Year</th><th class="recv-pct-head">&gt;1 Year %</th>
        <th>&gt;2 Years</th><th class="recv-pct-head">&gt;2 Years %</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  </div>`;
}
function overview(rs,a){
  const c=currency(),p90=a.total?a.over90/a.total*100:0,p180=a.total?a.over180/a.total*100:0,
    divs=Object.entries(a.divisions).map(([label,x])=>({
      label,value:x.total,share:a.total?x.total/a.total*100:0
    })).sort((x,y)=>y.value-x.value);

  const divRows=divs.map(x=>`<tr>
    <td class="rowhead">${esc(x.label)}</td>
    <td class="num">${fmt(x.value)}</td>
    <td class="num recv-pct-cell">${pct(x.share)}</td>
  </tr>`).join('');

  return`<div class="grid kpis recv-kpis">
    ${kpi('Total Receivables',c+' '+fmt(a.total),a.customers+' customer balances')}
    ${kpi('Current / ≤90 Days',c+' '+fmt(a.current),pct(100-p90)+' of receivables','pos')}
    ${kpi('Over 90 Days',c+' '+fmt(a.over90),pct(p90)+' of receivables',p90>35?'neg':'')}
    ${kpi('Over 180 Days',c+' '+fmt(a.over180),pct(p180)+' of receivables',p180>15?'neg':'')}
  </div>
  <div class="recv-two">
    <div class="card panel recv-panel">
      <div class="panelhead"><div><h3>Receivables by Division</h3></div></div>
      <div class="recv-table-wrap"><table class="recv-table">
        <thead><tr><th>Division</th><th>Amount (${esc(c)})</th><th class="recv-pct-head">%</th></tr></thead>
        <tbody>${divRows}</tbody>
      </table></div>
    </div>
    ${divisionClassSummary(rs)}
  </div>
  ${topTable(rs,'total','All Customers')}`;
}
function aging(a,rs){
  const c=currency(),
    labels={'0_30':'0–30','31_60':'31–60','61_90':'61–90','91_120':'91–120','121_150':'121–150','151_180':'151–180','181_210':'181–210','211_240':'211–240','241_270':'241–270','271_300':'271–300','301_330':'301–330','331_365':'331–365','366_730':'366–730','gt731':'>731'},
    items=Object.keys(labels).map(k=>({label:labels[k],value:a.buckets[k]})),
    dr=Object.entries(a.divisions).sort((x,y)=>y[1].total-x[1].total).map(([d,x])=>{
      const under90=Math.max(0,x.total-x.over90),
        pUnder90=x.total?under90/x.total*100:0,
        p60=x.total?x.over60/x.total*100:0,
        p90=x.total?x.over90/x.total*100:0,
        p1=x.total?x.over1yr/x.total*100:0,
        p2=x.total?x.over2yr/x.total*100:0;
      return `<tr>
        <td class="rowhead">${esc(d)}</td>
        <td class="num">${fmt(x.total)}</td>
        <td class="num">${fmt(under90)}</td>
        <td class="num recv-pct-cell">${pct(pUnder90)}</td>
        <td class="num">${fmt(x.over60)}</td>
        <td class="num recv-pct-cell">${pct(p60)}</td>
        <td class="num">${fmt(x.over90)}</td>
        <td class="num recv-pct-cell">${pct(p90)}</td>
        <td class="num">${fmt(x.over1yr)}</td>
        <td class="num recv-pct-cell">${pct(p1)}</td>
        <td class="num">${fmt(x.over2yr)}</td>
        <td class="num recv-pct-cell">${pct(p2)}</td>
      </tr>`;
    }).join('');

  return `<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Aging Distribution</h3></div></div>${bars(items,c)}
  </div>
  <div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Division Aging Summary</h3><p class="hint">Amounts and percentage of division total</p></div></div>
    <div class="recv-table-wrap"><table class="recv-table recv-aging-table">
      <thead><tr>
        <th>Division</th><th>Total</th>
        <th>&lt;90 Days</th><th class="recv-pct-head">&lt;90 %</th>
        <th>&gt;60 Days</th><th class="recv-pct-head">&gt;60 %</th>
        <th>&gt;90 Days</th><th class="recv-pct-head">&gt;90 %</th>
        <th>&gt;1 Year</th><th class="recv-pct-head">&gt;1 Year %</th>
        <th>&gt;2 Years</th><th class="recv-pct-head">&gt;2 Years %</th>
      </tr></thead>
      <tbody>${dr}</tbody>
    </table></div>
  </div>
  ${entityDivisionSummary(rs)}`;
}

function movementClass(name){
  const n=clean(name).toUpperCase();
  if(['CONSTRUCTION','MAST CLIMBERS','EVENTS'].includes(n))return'EPC';
  if(['POWERED ACCESS','SITE SERVICES'].includes(n))return'S&R';
  if(n==='FILM PRODUCTION')return'FP';
  if(n==='GENERAL'||n.includes('RELATED PART'))return'GEN';
  if(n==='OIL & GAS'||n==='OIL AND GAS')return'O&G';
  return'OTHER';
}
function sliceBlock(m,start,end){return(m||[]).map(r=>(r||[]).slice(start,end+1))}
function detectBlockHeader(block,required){
  let best=-1,score=-1;
  block.forEach((r,i)=>{
    const h=(r||[]).map(norm);let s=0;
    required.forEach(x=>{if(h.some(v=>v.includes(x)))s++});
    if(s>score){score=s;best=i}
  });
  return score>=Math.max(2,required.length-1)?best:-1;
}
function movementMap(headers){
  const m={};
  headers.forEach((h,i)=>{
    const n=norm(h);
    if(m.code==null&&(n.includes('acccode')||n.includes('accountcode')))m.code=i;
    if(m.name==null&&(n.includes('accname')||n.includes('accountname')))m.name=i;
    if(m.div==null&&(n.includes('divcode')||n==='division'||n==='dimension'))m.div=i;
    if(m.billing==null&&n.includes('dramt')&&!n.includes('jnrl')&&!n.includes('crnt'))m.billing=i;
    if(m.receipt==null&&n.includes('cramt')&&!n.includes('jnrl')&&!n.includes('crnt'))m.receipt=i;
    if(m.cheque==null&&n.includes('dramt')&&n.includes('jnrl'))m.cheque=i;
    if(m.advance==null&&n.includes('cramt')&&n.includes('jnrl'))m.advance=i;
    if(m.creditReverse==null&&n.includes('dramt')&&n.includes('crnt'))m.creditReverse=i;
    if(m.creditIssue==null&&n.includes('cramt')&&n.includes('crnt'))m.creditIssue=i;
  });
  return m;
}
function parseMovementDetails(){
  const source=matrix(MOVEMENT_CONFIG.movementSheet),out={};
  MOVEMENT_CONFIG.currentBlocks.forEach(cfg=>{
    const block=sliceBlock(source,cfg.start,cfg.end),
      h=detectBlockHeader(block,['acccode','accname','divcode','dramt','cramt']),
      map=h>=0?movementMap((block[h]||[]).map(clean)):{},
      rows=[];
    if(h>=0)for(let i=h+1;i<block.length;i++){
      const r=block[i]||[],name=clean(r[map.name]),division=clean(r[map.div]);
      if(!name&&!division)continue;
      const row={
        name,division:division||'Unassigned',classCode:movementClass(division),
        billing:Math.max(0,num(r[map.billing])),
        receipt:Math.max(0,num(r[map.receipt])),
        cheque:Math.max(0,num(r[map.cheque])),
        advance:Math.max(0,num(r[map.advance])),
        creditReverse:Math.max(0,num(r[map.creditReverse])),
        creditIssue:Math.max(0,num(r[map.creditIssue]))
      };
      if(row.billing||row.receipt||row.cheque||row.advance||row.creditReverse||row.creditIssue)rows.push(row);
    }
    out[cfg.id]={rows};
  });
  return out;
}
function lastPeriodMap(headers){
  const m={};
  headers.forEach((h,i)=>{
    const n=norm(h);
    if(m.customer==null&&(n.includes('accountname')||n.includes('customername')))m.customer=i;
    if(m.division==null&&(n==='dimension'||n==='division'))m.division=i;
    if(m.total==null&&(n.includes('outstandingamount')||n==='totalreceivable'))m.total=i;
    const t=[['0_30',/^(a)?030$/],['31_60',/^3160$/],['61_90',/^6190$/],['91_120',/^91120$/],
      ['121_150',/^121150$/],['151_180',/^151180$/],['181_210',/^181210$/],['211_240',/^211240$/],
      ['241_270',/^241270$/],['271_300',/^271300$/],['301_330',/^301330$/],['331_365',/^331365$/],
      ['366_730',/^366730$/],['gt731',/^>731$/]];
    t.forEach(([k,rx])=>{if(m[k]==null&&rx.test(n))m[k]=i});
  });
  return m;
}
function parseLastPeriod(){
  const source=matrix(MOVEMENT_CONFIG.lastPeriodSheet),out={};
  MOVEMENT_CONFIG.lastBlocks.forEach(cfg=>{
    const block=sliceBlock(source,cfg.start,cfg.end),
      h=detectBlockHeader(block,['accountname','dimension','outstandingamount']),
      map=h>=0?lastPeriodMap((block[h]||[]).map(clean)):{},
      rows=[];
    if(h>=0)for(let i=h+1;i<block.length;i++){
      const r=block[i]||[],customer=clean(r[map.customer]),division=clean(r[map.division]);
      if(!customer||/^total$|^check$/i.test(customer))continue;
      const buckets={};BK.forEach(k=>buckets[k]=map[k]==null?0:Math.max(0,num(r[map[k]])));
      const total=Math.max(0,num(r[map.total]))||BK.reduce((a,k)=>a+buckets[k],0);
      if(!total&&!BK.some(k=>buckets[k]))continue;
      rows.push({division:division||'Unassigned',classCode:movementClass(division),total,
        over90:Math.min(total,BK.slice(3).reduce((a,k)=>a+buckets[k],0))});
    }
    out[cfg.id]={rows};
  });
  return out;
}
function movementLines(){
  const details=parseMovementDetails(),last=parseLastPeriod(),lines=[];
  MOVEMENT_CONFIG.currentBlocks.forEach(cfg=>{
    const f=cfg.fx,current=(S.parsed[cfg.id]||{rows:[]}).rows,
      movement=(details[cfg.id]||{rows:[]}).rows,previous=(last[cfg.id]||{rows:[]}).rows;
    ['EPC','S&R','FP','GEN','O&G'].forEach(div=>{
      const cur=current.filter(r=>movementClass(r.division)===div),
        mov=movement.filter(r=>r.classCode===div),prv=previous.filter(r=>r.classCode===div);
      const x={
        country:cfg.country,entity:cfg.label,division:div,
        opening:prv.reduce((a,r)=>a+r.total*f,0),
        billing:mov.reduce((a,r)=>a+r.billing*f,0),
        receipt:mov.reduce((a,r)=>a+r.receipt*f,0),
        cheque:mov.reduce((a,r)=>a+r.cheque*f,0),
        creditNotes:mov.reduce((a,r)=>a+(r.advance+r.creditIssue-r.creditReverse)*f,0),
        closing:cur.reduce((a,r)=>a+r.total*f,0),
        opening90:prv.reduce((a,r)=>a+r.over90*f,0),
        closing90:cur.reduce((a,r)=>a+r.over90*f,0)
      };
      x.movement=x.closing90-x.opening90;
      x.movementPct=x.opening90?x.movement/x.opening90*100:0;
      if(Object.keys(x).some(k=>typeof x[k]==='number'&&x[k]!==0))lines.push(x);
    });
  });
  return lines;
}
function movementTotal(rows,label){
  const x={country:label,entity:'',division:'Total'};
  ['opening','billing','receipt','cheque','creditNotes','closing','opening90','closing90','movement']
    .forEach(k=>x[k]=rows.reduce((a,r)=>a+(r[k]||0),0));
  x.movementPct=x.opening90?x.movement/x.opening90*100:0;
  return x;
}
function movementChart(lines){
  const g={};lines.forEach(r=>{if(!g[r.division])g[r.division]={opening:0,closing:0};g[r.division].opening+=r.opening90;g[r.division].closing+=r.closing90});
  const max=Math.max(1,...Object.values(g).flatMap(x=>[x.opening,x.closing]));
  return`<div class="card panel recv-panel"><div class="panelhead"><div><h3>Receivables Aged Over 90 Days by Division</h3></div></div>
    <div class="recv-movement-chart">${Object.entries(g).map(([d,x])=>`<div class="recv-move-group"><div class="recv-move-label">${esc(d)}</div><div>
      <div class="recv-move-line"><span>Opening</span><i class="open" style="width:${Math.max(1,x.opening/max*100)}%"></i><b>${fmt(x.opening)}</b></div>
      <div class="recv-move-line"><span>Closing</span><i class="close" style="width:${Math.max(1,x.closing/max*100)}%"></i><b>${fmt(x.closing)}</b></div>
    </div></div>`).join('')}</div></div>`;
}
function movementBrief(lines){
  const t=movementTotal(lines,'Group'),change=t.closing-t.opening,aged=t.closing90-t.opening90;
  return`<div class="card panel recv-panel recv-brief"><div class="panelhead"><div><h3>Executive Summary Brief</h3></div></div>
    <p>Group receivables moved from <strong>AED ${fmt(t.opening)}</strong> to <strong>AED ${fmt(t.closing)}</strong>, a ${change<=0?'reduction':'increase'} of <strong>AED ${fmt(Math.abs(change))}</strong>.</p>
    <p>Receivables aged over 90 days moved from <strong>AED ${fmt(t.opening90)}</strong> to <strong>AED ${fmt(t.closing90)}</strong>, a ${aged<=0?'improvement':'deterioration'} of <strong>AED ${fmt(Math.abs(aged))}</strong>.</p>
  </div>`;
}
function renderMovementAnalysis(){
  const lines=movementLines();
  if(!lines.length)return`<div class="card panel recv-panel"><div class="empty">Movement data was not detected. Confirm Apps Script exports <strong>DR-Movement Details</strong> and <strong>DR-Last Period</strong>.</div></div>`;
  const groups={};lines.forEach(r=>{if(!groups[r.country])groups[r.country]=[];groups[r.country].push(r)});
  const rows=[];Object.keys(groups).forEach(c=>{rows.push(...groups[c]);rows.push(movementTotal(groups[c],c))});rows.push(movementTotal(lines,'Group'));
  return`<div class="card panel recv-panel"><div class="panelhead"><div><h3>Receivable Movement Analysis by Country &amp; Division</h3><p class="hint">AED · Current movement versus archived prior period</p></div></div>
    <div class="recv-table-wrap"><table class="recv-table recv-movement-table"><thead><tr>
      <th>Country</th><th>Entity</th><th>Division</th><th>Opening</th><th>Billing</th><th>Receipt</th><th>Chq RTN/Refund</th>
      <th>Credit Notes / Adjustments</th><th>Closing</th><th>Opening &gt;90</th><th>Closing &gt;90</th><th>Movement</th><th>%</th>
    </tr></thead><tbody>${rows.map(r=>{const total=r.division==='Total',mc=r.movement>0?'recv-bad':r.movement<0?'recv-good':'';return`<tr class="${total?'recv-movement-total':''}">
      <td>${esc(r.country)}</td><td>${esc(r.entity)}</td><td>${esc(r.division)}</td><td class="num">${fmt(r.opening)}</td><td class="num">${fmt(r.billing)}</td>
      <td class="num">${fmt(r.receipt)}</td><td class="num">${fmt(r.cheque)}</td><td class="num">${fmt(r.creditNotes)}</td><td class="num">${fmt(r.closing)}</td>
      <td class="num">${fmt(r.opening90)}</td><td class="num">${fmt(r.closing90)}</td><td class="num ${mc}">${fmt(r.movement)}</td>
      <td class="num recv-pct-cell ${mc}">${pct(r.movementPct)}</td></tr>`}).join('')}</tbody></table></div></div>
    ${movementChart(lines)}${movementBrief(lines)}`;
}
function optional(kind){const names=C[kind],src=first(names);if(!src)return`<div class="card panel recv-panel"><div class="empty">${kind==='movement'?'Movement Analysis requires Receivable History or Receivable Movement.':'Collection reporting requires Collection Targets and Collection Actuals.'} Add the optional sheet(s) to Google Sheets and Apps Script, then refresh.</div></div>`;return`<div class="card panel recv-panel"><div class="panelhead"><div><h3>${kind==='movement'?'Receivable Movement Analysis':'Collections Performance'}</h3></div></div><div class="recv-detected">Data source detected: <strong>${esc(src.name)}</strong>. Use the standard template supplied in the ZIP.</div></div>`}
function content(){const root=$('recvContent');if(!root)return;const rs=rows(),a=aggregate(rs);if(!rs.length){root.innerHTML='<div class="card panel"><div class="empty">No receivable rows detected. Confirm the ERP tabs are exported and contain Account Name, Dimension, Outstanding Amount and aging headers.</div></div>';return}if(S.section==='aging')root.innerHTML=aging(a,rs);else if(S.section==='customers')root.innerHTML=`${topTable(rs,'total','All Outstanding Customers')}${topTable(rs,'over180','All Customers Over 180 Days')}`;else if(S.section==='movement')root.innerHTML=renderMovementAnalysis();else if(S.section==='collections')root.innerHTML=optional('targets');else root.innerHTML=overview(rs,a)}
function render(){entityTabs();sectionTabs();const c=cfg(S.entity),sub=$('recvSubtitle');if(sub)sub.textContent=S.entity==='GROUP'?'Group converted to AED · SAR × 0.975 · OMR × 9.5'+(S.updated?' · Updated '+S.updated:''):`${c.label} shown in ${c.currency}${c.fx!==1?' · Group conversion rate '+c.fx+' AED':''}${S.updated?' · Updated '+S.updated:''}`;content()}
function styles(){if($('receivablesModuleStyles'))return;const s=document.createElement('style');s.id='receivablesModuleStyles';s.textContent=`#view-receivables .recv-toolbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#view-receivables .recv-entity-tabs,#view-receivables .recv-section-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}#view-receivables .recv-pill,#view-receivables .recv-subtab{border:1px solid #d8d1c4;background:#fff;border-radius:999px;padding:8px 13px;font-weight:700;cursor:pointer}#view-receivables .recv-pill.active,#view-receivables .recv-subtab.active{background:#0b3767;color:#fff;border-color:#0b3767}#view-receivables .recv-pill:disabled{opacity:.45}#view-receivables .recv-subtab{border-radius:8px}#view-receivables .recv-kpis{grid-template-columns:repeat(4,minmax(180px,1fr))}#view-receivables .recv-kpi .val{font-size:1.35rem}#view-receivables .recv-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}#view-receivables .recv-panel{margin-top:14px;overflow:hidden}#view-receivables .recv-bar-row{display:grid;grid-template-columns:minmax(125px,190px) 1fr 125px;gap:10px;align-items:center;margin:9px 0}#view-receivables .recv-bar-label{font-weight:650;overflow:hidden;text-overflow:ellipsis}#view-receivables .recv-bar-track{height:16px;background:#e9edf2;border-radius:20px;overflow:hidden}#view-receivables .recv-bar-fill{height:100%;background:linear-gradient(90deg,#0b3767,#4b89c8);border-radius:20px}#view-receivables .recv-bar-value{text-align:right;font-variant-numeric:tabular-nums}#view-receivables .recv-table-wrap{overflow:auto}#view-receivables .recv-table{width:100%;border-collapse:collapse}#view-receivables .recv-table th{background:#0b3767;color:#fff;padding:9px;text-align:left;white-space:nowrap}#view-receivables .recv-table td{padding:8px 9px;border-bottom:1px solid #e7e3dc}#view-receivables .recv-table tbody tr:nth-child(even){background:#f7fafc}
#view-receivables .recv-summary-table{min-width:1120px}

#view-receivables .recv-customer-table{min-width:900px}
#view-receivables .recv-customer-name{text-align:left!important;text-transform:capitalize;font-size:.84rem;font-weight:500;min-width:300px;white-space:normal}
#view-receivables .recv-pct-head{background:#245f91!important}
#view-receivables .recv-pct-cell{background:#eef8f3!important;color:#245f52;font-weight:700}
#view-receivables .recv-table tbody tr:nth-child(even) .recv-pct-cell{background:#e3f3eb!important}
#view-receivables .recv-summary-total .recv-pct-cell{background:#cfe4d8!important}
#view-receivables .recv-aging-table{min-width:1260px}

#view-receivables .recv-movement-table{min-width:1550px}
#view-receivables .recv-movement-total td{font-weight:800;background:#dce9f8!important;border-top:2px solid #9fb9dc}
#view-receivables .recv-movement-total:last-child td{background:#d8d8d8!important;border-top:3px solid #666}
#view-receivables .recv-good{color:#14824b!important;font-weight:800}
#view-receivables .recv-bad{color:#c0392b!important;font-weight:800}
#view-receivables .recv-movement-chart{padding:8px}
#view-receivables .recv-move-group{display:grid;grid-template-columns:90px 1fr;gap:10px;margin:14px 0}
#view-receivables .recv-move-label{font-weight:800}
#view-receivables .recv-move-line{display:grid;grid-template-columns:65px 1fr 115px;gap:8px;align-items:center;margin:5px 0}
#view-receivables .recv-move-line i{height:18px;border-radius:3px;display:block}
#view-receivables .recv-move-line i.open{background:#74a8e8}
#view-receivables .recv-move-line i.close{background:#58c993}
#view-receivables .recv-move-line b{text-align:right}
#view-receivables .recv-brief p{line-height:1.6;margin:10px 0}


#view-receivables .recv-summary-total td{font-weight:800;background:#dce9f8!important;border-top:2px solid #9fb9dc}
#view-receivables .recv-summary-total:last-child td{background:#d9d9d9!important;border-top:3px solid #6e6e6e}#view-receivables .recv-detected{padding:12px 16px;background:#eef6ff;border-radius:8px;margin:12px}@media(max-width:1100px){#view-receivables .recv-kpis{grid-template-columns:repeat(2,1fr)}#view-receivables .recv-two{grid-template-columns:1fr}}@media(max-width:650px){#view-receivables .recv-kpis{grid-template-columns:1fr}}`;document.head.appendChild(s)}
function ui(){styles();const nav=$('nav')||document.querySelector('nav.tabs');if(nav&&!nav.querySelector('[data-view="receivables"]')){const b=document.createElement('button');b.type='button';b.dataset.view='receivables';b.textContent='Receivables';const tx=nav.querySelector('[data-view="transactions"]');tx?nav.insertBefore(b,tx):nav.appendChild(b)}const main=document.querySelector('main');if(main&&!$('view-receivables')){const sec=document.createElement('section');sec.className='view';sec.id='view-receivables';sec.innerHTML=`<div class="card panel"><div class="panelhead recv-toolbar"><div><h2>Receivables Intelligence</h2><p class="hint" id="recvSubtitle">ERP aging, collections and movement analysis</p></div><button class="btn ghost" id="recvRefreshBtn">Refresh Receivables</button></div><div id="recvEntityTabs" class="recv-entity-tabs"></div><div id="recvSectionTabs" class="recv-section-tabs"></div><div id="recvContent"><div class="empty">Loading receivables…</div></div></div>`;main.appendChild(sec);$('recvRefreshBtn').onclick=refresh}}
function api(){for(const id of['googleSheetUrl','googleUrl','sheetApiUrl','appsScriptUrl']){const el=$(id);if(el&&clean(el.value))return clean(el.value)}for(const k of['cf_google_sheet_url','googleSheetUrl','cashflow_google_url','appsScriptUrl'])try{const v=localStorage.getItem(k);if(clean(v))return clean(v)}catch(_){}return clean(window.DEFAULT_GOOGLE_SHEET_URL||'')}
function jsonp(url){return new Promise((res,rej)=>{const cb='recvJsonp_'+Date.now()+'_'+Math.random().toString(36).slice(2),sc=document.createElement('script'),sep=url.includes('?')?'&':'?',tm=setTimeout(()=>{done();rej(new Error('Receivables request timed out.'))},120000);function done(){clearTimeout(tm);try{delete window[cb]}catch(_){window[cb]=undefined}if(sc.parentNode)sc.parentNode.removeChild(sc)}window[cb]=d=>{done();res(d)};sc.onerror=()=>{done();rej(new Error('Could not load Google Sheet endpoint.'))};sc.src=url+sep+'callback='+encodeURIComponent(cb)+'&t='+Date.now();document.body.appendChild(sc)})}
async function refresh(o){o=o||{};ui();const root=$('recvContent');if(root&&!o.silent)root.innerHTML='<div class="empty">Refreshing receivables…</div>';const url=api();if(!url){root.innerHTML='<div class="empty">Google Apps Script URL is not configured.</div>';return}try{S.payload=await jsonp(url);S.updated=S.payload&&S.payload.lastUpdated?new Date(S.payload.lastUpdated).toLocaleString():new Date().toLocaleString();parseAll();render()}catch(e){root.innerHTML='<div class="empty">Could not load receivables: '+esc(e.message)+'</div>'}}
function wrap(){if(S.wrapped||typeof window.refreshFromGoogleSheet!=='function')return false;const old=window.refreshFromGoogleSheet;window.refreshFromGoogleSheet=async function(){const r=await old.apply(this,arguments);await refresh({silent:true});return r};S.wrapped=true;return true}
function boot(){ui();const t=setInterval(()=>{ui();if(wrap())clearInterval(t)},250);setTimeout(()=>clearInterval(t),15000);setTimeout(()=>refresh({silent:true}),500)}
window.RECEIVABLES_INTELLIGENCE={refresh,render,state:S,config:C};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
