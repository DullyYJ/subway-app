import {load} from './h.mjs';
const A = await load('./cur.mjs'), B = await load('./new.mjs');
const mk = (L)=>{const G=L.mkG();const r=L.M.addBus(G,L.rows,L.M.SUBWAY_BUNDLE);G._allowBus=null;return {G,bc:r.busCoord,bn:r.busNm}};
const a=mk(A), b=mk(B);
function rnd(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
const r=rnd(42);
const N=+process.argv[2]||150;
const pts=[];for(let i=0;i<N*2;i++){const k=Math.floor(r()*A.rows.length);const row=A.rows[k];pts.push([row.lat+(r()-.5)*0.004,row.lng+(r()-.5)*0.004])}
// 역 근처 점도 포함
const sts=Object.values(A.G0.ST).filter(s=>s.y!=null&&s.y>37.17&&s.y<37.65&&s.x>126.88&&s.x<127.09);
for(let i=0;i<N/2;i++){const s=sts[Math.floor(r()*sts.length)];pts[i*2]=[s.y+(r()-.5)*0.003,s.x+(r()-.5)*0.003]}
const variants=[['minTime'],['minTransfer'],['minWalk'],['minTime',{mustSubway:true,subwayNearest:true,subwayNearestNoWalk:true}],['minTime',{mustSubway:true,subwayNearest:true}],['minTime',{noSubway:true}],['minTime',{cutoff:3000}]];
let diff=0,tot=0,nulls=0;
const t0={A:0,B:0};
for(let q=0;q<N;q++){
  const [sy,sx]=pts[q*2],[ey,ex]=pts[q*2+1];
  for(const [m,o] of variants){
    const oa=o?JSON.parse(JSON.stringify(o)):undefined, ob=o?JSON.parse(JSON.stringify(o)):undefined;
    let t=performance.now();const ra=A.M.dijkstra(a.G,a.bc,a.bn,sy,sx,ey,ex,m,oa);t0.A+=performance.now()-t;
    t=performance.now();const rb=B.M.dijkstra(b.G,b.bc,b.bn,sy,sx,ey,ex,m,ob);t0.B+=performance.now()-t;
    tot++;if(!ra)nulls++;
    const ja=JSON.stringify(ra),jb=JSON.stringify(rb);
    if(ja!==jb||JSON.stringify(oa)!==JSON.stringify(ob)||a.G.__djLastBd!==b.G.__djLastBd||a.G.__djPruned!==b.G.__djPruned){diff++;if(diff<=3)console.log('DIFF',q,m,JSON.stringify(o),'\nA',ja&&ja.slice(0,300),'\nB',jb&&jb.slice(0,300))}
  }
}
console.log('total',tot,'null',nulls,'diff',diff,'time old',Math.round(t0.A),'new',Math.round(t0.B),'speedup',(t0.A/t0.B).toFixed(2));
