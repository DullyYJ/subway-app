import {load} from './h.mjs';
const A = await load('./cur.mjs'), B = await load('./new.mjs');
const mk = (L)=>{const G=L.mkG();const r=L.M.addBus(G,L.rows,L.M.SUBWAY_BUNDLE);G._allowBus=null;return {G,bc:r.busCoord,bn:r.busNm}};
function rnd(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
let r=rnd(9);
const N=+process.argv[2]||40;
const pts=[];for(let i=0;i<N*2;i++){const row=A.rows[Math.floor(r()*A.rows.length)];pts.push([row.lat+(r()-.5)*0.004,row.lng+(r()-.5)*0.004])}
let diff=0,tot=0;
// 라이브/rtw/accessSec 시나리오: 동일 구성을 양쪽 G 에 만든다
function setup(G,sc,rows,rr){
  if(sc==='live'||sc==='both'){
    G.live={};
    const q=rnd(3);
    for(let i=0;i<400;i++){const row=rows[Math.floor(q()*rows.length)];const id=row.node_id;const key=/^([A-Za-z]{2,4})([0-9])([0-9]{5,})$/.exec(id)?RegExp.$1+'#'+RegExp.$3:id;
      const m={__names:[],__id:id};m[row.route_no]=[Math.floor(q()*600)+30,Math.floor(q()*900)+700];G.live[key]=m;}
    G.liveCost={hit:0,missed:0,unknown:0};
  }
  if(sc==='rtw'||sc==='both'){
    const byStop={},any={};const q=rnd(4);
    for(let i=0;i<300;i++){const row=rows[Math.floor(q()*rows.length)];byStop[row.node_id+'|'+row.route_no]=Math.floor(q()*500)+20}
    G.rtw={byStop,any:{}};G.rtwStat={stopKeys:300,anyKeys:0,stopHit:0,anyHit:0,anySkipped:0,miss:0};
  }
  if(sc==='acc'){G.accessSec={};G.waitLog=undefined}
}
for(const sc of ['none','live','rtw','both','acc']){
 const a=mk(A), b=mk(B);
 setup(a.G,sc,A.rows);setup(b.G,sc,B.rows);
 for(let q=0;q<N;q++){
  const [sy,sx]=pts[q*2],[ey,ex]=pts[q*2+1];
  for(const [m,o] of [['minTime'],['minTransfer'],['minWalk'],['minTime',{mustSubway:true,subwayNearest:true}],['minTime',{noSubway:true}]]){
    const oa=o?JSON.parse(JSON.stringify(o)):undefined, ob=o?JSON.parse(JSON.stringify(o)):undefined;
    const ra=A.M.dijkstra(a.G,a.bc,a.bn,sy,sx,ey,ex,m,oa), rb=B.M.dijkstra(b.G,b.bc,b.bn,sy,sx,ey,ex,m,ob);
    tot++;
    const ja=JSON.stringify([ra,a.G.__waitSrc,a.G.liveCost,a.G.rtwStat,a.G.waitLog,a.G.__djLastBd]),jb=JSON.stringify([rb,b.G.__waitSrc,b.G.liveCost,b.G.rtwStat,b.G.waitLog,b.G.__djLastBd]);
    if(ja!==jb){diff++;if(diff<3)console.log('DIFF',sc,q,m,'\n',ja.slice(0,400),'\n',jb.slice(0,400))}
  }
 }
 console.log(sc,'done diff so far',diff,'of',tot);
}
{
 const a=mk(A), b=mk(B);let d2=0,t2=0;
 for(let q=0;q<N;q++){
  if(q===Math.floor(N/2)){setup(a.G,'live',A.rows);setup(b.G,'live',B.rows)}
  const [sy,sx]=pts[q*2],[ey,ex]=pts[q*2+1];
  for(const m of ['minTime','minTransfer']){
   const ra=A.M.dijkstra(a.G,a.bc,a.bn,sy,sx,ey,ex,m), rb=B.M.dijkstra(b.G,b.bc,b.bn,sy,sx,ey,ex,m);t2++;
   if(JSON.stringify([ra,a.G.liveCost])!==JSON.stringify([rb,b.G.liveCost]))d2++;}
 }
 console.log('transition pure->live diff',d2,'of',t2);
}
