(function(global){
'use strict';
const VERSION='6.2.5';
const CACHE_KEY='alg-fip-config-v6.2.5';
const DEFAULTS={
  version:VERSION,
  entities:[
    {id:'ALPS',label:'ALPS',country:'UAE',currency:'AED',active:true},
    {id:'ALICLER',label:'ALICLER',country:'UAE',currency:'AED',active:true},
    {id:'ALU',label:'ALU',country:'KSA',currency:'SAR',active:true},
    {id:'ALIS',label:'ALIS',country:'OMAN',currency:'OMR',active:true},
    {id:'ALPS_UZ',label:'ALPS UZ',country:'UZBEKISTAN',currency:'AED',active:true}
  ],
  countries:{UAE:['ALPS','ALICLER'],KSA:['ALU'],OMAN:['ALIS'],UZBEKISTAN:['ALPS_UZ']},
  divisions:{EPC:['CONST','EV','MCWP'],'S&R':['PA','SS'],FP:['FP'],GEN:['GEN'],'O&G':['O&G','OG']},
  fx:{AED:1,SAR:0.975,OMR:9.5},
  thresholds:{
    collectionGreen:100,collectionAmber:90,
    over90Amber:0.20,over180Red:0.10,
    reconciliationTolerance:1
  },
  navigation:[
    {id:'consolidated',label:'Consolidated',order:10,visible:true},
    {id:'executive-summary',label:'Executive Summary',order:20,visible:true},
    {id:'liquidity-excl-qiddiya',label:'Liquidity Excl. Qiddiya',order:30,visible:true},
    {id:'group-forecast',label:'Group Forecast',order:40,visible:true},
    {id:'by-business-unit',label:'By Business Unit',order:50,visible:true},
    {id:'transactions',label:'Transactions',order:60,visible:true},
    {id:'settings-data',label:'Settings & Data',order:70,visible:true},
    {id:'bank-balance',label:'Bank Balance',order:80,visible:true},
    {id:'pdc-issued',label:'PDC Issued',order:90,visible:true},
    {id:'bank-loans',label:'Bank Loans',order:100,visible:true},
    {id:'capex',label:'Capex',order:110,visible:true},
    {id:'intercompany',label:'Intercompany',order:120,visible:true},
    {id:'receivables',label:'Receivables',order:130,visible:true}
  ]
};
function clone(v){return JSON.parse(JSON.stringify(v));}
function clean(v){return String(v==null?'':v).replace(/\u00a0/g,' ').trim();}
function bool(v){return ['1','true','yes','y','active','visible'].includes(clean(v).toLowerCase());}
function number(v,d){const n=Number(String(v).replace(/[,\s]/g,''));return Number.isFinite(n)?n:d;}
function merge(target,source){
  Object.keys(source||{}).forEach(k=>{
    if(source[k]&&typeof source[k]==='object'&&!Array.isArray(source[k]))
      target[k]=merge(target[k]||{},source[k]);
    else target[k]=source[k];
  });
  return target;
}
function sheetMatrix(payload){
  const sheets=(payload&&payload.sheets)||payload||{};
  if(Array.isArray(sheets['FIP Configuration']))return sheets['FIP Configuration'];
  const key=Object.keys(sheets).find(k=>clean(k).toLowerCase()==='fip configuration');
  return key&&Array.isArray(sheets[key])?sheets[key]:[];
}
function parse(payload){
  const cfg=clone(DEFAULTS),rows=sheetMatrix(payload);
  if(!rows.length)return cfg;
  const entities=[],countries={},divisions={},fx={},thresholds={},navigation=[];
  rows.slice(1).forEach(r=>{
    const type=clean(r[0]).toUpperCase(),key=clean(r[1]),
      value=clean(r[2]),value2=clean(r[3]),value3=clean(r[4]);
    if(!type||!key)return;
    if(type==='ENTITY'){
      entities.push({id:key,label:value||key,country:value2||'',currency:value3||'AED',
        active:r[5]===''||r[5]==null?true:bool(r[5])});
    }else if(type==='COUNTRY'){
      (countries[key.toUpperCase()]||(countries[key.toUpperCase()]=[])).push(value);
    }else if(type==='DIVISION'){
      (divisions[key]||(divisions[key]=[])).push(value.toUpperCase());
    }else if(type==='FX'){
      fx[key.toUpperCase()]=number(value,1);
    }else if(type==='THRESHOLD'){
      thresholds[key]=number(value,0);
    }else if(type==='NAV'){
      navigation.push({id:key,label:value||key,order:number(value2,999),
        visible:value3===''||value3==null?true:bool(value3)});
    }
  });
  if(entities.length)cfg.entities=entities;
  if(Object.keys(countries).length)cfg.countries=countries;
  if(Object.keys(divisions).length)cfg.divisions=divisions;
  if(Object.keys(fx).length)cfg.fx=merge(cfg.fx,fx);
  if(Object.keys(thresholds).length)cfg.thresholds=merge(cfg.thresholds,thresholds);
  if(navigation.length)cfg.navigation=navigation.sort((a,b)=>a.order-b.order);
  cfg.version=VERSION;
  return cfg;
}
function apiUrl(){
  const fromInput=document.getElementById('googleSheetUrlSettings')?.value ||
    document.getElementById('googleSheetUrl')?.value;
  return clean(fromInput || localStorage.getItem('cf_google_sheet_url') || global.DEFAULT_GOOGLE_SHEET_URL || '');
}
function scopedUrl(url){
  return url+(url.includes('?')?'&':'?')+'scope=config';
}
function jsonp(url,timeout=45000){
  return new Promise((resolve,reject)=>{
    const cb='fipConfigCb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    let done=false;
    const finish=(err,data)=>{
      if(done)return;done=true;clearTimeout(timer);
      try{delete global[cb]}catch(_){}
      s.remove();
      err?reject(err):resolve(data);
    };
    global[cb]=data=>finish(null,data);
    s.onerror=()=>finish(new Error('Could not load FIP Configuration API.'));
    s.src=url+(url.includes('?')?'&':'?')+'callback='+encodeURIComponent(cb);
    const timer=setTimeout(()=>finish(new Error('FIP Configuration request timed out.')),timeout);
    document.head.appendChild(s);
  });
}
function cached(){
  try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(_){return null}
}
function saveCache(payload){
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(payload))}catch(_){}
}
function create(){
  const cache=cached();
  const state={
    data:cache?.data||clone(DEFAULTS),
    source:cache?'cache':'defaults',
    loadedAt:cache?.loadedAt||null,
    error:null,
    raw:null
  };
  const api={
    version:VERSION,
    get data(){return state.data},
    get status(){return clone(state)},
    reload(payload,source='payload'){
      state.raw=payload||null;
      state.data=parse(payload);
      state.source=source;
      state.loadedAt=new Date().toISOString();
      state.error=null;
      saveCache({data:state.data,loadedAt:state.loadedAt});
      global.dispatchEvent(new CustomEvent('fip:config',{detail:{data:state.data,status:this.status}}));
      return state.data;
    },
    async load(options={}){
      const url=apiUrl();
      if(!url){
        state.error='Google Apps Script URL is not configured.';
        global.dispatchEvent(new CustomEvent('fip:config-error',{detail:this.status}));
        return state.data;
      }
      try{
        const payload=await jsonp(scopedUrl(url));
        return this.reload(payload,'google-sheet');
      }catch(err){
        state.error=err.message;
        global.dispatchEvent(new CustomEvent('fip:config-error',{detail:this.status}));
        if(options.throwOnError)throw err;
        return state.data;
      }
    },
    entity(id){return state.data.entities.find(x=>x.id===id)||null},
    countryEntities(country){return (state.data.countries[clean(country).toUpperCase()]||[]).slice()},
    division(code){
      const c=clean(code).toUpperCase();
      for(const [group,codes] of Object.entries(state.data.divisions))
        if(codes.map(x=>clean(x).toUpperCase()).includes(c))return group;
      return 'OTHER';
    },
    fx(currency){return state.data.fx[clean(currency).toUpperCase()]||1},
    threshold(name,fallback){return state.data.thresholds[name]??fallback},
    navigation(){return state.data.navigation.slice().sort((a,b)=>a.order-b.order)},
    clearCache(){localStorage.removeItem(CACHE_KEY)}
  };
  return api;
}
global.FIP_CONFIG=create();
global.FIP_CONFIG_DEFAULTS=DEFAULTS;
})(window);
