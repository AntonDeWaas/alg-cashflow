(function(global){
'use strict';

const VERSION='6.2.0';
const clean=v=>String(v==null?'':v).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const upper=v=>clean(v).toUpperCase();

function config(){
  return global.FIP_CONFIG && global.FIP_CONFIG.data
    ? global.FIP_CONFIG.data
    : (global.FIP_CONFIG_DEFAULTS || {});
}
function entityRecord(id){
  const key=upper(id).replace(/\s+/g,'_');
  return (config().entities||[]).find(e=>upper(e.id)===key || upper(e.label)===upper(id)) || null;
}
function countryForEntity(id){
  const rec=entityRecord(id);
  if(rec&&rec.country)return upper(rec.country);
  const countries=config().countries||{};
  const key=upper(id).replace(/\s+/g,'_');
  for(const [country,entities] of Object.entries(countries)){
    if((entities||[]).some(e=>upper(e).replace(/\s+/g,'_')===key))return upper(country);
  }
  return 'UNASSIGNED';
}
function entitiesForCountry(country){
  return ((config().countries||{})[upper(country)]||[]).slice();
}
function businessClassification(codeOrName){
  const value=upper(codeOrName);
  if(!value)return 'OTHER';
  const divisions=config().divisions||{};
  for(const [group,codes] of Object.entries(divisions)){
    if(upper(group)===value)return group;
    if((codes||[]).some(c=>upper(c)===value))return group;
  }

  // Friendly-name fallback for current reports.
  const aliases={
    'CONSTRUCTION':'EPC',
    'EVENT':'EPC',
    'EVENTS':'EPC',
    'MAST CLIMBER':'EPC',
    'MAST CLIMBERS':'EPC',
    'MAST CLIMBING':'EPC',
    'POWERED ACCESS':'S&R',
    'SITE SERVICES':'S&R',
    'FILM PRODUCTION':'FP',
    'GENERAL':'GEN',
    'OIL & GAS':'O&G',
    'OIL AND GAS':'O&G'
  };
  return aliases[value] || 'OTHER';
}
function isCoreOperation(codeOrName){
  return !['FP','GEN','OTHER'].includes(businessClassification(codeOrName));
}
function currencyForEntity(id){
  return entityRecord(id)?.currency || 'AED';
}
function fxRate(currencyOrEntity){
  const rec=entityRecord(currencyOrEntity);
  const currency=rec?.currency || upper(currencyOrEntity);
  const rate=(config().fx||{})[currency];
  return Number.isFinite(Number(rate)) ? Number(rate) : 1;
}
function toAED(amount,currencyOrEntity){
  const n=Number(amount)||0;
  return n*fxRate(currencyOrEntity);
}
function fromAED(amount,currencyOrEntity){
  const n=Number(amount)||0,rate=fxRate(currencyOrEntity);
  return rate?n/rate:n;
}
function collectionStatus(achievement){
  const n=Number(achievement)||0;
  const t=config().thresholds||{};
  const green=Number(t.collectionGreen??100);
  const amber=Number(t.collectionAmber??90);
  return n>=green?'green':n>=amber?'amber':'red';
}
function agingStatus(over90Ratio,over180Ratio){
  const t=config().thresholds||{};
  const amber=Number(t.over90Amber??0.20);
  const red=Number(t.over180Red??0.10);
  if(Number(over180Ratio||0)>=red)return 'red';
  if(Number(over90Ratio||0)>=amber)return 'amber';
  return 'green';
}
function reconciliationStatus(variance,tolerance){
  const t=Number(tolerance ?? (config().thresholds||{}).reconciliationTolerance ?? 1);
  return Math.abs(Number(variance)||0)<=t?'reconciled':'review';
}
function movementClosing(m){
  const x=m||{};
  return (Number(x.opening)||0)
    +(Number(x.billing)||0)
    -(Number(x.receipts)||0)
    +(Number(x.chequeReturn)||0)
    -(Number(x.advanceBank)||0)
    +(Number(x.creditNoteReversal)||0)
    -(Number(x.creditNoteIssued)||0);
}
function movementVariance(m){
  return movementClosing(m)-(Number(m?.erpClosing)||0);
}
function explain(rule,input){
  const key=upper(rule);
  const explanations={
    DIVISION:{
      rule:'Business classification',
      source:'FIP Configuration → DIVISION rows',
      input:clean(input),
      result:businessClassification(input),
      formula:'Profit centre code/name → configured business classification'
    },
    COUNTRY:{
      rule:'Entity country',
      source:'FIP Configuration → ENTITY / COUNTRY rows',
      input:clean(input),
      result:countryForEntity(input),
      formula:'Entity → configured country'
    },
    FX:{
      rule:'AED conversion rate',
      source:'FIP Configuration → FX rows',
      input:clean(input),
      result:fxRate(input),
      formula:'Source amount × configured AED rate'
    },
    CORE:{
      rule:'Core operations',
      source:'FIP Configuration → DIVISION rows',
      input:clean(input),
      result:isCoreOperation(input),
      formula:'Core operations exclude FP, GEN and unmapped values'
    },
    COLLECTION:{
      rule:'Collection achievement status',
      source:'FIP Configuration → THRESHOLD rows',
      input:Number(input)||0,
      result:collectionStatus(input),
      formula:'Green ≥ configured green threshold; amber ≥ configured amber threshold; otherwise red'
    },
    AGING:{
      rule:'Receivables aging status',
      source:'FIP Configuration → THRESHOLD rows',
      input:input,
      result:agingStatus(input?.over90,input?.over180),
      formula:'Red when >180 ratio breaches red threshold; amber when >90 ratio breaches amber threshold'
    },
    RECONCILIATION:{
      rule:'Reconciliation status',
      source:'FIP Configuration → reconciliationTolerance',
      input:Number(input)||0,
      result:reconciliationStatus(input),
      formula:'Absolute variance ≤ tolerance → Reconciled'
    }
  };
  return explanations[key] || {
    rule:clean(rule),source:'Unknown',input,result:null,
    formula:'No explanation is registered for this rule.'
  };
}
function diagnostics(){
  const checks=[
    {name:'MCWP classification',expected:'EPC',actual:businessClassification('MCWP')},
    {name:'CONST classification',expected:'EPC',actual:businessClassification('CONST')},
    {name:'EV classification',expected:'EPC',actual:businessClassification('EV')},
    {name:'PA classification',expected:'S&R',actual:businessClassification('PA')},
    {name:'SS classification',expected:'S&R',actual:businessClassification('SS')},
    {name:'GEN classification',expected:'GEN',actual:businessClassification('GEN')},
    {name:'UAE entities',expected:'ALPS, ALICLER',actual:entitiesForCountry('UAE').join(', ')},
    {name:'ALIS country',expected:'OMAN',actual:countryForEntity('ALIS')},
    {name:'OMR AED rate',expected:9.5,actual:fxRate('OMR')},
    {name:'SAR AED rate',expected:0.975,actual:fxRate('SAR')},
    {name:'100% collection status',expected:'green',actual:collectionStatus(100)},
    {name:'95% collection status',expected:'amber',actual:collectionStatus(95)},
    {name:'80% collection status',expected:'red',actual:collectionStatus(80)},
    {name:'Zero variance status',expected:'reconciled',actual:reconciliationStatus(0)}
  ];
  return checks.map(c=>({...c,ok:String(c.expected)===String(c.actual)}));
}
function validateConfiguration(){
  const issues=[];
  const cfg=config();
  const requiredEntities=['ALPS','ALICLER','ALU','ALIS','ALPS_UZ'];
  requiredEntities.forEach(id=>{
    if(!entityRecord(id))issues.push({severity:'red',area:'Entity',message:`Missing entity ${id}`});
  });
  ['EPC','S&R','FP','GEN'].forEach(d=>{
    if(!(cfg.divisions||{})[d])issues.push({severity:'red',area:'Division',message:`Missing division mapping ${d}`});
  });
  ['AED','SAR','OMR'].forEach(c=>{
    if(!Number((cfg.fx||{})[c]))issues.push({severity:'red',area:'FX',message:`Missing or invalid FX rate ${c}`});
  });
  if(!entitiesForCountry('UAE').includes('ALPS')||!entitiesForCountry('UAE').includes('ALICLER')){
    issues.push({severity:'red',area:'Country',message:'UAE must include ALPS and ALICLER'});
  }
  diagnostics().filter(x=>!x.ok).forEach(x=>{
    issues.push({severity:'amber',area:'Diagnostic',message:`${x.name}: expected ${x.expected}, received ${x.actual}`});
  });
  return issues;
}

global.FIP_RULES={
  version:VERSION,
  entity:entityRecord,
  countryForEntity,
  entitiesForCountry,
  businessClassification,
  isCoreOperation,
  currencyForEntity,
  fxRate,
  toAED,
  fromAED,
  collectionStatus,
  agingStatus,
  reconciliationStatus,
  movementClosing,
  movementVariance,
  explain,
  diagnostics,
  validateConfiguration
};
})(window);
