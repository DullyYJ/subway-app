import {load} from './h.mjs';
const A = await load('./cur.mjs'), B = await load('./new.mjs');
function rnd(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
const r=rnd(5);
// xpWait
let xe=[];for(const k in A.G0.adj)for(const e of A.G0.adj[k])if(e.kind==='xpress')xe.push([k,e]);
const xeB=[];for(const k in B.G0.adj)for(const e of B.G0.adj[k])if(e.kind==='xpress')xeB.push([k,e]);
let dx=0,n=0;
for(let i=0;i<20000;i++){const j=Math.floor(r()*xe.length);const wk=r()<.3;const G={_weekend:wk,_baseMs:r()<.1?undefined:Date.UTC(2026,9,7)+Math.floor(r()*864e5)+r()};
 const dSec=r()*9000-(r()<.05?500:0);
 const ra=A.M.xpWait(G,xe[j][1],dSec), rb=B.M.xpWait(G,xeB[j][1],dSec);
 n++; if(!(ra===rb||(ra!==ra&&rb!==rb))){dx++;if(dx<4)console.log('XP DIFF',ra,rb)}}
console.log('xpWait cases',n,'diff',dx);
// accessNodes
const mk=(L)=>{const G=L.mkG();const rr=L.M.addBus(G,L.rows,L.M.SUBWAY_BUNDLE);G._allowBus=null;return {G,bc:rr.busCoord}};
const a=mk(A), b=mk(B);
let da=0,tn=0;
for(let i=0;i<600;i++){const row=A.rows[Math.floor(r()*A.rows.length)];const lat=row.lat+(r()-.5)*0.02,lng=row.lng+(r()-.5)*0.02;
 const allow=r()<.3?[[row.lat,row.lng],[row.lat+0.001,row.lng]]:null;
 const sa=JSON.stringify(A.M.accessNodes(a.G,a.bc,lat,lng,allow,{})),sb=JSON.stringify(B.M.accessNodes(b.G,b.bc,lat,lng,allow,{}));tn++;if(sa!==sb){da++;if(da<3)console.log('ACC DIFF',lat,lng,sa.slice(0,200),sb.slice(0,200))}}
// 외곽/경계: 서울 밖 좌표(빈 결과)
for(const [lat,lng] of [[35,129],[37.55,126.5],[0,0]]){const sa=JSON.stringify(A.M.accessNodes(a.G,a.bc,lat,lng,null,{})),sb=JSON.stringify(B.M.accessNodes(b.G,b.bc,lat,lng,null,{}));tn++;if(sa!==sb)da++}
console.log('accessNodes cases',tn,'diff',da);
