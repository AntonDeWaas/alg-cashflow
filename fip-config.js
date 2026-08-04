(function(global){
'use strict';
const DEFAULTS={
  version:'6.0.0',
  entities:[
    {id:'ALPS',label:'ALPS',country:'UAE',currency:'AED',active:true},
    {id:'ALICLER',label:'ALICLER',country:'UAE',currency:'AED',active:true},
    {id:'ALU',label:'ALU',country:'KSA',currency:'SAR',active:true},
    {id:'ALIS',label:'ALIS',country:'OMAN',currency:'OMR',active:true},
    {id:'ALPS_UZ',label:'ALPS UZ',country:'UZBEKISTAN',currency:'AED',active:true}
  ],
  countries:{UAE:['ALPS','ALICLER'],KSA:['ALU'],OMAN:['ALIS'],UZBEKISTAN:['ALPS_UZ']},
  divisions:{EPC:['CONST','EV','MCWP'], 'S&R':['PA','SS'], FP:['FP'], GEN:['GEN'], 'O&G':['O&G','OG']},
  fx:{AED:1,SAR:0.975,OMR:9.5},
  thresholds:{collectionGreen:100,collectionAmber:90,over90Amber:0.20,over180Red:0.10,reconciliationTolerance:1},
  navigation:[]
};
function clone(v){return JSON.parse(JSON.stringify(v));}
function clean(v){return String(v==null?'':v).replace(/\u00a0/g,' ').trim();}
function bool(v){return ['1','true','yes','y','active'].includes(clean(v).toLowerCase());}
function number(v,d){const n=Number(String(v).replace(/[,\s]/g,''));return Number.isFinite(n)?n:d;}
function merge(target,source){Object.keys(source||{}).forEach(k=>{if(source[k]&&typeof source[k]==='object'&&!Array.isArray(source[k]))target[k]=merge(target[k]||{},source[k]);else target[k]=source[k];});return target;}
function matrix(payload){const sheets=(payload&&payload.sheets)||payload||{};return Array.isArray(sheets['FIP Configuration'])?sheets['FIP Configuration']:[];}
function parse(payload){
  const cfg=clone(DEFAULTS), rows=matrix(payload);
  if(!rows.length)return cfg;
  const entity=[],countries={},divisions={},fx={},thresholds={},navigation=[];
  rows.slice(1).forEach(r=>{
    const type=clean(r[0]).toUpperCase(),key=clean(r[1]),value=clean(r[2]),value2=clean(r[3]),value3=clean(r[4]);
    if(!type||!key)return;
    if(type==='ENTITY')entity.push({id:key,label:value||key,country:value2||'',currency:value3||'AED',active:r[5]===''?true:bool(r[5])});
    else if(type==='COUNTRY') (countries[key]||(countries[key]=[])).push(value);
    else if(type==='DIVISION') (divisions[key]||(divisions[key]=[])).push(value.toUpperCase());
    else if(type==='FX') fx[key.toUpperCase()]=number(value,1);
    else if(type==='THRESHOLD') thresholds[key]=number(value,0);
    else if(type==='NAV') navigation.push({id:key,label:value||key,order:number(value2,999),visible:value3===''?true:bool(value3)});
  });
  if(entity.length)cfg.entities=entity;
  if(Object.keys(countries).length)cfg.countries=countries;
  if(Object.keys(divisions).length)cfg.divisions=divisions;
  if(Object.keys(fx).length)cfg.fx=merge(cfg.fx,fx);
  if(Object.keys(thresholds).length)cfg.thresholds=merge(cfg.thresholds,thresholds);
  if(navigation.length)cfg.navigation=navigation.sort((a,b)=>a.order-b.order);
  return cfg;
}
function create(payload){
  const cfg=parse(payload);
  const api={
    data:cfg,
    reload(next){this.data=parse(next);global.dispatchEvent(new CustomEvent('fip:config',{detail:this.data}));return this.data;},
    entity(id){return this.data.entities.find(x=>x.id===id)||null;},
    countryEntities(country){return (this.data.countries[String(country).toUpperCase()]||[]).slice();},
    division(code){const c=clean(code).toUpperCase();for(const [group,codes] of Object.entries(this.data.divisions))if(codes.includes(c))return group;return 'OTHER';},
    fx(currency){return this.data.fx[clean(currency).toUpperCase()]||1;},
    threshold(name,fallback){return this.data.thresholds[name]??fallback;}
  };
  return api;
}
global.FIP_CONFIG=create(global.GOOGLE_SHEET_RAW_PAYLOAD);
global.FIP_CONFIG_DEFAULTS=DEFAULTS;
})(window);
