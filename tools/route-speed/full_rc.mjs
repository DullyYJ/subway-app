console.warn=()=>{};
import fs from 'fs';
const mod = process.argv[2], tag=process.argv[3]||'x';
const W = await import(mod);
const rows = JSON.parse(fs.readFileSync('/tmp/prof/rows.json','utf8'));
const xp = JSON.parse(fs.readFileSync('/tmp/prof/kric_xp_r.json','utf8'));
const seg = JSON.parse(fs.readFileSync('/tmp/prof/kric_seg_r.json','utf8'));
const calls=[];
const env = { DB: { prepare(sql){ const o={ sql, args:[], bind(...a){o.args=a;return o}, async all(){
  calls.push(sql.slice(0,60));
  if(sql.includes('FROM kric_seg')) return {results:seg,meta:{}};
  if(sql.includes('FROM kric_xp')) return {results:xp,meta:{}};
  if(sql.includes('bus_route_stops')){
    const a=o.args;
    if(sql.includes('route_key IN')){ // near
      const boxes=[[a[0],a[1],a[2],a[3]],[a[4],a[5],a[6],a[7]],[a[8],a[9],a[10],a[11]]];
      const keys=new Set(rows.filter(r=>boxes.some(b=>r.lat>=b[0]&&r.lat<=b[1]&&r.lng>=b[2]&&r.lng<=b[3])).map(r=>r.route_key));
      return {results:rows.filter(r=>keys.has(r.route_key)).slice(0,a[12]),meta:{}};
    }
    return {results:rows.filter(r=>r.lat>=a[0]&&r.lat<=a[1]&&r.lng>=a[2]&&r.lng<=a[3]).slice(0,a[4]),meta:{}};
  }
  return {results:[],meta:{}};
}}; return o; }, withSession(){return this}, batch: async()=>[] } };
const ctx={waitUntil(p){}};
const Q = JSON.parse(fs.readFileSync('/tmp/prof/cases_in.json','utf8'));
const out={};const ts=[];const REP=+process.env.REP||1;
const baseMs = Date.UTC(2026,9,7,7,0,0);
for(const [ci,sx,sy,ex,ey] of Q){
  const url=`https://x.dev/route-v2-app?SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}&live=0&baseMs=${baseMs}`;
  let r,txt,tt=[];
  for(let k=0;k<REP;k++){const t=performance.now();
  try{r=await W.default.fetch(new Request(url,{headers:{"cf-connecting-ip":"1.1.1."+Math.floor(Math.random()*1e9)}}),env,ctx);}catch(e){out[ci]='ERR '+e.message;break}
  txt=await r.text();tt.push(performance.now()-t);}
  if(!txt)continue; tt.sort((a,b)=>a-b);ts.push([ci,Math.round(tt[Math.floor(tt.length/2)])]);
  // 엔진 내부 진단(시간 등)은 비교에서 제외
  try{const j=JSON.parse(txt);delete j.liveStat;delete j.busDiag;delete j.engVer;delete j.engineVersion;out[ci]=JSON.stringify(j)}catch(e){out[ci]=txt.slice(0,200)}
}
fs.writeFileSync('/tmp/prof/out_'+tag+'.json',JSON.stringify(out));
console.log(tag,'times',ts.map(x=>x.join(':')).join(' '));
