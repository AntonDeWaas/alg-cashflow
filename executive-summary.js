/* executive-summary.js
   Sprint 1 extraction from app.js.
   Purpose: Executive Summary, funding alerts, thresholds, variance table, print report.
   Note: This file currently mirrors working functions from app.js.
*/

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
