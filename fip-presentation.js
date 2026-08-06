// FIP 6.5.3 — landscape presentation and reporting-date standard
(function(global){
'use strict';
const VERSION='6.5.7';
const $=s=>document.querySelector(s);

function reportingDate(){
  try{
    if(typeof global.reportDateDisplay==='function'){
      const value=global.reportDateDisplay();
      if(value)return value;
    }
  }catch(_){}
  const keys=['cf_reporting_date','reportingDate','fip_reporting_date'];
  for(const key of keys){
    const value=localStorage.getItem(key);
    if(value)return value;
  }
  return 'Not set';
}

function activeView(){
  return document.querySelector('[id^="view-"]:not([hidden]), [id^="view-"].active');
}

function addReportingStrip(){
  document.querySelectorAll('[id^="view-"]').forEach(view=>{
    let strip=view.querySelector(':scope > .fip-reporting-strip');
    if(!strip){
      strip=document.createElement('div');
      strip.className='fip-reporting-strip';
      view.prepend(strip);
    }
    strip.innerHTML=`<span>Reporting date</span><strong>${reportingDate()}</strong><em>FIP ${VERSION}</em>`;
  });
}

function arrangeLiquidityLayout(){
  const summary=document.getElementById('liquiditySummary');
  if(!summary)return;

  const view=document.getElementById('view-liquidity')||summary.closest('[id^="view-"]');
  if(!view)return;

  const summaryPanel=summary.closest('.card,.panel,section')||summary.parentElement;
  const hero=view.querySelector('.hero,.banner,.view-hero') ||
    [...view.children].find(x=>x.querySelector&&x.querySelector('#liquidityAsOf')) || null;
  const strip=view.querySelector(':scope > .fip-reporting-strip');

  // Detailed cash flow stays near the top, immediately after the hero/reporting strip.
  const topAnchor=hero||strip;
  if(topAnchor && summaryPanel && summaryPanel.previousElementSibling!==topAnchor){
    topAnchor.insertAdjacentElement('afterend',summaryPanel);
  }

  // Cash position bridge must remain only on Liquidity and always at the bottom.
  const bridge=document.getElementById('liquidityBridge');
  if(bridge){
    const bridgePanel=bridge.closest('.card,.panel,section')||bridge.parentElement;
    if(bridgePanel && bridgePanel.parentElement===view){
      view.appendChild(bridgePanel);
    }
  }

  // Remove any accidental duplicate bridge outside the Liquidity view.
  document.querySelectorAll('#liquidityBridge').forEach(node=>{
    if(!view.contains(node)){
      const panel=node.closest('.card,.panel,section')||node;
      panel.remove();
    }
  });
}
function improveChartAccessibility(){
  const svg=document.getElementById('chart');
  if(!svg)return;
  svg.style.width='100%';
  svg.style.height='clamp(260px,32vw,390px)';
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Monthly net cash movement bars and closing cash trend');
}

function apply(){
  addReportingStrip();
  arrangeLiquidityLayout();
  improveChartAccessibility();
}

function styles(){
  if(document.getElementById('fipPresentation657Styles'))return;
  const s=document.createElement('style');
  s.id='fipPresentation657Styles';
  s.textContent=`
:root{--fip-page-max:1920px}
body{overflow-x:hidden}
main,.main,.workspace,#appMain{max-width:var(--fip-page-max)!important;width:100%!important;margin-inline:auto}
[id^="view-"]{max-width:var(--fip-page-max)!important;width:100%!important;padding-left:clamp(12px,1.3vw,26px)!important;padding-right:clamp(12px,1.3vw,26px)!important}
.fip-reporting-strip{display:flex;align-items:center;gap:9px;margin:0 0 10px;padding:7px 10px;border:1px solid #ddd6ca;border-radius:8px;background:#fbfaf7;color:#53606c;font-size:.76rem}
.fip-reporting-strip span{text-transform:uppercase;letter-spacing:.06em;font-weight:800}.fip-reporting-strip strong{color:#143d63}.fip-reporting-strip em{margin-left:auto;font-style:normal;color:#7b858e}
.grid.kpis,.kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:10px!important}
.kpi{min-height:105px!important;padding:14px 16px!important}.kpi .lbl{font-size:.68rem!important}.kpi .val{font-size:clamp(1.35rem,1.65vw,1.8rem)!important;line-height:1.1}.kpi .meta{font-size:.72rem!important;margin-top:7px}
.hero,.view-hero,[class*="hero"]{padding:18px 22px!important}.hero h1,.hero h2,[class*="hero"] h1,[class*="hero"] h2{font-size:clamp(1.35rem,2vw,1.8rem)!important;margin-bottom:5px!important}.hero p,[class*="hero"] p{max-width:1150px!important;line-height:1.4!important}
.panel,.card{border-radius:11px}
table{font-size:clamp(.76rem,.76vw,.88rem)}
#view-liquidity .liq-command-table{margin-top:4px}
#view-liquidity .liq-main-scroll{max-height:72vh!important}
#view-liquidity #liquidityKpis{grid-template-columns:repeat(5,minmax(145px,1fr))!important}
#view-liquidity #liquidityBridge table{font-size:.78rem}
#view-dashboard #chart,#view-consolidated #chart{width:100%;height:clamp(260px,32vw,390px)}
#view-receivables .recv-two{grid-template-columns:repeat(2,minmax(0,1fr))}
#view-receivables .recv-kpis{grid-template-columns:repeat(4,minmax(150px,1fr))!important}

#view-receivables .recv-customer-name{
  white-space:normal!important;
  overflow-wrap:anywhere!important;
  word-break:normal!important;
  line-height:1.2!important;
  min-width:240px!important;
  max-width:320px!important;
}
#view-receivables .recv-customer-table th:nth-child(2),
#view-receivables .recv-customer-table td:nth-child(2){
  min-width:240px!important;
  max-width:320px!important;
  white-space:normal!important;
  overflow-wrap:anywhere!important;
}
#view-receivables .recv-aging-detail-table th:first-child,
#view-receivables .recv-aging-detail-table td:first-child{
  min-width:260px!important;
  max-width:320px!important;
  white-space:normal!important;
  overflow-wrap:anywhere!important;
}
#view-receivables .recv-aging-filters{
  position:sticky;
  top:0;
  z-index:30;
}
#view-liquidity #liquidityBridge{margin-top:18px!important}

@media (min-width:1400px){
  #view-receivables .recv-panel,#view-liquidity .panel{padding:16px 18px}
}
@media (max-width:900px){
  #view-liquidity #liquidityKpis{grid-template-columns:repeat(2,minmax(145px,1fr))!important}
  #view-receivables .recv-two{grid-template-columns:1fr}
  .fip-reporting-strip em{display:none}
}`;
  document.head.appendChild(s);
}

function boot(){
  styles();apply();
  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  global.addEventListener('googleSheetPayloadReady',()=>setTimeout(apply,40));
  global.addEventListener('fip:data-ready',()=>setTimeout(apply,40));
}
global.FIP_PRESENTATION={version:VERSION,apply,reportingDate};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})(window);
