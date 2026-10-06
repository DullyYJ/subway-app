const fs=require('fs'); const [oldF,newF]=process.argv.slice(2);
const A=JSON.parse(fs.readFileSync(oldF)), B=JSON.parse(fs.readFileSync(newF));
function metrics(sc){ const r=sc.rec.filter(x=>!x.err); let abs=[],early=0,here2=0,rise=0,jump=0,prevErr=null,prevRem=null,prevAt=null,maxAbs=0,lateErr=[];
  r.forEach((x,i)=>{ abs.push(Math.abs(x.etaErr)); maxAbs=Math.max(maxAbs,Math.abs(x.etaErr)); if(x.etaErr<-2) early++; if(x.trueIdx>=0 && x.here>=0 && Math.abs(x.here-x.trueIdx)>=2) here2++;
    const rem=x.etaErr+ (sc.destTruth - x.at/60) ; // eta - now
    if(prevRem!=null){ const elapsed=(x.at-prevAt)/60; if(rem-(prevRem-elapsed)>1.0) rise++; } prevRem=rem; prevAt=x.at; if(prevErr!=null && Math.abs(x.etaErr-prevErr)>1.5) jump++; prevErr=x.etaErr; });
  const half=r.slice(Math.floor(r.length/2)); half.forEach(x=>lateErr.push(Math.abs(x.etaErr)));
  return {jump,mean:abs.reduce((a,b)=>a+b,0)/Math.max(1,abs.length),max:maxAbs,early,here2,rise,lastErr:r.length?Math.abs(r[r.length-1].etaErr):0,errs:sc.rec.filter(x=>x.err).length,n:r.length}; }
function boardEarly(sc){ let c=0; sc.rec.filter(x=>!x.err).forEach(x=>{ if(!x.tl) return; const p=x.tl[sc.firstTransit].split(':'); const shown=(+p[0])*60+(+p[1]); if(x.at/60>=sc.truthBoard && shown < sc.truthBoard-2) c++; }); return c; }
const be=(O)=>O.out.reduce((a,s)=>a+boardEarly(s),0);
console.log('첫 승차 시각이 실제 승차보다 2분 넘게 이른 표시 횟수  수정전:',be(A),' 수정후:',be(B));
const agg=(arr)=>{const s=(f)=>arr.reduce((a,m)=>a+f(m),0); return {시나리오:arr.length,평균오차분:+(s(m=>m.mean)/arr.length).toFixed(2),최악오차분:+Math.max(...arr.map(m=>m.max)).toFixed(1),'2분이상일찍표시한횟수':s(m=>m.early),'오버레이2역이상벗어남':s(m=>m.here2),'남은시간1분이상역주행':s(m=>m.rise),'도착예정1.5분초과튀김':s(m=>m.jump),'도착직전오차평균':+(s(m=>m.lastErr)/arr.length).toFixed(2),JS오류:s(m=>m.errs)+A.errs.length*0}; };
const ma=A.out.map(metrics), mb=B.out.map(metrics);
console.log('전체 JS 페이지 오류  수정전:',A.errs.length,' 수정후:',B.errs.length);
console.log('수정 전',JSON.stringify(agg(ma)));
console.log('수정 후',JSON.stringify(agg(mb)));
const kinds=[...new Set(A.out.map(s=>s.kind))];
console.log('\n경로유형별 (평균오차분 / 2분이상일찍 / 오버레이벗어남 / 남은시간역주행 / 튐)  수정전 → 수정후');
kinds.forEach(k=>{ const ia=A.out.map((s,i)=>s.kind===k?i:-1).filter(i=>i>=0); const f=(m,ids)=>{const a=ids.map(i=>m[i]);const s=(g)=>a.reduce((x,y)=>x+g(y),0);return `${(s(y=>y.mean)/a.length).toFixed(2)} / ${s(y=>y.early)} / ${s(y=>y.here2)} / ${s(y=>y.rise)} / ${s(y=>y.jump)}`}; console.log(k.padEnd(34),`n=${ia.length}`.padEnd(5),f(ma,ia),'  →  ',f(mb,ia)); });
// 악화된 시나리오
const worse=[]; ma.forEach((m,i)=>{ if(mb[i].mean>m.mean+0.3 || mb[i].here2>m.here2 || mb[i].rise>m.rise) worse.push({sc:i,kind:A.out[i].kind,전:m,후:mb[i]}); });
console.log('\n수정 후 더 나빠진 시나리오:',worse.length); worse.slice(0,8).forEach(w=>console.log(JSON.stringify({sc:w.sc,kind:w.kind,전평균:+w.전.mean.toFixed(2),후평균:+w.후.mean.toFixed(2),전here2:w.전.here2,후here2:w.후.here2,전rise:w.전.rise,후rise:w.후.rise})));
