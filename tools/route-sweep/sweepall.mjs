// usage: node sweepall.mjs <engineFile> <line> <part> <nparts> <outFile>  -- all ordered pairs, a few times
import fs from 'fs';
const [,, ENG, LINE, PART, NP, OUT] = process.argv;
const mod = await import(ENG);
const K = JSON.parse(fs.readFileSync('./kric_all.json','utf8')); const B=JSON.parse(fs.readFileSync('./bundle.json','utf8'));
import {anomalies} from './anom.mjs';
const env = { DB:{ prepare(sql){ return { bind(){return this;}, async all(){ if(/FROM kric_seg/.test(sql)) return {results:K.seg}; if(/FROM kric_xp/.test(sql)) return {results:K.xp}; return {results:[]};}, async first(){return null;}, async run(){return {};} }; }, batch: async()=>[] }, ROWS_KV:{get:async()=>null,put:async()=>{}} };
const ST = Object.entries(B.stations).filter(([id,s])=>s.l===LINE && s.y!=null).sort((a,b)=>a[0]<b[0]?-1:1).map(x=>x[1]);
const TS=(process.env.TS||'2026-10-14T07:00,2026-10-14T12:40,2026-10-14T17:20').split(',').map(x=>Date.parse(x+':00+09:00'));
const out=fs.createWriteStream(OUT); let total=0,bad=0, idx=0;
for(const o of ST) for(const d of ST){ if(o===d) continue; if((idx++)%(+NP)!==+PART) continue;
  for(const t of TS){
    let r; try{ const res=await mod.default.fetch(new Request(`https://x/route-v2-app?SX=${o.x}&SY=${o.y}&EX=${d.x}&EY=${d.y}&baseMs=${t}`,{headers:{'CF-Connecting-IP':'ip'+(globalThis.__n=(globalThis.__n||0)+1)}}),env,{waitUntil(){}}); r=await res.json(); }catch(e){ continue; }
    total++; const a=anomalies(r); const paths=(r.result&&r.result.path)||[];
    const tm=paths.map(p=>p.info.tab+':'+p.info.totalTime).join(' ');
    const rec={o:o.n,d:d.n,t:new Date(t+9*3600e3).toISOString().slice(0,16),times:tm};
    if(a.length){bad++; rec.a=a.slice(0,2);} else rec.ok=1;
    out.write(JSON.stringify(rec)+'\n'); } }
out.end(); console.log(LINE,PART,'total',total,'bad',bad);
