const which=process.argv[2];
const m=await import('./'+which+'.mjs');
function mkKV(store){const log=[];return {log,async get(k,o){log.push(k);await new Promise(r=>setTimeout(r,20));const v=store[k];if(v===undefined)return null;const t=typeof o==='string'?o:(o&&o.type)||'text';return t==='json'?JSON.parse(v):v;},async put(k,v){store[k]=v;log.push('PUT '+k);}};}
const ymd='20261008';
const dt={ymd:'20261007',at:Date.now(),items:[{depplandtime:'202610071200',arrplandtime:'202610071300'}]};
const out=[];let id=0;
async function call(env,dep,stat,f){return which==='old'?m.ldTagoCached('train',dep,'B',ymd,env,{waitUntil(){}},f):m.ldTagoCached('train',dep,'B',ymd,env,{waitUntil(){}},stat,f);}
async function run(name,mk,fast,twice){
  const dep='D'+(id++);const store=mk(dep);const kv=mkKV(store);const env={ROWS_KV:kv};let calls=0;
  const f=async()=>{calls++;if(fast)return null;return [{x:1}];};
  const stat={ldFast:fast};
  let t0=Date.now();const r1=await call(env,dep,stat,f);const t1=Date.now()-t0;const kvn=kv.log.length;
  let second=null;
  if(twice){m.LD_TAGO_DT.clear();t0=Date.now();const r2=await call(env,dep,stat,f);second={via:r2.via,n:r2.items&&r2.items.length,reads:kv.log.length-kvn,ms:Math.round((Date.now()-t0)/20)*20};}
  out.push({name,via:r1.via,n:r1.items&&r1.items.length,calls,ms:Math.round(t1/20)*20,reads:kvn,second});
  m.LD_TAGO_DT.clear();
}
await run('ld-hit',d=>({['ld:train|'+d+'|B|'+ymd]:JSON.stringify([{a:1}])}),true);
await run('ldn-hit',d=>({['ldn:train|'+d+'|B|'+ymd]:'1'}),true);
await run('dt-hit',d=>({['ld2:train|'+d+'|B|4']:JSON.stringify(dt)}),true);
await run('miss fast x2',d=>({}),true,true);
await run('miss live',d=>({}),false);
console.log(which,JSON.stringify(out));
