(function(global){
'use strict';
const VERSION='6.0.0';
function load(src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[data-fip="${src}"]`))return resolve();const s=document.createElement('script');s.src=src;s.dataset.fip=src;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load '+src));document.head.appendChild(s);});}
async function boot(){
  try{
    await load('fip-config.js');
    await load('fip-analytics.js');
    await load('fip-components.js');
    await load('fip-navigation.js');
    global.FIP={version:VERSION,config:global.FIP_CONFIG,analytics:global.FIP_ANALYTICS,components:global.FIP_COMPONENTS,navigation:global.FIP_NAVIGATION};
    global.addEventListener('googleSheetPayloadReady',e=>{if(global.FIP_CONFIG)global.FIP_CONFIG.reload(e.detail);});
    global.dispatchEvent(new CustomEvent('fip:ready',{detail:global.FIP}));
    console.info('Al Laith Finance Intelligence Platform',VERSION,'ready');
  }catch(err){console.error('FIP 6.0 boot failed',err);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
