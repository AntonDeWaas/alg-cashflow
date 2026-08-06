// Receivables Intelligence Module v23.7 — flexible aging ranges
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
{id:'ALPS_UZ',label:'ALPS UZ',currency:'AED',fx:1,sheets:['DR-ALPS UZ-System']}
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

const S={payload:null,entity:'GROUP',section:'overview',parsed:{},updated:null,wrapped:false,
  agingFilter:{from:0,to:13,min:0,division:'ALL',customer:'ALL'},
  movementFilter:{from:6,to:13,min:0,division:'ALL',customer:'ALL'},
  customerFilter:{entity:'ALL',division:'ALL',customer:'',minimum:0},
  collection:{year:null,month:null,country:'GROUP',entity:'GROUP',division:'ALL',coreOnly:false}};
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
const BK_LABELS=['0–30','31–60','61–90','91–120','121–150','151–180','181–210','211–240','241–270','271–300','301–330','331–365','366–730','>731'];
function agingBucketClass(index){
  if(index>=6)return'recv-age-red';
  if(index>=3)return'recv-age-amber';
  return'recv-age-current';
}
function agingHeaderClass(index){
  if(index>=6)return'recv-age-head-red';
  if(index>=3)return'recv-age-head-amber';
  return'recv-age-head-current';
}

function agingRangeAmount(row,from,to,factor){
  return BK.slice(from,to+1).reduce((a,k)=>a+(Number(row.buckets&&row.buckets[k])||0),0)*(factor||1);
}
function agingFilterOptions(){
  const rs=rows();
  const divisions=[...new Set(rs.map(r=>r.division||'Unassigned'))].sort();
  const customers=[...new Set(rs.map(r=>r.customer).filter(Boolean))].sort();
  return {divisions,customers};
}
function agingFilterControls(kind){
  const f=kind==='movement'?S.movementFilter:S.agingFilter;
  const opts=agingFilterOptions();
  return `<div class="recv-aging-filter-block"><div class="recv-aging-filters" data-aging-kind="${kind}">
    <label>Age From<select data-aging-field="from">${BK_LABELS.map((x,i)=>`<option value="${i}" ${i===f.from?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Age To<select data-aging-field="to">${BK_LABELS.map((x,i)=>`<option value="${i}" ${i===f.to?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Minimum Outstanding<input data-aging-field="min" type="number" min="0" step="1000" value="${Number(f.min)||0}"></label>
    <label>Division<select data-aging-field="division">
      <option value="ALL">All divisions</option>
      ${opts.divisions.map(x=>`<option value="${esc(x)}" ${f.division===x?'selected':''}>${esc(x)}</option>`).join('')}
    </select></label>
    <label class="recv-aging-customer">Customer<select data-aging-field="customer">
      <option value="ALL">All customers</option>
      ${opts.customers.map(x=>`<option value="${esc(x)}" ${f.customer===x?'selected':''}>${esc(x)}</option>`).join('')}
    </select></label>
    <button type="button" data-aging-reset>Reset</button>
  </div><div class="recv-aging-filter-note">Select an aging range, division and customer. Minimum Outstanding applies to the selected aging range.</div></div>`;
}
function bindAgingFilterControls(){
  document.querySelectorAll('.recv-aging-filters').forEach(root=>{
    const kind=root.dataset.agingKind;
    const target=kind==='movement'?S.movementFilter:S.agingFilter;
    root.querySelectorAll('[data-aging-field]').forEach(control=>{
      control.onchange=()=>{
        const field=control.dataset.agingField;
        target[field]=(field==='division'||field==='customer')?control.value:Number(control.value)||0;
        if(target.from>target.to){
          if(field==='from')target.to=target.from;else target.from=target.to;
        }
        content();
      };
    });
    const reset=root.querySelector('[data-aging-reset]');
    if(reset)reset.onclick=()=>{
      if(kind==='movement')S.movementFilter={from:6,to:13,min:0,division:'ALL',customer:'ALL'};
      else S.agingFilter={from:0,to:13,min:0,division:'ALL',customer:'ALL'};
      content();
    };
  });
}

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
      total=num(r[map.total]);

    if(!customer||/^total$|^check$/i.test(customer))continue;

    const b={};
    BK.forEach(k=>b[k]=map[k]==null?0:num(r[map[k]]));

    if(!total&&!BK.some(k=>b[k]))continue;

    // Derive overdue balances only from the detailed aging buckets.
    // The summary columns (>90 / >180) in the ERP sheet can sit in a
    // separate report block and may not align with the customer row.
    const bucketTotal=BK.reduce((a,k)=>a+b[k],0);
    const bucketOver90=BK.slice(3).reduce((a,k)=>a+b[k],0);
    const bucketOver180=BK.slice(6).reduce((a,k)=>a+b[k],0);

    // Never allow an aging balance to exceed the customer's total.
    // This also protects ALU and ALIS from misaligned summary columns.
    const reliableBase=total!==0?total:bucketTotal;
    // Preserve signed customer balances. Credit balances must reduce the
    // entity/division control total instead of being silently discarded.
    const over90=bucketOver90;
    const over180=bucketOver180;

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

function rowAgingMetrics(r,factor){
  const f=Number(factor)||1;
  const bucket=k=>(Number(r.buckets&&r.buckets[k])||0)*f;
  const total=(S.entity==='GROUP'?Number(r.totalAED):Number(r.total))||0;
  const under90=BK.slice(0,3).reduce((a,k)=>a+bucket(k),0);
  const over60=BK.slice(2).reduce((a,k)=>a+bucket(k),0);
  const over90=BK.slice(3).reduce((a,k)=>a+bucket(k),0);
  const over180=BK.slice(6).reduce((a,k)=>a+bucket(k),0);
  const over1yr=bucket('366_730')+bucket('gt731');
  const over2yr=bucket('gt731');
  return {total,under90,over60,over90,over180,over1yr,over2yr};
}
function aggregate(rs){
  const o={
    total:0,over60:0,over90:0,over180:0,over1yr:0,over2yr:0,current:0,
    customers:rs.length,divisions:{},buckets:{}
  };
  BK.forEach(k=>o.buckets[k]=0);

  rs.forEach(r=>{
    const factor=S.entity==='GROUP'?r.fx:1;
    const m=rowAgingMetrics(r,factor);
    o.total+=m.total;
    o.over60+=m.over60;
    o.over90+=m.over90;
    o.over180+=m.over180;
    o.over1yr+=m.over1yr;
    o.over2yr+=m.over2yr;
    o.current+=m.under90;

    const key=r.division||'Unassigned';
    if(!o.divisions[key]){
      o.divisions[key]={total:0,under90:0,over60:0,over90:0,over180:0,over1yr:0,over2yr:0};
    }
    Object.keys(o.divisions[key]).forEach(k=>o.divisions[key][k]+=m[k]||0);
    BK.forEach(k=>o.buckets[k]+=(Number(r.buckets&&r.buckets[k])||0)*factor);
  });
  return o;
}
const currency=()=>S.entity==='GROUP'?'AED':cfg(S.entity).currency;
function entityTabs(){const root=$('recvEntityTabs');if(!root)return;root.innerHTML=C.entities.map(e=>{const ok=e.id==='GROUP'||(S.parsed[e.id]&&S.parsed[e.id].rows.length);return`<button class="recv-pill ${S.entity===e.id?'active':''}" data-e="${e.id}" ${ok?'':'disabled'}>${esc(e.label)}${e.id==='ALU'?' · SAR':e.id==='ALIS'?' · OMR':''}</button>`}).join('');root.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{S.entity=b.dataset.e;render()})}
function sectionTabs(){const root=$('recvSectionTabs');if(!root)return;const t=[['overview','Overview'],['aging','Aging Analysis'],['agingDetail','Aging Analysis Detail'],['customers','Top Customers'],['customerMovement','Aging Movement by Bracket'],['movement','Movement Analysis'],['collections','Collections Performance']];root.innerHTML=t.map(x=>`<button class="recv-subtab ${S.section===x[0]?'active':''}" data-s="${x[0]}">${x[1]}</button>`).join('');root.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{S.section=b.dataset.s;sectionTabs();content()})}
function kpi(l,v,m,c){return`<div class="card kpi recv-kpi"><div class="lbl">${esc(l)}</div><div class="val num ${c||''}">${esc(v)}</div><div class="meta">${esc(m)}</div></div>`}
function bars(items,ccy){const max=Math.max(1,...items.map(x=>Math.abs(x.value)));return`<div class="recv-bars">${items.map(x=>`<div class="recv-bar-row"><div class="recv-bar-label">${esc(x.label)}</div><div class="recv-bar-track"><div class="recv-bar-fill" style="width:${Math.max(1,Math.abs(x.value)/max*100)}%"></div></div><div class="recv-bar-value">${ccy} ${fmt(x.value)}</div></div>`).join('')}</div>`}

function customerFilterOptions(rs){
  const entities=[...new Set(rs.map(r=>r.entityLabel||r.entityId).filter(Boolean))].sort();
  const divisions=[...new Set(rs.map(r=>r.division||'Unassigned').filter(Boolean))].sort();
  const f=S.customerFilter;
  return `<div class="recv-customer-filters">
    <label>Entity<select data-customer-filter="entity">
      <option value="ALL">All entities</option>
      ${entities.map(x=>`<option value="${esc(x)}" ${f.entity===x?'selected':''}>${esc(x)}</option>`).join('')}
    </select></label>
    <label>Division<select data-customer-filter="division">
      <option value="ALL">All divisions</option>
      ${divisions.map(x=>`<option value="${esc(x)}" ${f.division===x?'selected':''}>${esc(x)}</option>`).join('')}
    </select></label>
    <label class="recv-customer-search">Customer<input data-customer-filter="customer" type="search"
      value="${esc(f.customer||'')}" placeholder="Customer name…"></label>
    <label>Minimum Outstanding<input data-customer-filter="minimum" type="number" min="0" step="1000"
      value="${Number(f.minimum)||0}"></label>
    <button type="button" data-customer-filter-reset>Reset</button>
  </div>`;
}
function applyCustomerFilter(rs,field){
  const f=S.customerFilter;
  const valueField=S.entity==='GROUP'?field+'AED':field;
  const q=clean(f.customer).toLowerCase();
  return rs.filter(r=>{
    const entity=r.entityLabel||r.entityId||'';
    if(f.entity!=='ALL'&&entity!==f.entity)return false;
    if(f.division!=='ALL'&&(r.division||'Unassigned')!==f.division)return false;
    if(q&&!clean(r.customer).toLowerCase().includes(q))return false;
    if((Number(r[valueField])||0)<(Number(f.minimum)||0))return false;
    return (Number(r[valueField])||0)>0;
  });
}
function bindCustomerFilters(){
  const root=document.querySelector('.recv-customer-filters');
  if(!root)return;
  root.querySelectorAll('[data-customer-filter]').forEach(control=>{
    control.onchange=control.oninput=()=>{
      const key=control.dataset.customerFilter;
      S.customerFilter[key]=key==='minimum'?(Number(control.value)||0):clean(control.value);
      content();
    };
  });
  const reset=root.querySelector('[data-customer-filter-reset]');
  if(reset)reset.onclick=()=>{
    S.customerFilter={entity:'ALL',division:'ALL',customer:'',minimum:0};
    content();
  };
}
function topTable(rs,field,title){
  const ccy=currency(),
    f=S.entity==='GROUP'?field+'AED':field,
    sorted=applyCustomerFilter(rs,field).sort((a,b)=>b[f]-a[f]),
    grand=sorted.reduce((a,r)=>a+r[f],0);

  return`<div class="card panel recv-panel">
    <div class="panelhead"><div>
      <h3>${esc(title.replace(/^Top 10 /,'All '))}</h3>
      <p class="hint">${sorted.length} customers · Amount descending</p>
    </div></div>
    <div class="recv-table-wrap recv-customer-scroll"><table class="recv-table recv-customer-table">
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
      entity,division,divCode,total:0,under90:0,over60:0,over90:0,over1yr:0,over2yr:0
    };

    const metrics=rowAgingMetrics(r,factor);
    grouped[key].total+=metrics.total;
    grouped[key].over60+=metrics.over60;
    grouped[key].over90+=metrics.over90;
    grouped[key].under90+=metrics.under90;
    grouped[key].over1yr+=metrics.over1yr;
    grouped[key].over2yr+=metrics.over2yr;
  });

  const detail=Object.values(grouped).sort((a,b)=>
    a.entity.localeCompare(b.entity)||b.total-a.total||a.division.localeCompare(b.division)
  );

  const totals={};
  detail.forEach(x=>{
    if(!totals[x.entity])totals[x.entity]={
      entity:x.entity,division:'Total Receivable',divCode:'',
      total:0,under90:0,over60:0,over90:0,over1yr:0,over2yr:0
    };
    ['total','under90','over60','over90','over1yr','over2yr'].forEach(k=>totals[x.entity][k]+=x[k]);
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
    const g={entity:'Group',division:'Group Receivable',divCode:'',total:0,under90:0,over60:0,over90:0,over1yr:0,over2yr:0};
    Object.values(totals).forEach(x=>['total','under90','over60','over90','over1yr','over2yr'].forEach(k=>g[k]+=x[k]));
    rows.push(g);
  }

  const body=rows.map(x=>{
    const isTotal=/total receivable|group receivable/i.test(x.division);
    const p60=x.total?x.over60/x.total*100:0;
    const p90=x.total?x.over90/x.total*100:0;
    const p1=x.total?x.over1yr/x.total*100:0;
    const p2=x.total?x.over2yr/x.total*100:0;
    return `<tr class="${isTotal?'recv-summary-total':''}">
      <td class="rowhead">${esc(x.entity)}</td>
      <td>${esc(x.division)}</td>
      <td>${esc(x.divCode)}</td>
      <td class="num">${fmt(x.total)}</td>
      <td class="num">${fmt(x.under90)}</td>
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
    <div class="panelhead"><div>
      <h3>Receivables by Entity & Division</h3>
      <p class="hint">EPC, S&amp;R and other division classifications · ${esc(c)}</p>
    </div></div>
    <div class="recv-table-wrap"><table class="recv-table recv-summary-table">
      <thead><tr>
        <th>Entity</th><th>Division</th><th>DIV</th><th>Total</th>
        <th>&lt;90 Days</th>
        <th>&gt;60 Days</th><th class="recv-pct-head">&gt;60 %</th>
        <th>&gt;90 Days</th><th class="recv-pct-head">&gt;90 %</th>
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
    divisionEntries=Object.entries(a.divisions).sort((x,y)=>y[1].total-x[1].total);

  const totals={total:0,under90:0,over60:0,over90:0,over1yr:0,over2yr:0};
  const dr=divisionEntries.map(([d,x])=>{
    Object.keys(totals).forEach(k=>totals[k]+=Number(x[k])||0);
    const pUnder90=x.total?x.under90/x.total*100:0,
      p60=x.total?x.over60/x.total*100:0,
      p90=x.total?x.over90/x.total*100:0,
      p1=x.total?x.over1yr/x.total*100:0,
      p2=x.total?x.over2yr/x.total*100:0;
    return `<tr>
      <td class="rowhead">${esc(d)}</td>
      <td class="num">${fmt(x.total)}</td>
      <td class="num">${fmt(x.under90)}</td>
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

  const totalRow=`<tr class="recv-summary-total">
    <td class="rowhead">Total</td>
    <td class="num">${fmt(totals.total)}</td>
    <td class="num">${fmt(totals.under90)}</td>
    <td class="num recv-pct-cell">${pct(totals.total?totals.under90/totals.total*100:0)}</td>
    <td class="num">${fmt(totals.over60)}</td>
    <td class="num recv-pct-cell">${pct(totals.total?totals.over60/totals.total*100:0)}</td>
    <td class="num">${fmt(totals.over90)}</td>
    <td class="num recv-pct-cell">${pct(totals.total?totals.over90/totals.total*100:0)}</td>
    <td class="num">${fmt(totals.over1yr)}</td>
    <td class="num recv-pct-cell">${pct(totals.total?totals.over1yr/totals.total*100:0)}</td>
    <td class="num">${fmt(totals.over2yr)}</td>
    <td class="num recv-pct-cell">${pct(totals.total?totals.over2yr/totals.total*100:0)}</td>
  </tr>`;

  const distributionTotal=items.reduce((sum,item)=>sum+(Number(item.value)||0),0);

  return `<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Aging Distribution</h3></div></div>${bars(items,c)}
    <div class="recv-aging-distribution-total">
      <strong>Total</strong><span>${esc(c)} ${fmt(distributionTotal)}</span>
    </div>
  </div>
  <div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Division Aging Summary</h3>
      <p class="hint">All values are calculated from the same detailed aging buckets used by Entity &amp; Division reports.</p></div></div>
    <div class="recv-table-wrap"><table class="recv-table recv-aging-table">
      <thead><tr>
        <th>Division</th><th>Total</th>
        <th>&lt;90 Days</th><th class="recv-pct-head">&lt;90 %</th>
        <th>&gt;60 Days</th><th class="recv-pct-head">&gt;60 %</th>
        <th>&gt;90 Days</th><th class="recv-pct-head">&gt;90 %</th>
        <th>&gt;1 Year</th><th class="recv-pct-head">&gt;1 Year %</th>
        <th>&gt;2 Years</th><th class="recv-pct-head">&gt;2 Years %</th>
      </tr></thead>
      <tbody>${dr}${totalRow}</tbody>
    </table></div>
  </div>
  ${entityDivisionSummary(rs)}`;
}
function movementClass(name){
  const n=clean(name).toUpperCase();
  // DR-Movement Details uses short DIV codes, while aging sheets use full names.
  if(['CONST','CONSTRUCTION','MC','MCWP','MAST CLIMBER','MAST CLIMBERS','MAST CLIMBING','EV','EVENT','EVENTS'].includes(n))return'EPC';
  if(['PA','POWERED ACCESS','SS','SITE SERVICE','SITE SERVICES'].includes(n))return'S&R';
  if(['FP','FILM PRODUCTION'].includes(n))return'FP';
  if(['GEN','GENERAL'].includes(n)||n.includes('RELATED PART'))return'GEN';
  if(['O&G','OG','OIL & GAS','OIL AND GAS'].includes(n))return'O&G';
  return'OTHER';
}
function sliceBlock(m,start,end){return(m||[]).map(r=>(r||[]).slice(start,end+1))}
function fixedMovementRows(cfg){
  const source=matrix(MOVEMENT_CONFIG.movementSheet),rows=[];
  // Row 5 contains headings. Data starts on row 6.
  for(let i=5;i<source.length;i++){
    const r=source[i]||[];
    const code=clean(r[cfg.start]),name=clean(r[cfg.start+1]),division=clean(r[cfg.start+2]);
    if(!code&&!name&&!division)continue;
    if(/^(total|check)$/i.test(name))continue;
    const row={
      code,name,division:division||'Unassigned',classCode:movementClass(division),
      billing:num(r[cfg.start+3]),
      receipt:num(r[cfg.start+4]),
      cheque:num(r[cfg.start+5]),
      advance:num(r[cfg.start+6]),
      creditReverse:num(r[cfg.start+7]),
      creditIssue:num(r[cfg.start+8])
    };
    if(row.billing||row.receipt||row.cheque||row.advance||row.creditReverse||row.creditIssue)rows.push(row);
  }
  return rows;
}
function parseMovementDetails(){
  const out={};
  MOVEMENT_CONFIG.currentBlocks.forEach(cfg=>out[cfg.id]={cfg,rows:fixedMovementRows(cfg)});
  return out;
}
function detectBlockHeader(block){
  let best=-1,score=-1;
  block.forEach((r,i)=>{
    const h=(r||[]).map(norm);let s=0;
    if(h.some(v=>v.includes('accountname')||v.includes('customername')))s+=4;
    if(h.some(v=>v.includes('outstandingamount')||v.includes('totalreceivable')))s+=4;
    if(h.some(v=>v==='dimension'||v==='division'))s+=3;
    if(s>score){score=s;best=i}
  });
  return score>=7?best:-1;
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
function lastPeriodSummaryControl(source,cfg,headerRowIndex){
  let explicit=null;
  const byDivision={};
  for(let i=0;i<headerRowIndex;i++){
    const r=source[i]||[];
    const label=clean(r[cfg.start+3]);
    const amount=num(r[cfg.start+5]);
    if(/^total$/i.test(label)){explicit=amount;continue}
    const cls=movementClass(label);
    if(cls!=='OTHER'&&label)byDivision[cls]=(byDivision[cls]||0)+amount;
  }
  const derived=Object.values(byDivision).reduce((a,v)=>a+v,0);
  return {total:explicit!==null?explicit:derived,byDivision};
}
function parseLastPeriod(){
  const source=matrix(MOVEMENT_CONFIG.lastPeriodSheet),out={};
  MOVEMENT_CONFIG.lastBlocks.forEach(cfg=>{
    // Fixed block structure: detail header contains Account Name in column D,
    // Division in column E and Outstanding Amount in column F relative to
    // each 20-column entity block.
    let h=-1;
    for(let i=0;i<source.length;i++){
      const r=source[i]||[];
      if(norm(r[cfg.start+3]).includes('accountname')&&
         norm(r[cfg.start+4])==='dimension'&&
         norm(r[cfg.start+5]).includes('outstandingamount')){h=i;break}
    }
    const rows=[];
    if(h>=0)for(let i=h+1;i<source.length;i++){
      const r=source[i]||[];
      const rowNo=clean(r[cfg.start]);
      const accountType=clean(r[cfg.start+1]);
      const accountCode=clean(r[cfg.start+2]);
      const accountName=clean(r[cfg.start+3]);
      const division=clean(r[cfg.start+4]);
      const total=num(r[cfg.start+5]);
      const b={};
      BK.forEach((k,j)=>b[k]=num(r[cfg.start+6+j]));

      // Accept every genuine customer-detail row. Some ERP exports can have
      // a blank account name while retaining row number/account code, so the
      // parser must not drop the balance merely because Account Name is blank.
      const isCustomerRow=/customer\s*ledge/i.test(accountType)||Boolean(accountCode)||/^\d+(?:\.0+)?$/.test(rowNo);
      const isControl=/^(total|check)$/i.test(accountName)||/^(total|check)$/i.test(division);
      if(!isCustomerRow||isControl)continue;
      if(total===0&&!BK.some(k=>b[k]!==0))continue;

      const customer=accountName||accountCode||('Row '+rowNo);
      rows.push({
        customer,accountCode,rowNo,division:division||'Unassigned',classCode:movementClass(division),total,buckets:b,
        over60:BK.slice(2).reduce((a,k)=>a+b[k],0),
        over90:BK.slice(3).reduce((a,k)=>a+b[k],0),
        over180:BK.slice(6).reduce((a,k)=>a+b[k],0),
        over1yr:(b['366_730']||0)+(b.gt731||0),
        over2yr:b.gt731||0
      });
    }
    const detailTotal=rows.reduce((a,r)=>a+r.total,0);
    const detailByDivision={};
    rows.forEach(r=>detailByDivision[r.classCode]=(detailByDivision[r.classCode]||0)+r.total);
    const summary=lastPeriodSummaryControl(source,cfg,h<0?0:h);
    out[cfg.id]={rows,headerFound:h>=0,detailTotal,detailByDivision,summaryTotal:summary.total,summaryByDivision:summary.byDivision,
      summaryDifference:detailTotal-summary.total};
  });
  return out;
}
function currentAgingMetrics(rows,factor){
  const x={total:0,over60:0,over90:0,over180:0,over1yr:0,over2yr:0};
  rows.forEach(r=>{
    x.total+=r.total*factor;
    x.over60+=BK.slice(2).reduce((a,k)=>a+(r.buckets[k]||0),0)*factor;
    x.over90+=r.over90*factor;
    x.over180+=r.over180*factor;
    x.over1yr+=((r.buckets['366_730']||0)+(r.buckets.gt731||0))*factor;
    x.over2yr+=(r.buckets.gt731||0)*factor;
  });
  return x;
}
function priorAgingMetrics(rows,factor){
  const x={total:0,over60:0,over90:0,over180:0,over1yr:0,over2yr:0};
  rows.forEach(r=>Object.keys(x).forEach(k=>x[k]+=(r[k]||0)*factor));
  return x;
}
function manualOpening(cfg){
  const source=matrix(MOVEMENT_CONFIG.movementSheet);
  if(!source.length)return 0;
  // Row 2 contains AED-converted opening balances; row 3 contains native currency.
  // The opening value is the third column in each entity block.
  const rowIndex=S.entity==='GROUP'?1:2;
  const r=source[rowIndex]||[];
  return num(r[cfg.start+2])*(S.entity==='GROUP'?1:1);
}
function movementLines(){
  const details=parseMovementDetails(),last=parseLastPeriod(),lines=[];
  MOVEMENT_CONFIG.currentBlocks.forEach(entityCfg=>{
    if(S.entity!=='GROUP'&&S.entity!==entityCfg.id)return;
    const factor=S.entity==='GROUP'?entityCfg.fx:1;
    const current=(S.parsed[entityCfg.id]||{rows:[]}).rows;
    const movement=(details[entityCfg.id]||{rows:[]}).rows;
    const priorInfo=last[entityCfg.id]||{rows:[],detailTotal:0,summaryTotal:0,summaryDifference:0};
    const previous=priorInfo.rows;
    ['EPC','S&R','FP','GEN','O&G'].forEach(div=>{
      const cur=current.filter(r=>movementClass(r.division)===div),mov=movement.filter(r=>r.classCode===div),prv=previous.filter(r=>r.classCode===div);
      const ca=currentAgingMetrics(cur,factor),pa=priorAgingMetrics(prv,factor);
      const billing=mov.reduce((a,r)=>a+r.billing*factor,0),receipt=mov.reduce((a,r)=>a+r.receipt*factor,0),
        cheque=mov.reduce((a,r)=>a+r.cheque*factor,0),advance=mov.reduce((a,r)=>a+r.advance*factor,0),
        creditReverse=mov.reduce((a,r)=>a+r.creditReverse*factor,0),creditIssue=mov.reduce((a,r)=>a+r.creditIssue*factor,0);
      const calculatedClosing=pa.total+billing+cheque+creditReverse-receipt-advance-creditIssue;
      const reconciliation=calculatedClosing-ca.total;
      const agedMovement=ca.over90-pa.over90;
      const agedPct=pa.over90?agedMovement/pa.over90*100:(ca.over90?'NEW':0);
      if(!(pa.total||ca.total||billing||receipt||cheque||advance||creditReverse||creditIssue||pa.over90||ca.over90))return;
      lines.push({country:entityCfg.country,entity:entityCfg.label,entityId:entityCfg.id,division:div,currency:S.entity==='GROUP'?'AED':cfg(entityCfg.id).currency,
        opening:pa.total,billing,receipt,cheque,advance,creditReverse,creditIssue,calculatedClosing,closing:ca.total,reconciliation,
        openingDetailControl:priorInfo.detailTotal*factor,openingSummaryControl:priorInfo.summaryTotal*factor,
        openingControlDifference:priorInfo.summaryDifference*factor,
        opening60:pa.over60,closing60:ca.over60,opening90:pa.over90,closing90:ca.over90,
        opening180:pa.over180,closing180:ca.over180,opening1yr:pa.over1yr,closing1yr:ca.over1yr,
        opening2yr:pa.over2yr,closing2yr:ca.over2yr,movement:agedMovement,movementPct:agedPct});
    });

  });
  return lines;
}
function movementTotal(rows,label){
  const x={country:label,entity:'',division:'Total'};
  ['opening','billing','receipt','cheque','advance','creditReverse','creditIssue','calculatedClosing','closing','reconciliation',
   'opening60','closing60','opening90','closing90','opening180','closing180','opening1yr','closing1yr','opening2yr','closing2yr','movement']
    .forEach(k=>x[k]=rows.reduce((a,r)=>a+(r[k]||0),0));
  x.movementPct=x.opening90?x.movement/x.opening90*100:(x.closing90?'NEW':0);
  return x;
}
function movementStatus(v){return Math.abs(v)<=1?'Pass':'Warning'}
function movementPctText(v){return v==='NEW'?'New':pct(v)}
function openingValidationTable(){
  const last=parseLastPeriod(),rows=[];
  MOVEMENT_CONFIG.currentBlocks.forEach(c=>{
    if(S.entity!=='GROUP'&&S.entity!==c.id)return;
    const x=last[c.id]||{},factor=S.entity==='GROUP'?c.fx:1;
    const detail=(x.detailTotal||0)*factor,summary=(x.summaryTotal||0)*factor,diff=detail-summary;
    rows.push({
      country:c.country,
      entity:c.label,
      detail,
      summary,
      diff,
      currency:S.entity==='GROUP'?'AED':cfg(c.id).currency
    });
  });

  const countryTotals={};
  rows.forEach(r=>{
    if(!countryTotals[r.country])countryTotals[r.country]={country:r.country,entity:r.country+' Total',detail:0,summary:0,diff:0,currency:r.currency};
    countryTotals[r.country].detail+=r.detail;
    countryTotals[r.country].summary+=r.summary;
    countryTotals[r.country].diff+=r.diff;
  });

  const display=[];
  ['UAE','KSA','OMAN','UZBEKISTAN'].forEach(country=>{
    const entityRows=rows.filter(r=>r.country===country);
    display.push(...entityRows);
    if(entityRows.length)display.push(countryTotals[country]);
  });

  const body=display.map(r=>{
    const ok=Math.abs(r.diff)<=1;
    const isTotal=/ Total$/.test(r.entity);
    return`<tr class="${isTotal?'recv-country-total':''}">
      <td>${esc(r.country)}</td>
      <td>${esc(r.entity)}</td>
      <td>${esc(r.currency)}</td>
      <td class="num">${fmt(r.detail)}</td>
      <td class="num">${fmt(r.summary)}</td>
      <td class="num ${ok?'recv-good':'recv-bad'}">${fmt(r.diff)}</td>
      <td><span class="recv-status ${ok?'ok':'warn'}">${ok?'Reconciled':'Review'}</span></td>
    </tr>`;
  }).join('');

  return `<div class="card panel recv-panel">
    <div class="panelhead"><div>
      <h3>Opening Detail Validation</h3>
      <p class="hint">Detail rows are the reporting source; summary values are control totals. UAE includes ALPS and ALICLER.</p>
    </div></div>
    <div class="recv-table-wrap recv-no-x">
      <table class="recv-table recv-recon-table">
        <thead><tr><th>Country</th><th>Entity</th><th>Currency</th><th>Detail Total</th><th>Summary Control</th><th>Difference</th><th>Status</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
}
function movementValidation(lines){
  const details=matrix(MOVEMENT_CONFIG.movementSheet),last=matrix(MOVEMENT_CONFIG.lastPeriodSheet);
  const parsedLast=parseLastPeriod();
  const currentNames=MOVEMENT_CONFIG.currentBlocks.map(c=>first((C.entities.find(e=>e.id===c.id)||{sheets:[]}).sheets));
  const relevant=MOVEMENT_CONFIG.currentBlocks.filter(c=>S.entity==='GROUP'||S.entity===c.id);
  const checks=[
    ['DR-Movement Details loaded',details.length>0],['DR-Last Period loaded',last.length>0],
    ['All current DR entity sheets loaded',currentNames.every(Boolean)],
    ['Fixed movement blocks detected',relevant.every(c=>fixedMovementRows(c).length>0)],
    ['Opening detail headers detected',relevant.every(c=>parsedLast[c.id]&&parsedLast[c.id].headerFound)],
    ['Opening totals available',lines.some(x=>x.opening!==0)],['Closing totals available',lines.some(x=>x.closing!==0)],
    ['Currency rates applied',S.entity!=='GROUP'||(MOVEMENT_CONFIG.currentBlocks.find(x=>x.id==='ALU').fx===.975&&MOVEMENT_CONFIG.currentBlocks.find(x=>x.id==='ALIS').fx===9.5)],
    ['Reconciliation completed',lines.length>0]
  ];
  return `<div class="card panel recv-panel"><div class="panelhead"><div><h3>Data Validation</h3></div></div><div class="recv-validation-grid">${checks.map(([l,ok])=>`<div class="recv-validation ${ok?'ok':'warn'}"><span>${ok?'✓':'!'}</span><b>${esc(l)}</b></div>`).join('')}</div></div>${openingValidationTable()}`;
}
function movementKpis(lines){
  const t=movementTotal(lines,'Group'),cc=S.entity==='GROUP'?'AED':cfg(S.entity).currency;
  const collections=t.receipt;
  return `<div class="grid kpis recv-movement-kpis">
    ${kpi('Opening Receivables',cc+' '+fmt(t.opening),'Previous period')}
    ${kpi('Billing',cc+' '+fmt(t.billing),'Current period invoicing')}
    ${kpi('Collections',cc+' '+fmt(collections),'Customer receipts')}
    ${kpi('Calculated Closing',cc+' '+fmt(t.calculatedClosing),'Opening plus net movements')}
    ${kpi('Closing >90 Days',cc+' '+fmt(t.closing90),t.closing?pct(t.closing90/t.closing*100)+' of ERP closing':'0%')}
    ${kpi('>90 Movement',movementPctText(t.movementPct),cc+' '+fmt(t.movement),typeof t.movementPct==='number'&&t.movementPct>0?'neg':'pos')}
  </div>`;
}
function compactMovementTable(lines){
  const detailGroups={};
  lines.forEach(r=>{
    const k=[r.country,r.entity,r.division].join('|');
    if(!detailGroups[k])detailGroups[k]=[];
    detailGroups[k].push(r);
  });

  const detailRows=Object.entries(detailGroups).map(([k,v])=>{
    const parts=k.split('|'),x=movementTotal(v,parts[0]);
    x.country=parts[0];x.entity=parts[1];x.division=parts[2];x.rowType='detail';
    return x;
  });

  const display=[];
  ['UAE','KSA','OMAN','UZBEKISTAN'].forEach(country=>{
    const countryDetail=detailRows.filter(r=>r.country===country);
    const entities=[...new Set(countryDetail.map(r=>r.entity))];
    entities.forEach(entity=>{
      const entityRows=countryDetail.filter(r=>r.entity===entity);
      display.push(...entityRows);
      const subtotal=movementTotal(entityRows,entity);
      subtotal.country=country;subtotal.entity=entity;subtotal.division='Entity Total';subtotal.rowType='entity-total';
      display.push(subtotal);
    });
    if(countryDetail.length){
      const countryTotal=movementTotal(countryDetail,country);
      countryTotal.country=country;countryTotal.entity='';countryTotal.division='Country Total';countryTotal.rowType='country-total';
      display.push(countryTotal);
    }
  });

  const group=movementTotal(lines,'Group');
  group.country='Group';group.entity='';group.division='Group Total';group.rowType='group-total';
  display.push(group);

  const hasCheque=display.some(r=>Math.abs(r.cheque)>.5),
    hasAdvance=display.some(r=>Math.abs(r.advance)>.5),
    hasReverse=display.some(r=>Math.abs(r.creditReverse)>.5),
    hasIssue=display.some(r=>Math.abs(r.creditIssue)>.5);

  const head=['Country','Entity','DIV','Opening','Billing','Receipts'];
  if(hasCheque)head.push('Chq RTN');
  if(hasAdvance)head.push('Adv/Bank');
  if(hasReverse)head.push('CN Rev');
  if(hasIssue)head.push('CN Issued');
  head.push('Calc Closing','ERP Closing','Variance');

  const body=display.map(r=>{
    const ok=Math.abs(r.reconciliation)<=1;
    let cells=`<td>${esc(r.country)}</td><td>${esc(r.entity)}</td><td>${esc(r.division)}</td>
      <td class="num">${fmt(r.opening)}</td><td class="num">${fmt(r.billing)}</td><td class="num">${fmt(r.receipt)}</td>`;
    if(hasCheque)cells+=`<td class="num">${fmt(r.cheque)}</td>`;
    if(hasAdvance)cells+=`<td class="num">${fmt(r.advance)}</td>`;
    if(hasReverse)cells+=`<td class="num">${fmt(r.creditReverse)}</td>`;
    if(hasIssue)cells+=`<td class="num">${fmt(r.creditIssue)}</td>`;
    cells+=`<td class="num">${fmt(r.calculatedClosing)}</td><td class="num">${fmt(r.closing)}</td>
      <td class="num ${ok?'recv-good':'recv-bad'}">${fmt(r.reconciliation)}</td>`;
    const cls=r.rowType==='group-total'?'recv-movement-total recv-group-total':
      r.rowType==='country-total'?'recv-country-total':
      r.rowType==='entity-total'?'recv-entity-total':'';
    return `<tr class="${cls}">${cells}</tr>`;
  }).join('');

  return `<div class="card panel recv-panel">
    <div class="panelhead"><div>
      <h3>Movement Summary</h3>
      <p class="hint">UAE = ALPS + ALICLER. Opening + Billing − Receipts + Cheque Return − Advance/Bank + CN Reversal − CN Issued.</p>
    </div></div>
    <div class="recv-table-wrap recv-no-x">
      <table class="recv-table recv-v21-table">
        <thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
}
function compactAgingTable(lines){
  const groups={};lines.forEach(r=>{if(!groups[r.division])groups[r.division]=[];groups[r.division].push(r)});
  const rows=Object.entries(groups).map(([d,v])=>{const x=movementTotal(v,d);x.division=d;return x});
  const total=movementTotal(lines,'Group');total.division='Total';rows.push(total);
  return `<div class="card panel recv-panel"><div class="panelhead"><div><h3>Closing Aging Summary</h3></div></div><div class="recv-table-wrap recv-no-x"><table class="recv-table recv-aging-compact"><thead><tr><th>DIV</th><th>&gt;60</th><th>&gt;90</th><th>&gt;180</th><th>&gt;1 Year</th><th>&gt;2 Years</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.division==='Total'?'recv-movement-total':''}"><td>${esc(r.division)}</td><td class="num">${fmt(r.closing60)}</td><td class="num">${fmt(r.closing90)}</td><td class="num">${fmt(r.closing180)}</td><td class="num">${fmt(r.closing1yr)}</td><td class="num">${fmt(r.closing2yr)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function reconciliationTable(lines){
  const entities={};lines.forEach(r=>{if(!entities[r.entity])entities[r.entity]=[];entities[r.entity].push(r)});
  const rows=Object.entries(entities).map(([e,v])=>{const x=movementTotal(v,e);x.entity=e;return x});
  return `<div class="card panel recv-panel"><div class="panelhead"><div><h3>Reconciliation Control</h3><p class="hint">Calculated closing less ERP closing</p></div></div><div class="recv-table-wrap recv-no-x"><table class="recv-table recv-recon-table"><thead><tr><th>Entity</th><th>Calculated Closing</th><th>ERP Closing</th><th>Difference</th><th>Status</th></tr></thead><tbody>${rows.map(r=>{const ok=Math.abs(r.reconciliation)<=1;return`<tr><td>${esc(r.entity)}</td><td class="num">${fmt(r.calculatedClosing)}</td><td class="num">${fmt(r.closing)}</td><td class="num ${ok?'recv-good':'recv-bad'}">${fmt(r.reconciliation)}</td><td><span class="recv-status ${ok?'ok':'warn'}">${movementStatus(r.reconciliation)}</span></td></tr>`}).join('')}</tbody></table></div></div>`;
}
function adjustmentsTable(lines){
  const t=movementTotal(lines,'Group'),cc=S.entity==='GROUP'?'AED':cfg(S.entity).currency;
  const items=[
    {label:'Cheque Return / Refund',value:t.cheque,sign:'Add to receivables'},
    {label:'Advance Settlement / Bank Charges',value:t.advance,sign:'Reduce receivables'},
    {label:'Credit Note Reversal / Exchange Loss',value:t.creditReverse,sign:'Add to receivables'},
    {label:'Credit Note Issued',value:t.creditIssue,sign:'Reduce receivables'}
  ].filter(x=>Math.abs(x.value)>.5);
  if(!items.length)return'';
  return `<div class="card panel recv-panel"><div class="panelhead"><div><h3>Movement Adjustments</h3><p class="hint">Only non-zero categories are displayed</p></div></div><div class="recv-adjust-grid">${items.map(x=>`<div><span>${esc(x.label)}<small>${esc(x.sign)}</small></span><b>${esc(cc)} ${fmt(x.value)}</b></div>`).join('')}</div></div>`;
}
function movementBrief(lines){
  const t=movementTotal(lines,'Group'),cc=S.entity==='GROUP'?'AED':cfg(S.entity).currency;
  const change=t.calculatedClosing-t.opening,changePct=t.opening?change/t.opening*100:0,aged=t.closing90-t.opening90,agedPct=t.opening90?aged/t.opening90*100:0;
  const efficiency=t.billing?t.receipt/t.billing*100:0;
  const divs={};lines.forEach(r=>{if(!divs[r.division])divs[r.division]=0;divs[r.division]+=r.movement});
  const ranked=Object.entries(divs).sort((a,b)=>b[1]-a[1]),worst=ranked.find(x=>x[1]>0),best=[...ranked].reverse().find(x=>x[1]<0);
  const reconOk=Math.abs(t.reconciliation)<=1;
  return `<div class="card panel recv-panel recv-brief"><div class="panelhead"><div><h3>Executive Summary</h3></div></div>
    <p><strong>Overall position.</strong> Receivables moved from <strong>${cc} ${fmt(t.opening)}</strong> to a calculated closing of <strong>${cc} ${fmt(t.calculatedClosing)}</strong>, a ${change<=0?'reduction':'increase'} of <strong>${cc} ${fmt(Math.abs(change))}</strong> (${pct(Math.abs(changePct))}).</p>
    <p><strong>Billing and collections.</strong> Billing was <strong>${cc} ${fmt(t.billing)}</strong> and customer receipts were <strong>${cc} ${fmt(t.receipt)}</strong>, equivalent to <strong>${pct(efficiency)}</strong> of billing. ${t.receipt>=t.billing?'Collections exceeded current-period billing and supported working-capital release.':'Billing exceeded receipts and increased working-capital pressure.'}</p>
    <p><strong>Aged debt.</strong> Balances over 90 days moved from <strong>${cc} ${fmt(t.opening90)}</strong> to <strong>${cc} ${fmt(t.closing90)}</strong>, a ${aged<=0?'reduction':'increase'} of <strong>${cc} ${fmt(Math.abs(aged))}</strong> (${pct(Math.abs(agedPct))}).</p>
    ${(worst||best)?`<p><strong>Division movement.</strong> ${worst?`${esc(worst[0])} recorded the largest deterioration in over-90-day debt (${cc} ${fmt(worst[1])}). `:''}${best?`${esc(best[0])} recorded the strongest improvement (${cc} ${fmt(Math.abs(best[1]))}).`:''}</p>`:''}
    <p><strong>Reconciliation.</strong> Calculated closing ${reconOk?'agrees with':'does not agree with'} ERP closing. The variance is <strong>${cc} ${fmt(t.reconciliation)}</strong>. ${reconOk?'No reconciliation action is required.':'The variance should be investigated before final reporting.'}</p></div>`;
}
function movementWaterfall(lines){
  const t=movementTotal(lines,'Group'),cc=S.entity==='GROUP'?'AED':cfg(S.entity).currency;
  const collections=t.receipt;
  const steps=[
    {label:'Opening',value:t.opening,type:'total'},
    {label:'Billing',value:t.billing,type:'add'},
    {label:'Receipts',value:-collections,type:'reduce'},
    {label:'Cheque Return',value:t.cheque,type:'add'},
    {label:'Advance / Bank',value:-t.advance,type:'reduce'},
    {label:'CN Reversal',value:t.creditReverse,type:'add'},
    {label:'CN Issued',value:-t.creditIssue,type:'reduce'},
    {label:'Calculated Closing',value:t.calculatedClosing,type:'total'}
  ].filter((x,i)=>x.type==='total'||Math.abs(x.value)>.5);
  const max=Math.max(1,...steps.map(x=>Math.abs(x.value)));
  return `<div class="card panel recv-panel"><div class="panelhead"><div><h3>Receivables Movement Bridge</h3><p class="hint">Opening to calculated closing · ${esc(cc)}</p></div></div><div class="recv-waterfall">${steps.map(x=>`<div class="recv-waterfall-item"><div class="recv-waterfall-value">${x.value<0?'− ':x.type==='add'?'+ ':''}${fmt(Math.abs(x.value))}</div><div class="recv-waterfall-track"><i class="${x.type}" style="height:${Math.max(14,Math.abs(x.value)/max*120)}px"></i></div><div class="recv-waterfall-label">${esc(x.label)}</div></div>`).join('')}</div></div>`;
}
function renderMovementAnalysis(){
  const lines=movementLines();
  if(!lines.length)return`<div class="card panel recv-panel"><div class="empty">Movement data was not detected. Confirm Apps Script exports <strong>DR-Movement Details</strong>, <strong>DR-Last Period</strong>, and all current DR entity sheets.</div></div>`;
  const adjustments=adjustmentsTable(lines);
  return `${movementValidation(lines)}${movementKpis(lines)}${compactMovementTable(lines)}${movementWaterfall(lines)}<div class="recv-movement-grid">${compactAgingTable(lines)}${reconciliationTable(lines)}</div>${adjustments?`<div class="recv-movement-grid">${adjustments}${movementBrief(lines)}</div>`:movementBrief(lines)}`;
}

function agingMovementRecords(){
  const prior=parseLastPeriod(),out=[];
  const filter=S.movementFilter;
  MOVEMENT_CONFIG.currentBlocks.forEach(block=>{
    if(S.entity!=='GROUP'&&S.entity!==block.id)return;
    const factor=S.entity==='GROUP'?block.fx:1;
    const current=(S.parsed[block.id]||{rows:[]}).rows;
    const previous=(prior[block.id]||{rows:[]}).rows;
    const map={};

    function key(code,name,division){
      const c=norm(code);
      return c?block.id+'|'+c:block.id+'|'+norm(name)+'|'+norm(division);
    }
    function ensure(k,seed){
      if(!map[k])map[k]=Object.assign({
        entity:block.label,entityId:block.id,country:block.country,
        previous:0,current:0
      },seed);
      return map[k];
    }

    previous.forEach(r=>{
      const k=key(r.accountCode,r.customer,r.division);
      ensure(k,{customer:r.customer,division:r.division||'Unassigned'}).previous+=
        agingRangeAmount(r,filter.from,filter.to,factor);
    });
    current.forEach(r=>{
      const k=key(r.code,r.customer,r.division);
      ensure(k,{customer:r.customer,division:r.division||'Unassigned'}).current+=
        agingRangeAmount(r,filter.from,filter.to,factor);
    });

    Object.values(map).forEach(r=>{
      if(filter.division!=='ALL'&&clean(r.division)!==clean(filter.division))return;
      if(filter.customer!=='ALL'&&clean(r.customer)!==clean(filter.customer))return;
      if(Math.max(Math.abs(r.previous),Math.abs(r.current))<(Number(filter.min)||0))return;
      if(r.previous===0&&r.current===0)return;
      r.movement=r.current-r.previous;
      r.status=r.previous===0&&r.current>0?'New':
        r.previous>0&&r.current===0?'Cleared':
        r.movement>0.5?'Increased':
        r.movement<-0.5?'Improved':'No Change';
      out.push(r);
    });
  });

  return out.sort((a,b)=>
    Math.max(Math.abs(b.movement),Math.abs(b.current),Math.abs(b.previous))-
    Math.max(Math.abs(a.movement),Math.abs(a.current),Math.abs(a.previous))
  );
}
function over180StatusClass(status){
  return status==='Improved'||status==='Cleared'?'recv-good':
    status==='Increased'||status==='New'?'recv-bad':'';
}
function renderOver180Movement(){
  const all=agingMovementRecords(),top=all.slice(0,50),ccy=currency(),f=S.movementFilter;
  const previous=all.reduce((a,r)=>a+r.previous,0);
  const current=all.reduce((a,r)=>a+r.current,0);
  const movement=current-previous;
  const rangeLabel=BK_LABELS[f.from]+' to '+BK_LABELS[f.to];

  const cards=`${agingFilterControls('movement')}<div class="grid kpis recv-kpis">
    ${kpi('Previous · '+rangeLabel,ccy+' '+fmt(previous),'DR-Last Period')}
    ${kpi('Current · '+rangeLabel,ccy+' '+fmt(current),'Current ERP aging')}
    ${kpi('Movement',ccy+' '+fmt(movement),movement<=0?'Improvement':'Deterioration',movement<=0?'pos':'neg')}
    ${kpi('Customers',fmt(all.length),'Matching selected bracket range')}
  </div>`;

  const rows=top.map((r,i)=>`<tr>
    <td>${i+1}</td><td class="recv-customer-name">${esc(r.customer)}</td>
    <td>${esc(r.entity)}</td><td>${esc(r.division)}</td>
    <td class="num">${fmt(r.previous)}</td><td class="num">${fmt(r.current)}</td>
    <td class="num ${over180StatusClass(r.status)}">${fmt(r.movement)}</td>
    <td class="${over180StatusClass(r.status)}">${esc(r.status)}</td>
  </tr>`).join('');

  const table=`<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Customer Aging Movement — ${esc(rangeLabel)}</h3>
      <p class="hint">Previous period from DR-Last Period · Current period from live DR entity sheets · Top 50 shown</p></div></div>
    <div class="recv-table-wrap recv-landscape-scroll">
      <table class="recv-table recv-customer-table">
        <thead><tr><th>#</th><th>Customer</th><th>Entity</th><th>Division</th>
        <th>Previous</th><th>Current</th><th>Movement</th><th>Status</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="8" class="empty">No customer movement detected for this bracket range.</td></tr>'}</tbody>
      </table>
    </div></div>`;

  const chartTop=top.slice(0,12),max=Math.max(1,...chartTop.map(r=>Math.abs(r.movement)));
  const chart=`<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Largest Movements</h3><p class="hint">Green = improvement · Red = deterioration</p></div></div>
    <div class="recv-bars">${chartTop.filter(r=>Math.abs(r.movement)>.5).map(r=>`
      <div class="recv-bar-row"><div class="recv-bar-label">${esc(r.customer)}</div>
      <div class="recv-bar-track"><div class="recv-bar-fill" style="width:${Math.max(2,Math.abs(r.movement)/max*100)}%"></div></div>
      <div class="recv-bar-value ${over180StatusClass(r.status)}">${fmt(r.movement)}</div></div>`).join('')||'<div class="empty">No movements to chart.</div>'}</div></div>`;

  setTimeout(bindAgingFilterControls,0);
  return cards+`<div class="recv-two recv-wide-two">${table}${chart}</div>`;
}


function renderAgingDetail(rs){
  const ccy=currency(),f=S.agingFilter;
  const selectedKeys=BK.slice(f.from,f.to+1);
  const selectedLabels=BK_LABELS.slice(f.from,f.to+1);
  const fullRange=f.from===0&&f.to===BK.length-1;
  const filtered=rs.map(r=>{
    const factor=S.entity==='GROUP'?r.fx:1;
    const range=agingRangeAmount(r,f.from,f.to,factor);
    const total=(S.entity==='GROUP'?r.totalAED:r.total)||0;
    return {r,factor,range,total};
  }).filter(x=>{
    if(x.range<(Number(f.min)||0))return false;
    if(f.division!=='ALL'&&clean(x.r.division)!==clean(f.division))return false;
    if(f.customer!=='ALL'&&clean(x.r.customer)!==clean(f.customer))return false;
    return x.range!==0 || Number(f.min)===0;
  }).sort((a,b)=>b.range-a.range);

  const totals={total:0,range:0,buckets:selectedKeys.map(()=>0)};
  const body=filtered.map(x=>{
    totals.total+=x.total;totals.range+=x.range;
    const vals=selectedKeys.map((k,i)=>{
      const v=(x.r.buckets[k]||0)*x.factor;totals.buckets[i]+=v;return v;
    });
    return `<tr><td class="recv-customer-name">${esc(x.r.customer)}</td>
      <td>${esc(x.r.entityLabel||x.r.entityId||'')}</td><td>${esc(x.r.division)}</td>
      ${vals.map((v,i)=>`<td class="num ${agingBucketClass(f.from+i)}">${fmt(v)}</td>`).join('')}
      ${fullRange?'':`<td class="num recv-range-total">${fmt(x.range)}</td>`}
      <td class="num recv-total-final">${fmt(x.total)}</td></tr>`;
  }).join('');

  const rangeLabel=BK_LABELS[f.from]+' to '+BK_LABELS[f.to];
  const extraHeader=fullRange?'':'<th>Selected Range</th>';
  const extraTotal=fullRange?'':`<td class="num">${fmt(totals.range)}</td>`;
  const colspan=4+selectedLabels.length+(fullRange?0:1);
  return `${agingFilterControls('detail')}<div class="card panel recv-panel recv-landscape-panel">
    <div class="panelhead"><div><h3>Aging Analysis Detail — ${esc(rangeLabel)}</h3>
      <p class="hint">${filtered.length} customer balances · ${esc(ccy)} · buckets shown in chronological order</p></div></div>
    <div class="recv-table-wrap recv-aging-detail-scroll recv-landscape-scroll">
      <table class="recv-table recv-aging-detail-table">
        <thead><tr><th>Customer</th><th>Entity</th><th>Division</th>
          ${selectedLabels.map((h,i)=>`<th class="${agingHeaderClass(f.from+i)}">${h}</th>`).join('')}${extraHeader}<th class="recv-total-head">Total</th></tr></thead>
        <tbody>${body||`<tr><td colspan="${colspan}" class="empty">No balances match the selected filters.</td></tr>`}</tbody>
        <tfoot><tr class="recv-summary-total"><td>Grand Total</td><td></td><td></td>
          ${totals.buckets.map((v,i)=>`<td class="num ${agingBucketClass(f.from+i)}">${fmt(v)}</td>`).join('')}${extraTotal}<td class="num recv-total-final">${fmt(totals.total)}</td></tr></tfoot>
      </table>
    </div></div>`;
}
function parseCollectionMonthHeader(value){
  const s=clean(value);
  if(!s)return null;
  const m=s.match(/^([A-Za-z]{3,9})[-\s\/](\d{2,4})$/);
  if(!m)return null;
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,
    jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,sept:9,
    oct:10,october:10,nov:11,november:11,dec:12,december:12};
  const month=months[m[1].toLowerCase()];
  if(!month)return null;
  let year=Number(m[2]);
  if(year<100)year+=2000;
  return {year,month,label:new Date(year,month-1,1).toLocaleString('en-US',{month:'short',year:'numeric'})};
}
function normalizeCollectionDescription(v){
  const n=norm(v);
  if(n.includes('invoice'))return'INVOICED';
  if(n.includes('cashcollect')||n.includes('collected')||n==='collection')return'COLLECTED';
  if(n.includes('target'))return'TARGET';
  if(n.includes('debtbalance')||n.includes('receivable')||n.includes('outstanding'))return'DEBT';
  return'';
}
function parseCollectionSheet(){
  const m=matrix('Coll vs Target');
  if(!m.length)return{rows:[],months:[],error:'Sheet not found'};

  let h=2; // user confirmed header is row 3
  const header=m[h]||[];
  if(norm(header[0])!=='country'||norm(header[1])!=='entity'){
    h=-1;
    for(let i=0;i<Math.min(m.length,10);i++){
      const r=m[i]||[];
      if(norm(r[0])==='country'&&norm(r[1])==='entity'&&norm(r[4]).includes('description')){h=i;break}
    }
  }
  if(h<0)return{rows:[],months:[],error:'Header row not detected'};

  const months=[];
  for(let c=5;c<header.length;c++){
    const x=parseCollectionMonthHeader(header[c]);
    if(x)months.push({col:c,year:x.year,month:x.month,label:x.label,raw:clean(header[c])});
  }

  const rows=[];
  for(let i=h+1;i<m.length;i++){
    const r=m[i]||[];
    const country=clean(r[0]),entity=clean(r[1]),profitCentre=clean(r[2]),
      division=clean(r[3]),description=normalizeCollectionDescription(r[4]);
    if(!description)continue;
    if(!country&&!entity&&!profitCentre&&!division)continue;
    const values={};
    months.forEach(x=>values[x.year+'-'+String(x.month).padStart(2,'0')]=num(r[x.col]));
    rows.push({
      country:country||'Unassigned',
      entity:entity||'Unassigned',
      profitCentre:profitCentre||'Unassigned',
      division:division||divisionClass(profitCentre),
      description,
      values
    });
  }
  return{rows,months,headerRow:h};
}
function collectionAvailableFilters(data){
  const years=[...new Set(data.months.map(x=>x.year))].sort((a,b)=>a-b);
  const countries=[...new Set(data.rows.map(r=>clean(r.country).toUpperCase()))].filter(Boolean).sort();
  const entities=[...new Set(data.rows.map(r=>clean(r.entity).toUpperCase()))].filter(Boolean).sort();
  const divisions=[...new Set(data.rows.map(r=>clean(r.division).toUpperCase()))].filter(Boolean).sort();
  return{years,countries,entities,divisions};
}
function ensureCollectionSelection(data){
  const f=collectionAvailableFilters(data),s=S.collection;
  if(!f.years.length)return;
  if(!s.year||!f.years.includes(Number(s.year)))s.year=Math.max(...f.years);
  const months=f.years.includes(Number(s.year))?
    data.months.filter(x=>x.year===Number(s.year)).map(x=>x.month):[];
  if(!s.month||!months.includes(Number(s.month)))s.month=Math.max(...months);
  if(!s.country)s.country='GROUP';
  if(!s.entity)s.entity='GROUP';
  if(!s.division)s.division='ALL';
}
function collectionRowIncluded(r){
  const s=S.collection;
  const country=clean(r.country).toUpperCase(),entity=clean(r.entity).toUpperCase(),
    division=clean(r.division).toUpperCase();

  if(s.country!=='GROUP'&&country!==s.country)return false;
  if(s.entity!=='GROUP'&&entity!==s.entity)return false;
  if(s.division!=='ALL'&&division!==s.division)return false;
  if(s.coreOnly&&(division==='FP'||division==='GEN'))return false;
  return true;
}
function collectionRows(data){
  return data.rows.filter(collectionRowIncluded);
}
function collectionMetric(rows,year,month,description){
  const key=year+'-'+String(month).padStart(2,'0');
  return rows.filter(r=>r.description===description).reduce((a,r)=>a+(r.values[key]||0),0);
}
function collectionYTD(rows,year,throughMonth,description){
  let total=0;
  for(let m=1;m<=throughMonth;m++)total+=collectionMetric(rows,year,m,description);
  return total;
}
function collectionMonthName(month){
  return new Date(2020,month-1,1).toLocaleString('en-US',{month:'short'});
}
function collectionAchievementClass(value){
  if(!Number.isFinite(value))return'';
  return value>=100?'pos':value>=90?'':'neg';
}
function collectionFilters(data){
  const f=collectionAvailableFilters(data),s=S.collection;
  const monthOptions=data.months.filter(x=>x.year===Number(s.year)).sort((a,b)=>a.month-b.month);
  const countryOptions=['GROUP',...f.countries];
  const entityOptions=['GROUP',...f.entities];
  const divisionOptions=['ALL',...f.divisions];

  return `<div class="card panel recv-panel coll-filter-panel">
    <div class="coll-filter-grid">
      <label>Year<select id="collYear">${f.years.map(y=>`<option value="${y}" ${Number(s.year)===y?'selected':''}>${y}</option>`).join('')}</select></label>
      <label>Month<select id="collMonth">${monthOptions.map(x=>`<option value="${x.month}" ${Number(s.month)===x.month?'selected':''}>${collectionMonthName(x.month)}</option>`).join('')}</select></label>
      <label>Country<select id="collCountry">${countryOptions.map(x=>`<option value="${esc(x)}" ${s.country===x?'selected':''}>${x==='GROUP'?'Group':esc(x)}</option>`).join('')}</select></label>
      <label>Entity<select id="collEntity">${entityOptions.map(x=>`<option value="${esc(x)}" ${s.entity===x?'selected':''}>${x==='GROUP'?'All Entities':esc(x)}</option>`).join('')}</select></label>
      <label>Division<select id="collDivision">${divisionOptions.map(x=>`<option value="${esc(x)}" ${s.division===x?'selected':''}>${x==='ALL'?'All Divisions':esc(x)}</option>`).join('')}</select></label>
      <label class="coll-toggle"><input id="collCoreOnly" type="checkbox" ${s.coreOnly?'checked':''}><span>Core Operations Only</span><small>Exclude FP &amp; GEN</small></label>
    </div>
  </div>`;
}
function bindCollectionFilters(){
  const bind=(id,key,convert)=>{const el=$(id);if(el)el.onchange=()=>{S.collection[key]=convert?convert(el.value):el.value;content()}};
  bind('collYear','year',Number);
  bind('collMonth','month',Number);
  bind('collCountry','country');
  bind('collEntity','entity');
  bind('collDivision','division');
  const c=$('collCoreOnly');if(c)c.onchange=()=>{S.collection.coreOnly=c.checked;content()};
}
function collectionKPIs(rows){
  const y=Number(S.collection.year),m=Number(S.collection.month),py=y-1;
  const invoiced=collectionMetric(rows,y,m,'INVOICED'),
    collected=collectionMetric(rows,y,m,'COLLECTED'),
    target=collectionMetric(rows,y,m,'TARGET'),
    debt=collectionMetric(rows,y,m,'DEBT'),
    priorCollected=collectionMetric(rows,py,m,'COLLECTED'),
    achievement=target?collected/target*100:0,
    ratio=invoiced?collected/invoiced*100:0,
    variance=collected-target,
    yoy=priorCollected?(collected-priorCollected)/priorCollected*100:0;

  return `<div class="grid kpis recv-kpis coll-kpis">
    ${kpi('Invoiced',"AED '000 "+fmt(invoiced),collectionMonthName(m)+' '+y)}
    ${kpi('Cash Collected',"AED '000 "+fmt(collected),collectionMonthName(m)+' '+y)}
    ${kpi('Target',"AED '000 "+fmt(target),'Monthly collection target')}
    ${kpi('Achievement',pct(achievement),'Collected ÷ Target',collectionAchievementClass(achievement))}
    ${kpi('Collection Ratio',pct(ratio),'Collected ÷ Invoiced',ratio>=100?'pos':'')}
    ${kpi('Debt Balance',"AED '000 "+fmt(debt),'Month-end outstanding')}
    ${kpi('Target Variance',"AED '000 "+fmt(variance),variance>=0?'Above target':'Below target',variance>=0?'pos':'neg')}
    ${kpi('YoY Collection Growth',pct(yoy),collectionMonthName(m)+' '+py+' comparison',yoy>=0?'pos':'neg')}
  </div>`;
}
function collectionExecutive(rows){
  const y=Number(S.collection.year),m=Number(S.collection.month),py=y-1;
  const invoiced=collectionMetric(rows,y,m,'INVOICED'),collected=collectionMetric(rows,y,m,'COLLECTED'),
    target=collectionMetric(rows,y,m,'TARGET'),debt=collectionMetric(rows,y,m,'DEBT'),
    priorCollected=collectionMetric(rows,py,m,'COLLECTED'),
    ytdCollected=collectionYTD(rows,y,m,'COLLECTED'),pyYtdCollected=collectionYTD(rows,py,m,'COLLECTED'),
    ytdTarget=collectionYTD(rows,y,m,'TARGET'),ytdInvoiced=collectionYTD(rows,y,m,'INVOICED');
  const achievement=target?collected/target*100:0,
    targetVariance=collected-target,
    yoy=priorCollected?(collected-priorCollected)/priorCollected*100:0,
    ytdYoy=pyYtdCollected?(ytdCollected-pyYtdCollected)/pyYtdCollected*100:0,
    ytdAchievement=ytdTarget?ytdCollected/ytdTarget*100:0,
    ytdRatio=ytdInvoiced?ytdCollected/ytdInvoiced*100:0;

  return `<div class="card panel recv-panel coll-exec">
    <div class="panelhead"><div><h3>Executive Summary</h3><p class="hint">Collection performance · all figures in AED '000</p></div></div>
    <p>Collections for <strong>${collectionMonthName(m)} ${y}</strong> were <strong>AED '000 ${fmt(collected)}</strong> against a target of <strong>AED '000 ${fmt(target)}</strong>, achieving <strong>${pct(achievement)}</strong>. The result was <strong>AED '000 ${fmt(Math.abs(targetVariance))}</strong> ${targetVariance>=0?'above':'below'} target.</p>
    <p>Monthly collections were ${yoy>=0?'higher':'lower'} than ${collectionMonthName(m)} ${py} by <strong>${pct(Math.abs(yoy))}</strong>. Year-to-date collections reached <strong>AED '000 ${fmt(ytdCollected)}</strong>, achieving <strong>${pct(ytdAchievement)}</strong> of YTD target and ${ytdYoy>=0?'increasing':'decreasing'} by <strong>${pct(Math.abs(ytdYoy))}</strong> compared with the same period last year.</p>
    <p>Current-month invoicing was <strong>AED '000 ${fmt(invoiced)}</strong>, the month-end debt balance was <strong>AED '000 ${fmt(debt)}</strong>, and YTD collections represented <strong>${pct(ytdRatio)}</strong> of YTD invoicing.</p>
  </div>`;
}
function collectionTrend(rows){
  const y=Number(S.collection.year),through=Number(S.collection.month);
  const months=[];
  for(let m=1;m<=12;m++){
    months.push({
      label:collectionMonthName(m),
      invoiced:collectionMetric(rows,y,m,'INVOICED'),
      collected:collectionMetric(rows,y,m,'COLLECTED'),
      target:collectionMetric(rows,y,m,'TARGET')
    });
  }
  const max=Math.max(1,...months.flatMap(x=>[x.invoiced,x.collected,x.target]));
  return `<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>${y} Monthly Trend</h3><p class="hint">Invoiced, cash collected and target · AED '000</p></div></div>
    <div class="coll-trend">${months.map(x=>`<div class="coll-month ${x.label===collectionMonthName(through)?'active':''}">
      <div class="coll-month-bars">
        <i class="invoice" title="Invoiced ${fmt(x.invoiced)}" style="height:${Math.max(2,x.invoiced/max*100)}%"></i>
        <i class="collect" title="Collected ${fmt(x.collected)}" style="height:${Math.max(2,x.collected/max*100)}%"></i>
        <i class="target" title="Target ${fmt(x.target)}" style="height:${Math.max(2,x.target/max*100)}%"></i>
      </div><span>${x.label}</span>
    </div>`).join('')}</div>
    <div class="coll-legend"><span><i class="invoice"></i>Invoiced</span><span><i class="collect"></i>Collected</span><span><i class="target"></i>Target</span></div>
  </div>`;
}
function collectionComparisonTable(rows,mode){
  const y=Number(S.collection.year),m=Number(S.collection.month),py=y-1;
  const isYTD=mode==='ytd';
  const current=(desc)=>isYTD?collectionYTD(rows,y,m,desc):collectionMetric(rows,y,m,desc);
  const previous=(desc)=>isYTD?collectionYTD(rows,py,m,desc):collectionMetric(rows,py,m,desc);
  const curr={invoiced:current('INVOICED'),collected:current('COLLECTED'),target:current('TARGET'),debt:collectionMetric(rows,y,m,'DEBT')};
  const prev={invoiced:previous('INVOICED'),collected:previous('COLLECTED'),target:previous('TARGET'),debt:collectionMetric(rows,py,m,'DEBT')};
  curr.achievement=curr.target?curr.collected/curr.target*100:0;
  prev.achievement=prev.target?prev.collected/prev.target*100:0;

  const lines=[
    ['Invoiced',prev.invoiced,curr.invoiced,false],
    ['Cash Collected',prev.collected,curr.collected,false],
    ['Target',prev.target,curr.target,false],
    ['Achievement %',prev.achievement,curr.achievement,true],
    ['Debt Balance',prev.debt,curr.debt,false]
  ];
  return `<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>${isYTD?'YTD Comparison':'Monthly Comparison'}</h3>
      <p class="hint">${isYTD?'Jan–'+collectionMonthName(m):collectionMonthName(m)} ${y} vs ${py}</p></div></div>
    <table class="recv-table coll-compare"><thead><tr><th>KPI</th><th>${py}</th><th>${y}</th><th>Change</th><th>%</th></tr></thead>
    <tbody>${lines.map(([label,p,c,isPct])=>{
      const change=c-p,pchange=p?(c-p)/p*100:0;
      return `<tr><td>${label}</td><td class="num">${isPct?pct(p):fmt(p)}</td><td class="num">${isPct?pct(c):fmt(c)}</td>
        <td class="num ${change>=0?'recv-good':'recv-bad'}">${isPct?pct(change):fmt(change)}</td>
        <td class="num ${pchange>=0?'recv-good':'recv-bad'}">${pct(pchange)}</td></tr>`;
    }).join('')}</tbody></table>
  </div>`;
}

function collectionGroupRows(rows,field){
  const y=Number(S.collection.year),m=Number(S.collection.month),groups={};
  rows.forEach(r=>{
    const key=clean(r[field])||'Unassigned';
    if(!groups[key])groups[key]={label:key,invoiced:0,collected:0,target:0,debt:0};
    const g=groups[key];
    const monthKey=y+'-'+String(m).padStart(2,'0');
    const v=r.values[monthKey]||0;
    if(r.description==='INVOICED')g.invoiced+=v;
    else if(r.description==='COLLECTED')g.collected+=v;
    else if(r.description==='TARGET')g.target+=v;
    else if(r.description==='DEBT')g.debt+=v;
  });
  return Object.values(groups).map(g=>{
    g.variance=g.collected-g.target;
    g.achievement=g.target?g.collected/g.target*100:0;
    return g;
  });
}

function collectionEntityCategoryRows(rows){
  const y=Number(S.collection.year),m=Number(S.collection.month),groups={};
  const monthKey=y+'-'+String(m).padStart(2,'0');
  rows.forEach(r=>{
    const entity=clean(r.entity)||'Unassigned';
    const category=clean(r.profitCentre)||clean(r.division)||'Unassigned';
    const key=entity+'|'+category;
    if(!groups[key])groups[key]={entity,category,label:category,invoiced:0,collected:0,target:0,debt:0};
    const g=groups[key],v=r.values[monthKey]||0;
    if(r.description==='INVOICED')g.invoiced+=v;
    else if(r.description==='COLLECTED')g.collected+=v;
    else if(r.description==='TARGET')g.target+=v;
    else if(r.description==='DEBT')g.debt+=v;
  });
  return Object.values(groups).map(g=>{
    g.variance=g.collected-g.target;
    g.achievement=g.target?g.collected/g.target*100:0;
    return g;
  });
}
function collectionEntityCategoryTable(items){
  const body=items.sort((a,b)=>a.entity.localeCompare(b.entity)||b.target-a.target).map(g=>`<tr>
    <td>${esc(g.entity)}</td><td>${esc(g.category)}</td>
    <td class="num">${fmt(g.target)}</td><td class="num">${fmt(g.collected)}</td>
    <td class="num ${g.variance>=0?'recv-good':'recv-bad'}">${fmt(g.variance)}</td>
    <td class="num ${collectionAchievementClass(g.achievement)}">${pct(g.achievement)}</td>
    <td class="num">${fmt(g.invoiced)}</td><td class="num">${fmt(g.debt)}</td>
  </tr>`).join('');
  const total=items.reduce((a,g)=>({
    target:a.target+g.target,collected:a.collected+g.collected,
    variance:a.variance+g.variance,invoiced:a.invoiced+g.invoiced,debt:a.debt+g.debt
  }),{target:0,collected:0,variance:0,invoiced:0,debt:0});
  const ach=total.target?total.collected/total.target*100:0;
  return `<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>Selected Month by Entity &amp; Category</h3>
      <p class="hint">Use the Entity and Division filters above to isolate performance · AED '000</p></div></div>
    <div class="recv-table-wrap"><table class="recv-table coll-detail-table">
      <thead><tr><th>Entity</th><th>Category</th><th>Target</th><th>Collection</th>
      <th>Short / Excess</th><th>Achievement</th><th>Invoiced</th><th>Debt</th></tr></thead>
      <tbody>${body}
        <tr class="recv-summary-total"><td>Group Total</td><td></td>
        <td class="num">${fmt(total.target)}</td><td class="num">${fmt(total.collected)}</td>
        <td class="num ${total.variance>=0?'recv-good':'recv-bad'}">${fmt(total.variance)}</td>
        <td class="num">${pct(ach)}</td><td class="num">${fmt(total.invoiced)}</td>
        <td class="num">${fmt(total.debt)}</td></tr>
      </tbody></table></div>
  </div>`;
}
function collectionDetailTable(title,items){
  const body=items.sort((a,b)=>b.target-a.target).map(g=>`<tr>
    <td>${esc(g.label)}</td>
    <td class="num">${fmt(g.target)}</td>
    <td class="num">${fmt(g.collected)}</td>
    <td class="num ${g.variance>=0?'recv-good':'recv-bad'}">${fmt(g.variance)}</td>
    <td class="num ${collectionAchievementClass(g.achievement)}">${pct(g.achievement)}</td>
    <td class="num">${fmt(g.invoiced)}</td>
    <td class="num">${fmt(g.debt)}</td>
  </tr>`).join('');
  const total=items.reduce((a,g)=>({
    target:a.target+g.target,collected:a.collected+g.collected,variance:a.variance+g.variance,
    invoiced:a.invoiced+g.invoiced,debt:a.debt+g.debt
  }),{target:0,collected:0,variance:0,invoiced:0,debt:0});
  const ach=total.target?total.collected/total.target*100:0;
  return `<div class="card panel recv-panel">
    <div class="panelhead"><div><h3>${esc(title)}</h3>
      <p class="hint">Selected month · AED '000</p></div></div>
    <div class="recv-table-wrap"><table class="recv-table coll-detail-table">
      <thead><tr><th>Category</th><th>Target</th><th>Collection</th><th>Short / Excess</th><th>Achievement</th><th>Invoiced</th><th>Debt</th></tr></thead>
      <tbody>${body}
        <tr class="recv-summary-total"><td>Group Total</td><td class="num">${fmt(total.target)}</td><td class="num">${fmt(total.collected)}</td>
        <td class="num ${total.variance>=0?'recv-good':'recv-bad'}">${fmt(total.variance)}</td>
        <td class="num">${pct(ach)}</td><td class="num">${fmt(total.invoiced)}</td><td class="num">${fmt(total.debt)}</td></tr>
      </tbody>
    </table></div>
  </div>`;
}
function collectionSelectedMonthDetail(rows){
  const byProfit=collectionGroupRows(rows,'profitCentre');
  const byDivision=collectionGroupRows(rows,'division');
  const byCountry=collectionGroupRows(rows,'country');
  const byEntityCategory=collectionEntityCategoryRows(rows);
  return `${collectionEntityCategoryTable(byEntityCategory)}
  <div class="recv-two">
    ${collectionDetailTable('Selected Month by Profit Centre',byProfit)}
    ${collectionDetailTable('Selected Month by Division',byDivision)}
  </div>${collectionDetailTable('Selected Month by Country',byCountry)}`;
}
function renderCollectionsPerformance(){
  const data=parseCollectionSheet();
  if(data.error)return`<div class="card panel recv-panel"><div class="empty">Collection Performance requires the <strong>Coll vs Target</strong> sheet. ${esc(data.error)}.</div></div>`;
  ensureCollectionSelection(data);
  const rows=collectionRows(data);
  const html=collectionFilters(data)+collectionKPIs(rows)+collectionExecutive(rows)+collectionSelectedMonthDetail(rows)+collectionTrend(rows)+
    `<div class="recv-two">${collectionComparisonTable(rows,'month')}${collectionComparisonTable(rows,'ytd')}</div>`;
  setTimeout(bindCollectionFilters,0);
  return html;
}
function optional(kind){const names=C[kind],src=first(names);if(!src)return`<div class="card panel recv-panel"><div class="empty">${kind==='movement'?'Movement Analysis requires Receivable History or Receivable Movement.':'Collection reporting requires Collection Targets and Collection Actuals.'} Add the optional sheet(s) to Google Sheets and Apps Script, then refresh.</div></div>`;return`<div class="card panel recv-panel"><div class="panelhead"><div><h3>${kind==='movement'?'Receivable Movement Analysis':'Collections Performance'}</h3></div></div><div class="recv-detected">Data source detected: <strong>${esc(src.name)}</strong>. Use the standard template supplied in the ZIP.</div></div>`}
function content(){const root=$('recvContent');if(!root)return;try{const rs=rows(),a=aggregate(rs);if(!rs.length){root.innerHTML='<div class="card panel"><div class="empty">No receivable rows detected. Confirm the ERP tabs are exported and contain Account Name, Dimension, Outstanding Amount and aging headers.</div></div>';return}if(S.section==='aging')root.innerHTML=aging(a,rs);else if(S.section==='agingDetail')root.innerHTML=renderAgingDetail(rs);else if(S.section==='customers'){
  root.innerHTML=`${customerFilterOptions(rs)}${topTable(rs,'total','All Outstanding Customers')}${topTable(rs,'over180','All Customers Over 180 Days')}`;
  setTimeout(bindCustomerFilters,0);
}else if(S.section==='customerMovement')root.innerHTML=renderOver180Movement();else if(S.section==='movement')root.innerHTML=renderMovementAnalysis();else if(S.section==='collections')root.innerHTML=renderCollectionsPerformance();else root.innerHTML=overview(rs,a);
setTimeout(bindAgingFilterControls,0)}
catch(err){
  console.error('Receivables render error',err);
  root.innerHTML='<div class="card panel recv-panel"><div class="empty"><strong>Receivables rendering error:</strong> '+esc(err&&err.message?err.message:String(err))+'</div></div>';
}}
function render(){entityTabs();sectionTabs();const c=cfg(S.entity),sub=$('recvSubtitle');if(sub)sub.textContent=S.entity==='GROUP'?'Group converted to AED · SAR × 0.975 · OMR × 9.5'+(S.updated?' · Updated '+S.updated:''):`${c.label} shown in ${c.currency}${c.fx!==1?' · Group conversion rate '+c.fx+' AED':''}${S.updated?' · Updated '+S.updated:''}`;content()}
function styles(){if($('receivablesModuleStyles'))return;const s=document.createElement('style');s.id='receivablesModuleStyles';s.textContent=`#view-receivables .recv-toolbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#view-receivables .recv-entity-tabs,#view-receivables .recv-section-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}#view-receivables .recv-pill,#view-receivables .recv-subtab{border:1px solid #d8d1c4;background:#fff;border-radius:999px;padding:8px 13px;font-weight:700;cursor:pointer}#view-receivables .recv-pill.active,#view-receivables .recv-subtab.active{background:#0b3767;color:#fff;border-color:#0b3767}#view-receivables .recv-pill:disabled{opacity:.45}#view-receivables .recv-subtab{border-radius:8px}#view-receivables .recv-kpis{grid-template-columns:repeat(4,minmax(180px,1fr))}#view-receivables .recv-kpi .val{font-size:1.35rem}#view-receivables .recv-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}#view-receivables .recv-panel{margin-top:14px;overflow:hidden}#view-receivables .recv-bar-row{display:grid;grid-template-columns:minmax(125px,190px) 1fr 125px;gap:10px;align-items:center;margin:9px 0}#view-receivables .recv-bar-label{font-weight:650;overflow:hidden;text-overflow:ellipsis}#view-receivables .recv-bar-track{height:16px;background:#e9edf2;border-radius:20px;overflow:hidden}#view-receivables .recv-bar-fill{height:100%;background:linear-gradient(90deg,#0b3767,#4b89c8);border-radius:20px}#view-receivables .recv-bar-value{text-align:right;font-variant-numeric:tabular-nums}#view-receivables .recv-table-wrap{overflow:auto}#view-receivables .recv-table{width:100%;border-collapse:collapse}#view-receivables .recv-table th{background:#0b3767;color:#fff;padding:9px;text-align:left;white-space:nowrap}#view-receivables .recv-table td{padding:8px 9px;border-bottom:1px solid #e7e3dc}#view-receivables .recv-table tbody tr:nth-child(even){background:#f7fafc}

#view-receivables .recv-aging-distribution-total{
  display:flex;justify-content:space-between;align-items:center;
  margin-top:10px;padding:10px 12px;border-top:2px solid #173f6d;
  background:#eef3f8;color:#173f6d;font-size:.9rem
}
#view-receivables .recv-customer-filters{
  display:flex;align-items:end;gap:9px;flex-wrap:wrap;
  margin:10px 0;padding:10px 12px;background:#f6f3ed;
  border:1px solid #ded7cc;border-radius:10px
}
#view-receivables .recv-customer-filters label{
  display:flex;flex-direction:column;gap:4px;
  font-size:.72rem;font-weight:800;color:#53606c;
  text-transform:uppercase;letter-spacing:.04em
}
#view-receivables .recv-customer-filters select,
#view-receivables .recv-customer-filters input{
  min-width:145px;border:1px solid #cfc7bb;border-radius:7px;
  padding:7px 8px;background:#fff;font:inherit
}
#view-receivables .recv-customer-filters .recv-customer-search{
  flex:1;min-width:240px
}
#view-receivables .recv-customer-filters button{
  border:1px solid #cfc7bb;background:#fff;border-radius:7px;
  padding:8px 12px;font-weight:800;cursor:pointer
}


#view-receivables .recv-aging-detail-table .recv-total-final{font-weight:900;background:#eef3f8}
#view-receivables .recv-aging-detail-table th:last-child,
#view-receivables .recv-aging-detail-table td:last-child{border-left:2px solid #8fa5b8}

#view-receivables .recv-aging-filter-block{margin:10px 0}#view-receivables .recv-aging-filters{display:flex;align-items:end;gap:9px;flex-wrap:wrap;margin:12px 0;padding:10px 12px;background:#f6f3ed;border:1px solid #ded7cc;border-radius:10px}
#view-receivables .recv-aging-filters label{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:800;color:#53606c;text-transform:uppercase;letter-spacing:.04em}
#view-receivables .recv-aging-filters select,#view-receivables .recv-aging-filters input{min-width:120px;border:1px solid #cfc7bb;border-radius:7px;padding:7px 8px;background:#fff;font:inherit}
#view-receivables .recv-aging-filters .recv-aging-customer{flex:1;min-width:260px}
#view-receivables .recv-aging-filters .recv-aging-customer select{width:100%;max-width:560px}
#view-receivables .recv-aging-filter-note{margin-top:5px;font-size:.74rem;color:#68737e}#view-receivables .recv-aging-filters button{border:1px solid #cfc7bb;background:#fff;border-radius:7px;padding:8px 12px;font-weight:800;cursor:pointer}
#view-receivables .recv-landscape-scroll{max-height:650px;overflow:auto;scrollbar-gutter:stable both-edges}
#view-receivables .recv-aging-detail-table thead th{position:sticky;top:0;z-index:20}
#view-receivables .recv-aging-detail-table th:first-child,#view-receivables .recv-aging-detail-table td:first-child{position:sticky;left:0;z-index:12;background:#fff;min-width:280px}
#view-receivables .recv-aging-detail-table thead th:first-child{z-index:24;background:#0b3767}
#view-receivables .recv-aging-detail-table tfoot td{position:sticky;bottom:0;background:#dce8f4!important;font-weight:900;z-index:16}
#view-receivables .recv-range-total{font-weight:900;background:#eef5f2}
#view-receivables .recv-wide-two{grid-template-columns:minmax(680px,1.35fr) minmax(420px,.65fr)}
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
#view-receivables .recv-movement-kpis{grid-template-columns:repeat(6,minmax(130px,1fr));margin-top:14px}
#view-receivables .recv-no-x{overflow-x:hidden}
#view-receivables .recv-compact-table,#view-receivables .recv-aging-compact,#view-receivables .recv-recon-table{table-layout:fixed;width:100%;font-size:.82rem}
#view-receivables .recv-compact-table th,#view-receivables .recv-compact-table td,#view-receivables .recv-aging-compact th,#view-receivables .recv-aging-compact td,#view-receivables .recv-recon-table th,#view-receivables .recv-recon-table td{padding:7px 6px;white-space:normal;overflow-wrap:anywhere}
#view-receivables .recv-compact-table th:nth-child(1){width:12%}#view-receivables .recv-compact-table th:nth-child(2){width:8%}
#view-receivables .recv-movement-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#view-receivables .recv-validation-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:4px}
#view-receivables .recv-validation{display:flex;gap:8px;align-items:center;padding:9px 10px;border-radius:8px;background:#f4f6f8;font-size:.82rem}
#view-receivables .recv-validation.ok span{color:#14824b}#view-receivables .recv-validation.warn span{color:#c0392b}
#view-receivables .recv-status{display:inline-block;padding:3px 8px;border-radius:999px;font-weight:800;font-size:.75rem}
#view-receivables .recv-status.ok{background:#e5f5ec;color:#14824b}#view-receivables .recv-status.warn{background:#fdecea;color:#c0392b}
#view-receivables .recv-adjust-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:6px}
#view-receivables .recv-adjust-grid>div{padding:10px;border-radius:8px;background:#f5f8fb;display:flex;justify-content:space-between;gap:10px}
#view-receivables .recv-adjust-grid span{font-size:.8rem}#view-receivables .recv-adjust-grid b{font-variant-numeric:tabular-nums}#view-receivables .recv-adjust-grid small{display:block;color:#6b7280;font-size:.7rem;margin-top:3px}#view-receivables .recv-waterfall{display:flex;align-items:flex-end;justify-content:space-around;gap:10px;padding:18px 12px 8px;min-height:190px}#view-receivables .recv-waterfall-item{flex:1;min-width:0;text-align:center}#view-receivables .recv-waterfall-value{font-size:.75rem;font-weight:800;white-space:nowrap}#view-receivables .recv-waterfall-track{height:128px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #d6dbe1;margin:5px 0}#view-receivables .recv-waterfall-track i{display:block;width:64%;max-width:72px;border-radius:5px 5px 0 0;background:#4b89c8}#view-receivables .recv-waterfall-track i.add{background:#68b984}#view-receivables .recv-waterfall-track i.reduce{background:#d97b72}#view-receivables .recv-waterfall-track i.total{background:#0b3767}#view-receivables .recv-waterfall-label{font-size:.72rem;line-height:1.2;overflow-wrap:anywhere}




#view-receivables .recv-v21-table{table-layout:fixed;width:100%;font-size:.70rem}
#view-receivables .recv-v21-table th,#view-receivables .recv-v21-table td{padding:6px 4px;white-space:normal;overflow-wrap:anywhere;line-height:1.15}
#view-receivables .recv-v21-table th:nth-child(1){width:8%}#view-receivables .recv-v21-table th:nth-child(2){width:6%}
#view-receivables .recv-v21-table .num{font-variant-numeric:tabular-nums}

#view-receivables .recv-summary-total td{font-weight:800;background:#dce9f8!important;border-top:2px solid #9fb9dc}
#view-receivables .recv-summary-total:last-child td{background:#d9d9d9!important;border-top:3px solid #6e6e6e}#view-receivables .recv-detected{padding:12px 16px;background:#eef6ff;border-radius:8px;margin:12px}@media(max-width:1100px){#view-receivables .recv-movement-kpis{grid-template-columns:repeat(3,1fr)}#view-receivables .recv-validation-grid{grid-template-columns:repeat(2,1fr)}#view-receivables .recv-kpis{grid-template-columns:repeat(2,1fr)}#view-receivables .recv-two{grid-template-columns:1fr}}@media(max-width:650px){#view-receivables .recv-movement-grid{grid-template-columns:1fr}#view-receivables .recv-movement-kpis{grid-template-columns:repeat(2,1fr)}#view-receivables .recv-validation-grid{grid-template-columns:1fr}#view-receivables .recv-adjust-grid{grid-template-columns:1fr}#view-receivables .recv-kpis{grid-template-columns:1fr}}#view-receivables .recv-entity-total td{font-weight:700;background:#f3f7fb!important;border-top:1px solid #c7d6e8}
#view-receivables .recv-country-total td{font-weight:800;background:#dce9f8!important;border-top:2px solid #9fb9dc}
#view-receivables .recv-group-total td{font-weight:900;background:#d1d1d1!important;border-top:3px solid #666}
#view-receivables .recv-v21-table th,#view-receivables .recv-v21-table td{font-size:.72rem;padding:7px 5px;white-space:normal}

#view-receivables .coll-filter-panel{padding:12px 14px}
#view-receivables .coll-filter-grid{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;align-items:end}
#view-receivables .coll-filter-grid label{font-size:.72rem;font-weight:800;color:#596575;display:flex;flex-direction:column;gap:5px}
#view-receivables .coll-filter-grid select{width:100%;border:1px solid #d7dde5;border-radius:7px;padding:8px;background:#fff;color:#18222f}
#view-receivables .coll-toggle{border:1px solid #d7dde5;border-radius:7px;padding:7px 9px;display:grid!important;grid-template-columns:auto 1fr;align-items:center}
#view-receivables .coll-toggle input{grid-row:1/3}
#view-receivables .coll-toggle small{font-weight:500;color:#7a8490}
#view-receivables .coll-kpis{grid-template-columns:repeat(4,minmax(170px,1fr))}
#view-receivables .coll-exec p{line-height:1.55;margin:9px 0}
#view-receivables .coll-trend{height:250px;display:grid;grid-template-columns:repeat(12,1fr);gap:8px;align-items:end;padding:16px 8px 4px}
#view-receivables .coll-month{height:100%;display:grid;grid-template-rows:1fr auto;gap:6px;text-align:center;font-size:.72rem;color:#657181}
#view-receivables .coll-month.active span{font-weight:900;color:#0b3767}
#view-receivables .coll-month-bars{height:100%;display:flex;gap:3px;align-items:end;justify-content:center;border-bottom:1px solid #dbe1e8}
#view-receivables .coll-month-bars i{display:block;width:26%;min-height:2px;border-radius:4px 4px 0 0}
#view-receivables .coll-month-bars .invoice,#view-receivables .coll-legend .invoice{background:#6e9ed5}
#view-receivables .coll-month-bars .collect,#view-receivables .coll-legend .collect{background:#55b98a}
#view-receivables .coll-month-bars .target,#view-receivables .coll-legend .target{background:#d98572}
#view-receivables .coll-legend{display:flex;gap:18px;justify-content:center;margin:8px 0 2px;font-size:.76rem}
#view-receivables .coll-legend span{display:flex;gap:6px;align-items:center}
#view-receivables .coll-legend i{display:block;width:14px;height:8px;border-radius:3px}
#view-receivables .coll-compare th,#view-receivables .coll-compare td{white-space:normal}
@media(max-width:1100px){#view-receivables .coll-filter-grid{grid-template-columns:repeat(3,1fr)}#view-receivables .coll-kpis{grid-template-columns:repeat(2,1fr)}}
@media(max-width:700px){#view-receivables .coll-filter-grid{grid-template-columns:1fr 1fr}#view-receivables .coll-trend{gap:3px}#view-receivables .coll-month-bars{gap:1px}}

#view-receivables .recv-aging-detail-table{min-width:1750px;font-size:.74rem}
#view-receivables .recv-aging-detail-table th,#view-receivables .recv-aging-detail-table td{padding:6px 7px}
#view-receivables .recv-aging-detail-table .recv-customer-name{min-width:260px}
#view-receivables .coll-detail-table{min-width:760px}
#view-receivables .coll-detail-table .recv-summary-total td{font-weight:900;background:#d8d8d8!important;border-top:2px solid #666}

#view-receivables .recv-entity-tabs{
  position:sticky;top:0;z-index:40;background:#fbfaf7;padding:8px 0 4px;
  border-bottom:1px solid #e7dfd2
}
#view-receivables .recv-section-tabs{
  position:sticky;top:58px;z-index:39;background:#fbfaf7;padding:4px 0 8px;
  border-bottom:1px solid #e7dfd2
}
#view-receivables .recv-customer-scroll{
  max-height:520px;overflow-y:auto;overflow-x:auto;scrollbar-gutter:stable
}
#view-receivables .recv-customer-scroll .recv-table thead th,
#view-receivables .recv-aging-detail-table thead th,
#view-receivables .coll-detail-table thead th{
  position:sticky;top:0;z-index:5
}
#view-receivables .recv-age-amber{
  background:#fff3d8!important;color:#9a5b00!important;font-weight:700
}
#view-receivables .recv-age-red{
  background:#fde7e4!important;color:#b42318!important;font-weight:800
}
#view-receivables .recv-aging-detail-table th.recv-age-head-current{background:#0b3767!important}
#view-receivables .recv-aging-detail-table th.recv-age-head-amber{background:#b7791f!important}
#view-receivables .recv-aging-detail-table th.recv-age-head-red{background:#b42318!important}
#view-receivables .recv-aging-detail-table th.recv-total-head{background:#374151!important}
#view-receivables .recv-age-current{background:#f8fafc!important;color:#1f2937!important}
#view-receivables .recv-kpi .val.neg{color:#b42318!important}
#view-receivables .recv-kpi .val.warn{color:#b7791f!important}

/* Frozen identity columns in Aging Analysis Detail */
#view-receivables .recv-aging-detail-table{
  border-collapse:separate;
  border-spacing:0;
}
#view-receivables .recv-aging-detail-table th:nth-child(1),
#view-receivables .recv-aging-detail-table td:nth-child(1){
  position:sticky;
  left:0;
  z-index:8;
  min-width:260px;
  max-width:260px;
}
#view-receivables .recv-aging-detail-table th:nth-child(2),
#view-receivables .recv-aging-detail-table td:nth-child(2){
  position:sticky;
  left:260px;
  z-index:8;
  min-width:95px;
  max-width:95px;
}
#view-receivables .recv-aging-detail-table th:nth-child(3),
#view-receivables .recv-aging-detail-table td:nth-child(3){
  position:sticky;
  left:355px;
  z-index:8;
  min-width:140px;
  max-width:140px;
}
#view-receivables .recv-aging-detail-table thead th:nth-child(-n+3){
  z-index:12;
  background:#0b3767!important;
  color:#fff!important;
}
#view-receivables .recv-aging-detail-table tbody td:nth-child(-n+3){
  background:#fff!important;
  box-shadow:1px 0 0 #e7e3dc;
}
#view-receivables .recv-aging-detail-table tbody tr:nth-child(even) td:nth-child(-n+3){
  background:#f7fafc!important;
}
#view-receivables .recv-aging-detail-table td:nth-child(1){
  text-align:left!important;
  white-space:normal;
  overflow-wrap:anywhere;
}
`;document.head.appendChild(s)}
function ui(){styles();const nav=$('nav')||document.querySelector('nav.tabs');if(nav&&!nav.querySelector('[data-view="receivables"]')){const b=document.createElement('button');b.type='button';b.dataset.view='receivables';b.textContent='Receivables';const tx=nav.querySelector('[data-view="transactions"]');tx?nav.insertBefore(b,tx):nav.appendChild(b)}const main=document.querySelector('main');if(main&&!$('view-receivables')){const sec=document.createElement('section');sec.className='view';sec.id='view-receivables';sec.innerHTML=`<div class="card panel"><div class="panelhead recv-toolbar"><div><h2>Receivables Intelligence</h2><p class="hint" id="recvSubtitle">ERP aging, collections and movement analysis</p></div><button class="btn ghost" id="recvRefreshBtn">Refresh Receivables</button></div><div id="recvEntityTabs" class="recv-entity-tabs"></div><div id="recvSectionTabs" class="recv-section-tabs"></div><div id="recvContent"><div class="empty">Loading receivables…</div></div></div>`;main.appendChild(sec);$('recvRefreshBtn').onclick=refresh}}
function api(){for(const id of['googleSheetUrl','googleUrl','sheetApiUrl','appsScriptUrl']){const el=$(id);if(el&&clean(el.value))return clean(el.value)}for(const k of['cf_google_sheet_url','googleSheetUrl','cashflow_google_url','appsScriptUrl'])try{const v=localStorage.getItem(k);if(clean(v))return clean(v)}catch(_){}return clean(window.DEFAULT_GOOGLE_SHEET_URL||'')}
function jsonp(url){return new Promise((res,rej)=>{const cb='recvJsonp_'+Date.now()+'_'+Math.random().toString(36).slice(2),sc=document.createElement('script'),sep=url.includes('?')?'&':'?',tm=setTimeout(()=>{done();rej(new Error('Receivables request timed out.'))},120000);function done(){clearTimeout(tm);try{delete window[cb]}catch(_){window[cb]=undefined}if(sc.parentNode)sc.parentNode.removeChild(sc)}window[cb]=d=>{done();res(d)};sc.onerror=()=>{done();rej(new Error('Could not load Google Sheet endpoint.'))};sc.src=url+sep+'callback='+encodeURIComponent(cb)+'&t='+Date.now();document.body.appendChild(sc)})}
function applyPayload(payload){
  if(!payload||typeof payload!=='object')return false;
  S.payload=payload;
  S.updated=payload.lastUpdated?new Date(payload.lastUpdated).toLocaleString():new Date().toLocaleString();
  parseAll();
  render();
  return true;
}
async function refresh(o){
  o=o||{};
  ui();
  const root=$('recvContent');

  if(applyPayload(window.GOOGLE_SHEET_RAW_PAYLOAD))return true;

  if(root&&!o.silent)root.innerHTML='<div class="empty">Refreshing receivables…</div>';

  if(typeof window.loadGoogleSheetScope!=='function'){
    if(root)root.innerHTML='<div class="empty">Click the main <strong>Refresh Google Sheet</strong> button first.</div>';
    return false;
  }

  const scopes=[
    'receivables-alps','receivables-alu','receivables-alis',
    'receivables-alicler','receivables-uz',
    'receivables-history','receivables-movement','collections'
  ];
  const merged={version:'FIP-6.2.5',sheets:{}};
  const failures=[];

  for(const scope of scopes){
    try{
      let payload;
      try{
        payload=await window.loadGoogleSheetScope(scope,{force:true,timeoutMs:120000});
      }catch(firstError){
        await new Promise(resolve=>setTimeout(resolve,1000));
        payload=await window.loadGoogleSheetScope(scope,{force:true,timeoutMs:180000});
      }
      if(payload&&payload.sheets)Object.assign(merged.sheets,payload.sheets);
      if(payload&&payload.lastUpdated)merged.lastUpdated=payload.lastUpdated;
    }catch(error){
      failures.push(scope);
      console.warn('[RECEIVABLES_INTELLIGENCE] Optional scope failed:',scope,error);
    }
  }

  if(!Object.keys(merged.sheets).length){
    if(root)root.innerHTML='<div class="empty">Could not load Receivables Intelligence. No receivable scope returned data.</div>';
    return false;
  }

  window.GOOGLE_SHEET_RAW_PAYLOAD=window.GOOGLE_SHEET_RAW_PAYLOAD||{sheets:{}};
  window.GOOGLE_SHEET_RAW_PAYLOAD.sheets=window.GOOGLE_SHEET_RAW_PAYLOAD.sheets||{};
  Object.assign(window.GOOGLE_SHEET_RAW_PAYLOAD.sheets,merged.sheets);
  applyPayload(window.GOOGLE_SHEET_RAW_PAYLOAD);

  if(failures.length&&root){
    const note=document.createElement('div');
    note.className='recv-detected';
    note.textContent='Some optional receivable sources did not refresh: '+failures.join(', ')+'. Existing data was retained where available.';
    root.prepend(note);
  }
  return true;
}
function wrap(){
  if(S.wrapped||typeof window.refreshFromGoogleSheet!=='function')return false;
  const old=window.refreshFromGoogleSheet;
  window.refreshFromGoogleSheet=async function(){
    const r=await old.apply(this,arguments);
    if(window.GOOGLE_SHEET_RAW_PAYLOAD)applyPayload(window.GOOGLE_SHEET_RAW_PAYLOAD);
    return r;
  };
  S.wrapped=true;
  return true;
}
function boot(){
  ui();

  // Receive the exact payload loaded by app.js.
  window.addEventListener('googleSheetPayloadReady',function(e){
    applyPayload(e&&e.detail?e.detail:window.GOOGLE_SHEET_RAW_PAYLOAD);
  });

  const t=setInterval(()=>{
    ui();
    wrap();
    if(window.GOOGLE_SHEET_RAW_PAYLOAD){
      applyPayload(window.GOOGLE_SHEET_RAW_PAYLOAD);
      clearInterval(t);
    }
  },250);

  setTimeout(()=>clearInterval(t),15000);

  // Do not start a competing full API request during page load.
  setTimeout(()=>{
    if(!window.GOOGLE_SHEET_RAW_PAYLOAD){
      const root=$('recvContent');
      if(root)root.innerHTML='<div class="empty">Click <strong>Refresh Google Sheet</strong> to load Receivables Intelligence.</div>';
    }
  },1200);
}
window.RECEIVABLES_INTELLIGENCE={refresh,render,state:S,config:C,applyPayload};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
