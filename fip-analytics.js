// FIP Analytics Engine v6.1
(function(global){
'use strict';
const A={
  sum:(rows,selector)=>rows.reduce((a,r)=>a+(Number(selector?selector(r):r)||0),0),
  variance:(actual,target)=>Number(actual||0)-Number(target||0),
  variancePct:(actual,target)=>Number(target)?(Number(actual)-Number(target))/Math.abs(Number(target))*100:0,
  ratio:(a,b)=>Number(b)?Number(a)/Number(b)*100:0,
  yoy:(current,prior)=>Number(prior)?(Number(current)-Number(prior))/Math.abs(Number(prior))*100:0,
  ytd:(series,year,throughMonth)=>series.filter(x=>Number(x.year)===Number(year)&&Number(x.month)<=Number(throughMonth)).reduce((a,x)=>a+Number(x.value||0),0),
  rolling:(series,count)=>series.slice(-count).reduce((a,x)=>a+Number(x.value||0),0),
  contribution:(value,total)=>Number(total)?Number(value)/Number(total)*100:0,
  status(value,{green=100,amber=90,higherIsBetter=true}={}){
    const v=Number(value)||0;
    if(higherIsBetter)return v>=green?'green':v>=amber?'amber':'red';
    return v<=green?'green':v<=amber?'amber':'red';
  },
  groupBy(rows,keyFn){return rows.reduce((m,r)=>{const k=keyFn(r);(m[k]||(m[k]=[])).push(r);return m;},{});}
};
global.FIP_ANALYTICS=A;
})(window);
