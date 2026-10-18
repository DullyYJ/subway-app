import fs from 'fs';
const mod = await import(process.env.ENG||'./eng.mjs');
const K = JSON.parse(fs.readFileSync(process.env.NOKRIC?'./kric_none.json':'./kric_all.json','utf8'));
const B = JSON.parse(fs.readFileSync('./bundle.json','utf8'));
const env = { DB:{ prepare(sql){ return { bind(){return this;}, async all(){
  if(/FROM kric_seg/.test(sql)) return {results:K.seg};
  if(/FROM kric_xp/.test(sql)) return {results:K.xp};
  return {results:[]};}, async first(){return null;}, async run(){return {};} }; }, batch: async()=>[] }, ROWS_KV:{get:async()=>null,put:async()=>{}} };
export async function route(o, d, baseMs, extra=''){
  const u=`https://x/route-v2-app?SX=${o.x}&SY=${o.y}&EX=${d.x}&EY=${d.y}&baseMs=${baseMs}${extra}`;
  const r=await mod.default.fetch(new Request(u,{headers:{'CF-Connecting-IP':'ip'+(globalThis.__n=(globalThis.__n||0)+1)}}), env, {waitUntil(){}});
  return await r.json();
}
export {B};
if (process.argv[1].endsWith('sweep.mjs') && process.argv[2]==='time'){
  const S=B.stations; const o=S['S01-001'], d=S['S01-105'];
  const t0=Date.now(); for(let i=0;i<5;i++) await route(o,d,Date.parse('2026-10-18T14:07:00+09:00')+i*60000); console.log((Date.now()-t0)/5,'ms');
}
