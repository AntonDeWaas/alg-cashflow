// ALG Cash Flow Dashboard v24.0 - scoped Google Sheet API
var DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzmnGUq4lY8ZQeuHBgILPmv317HX5t4ou-dFVQZxhKe0SAe_4WfLDRGdfvsvffQQkIS/exec';
var SHEET_IMPORT_NAMES = ['ALPS-CB','ALICLER-CB','SS-CB','OMAN-CB','KSA-CB','ALPS BR-CB','ALPS UZ-CB','Bank Balance'];
var DASHBOARD_DATA = null;
var QIDDIYA_DATA = null;
/* ---------------- storage layer (window.storage with in-memory fallback) ------------- */
const KEY='cashflow_data';
let hasStorage = typeof window!=='undefined' && window.storage && typeof window.storage.get==='function';
let mem=null; // in-memory fallback
async function loadRaw(){
  if(hasStorage){
    try{ const r=await window.storage.get(KEY); return r? r.value : null; }
    catch(e){ return null; }
  }
  return mem;
}
async function saveRaw(str){
  if(hasStorage){ try{ await window.storage.set(KEY,str); return; }catch(e){ hasStorage=false; } }
  mem=str;
}

/* ---------------- model ---------------- */
const ENTITIES=[
  {id:'alps',  name:'ALPS-CB',     label:'ALPS'},
  {id:'alic',  name:'ALICLER-CB',  label:'ALICLER'},
  {id:'ss',    name:'SS-CB',       label:'SS'},
  {id:'oman',  name:'Oman-CB',     label:'Oman'},
  {id:'ksa',   name:'Ksa-CB',      label:'KSA'},
  {id:'br',    name:'ALPS BR-CB',  label:'ALPS BR'},
  {id:'uz',    name:'ALPS UZ-CB',  label:'ALPS UZ'},
];
const DEFAULT_INFLOW=['Collections','Advance Received','Intercompany Transfer','Borrowings','Arch Income','Returned Cheque','Others'];
const DEFAULT_OUTFLOW=['Supplier Payments','Sub Contractors','Proj Exp','Salaries & Wages','Manpower Outsourced','Rent','Mortgage','Auto Loan','Term Loan','Fuel','Telecommunication','Utility','Visa','Vat/Tax','Bank Charges','Bank Guarantees','Insurance','Credit Cards','Petty Cash','IT / Digital & Office Exp','Audit Fees','Legal & Professional Fees','Trade License','Sponsorship Fee','Marketing & Branding','Staff Tickets/Travel','Final Sett/Leave Salary','Loans to Employee','Bonus','Capital Expenses','Intercompany Loan/Dividend','Project Qiddiya Outflow','Others'];

function freshData(){
  return {
    version:1, year:2026, unit:'k',
    entities:ENTITIES.map(e=>({...e, opening:0})),
    inflowCategories:[...DEFAULT_INFLOW],
    outflowCategories:[...DEFAULT_OUTFLOW],
    transactions:[]
  };
}
let D=freshData();

/* ---------------- helpers ---------------- */
const $=id=>document.getElementById(id);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmt(n){
  if(n===0||n===undefined||n===null||isNaN(n)) return '—';
  const neg=n<0; const v=Math.abs(n);
  const s=v.toLocaleString('en-US',{maximumFractionDigits:D.unit==='k'?0:2, minimumFractionDigits:0});
  return neg? '('+s+')' : s;
}
function cls(n){ return n<0?'neg':(n>0?'pos':'muted'); }
function monthsOf(){ return MONTHS.map((m,i)=>D.year+'-'+String(i+1).padStart(2,'0')); }
function mKey(d){ return (d||'').slice(0,7); }

/* compute monthly opening/inflow/outflow/closing for an entity in selected year */
function forecastEntityForId(entId){
  const ent=D.entities.find(e=>e.id===entId);
  if(!ent || typeof FORECAST_DATA==='undefined' || !Array.isArray(FORECAST_DATA.entities)) return null;
  const target=String(ent.name||'').toLowerCase().replace(/\s+/g,'').replace(/oman-cb/,'oman-cb').replace(/ksa-cb/,'ksa-cb');
  return FORECAST_DATA.entities.find(f=>String(f.sheet||f.name||'').toLowerCase().replace(/\s+/g,'')===target) || null;
}
function entityMonthly(entId){
  // Prefer live Google Sheet / forecast data for the By Business Unit tab.
  const fEnt=forecastEntityForId(entId);
  if(fEnt && Array.isArray(fEnt.monthlySummary) && fEnt.monthlySummary.length){
    const rows=monthsOnly(fEnt.monthlySummary).map(r=>({
      month:r.month,
      opening:Number(r.opening)||0,
      inflow:Number(r.inflows)||0,
      outflow:Number(r.outflows)||0,
      closing:(r.closing!==undefined&&r.closing!==null&&!isNaN(Number(r.closing))&&Number(r.closing)!==0?Number(r.closing):((Number(r.opening)||0)+(Number(r.inflows)||0)-(Number(r.outflows)||0)))
    }));
    while(rows.length<12){ rows.push({month:MONTHS[rows.length],opening:0,inflow:0,outflow:0,closing:0}); }
    return {opening:rows[0]?.opening||0, rows:rows.slice(0,12)};
  }

  // Fallback to manually entered transaction ledger.
  const ent=D.entities.find(e=>e.id===entId);
  const open=ent? (+ent.opening||0):0;
  const months=monthsOf();
  const inflow=Array(12).fill(0), outflow=Array(12).fill(0);
  D.transactions.forEach(t=>{
    if(t.entityId!==entId) return;
    const k=mKey(t.date); const idx=months.indexOf(k);
    if(idx<0) return;
    if(t.type==='inflow') inflow[idx]+= +t.amount||0; else outflow[idx]+= +t.amount||0;
  });
  const rows=[]; let prevClose=open;
  for(let i=0;i<12;i++){
    const op=prevClose; const cl=op+inflow[i]-outflow[i];
    rows.push({month:MONTHS[i], opening:op, inflow:inflow[i], outflow:outflow[i], closing:cl});
    prevClose=cl;
  }
  return {opening:open, rows};
}
function consolidated(){
  const months=Array.from({length:12},()=>({opening:0,inflow:0,outflow:0,closing:0}));
  let totalOpen=0;
  D.entities.forEach(e=>{
    const em=entityMonthly(e.id); totalOpen+=em.opening;
    em.rows.forEach((r,i)=>{months[i].opening+=r.opening; months[i].inflow+=r.inflow; months[i].outflow+=r.outflow; months[i].closing+=r.closing;});
  });
  return {totalOpen, months};
}

/* ---------------- rendering: consolidated ---------------- */
function renderDashboard(){
  // The Consolidated tab must be driven by the imported Group Forecast,
  // not the separate transaction-entry ledger. This keeps it aligned with
  // the Group Forecast and Business Unit forecast tabs.
  const group = (typeof FORECAST_DATA !== 'undefined' && FORECAST_DATA.group) ? FORECAST_DATA.group : null;
  if(!group || !group.monthlySummary){
    const c=consolidated();
    $('consSummary').innerHTML=summaryTable(c.months, c.totalOpen);
    renderChart(c.months);
    return;
  }
  const months = monthsOnly(group.monthlySummary).map(r=>({
    month:r.month,
    opening:Number(r.opening)||0,
    inflow:Number(r.inflows)||0,
    outflow:Number(r.outflows)||0,
    closing:Number(r.closing)||0
  }));
  const year = group.monthlySummary.find(r=>r.month==='Year Total') || {
    opening: months[0]?.opening || 0,
    inflows: months.reduce((a,m)=>a+m.inflow,0),
    outflows: months.reduce((a,m)=>a+m.outflow,0),
    closing: months[months.length-1]?.closing || 0
  };
  const opening = Number(year.opening)||Number(months[0]?.opening)||0;
  const inSum = Number(year.inflows)||months.reduce((a,m)=>a+m.inflow,0);
  const outSum = Number(year.outflows)||months.reduce((a,m)=>a+m.outflow,0);
  const closing = Number(year.closing)||Number(months[months.length-1]?.closing)||0;
  const net = inSum-outSum;

  $('kpis').innerHTML=[
    ['Opening balance', fmt(opening),'Group Forecast · '+(FORECAST_DATA.asOf||D.year),''],
    ['Total inflows', fmt(inSum),'Forecast receipts','pos'],
    ['Total outflows', fmt(outSum),'Forecast payments','neg'],
    ['Closing balance', fmt(closing), (net>=0?'Net +':'Net ')+fmt(net)+' for year', cls(closing)]
  ].map(k=>`<div class="card kpi"><div class="lbl">${k[0]}</div><div class="val num ${k[3]}">${k[1]}</div><div class="meta">${k[2]}</div></div>`).join('');

  $('consSummary').innerHTML=summaryTable(months, opening);
  renderChart(months);

  const entitySheets = forecastSheets().filter(s=>s.sheet!=='GROUP');
  const rows = entitySheets.map(s=>{
    const m = monthsOnly(s.monthlySummary||[]);
    const y = (s.monthlySummary||[]).find(r=>r.month==='Year Total') || {};
    const op = Number(y.opening)||Number(m[0]?.opening)||0;
    const ins = Number(y.inflows)||m.reduce((a,r)=>a+(Number(r.inflows)||0),0);
    const outs = Number(y.outflows)||m.reduce((a,r)=>a+(Number(r.outflows)||0),0);
    const close = Number(y.closing)||Number(m[m.length-1]?.closing)||0;
    return `<tr><td class="rowhead">${escapeHtml(s.name||s.sheet)}</td><td class="num">${fmt(op)}</td>
      <td class="num pos">${fmt(ins)}</td><td class="num neg">${fmt(outs)}</td>
      <td class="num ${cls(close)}">${fmt(close)}</td></tr>`;
  }).join('');
  $('unitSnapshot').innerHTML=`<table><thead><tr><th>Business unit</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Closing</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Group total</td><td class="num">${fmt(opening)}</td><td class="num pos">${fmt(inSum)}</td><td class="num neg">${fmt(outSum)}</td><td class="num ${cls(closing)}">${fmt(closing)}</td></tr></tfoot></table>`;
}
function summaryTable(months, opening){
  const head='<tr><th>Line</th>'+MONTHS.map(m=>`<th>${m}</th>`).join('')+'<th>Total</th></tr>';
  const inTot=months.reduce((a,m)=>a+m.inflow,0);
  const outTot=months.reduce((a,m)=>a+m.outflow,0);
  const r=(label,vals,total,klass='')=>`<tr><td class="rowhead">${label}</td>${vals.map(v=>`<td class="num ${klass}">${fmt(v)}</td>`).join('')}<td class="num ${klass}">${fmt(total)}</td></tr>`;
  return `<table><thead>${head}</thead><tbody>
    ${r('Opening balance', months.map(m=>m.opening), opening)}
    ${r('Total inflows', months.map(m=>m.inflow), inTot,'pos')}
    ${r('Total outflows', months.map(m=>m.outflow), outTot,'neg')}
    </tbody><tfoot>
    ${r('Closing balance', months.map(m=>m.closing), months[11].closing)}
    </tfoot></table>`;
}

function renderChart(months){
  const svg=$('chart'); const W=900,H=230, padL=8,padR=8,padT=14,padB=22;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  const nets=months.map(m=>m.inflow-m.outflow);
  const closes=months.map(m=>m.closing);
  const maxNet=Math.max(1,...nets.map(Math.abs));
  const allClose=closes.concat([0]); const cMin=Math.min(...allClose), cMax=Math.max(...allClose,1);
  const cRange=(cMax-cMin)||1;
  const bw=innerW/12, barW=bw*0.5;
  const zeroY=padT+innerH/2;
  let bars='', line='', dots='', labels='';
  months.forEach((m,i)=>{
    const x=padL+i*bw+bw/2;
    const h=(Math.abs(nets[i])/maxNet)*(innerH/2-6);
    const y=nets[i]>=0? zeroY-h : zeroY;
    bars+=`<rect x="${x-barW/2}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${nets[i]>=0?'#0F6E5A':'#A33A2E'}" opacity=".85"></rect>`;
    const cy=padT+innerH-((closes[i]-cMin)/cRange)*innerH;
    line+=(i===0?'M':'L')+x+' '+cy+' ';
    dots+=`<circle cx="${x}" cy="${cy}" r="3" fill="#B07D2B"></circle>`;
    labels+=`<text x="${x}" y="${H-6}" font-size="11" fill="#4A524E" text-anchor="middle" font-family="Helvetica,Arial">${MONTHS[i]}</text>`;
  });
  svg.innerHTML=`<line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="#E2DDD1"></line>
    ${bars}<path d="${line}" fill="none" stroke="#B07D2B" stroke-width="2"></path>${dots}${labels}`;
}

const FORECAST_DATA = {"asOf":"26th May 2026","entities":[{"sheet":"ALPS-CB","name":"ALPS-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":0.0,"statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[40360.465,25754.898,30028.63,30403.922,40360.465,35313.368,38803.016,40500.176,42430.523,36819.109,35313.368,36819.109,46073.979,44413.572,45293.031,41239.841,36819.109,41239.841,42356.285,42566.943,47873.87,43897.177,41239.841,43628.73,48579.029,48022.667,47380.41,42225.92,41310.693,43628.73,41310.693,29254.307,38793.975,41531.103,37701.85,37495.164,32677.032,40360.465]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,11200.0,6266.713,3008.671,2090.563,918.113,0.0,0.0,23484.06]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[4096.576,3940.726,2969.785,9196.413,20203.5,5060.94,6271.844,4969.22,1175.687,0.0,17477.691,4890.75,2455.692,5515.051,6628.509,0.0,19490.002,2497.369,3592.671,8194.811,2720.098,2449.726,19454.676,5386.084,1582.792,2440.526,3803.105,555.03,0.0,13767.537,0.0,0.0,0.0,0.0,0.0,0.0,0.0,90393.406]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,17568.64,14025.183,6618.058,7493.325,6669.337,7279.387,59653.931]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[4096.576,3940.726,2969.785,9196.413,20203.5,5060.94,6271.844,4969.22,1175.687,0.0,17477.691,4890.75,2455.692,5515.051,6628.509,0.0,19490.002,2497.369,3592.671,8194.811,2720.098,2449.726,19454.676,5386.084,1582.792,2440.526,3803.105,555.03,0.0,13767.537,11200.0,23835.353,17033.854,8708.621,8411.438,6669.337,7279.387,173531.397]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Advance Received","type":"line","values":[679.511,51.161,9.975,49.41,790.057,20.0,57.55,72.17,7.6,0.0,157.32,247.08,43.0,3.99,24.338,0.0,318.408,3.675,3.308,23.034,1.02,0.0,31.037,0.525,1.05,49.013,4.2,0.0,0.0,54.788,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1351.609]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-15.75,0.0,-22.54,0.0,-38.29,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-38.29]},{"excelRow":22,"label":"Intercompany Trf","type":"line","values":[-4940.508,0.0,31.133,1882.263,-3027.113,57.75,-200.0,0.0,19999.97,0.0,19857.72,0.0,0.0,0.0,0.0,0.0,0.0,-268.868,0.0,0.0,0.0,0.0,-268.868,0.0,0.0,48.57,-367.5,0.0,0.0,-318.93,758.936,10000.0,0.0,0.0,0.0,0.0,0.0,27001.746]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[22.917,0.0,0.0,252.0,274.917,0.0,1898.706,1680.0,0.0,0.0,3578.706,5557.5,1.75,-1785.182,0.0,0.0,3774.068,23.379,4.8,0.0,-1680.0,0.0,-1651.821,0.0,0.0,0.0,1.147,0.0,0.0,1.147,0.0,0.0,0.0,0.0,5000.0,0.0,0.0,10977.016]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[-141.505,3991.887,3010.893,11380.085,18241.36,5138.69,8028.1,6721.39,21183.257,0.0,41071.437,10695.33,2484.692,3733.858,6630.307,0.0,23544.187,2255.556,3600.778,8217.846,1041.118,2449.726,17565.024,5386.609,1583.842,2538.109,3440.952,555.03,0.0,13504.542,11958.936,33835.353,17033.854,8708.621,13411.438,6669.337,7279.387,212823.477]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Supplier Payments","type":"line","values":[4270.511,201.757,137.464,2630.896,7240.628,5.839,609.824,2068.391,3307.557,0.0,5991.612,-28.48,65.002,1.837,5147.316,0.0,5185.676,403.314,180.053,808.701,4591.703,8.558,5992.328,0.0,0.735,512.01,5086.482,718.538,0.0,6317.766,1400.0,1400.0,1400.0,2450.0,2450.0,2450.0,2450.0,44728.01]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,587.565,0.0,0.0,587.565,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,345.396,0.0,0.0,345.396,0.0,0.0,0.0,0.0,0.0,0.0,0.0,932.961]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[1041.181,13.532,0.0,1183.864,2238.578,609.316,1988.719,0.0,9.828,0.0,2607.863,59.848,122.674,13.986,238.825,0.0,435.333,494.785,508.085,642.653,147.0,321.456,2113.979,106.197,1122.176,249.858,97.507,587.625,0.0,2163.363,7690.552,6656.707,1675.221,772.582,0.0,0.0,0.0,26354.177]},{"excelRow":33,"label":"Proj Exp KSA","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[39.235,0.0,144.707,0.0,183.942,0.0,0.0,146.529,0.0,0.0,146.529,0.0,0.0,0.0,123.585,0.0,123.585,0.0,0.0,151.834,0.0,0.0,151.834,0.0,0.0,0.0,141.311,0.0,0.0,141.311,125.0,125.0,125.0,125.0,125.0,125.0,125.0,1622.201]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[50.651,34.755,101.196,7.936,194.539,1.139,0.0,12.6,0.0,0.0,13.739,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,15.654,0.0,0.0,0.0,15.654,0.0,0.0,0.0,0.0,0.0,0.0,0.0,223.932]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,5000.007,1272.462,461.1,46.719,17.102,0.0,0.0,6797.39]},{"excelRow":38,"label":"Adjustments","type":"line","values":[0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,0.0,0.0,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[5401.579,250.044,383.367,3822.697,9857.687,616.294,2598.543,2815.085,3317.385,0.0,9347.308,31.368,187.676,15.823,5509.727,0.0,5744.595,898.099,688.139,1603.187,4738.703,330.013,8258.141,106.197,1122.911,777.522,5670.695,1306.163,0.0,8983.489,14215.559,9454.169,3661.321,3394.301,2592.102,2575.0,2575.0,80658.671]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[2633.42,0.75,-35.0,2242.236,4841.406,2.4,2299.829,0.0,2241.231,0.0,4543.461,7.964,2342.524,2199.309,45.018,0.0,4594.815,20.069,1803.055,0.673,-35.0,2052.243,3841.04,9.124,18.729,1799.116,2046.49,0.0,0.0,3873.46,3870.0,3870.0,3870.0,4170.0,5665.158,4350.0,4350.0,51839.34]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[24.0,0.0,1359.335,0.0,1383.334,0.0,49.642,1132.969,0.0,0.0,1182.611,4.2,0.0,0.0,789.525,0.0,793.725,0.0,0.0,534.183,0.0,0.0,534.183,24.255,0.0,0.0,119.038,0.0,0.0,143.293,178.78,175.0,175.0,175.0,700.0,700.0,0.0,6140.927]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[0.0,0.0,76.323,0.0,76.323,0.0,0.0,83.771,0.0,0.0,83.771,0.0,0.0,72.279,0.0,0.0,72.279,0.0,0.0,69.794,0.0,0.0,69.794,0.0,0.0,0.0,70.584,0.0,0.0,70.584,71.0,71.0,71.0,71.0,71.0,71.0,71.0,869.752]},{"excelRow":48,"label":"Utility","type":"line","values":[51.927,0.0,0.0,0.0,51.927,47.154,0.0,0.0,0.0,0.0,47.154,46.623,0.0,0.0,0.0,0.0,46.623,48.145,0.0,0.0,0.0,0.0,48.145,50.123,0.0,0.0,0.0,0.0,0.0,50.123,60.0,80.0,80.0,80.0,50.0,50.0,50.0,693.972]},{"excelRow":49,"label":"Rent","type":"line","values":[243.887,189.613,388.98,0.0,822.48,67.016,27.012,64.63,142.191,0.0,300.849,969.402,92.237,436.23,0.0,0.0,1497.869,8.75,66.811,149.917,54.6,87.591,367.67,106.057,81.48,92.237,388.98,0.0,0.0,668.755,1140.26,767.279,300.645,1647.869,399.17,668.755,1082.714,9664.314]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,24.449,4.642,0.0,29.091,0.0,24.449,0.0,4.642,0.0,29.091,0.0,19.696,10.657,4.642,0.0,34.995,0.0,0.0,28.718,4.642,0.0,33.36,0.0,0.0,14.189,15.299,0.0,0.0,29.488,29.488,29.488,29.488,29.488,29.488,29.488,24.846,357.799]},{"excelRow":51,"label":"Mortgage","type":"line","values":[372.722,0.0,0.0,258.594,631.316,367.148,0.0,0.0,254.231,0.0,621.379,358.138,0.0,0.0,254.656,0.0,612.794,0.0,363.842,0.0,0.0,254.862,618.704,0.0,72.634,0.0,0.0,43.873,0.0,116.507,119.1,119.1,119.1,119.1,119.1,616.907,3603.749,7416.857]},{"excelRow":52,"label":"Salik","type":"line","values":[20.0,0.0,0.0,0.0,20.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,20.0,0.0,0.0,20.0,0.0,60.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,25.0,0.0,0.0,0.0,0.0,25.0,0.0,0.0,0.0,0.0,0.0,0.0,10.0,0.0,0.0,0.0,0.0,10.0,0.0,10.0,0.0,0.0,0.0,0.0,10.0,15.0,0.0,10.0,0.0,15.0,0.0,10.0,95.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[189.183,0.0,160.884,0.0,350.067,0.0,192.071,0.0,139.189,0.0,331.26,0.0,164.827,0.0,68.521,0.0,233.348,0.0,129.17,101.814,0.0,0.0,230.984,0.0,0.0,198.803,55.293,0.0,0.0,254.096,247.5,247.5,247.5,247.5,247.5,247.5,247.5,3132.255]},{"excelRow":55,"label":"Visa","type":"line","values":[100.0,0.0,11.052,0.0,111.052,0.0,50.0,10.456,0.0,0.0,60.456,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,7.048,7.829,6.919,21.796,0.0,0.0,43.185,0.0,0.0,0.0,43.185,100.0,100.0,100.0,100.0,100.0,100.0,100.0,936.489]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[13.896,7.071,0.456,0.644,22.067,1.304,14.531,0.614,2.069,0.0,18.518,13.13,1.178,0.387,4.131,0.0,18.826,13.862,0.329,0.717,0.51,0.816,16.233,12.843,0.441,0.478,1.462,0.311,0.0,15.536,20.0,20.0,20.0,20.0,20.0,20.0,20.0,231.18]},{"excelRow":57,"label":"Restricted cash \u2013 guarantees and deposits","type":"line","values":[0.0,-1010.366,0.0,0.0,-1010.366,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,6272.55,0.0,0.0,0.0,0.0,0.0,5262.184]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,2939.366,0.0,2939.366,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1169.684,0.0,3000.0,1016.616,0.0,0.0,676.722,8802.388]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,250.0,0.0,0.0,0.0,0.0,0.0,0.0,250.0]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,250.0,0.0,0.0,0.0,0.0,250.0]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,42.0,0.0,0.0,1.984,0.0,43.984,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,43.984]},{"excelRow":62,"label":"Insurance","type":"line","values":[13.29,127.888,0.0,11.717,152.896,228.414,303.796,0.0,523.173,0.0,1055.382,1.573,252.0,0.0,11.718,0.0,265.29,1.573,27.316,0.0,0.6,0.0,29.489,0.0,592.461,-12.55,-2.377,0.0,0.0,577.533,14.0,559.599,14.0,14.0,566.949,425.82,432.754,4107.711]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[199.532,0.0,0.0,46.72,246.252,0.0,42.516,150.0,0.0,0.0,192.516,0.0,0.0,0.0,158.793,0.0,158.793,0.0,0.0,100.0,0.0,0.0,100.0,98.916,237.548,0.0,50.0,71.873,0.0,458.336,300.0,200.0,300.0,300.0,300.0,300.0,300.0,3155.897]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[71.646,57.91,22.97,20.0,172.525,39.775,14.84,59.741,7.284,0.0,121.64,0.0,14.058,21.672,4.796,0.0,40.526,5.09,32.737,13.749,23.292,14.0,88.867,37.475,4.0,20.651,30.125,0.0,0.0,92.251,60.0,60.0,60.0,60.0,125.0,125.0,125.0,1130.809]},{"excelRow":65,"label":"IT / Digital And Office Exp","type":"line","values":[97.682,0.0,2.1,8.623,108.405,128.915,0.0,16.018,30.75,0.0,175.683,22.002,0.0,0.0,62.87,0.0,84.872,31.492,55.313,10.596,93.707,10.9,202.009,8.055,0.0,0.0,10.896,48.038,0.0,66.989,100.0,100.0,100.0,100.0,100.0,100.0,100.0,1337.958]},{"excelRow":66,"label":"Sub Total","type":"total","values":[4031.185,-602.685,1991.742,2588.535,8008.777,907.124,3018.687,1518.199,3344.762,0.0,8788.772,1423.031,2886.521,2740.534,4344.034,0.0,11394.12,180.98,2478.574,1017.21,152.166,2427.33,6256.26,346.848,1017.293,2156.11,2785.79,164.095,0.0,6470.135,7744.812,12671.516,8766.733,8150.573,8508.365,7824.47,11194.285,105778.818]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,750.0,0.0,0.0,0.0,0.0,1500.0,2250.0]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[12.598,68.395,51.655,0.0,132.648,66.928,58.697,56.758,8.473,0.0,190.857,1.0,19.625,97.442,6.615,0.0,124.683,50.709,8.817,3.748,116.037,0.0,179.312,3.682,0.0,219.852,6.768,0.0,0.0,230.302,282.0,282.0,381.426,280.0,125.0,125.0,125.0,2458.228]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[1.2,2.4,0.0,-0.5,3.1,-22.5,161.2,50.0,4.3,0.0,193.0,-24.82,-3.04,0.6,0.0,0.0,-27.26,0.0,0.0,0.0,-1.02,-50.5,-51.52,-22.917,0.0,10.0,14.39,0.0,0.0,1.473,0.0,0.0,0.0,0.0,0.0,0.0,0.0,118.793]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,105.15,0.0,105.15,0.0,0.0,133.074,0.0,0.0,133.074,0.0,0.0,0.0,82.053,0.0,82.053,0.0,-0.5,67.045,0.0,0.0,66.545,0.0,0.0,0.0,117.798,0.0,0.0,117.798,150.0,150.0,75.0,75.0,75.0,75.0,75.0,1179.62]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,2.0,14.0,16.0,6.0,0.0,0.0,0.0,0.0,6.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,43.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[17.5,0.0,0.0,17.5,35.0,15.747,47.25,0.0,0.0,0.0,62.997,0.0,10.626,0.0,0.0,0.0,10.626,7.323,0.0,0.0,8.925,0.0,16.248,0.0,0.0,0.0,0.0,0.0,0.0,0.0,45.0,45.0,45.0,45.0,45.0,45.0,45.0,439.871]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,350.0,350.0,0.0,0.0,0.0,0.0,700.0]},{"excelRow":76,"label":"Intercompany Loan/Dividend","type":"line","values":[5000.0,0.0,30.374,13.618,5043.992,44.449,0.0,0.0,20001.129,0.0,20045.578,0.0,0.0,0.0,0.0,0.0,0.0,2.0,0.0,0.0,0.0,0.0,2.0,0.0,0.0,8.482,0.0,0.0,0.0,8.482,0.0,0.0,0.0,0.0,0.0,0.0,0.0,25100.052]},{"excelRow":77,"label":"Intercompany Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,15.0,0.0,-0.001,0.0,0.0,14.999,0.0,18.375,0.0,0.0,0.0,18.375,0.0,0.0,165.375,0.0,0.0,165.375,0.0,0.0,0.0,0.0,0.0,0.0,0.0,603.574,0.0,0.0,0.0,0.0,0.0,0.0,802.323]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[0.0,0.0,0.0,14.788,14.788,0.0,0.0,0.0,12.753,0.0,12.753,4.0,0.0,0.0,12.118,0.0,16.118,0.0,0.0,0.0,3.0,11.328,14.328,0.0,0.0,0.0,0.0,0.0,0.0,0.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,127.988]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,8.4,0.0,13.23,0.0,21.63,0.0,8.4,0.0,52.92,0.0,61.32,0.0,0.0,0.0,0.0,0.0,0.0,2.5,0.0,8.4,0.0,0.0,0.0,10.9,10.0,10.0,10.0,10.0,10.0,10.0,10.0,163.85]},{"excelRow":80,"label":"Project Qiddiya Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,70.0,70.0,70.0,70.0,70.0,70.0,70.0,490.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[5031.298,70.795,189.178,59.407,5350.679,125.624,275.547,239.831,20039.885,0.0,20680.887,-19.82,53.987,98.042,153.706,0.0,285.915,60.032,8.317,236.168,126.942,-39.172,392.288,-16.734,0.0,246.733,138.956,0.0,0.0,368.955,1173.574,1670.0,944.426,493.0,338.0,338.0,1838.0,33873.725]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,71.313,0.0,71.313,0.0,438.163,217.927,92.639,0.0,748.73,5.881,1016.914,0.0,676.031,0.0,1698.826,0.0,215.091,54.355,0.0,0.0,269.445,0.0,0.0,0.0,0.0,0.0,0.0,0.0,881.377,500.0,924.246,500.0,2179.658,750.0,750.0,9273.595]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[14464.062,-281.845,2635.601,6470.639,23288.457,1649.042,6330.941,4791.042,26794.671,0.0,39565.696,1440.461,4145.098,2854.399,10683.497,0.0,19123.456,1139.111,3390.12,2910.919,5017.811,2718.172,15176.134,436.31,2140.204,3180.366,8595.441,1470.258,0.0,15822.579,24015.322,24295.685,14296.726,12537.874,13618.125,11487.47,16357.285,229584.808]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[25754.898,30028.63,30403.922,35313.368,35313.368,38803.016,40500.176,42430.523,36819.109,36819.109,36819.109,46073.979,44413.572,45293.031,41239.841,41239.841,41239.841,42356.285,42566.943,47873.87,43897.177,43628.73,43628.73,48579.029,48022.667,47380.41,42225.92,41310.693,41310.693,41310.693,29254.307,38793.975,41531.103,37701.85,37495.164,32677.032,23599.134,23599.134]}],"monthlySummary":[{"month":"Jan","opening":40360.465,"inflows":18241.36,"outflows":23288.457,"closing":35313.368},{"month":"Feb","opening":35313.368,"inflows":41071.437,"outflows":39565.696,"closing":36819.109},{"month":"Mar","opening":36819.109,"inflows":23544.187,"outflows":19123.456,"closing":41239.841},{"month":"Apr","opening":41239.841,"inflows":17565.024,"outflows":15176.134,"closing":43628.73},{"month":"May","opening":43628.73,"inflows":13504.542,"outflows":15822.579,"closing":41310.693},{"month":"Jun","opening":41310.693,"inflows":11958.936,"outflows":24015.322,"closing":29254.307},{"month":"Jul","opening":29254.307,"inflows":33835.353,"outflows":24295.685,"closing":38793.975},{"month":"Aug","opening":38793.975,"inflows":17033.854,"outflows":14296.726,"closing":41531.103},{"month":"Sep","opening":41531.103,"inflows":8708.621,"outflows":12537.874,"closing":37701.85},{"month":"Oct","opening":37701.85,"inflows":13411.438,"outflows":13618.125,"closing":37495.164},{"month":"Nov","opening":37495.164,"inflows":6669.337,"outflows":11487.47,"closing":32677.032},{"month":"Dec","opening":32677.032,"inflows":7279.387,"outflows":16357.285,"closing":23599.134},{"month":"Year Total","opening":40360.465,"inflows":212823.477,"outflows":229584.808,"closing":23599.134}]},{"sheet":"ALICLER-CB","name":"ALICLER-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":"Al Laith International Cranes & Loading & Equipment Rental LLC","statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[1495.122,1419.98,1416.156,1416.156,1495.122,1378.156,1376.644,1495.065,1490.935,1448.69,1378.156,1448.69,1446.779,1371.288,1362.267,1362.267,1448.69,1362.267,1544.198,1487.831,1487.831,1464.779,1362.267,1464.779,1462.78,1458.561,1397.579,1397.579,1397.579,1464.779,1397.579,1263.416,1221.983,1172.766,1123.549,1066.549,1009.549,1495.122]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,15.567,7.783,7.783,0.0,0.0,0.0,31.133]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,15.567,7.783,7.783,0.0,0.0,0.0,31.133]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Advance Received","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":22,"label":"Intercompany Trf","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,200.0,0.0,0.0,0.0,200.0,null,null,null,null,0.0,0.0,300.0,0.0,0.0,0.0,0.0,300.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,500.0]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,200.0,0.0,0.0,0.0,200.0,0.0,0.0,0.0,0.0,0.0,0.0,300.0,0.0,0.0,0.0,0.0,300.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,15.567,7.783,7.783,0.0,0.0,0.0,531.133]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":33,"label":"Proj Exp KSA","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":38,"label":"Adjustments","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[72.983,0.0,0.0,38.0,110.983,0.0,81.174,0.0,38.0,0.0,119.174,null,75.485,null,null,0.0,75.485,0.0,55.962,0.0,0.0,0.0,55.962,0.0,0.0,56.586,0.0,0.0,0.0,56.586,57.0,57.0,57.0,57.0,57.0,57.0,57.0,817.19]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[1.25,0.0,0.0,0.0,1.25,1.25,0.0,0.0,0.0,0.0,1.25,1.25,null,null,null,0.0,1.25,1.25,0.399,0.0,0.0,0.0,1.649,1.342,0.0,0.0,0.0,0.0,0.0,1.342,0.0,0.0,0.0,0.0,0.0,0.0,0.0,6.739]},{"excelRow":48,"label":"Utility","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":49,"label":"Rent","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,23.05,0.0,23.05,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,23.05]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":51,"label":"Mortgage","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":52,"label":"Salik","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":55,"label":"Visa","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[0.909,0.002,0.0,0.0,0.911,0.263,0.405,0.0,0.0,0.0,0.668,0.661,0.006,0.002,null,0.0,0.67,0.656,0.006,0.0,0.002,0.0,0.665,0.656,0.0,0.006,0.0,0.0,0.0,0.663,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.576]},{"excelRow":57,"label":"Bank Guarantees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":62,"label":"Insurance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,4.245,0.0,4.245,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,4.219,0.0,0.0,0.0,0.0,4.219,0.0,0.0,0.0,0.0,0.0,0.0,0.0,8.464]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":65,"label":"Office & IT Maintennace","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":66,"label":"Sub Total","type":"total","values":[75.142,0.002,0.0,38.0,113.144,1.512,81.579,0.0,42.245,0.0,125.336,1.911,75.492,0.002,0.0,0.0,77.405,2.906,56.367,0.0,23.052,0.0,82.325,1.998,4.219,56.592,0.0,0.0,0.0,62.81,57.0,57.0,57.0,57.0,57.0,57.0,57.0,860.02]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[0.0,3.822,0.0,0.0,3.822,0.0,0.0,4.13,0.0,0.0,4.13,null,null,9.018,null,0.0,9.018,115.164,0.0,0.0,0.0,0.0,115.164,0.0,0.0,4.389,0.0,0.0,0.0,4.389,77.164,0.0,0.0,0.0,0.0,0.0,0.0,213.686]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":76,"label":"Intercompany Loan/Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":77,"label":"R/Co","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":80,"label":"Arch Opex","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[0.0,3.822,0.0,0.0,3.822,0.0,0.0,4.13,0.0,0.0,4.13,0.0,0.0,9.018,0.0,0.0,9.018,115.164,0.0,0.0,0.0,0.0,115.164,0.0,0.0,4.389,0.0,0.0,0.0,4.389,77.164,0.0,0.0,0.0,0.0,0.0,0.0,213.686]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[75.142,3.824,0.0,38.0,116.966,1.512,81.579,4.13,42.245,0.0,129.466,1.911,75.492,9.02,0.0,0.0,86.423,118.069,56.367,0.0,23.052,0.0,197.489,1.998,4.219,60.981,0.0,0.0,0.0,67.199,134.164,57.0,57.0,57.0,57.0,57.0,57.0,1073.706]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[1419.98,1416.156,1416.156,1378.156,1378.156,1376.644,1495.065,1490.935,1448.69,1448.69,1448.69,1446.779,1371.288,1362.267,1362.267,1362.267,1362.267,1544.198,1487.831,1487.831,1464.779,1464.779,1464.779,1462.78,1458.561,1397.579,1397.579,1397.579,1397.579,1397.579,1263.416,1221.983,1172.766,1123.549,1066.549,1009.549,952.549,952.549]}],"monthlySummary":[{"month":"Jan","opening":1495.122,"inflows":0.0,"outflows":116.966,"closing":1378.156},{"month":"Feb","opening":1378.156,"inflows":200.0,"outflows":129.466,"closing":1448.69},{"month":"Mar","opening":1448.69,"inflows":0.0,"outflows":86.423,"closing":1362.267},{"month":"Apr","opening":1362.267,"inflows":300.0,"outflows":197.489,"closing":1464.779},{"month":"May","opening":1464.779,"inflows":0.0,"outflows":67.199,"closing":1397.579},{"month":"Jun","opening":1397.579,"inflows":0.0,"outflows":134.164,"closing":1263.416},{"month":"Jul","opening":1263.416,"inflows":15.567,"outflows":57.0,"closing":1221.983},{"month":"Aug","opening":1221.983,"inflows":7.783,"outflows":57.0,"closing":1172.766},{"month":"Sep","opening":1172.766,"inflows":7.783,"outflows":57.0,"closing":1123.549},{"month":"Oct","opening":1123.549,"inflows":0.0,"outflows":57.0,"closing":1066.549},{"month":"Nov","opening":1066.549,"inflows":0.0,"outflows":57.0,"closing":1009.549},{"month":"Dec","opening":1009.549,"inflows":0.0,"outflows":57.0,"closing":952.549},{"month":"Year Total","opening":1495.122,"inflows":531.133,"outflows":1073.706,"closing":952.549}]},{"sheet":"SS-CB","name":"SS-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":"Al Laith Site Services","statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[622.869,5593.779,5590.277,5589.891,622.869,3675.72,3675.72,3575.868,3575.482,3533.119,3675.72,3533.119,3532.909,3517.911,3501.483,3476.234,3533.119,3476.234,3476.024,3392.348,3389.701,3389.701,3476.234,3358.42,3358.42,3357.973,3353.942,3336.014,3336.014,3358.42,3336.014,3216.85,3100.186,3059.686,2969.186,2896.686,2848.186,622.869]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Advance Received","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":22,"label":"Intercompany Trf","type":"line","values":[5000.0,0.0,0.0,0.0,5000.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,5000.0]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[5000.0,0.0,0.0,0.0,5000.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,5000.0]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":33,"label":"Proj Exp KSA","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":38,"label":"Adjustments","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[26.09,0.0,0.0,31.904,57.994,0.0,23.456,0.0,31.169,0.0,54.625,null,14.995,8.5,25.247,0.0,48.742,0.0,7.51,0.0,0.0,31.277,38.787,0.0,0.0,0.323,17.924,0.0,0.0,18.247,40.5,40.5,40.5,40.5,72.5,48.5,48.5,549.894]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":48,"label":"Utility","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":49,"label":"Rent","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":51,"label":"Mortgage","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":52,"label":"Salik","type":"line","values":[3.0,0.0,0.0,0.0,3.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":55,"label":"Visa","type":"line","values":[0.0,0.0,0.386,0.0,0.386,0.0,0.0,0.386,0.0,0.0,0.386,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.772]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[0.0,0.002,0.0,0.004,0.006,0.0,0.212,0.0,0.004,0.0,0.216,null,0.002,0.003,0.002,0.0,0.007,0.0,0.002,0.0,0.0,0.004,0.006,0.0,0.0,0.002,0.004,0.0,0.0,0.006,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.243]},{"excelRow":57,"label":"Bank Guarantees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.21,null,null,null,0.0,0.21,0.21,0.0,0.0,0.0,0.0,0.21,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.42]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,76.184,0.0,0.0,0.0,76.184,null,null,null,null,0.0,0.0,0.0,76.164,0.0,0.0,0.0,76.164,0.0,0.0,0.0,0.0,0.0,0.0,0.0,76.164,76.164,0.0,50.0,0.0,0.0,0.0,354.676]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,2.5,0.0,0.0,0.0,0.0,0.0,0.0,2.5]},{"excelRow":62,"label":"Insurance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,11.19,0.0,11.19,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.448,0.0,0.0,0.0,0.0,0.448,0.0,0.0,0.0,0.0,0.0,0.0,0.0,11.638]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":65,"label":"Office & IT Maintennace","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":66,"label":"Sub Total","type":"total","values":[29.09,0.002,0.386,31.908,61.386,0.0,99.852,0.386,42.363,0.0,142.601,0.21,14.997,8.503,25.249,0.0,48.959,0.21,83.676,0.0,0.0,31.281,115.167,0.0,0.448,0.325,17.928,0.0,0.0,18.701,119.164,116.664,40.5,90.5,72.5,48.5,48.5,923.143]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,7.926,null,0.0,7.926,0.0,0.0,2.647,0.0,0.0,2.647,0.0,0.0,3.705,0.0,0.0,0.0,3.705,0.0,0.0,0.0,0.0,0.0,0.0,0.0,14.277]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[0.0,3.5,0.0,0.0,3.5,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.5]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":76,"label":"Intercompany Loan/Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":77,"label":"Intercompany Outflow","type":"line","values":[0.0,0.0,0.0,1882.263,1882.263,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1882.263]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":80,"label":"Project Qiddiya Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[0.0,3.5,0.0,1882.263,1885.763,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,7.926,0.0,0.0,7.926,0.0,0.0,2.647,0.0,0.0,2.647,0.0,0.0,3.705,0.0,0.0,0.0,3.705,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1900.04]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[29.09,3.502,0.386,1914.171,1947.149,0.0,99.852,0.386,42.363,0.0,142.601,0.21,14.997,16.429,25.249,0.0,56.885,0.21,83.676,2.647,0.0,31.281,117.814,0.0,0.448,4.03,17.928,0.0,0.0,22.407,119.164,116.664,40.5,90.5,72.5,48.5,48.5,2823.183]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[5593.779,5590.277,5589.891,3675.72,3675.72,3675.72,3575.868,3575.482,3533.119,3533.119,3533.119,3532.909,3517.911,3501.483,3476.234,3476.234,3476.234,3476.024,3392.348,3389.701,3389.701,3358.42,3358.42,3358.42,3357.973,3353.942,3336.014,3336.014,3336.014,3336.014,3216.85,3100.186,3059.686,2969.186,2896.686,2848.186,2799.686,2799.686]}],"monthlySummary":[{"month":"Jan","opening":622.869,"inflows":5000.0,"outflows":1947.149,"closing":3675.72},{"month":"Feb","opening":3675.72,"inflows":0.0,"outflows":142.601,"closing":3533.119},{"month":"Mar","opening":3533.119,"inflows":0.0,"outflows":56.885,"closing":3476.234},{"month":"Apr","opening":3476.234,"inflows":0.0,"outflows":117.814,"closing":3358.42},{"month":"May","opening":3358.42,"inflows":0.0,"outflows":22.407,"closing":3336.014},{"month":"Jun","opening":3336.014,"inflows":0.0,"outflows":119.164,"closing":3216.85},{"month":"Jul","opening":3216.85,"inflows":0.0,"outflows":116.664,"closing":3100.186},{"month":"Aug","opening":3100.186,"inflows":0.0,"outflows":40.5,"closing":3059.686},{"month":"Sep","opening":3059.686,"inflows":0.0,"outflows":90.5,"closing":2969.186},{"month":"Oct","opening":2969.186,"inflows":0.0,"outflows":72.5,"closing":2896.686},{"month":"Nov","opening":2896.686,"inflows":0.0,"outflows":48.5,"closing":2848.186},{"month":"Dec","opening":2848.186,"inflows":0.0,"outflows":48.5,"closing":2799.686},{"month":"Year Total","opening":622.869,"inflows":5000.0,"outflows":2823.183,"closing":2799.686}]},{"sheet":"Oman-CB","name":"OMAN-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":0.0,"statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[1881.291,1896.918,1934.35,2046.385,1881.291,1982.688,2026.885,2079.106,2185.194,2226.884,1982.688,2226.884,2142.105,2144.864,2110.19,2284.437,2226.884,2284.437,2282.519,2273.487,2377.111,2379.774,2284.437,2436.999,2451.862,2481.713,2615.96,2482.076,2499.413,2436.999,2499.413,2381.823,2325.248,2456.426,2468.264,2583.159,2672.634,1881.291]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,0.0,300.0,120.607,119.612,107.085,12.527,0.0,0.0,659.831]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[50.368,32.958,112.035,86.608,281.97,77.887,53.16,127.229,107.547,0.0,365.823,74.471,69.476,9.476,168.71,0.0,322.133,19.352,44.755,123.72,31.72,93.249,312.796,14.863,51.232,168.885,39.976,17.337,0.0,292.292,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1575.014]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,87.546,163.998,224.111,315.525,255.412,255.412,1302.005]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[50.368,32.958,112.035,86.608,281.97,77.887,53.16,127.229,107.547,0.0,365.823,74.471,69.476,9.476,168.71,0.0,322.133,19.352,44.755,123.72,31.72,93.249,312.796,14.863,51.232,168.885,39.976,17.337,0.0,292.292,300.0,208.153,283.61,331.196,328.052,255.412,255.412,3536.85]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Advance Received","type":"line","values":[3.741,8.379,0.0,0.0,12.12,0.0,5.311,1.796,0.0,0.0,7.106,0.57,null,null,5.536,0.0,6.106,0.0,4.147,1.895,1.2,0.0,7.242,0.0,0.0,7.237,0.0,0.0,0.0,7.237,0.0,0.0,0.0,0.0,0.0,0.0,0.0,39.811]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":22,"label":"Intercompany Trf","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,3.621,0.0,0.0,0.0,0.0,3.621,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.621]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[54.109,41.337,112.035,86.608,294.089,81.507,58.471,129.024,107.547,0.0,376.55,75.041,69.476,9.476,174.246,0.0,328.239,19.352,48.901,125.616,32.92,93.249,320.038,14.863,51.232,176.121,39.976,17.337,0.0,299.529,300.0,208.153,283.61,331.196,328.052,255.412,255.412,3580.281]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Supplier Payments","type":"line","values":[24.035,0.0,0.0,42.036,66.071,0.0,1.4,0.0,0.0,0.0,1.4,41.33,2.115,null,null,0.0,43.445,0.0,47.749,0.0,0.0,0.0,47.749,0.0,0.0,37.395,0.0,0.0,0.0,37.395,46.5,46.5,46.5,46.5,46.5,46.5,46.5,521.559]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":33,"label":"Rebate/Discount","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[0.0,0.0,0.0,12.4,12.4,0.0,0.0,0.0,0.0,0.0,0.0,4.69,null,null,null,0.0,4.69,0.0,4.688,0.0,8.78,0.0,13.468,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,30.559]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,101.232,20.814,1.244,0.0,0.0,0.0,0.0,123.291]},{"excelRow":38,"label":"Adjustments","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[24.035,0.0,0.0,54.436,78.471,0.0,1.4,0.0,0.0,0.0,1.4,46.02,2.115,0.0,0.0,0.0,48.135,0.0,52.437,0.0,8.78,0.0,61.217,0.0,0.0,37.395,0.0,0.0,0.0,37.395,147.732,67.314,47.745,46.5,46.5,46.5,46.5,675.409]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[5.054,0.0,0.0,54.721,59.775,0.0,4.85,0.0,56.837,0.0,61.687,2.08,56.769,null,null,0.0,58.849,0.0,3.6,0.0,21.477,33.203,58.281,0.0,0.0,2.584,54.698,0.0,0.0,57.282,59.487,59.487,59.487,59.487,74.318,61.237,61.237,730.616]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,1.895,0.0,0.0,0.0,1.895,0.0,0.0,1.895,0.0,0.0,0.0,1.895,1.2,1.2,1.2,1.2,1.2,1.2,1.2,12.191]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,7.0]},{"excelRow":48,"label":"Utility","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,7.0]},{"excelRow":49,"label":"Rent","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,111.72,null,null,null,0.0,111.72,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,103.17,0.0,0.0,103.17,0.0,0.0,103.17,421.23]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":51,"label":"Mortgage","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":52,"label":"Salik","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":55,"label":"Visa","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[0.02,0.0,0.0,0.0,0.02,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,2.821,2.821,0.0,0.03,0.0,0.09,0.0,0.0,0.12,1.0,1.0,1.0,1.0,1.0,1.0,1.0,9.961]},{"excelRow":57,"label":"Restricted cash \u2013 guarantees and deposits","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,40.724,40.724,28.286,0.0,0.0,0.0,0.0,28.286,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.151,0.0,77.339,0.0,0.0,78.49,0.0,27.48,0.0,0.0,27.48,0.0,0.0,202.46]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,40.0,0.0,0.0,0.0,0.0,0.0,40.0]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,11.515,0.0,0.0,0.0,0.0,11.515,0.0,0.0,0.0,0.0,0.0,0.0,0.0,12.0,0.0,0.0,0.0,0.0,0.0,0.0,23.515]},{"excelRow":62,"label":"Insurance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,9.02,0.0,9.02,0.0,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,20.2,0.0,30.507,0.0,0.0,50.707,0.0,12.747,0.0,0.0,19.659,13.0,0.0,105.133]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[0.0,3.905,0.0,0.0,3.905,0.0,0.0,22.936,0.0,0.0,22.936,null,null,44.15,null,0.0,44.15,0.0,0.0,21.991,0.0,0.0,21.991,0.0,0.0,0.0,2.376,0.0,0.0,2.376,15.0,15.0,15.0,15.0,15.0,15.0,15.0,200.358]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[9.373,0.0,0.0,0.0,9.373,9.025,0.0,0.0,0.0,0.0,9.025,null,7.833,null,null,0.0,7.833,5.551,0.0,0.0,0.0,0.0,5.551,0.0,0.0,0.0,8.85,0.0,0.0,8.85,15.0,15.0,15.0,15.0,15.0,15.0,15.0,145.632]},{"excelRow":65,"label":"IT / Digital and Office Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,21.0]},{"excelRow":66,"label":"Sub Total","type":"total","values":[14.447,3.905,0.0,95.445,113.797,37.311,4.85,22.936,65.857,0.0,130.954,113.8,64.602,44.15,0.0,0.0,222.552,17.066,5.496,21.991,21.477,36.024,102.054,0.0,21.381,4.479,173.86,0.0,0.0,199.72,211.858,176.914,96.688,199.858,158.656,111.438,201.608,1926.095]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,12.5,0.0,0.0,0.0,0.0,25.0,37.5]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[0.0,0.0,0.0,0.424,0.424,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,4.204,0.0,0.0,0.0,0.0,4.204,0.0,0.0,0.0,0.0,0.0,0.0,0.0,50.0,0.0,0.0,50.0,0.0,0.0,50.0,154.628]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,15.0,0.0,0.0,0.0,15.0]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,14.0]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":76,"label":"Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":77,"label":"Intercompany Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,7.0]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":80,"label":"Project Qiddiya Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,5.0,5.0,5.0,5.0,5.0,5.0,5.0,35.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[0.0,0.0,0.0,0.424,0.424,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,4.204,0.0,0.0,0.0,0.0,4.204,0.0,0.0,0.0,0.0,0.0,0.0,0.0,58.0,20.5,8.0,73.0,8.0,8.0,83.0,263.128]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[38.482,3.905,0.0,150.305,192.692,37.311,6.25,22.936,65.857,0.0,132.354,159.82,66.717,44.15,0.0,0.0,270.687,21.269,57.933,21.991,30.257,36.024,167.475,0.0,21.381,41.874,173.86,0.0,0.0,237.115,417.59,264.729,152.432,319.358,213.156,165.938,331.108,2864.632]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[1896.918,1934.35,2046.385,1982.688,1982.688,2026.885,2079.106,2185.194,2226.884,2226.884,2226.884,2142.105,2144.864,2110.19,2284.437,2284.437,2284.437,2282.519,2273.487,2377.111,2379.774,2436.999,2436.999,2451.862,2481.713,2615.96,2482.076,2499.413,2499.413,2499.413,2381.823,2325.248,2456.426,2468.264,2583.159,2672.634,2596.939,2596.939]}],"monthlySummary":[{"month":"Jan","opening":1881.291,"inflows":294.089,"outflows":192.692,"closing":1982.688},{"month":"Feb","opening":1982.688,"inflows":376.55,"outflows":132.354,"closing":2226.884},{"month":"Mar","opening":2226.884,"inflows":328.239,"outflows":270.687,"closing":2284.437},{"month":"Apr","opening":2284.437,"inflows":320.038,"outflows":167.475,"closing":2436.999},{"month":"May","opening":2436.999,"inflows":299.529,"outflows":237.115,"closing":2499.413},{"month":"Jun","opening":2499.413,"inflows":300.0,"outflows":417.59,"closing":2381.823},{"month":"Jul","opening":2381.823,"inflows":208.153,"outflows":264.729,"closing":2325.248},{"month":"Aug","opening":2325.248,"inflows":283.61,"outflows":152.432,"closing":2456.426},{"month":"Sep","opening":2456.426,"inflows":331.196,"outflows":319.358,"closing":2468.264},{"month":"Oct","opening":2468.264,"inflows":328.052,"outflows":213.156,"closing":2583.159},{"month":"Nov","opening":2583.159,"inflows":255.412,"outflows":165.938,"closing":2672.634},{"month":"Dec","opening":2672.634,"inflows":255.412,"outflows":331.108,"closing":2596.939},{"month":"Year Total","opening":1881.291,"inflows":3580.281,"outflows":2864.632,"closing":2596.939}]},{"sheet":"Ksa-CB","name":"KSA-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":0.0,"statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[45744.646,45230.604,46044.17,54443.11,45744.646,103293.249,100527.654,100959.194,97709.603,69587.396,103293.249,69587.396,44086.929,55999.63,52080.314,43744.418,69587.396,43744.418,46234.841,44746.389,45580.051,42931.316,43744.418,41566.486,45129.237,44728.822,45171.707,36536.52,36238.067,41566.486,36237.881,40351.601,32590.884,31403.395,30360.261,33841.701,32038.374,45744.646]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,0.0,15500.0,8160.348,647.625,581.868,65.757,0.0,0.0,24955.598]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[889.467,2918.655,11627.042,0.0,15435.164,4258.597,1754.824,896.133,17.159,0.0,6926.714,1092.665,0.0,213.259,354.624,null,1660.548,3208.664,1408.753,1146.616,1030.229,243.677,7037.939,1769.588,837.794,518.792,1010.747,0.0,null,4136.922,0.0,0.0,0.0,0.0,0.0,0.0,0.0,35197.287]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,0.0,0.0,454.698,1337.674,1719.762,1872.89,1883.527,2286.028,9554.579]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[889.467,2918.655,11627.042,0.0,15435.164,4258.597,1754.824,896.133,17.159,0.0,6926.714,1092.665,0.0,213.259,354.624,0.0,1660.548,3208.664,1408.753,1146.616,1030.229,243.677,7037.939,1769.588,837.794,518.792,1010.747,0.0,0.0,4136.922,15500.0,8615.046,1985.299,2301.63,1938.647,1883.527,2286.028,69707.464]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Customer Advance","type":"line","values":[0.0,0.0,40.757,0.0,40.757,148.566,4.653,0.0,0.0,0.0,153.219,0.29,0.0,null,null,0.0,0.29,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,194.266]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":22,"label":"Intercompany Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-19934.85,0.0,-19934.85,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-10000.0,0.0,0.0,0.0,0.0,0.0,-29934.85]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,2792.064,0.0,0.0,0.0,0.0,0.0,2792.064,0.0,0.0,0.0,0.0,5700.0,0.0,0.0,8492.064]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[1582.447,0.0,214.477,50843.253,52640.176,0.0,0.0,0.0,0.0,0.0,0.0,null,12855.65,null,null,0.0,12855.65,0.0,0.0,0.0,7313.705,0.0,7313.705,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,72809.531]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[2471.914,2918.655,11882.276,50843.253,68116.098,4407.163,1759.477,896.133,-19917.691,0.0,-12854.917,1092.955,12855.65,213.259,354.624,0.0,14516.488,3208.664,1408.753,1146.616,8343.934,243.677,14351.644,4561.652,837.794,518.792,1010.747,0.0,0.0,6928.986,15500.0,-1384.954,1985.299,2301.63,7638.647,1883.527,2286.028,121268.476]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Supplier Payments","type":"line","values":[1432.183,1374.049,245.555,142.286,3194.073,158.361,484.896,388.003,0.0,0.0,1031.26,977.982,18.91,67.923,0.0,0.0,1064.816,203.803,276.669,3.083,2560.416,116.832,3160.804,45.223,11.773,0.0,4268.591,0.0,0.0,4325.587,930.0,930.0,620.0,620.0,620.0,620.0,620.0,17736.54]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.186,0.186,0.0,0.0,0.0,0.0,250.0,250.0,250.0,750.186]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[0.0,0.0,4.68,893.485,898.165,0.0,0.0,179.759,266.322,0.0,446.081,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3488.366,2014.373,1722.173,1559.334,1511.033,1563.727,1150.598,14353.849]},{"excelRow":33,"label":"Rebate/Discount","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[0.0,0.0,0.0,75.014,75.014,0.0,0.0,10.091,67.55,0.0,77.641,0.0,0.0,0.0,60.532,0.0,60.532,0.0,0.0,0.0,41.933,0.0,41.933,0.0,0.0,0.0,30.73,0.0,0.0,30.73,0.0,0.0,0.0,0.0,0.0,0.0,0.0,285.851]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[41.66,0.0,10.344,0.0,52.004,66.687,0.0,134.138,0.0,0.0,200.825,0.0,10.93,0.0,10.344,0.0,21.274,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,274.102]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,4965.822,1880.678,15.137,0.0,0.0,0.0,0.0,6861.638]},{"excelRow":38,"label":"Adjustments","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[1473.844,1374.049,260.579,1110.785,4219.257,225.048,484.896,711.991,333.872,0.0,1755.807,977.982,29.84,67.923,70.876,0.0,1146.622,203.803,276.669,3.083,2602.349,116.832,3202.736,45.223,11.773,0.0,4299.322,0.0,0.186,4356.504,9384.188,4825.052,2357.31,2179.334,2381.033,2433.727,2020.598,40262.167]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[78.283,0.783,527.382,4.949,611.397,0.0,97.272,454.206,89.419,0.0,640.897,9.444,16.161,443.625,102.819,0.0,572.049,0.0,14.138,0.0,290.527,189.795,494.46,0.0,16.009,33.912,436.7,0.0,0.0,486.621,497.25,497.25,497.25,497.25,650.033,536.25,536.25,6516.957]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[0.0,0.0,1999.851,0.0,1999.851,0.0,13.809,0.0,0.0,0.0,13.809,1262.101,0.0,0.0,0.0,0.0,1262.101,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.211,0.0,0.0,0.0,0.0,3.211,969.658,75.0,75.0,75.0,150.0,150.0,150.0,4923.63]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[1.239,0.0,0.0,0.0,1.239,1.248,0.0,0.0,0.0,0.0,1.248,1.248,0.0,0.0,0.0,0.0,1.248,1.237,0.0,0.0,0.0,0.0,1.237,1.234,0.0,0.0,0.0,0.0,0.0,1.234,2.0,2.0,2.0,2.0,2.0,2.0,2.0,20.207]},{"excelRow":48,"label":"Utility","type":"line","values":[1.658,0.0,0.0,0.0,1.658,1.811,0.0,0.0,0.0,0.0,1.811,1.437,0.0,0.0,0.0,0.0,1.437,1.362,0.0,0.0,0.0,0.0,1.362,1.489,0.0,0.0,0.0,0.0,0.0,1.489,2.0,2.0,2.0,2.0,2.0,2.0,2.0,21.756]},{"excelRow":49,"label":"Rent","type":"line","values":[57.525,43.875,0.0,0.0,101.4,1400.724,0.0,0.0,0.0,0.0,1400.724,0.0,0.0,336.375,0.0,0.0,336.375,134.257,0.0,0.0,0.0,0.0,134.257,0.0,-4.875,0.0,36.806,0.0,0.0,31.931,0.0,43.875,0.0,336.375,0.0,0.0,0.0,2384.938]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":51,"label":"Mortgage","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":52,"label":"Salik","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":55,"label":"Visa","type":"line","values":[8.921,0.195,3.9,0.0,13.016,34.661,0.0,1.95,0.0,0.0,36.611,62.839,1.024,0.0,18.817,0.0,82.68,14.43,1.56,2.901,24.57,0.0,43.461,109.2,-3.705,28.08,50.456,0.0,0.0,184.031,50.0,50.0,50.0,50.0,50.0,50.0,50.0,709.799]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[1.158,0.028,0.028,0.415,1.63,1.28,0.034,0.067,0.256,0.0,1.636,0.233,0.022,0.231,0.171,0.0,0.657,0.02,0.008,0.0,0.04,0.326,0.394,0.123,0.259,0.097,0.572,0.023,0.0,1.074,3.0,3.0,3.0,3.0,3.0,3.0,3.0,26.391]},{"excelRow":57,"label":"Restricted cash \u2013 guarantees and deposits","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,463.38,463.38,4.485,0.0,0.0,420.336,0.0,424.821,0.0,0.0,0.0,1115.139,0.0,1115.139,0.0,1005.712,0.0,890.211,0.0,1895.923,685.438,0.0,0.0,339.848,0.0,0.0,1025.286,43.748,524.925,34.866,18.998,22.786,129.898,186.893,5886.663]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,47.292,0.0,0.0,47.292,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,33.257,0.0,0.0,0.0,0.0,80.549]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,584.59,584.59,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,584.59]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,28.031,0.0,0.0,28.031,0.0,0.0,0.0,0.0,0.0,0.0,0.0,28.031]},{"excelRow":62,"label":"Insurance","type":"line","values":[47.401,0.0,12.756,0.0,60.157,46.628,0.0,0.0,0.0,0.0,46.628,48.105,238.35,0.0,0.0,0.0,286.455,45.036,-10.995,0.0,0.0,0.0,34.041,43.205,0.0,0.0,0.0,0.0,0.0,43.205,48.105,145.161,48.105,70.807,48.105,169.98,96.855,1097.606]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[78.0,16.575,0.0,0.0,94.575,78.0,78.0,43.875,0.0,0.0,199.875,92.402,78.0,0.0,0.0,0.0,170.402,19.5,34.125,0.0,0.0,0.0,53.625,0.0,19.5,0.0,0.0,0.0,0.0,19.5,10.0,10.0,10.0,50.0,150.0,150.0,150.0,1067.977]},{"excelRow":65,"label":"IT / Digital and Office Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":66,"label":"Sub Total","type":"total","values":[274.186,61.456,2543.918,468.744,3348.303,1568.837,189.114,547.389,510.011,0.0,2815.351,1477.808,333.557,780.231,1236.946,0.0,3828.543,215.843,1044.549,2.901,1205.348,774.711,3243.351,840.689,30.399,62.089,892.414,0.023,0.0,1825.615,1625.762,1353.212,755.478,1105.43,1077.923,1193.128,1176.998,23349.094]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,112.5,0.0,0.0,0.0,0.0,225.0,337.5]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,14.303,0.0,0.0,0.0,0.0,0.0,14.303,0.0,0.0,0.0,0.0,0.0,0.0,0.0,14.303]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[9.506,0.77,0.0,0.0,10.277,0.661,1.245,1.17,0.0,0.0,3.076,0.441,-1.024,0.0,1.177,0.0,0.594,0.33,0.219,0.916,0.0,-0.55,0.916,0.0,0.0,0.195,1.318,0.0,0.0,1.513,0.0,25.0,0.0,0.0,25.0,0.0,0.0,66.376]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,0.0,7.098,7.098,0.0,5.255,0.0,46.512,0.0,51.768,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,20.432,0.0,20.432,0.0,0.0,0.0,37.08,0.0,0.0,37.08,50.0,50.0,50.0,50.0,50.0,50.0,50.0,466.378]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":76,"label":"Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,613.251,0.0,0.0,613.251]},{"excelRow":77,"label":"Intercompany Outflow","type":"line","values":[29.251,0.0,0.0,0.0,29.251,0.0,0.0,0.0,0.0,0.0,0.0,19.5,0.0,0.0,9.188,0.0,28.688,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,316.33,0.0,0.0,0.0,0.0,0.0,0.0,374.27]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[0.563,0.0,0.0,0.0,0.563,0.0,0.0,0.0,0.0,0.0,0.0,0.0,4.875,0.0,0.0,0.0,4.875,1.121,0.0,0.0,0.171,0.0,1.293,3.7,4.485,0.09,0.0,0.0,0.0,8.275,10.0,10.0,10.0,10.0,10.0,10.0,10.0,85.005]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":80,"label":"Project Qiddiya Outflow","type":"line","values":[1198.607,668.814,678.839,406.486,2952.746,5378.213,647.426,2885.174,7314.121,0.0,16224.934,24117.692,575.7,3284.42,7372.331,0.0,35350.144,297.146,1575.767,306.054,7164.368,717.514,10060.848,94.986,1191.553,13.533,4415.801,298.429,0.0,6014.302,0.0,0.0,0.0,0.0,0.0,0.0,0.0,70602.974]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[1237.927,669.584,678.839,413.584,2999.934,5378.874,653.927,2886.344,7360.633,0.0,16279.778,24137.633,579.551,3284.42,7382.697,0.0,35384.301,298.597,1575.986,306.97,7184.972,716.964,10083.489,112.989,1196.038,13.817,4454.199,298.429,0.0,6075.473,376.33,197.5,60.0,60.0,698.251,60.0,285.0,72560.056]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[2985.956,2105.089,3483.336,1993.113,10567.494,7172.759,1327.937,4145.724,8204.516,0.0,20850.936,26593.423,942.949,4132.575,8690.52,0.0,40359.466,718.242,2897.204,312.954,10992.669,1608.506,16529.576,998.901,1238.21,75.907,9645.935,298.453,0.186,12257.592,11386.28,6375.763,3172.788,3344.764,4157.207,3686.855,3482.596,136171.316]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[45230.604,46044.17,54443.11,103293.249,103293.249,100527.654,100959.194,97709.603,69587.396,69587.396,69587.396,44086.929,55999.63,52080.314,43744.418,43744.418,43744.418,46234.841,44746.389,45580.051,42931.316,41566.486,41566.486,45129.237,44728.822,45171.707,36536.52,36238.067,36237.881,36237.881,40351.601,32590.884,31403.395,30360.261,33841.701,32038.374,30841.805,30841.805]}],"monthlySummary":[{"month":"Jan","opening":45744.646,"inflows":68116.098,"outflows":10567.494,"closing":103293.249},{"month":"Feb","opening":103293.249,"inflows":-12854.917,"outflows":20850.936,"closing":69587.396},{"month":"Mar","opening":69587.396,"inflows":14516.488,"outflows":40359.466,"closing":43744.418},{"month":"Apr","opening":43744.418,"inflows":14351.644,"outflows":16529.576,"closing":41566.486},{"month":"May","opening":41566.486,"inflows":6928.986,"outflows":12257.592,"closing":36237.881},{"month":"Jun","opening":36237.881,"inflows":15500.0,"outflows":11386.28,"closing":40351.601},{"month":"Jul","opening":40351.601,"inflows":-1384.954,"outflows":6375.763,"closing":32590.884},{"month":"Aug","opening":32590.884,"inflows":1985.299,"outflows":3172.788,"closing":31403.395},{"month":"Sep","opening":31403.395,"inflows":2301.63,"outflows":3344.764,"closing":30360.261},{"month":"Oct","opening":30360.261,"inflows":7638.647,"outflows":4157.207,"closing":33841.701},{"month":"Nov","opening":33841.701,"inflows":1883.527,"outflows":3686.855,"closing":32038.374},{"month":"Dec","opening":32038.374,"inflows":2286.028,"outflows":3482.596,"closing":30841.805},{"month":"Year Total","opening":45744.646,"inflows":121268.476,"outflows":136171.316,"closing":30841.805}]},{"sheet":"ALPS BR-CB","name":"ALPS BR-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":"Al Laith Site Projects RAK Branch","statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Advance Received","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":22,"label":"Intercompany Trf","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":33,"label":"Proj Exp KSA","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":38,"label":"Adjustments","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":48,"label":"Utility","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":49,"label":"Rent","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":51,"label":"Mortgage","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":52,"label":"Salik","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":55,"label":"Visa","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":57,"label":"Bank Guarantees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":62,"label":"Insurance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":65,"label":"Office & IT Maintennace","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":66,"label":"Sub Total","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":76,"label":"Intercompany Loan/Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":77,"label":"R/Co","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":80,"label":"Project Qiddiya Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0,500.0]}],"monthlySummary":[{"month":"Jan","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Feb","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Mar","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Apr","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"May","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Jun","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Jul","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Aug","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Sep","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Oct","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Nov","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Dec","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0},{"month":"Year Total","opening":500.0,"inflows":0.0,"outflows":0.0,"closing":500.0}]},{"sheet":"ALPS UZ-CB","name":"ALPS UZ-CB","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":"Al Laith Projects Services PE Uzbekistan","statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":9,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":11,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[8.791,2.133,2.133,2.133,8.791,2.103,2.103,2.103,2.103,2.103,2.103,2.103,2.097,20.168,18.999,15.038,2.103,15.038,10.732,10.732,12.582,109.915,15.038,95.331,95.331,91.4,91.093,134.007,134.007,95.331,134.007,80.067,76.127,293.239,349.825,456.411,452.471,8.791]},{"excelRow":13,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":14,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,221.052,110.526,110.526,0.0,0.0,0.0]},{"excelRow":15,"label":"Collections During Period","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":16,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":17,"label":"Total Debtor Collection","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,221.052,110.526,110.526,0.0,0.0,0.0]},{"excelRow":18,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":20,"label":"Advance Received","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":21,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":22,"label":"Intercompany Trf","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,18.375,null,null,0.0,18.375,0.0,0.0,36.75,128.625,0.0,165.375,0.0,0.0,0.0,367.5,0.0,0.0,367.5,0.0,0.0,0.0,0.0,0.0,0.0,0.0,551.25]},{"excelRow":23,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":24,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":25,"label":"Project Qiddiya Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":26,"label":"Total Inflows","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,18.375,0.0,0.0,0.0,18.375,0.0,0.0,36.75,128.625,0.0,165.375,0.0,0.0,0.0,367.5,0.0,0.0,367.5,0.0,0.0,221.052,110.526,110.526,0.0,0.0,551.25]},{"excelRow":28,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":29,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":30,"label":"Payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":31,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":32,"label":"Proj Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,32.48,0.0,0.0,32.48,0.0,0.0,0.0,32.48,0.0,0.0,32.48,0.0,0.0,0.0,0.0,0.0,0.0,0.0,64.96]},{"excelRow":33,"label":"Proj Exp KSA","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":34,"label":"Payment for Fixed Services","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":35,"label":"Payments in Advance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":36,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":37,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":38,"label":"Adjustments","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":39,"label":"Total Supplier Payments","type":"total","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,32.48,0.0,0.0,32.48,0.0,0.0,0.0,32.48,0.0,0.0,32.48,0.0,0.0,0.0,0.0,0.0,0.0,0.0,64.96]},{"excelRow":42,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":44,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":45,"label":"Salaries & Wages","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,122.241,0.0,0.0,122.241,0.0,0.0,0.0,0.0,0.0,0.0,0.0,122.241]},{"excelRow":46,"label":"Manpower Supplies","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":47,"label":"Telecommunication","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":48,"label":"Utility","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":49,"label":"Rent","type":"line","values":[3.813,0.0,0.0,0.0,3.813,0.0,0.0,0.0,0.0,0.0,0.0,null,null,1.169,null,0.0,1.169,4.1,0.0,0.0,0.0,13.401,17.502,0.0,0.0,0.0,13.664,0.0,0.0,13.664,3.94,3.94,3.94,3.94,3.94,3.94,3.94,63.728]},{"excelRow":50,"label":"Auto Loan","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":51,"label":"Mortgage","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":52,"label":"Salik","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":53,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":54,"label":"Fuel","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":55,"label":"Visa","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,29.138,0.0,29.138,0.0,0.0,0.0,136.144,0.0,0.0,136.144,0.0,0.0,0.0,0.0,0.0,0.0,0.0,165.282]},{"excelRow":56,"label":"Bank Charges","type":"line","values":[0.006,0.0,0.0,0.03,0.036,0.0,0.0,0.0,0.0,0.0,0.0,0.006,0.044,null,0.037,0.0,0.087,0.206,0.0,2.059,2.153,1.183,5.602,0.0,0.008,0.307,19.478,0.0,0.0,19.793,0.0,0.0,0.0,0.0,0.0,0.0,0.0,25.517]},{"excelRow":57,"label":"Bank Guarantees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":58,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,0.26,null,null,0.0,0.26,0.0,0.0,0.361,0.0,0.0,0.361,0.0,0.0,0.0,0.579,0.0,0.0,0.579,50.0,0.0,0.0,50.0,0.0,0.0,50.0,151.199]},{"excelRow":59,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":60,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":61,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":62,"label":"Insurance","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":63,"label":"Credit Cards","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":64,"label":"Petty Cash","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":65,"label":"Office & IT Maintennace","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":66,"label":"Sub Total","type":"total","values":[3.819,0.0,0.0,0.03,3.849,0.0,0.0,0.0,0.0,0.0,0.0,0.006,0.304,1.169,0.037,0.0,1.516,4.307,0.0,2.42,31.292,14.584,52.602,0.0,0.008,0.307,292.106,0.0,0.0,292.42,53.94,3.94,3.94,53.94,3.94,3.94,53.94,527.968]},{"excelRow":68,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":69,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":70,"label":"Final Sett/Leave Salary","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":71,"label":"Loans/Salary Advance to Employees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":72,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":73,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":74,"label":"Marketing & Branding","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":75,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":76,"label":"Intercompany Loan/Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":77,"label":"R/Co","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,0.0,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":78,"label":"Legal & Professional Fees","type":"line","values":[2.839,0.0,0.0,0.0,2.839,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,3.924,0.0,3.924,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.924,0.0,0.0,0.0,0.0,3.924,0.0,0.0,0.0,0.0,0.0,0.0,0.0,10.686]},{"excelRow":79,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":80,"label":"Project Qiddiya Outflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":81,"label":"Others","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":82,"label":"Sub Total","type":"total","values":[2.839,0.0,0.0,0.0,2.839,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.924,0.0,3.924,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.924,0.0,0.0,0.0,0.0,3.924,0.0,0.0,0.0,0.0,0.0,0.0,0.0,10.686]},{"excelRow":83,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null]},{"excelRow":84,"label":"Capital Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":87,"label":"Total Outflows","type":"total","values":[6.658,0.0,0.0,0.03,6.688,0.0,0.0,0.0,0.0,0.0,0.0,0.006,0.304,1.169,3.961,0.0,5.439,4.307,0.0,34.9,31.292,14.584,85.082,0.0,3.931,0.307,324.586,0.0,0.0,328.824,53.94,3.94,3.94,53.94,3.94,3.94,53.94,603.614]},{"excelRow":89,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[2.133,2.133,2.133,2.103,2.103,2.103,2.103,2.103,2.103,2.103,2.103,2.097,20.168,18.999,15.038,15.038,15.038,10.732,10.732,12.582,109.915,95.331,95.331,95.331,91.4,91.093,134.007,134.007,134.007,134.007,80.067,76.127,293.239,349.825,456.411,452.471,398.531,-43.573]}],"monthlySummary":[{"month":"Jan","opening":8.791,"inflows":0.0,"outflows":6.688,"closing":2.103},{"month":"Feb","opening":2.103,"inflows":0.0,"outflows":0.0,"closing":2.103},{"month":"Mar","opening":2.103,"inflows":18.375,"outflows":5.439,"closing":15.038},{"month":"Apr","opening":15.038,"inflows":165.375,"outflows":85.082,"closing":95.331},{"month":"May","opening":95.331,"inflows":367.5,"outflows":328.824,"closing":134.007},{"month":"Jun","opening":134.007,"inflows":0.0,"outflows":53.94,"closing":80.067},{"month":"Jul","opening":80.067,"inflows":0.0,"outflows":3.94,"closing":76.127},{"month":"Aug","opening":76.127,"inflows":221.052,"outflows":3.94,"closing":293.239},{"month":"Sep","opening":293.239,"inflows":110.526,"outflows":53.94,"closing":349.825},{"month":"Oct","opening":349.825,"inflows":110.526,"outflows":3.94,"closing":456.411},{"month":"Nov","opening":456.411,"inflows":0.0,"outflows":3.94,"closing":452.471},{"month":"Dec","opening":452.471,"inflows":0.0,"outflows":53.94,"closing":398.531},{"month":"Year Total","opening":8.791,"inflows":551.25,"outflows":603.614,"closing":398.531}]}],"group":{"sheet":"GROUP","name":"GROUP CONSOLIDATED","title":"Cash Forecast As Of 26th May 2026","company":"Al Laith Group","entity":"Group consolidated forecast","statement":"Estimated Statement Of Cash Receipts & Disbursements For The Year 2026","unit":"AED '000","periods":[{"col":2,"month":"Jan","period":"1-13","key":"Jan 1-13"},{"col":3,"month":"Jan","period":"14-20","key":"Jan 14-20"},{"col":4,"month":"Jan","period":"21-27","key":"Jan 21-27"},{"col":5,"month":"Jan","period":"28-31","key":"Jan 28-31"},{"col":6,"month":"Jan","period":"TOT","key":"Jan TOT"},{"col":7,"month":"Feb","period":"1-10","key":"Feb 1-10"},{"col":8,"month":"Feb","period":"11-17","key":"Feb 11-17"},{"col":9,"month":"Feb","period":"18-24","key":"Feb 18-24"},{"col":10,"month":"Feb","period":"25-28","key":"Feb 25-28"},{"col":11,"month":"Feb","period":"","key":"Feb"},{"col":12,"month":"Feb","period":"TOT","key":"Feb TOT"},{"col":13,"month":"Mar","period":"1-10","key":"Mar 1-10"},{"col":14,"month":"Mar","period":"11-17","key":"Mar 11-17"},{"col":15,"month":"Mar","period":"18-24","key":"Mar 18-24"},{"col":16,"month":"Mar","period":"25-31","key":"Mar 25-31"},{"col":17,"month":"Mar","period":"","key":"Mar"},{"col":18,"month":"Mar","period":"TOT","key":"Mar TOT"},{"col":19,"month":"Apr","period":"01-07","key":"Apr 01-07"},{"col":20,"month":"Apr","period":"08-14","key":"Apr 08-14"},{"col":21,"month":"Apr","period":"15-21","key":"Apr 15-21"},{"col":22,"month":"Apr","period":"22-28","key":"Apr 22-28"},{"col":23,"month":"Apr","period":"29-30","key":"Apr 29-30"},{"col":24,"month":"Apr","period":"TOT","key":"Apr TOT"},{"col":25,"month":"May","period":"01-05","key":"May 01-05"},{"col":26,"month":"May","period":"06-12","key":"May 06-12"},{"col":27,"month":"May","period":"13-19","key":"May 13-19"},{"col":28,"month":"May","period":"20-26","key":"May 20-26"},{"col":29,"month":"May","period":"27-31","key":"May 27-31"},{"col":30,"month":"May","period":"","key":"May"},{"col":31,"month":"May","period":"TOT","key":"May TOT"},{"col":32,"month":"Jun","period":"TOT","key":"Jun TOT"},{"col":33,"month":"Jul","period":"TOT","key":"Jul TOT"},{"col":34,"month":"Aug","period":"TOT","key":"Aug TOT"},{"col":35,"month":"Sep","period":"TOT","key":"Sep TOT"},{"col":36,"month":"Oct","period":"TOT","key":"Oct TOT"},{"col":37,"month":"Nov","period":"TOT","key":"Nov TOT"},{"col":38,"month":"Dec","period":"TOT","key":"Dec TOT"},{"col":39,"month":"Total","period":"","key":"Total"}],"rows":[{"excelRow":null,"label":"Cash Flow From Operating Activities","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Estimated Cash Balance  At The Beginning Of The Period","type":"total","values":[90613.184,80398.312,85515.716,94401.597,90613.184,146145.284,146912.022,149111.512,147893.84,114117.301,146145.284,114117.301,97784.798,107967.433,104866.284,92622.235,114117.301,92622.235,96404.599,94977.73,101221.146,94672.662,92622.235,93050.745,101576.659,100641.136,100510.691,86612.116,85415.773,93050.745,85415.587,77048.064,78608.403,80416.615,75472.935,78839.67,72198.246,90613.184]},{"excelRow":null,"label":"Estimated Cash Inflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Debt Aging Forecast","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,27000.0,14563.235,4004.743,2897.825,1106.923,0.0,0.0,49130.622]},{"excelRow":null,"label":"Collections During Period","type":"line","values":[5036.411,6892.339,14708.862,9283.021,35920.634,9397.424,8079.828,5992.582,1300.393,0.0,24770.228,6057.886,2525.168,5737.786,7151.843,0.0,21472.683,5725.385,5046.179,9465.147,3782.047,2786.652,26805.411,7170.535,2471.818,3128.203,4853.828,572.367,0.0,18196.751,0.0,0.0,0.0,0.0,0.0,0.0,0.0,127165.707]},{"excelRow":null,"label":"Projected Collection","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,18110.884,15526.855,8561.931,9681.74,8808.276,9820.827,70510.515]},{"excelRow":null,"label":"Total Debtor Collection","type":"total","values":[5036.411,6892.339,14708.862,9283.021,35920.634,9397.424,8079.828,5992.582,1300.393,0.0,24770.228,6057.886,2525.168,5737.786,7151.843,0.0,21472.683,5725.385,5046.179,9465.147,3782.047,2786.652,26805.411,7170.535,2471.818,3128.203,4853.828,572.367,0.0,18196.751,27000.0,32674.119,19531.598,11459.756,10788.663,8808.276,9820.827,246806.844]},{"excelRow":null,"label":"% Collections On Billing","type":"line","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,null,null,null,null,0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Advance Received","type":"line","values":[683.252,59.54,9.975,49.41,802.177,20.0,62.861,73.966,7.6,0.0,164.426,247.65,43.0,3.99,29.874,0.0,324.514,3.675,7.455,24.929,2.22,0.0,38.279,0.525,1.05,56.25,4.2,0.0,0.0,62.025,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1391.42]},{"excelRow":null,"label":"Returned Chq","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-15.75,0.0,-22.54,0.0,-38.29,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-38.29]},{"excelRow":null,"label":"Intercompany Trf","type":"line","values":[59.492,0.0,31.133,1882.263,1972.887,57.75,0.0,0.0,19999.97,0.0,20057.72,0.0,18.375,0.0,0.0,0.0,18.375,31.132,0.0,36.75,128.625,0.0,196.507,0.0,0.0,48.57,0.0,0.0,0.0,48.57,758.936,10000.0,0.0,0.0,0.0,0.0,0.0,33052.996]},{"excelRow":null,"label":"Borrowings","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"Others","type":"line","values":[22.917,0.0,0.0,252.0,274.917,3.621,1898.706,1680.0,0.0,0.0,3582.327,5557.5,1.75,-1785.182,0.0,0.0,3774.068,23.379,4.8,0.0,-1680.0,0.0,-1651.821,2792.064,0.0,0.0,1.147,0.0,0.0,2793.211,0.0,0.0,0.0,0.0,10700.0,0.0,0.0,19472.701]},{"excelRow":null,"label":"Project Qiddiya Inflow","type":"line","values":[1582.447,0.0,214.477,50843.253,52640.176,0.0,0.0,0.0,0.0,0.0,0.0,0.0,12855.65,0.0,0.0,0.0,12855.65,0.0,0.0,0.0,7313.705,0.0,7313.705,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,72809.531]},{"excelRow":null,"label":"Total Inflows","type":"total","values":[7384.518,6951.879,15005.204,62309.946,91651.547,9627.36,10046.048,7746.547,1373.113,0.0,28793.07,11863.326,15428.193,3956.593,7159.177,0.0,38407.289,5783.572,5058.432,9526.828,9546.597,2786.652,32702.081,9963.124,2472.868,3233.022,4859.175,572.367,0.0,21100.557,27758.936,32674.119,19531.598,11459.756,21488.663,8808.276,9820.827,343754.617]},{"excelRow":null,"label":"Estimated Cash Outflows","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Suppliers","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Supplier Payments","type":"line","values":[5726.729,1575.806,383.019,2815.218,10500.772,164.2,1096.12,2456.394,3307.557,0.0,7024.272,990.832,86.027,69.76,5147.316,0.0,6293.937,607.117,504.471,811.784,7152.119,125.39,9200.881,45.223,12.508,549.405,9355.073,718.538,0.0,10680.748,2376.5,2376.5,2066.5,3116.5,3116.5,3116.5,3116.5,62986.109]},{"excelRow":null,"label":"Sub Contractors","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,587.565,0.0,0.0,587.565,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,345.396,0.0,0.186,345.582,0.0,0.0,0.0,0.0,250.0,250.0,250.0,1683.147]},{"excelRow":null,"label":"Proj Exp","type":"line","values":[1041.181,13.532,4.68,2077.349,3136.743,609.316,1988.719,179.759,276.15,0.0,3053.944,59.848,122.674,13.986,238.825,0.0,435.333,494.785,508.085,675.133,147.0,321.456,2146.459,106.197,1122.176,249.858,129.987,587.625,0.0,2195.843,11178.918,8671.08,3397.394,2331.916,1511.033,1563.727,1150.598,40772.986]},{"excelRow":null,"label":"Proj Exp KSA","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"Payment for Fixed Services","type":"line","values":[39.235,0.0,144.707,87.414,271.356,0.0,0.0,156.62,67.55,0.0,224.17,4.69,0.0,0.0,184.117,0.0,188.807,0.0,4.688,151.834,50.713,0.0,207.235,0.0,0.0,0.0,172.041,0.0,0.0,172.041,125.0,125.0,125.0,125.0,125.0,125.0,125.0,1938.611]},{"excelRow":null,"label":"Payments in Advance","type":"line","values":[92.311,34.755,111.54,7.936,246.543,67.826,0.0,146.738,0.0,0.0,214.564,0.0,10.93,0.0,10.344,0.0,21.274,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,15.654,0.0,0.0,0.0,15.654,0.0,0.0,0.0,0.0,0.0,0.0,0.0,498.034]},{"excelRow":null,"label":"PDCs Issued","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"Forecast for supplier payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,10067.061,3173.954,477.481,46.719,17.102,0.0,0.0,13782.319]},{"excelRow":null,"label":"Adjustments","type":"line","values":[0.0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,0.0,null,0.0,0.0,null,null,null,null,null,null]},{"excelRow":null,"label":"Total Supplier Payments","type":"total","values":[6899.458,1624.093,643.946,4987.918,14155.415,841.342,3084.839,3527.076,3651.257,0.0,11104.515,1055.37,219.631,83.746,5580.603,0.0,6939.352,1101.902,1017.245,1638.75,7349.832,446.845,11554.574,151.42,1134.684,814.917,10002.497,1306.163,0.186,13409.868,23747.479,14346.535,6066.376,5620.135,5019.635,5055.227,4642.098,121661.207]},{"excelRow":null,"label":"Payment Of Operating And Other Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Fixed Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Salaries & Wages","type":"line","values":[2815.83,1.533,492.382,2371.81,5681.555,2.4,2506.581,454.206,2456.656,0.0,5419.844,19.488,2505.934,2651.434,173.084,0.0,5349.94,20.069,1884.265,0.673,277.004,2306.518,4488.53,9.124,34.738,1892.521,2678.053,0.0,0.0,4614.437,4524.237,4524.237,4524.237,4824.237,6519.009,5052.987,5052.987,60576.238]},{"excelRow":null,"label":"Manpower Supplies","type":"line","values":[24.0,0.0,3359.186,0.0,3383.185,0.0,63.451,1132.969,0.0,0.0,1196.42,1266.301,0.0,0.0,789.525,0.0,2055.826,0.0,1.895,534.183,0.0,0.0,536.078,24.255,3.211,1.895,119.038,0.0,0.0,148.399,1149.638,251.2,251.2,251.2,851.2,851.2,151.2,11076.748]},{"excelRow":null,"label":"Telecommunication","type":"line","values":[2.489,0.0,76.323,0.0,78.812,2.498,0.0,83.771,0.0,0.0,86.269,2.498,0.0,72.279,0.0,0.0,74.777,2.487,0.399,69.794,0.0,0.0,72.68,2.576,0.0,0.0,70.584,0.0,0.0,73.16,74.0,74.0,74.0,74.0,74.0,74.0,74.0,903.698]},{"excelRow":null,"label":"Utility","type":"line","values":[53.585,0.0,0.0,0.0,53.585,48.965,0.0,0.0,0.0,0.0,48.965,48.06,0.0,0.0,0.0,0.0,48.06,49.507,0.0,0.0,0.0,0.0,49.507,51.612,0.0,0.0,0.0,0.0,0.0,51.612,63.0,83.0,83.0,83.0,53.0,53.0,53.0,722.728]},{"excelRow":null,"label":"Rent","type":"line","values":[305.225,233.488,388.98,0.0,927.693,1467.74,27.012,64.63,142.191,0.0,1701.573,1081.122,92.237,773.774,0.0,0.0,1947.133,147.107,66.811,149.917,77.65,100.992,542.479,106.057,76.605,92.237,439.45,0.0,0.0,714.35,1247.37,815.094,304.585,2091.354,403.11,672.695,1189.824,12557.26]},{"excelRow":null,"label":"Auto Loan","type":"line","values":[0.0,24.449,4.642,0.0,29.091,0.0,24.449,0.0,4.642,0.0,29.091,0.0,19.696,10.657,4.642,0.0,34.995,0.0,0.0,28.718,4.642,0.0,33.36,0.0,0.0,14.189,15.299,0.0,0.0,29.488,29.488,29.488,29.488,29.488,29.488,29.488,24.846,357.799]},{"excelRow":null,"label":"Mortgage","type":"line","values":[372.722,0.0,0.0,258.594,631.316,367.148,0.0,0.0,254.231,0.0,621.379,358.138,0.0,0.0,254.656,0.0,612.794,0.0,363.842,0.0,0.0,254.862,618.704,0.0,72.634,0.0,0.0,43.873,0.0,116.507,119.1,119.1,119.1,119.1,119.1,616.907,3603.749,7416.857]},{"excelRow":null,"label":"Salik","type":"line","values":[23.0,0.0,0.0,0.0,23.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,20.0,0.0,0.0,20.0,0.0,63.0]},{"excelRow":null,"label":"Rta(Road Traffic Authority)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,25.0,0.0,0.0,0.0,0.0,25.0,0.0,0.0,0.0,0.0,0.0,0.0,11.0,0.0,0.0,0.0,0.0,11.0,0.0,10.0,0.0,0.0,0.0,0.0,10.0,15.0,0.0,10.0,0.0,15.0,0.0,10.0,96.0]},{"excelRow":null,"label":"Fuel","type":"line","values":[189.183,0.0,160.884,0.0,350.067,0.0,192.071,0.0,139.189,0.0,331.26,0.0,164.827,0.0,68.521,0.0,233.348,0.0,129.17,101.814,0.0,0.0,230.984,0.0,0.0,198.803,55.293,0.0,0.0,254.096,247.5,247.5,247.5,247.5,247.5,247.5,247.5,3132.255]},{"excelRow":null,"label":"Visa","type":"line","values":[108.921,0.195,15.338,0.0,124.454,34.661,50.0,12.792,0.0,0.0,97.453,62.839,1.024,0.0,18.817,0.0,82.68,14.43,1.56,9.949,61.537,6.919,94.395,109.2,-3.705,71.265,186.6,0.0,0.0,363.36,150.0,150.0,150.0,150.0,150.0,150.0,150.0,1812.342]},{"excelRow":null,"label":"Bank Charges","type":"line","values":[15.989,7.103,0.484,1.093,24.67,2.847,15.182,0.681,2.329,0.0,21.038,14.03,1.252,0.623,4.341,0.0,20.247,14.744,0.345,2.776,2.705,5.15,25.721,13.622,0.738,0.89,21.606,0.334,0.0,37.192,24.0,24.0,24.0,24.0,24.0,24.0,24.0,296.868]},{"excelRow":null,"label":"Restricted cash \u2013 guarantees and deposits","type":"line","values":[0.0,-1010.366,0.0,0.0,-1010.366,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,6272.55,0.0,0.0,0.0,0.0,0.0,5262.184]},{"excelRow":null,"label":"Vat/Tax","type":"line","values":[0.0,0.0,0.0,504.104,504.104,32.771,0.0,0.0,420.336,0.0,453.107,0.0,0.26,0.0,4054.505,0.0,4054.765,0.0,1005.712,0.361,890.211,0.0,1896.284,685.438,1.151,0.0,417.766,0.0,0.0,1104.355,1263.432,552.405,3034.866,1085.614,50.266,129.898,913.615,15042.71]},{"excelRow":null,"label":"Trade License","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,76.184,47.292,0.0,0.0,123.476,0.0,0.0,0.0,0.0,0.0,0.0,0.0,76.164,0.0,0.0,0.0,76.164,0.0,0.0,0.0,0.0,0.0,0.0,0.0,326.164,76.164,33.257,50.0,0.0,0.0,0.0,685.225]},{"excelRow":null,"label":"Sponsorship Fees to Partners","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,584.59,584.59,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,40.0,250.0,0.0,0.0,0.0,0.0,874.59]},{"excelRow":null,"label":"Audit Fees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,53.515,0.0,0.0,1.984,0.0,55.499,0.0,0.0,0.0,28.031,0.0,0.0,28.031,14.5,0.0,0.0,0.0,0.0,0.0,0.0,98.03]},{"excelRow":null,"label":"Insurance","type":"line","values":[60.691,127.888,12.756,11.717,213.053,275.042,303.796,0.0,547.628,0.0,1126.465,49.678,490.35,0.0,11.718,0.0,551.745,46.609,16.321,0.0,0.6,0.0,63.53,43.205,617.328,-12.55,28.13,0.0,0.0,676.112,62.105,717.507,62.105,84.807,634.713,608.8,529.609,5330.552]},{"excelRow":null,"label":"Credit Cards","type":"line","values":[199.532,3.905,0.0,46.72,250.157,0.0,42.516,172.936,0.0,0.0,215.452,0.0,0.0,44.15,158.793,0.0,202.943,0.0,0.0,121.991,0.0,0.0,121.991,98.916,237.548,0.0,52.376,71.873,0.0,460.712,315.0,215.0,315.0,315.0,315.0,315.0,315.0,3356.255]},{"excelRow":null,"label":"Petty Cash","type":"line","values":[159.019,74.485,22.97,20.0,276.473,126.8,92.84,103.616,7.284,0.0,330.54,92.402,99.891,21.672,4.796,0.0,218.761,30.141,66.862,13.749,23.292,14.0,148.043,37.475,23.5,20.651,38.975,0.0,0.0,120.601,85.0,85.0,85.0,125.0,290.0,290.0,290.0,2344.418]},{"excelRow":null,"label":"IT / Digital And Office Exp","type":"line","values":[97.682,0.0,2.1,8.623,108.405,128.915,0.0,16.018,30.75,0.0,175.683,22.002,0.0,0.0,62.87,0.0,84.872,31.492,55.313,10.596,93.707,10.9,202.009,8.055,0.0,0.0,10.896,48.038,0.0,66.989,100.0,100.0,100.0,100.0,100.0,100.0,100.0,1337.958]},{"excelRow":null,"label":"Sub Total","type":"total","values":[4427.869,-537.32,4536.046,3222.662,11649.256,2514.784,3394.082,2088.91,4005.238,0.0,12003.014,3016.766,3375.473,3574.589,5606.266,0.0,15573.095,421.312,3668.662,1044.522,1433.335,3283.93,9851.759,1189.535,1073.748,2279.902,4162.098,164.118,0.0,8869.401,9812.536,14379.246,9720.339,9657.301,9878.384,9238.476,12732.331,133365.138]},{"excelRow":null,"label":"Variable Cash Expenses","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Bonus","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,875.0,0.0,0.0,0.0,0.0,1750.0,2625.0]},{"excelRow":null,"label":"Final Sett/Leave Salary","type":"line","values":[12.598,72.217,51.655,0.424,136.894,66.928,58.697,60.888,8.473,0.0,194.987,1.0,19.625,114.386,6.615,0.0,141.627,170.077,8.817,6.395,116.037,0.0,301.327,17.985,0.0,227.946,6.768,0.0,0.0,252.699,409.164,282.0,381.426,330.0,125.0,125.0,175.0,2855.122]},{"excelRow":null,"label":"Loans/Salary Advance to Employees","type":"line","values":[10.706,6.67,0.0,-0.5,16.877,-21.839,162.445,51.17,4.3,0.0,196.076,-24.379,-4.064,0.6,1.177,0.0,-26.666,0.33,0.219,0.916,-1.02,-51.05,-50.604,-22.917,0.0,10.195,15.708,0.0,0.0,2.986,0.0,25.0,0.0,15.0,25.0,0.0,0.0,203.669]},{"excelRow":null,"label":"Staff Ticket/Travel Expenses","type":"line","values":[0.0,0.0,105.15,7.098,112.248,0.0,5.255,133.074,46.512,0.0,184.842,0.0,0.0,0.0,82.053,0.0,82.053,0.0,-0.5,67.045,20.432,0.0,86.977,0.0,0.0,0.0,154.878,0.0,0.0,154.878,202.0,202.0,127.0,127.0,127.0,127.0,127.0,1659.998]},{"excelRow":null,"label":"Entertinment / Staff Welfare","type":"line","values":[0.0,0.0,2.0,14.0,16.0,6.0,0.0,0.0,0.0,0.0,6.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,43.0]},{"excelRow":null,"label":"Marketing & Branding","type":"line","values":[17.5,0.0,0.0,17.5,35.0,15.747,47.25,0.0,0.0,0.0,62.997,0.0,10.626,0.0,0.0,0.0,10.626,7.323,0.0,0.0,8.925,0.0,16.248,0.0,0.0,0.0,0.0,0.0,0.0,0.0,45.0,45.0,45.0,45.0,45.0,45.0,45.0,439.871]},{"excelRow":null,"label":"Partnership A/C(Serious)","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,350.0,350.0,0.0,0.0,0.0,0.0,700.0]},{"excelRow":null,"label":"Intercompany Loan/Dividend","type":"line","values":[5000.0,0.0,30.374,13.618,5043.992,44.449,0.0,0.0,20001.129,0.0,20045.578,0.0,0.0,0.0,0.0,0.0,0.0,2.0,0.0,0.0,0.0,0.0,2.0,0.0,0.0,8.482,0.0,0.0,0.0,8.482,0.0,0.0,0.0,0.0,0.0,0.0,0.0,25100.052]},{"excelRow":null,"label":"Intercompany Outflow","type":"line","values":[29.251,0.0,0.0,1882.263,1911.514,15.0,0.0,-0.001,0.0,0.0,14.999,19.5,18.375,0.0,9.188,0.0,47.063,0.0,0.0,165.375,0.0,0.0,165.375,0.0,0.0,0.0,0.0,0.0,0.0,0.0,919.904,0.0,0.0,0.0,0.0,0.0,0.0,3058.856]},{"excelRow":null,"label":"Legal & Professional Fees","type":"line","values":[3.402,0.0,0.0,14.788,18.19,0.0,0.0,0.0,12.753,0.0,12.753,4.0,4.875,0.0,16.042,0.0,24.917,1.121,0.0,0.0,3.171,11.328,15.621,3.7,8.409,0.09,0.0,0.0,0.0,12.199,21.0,21.0,21.0,21.0,21.0,21.0,21.0,230.679]},{"excelRow":null,"label":"Staff Training Expenses","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,8.4,0.0,13.23,0.0,21.63,0.0,8.4,0.0,52.92,0.0,61.32,0.0,0.0,0.0,0.0,0.0,0.0,2.5,0.0,8.4,0.0,0.0,0.0,10.9,10.0,10.0,10.0,10.0,10.0,10.0,10.0,163.85]},{"excelRow":null,"label":"Project Qiddiya Outflow","type":"line","values":[1198.607,668.814,678.839,406.486,2952.746,5378.213,647.426,2885.174,7314.121,0.0,16224.934,24117.692,575.7,3284.42,7372.331,0.0,35350.144,297.146,1575.767,306.054,7164.368,717.514,10060.848,94.986,1191.553,13.533,4415.801,298.429,0.0,6014.302,0.0,0.0,0.0,0.0,0.0,0.0,0.0,70602.974]},{"excelRow":null,"label":"Capex","type":"section","values":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]},{"excelRow":null,"label":"Capital Expenses","type":"line","values":[0.0,0.0,71.313,0.0,71.313,0.0,438.163,217.927,92.639,0.0,748.73,5.881,1016.914,0.0,676.031,0.0,1698.826,0.0,215.091,54.355,0.0,0.0,269.445,0.0,0.0,0.0,0.0,0.0,0.0,0.0,881.377,500.0,924.246,500.0,2179.658,750.0,750.0,9273.595]},{"excelRow":null,"label":"Total Outflows","type":"total","values":[17599.39,1834.475,6119.323,10566.258,36119.446,8860.624,7846.559,8964.218,35149.652,0.0,60821.053,28195.831,5245.557,7057.742,19403.227,0.0,59902.356,2001.208,6485.3,3283.411,16095.081,4408.567,32273.57,1437.209,3408.393,3363.465,18757.75,1768.711,0.186,28735.716,36126.46,31113.781,17723.386,16403.436,18121.928,15449.703,20330.429,373121.259]},{"excelRow":null,"label":"Estimated Cash Bal At The End Of The Period","type":"total","values":[80398.312,85515.716,94401.597,146145.284,146145.284,146912.022,149111.512,147893.84,114117.301,114117.301,114117.301,97784.798,107967.433,104866.284,92622.235,92622.235,92622.235,96404.599,94977.73,101221.146,94672.662,93050.745,93050.745,101576.659,100641.136,100510.691,86612.116,85415.773,85415.587,85415.587,77048.064,78608.403,80416.615,75472.935,78839.67,72198.246,61688.644,61246.54]},{"excelRow":null,"label":"Payments","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"Bank Guarantees","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.21,null,null,null,0.0,0.21,0.21,0.0,0.0,0.0,0.0,0.21,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.42]},{"excelRow":null,"label":"Office & IT Maintennace","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"R/Co","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,0.0,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"Arch Opex","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"Rebate/Discount","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]},{"excelRow":null,"label":"IT / Digital and Office Exp","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,21.0]},{"excelRow":null,"label":"Dividend","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,613.251,0.0,0.0,613.251]},{"excelRow":null,"label":"Customer Advance","type":"line","values":[0.0,0.0,40.757,0.0,40.757,148.566,4.653,0.0,0.0,0.0,153.219,0.29,0.0,null,null,0.0,0.29,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,194.266]},{"excelRow":null,"label":"Intercompany Inflow","type":"line","values":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-19934.85,0.0,-19934.85,null,null,null,null,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-10000.0,0.0,0.0,0.0,0.0,0.0,-29934.85]}],"monthlySummary":[{"month":"Jan","opening":90613.184,"inflows":91651.547,"outflows":36119.446,"closing":146145.284},{"month":"Feb","opening":146145.284,"inflows":28793.07,"outflows":60821.053,"closing":114117.301},{"month":"Mar","opening":114117.301,"inflows":38407.289,"outflows":59902.356,"closing":92622.235},{"month":"Apr","opening":92622.235,"inflows":32702.081,"outflows":32273.57,"closing":93050.745},{"month":"May","opening":93050.745,"inflows":21100.557,"outflows":28735.716,"closing":85415.587},{"month":"Jun","opening":85415.587,"inflows":27758.936,"outflows":36126.46,"closing":77048.064},{"month":"Jul","opening":77048.064,"inflows":32674.119,"outflows":31113.781,"closing":78608.403},{"month":"Aug","opening":78608.403,"inflows":19531.598,"outflows":17723.386,"closing":80416.615},{"month":"Sep","opening":80416.615,"inflows":11459.756,"outflows":16403.436,"closing":75472.935},{"month":"Oct","opening":75472.935,"inflows":21488.663,"outflows":18121.928,"closing":78839.67},{"month":"Nov","opening":78839.67,"inflows":8808.276,"outflows":15449.703,"closing":72198.246},{"month":"Dec","opening":72198.246,"inflows":9820.827,"outflows":20330.429,"closing":61688.644},{"month":"Year Total","opening":90613.184,"inflows":343754.617,"outflows":373121.259,"closing":61688.644}]}};
let currentForecastSheet = "GROUP";
const ALPS_CB_DATA = FORECAST_DATA.entities[0];
DASHBOARD_DATA = FORECAST_DATA.dashboardData || null;
QIDDIYA_DATA = FORECAST_DATA.qiddiyaData || null;

/* ---------------- June weekly columns for current forecast version ----------------
   For June 2026 the source workbook currently has only "Jun TOT". This helper adds
   four working week columns (Jun W1 to Jun W4) before Jun TOT for every business unit
   and for the group sheet. Monthly totals remain unchanged and continue driving the
   consolidated summary. If the Google Sheet later supplies real Jun W1-W4 columns,
   this helper will not duplicate them. */
function addJuneWeeklyColumns(){
  const sheets=[FORECAST_DATA.group, ...(FORECAST_DATA.entities||[])].filter(Boolean);
  sheets.forEach(sheet=>{
    if(!sheet.periods || !sheet.rows) return;
    if(sheet.periods.some(p=>p.month==='Jun' && ['W1','W2','W3','W4'].includes(String(p.period)))) return;
    const junTotIdx=sheet.periods.findIndex(p=>p.month==='Jun' && String(p.period).toUpperCase()==='TOT');
    if(junTotIdx<0) return;
    const junSummary=(sheet.monthlySummary||[]).find(m=>m.month==='Jun')||{};
    const opening=Number(junSummary.opening)||0;
    const inflows=Number(junSummary.inflows)||0;
    const outflows=Number(junSummary.outflows)||0;
    const weeklyNet=(inflows-outflows)/4;
    const weekPeriods=['W1','W2','W3','W4'].map((w,n)=>({
      col:(sheet.periods[junTotIdx].col||0)+n/10,
      month:'Jun',
      period:w,
      key:'Jun '+w
    }));
    sheet.periods.splice(junTotIdx,0,...weekPeriods);
    sheet.rows.forEach(row=>{
      if(!Array.isArray(row.values)) row.values=[];
      const totalValue=row.values[junTotIdx];
      const label=String(row.label||'').toLowerCase().replace(/\s+/g,' ');
      let weekVals;
      if(row.type==='section'){
        weekVals=[null,null,null,null];
      }else if(label.includes('beginning of the period') || label.includes('cash balance at the beginning')){
        weekVals=[opening, opening+weeklyNet, opening+(weeklyNet*2), opening+(weeklyNet*3)];
      }else if(label.includes('end of the period') || label.includes('bal at the end')){
        weekVals=[opening+weeklyNet, opening+(weeklyNet*2), opening+(weeklyNet*3), Number(junSummary.closing)||totalValue||0];
      }else{
        const v=Number(totalValue);
        weekVals=isNaN(v) ? [null,null,null,null] : [v/4,v/4,v/4,v/4];
      }
      row.values.splice(junTotIdx,0,...weekVals);
    });
  });
}
addJuneWeeklyColumns();


/* ---------------- group cash forecast sheets ---------------- */
function alpsFmt(n){
  if(n===null||n===undefined||n===''||isNaN(n)) return '—';
  const neg=Number(n)<0, v=Math.abs(Number(n));
  const s=v.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg?'('+s+')':s;
}
function alpsValClass(n){ return Number(n)<0?'neg':(Number(n)>0?'pos':'muted'); }
function forecastSheets(){ return [FORECAST_DATA.group, ...(FORECAST_DATA.entities||[])].filter(Boolean); }
function getForecast(){ return forecastSheets().find(x=>x.sheet===currentForecastSheet) || FORECAST_DATA.group; }
function syncForecastSelectors(){
  const opts=forecastSheets().map(s=>`<option value="${escapeHtml(s.sheet)}" ${s.sheet===currentForecastSheet?'selected':''}>${escapeHtml(s.name)}</option>`).join('');
  ['forecastEntity','forecastEntity2'].forEach(id=>{ if($(id)) $(id).innerHTML=opts; });
}
function setForecastSheet(v){ currentForecastSheet=v; syncForecastSelectors(); renderAlpsCB(); }
function renderAlpsCB(){
  if(!$('alpsKpis')) return;
  syncForecastSelectors();
  const d=getForecast(), months=d.monthlySummary.filter(x=>x.month!=='Year Total');
  const year=d.monthlySummary.find(x=>x.month==='Year Total')||months[months.length-1];
  const last=months[months.length-1]||year;
  $('alpsSub').textContent=`${d.name} · ${d.title} · ${d.unit}`;
  $('alpsKpis').innerHTML=[
    ['Opening balance', alpsFmt(months[0]?.opening), 'Start of forecast', ''],
    ['Year inflows', alpsFmt(year?.inflows), 'Total forecast receipts', 'pos'],
    ['Year outflows', alpsFmt(year?.outflows), 'Total forecast payments', 'neg'],
    ['Closing balance', alpsFmt(last?.closing), 'End of selected forecast period', alpsValClass(last?.closing)]
  ].map(k=>`<div class="card kpi"><div class="lbl">${k[0]}</div><div class="val num ${k[3]}">${k[1]}</div><div class="meta">${k[2]}</div></div>`).join('');
  $('alpsMonthly').innerHTML=alpsMonthlyTable(d.monthlySummary);
  renderAlpsSheet();
}
function alpsMonthlyTable(rows){
  return `<table><thead><tr><th>Period</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Net movement</th><th>Closing</th></tr></thead><tbody>${rows.map(r=>{
    const net=(Number(r.inflows)||0)-(Number(r.outflows)||0);
    return `<tr><td class="rowhead">${escapeHtml(r.month)}</td><td class="num">${alpsFmt(r.opening)}</td><td class="num pos">${alpsFmt(r.inflows)}</td><td class="num neg">${alpsFmt(r.outflows)}</td><td class="num ${alpsValClass(net)}">${alpsFmt(net)}</td><td class="num ${alpsValClass(r.closing)}">${alpsFmt(r.closing)}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function renderAlpsSheet(){
  const mode=$('alpsViewMode')?$('alpsViewMode').value:'monthly';
  const search=($('alpsSearch')?$('alpsSearch').value:'').toLowerCase().trim();
  const d=getForecast();
  if(!d || !Array.isArray(d.periods) || !Array.isArray(d.rows)){
    $('alpsSheet').innerHTML='<div class="empty">Detailed weekly/monthly sheet lines are not available for this selection. Use a business unit sheet, or refresh from Google Sheet again.</div>';
    return;
  }
  const cols = mode==='weekly' ? d.periods.map((_,i)=>i) : d.periods.map((p,i)=>(p.period==='TOT'||p.month==='Total'||p.period==='Total')?i:null).filter(i=>i!==null);
  let rows=d.rows||[];
  if(search) rows=rows.filter(r=>String(r.label||'').toLowerCase().includes(search)||r.type==='section');
  const top=`<tr><th rowspan="2">Cash flow line</th>${cols.map(i=>`<th>${escapeHtml(d.periods[i].month)}</th>`).join('')}</tr><tr>${cols.map(i=>`<th>${escapeHtml(d.periods[i].period||'')}</th>`).join('')}</tr>`;
  const body=rows.map(r=>{
    if(r.type==='section') return `<tr class="section"><td colspan="${cols.length+1}">${escapeHtml(r.label)}</td></tr>`;
    const vals=Array.isArray(r.values)?r.values:[];
    return `<tr class="${r.type==='total'?'total':''}"><td class="rowhead">${escapeHtml(r.label)}</td>${cols.map(i=>`<td class="num ${alpsValClass(vals[i])}">${alpsFmt(vals[i])}</td>`).join('')}</tr>`;
  }).join('');
  $('alpsSheet').innerHTML=`<table class="forecast-table"><thead>${top}</thead><tbody>${body}</tbody></table>`;
}
function exportAlpsCSV(){
  const d=getForecast();
  if(!d || !Array.isArray(d.periods) || !Array.isArray(d.rows)){ alert('No detailed forecast lines are available to export for this selection.'); return; }
  const cols=d.periods.map((_,i)=>i);
  const lines=[];
  lines.push(['Cash flow line',...cols.map(i=>`${d.periods[i].month} ${d.periods[i].period}`.trim())].join(','));
  d.rows.forEach(r=>lines.push([`"${String(r.label).replace(/"/g,'""')}"`,...cols.map(i=>(Array.isArray(r.values)?r.values[i]:'')??'')].join(',')));
  download(new Blob([lines.join('\n')],{type:'text/csv'}),`${d.sheet.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-forecast-2026.csv`);
}


/* ---------------- Google Sheet connection defaults ---------------- */
// DEFAULT_GOOGLE_SHEET_URL defined at top
// SHEET_IMPORT_NAMES defined at top
// DASHBOARD_DATA defined at top
// QIDDIYA_DATA defined at top

/* ---------------- executive management features ---------------- */
let actuals = JSON.parse(localStorage.getItem('cf_actuals')||'{}');
let thresholds = JSON.parse(localStorage.getItem('cf_thresholds')||'{}');
const DEFAULT_THRESHOLD = 5000; // AED '000
function monthsOnly(summary){ return (summary||[]).filter(x=>x.month && x.month!=='Year Total'); }
function ensureMgmtDefaults(){
  forecastSheets().forEach(s=>{ if(s.sheet!=='GROUP' && thresholds[s.sheet]===undefined) thresholds[s.sheet]=DEFAULT_THRESHOLD; });
  localStorage.setItem('cf_thresholds',JSON.stringify(thresholds));
  const saved=localStorage.getItem('cf_google_sheet_url') || DEFAULT_GOOGLE_SHEET_URL;
  ['googleSheetUrl','googleSheetUrlSettings'].forEach(id=>{ if($(id) && !$(id).value) $(id).value=saved; });
  localStorage.setItem('cf_google_sheet_url', saved);
}

function parseExeSummary(matrix){
  const rows=Array.isArray(matrix)?matrix:[];
  const blocks=[];
  rows.forEach(r=>{
    const cells=(Array.isArray(r)?r:[]).map(c=>cleanText(c)).filter(Boolean);
    if(!cells.length) return;
    const first=cells[0];
    const text=cells.length>1 ? cells.join(' ') : first;
    blocks.push(text);
  });
  return blocks;
}
function renderExeSummaryBlocks(blocks){
  if(!$('execNarrative')) return;
  if(!Array.isArray(blocks) || !blocks.length){
    $('execNarrative').innerHTML='<div class="empty">No Executive Summary text was found in the Exe Sum tab.</div>';
    return;
  }
  const sectionTitles=new Set(['Executive Summary','Cash Preservation and Cost Optimization Measures','Items Under Review','Key financial priorities in such a scenario would include:','Other fixed payments','Dividend','-Proposed Dividend Distribution and GCI Fee Settlement']);
  let html='';
  blocks.forEach((b,idx)=>{
    const t=String(b||'').trim(); if(!t) return;
    const isNum=/^\d+\s+/.test(t);
    const isBullet=/^(Accelerating|Deferring|Negotiating|Following Actions)/i.test(t);
    if(idx===0 || sectionTitles.has(t) || (!isNum && t.length<90 && /Measures|Review|Dividend|Summary|payments|priorities|Actions/i.test(t))){
      html+=`<h3>${escapeHtml(t)}</h3>`;
    }else if(isNum){
      html+=`<p style="margin-left:14px"><strong>${escapeHtml(t.slice(0,1))}.</strong> ${escapeHtml(t.slice(1).trim())}</p>`;
    }else if(isBullet){
      html+=`<p style="margin-left:18px">• ${escapeHtml(t)}</p>`;
    }else{
      html+=`<p>${escapeHtml(t)}</p>`;
    }
  });
  $('execNarrative').innerHTML=html || '<div class="empty">No Executive Summary text was found in the Exe Sum tab.</div>';
}
function periodHeaderHTML(periods, cols){
  return `<tr><th rowspan="2">Cash flow line</th>${cols.map(i=>`<th>${escapeHtml(periods[i]?.month||'')}</th>`).join('')}</tr><tr>${cols.map(i=>`<th>${escapeHtml(periods[i]?.period||periods[i]?.header||'')}</th>`).join('')}</tr>`;
}
function rowValuesHTML(row, cols){
  const vals=Array.isArray(row.values)?row.values:[];
  return cols.map(i=>`<td class="num ${alpsValClass(vals[i])}">${alpsFmt(vals[i])}</td>`).join('');
}
function filterRowsBetween(rows, startRegex, endRegex){
  const out=[]; let active=false;
  (rows||[]).forEach(r=>{
    const label=String(r.label||'');
    if(startRegex.test(label)){ active=true; out.push(r); return; }
    if(active){ out.push(r); if(endRegex && endRegex.test(label)) active=false; }
  });
  return out.filter(r=>r && r.label);
}
function renderDetailTable(targetId, sheet, rows){
  if(!$(targetId)) return;
  if(!sheet || !Array.isArray(sheet.periods) || !Array.isArray(rows) || !rows.length){
    $(targetId).innerHTML='<div class="empty">No detailed Google Sheet lines available for this section.</div>'; return;
  }
  const cols=sheet.periods.map((_,i)=>i);
  const body=rows.map(r=>{
    if(r.type==='section') return `<tr class="section"><td colspan="${cols.length+1}">${escapeHtml(r.label)}</td></tr>`;
    return `<tr class="${r.type==='total'?'total':''}"><td class="rowhead">${escapeHtml(r.label)}</td>${rowValuesHTML(r,cols)}</tr>`;
  }).join('');
  $(targetId).innerHTML=`<table class="forecast-table"><thead>${periodHeaderHTML(sheet.periods,cols)}</thead><tbody>${body}</tbody></table>`;
}
function renderBusinessUnitDetails(entId){
  const ent=D.entities.find(e=>e.id===entId);
  const sheet=forecastEntityForId(entId);
  if($('entityCashPositionTitle')) $('entityCashPositionTitle').textContent=(ent?ent.name:'Business unit')+' — weekly / monthly cash position';
  if($('entityInflowsTitle')) $('entityInflowsTitle').textContent=(ent?ent.name:'Business unit')+' — detailed inflows';
  if($('entityOutflowsTitle')) $('entityOutflowsTitle').textContent=(ent?ent.name:'Business unit')+' — detailed outflows';
  if(!sheet){
    ['entityCashPosition','entityInflowsDetail','entityOutflowsDetail'].forEach(id=>{ if($(id)) $(id).innerHTML='<div class="empty">Refresh from Google Sheet to load detailed business unit lines.</div>'; });
    return;
  }
  const cashRows=(sheet.rows||[]).filter(r=>/Estimated Cash\s*(Balance|Bal).*Beginning|Total Inflows|Total Outflows|Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Closing Balance/i.test(r.label));
  const inflowRows=filterRowsBetween(sheet.rows,/Estimated Cash Inflows/i,/Total Inflows/i);
  const outflowRows=filterRowsBetween(sheet.rows,/Estimated Cash Outflows/i,/Total Outflows/i);
  renderDetailTable('entityCashPosition',sheet,cashRows);
  renderDetailTable('entityInflowsDetail',sheet,inflowRows);
  renderDetailTable('entityOutflowsDetail',sheet,outflowRows);
}

function renderExecutiveSummary(){
  if(!$('execKpis')) return; ensureMgmtDefaults(); syncVarianceSelectors();
  const g=FORECAST_DATA.group, months=monthsOnly(g.monthlySummary), year=g.monthlySummary.find(x=>x.month==='Year Total')||{};
  const first=months[0]||{}, last=months[months.length-1]||{};
  const net=(Number(year.inflows)||0)-(Number(year.outflows)||0);
  const reportDate = reportDateDisplay();
  $('execAsOf').textContent=(reportDate?`As at ${reportDate} · `:`As of ${FORECAST_DATA.asOf||'latest upload'} · `)+`figures in AED '000`;
  $('execKpis').innerHTML=[
    ['Opening Cash',alpsFmt(first.opening),'Start of forecast',''],['Closing Cash',alpsFmt(last.closing),'End of forecast',alpsValClass(last.closing)],['Total Collections',alpsFmt(year.inflows),'Forecast inflows','pos'],['Total Payments',alpsFmt(year.outflows),'Forecast outflows','neg'],['Net Movement',alpsFmt(net),'Inflows less outflows',alpsValClass(net)],['Funding Gap',alpsFmt(calcFundingGap()),'Threshold shortfall','neg']
  ].map(k=>`<div class="card kpi"><div class="lbl">${k[0]}</div><div class="val num ${k[3]}">${k[1]}</div><div class="meta">${k[2]}</div></div>`).join('');
  renderExeSummaryBlocks(FORECAST_DATA.exeSummary || []);
  renderFundingAlerts(); renderThresholdTable(); renderVarianceTable();
}
function calcFundingGap(){
  return forecastSheets().filter(s=>s.sheet!=='GROUP').reduce((sum,s)=>{
    const low=Math.min(...monthsOnly(s.monthlySummary).map(m=>Number(m.closing)||0));
    const th=Number(thresholds[s.sheet]??DEFAULT_THRESHOLD); return sum + Math.max(0, th-low);
  },0);
}
function entityStatus(sheet){
  const d=forecastSheets().find(s=>s.sheet===sheet), m=monthsOnly(d.monthlySummary); const low=Math.min(...m.map(x=>Number(x.closing)||0)); const th=Number(thresholds[sheet]??DEFAULT_THRESHOLD);
  if(low<0 || low<th*0.5) return ['Funding Required','status-critical']; if(low<th) return ['Monitor','status-watch']; return ['Healthy','status-good'];
}
function renderFundingAlerts(){
  const alerts=forecastSheets().filter(s=>s.sheet!=='GROUP').map(s=>{
    const m=monthsOnly(s.monthlySummary), lowM=m.reduce((a,b)=>(Number(b.closing)||0)<(Number(a.closing)||0)?b:a,m[0]||{}); const th=Number(thresholds[s.sheet]??DEFAULT_THRESHOLD); const gap=Math.max(0,th-(Number(lowM.closing)||0)); const st=entityStatus(s.sheet);
    return {s,lowM,th,gap,st};
  }).filter(a=>a.gap>0).sort((a,b)=>b.gap-a.gap);
  $('fundingAlerts').innerHTML= alerts.length ? alerts.map(a=>`<div class="alert-card"><span class="status-pill ${a.st[1]}">${a.st[0]}</span><strong>${escapeHtml(a.s.name)}</strong><div class="muted">Lowest month: ${escapeHtml(a.lowM.month||'')}</div><div class="amt neg num">${alpsFmt(a.gap)}</div><div class="muted">Funding required to reach threshold of ${alpsFmt(a.th)}</div></div>`).join('') : '<div class="empty">No funding requirement based on current thresholds.</div>';
}
function renderThresholdTable(){
  const rows=forecastSheets().filter(s=>s.sheet!=='GROUP').map(s=>{
    const m=monthsOnly(s.monthlySummary), last=m[m.length-1]||{}, low=m.reduce((a,b)=>(Number(b.closing)||0)<(Number(a.closing)||0)?b:a,m[0]||{}); const st=entityStatus(s.sheet);
    return `<tr><td class="rowhead">${escapeHtml(s.name)}</td><td><input class="threshold-input" type="number" value="${thresholds[s.sheet]??DEFAULT_THRESHOLD}" onchange="thresholds['${s.sheet}']=Number(this.value)||0;localStorage.setItem('cf_thresholds',JSON.stringify(thresholds));renderExecutiveSummary()"></td><td class="num ${alpsValClass(low.closing)}">${alpsFmt(low.closing)}</td><td>${escapeHtml(low.month||'')}</td><td class="num ${alpsValClass(last.closing)}">${alpsFmt(last.closing)}</td><td><span class="status-pill ${st[1]}">${st[0]}</span></td></tr>`;
  }).join('');
  $('thresholdTable').innerHTML=`<table><thead><tr><th>Entity</th><th>Min threshold</th><th>Lowest forecast</th><th>Lowest month</th><th>Dec closing</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function syncVarianceSelectors(){
  if(!$('varianceEntity')) return; $('varianceEntity').innerHTML=forecastSheets().map(s=>`<option value="${escapeHtml(s.sheet)}" ${s.sheet===currentForecastSheet?'selected':''}>${escapeHtml(s.name)}</option>`).join('');
}
function renderVarianceTable(){
  if(!$('varianceTable')) return; const sheet=$('varianceEntity')?.value||currentForecastSheet; const d=forecastSheets().find(s=>s.sheet===sheet)||FORECAST_DATA.group; const rows=monthsOnly(d.monthlySummary).map(r=>{
    const key=sheet+'|'+r.month; const act=actuals[key]; const variance=(act===''||act===undefined)?null:Number(act)-Number(r.closing||0); const pct=variance===null||!r.closing?null:variance/Math.abs(Number(r.closing))*100;
    return `<tr><td class="rowhead">${r.month}</td><td class="num">${alpsFmt(r.closing)}</td><td><input class="threshold-input" type="number" step="0.01" data-actual="${key}" value="${act??''}"></td><td class="num ${alpsValClass(variance)}">${variance===null?'—':alpsFmt(variance)}</td><td class="num ${alpsValClass(variance)}">${pct===null?'—':pct.toFixed(1)+'%'}</td></tr>`;
  }).join('');
  $('varianceTable').innerHTML=`<table><thead><tr><th>Month</th><th>Forecast closing</th><th>Actual closing</th><th>Variance</th><th>Variance %</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function saveActuals(){ document.querySelectorAll('[data-actual]').forEach(i=>{actuals[i.dataset.actual]=i.value===''?'':Number(i.value);}); localStorage.setItem('cf_actuals',JSON.stringify(actuals)); renderVarianceTable(); }
function printExecutiveReport(){ renderExecutiveSummary(); window.print(); }
function exportForecastExcel(){
  const table=document.createElement('table'); let html='<tr><th>Sheet</th><th>Month</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Closing</th></tr>';
  forecastSheets().forEach(s=>monthsOnly(s.monthlySummary).forEach(r=>{html+=`<tr><td>${s.name}</td><td>${r.month}</td><td>${r.opening}</td><td>${r.inflows}</td><td>${r.outflows}</td><td>${r.closing}</td></tr>`;}));
  table.innerHTML=html; download(new Blob(['<html><body>'+table.outerHTML+'</body></html>'],{type:'application/vnd.ms-excel'}),'al-laith-group-cash-flow-forecast.xls');
}
function getGoogleSheetUrlInput(){ return (($('googleSheetUrlSettings')&&$('googleSheetUrlSettings').value) || ($('googleSheetUrl')&&$('googleSheetUrl').value) || localStorage.getItem('cf_google_sheet_url') || DEFAULT_GOOGLE_SHEET_URL || '').trim(); }
function setGoogleNotes(msg){ ['googleSheetNote','googleSheetNoteSettings'].forEach(id=>{ if($(id)) $(id).textContent=msg; }); }
function saveGoogleSheetUrl(){
  const v=getGoogleSheetUrlInput(); localStorage.setItem('cf_google_sheet_url',v);
  ['googleSheetUrl','googleSheetUrlSettings'].forEach(id=>{ if($(id)) $(id).value=v; });
  setGoogleNotes('Google Sheet URL saved. Click Refresh Google Sheet after updating the workbook.');
}
function gsNumber(v){ if(v===null||v===undefined||v==='') return null; const s=String(v).replace(/,/g,'').replace(/[()]/g,m=>m==='('?'-':'').trim(); const n=Number(s); return isNaN(n)?null:n; }
function cleanText(v){ return String(v??'').replace(/\s+/g,' ').trim(); }
function detectMonthRow(matrix){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Total'];
  let best={idx:-1,count:0};
  matrix.slice(0,20).forEach((row,idx)=>{ const count=row.filter(c=>months.includes(cleanText(c).slice(0,3)) || cleanText(c)==='Total').length; if(count>best.count) best={idx,count}; });
  return best.count>=3?best.idx:-1;
}
function parseForecastSheet(name, matrix){
  const rows=matrix||[]; if(!rows.length) return null;
  let labelCol=0, anchorRow=-1;
  rows.forEach((r,ri)=>r.forEach((c,ci)=>{ if(anchorRow<0 && /Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i.test(cleanText(c))){ anchorRow=ri; labelCol=ci; }}));
  if(anchorRow<0){ rows.forEach((r,ri)=>r.forEach((c,ci)=>{ if(anchorRow<0 && /Total Inflows/i.test(cleanText(c))){ anchorRow=ri; labelCol=ci; }})); }
  if(anchorRow<0) labelCol=0;
  const monthRow=detectMonthRow(rows); const periodRow=monthRow>=0?monthRow+1:-1;
  const maxCols=Math.max(...rows.map(r=>r.length));
  const months12=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthNames=[...months12,'Total'];
  let currentMonth=''; const periods=[];
  for(let c=labelCol+1;c<maxCols;c++){
    const mh=monthRow>=0?cleanText(rows[monthRow][c]):''; const ph=periodRow>=0?cleanText(rows[periodRow][c]):'';
    const m3=mh.slice(0,3);
    if(monthNames.includes(m3)) currentMonth=m3;
    if(/^Total$/i.test(mh)) currentMonth='Total';
    const hasNumbers=rows.slice(Math.max(0,anchorRow-2), anchorRow+90).some(r=>gsNumber(r[c])!==null);
    if((currentMonth||ph||mh) && hasNumbers){ periods.push({col:c,month:currentMonth||mh||'',period:ph,key:((currentMonth||mh||'')+' '+ph).trim(),header:mh}); }
  }
  const parsedRows=[];
  rows.forEach((r,ri)=>{
    let label=cleanText(r[labelCol]);
    if(!label){ for(let c=0;c<=Math.min(labelCol+2,r.length-1);c++){ const t=cleanText(r[c]); if(t && isNaN(Number(String(t).replace(/,/g,'')))){label=t;break;} } }
    if(!label) return;
    const vals=periods.map(p=>gsNumber(r[p.col]));
    const hasVal=vals.some(v=>v!==null);
    const type=!hasVal?'section':(/^Total\b|Estimated Cash\s*(Balance|Bal)|Closing Balance|Net Movement/i.test(label)?'total':'line');
    parsedRows.push({excelRow:ri+1,label,type,values:vals});
  });
  const getVals=(pattern)=>{ const r=parsedRows.find(x=>pattern.test(x.label)); return r?r.values:periods.map(()=>0); };
  const opening=getVals(/Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i);
  const inflows=getVals(/Total Inflows/i);
  const outflows=getVals(/Total Outflows/i);
  let closing=getVals(/Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Ending Cash Balance|Closing Balance/i);
  // If the sheet label changes or the closing row is blank, calculate period closing from opening + inflows - outflows.
  closing=closing.map((v,i)=> (v!==null && v!==undefined && !isNaN(Number(v))) ? Number(v) : ((Number(opening[i])||0)+(Number(inflows[i])||0)-(Number(outflows[i])||0)) );

  // Monthly summary should contain the final month total only. Weekly columns remain available in `periods` and `rows` for detailed views.
  const monthlySummary=[];
  months12.forEach(mon=>{
    const idxs=periods.map((p,i)=>({p,i})).filter(x=>x.p.month===mon);
    if(!idxs.length) return;
    // Prefer the explicit TOT column. If missing, use the last column for that month.
    let chosen=idxs.find(x=>/^TOT$/i.test(x.p.period));
    if(!chosen) chosen=idxs[idxs.length-1];
    const i=chosen.i;
    monthlySummary.push({month:mon,period:chosen.p.period||'',opening:Number(opening[i])||0,inflows:Number(inflows[i])||0,outflows:Number(outflows[i])||0,closing:Number(closing[i])||0});
  });
  const yearOpening=monthlySummary[0]?.opening||0;
  const yearInflows=monthlySummary.reduce((s,m)=>s+(Number(m.inflows)||0),0);
  const yearOutflows=monthlySummary.reduce((s,m)=>s+(Number(m.outflows)||0),0);
  const yearClosing=monthlySummary.length?Number(monthlySummary[monthlySummary.length-1].closing)||0:yearOpening+yearInflows-yearOutflows;
  monthlySummary.push({month:'Year Total',period:'Total',opening:yearOpening,inflows:yearInflows,outflows:yearOutflows,closing:yearClosing});
  return {sheet:name,name,title:name+' Cash Flow Forecast',company:'Al Laith Group',unit:"AED '000",periods,rows:parsedRows,monthlySummary};
}
function buildGroupFromEntities(entities){
  entities=Array.isArray(entities)?entities:[];
  const months12=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlySummary=months12.map(mon=>({
    month:mon, period:'TOT',
    opening:entities.reduce((s,e)=>{ const r=(e.monthlySummary||[]).find(x=>x.month===mon)||{}; return s+(Number(r.opening)||0); },0),
    inflows:entities.reduce((s,e)=>{ const r=(e.monthlySummary||[]).find(x=>x.month===mon)||{}; return s+(Number(r.inflows)||0); },0),
    outflows:entities.reduce((s,e)=>{ const r=(e.monthlySummary||[]).find(x=>x.month===mon)||{}; return s+(Number(r.outflows)||0); },0),
    closing:entities.reduce((s,e)=>{ const r=(e.monthlySummary||[]).find(x=>x.month===mon)||{}; return s+(Number(r.closing)||0); },0)
  }));
  monthlySummary.push({
    month:'Year Total', period:'Total',
    opening:monthlySummary[0]?.opening||0,
    inflows:monthlySummary.reduce((s,m)=>s+(Number(m.inflows)||0),0),
    outflows:monthlySummary.reduce((s,m)=>s+(Number(m.outflows)||0),0),
    closing:monthlySummary[monthlySummary.length-1]?.closing||0
  });
  const base=entities[0]||{periods:[],rows:[]};
  const periods=(base.periods||[]).map(p=>({...p}));
  const labels=[]; const byLabel={};
  entities.forEach(e=>(e.rows||[]).forEach(r=>{
    const key=cleanText(r.label); if(!key) return;
    if(!byLabel[key]){ labels.push(key); byLabel[key]={label:r.label,type:r.type,values:periods.map(()=>0)}; }
    if(r.type==='section'){ byLabel[key].type='section'; return; }
    (r.values||[]).forEach((v,i)=>{ if(v!==null&&v!==undefined&&!isNaN(Number(v))) byLabel[key].values[i]=(byLabel[key].values[i]||0)+Number(v); });
    if(r.type==='total') byLabel[key].type='total';
  }));
  const rows=labels.map(k=>byLabel[k]);
  return {sheet:'GROUP',name:'Group Forecast',title:'Consolidated Group Forecast',unit:"AED '000",periods,rows,monthlySummary};
}

function reportDateDisplay(){
  const saved=localStorage.getItem('cf_report_date')||'';
  if(!saved) return '';
  const d=new Date(saved+'T00:00:00');
  if(isNaN(d)) return saved;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,' ');
}
function saveReportSettings(){
  const v=$('reportDateInput')?$('reportDateInput').value:'';
  if(v) localStorage.setItem('cf_report_date',v);
  renderSettings(); renderExecutiveSummary(); renderLiquidityView();
}
function setReportSettingsControls(){
  const v=localStorage.getItem('cf_report_date')||'';
  if($('reportDateInput')) $('reportDateInput').value=v;
  if($('reportSettingsNote')) $('reportSettingsNote').textContent = v ? ('Report Date: '+reportDateDisplay()) : 'Report date not set.';
}
function rowByLabel(matrix, pattern, startRow=0){
  for(let r=startRow;r<(matrix||[]).length;r++){
    const label=cleanText((matrix[r]||[])[0]||'');
    if(pattern.test(label)) return {row:r, values:matrix[r]};
  }
  return null;
}
function valsFromRow(row, startCol, endCol){
  const out=[];
  for(let c=startCol;c<=endCol;c++) out.push(gsNumber((row||[])[c])||0);
  return out;
}
function parseDashboardSheet(matrix){
  const rows=matrix||[];
  if(!rows.length) return null;
  const topMonthRow = rows.findIndex(r=>r.some(c=>/^Jan-\d{2}$/i.test(cleanText(c))));
  const result={raw:rows, asOf:cleanText((rows[0]||[])[3]||''), including:null, excluding:null};
  if(topMonthRow>=0){
    const months=[];
    for(let c=1;c<(rows[topMonthRow]||[]).length;c++){
      const h=cleanText(rows[topMonthRow][c]);
      if(/^[A-Z][a-z]{2}-\d{2}$/i.test(h)) months.push({col:c,label:h.slice(0,3)});
      if(/^Total$/i.test(h)) break;
    }
    const open=rowByLabel(rows,/Estimated Cash Balance Opening/i, topMonthRow);
    const inflow=rowByLabel(rows,/^Total Inflows/i, topMonthRow);
    const outflow=rowByLabel(rows,/^Total Outflows/i, topMonthRow);
    const closing=rowByLabel(rows,/Estimated Cash Balance Closing/i, topMonthRow);
    const monthlySummary=months.map(m=>({
      month:m.label,
      opening:gsNumber(open?.values?.[m.col])||0,
      inflows:gsNumber(inflow?.values?.[m.col])||0,
      outflows:gsNumber(outflow?.values?.[m.col])||0,
      closing:gsNumber(closing?.values?.[m.col])||0
    }));
    if(monthlySummary.length){
      result.including={sheet:'GROUP',name:'Group Forecast',periods:months.map(m=>({month:m.label,key:m.label,header:m.label})),rows:[],monthlySummary:[
        ...monthlySummary,
        {month:'Year Total',opening:monthlySummary[0]?.opening||0,inflows:monthlySummary.reduce((a,x)=>a+x.inflows,0),outflows:monthlySummary.reduce((a,x)=>a+x.outflows,0),closing:monthlySummary[monthlySummary.length-1]?.closing||0}
      ]};
    }
  }
  const exHeader = rows.findIndex(r=>/^Month$/i.test(cleanText((r||[])[0]||'')) && r.some(c=>/^12 months$/i.test(cleanText(c))));
  if(exHeader>=0){
    const cols=[];
    const detailCols=[];
    const monthRow=rows[exHeader]||[], dateRow=rows[exHeader+1]||[];
    for(let c=1;c<monthRow.length;c++){
      const h=cleanText(monthRow[c]);
      if(!h) continue;
      const display = /^12 months$/i.test(h) ? h : (h+(cleanText(dateRow[c])?' · '+cleanText(dateRow[c]):''));
      detailCols.push({col:c,label:h,display});
      if(/^12 months$/i.test(h)) break;
      cols.push({col:c,label:h,display});
    }
    const open=rowByLabel(rows,/^Opening\b/i, exHeader+2);
    const inflow=rowByLabel(rows,/^Inflow\b/i, exHeader+2);
    const outflow=rowByLabel(rows,/^Outflow\b/i, exHeader+2);
    const netRows=[]; rows.forEach((r,i)=>{ if(i>exHeader && /^Net Balance$/i.test(cleanText((r||[])[0]||''))) netRows.push({row:i,values:r}); });
    const closing=netRows[0]||null;
    const monthlySummary=cols.map(c=>({
      month:cleanText(monthRow[c.col])||c.label,
      display:c.display,
      opening:gsNumber(open?.values?.[c.col])||0,
      inflows:gsNumber(inflow?.values?.[c.col])||0,
      outflows:gsNumber(outflow?.values?.[c.col])||0,
      closing:gsNumber(closing?.values?.[c.col])||0
    }));
    const detailRows=[];
    const startRow=exHeader+2;
    const endRow=closing ? closing.row : Math.min(rows.length-1, exHeader+35);
    for(let r=startRow;r<=endRow;r++){
      const row=rows[r]||[];
      const label=cleanText(row[0]||'');
      if(!label) continue;
      const values=detailCols.map(c=>gsNumber(row[c.col])||0);
      const hasValues=values.some(v=>v!==0);
      if(!hasValues && !/^(Opening|Collections|Others|Qiddiya|Inflow|Suppliers|Proj|Salaries|Manpower|Rent|Term Loan|Visa|Guarantees|Taxes|Insurances|Credit Cards|Other|Dividend|Capex|Outflow|Net Balance)/i.test(label)) continue;
      const type=/^(Inflow|Outflow|Net Balance|Opening)$/i.test(label) ? 'total' : (/^(Collections|Others|Qiddiya|Suppliers|Proj\. Exp|Salaries|Manpower|Rent|Term Loan|Visa|Guarantees|Taxes|Insurances|Credit Cards|Other Fixed Payments|Dividend|Other Variables|Capex)$/i.test(label) ? 'detail' : 'detail');
      detailRows.push({label,values,type});
    }
    result.excluding={cols, detailCols, monthlySummary, detailRows, rows:{
      opening:open?.values||[], inflow:inflow?.values||[], outflow:outflow?.values||[], closing:closing?.values||[]
    }};
  }
  return result;
}
function parseQiddiyaBalance(matrix){
  const rows=matrix||[];
  if(!rows.length) return null;

  /*
   * Qiddiya Balance uses the same two-row period headings as ALG-CB:
   * row 1 = month / weekly heading, row 2 = date, Forecast or TOT.
   * Merged Google Sheet headings may export blank cells, so carry the last
   * non-blank heading forward while retaining every physical data column.
   */
  const headerIdx=rows.findIndex(r=>(r||[]).some(c=>/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:-|\sW)/i.test(cleanText(c))));
  if(headerIdx<0) return null;

  const header=rows[headerIdx]||[];
  const periodRow=rows[headerIdx+1]||[];
  const open=rowByLabel(rows,/^Opening$/i, headerIdx+1);
  const inflow=rowByLabel(rows,/^Inflow$/i, headerIdx+1);
  const outflow=rowByLabel(rows,/^Outflow$/i, headerIdx+1);
  const close=rowByLabel(rows,/^Closing/i, headerIdx+1);

  const maxCols=Math.max(
    header.length, periodRow.length,
    (open?.values||[]).length, (inflow?.values||[]).length,
    (outflow?.values||[]).length, (close?.values||[]).length
  );

  const cols=[];
  let carriedHeader='';
  for(let c=1;c<maxCols;c++){
    const rawHeader=cleanText(header[c]||'');
    const period=cleanText(periodRow[c]||'');
    if(rawHeader) carriedHeader=rawHeader;

    const hasData=[open,inflow,outflow,close].some(r=>{
      const v=r?.values?.[c];
      return v!==undefined && v!==null && cleanText(v)!=='';
    });
    if(!carriedHeader && !period && !hasData) continue;

    const effectiveHeader=rawHeader||carriedHeader;
    const month=(effectiveHeader.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)||[])[1]||effectiveHeader.slice(0,3);
    const key=[effectiveHeader,period].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    cols.push({col:c,index:cols.length,label:month.slice(0,3),header:effectiveHeader,period,key});
  }

  // VAT recovery / economic benefit is information only in the dashboard KPI.
  const vatRow=rows.find(r=>String(r[0]||'').toLowerCase().includes('vat recovery')) || [];
  let vatDisplayBenefit=0;
  for(let vi=1; vi<vatRow.length; vi++){
    const n=gsNumber(vatRow[vi]);
    if(n){ vatDisplayBenefit=n; break; }
  }
  if(!vatDisplayBenefit) vatDisplayBenefit=gsNumber((rows[11]||[])[1])||0;
  const vatBenefit=0;

  return {cols, vatBenefit, vatDisplayBenefit, monthlySummary:cols.map((c,i)=>({
    index:i, col:c.col, month:c.label, header:c.header, period:c.period, key:c.key,
    opening:gsNumber(open?.values?.[c.col])||0,
    inflows:gsNumber(inflow?.values?.[c.col])||0,
    outflows:gsNumber(outflow?.values?.[c.col])||0,
    closing:gsNumber(close?.values?.[c.col])||0
  }))};
}
function lastNonZero(arr, field){
  const a=(arr||[]).filter(x=>Number(x[field])!==0);
  return a.length?a[a.length-1]:((arr||[])[(arr||[]).length-1]||{});
}

function getQiddiyaMonth(qd, mon){
  const qsum=(qd&&qd.monthlySummary)||[];
  return qsum.find(x=>String(x.month||'').slice(0,3).toLowerCase()===String(mon||'').slice(0,3).toLowerCase())||{};
}
function getGroupMonth(group, mon){
  const gsum=monthsOnly((group&&group.monthlySummary)||[]);
  return gsum.find(x=>x.month===mon)||{};
}
function qiddiyaVatBenefit(){
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA||{};
  return Number(qd.vatBenefit)||0;
}
function qiddiyaVatDisplayBenefit(){
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA||{};
  return Number(qd.vatDisplayBenefit)||Number(qd.vatBenefit)||0;
}
function vatBenefitTargetIndex(periods){
  const benefit=qiddiyaVatBenefit();
  if(!benefit || !(periods||[]).length) return -1;
  const rpt=getCurrentReportingPeriodInfo();
  if(!rpt) return -1;
  const curMonth=String(rpt.period.month||rpt.period.header||'').slice(0,3);
  const sameMonth=(periods||[]).map((p,i)=>({p,i})).filter(x=>String(x.p.month||x.p.header||'').slice(0,3)===curMonth);
  const forecast=sameMonth.find(x=>/Forecast/i.test(cleanText(x.p.period||x.p.header||x.p.key||'')));
  if(forecast) return forecast.i;
  const after=sameMonth.find(x=>x.i>rpt.index);
  if(after) return after.i;
  return rpt.index;
}
function groupMonthColumnMap(group){
  const months12=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const periods=(group&&group.periods)||[];
  const map={};
  months12.forEach(mon=>{
    const idxs=periods.map((p,i)=>({p,i})).filter(x=>String(x.p.month||'').slice(0,3)===mon);
    if(!idxs.length) return;
    let chosen=idxs.find(x=>/^TOT$/i.test(String(x.p.period||'')));
    if(!chosen) chosen=idxs[idxs.length-1];
    map[mon]=chosen.i;
  });
  return map;
}
function liquidityAdjustedSummary(){
  const group=FORECAST_DATA.group||{};
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA;
  const months12=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months12.map(mon=>{
    const g=getGroupMonth(group,mon);
    const q=getQiddiyaMonth(qd,mon);
    return {
      month:mon,
      groupOpening:Number(g.opening)||0,
      groupInflows:Number(g.inflows)||0,
      groupOutflows:Number(g.outflows)||0,
      groupClosing:Number(g.closing)||0,
      qOpening:Number(q.opening)||0,
      qInflows:Number(q.inflows)||0,
      qOutflows:Number(q.outflows)||0,
      qClosing:Number(q.closing)||0,
      opening:(Number(g.opening)||0)-(Number(q.opening)||0),
      inflows:(Number(g.inflows)||0)-(Number(q.inflows)||0),
      outflows:(Number(g.outflows)||0)-(Number(q.outflows)||0),
      closing:(Number(g.closing)||0)-(Number(q.closing)||0)
    };
  });
}

function parsePeriodDate(text){
  text=cleanText(text||'');
  if(!text) return null;
  let m=text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(!m) return null;
  let d=Number(m[1]), mo=Number(m[2])-1, y=Number(m[3]);
  if(y<100) y+=2000;
  const dt=new Date(y,mo,d);
  if(isNaN(dt) || dt.getDate()!==d || dt.getMonth()!==mo) return null;
  return dt;
}
function formatPeriodDate(dt){
  if(!dt || isNaN(dt)) return '';
  return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,' ');
}
function periodShortLabel(p){
  const mon=String(p.month||p.header||'').slice(0,3);
  const period=cleanText(p.period||'');
  const dt=parsePeriodDate(period);
  if(dt) return (p.header||mon)+' · '+formatPeriodDate(dt);
  if(period) return (p.header||mon)+' · '+period;
  return p.header||mon||'';
}
function getCurrentReportingPeriodInfo(){
  const group = FORECAST_DATA.algCb || FORECAST_DATA.group || {};
  const periods = group.periods || [];
  const rptDate = parsePeriodDate(reportDateDisplay());

  if (!periods.length || !rptDate) return null;

  let chosen = null;

  periods.forEach((p, i) => {
    const dt = parsePeriodDate(p.period || p.key || '');
    if (!dt) return;

    if (
      dt.getFullYear() === rptDate.getFullYear() &&
      dt.getMonth() === rptDate.getMonth() &&
      dt.getDate() === rptDate.getDate()
    ) {
      chosen = {
        index: i,
        period: p,
        date: dt,
        label: periodShortLabel(p)
      };
    }
  });

  return chosen;
}
function groupRowValues(pattern){
  const group=FORECAST_DATA.algCb || FORECAST_DATA.group || {};
  const row=(group.rows||[]).find(r=>pattern.test(cleanText(r.label||'')));
  return row?(row.values||[]):[];
}
function liquidityAtPeriodIndex(idx){
  const group=FORECAST_DATA.algCb || FORECAST_DATA.group || {};
  const p=(group.periods||[])[idx]||{};
  const mon=String(p.month||p.header||'').slice(0,3);
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA||{};
  const qsum=qd.monthlySummary||[];

  /*
   * The Qiddiya Balance sheet is now physically aligned to ALG-CB.
   * Use the same column index first. If a future sheet edit breaks that
   * alignment, fall back to a normalized heading/period match.
   */
  const norm=v=>cleanText(v||'').toLowerCase().replace(/\s+/g,' ').trim();
  const pHeader=norm(p.header||p.month||'');
  const pPeriod=norm(p.period||'');
  let q=qsum[idx]||{};
  const qHeader=norm(q.header||q.month||'');
  const qPeriod=norm(q.period||'');
  const indexLooksAligned=(
    (!pHeader || !qHeader || pHeader.slice(0,3)===qHeader.slice(0,3)) &&
    (!pPeriod || !qPeriod || pPeriod===qPeriod)
  );
  if(!indexLooksAligned){
    q=qsum.find(x=>{
      const xHeader=norm(x.header||x.month||'');
      const xPeriod=norm(x.period||'');
      return xHeader.slice(0,3)===pHeader.slice(0,3) && xPeriod===pPeriod;
    })||{};
  }

  const vatBenefit=qiddiyaVatBenefit();
  const periods=(group.periods||[]);
  const vatIdx=vatBenefitTargetIndex(periods);
  const applyVatToInflow=(vatIdx===idx);
  const applyVatToClosing=(vatIdx>=0 && idx>=vatIdx);
  const openingVals=groupRowValues(/Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i);
  const inflowVals=groupRowValues(/^Total Inflows$/i);
  const outflowVals=groupRowValues(/^Total Outflows$/i);
  const closingVals=groupRowValues(/Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Ending Cash Balance|Closing Balance/i);
  const gOpening=Number(openingVals[idx])||0;
  const gInflows=Number(inflowVals[idx])||0;
  const gOutflows=Number(outflowVals[idx])||0;
  let gClosing=Number(closingVals[idx]);
  if(!Number.isFinite(gClosing)) gClosing=gOpening+gInflows-gOutflows;

  const qOpening=Number(q.opening)||0;
  const qInflows=(Number(q.inflows)||0)+(applyVatToInflow?vatBenefit:0);
  const qOutflows=Number(q.outflows)||0;
  const qClosing=(Number(q.closing)||0)+(applyVatToClosing?vatBenefit:0);

  return {
    period:p,index:idx,month:mon,qiddiyaIndex:q.index,
    groupOpening:gOpening,groupInflows:gInflows,groupOutflows:gOutflows,groupClosing:gClosing,
    qOpening,qInflows,qOutflows,qClosing,
    opening:gOpening-qOpening,
    inflows:gInflows-qInflows,
    outflows:gOutflows-qOutflows,
    closing:gClosing-qClosing
  };
}
function liquidityInitialOpening(){
  const first=liquidityAtPeriodIndex(0);
  return Number(first.opening)||0;
}
function liquidityDetailPeriodRows(){
  const group = FORECAST_DATA.algCb || FORECAST_DATA.group || {};
  const periods = group.periods || [];
  const rows = [];

  const addRow = (label, values, type = 'line') => {
    rows.push({ label, values, type });
  };

  if (!periods.length) {
    return { periods: [], rows: [] };
  }

  /*
   * Base adjusted data:
   * ALG-CB less the corresponding Qiddiya Balance figures.
   */
  const adj = periods.map((p, i) => liquidityAtPeriodIndex(i));

  /*
   * Restricted Cash – Qiddiya Project:
   * Read B13 through qiddiyaVatDisplayBenefit().
   * Keep its original positive or negative sign.
   */
  const restrictedCash = qiddiyaVatDisplayBenefit();
  const reportDate = reportingDateObject();

const currentMonth = reportDate
  ? reportDate.toLocaleString('en-US', { month: 'short' })
  : '';

  let restrictedIdx = periods.findIndex(p =>
    String(p.month || p.header || '').slice(0, 3) === currentMonth &&
    /Forecast/i.test(
      cleanText(p.period || p.header || p.key || '')
    )
  );

  /*
   * Fallback if the current-month Forecast column was not identified.
   */
  if (restrictedIdx < 0) {
    restrictedIdx = periods.findIndex(p =>
      /Forecast/i.test(
        cleanText(p.period || p.header || p.key || '')
      )
    );
  }

  const restrictedVals = periods.map((_, i) =>
    i === restrictedIdx ? Number(restrictedCash) || 0 : 0
  );

  /*
   * The ALG-CB Total Outflows row currently excludes the separate
   * Total Supplier Payments subtotal, so include that subtotal.
   */
  const supplierTotal = groupRowValues(/^Total Supplier Payments$/i);

  const totalInflows = adj.map((x, i) =>
    (Number(x.inflows) || 0) +
    (Number(restrictedVals[i]) || 0)
  );

  const totalOutflows = adj.map((x, i) =>
    (Number(x.outflows) || 0) +
    (Number(supplierTotal[i]) || 0)
  );

  /*
   * Each displayed ALG-CB column is calculated independently against the
   * matching Qiddiya Balance column. Monthly TOT columns remain summaries;
   * they are not inserted into a rolling weekly chain.
   *
   * Closing is reconciled to the displayed movements, including the separate
   * Total Supplier Payments subtotal, so Opening + Inflows - Outflows always
   * agrees with Closing for weekly, forecast and monthly TOT columns.
   */
  const isGrandTotal = p =>
    /^Total$/i.test(cleanText(p.month || p.header || ''));

  const openingValues = adj.map(x => Number(x.opening) || 0);
  const closingValues = periods.map((p, i) => {
    if (isGrandTotal(p)) return Number(adj[i].closing) || 0;
    return (Number(openingValues[i]) || 0) +
      (Number(totalInflows[i]) || 0) -
      (Number(totalOutflows[i]) || 0);
  });

  addRow(
    'Estimated Cash Balance Opening',
    openingValues,
    'total'
  );

  const important =
    /Estimated Cash|Total Inflows|Total Outflows|Collections|Debt Aging|Projected|Advance|Returned|Intercompany|Borrowings|Others|Supplier|Sub Contractors|Proj Exp|Payment for Fixed Services|Payments in Advance|Forecast for supplier|Salaries|Manpower|Telecommunication|Utility|Rent|Auto Loan|Mortgage|Term Loan|Salik|Rta|Fuel|Visa|Bank Charges|Restricted cash|Vat|Tax|Trade License|Sponsorship|Audit|Insurance|Credit Cards|Petty Cash|IT|Bonus|Final Sett|Loans|Staff Ticket|Entertainment|Marketing|Legal|Dividend|Capex|Capital Expenses/i;

  (group.rows || []).forEach(r => {
    const label = cleanText(r.label || '');

    if (!label) return;

    /*
     * Qiddiya is handled through the Qiddiya Balance adjustment,
     * so do not repeat its original ALG-CB lines.
     */
    if (/Project Qiddiya Inflow/i.test(label)) return;
    if (/Project Qiddiya Outflow/i.test(label)) return;

    if (
      /Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i.test(label)
    ) return;

    if (
      /Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Ending Cash Balance|Closing Balance/i.test(label)
    ) return;

    if (/^Total Inflows$/i.test(label)) {
      if (restrictedIdx >= 0 && Number(restrictedCash) !== 0) {
        addRow(
          'Restricted Cash – Qiddiya Project',
          restrictedVals,
          'line'
        );
      }

      addRow(
        'Total Inflows (excluding Qiddiya)',
        totalInflows,
        'total'
      );

      return;
    }

    if (/^Total Outflows$/i.test(label)) {
      addRow(
        'Total Outflows (excluding Qiddiya)',
        totalOutflows,
        'total'
      );

      return;
    }

    if (r.type === 'section') {
      if (
        /Estimated Cash Inflows|Estimated Cash Outflows|Suppliers|Payment Of Operating|Fixed Cash|Variable Cash|Capex/i.test(label)
      ) {
        addRow(
          label,
          periods.map(() => null),
          'section'
        );
      }

      return;
    }

    if (!important.test(label)) return;

    const vals = periods.map((p, i) =>
      Number((r.values || [])[i]) || 0
    );

    if (vals.some(v => Number(v) !== 0)) {
      addRow(label, vals, r.type || 'line');
    }
  });

  addRow(
    'Estimated Cash Balance Closing',
    closingValues,
    'total'
  );

  return { periods, rows };
}
function liquidityDetailPeriodRows_backup(){
  const group=FORECAST_DATA.algCb || FORECAST_DATA.group || {};
  const periods=(group.periods||[]);
  const rows=[];
  const addRow=(label, values, type='line')=>rows.push({label,values,type});
  if(!periods.length) return {periods:[], rows:[]};
  const adj=periods.map((p,i)=>liquidityAtPeriodIndex(i));
  const vatBenefit=qiddiyaVatBenefit();
  const vatIdx=vatBenefitTargetIndex(periods);
  addRow('Estimated Cash Balance Opening', adj.map(x=>x.opening), 'total');
  const important = /Estimated Cash|Total Inflows|Total Outflows|Collections|Debt Aging|Projected|Advance|Returned|Intercompany|Borrowings|Others|Supplier|Sub Contractors|Proj Exp|Payment for Fixed Services|Payments in Advance|Forecast for supplier|Salaries|Manpower|Telecommunication|Utility|Rent|Auto Loan|Mortgage|Term Loan|Salik|Rta|Fuel|Visa|Bank Charges|Restricted cash|Vat|Tax|Trade License|Sponsorship|Audit|Insurance|Credit Cards|Petty Cash|IT|Bonus|Final Sett|Loans|Staff Ticket|Entertainment|Marketing|Legal|Dividend|Capex|Capital Expenses/i;
  let inOutflowSection=false;
  (group.rows||[]).forEach(r=>{
    const label=cleanText(r.label||'');
    if(!label) return;
    if(/Project Qiddiya Inflow/i.test(label)) return;
    if(/Project Qiddiya Outflow/i.test(label)) return;
    if(/Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i.test(label)) return;
    if(/Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Ending Cash Balance|Closing Balance/i.test(label)) return;
    if(/^Total Inflows$/i.test(label)){
  const restrictedCash = qiddiyaVatDisplayBenefit();
  const restrictedIdx = periods.findIndex(p =>
    /Forecast/i.test(cleanText(p.period || p.header || p.key || ''))
);
  const restrictedVals = periods.map((_, i) => i === restrictedIdx ? restrictedCash : 0);

  if (restrictedCash && restrictedIdx >= 0) {
    addRow('Restricted Cash – Qiddiya Project', restrictedVals, 'line');
  }

  addRow(
    'Total Inflows (excluding Qiddiya)',
    adj.map((x, i) => x.inflows + (restrictedVals[i] || 0)),
    'total'
  );

  return;
}
    if(/^Total Outflows$/i.test(label)){
  const supplierTotal = groupRowValues(/^Total Supplier Payments$/i);
  addRow(
    'Total Outflows (excluding Qiddiya)',
    adj.map((x, i) => x.outflows + (Number(supplierTotal[i]) || 0)),
    'total'
  );
  return;
}
    if(!important.test(label)) return;
    let vals=periods.map((p,i)=>Number((r.values||[])[i])||0);
    // VAT recovery benefit / economic benefit is a restricted-cash/liquidity adjustment, not an operating outflow.
    // Therefore it is shown only in the inflow side Others line and never in the outflow Others row.
    if(/^Others$/i.test(label) && !inOutflowSection && vatBenefit && vatIdx>=0){
      vals=vals.map((v,i)=>i===vatIdx ? v-vatBenefit : v);
      addRow('Others (incl. VAT recovery benefit adjustment)', vals, r.type||'line');
      return;
    }
    if(vals.some(v=>Number(v)!==0)) addRow(label, vals, r.type||'line');
  });
  addRow('Estimated Cash Balance Closing', adj.map(x=>x.closing), 'total');
  return {periods, rows};
}
function liquidityColumnSelection(periods){
  const modeEl=$('liquidityViewMode');
  const mode=modeEl?modeEl.value:'current';
  const monthOrder={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const isTot=(p)=>/\bTOT\b|^Total$/i.test(cleanText(p.period||p.header||p.key||''));
  const isForecast=(p)=>/Forecast/i.test(cleanText(p.period||p.header||p.key||''));
  const byMonth={};
  periods.forEach((p,i)=>{ const m=String(p.month||p.header||'').slice(0,3); if(monthOrder[m]!==undefined){ if(!byMonth[m]) byMonth[m]=[]; byMonth[m].push(i); } });
  const totIdxFor=(m)=> (byMonth[m]||[]).find(i=>isTot(periods[i]));
  if(mode==='weekly'){
    if($('liquidityViewNote')) $('liquidityViewNote').textContent='Weekly Detail shows all weekly, forecast and total columns exactly as read from ALG-CB.';
    return periods.map((_,i)=>i);
  }
  if(mode==='monthly'){
    const selected=[];
    Object.keys(monthOrder).forEach(m=>{ const idx=totIdxFor(m); if(idx!==undefined) selected.push(idx); });
    if($('liquidityViewNote')) $('liquidityViewNote').textContent='Monthly TOT Only shows only the monthly total columns for quick management review.';
    return selected.length?selected:periods.map((_,i)=>i);
  }
  // Current reporting period: completed months = TOT, current month = weekly columns up to reporting date + forecast + TOT, future months = TOT
  const rpt=getCurrentReportingPeriodInfo();
  if(!rpt){
    const selected=[]; Object.keys(monthOrder).forEach(m=>{ const idx=totIdxFor(m); if(idx!==undefined) selected.push(idx); });
    if($('liquidityViewNote')) $('liquidityViewNote').textContent='Current Reporting Period could not find a reporting date, so monthly totals are shown.';
    return selected.length?selected:periods.map((_,i)=>i);
  }
  const curMonth=String(rpt.period.month||rpt.period.header||'').slice(0,3);
  const curOrder=monthOrder[curMonth];
  const selected=[];
  Object.keys(monthOrder).forEach(m=>{
    const mOrder=monthOrder[m];
    const indices=byMonth[m]||[];
    if(!indices.length) return;
    if(mOrder<curOrder || mOrder>curOrder){
      const idx=totIdxFor(m); if(idx!==undefined) selected.push(idx);
      return;
    }
    // Current month: show weekly/current columns up to reporting period, plus forecast and total.
    indices.forEach(i=>{
      const p=periods[i];
      if(i<=rpt.index || isForecast(p) || isTot(p)) selected.push(i);
    });
  });
  if($('liquidityViewNote')) $('liquidityViewNote').textContent='Current Reporting Period shows completed months as totals, the active month by week/forecast, and future months as totals.';
  return [...new Set(selected)].filter(i=>i>=0 && i<periods.length).sort((a,b)=>a-b);
}
function renderLiquidityPeriodTable(){
  const pack=liquidityDetailPeriodRows();
  const periods=pack.periods||[];
  const detailRows=pack.rows||[];
  if(!periods.length || !detailRows.length) return '<div class="empty">Refresh Google Sheet after Apps Script includes ALG-CB and Qiddiya Balance tabs.</div>';
  const selected=liquidityColumnSelection(periods);
  const shownPeriods=selected.map(i=>periods[i]);
  const headers=shownPeriods.map(p=>`<th>${escapeHtml(periodShortLabel(p))}</th>`).join('')+'<th>Total / Closing</th>';
  const body=detailRows.map(r=>{
    if(r.type==='section') return `<tr class="section"><td colspan="${shownPeriods.length+2}">${escapeHtml(r.label)}</td></tr>`;
    const lc=(r.label||'').toLowerCase();
    const klass=(/inflow|collections|advance|borrowings|receipts|others/.test(lc) && !/outflow/.test(lc))?'pos':(/outflow|suppliers|proj|salaries|manpower|rent|loan|visa|tax|insurance|credit|dividend|capex|payments|variables|guarantees/.test(lc)?'neg':'');
    const allVals=(r.values||[]).map(v=>Number(v)||0);
    const vals=selected.map(i=>allVals[i]||0);
    const lastVal=allVals.length?allVals[allVals.length-1]:0;
    const total=/opening/i.test(r.label)?(allVals[0]||0):(/closing|balance closing/i.test(r.label)?lastVal:(/outflow|inflow|collections|others|payments|salaries|supplier|capex|dividend|rent|loan|tax|insurance|credit/i.test(lc)?allVals.reduce((a,b)=>a+b,0):0));
    const rowClass=r.type==='total'?' class="total"':'';
    return `<tr${rowClass}><td class="rowhead">${escapeHtml(r.label)}</td>${vals.map(v=>`<td class="num ${klass}">${fmt(v)}</td>`).join('')}<td class="num ${klass}">${fmt(total)}</td></tr>`;
  }).join('');
  return `<table class="sticky-report"><thead><tr><th>Cash flow excluding Qiddiya</th>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}
function liquidityDetailRows(){
  const group=FORECAST_DATA.group||{};
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA;
  const months12=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const colMap=groupMonthColumnMap(group);
  const adjusted=liquidityAdjustedSummary();
  const important = /Estimated Cash|Total Inflows|Total Outflows|Collections|Debt Aging|Projected|Advance|Returned|Intercompany|Borrowings|Others|Supplier|Sub Contractors|Proj Exp|Payment for Fixed Services|Payments in Advance|Forecast for supplier|Salaries|Manpower|Telecommunication|Utility|Rent|Auto Loan|Mortgage|Term Loan|Salik|Rta|Fuel|Visa|Bank Charges|Restricted cash|Vat|Tax|Trade License|Sponsorship|Audit|Insurance|Credit Cards|Petty Cash|IT|Bonus|Final Sett|Loans|Staff Ticket|Entertainment|Marketing|Legal|Dividend|Capex|Capital Expenses/i;
  const rows=[];
  const addRow=(label, values, type='line')=>rows.push({label,values,type});
  addRow('Estimated Cash Balance Opening', adjusted.map(x=>x.opening), 'total');
  let sectionAdded=false;
  ((group.rows)||[]).forEach(r=>{
    const label=cleanText(r.label||'');
    if(!label) return;
    if(/Project Qiddiya Inflow/i.test(label)) return;
    if(/Project Qiddiya Outflow/i.test(label)) return;
    if(/Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i.test(label)) return;
    if(/Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Ending Cash Balance|Closing Balance/i.test(label)) return;
    if(/^Total Inflows$/i.test(label)){
      addRow('Total Inflows (excluding Qiddiya)', adjusted.map(x=>x.inflows), 'total');
      return;
    }
    if(/^Total Outflows$/i.test(label)){
      addRow('Total Outflows (excluding Qiddiya)', adjusted.map(x=>x.outflows), 'total');
      return;
    }
    if(r.type==='section'){
      if(/Estimated Cash Inflows|Estimated Cash Outflows|Suppliers|Payment Of Operating|Fixed Cash|Variable Cash|Capex/i.test(label)){
        addRow(label, months12.map(()=>null), 'section');
      }
      return;
    }
    if(!important.test(label)) return;
    const vals=months12.map(mon=>{
      const idx=colMap[mon];
      return idx===undefined?0:(Number((r.values||[])[idx])||0);
    });
    if(!vals.some(v=>Number(v)!==0)) return;
    addRow(label, vals, r.type||'line');
  });
  addRow('Estimated Cash Balance Closing', adjusted.map(x=>x.closing), 'total');
  return rows;
}
function reportingDateObject(){
  const saved = localStorage.getItem('cf_report_date') || '';
  if (saved) {
    const d = new Date(saved + 'T00:00:00');
    if (!isNaN(d)) return d;
  }

  const display = reportDateDisplay();
  const parsed = new Date(display);
  return isNaN(parsed) ? null : parsed;
}

function sameDay(a, b){
  return a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function groupCashAtReportingDate(){
  const group = FORECAST_DATA.algCb || {};
  const rptDate = reportingDateObject();

  if (!group.periods || !group.rows || !rptDate) return null;

  let idx = -1;

  group.periods.forEach((p, i) => {
    const dt = parsePeriodDate(p.period || p.key || '');
    if (sameDay(dt, rptDate)) idx = i;
  });

  if (idx < 0) return null;

  const row = group.rows.find(r =>
    /Estimated Cash Bal At The End Of The Period/i.test(cleanText(r.label || ''))
  );

  if (!row) return null;

  return Number((row.values || [])[idx]) || null;
}

function qiddiyaCashAtReportingDate(){
  const qd = FORECAST_DATA.qiddiyaData || {};
  const rptDate = reportingDateObject();

  if (!qd.monthlySummary || !rptDate) return null;

  const rptMonth = rptDate.toLocaleString('en-US', { month: 'short' });
  const rptDateText = rptDate.toLocaleDateString('en-GB');

  const match = qd.monthlySummary.find(x =>
    cleanText(x.period || '') === cleanText(rptDateText) ||
    (
      cleanText(x.month || '') === cleanText(rptMonth) &&
      cleanText(x.header || '').includes('W3')
    )
  );

  return match ? Number(match.closing) || null : null;
}
function renderLiquidityView(){
  if(!$('liquidityKpis')) return;
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA;
  const adjusted=liquidityAdjustedSummary();
  const reportInfo=getCurrentReportingPeriodInfo();
  const reportPeriod=reportInfo ? liquidityAtPeriodIndex(reportInfo.index) : null;
  const nonZeroAdj=adjusted.filter(x=>Number(x.groupClosing)!==0 || Number(x.qClosing)!==0 || Number(x.closing)!==0);
  const last=reportPeriod || (nonZeroAdj.length?nonZeroAdj[nonZeroAdj.length-1]:adjusted[adjusted.length-1]||{});
  const groupCash = groupCashAtReportingDate() || Number(last.groupClosing) || 0;
  const qiddiyaCashByDate = qiddiyaCashAtReportingDate();
const qiddiyaCash = qiddiyaCashByDate !== null ? qiddiyaCashByDate : (Number(last.qClosing)||0);
  const vatBenefit=qiddiyaVatDisplayBenefit();
  const liquidCash=groupCash-qiddiyaCash;
  const liquidOpening=liquidityInitialOpening();
  const rdate=(reportInfo&&reportInfo.date)?formatPeriodDate(reportInfo.date):reportDateDisplay();
  const rptLabel=reportInfo?('Reporting period: '+reportInfo.label+' · '):'';
  if($('liquidityAsOf')) $('liquidityAsOf').textContent = (rdate?'As at '+rdate+' · ':'')+rptLabel+'Liquid cash available for use is calculated from the ALG-CB consolidated detailed cash-flow sheet less the Qiddiya Balance tab. It deducts Qiddiya opening, inflows, outflows and closing balances only for this liquidity view.';
  if(!FORECAST_DATA.algCb && $('liquidityAsOf')) $('liquidityAsOf').textContent += ' Note: ALG-CB is not yet detected, so the dashboard is temporarily using the existing group forecast as fallback.';

  $('liquidityKpis').innerHTML=[
    ['Liquid Opening Cash',fmt(liquidOpening),'Opening cash excluding Qiddiya',''],
    ['Group Cash incl. Qiddiya',fmt(groupCash),'Reporting date Group position',''],
    ['Less: Qiddiya cash',fmt(qiddiyaCash),'Per Qiddiya Balance tab','neg'],
    ['VAT Recovery Benefit',fmt(vatBenefit),'Information only · Qiddiya Payable B13','neg'],
    ['Reporting Date Closing',fmt(liquidCash),'Liquid cash available',cls(liquidCash)]
  ].map(k=>`<div class="card kpi liq-card"><div class="lbl">${k[0]}</div><div class="val num ${k[3]}">${k[1]}</div><div class="meta">${k[2]}</div></div>`).join('');

  $('liquidityBridge').innerHTML=`<table class="comparison-table"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
    <tr><td class="rowhead">Opening liquid cash excluding Qiddiya</td><td class="num">${fmt(liquidOpening)}</td></tr>
    <tr><td class="rowhead">Group closing cash including Qiddiya at reporting date</td><td class="num">${fmt(groupCash)}</td></tr>
    <tr><td class="rowhead">Less: Qiddiya cash balance at reporting date</td><td class="num neg">${fmt(qiddiyaCash)}</td></tr>
    <tr><td class="rowhead">VAT recovery benefit / economic benefit (information only)</td><td class="num neg">${fmt(vatBenefit)}</td></tr>
    <tr><td class="rowhead">Reporting date liquid closing cash</td><td class="num ${cls(liquidCash)}">${fmt(liquidCash)}</td></tr>
  </tbody></table>`;

  $('liquiditySummary').innerHTML = renderLiquidityPeriodTable();


  const qsum=(qd&&qd.monthlySummary)||[];
  if(qsum.length){
    const headers=qsum.map(x=>`<th>${escapeHtml(x.header||x.month)}</th>`).join('');
    const row=(label,field,klass='')=>`<tr><td class="rowhead">${label}</td>${qsum.map(x=>`<td class="num ${klass}">${fmt(Number(x[field])||0)}</td>`).join('')}</tr>`;
    $('qiddiyaReference').innerHTML=`<table><thead><tr><th>Qiddiya Balance</th>${headers}</tr></thead><tbody>
      ${row('Opening','opening')}
      ${row('Project Qiddiya Inflow','inflows','pos')}
      ${row('Project Qiddiya Outflow','outflows','neg')}
      ${qiddiyaVatDisplayBenefit()?`<tr><td class="rowhead">VAT recovery benefit / economic benefit (B13)</td>${qsum.map((x,i)=>`<td class="num neg">${i===0?fmt(qiddiyaVatDisplayBenefit()):fmt(0)}</td>`).join('')}</tr>`:''}
      ${row('Closing','closing')}
    </tbody></table>`;
  }else{
    $('qiddiyaReference').innerHTML='<div class="empty">Refresh Google Sheet after Apps Script includes the Qiddiya Balance tab.</div>';
  }
}



/* ---------------- Google Sheet API v24: scoped loading ---------------- */
window.GOOGLE_SHEET_SCOPE_CACHE = window.GOOGLE_SHEET_SCOPE_CACHE || {};
window.GOOGLE_SHEET_RAW_PAYLOAD = window.GOOGLE_SHEET_RAW_PAYLOAD || {version:'V24.0',sheets:{}};

function googleScopeUrl(url, scope){
  const sep=url.includes('?')?'&':'?';
  return url+sep+'scope='+encodeURIComponent(scope||'core');
}
function mergeGoogleSheetPayload(base, incoming){
  const out=base&&typeof base==='object'?base:{sheets:{}};
  if(!out.sheets) out.sheets={};
  const src=(incoming&&incoming.sheets)||{};
  Object.keys(src).forEach(k=>{ out.sheets[k]=src[k]; });
  if(incoming&&incoming.version) out.version=incoming.version;
  if(incoming&&incoming.lastUpdated) out.lastUpdated=incoming.lastUpdated;
  if(incoming&&incoming.scope) out.scope=incoming.scope;
  return out;
}
async function loadGoogleSheetScope(scope, options){
  options=options||{};
  const url=getGoogleSheetUrlInput();
  if(!url) throw new Error('Google Apps Script URL is not configured.');

  const cache=window.GOOGLE_SHEET_SCOPE_CACHE;
  if(!options.force && cache[scope]){
    window.GOOGLE_SHEET_RAW_PAYLOAD=mergeGoogleSheetPayload(window.GOOGLE_SHEET_RAW_PAYLOAD,cache[scope]);
    window.dispatchEvent(new CustomEvent('googleSheetPayloadReady',{detail:window.GOOGLE_SHEET_RAW_PAYLOAD}));
    return cache[scope];
  }

  const payload=await loadJsonp(googleScopeUrl(url,scope));
  cache[scope]=payload;
  window.GOOGLE_SHEET_RAW_PAYLOAD=mergeGoogleSheetPayload(window.GOOGLE_SHEET_RAW_PAYLOAD,payload);
  window.dispatchEvent(new CustomEvent('googleSheetPayloadReady',{detail:window.GOOGLE_SHEET_RAW_PAYLOAD}));
  return payload;
}
window.loadGoogleSheetScope=loadGoogleSheetScope;

function normalizeGooglePayload(json){
  if(json.entities&&json.group) return json;
  const sheets=json.sheets||json; const entities=[];
  SHEET_IMPORT_NAMES.forEach(name=>{ if(Array.isArray(sheets[name])){ const parsed=parseForecastSheet(name,sheets[name]); if(parsed) entities.push(parsed); } });
  if(!entities.length) throw new Error('No recognised business unit sheets were found in the API response.');
  const dashboardData = parseDashboardSheet(sheets['Dashboard']||sheets['DASHBOARD']||[]);
  const qiddiyaData = parseQiddiyaBalance(sheets['Qiddiya Balance']||sheets['QIDDIYA BALANCE']||[]);
  // ALG-CB is the preferred consolidated detailed cash-flow sheet.
  // It should be a total/consolidation of ALPS-CB, ALICLER-CB, SS-CB, OMAN-CB, KSA-CB, ALPS BR-CB and ALPS UZ-CB.
  // The Liquidity Excl. Qiddiya page then deducts only the Qiddiya Balance tab opening/inflow/outflow/closing.
  const algCb = parseForecastSheet('ALG-CB', sheets['ALG-CB']||sheets['ALG CB']||sheets['ALGCB']||[]);
  const group = algCb || (dashboardData && dashboardData.including && dashboardData.including.monthlySummary.length
    ? dashboardData.including
    : buildGroupFromEntities(entities));
  return {
    asOf:(json.lastUpdated?new Date(json.lastUpdated).toLocaleString():'Google Sheet'),
    entities,
    group,
    algCb,
    exeSummary:parseExeSummary(sheets['Exe Sum']||sheets['EXE SUM']||[]),
    dashboardData,
    qiddiyaData,
    bankBalanceData: sheets['Bank Balance'] || []
  };
}
function loadJsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='cfJsonp_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const sep=url.includes('?')?'&':'?';
    const script=document.createElement('script');
    const timer=setTimeout(()=>{ cleanup(); reject(new Error('Google Sheet request timed out after 60 seconds')); },60000);
    function cleanup(){ clearTimeout(timer); delete window[cb]; if(script.parentNode) script.parentNode.removeChild(script); }
    window[cb]=(data)=>{ cleanup(); resolve(data); };
    script.onerror=()=>{ cleanup(); reject(new Error('Could not load Google Sheet API. Check Apps Script deployment and URL.')); };
    script.src=url+sep+'callback='+encodeURIComponent(cb)+'&t='+Date.now();
    document.body.appendChild(script);
  });
}
async function refreshFromGoogleSheet(){
  const url=getGoogleSheetUrlInput();
  if(!url){alert('Please paste the Google Apps Script API URL first.');return;}
  saveGoogleSheetUrl();
  setGoogleNotes('Refreshing core dashboard data...');
  try{
    const json=await loadGoogleSheetScope('core',{force:true});
    const normalized=normalizeGooglePayload(json);
    Object.assign(FORECAST_DATA, normalized);
    DASHBOARD_DATA = normalized.dashboardData || null;
    QIDDIYA_DATA = normalized.qiddiyaData || null;
    window.BANK_BALANCE_DATA = normalized.bankBalanceData || [];
    if(!forecastSheets().some(s=>s.sheet===currentForecastSheet)) currentForecastSheet='GROUP';
    setGoogleNotes('Core dashboard updated at '+new Date().toLocaleString());
    refreshAll();
    alert('Google Sheet core data loaded successfully.');
  }
  catch(e){
    setGoogleNotes('Refresh failed: '+e.message);
    alert('Could not refresh from Google Sheet: '+e.message);
  }
}
function handleExcelImport(e){ alert('Excel import button is ready in the UI. For reliable live updates from GitHub, use the Google Apps Script JSON connection so the hosted HTML can refresh from your Google Sheet.'); e.target.value=''; }


/* ---------------- by entity ---------------- */
let curEntity=ENTITIES[0].id;
function renderEntity(){
  $('entityPills').innerHTML=D.entities.map(e=>`<div class="pill ${e.id===curEntity?'active':''}" onclick="setEntity('${e.id}')">${e.name}</div>`).join('');
  const ent=D.entities.find(e=>e.id===curEntity);
  const em=entityMonthly(curEntity);
  const inS=em.rows.reduce((a,r)=>a+r.inflow,0), outS=em.rows.reduce((a,r)=>a+r.outflow,0);
  const close=em.rows[11].closing;
  $('entitySummaryTitle').textContent=ent.name+' — monthly summary';
  $('entityStats').innerHTML=`
    <div><span class="s-lbl">Opening</span><span class="s-val num">${fmt(em.opening)}</span></div>
    <div><span class="s-lbl">Inflows YTD</span><span class="s-val num pos">${fmt(inS)}</span></div>
    <div><span class="s-lbl">Outflows YTD</span><span class="s-val num neg">${fmt(outS)}</span></div>
    <div><span class="s-lbl">Net</span><span class="s-val num ${cls(inS-outS)}">${fmt(inS-outS)}</span></div>
    <div><span class="s-lbl">Closing</span><span class="s-val num ${cls(close)}">${fmt(close)}</span></div>`;
  $('entitySummary').innerHTML=summaryTable(em.rows, em.opening);
  renderBusinessUnitDetails(curEntity);
  // entity ledger
  const tx=D.transactions.filter(t=>t.entityId===curEntity && mKey(t.date).startsWith(''+D.year)).sort((a,b)=>a.date<b.date?1:-1);
  $('entityLedger').innerHTML=ledgerTableHTML(tx);
}
function setEntity(id){ curEntity=id; renderEntity(); }

/* ---------------- ledger ---------------- */
function ledgerTableHTML(tx){
  if(!tx.length) return `<div class="empty">No transactions yet. Use “Add transaction” to start recording cash movements.</div>`;
  const rows=tx.map(t=>{
    const ent=D.entities.find(e=>e.id===t.entityId);
    return `<tr>
      <td>${t.date}</td>
      <td class="rowhead">${ent?ent.name:'—'}</td>
      <td><span class="tag ${t.type==='inflow'?'in':'out'}">${t.type==='inflow'?'In':'Out'}</span></td>
      <td>${escapeHtml(t.category||'')}</td>
      <td>${escapeHtml(t.description||'')}</td>
      <td class="num ${t.type==='inflow'?'pos':'neg'}">${fmt(t.amount)}</td>
      <td><button class="btn ghost sm" onclick="editTx('${t.id}')">Edit</button></td>
    </tr>`;
  }).join('');
  return `<table><thead><tr><th>Date</th><th>Unit</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderLedger(){
  const fe=$('fEntity').value, ft=$('fType').value, fc=$('fCat').value, fs=$('fSearch').value.toLowerCase();
  let tx=D.transactions.slice().sort((a,b)=>a.date<b.date?1:-1);
  if(fe) tx=tx.filter(t=>t.entityId===fe);
  if(ft) tx=tx.filter(t=>t.type===ft);
  if(fc) tx=tx.filter(t=>t.category===fc);
  if(fs) tx=tx.filter(t=>(t.description||'').toLowerCase().includes(fs)||(t.category||'').toLowerCase().includes(fs));
  $('ledgerTable').innerHTML=ledgerTableHTML(tx);
}

/* ---------------- settings ---------------- */
function renderSettings(){
  setReportSettingsControls();
  $('openingTable').innerHTML=`<table><thead><tr><th>Business unit</th><th>Opening balance (${D.unit==='k'?"AED '000":'AED'})</th></tr></thead><tbody>${
    D.entities.map(e=>`<tr><td class="rowhead">${e.name}</td><td style="text-align:right"><input type="number" step="0.01" value="${e.opening}" style="width:160px;text-align:right" onchange="setOpening('${e.id}',this.value)"></td></tr>`).join('')
  }</tbody></table>`;
  $('inflowCats').innerHTML=catList('inflow');
  $('outflowCats').innerHTML=catList('outflow');
  $('storageNote').textContent = hasStorage
    ? 'Auto-save is active — your data persists in this app between sessions. Still, download a backup periodically.'
    : 'Note: persistent auto-save is unavailable in this environment, so data is kept only for this session. Download a backup before closing to keep your work.';
}
function catList(type){
  const arr=type==='inflow'?D.inflowCategories:D.outflowCategories;
  return arr.map((c,i)=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
    <span class="tag ${type==='inflow'?'in':'out'}" style="flex:1">${escapeHtml(c)}</span>
    <button class="btn danger sm" onclick="delCategory('${type}',${i})">Remove</button></div>`).join('') || '<div class="muted">None</div>';
}
function setOpening(id,v){ const e=D.entities.find(x=>x.id===id); if(e){e.opening=+v||0; persist(); refreshAll();} }
function addCategory(type){
  const name=prompt('New '+type+' category name:'); if(!name) return;
  (type==='inflow'?D.inflowCategories:D.outflowCategories).push(name.trim());
  persist(); renderSettings(); fillCategorySelectors();
}
function delCategory(type,i){
  const arr=type==='inflow'?D.inflowCategories:D.outflowCategories; arr.splice(i,1);
  persist(); renderSettings(); fillCategorySelectors();
}

/* ---------------- modal ---------------- */
let editingId=null;
function openModal(prefillEntity){
  editingId=null; $('modalTitle').textContent='Add transaction'; $('mDelete').style.display='none';
  $('mType').value='inflow'; fillCatForType();
  $('mDate').value=D.year+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0');
  if(!$('mDate').value.startsWith(''+D.year)) $('mDate').value=D.year+'-01-01';
  $('mDesc').value=''; $('mAmt').value=''; $('mEntity').value=prefillEntity||curEntity||D.entities[0].id;
  $('mUnitHint').textContent='in '+(D.unit==='k'?"AED '000":'AED');
  $('scrim').classList.add('show'); $('mAmt').focus();
}
function editTx(id){
  const t=D.transactions.find(x=>x.id===id); if(!t) return;
  editingId=id; $('modalTitle').textContent='Edit transaction'; $('mDelete').style.display='inline-block';
  $('mEntity').value=t.entityId; $('mType').value=t.type; fillCatForType();
  $('mCat').value=t.category; $('mDate').value=t.date; $('mDesc').value=t.description||''; $('mAmt').value=t.amount;
  $('mUnitHint').textContent='in '+(D.unit==='k'?"AED '000":'AED');
  $('scrim').classList.add('show');
}
function closeModal(){ $('scrim').classList.remove('show'); }
function fillCatForType(){
  const type=$('mType').value; const arr=type==='inflow'?D.inflowCategories:D.outflowCategories;
  $('mCat').innerHTML=arr.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
}
function saveTx(){
  const amt=parseFloat($('mAmt').value);
  if(!($('mDate').value)){ alert('Please pick a date.'); return; }
  if(isNaN(amt)||amt<0){ alert('Please enter a valid amount.'); return; }
  const rec={ id:editingId||uid(), entityId:$('mEntity').value, type:$('mType').value,
    category:$('mCat').value, date:$('mDate').value, description:$('mDesc').value.trim(), amount:amt };
  if(editingId){ const i=D.transactions.findIndex(x=>x.id===editingId); D.transactions[i]=rec; }
  else D.transactions.push(rec);
  persist(); closeModal(); refreshAll();
}
function deleteTx(){
  if(!editingId) return; if(!confirm('Delete this transaction?')) return;
  D.transactions=D.transactions.filter(x=>x.id!==editingId); persist(); closeModal(); refreshAll();
}

/* ---------------- import / export ---------------- */
function exportJSON(){
  const blob=new Blob([JSON.stringify(D,null,2)],{type:'application/json'});
  download(blob,'cashflow-backup-'+D.year+'.json');
}
function exportSummaryCSV(){
  const c=consolidated();
  let lines=[['Line',...MONTHS,'Total'].join(',')];
  const row=(l,v,t)=>lines.push([l,...v,t].join(','));
  row('Opening',c.months.map(m=>m.opening), c.totalOpen);
  row('Inflows',c.months.map(m=>m.inflow), c.months.reduce((a,m)=>a+m.inflow,0));
  row('Outflows',c.months.map(m=>m.outflow), c.months.reduce((a,m)=>a+m.outflow,0));
  row('Closing',c.months.map(m=>m.closing), c.months[11].closing);
  download(new Blob([lines.join('\n')],{type:'text/csv'}),'consolidated-summary-'+D.year+'.csv');
}
function download(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$('importFile').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const obj=JSON.parse(r.result); if(!obj.entities||!obj.transactions) throw 0;
    D=Object.assign(freshData(),obj); persist(); syncControls(); ensureMgmtDefaults(); refreshAll(); alert('Backup imported.'); }
    catch(err){ alert('That file could not be read as a valid backup.'); } };
  r.readAsText(f); e.target.value='';
});
function resetAll(){ if(!confirm('This erases all entered data. Continue?')) return; D=freshData(); persist(); syncControls(); ensureMgmtDefaults(); refreshAll(); }

/* ---------------- utilities ---------------- */
function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
async function persist(){ await saveRaw(JSON.stringify(D)); }
function fillCategorySelectors(){
  const cats=[...new Set([...D.inflowCategories,...D.outflowCategories])];
  $('fCat').innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
}
function fillEntitySelectors(){
  const opts=D.entities.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  $('mEntity').innerHTML=opts;
  $('fEntity').innerHTML='<option value="">All units</option>'+opts;
}
function syncControls(){
  // years
  const ySel=$('yearSel'); const years=[D.year-1,D.year,D.year+1];
  ySel.innerHTML=years.map(y=>`<option ${y===D.year?'selected':''}>${y}</option>`).join('');
  $('unitSel').value=D.unit;
  $('subline').textContent='Al Laith Group · Consolidated treasury across '+D.entities.length+' business units · '+D.year;
  fillEntitySelectors(); fillCategorySelectors();
}
function refreshAll(){
  renderDashboard(); 
  renderLiquidityView(); 
  renderAlpsCB(); 
  renderExecutiveSummary(); 
  renderEntity(); 
  renderLedger(); 
  renderSettings();

  if (window.BANK_BALANCE_MODULE && typeof window.BANK_BALANCE_MODULE.render === 'function') {
    window.BANK_BALANCE_MODULE.render();
  }
}

/* ---------------- view switching ---------------- */
$('nav').addEventListener('click',e=>{
  const b=e.target.closest('button[data-view]'); if(!b) return;
  document.querySelectorAll('nav.tabs button').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); $('view-'+b.dataset.view).classList.add('active');
});

/* ---------------- events ---------------- */
$('addBtn').onclick=()=>openModal();
$('ledgerAdd').onclick=()=>openModal();
$('entityAdd').onclick=()=>openModal(curEntity);
$('entityCSV').onclick=()=>{ exportSummaryCSV(); };
$('mSave').onclick=saveTx;
$('mDelete').onclick=deleteTx;
$('mType').onchange=fillCatForType;
$('scrim').addEventListener('click',e=>{ if(e.target===$('scrim')) closeModal(); });
['fEntity','fType','fCat'].forEach(id=>$(id).addEventListener('change',renderLedger));
$('fSearch').addEventListener('input',renderLedger);
$('yearSel').addEventListener('change',e=>{ D.year=+e.target.value; persist(); syncControls(); ensureMgmtDefaults(); refreshAll(); });
$('unitSel').addEventListener('change',e=>{ D.unit=e.target.value; persist(); refreshAll(); });
if($('alpsViewMode')) $('alpsViewMode').addEventListener('change',renderAlpsSheet);
if($('alpsSearch')) $('alpsSearch').addEventListener('input',renderAlpsSheet);
if($('forecastEntity')) $('forecastEntity').addEventListener('change',e=>setForecastSheet(e.target.value));
if($('forecastEntity2')) $('forecastEntity2').addEventListener('change',e=>setForecastSheet(e.target.value));
if($('varianceEntity')) $('varianceEntity').addEventListener('change',renderVarianceTable);
if($('excelImport')) $('excelImport').addEventListener('change',handleExcelImport);

/* ---------------- boot ---------------- */
(async function init(){
  const raw=await loadRaw();
  if(raw){ try{ D=Object.assign(freshData(),JSON.parse(raw)); }catch(e){ D=freshData(); } }
  else { D=freshData(); await persist(); }
  curEntity=D.entities[0].id;
  syncControls(); ensureMgmtDefaults(); refreshAll();
})();
