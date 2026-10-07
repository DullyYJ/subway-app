import {load} from './h.mjs';
const A = await load('./cur.mjs'), B = await load('./new.mjs');
const mk = (L)=>{const G=L.mkG();const r=L.M.addBus(G,L.rows,L.M.SUBWAY_BUNDLE);G._allowBus=null;return {G,bc:r.busCoord,bn:r.busNm}};
function rnd(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
const norm=id=>{const m=/^([A-Za-z]{2,4})([0-9])([0-9]{5,})$/.exec(id);return m?m[1]+'#'+m[3]:id};
let r=rnd(11);const N=+process.argv[2]||40;
const pts=[];for(let i=0;i<N*2;i++){const row=A.rows[Math.floor(r()*A.rows.length)];pts.push([row.lat+(r()-.5)*0.004,row.lng+(r()-.5)*0.004])}
function addAcc(G,rows,seed,n){G.accessSec=G.accessSec||{};const q=rnd(seed);for(let i=0;i<n;i++){const row=rows[Math.floor(q()*rows.length)];G.accessSec[norm(row.node_id)]=Math.floor(q()*600)}}
function setRtw(G,rows,seed){const byStop={};const q=rnd(seed);for(let i=0;i<300;i++){const row=rows[Math.floor(q()*rows.length)];byStop[row.node_id+'|'+row.route_no]=Math.floor(q()*500)+20}
 G.rtw={byStop,any:{}};G.rtwStat={stopKeys:300,anyKeys:0,stopHit:0,anyHit:0,anySkipped:0,miss:0}}
let diff=0,tot=0;
const modes=[['minTime'],['minTransfer'],['minWalk'],['minTime',{mustSubway:true,subwayNearest:true}],['minTime',{noSubway:true}]];
function step(a,b,q,tag){
  const [sy,sx]=pts[(q*2)%pts.length],[ey,ex]=pts[(q*2+1)%pts.length];
  for(const [m,o] of modes){
    const oa=o?JSON.parse(JSON.stringify(o)):undefined, ob=o?JSON.parse(JSON.stringify(o)):undefined;
    const ra=A.M.dijkstra(a.G,a.bc,a.bn,sy,sx,ey,ex,m,oa), rb=B.M.dijkstra(b.G,b.bc,b.bn,sy,sx,ey,ex,m,ob);tot++;
    const ja=JSON.stringify([ra,a.G.__waitSrc,a.G.liveCost,a.G.rtwStat,a.G.waitLog,a.G.__djLastBd]),jb=JSON.stringify([rb,b.G.__waitSrc,b.G.liveCost,b.G.rtwStat,b.G.waitLog,b.G.__djLastBd]);
    if(ja!==jb){diff++;if(diff<3)console.log('DIFF',tag,q,m,'\n',ja.slice(0,300),'\n',jb.slice(0,300))}
  }
}
for(const sc of ['acc','rtw+acc','acc-grow','rtw-swap','live-mid']){
  const a=mk(A),b=mk(B);
  addAcc(a.G,A.rows,5,sc==='acc-grow'?40:400);addAcc(b.G,B.rows,5,sc==='acc-grow'?40:400);
  if(sc.startsWith('rtw')){setRtw(a.G,A.rows,6);setRtw(b.G,B.rows,6)}
  for(let q=0;q<N;q++){
    if(sc==='acc-grow'&&q%8===4){addAcc(a.G,A.rows,100+q,150);addAcc(b.G,B.rows,100+q,150)}
    if(sc==='rtw-swap'&&q%10===5){setRtw(a.G,A.rows,200+q);setRtw(b.G,B.rows,200+q)}
    if(sc==='live-mid'&&q===Math.floor(N/2)){for(const L of [a,b]){L.G.live={};const g=rnd(3);const rows=L===a?A.rows:B.rows;for(let i=0;i<300;i++){const row=rows[Math.floor(g()*rows.length)];const id=row.node_id;const m={__names:[],__id:id};m[row.route_no]=[Math.floor(g()*600)+30,Math.floor(g()*900)+700];L.G.live[norm(id)]=m}L.G.liveCost={hit:0,missed:0,unknown:0}}}
    step(a,b,q,sc);
  }
  console.log(sc,'diff so far',diff,'of',tot,'waitLog keys',Object.keys(a.G.waitLog||{}).length);
}
