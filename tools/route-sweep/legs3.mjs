import {route,B} from './sweep.mjs';
const S=B.stations; const [l1,n1,l2,n2,ts,tab]=process.argv.slice(2);
const find=(l,n)=>Object.values(S).find(s=>s.l===l&&s.n===n);
const r=await route(find(l1,n1),find(l2,n2),Date.parse(ts+':00+09:00'));
const p=r.result.path.find(x=>x.info.tab===(tab||'fast'));
console.log(p.info.tab,p.info.totalTime);
for(const g of p.subPath){const ps=(g.passStopList&&g.passStopList.stations||g.passStopList||[]).map(x=>x.stationName||x.name||x);
 console.log(g.trafficType,g.lane&&JSON.stringify(g.lane).slice(0,60),g.startName,'->',g.endName,g.sectionTime+'m',g.trainChanges||'',ps.join(',').slice(0,300));}
