/* liquidity.js
   Sprint 1 extraction from app.js.
   Purpose: Liquidity Excl. Qiddiya calculations and rendering.
   Note: This file currently mirrors working functions from app.js.
*/

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
  const group=FORECAST_DATA.algCb || FORECAST_DATA.group || {};
  const periods=(group.periods||[]);
  let chosen=null;
  periods.forEach((p,i)=>{
    const dt=parsePeriodDate(p.period||p.key||'');
    if(!dt) return;
    if(!chosen || dt>chosen.date) chosen={index:i,period:p,date:dt,label:periodShortLabel(p)};
  });
  if(!chosen){
    const idx=periods.findIndex(p=>/^W1|Week\s*1/i.test(cleanText(p.period||'')));
    if(idx>=0) chosen={index:idx,period:periods[idx],date:null,label:periodShortLabel(periods[idx])};
  }
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
  const mon=String(p.month||'').slice(0,3);
  const q=getQiddiyaMonth(FORECAST_DATA.qiddiyaData||QIDDIYA_DATA, mon);
  const vatBenefit=qiddiyaVatBenefit();
  const periods=(group.periods||[]);
  const vatIdx=vatBenefitTargetIndex(periods);
  const applyVatToInflow=(vatIdx===idx);
  const applyVatToClosing=(vatIdx>=0 && idx>=vatIdx);
  const openingVals=groupRowValues(/Estimated Cash\s*(Balance|Bal).*Beginning|Opening Balance/i);
  const inflowVals=groupRowValues(/^Total Inflows$/i);
  const outflowVals=groupRowValues(/^Total Outflows$/i);
  let closingVals=groupRowValues(/Estimated Cash\s*(Balance|Bal).*End|Cash\s*(Balance|Bal).*End|Ending Cash Balance|Closing Balance/i);
  const gOpening=Number(openingVals[idx])||0;
  const gInflows=Number(inflowVals[idx])||0;
  const gOutflows=Number(outflowVals[idx])||0;
  let gClosing=Number(closingVals[idx]);
  if(!gClosing) gClosing=gOpening+gInflows-gOutflows;
  return {
    period:p, index:idx, month:mon,
    groupOpening:gOpening, groupInflows:gInflows, groupOutflows:gOutflows, groupClosing:gClosing,
    qOpening:Number(q.opening)||0,
    qInflows:(Number(q.inflows)||0) + (applyVatToInflow ? vatBenefit : 0),
    qOutflows:Number(q.outflows)||0,
    qClosing:(Number(q.closing)||0) + (applyVatToClosing ? vatBenefit : 0),
    opening:gOpening-(Number(q.opening)||0),
    inflows:gInflows-(Number(q.inflows)||0) - (applyVatToInflow ? vatBenefit : 0),
    outflows:gOutflows-(Number(q.outflows)||0),
    closing:gClosing-((Number(q.closing)||0) + (applyVatToClosing ? vatBenefit : 0))
  };
}
function liquidityInitialOpening(){
  const first=liquidityAtPeriodIndex(0);
  return Number(first.opening)||0;
}
function liquidityDetailPeriodRows(){
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
    if(/^Total Inflows$/i.test(label)){ addRow('Total Inflows (excluding Qiddiya)', adj.map(x=>x.inflows), 'total'); return; }
    if(/^Total Outflows$/i.test(label)){ addRow('Total Outflows (excluding Qiddiya)', adj.map(x=>x.outflows), 'total'); return; }
    if(r.type==='section'){
      if(/Estimated Cash Outflows/i.test(label)) inOutflowSection=true;
      if(/Estimated Cash Inflows/i.test(label)) inOutflowSection=false;
      if(/Estimated Cash Inflows|Estimated Cash Outflows|Suppliers|Payment Of Operating|Fixed Cash|Variable Cash|Capex/i.test(label)) addRow(label, periods.map(()=>null), 'section');
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
function renderLiquidityView(){
  if(!$('liquidityKpis')) return;
  const qd=FORECAST_DATA.qiddiyaData||QIDDIYA_DATA;
  const adjusted=liquidityAdjustedSummary();
  const reportInfo=getCurrentReportingPeriodInfo();
  const reportPeriod=reportInfo ? liquidityAtPeriodIndex(reportInfo.index) : null;
  const nonZeroAdj=adjusted.filter(x=>Number(x.groupClosing)!==0 || Number(x.qClosing)!==0 || Number(x.closing)!==0);
  const last=reportPeriod || (nonZeroAdj.length?nonZeroAdj[nonZeroAdj.length-1]:adjusted[adjusted.length-1]||{});
  const groupCash=Number(last.groupClosing)||0;
  const qiddiyaCash=Number(last.qClosing)||0;
  const vatBenefit=qiddiyaVatDisplayBenefit();
  const liquidCash=Number(last.closing)||0;
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
