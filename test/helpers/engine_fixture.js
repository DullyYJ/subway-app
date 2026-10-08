// 엔진(route-v2-app) 응답 모의 — 실제 응답 구조(info/subPath, trafficType 1 지하철·2 버스·3 도보)를 따른다. 좌표는 노선별로 겹치지 않게 일직선으로 놓는다.
const st=(n,x,y)=>({stationName:n,x,y});
const walk=(a,b,min,s0)=>({trafficType:3,sectionTime:min,startSec:s0,arriveSec:s0,endSec:s0+min*60,distance:0,lane:[{name:'도보'}],startName:a,endName:b,startX:126.97,startY:37.55,endX:126.98,endY:37.54});
const sub=(line,names,s0,gap,o)=>{o=o||0;const sts=names.map((n,i)=>st(n,126.97+(i+o)*0.01,37.55-(i+o)*0.01));const stopSec=names.map((_,i)=>s0+i*gap);return {trafficType:1,sectionTime:Math.round((names.length-1)*gap/60),startSec:s0,arriveSec:s0,endSec:s0+(names.length-1)*gap,stopSec,distance:0,lane:[{name:line}],startName:names[0],endName:names[names.length-1],startX:sts[0].x,startY:sts[0].y,endX:sts[sts.length-1].x,endY:sts[sts.length-1].y,passStopList:{stations:sts},xpWaitSec:null,waitSec:null,waitReal:false,waitLive:false,waitEstimated:false,boardStopId:null}};
const bus=(no,names,s0,gap)=>{const x=sub('',names,s0,gap);x.trafficType=2;x.lane=[{busNo:no}];x.waitSec=300;x.boardStopId='GGB1';return x};
function resp(){
  const a=['서울역','남영','용산','노량진','대방','신길'];
  const fast={info:{totalTime:50,totalDistance:0,transferCount:1,pathType:3,tab:'fast',svcWarn:null,longDist:false,trip:{from:'서울역',to:'수원역',arrSec:3000}},subPath:[walk('내 위치','서울역',4,0),sub('1호선',a,240,150),walk('환승','신길',3,990),sub('5호선',['신길','여의도','마포'],1170,180,5),walk('마포','도착지',3,1530)]};
  const less=JSON.parse(JSON.stringify(fast)); less.info.tab='less'; less.info.totalTime=53;
  const w=JSON.parse(JSON.stringify(fast)); w.info.tab='walk'; w.info.totalTime=55;
  const s=JSON.parse(JSON.stringify(fast)); s.info.tab='sub'; s.info.pathType=1; s.info.totalTime=52;
  const b={info:{totalTime:70,totalDistance:0,transferCount:1,pathType:2,tab:'bus',svcWarn:null,longDist:false,trip:{from:'서울역',to:'수원역',arrSec:4200}},subPath:[walk('내 위치','서울역버스환승센터',1,0),bus('9003',['서울역버스환승센터','숭례문','순천향대학병원'],510,300),bus('8800',['순천향대학병원','아주대','매탄'],1500,200),walk('매탄','도착지',1,2100)]};
  return {result:{path:[fast,less,w,s,b]},hasBusOnly:true,engVer:'test',engineVersion:'test',warnings:[],liveStat:{}};
}
module.exports={resp};
