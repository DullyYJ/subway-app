export function nameOf(s){return s.stationName||s.n||s.name}
export function anomalies(res){
  const out=[]; const paths=(res&&res.result&&res.result.path)||[];
  paths.forEach((p,pi)=>{
    const seq=[];
    (p.subPath||[]).forEach((sp,si)=>{
      if(sp.trafficType!==1) return;
      const ns=((sp.passStopList||{}).stations||[]).map(nameOf);
      const dup=ns.filter((n,i)=>ns.indexOf(n)!==i);
      if(dup.length) out.push({pi,tab:p.info&&p.info.tab,type:'dupInLeg',leg:si,line:(sp.lane&&sp.lane[0]||{}).name,dup:[...new Set(dup)],stops:ns.join('>')});
      const ss=sp.stopSec||[]; for(let i=1;i<ss.length;i++) if(ss[i]<ss[i-1]){out.push({pi,tab:p.info&&p.info.tab,type:'timeBack',leg:si,line:(sp.lane&&sp.lane[0]||{}).name});break;}
      ns.forEach(n=>seq.push([n,si]));
    });
    // station revisited in different legs (transfer stations excluded)
    const legsS=(p.subPath||[]).map((sp,si)=>sp.trafficType===1?{si,ns:((sp.passStopList||{}).stations||[]).map(nameOf)}:null).filter(Boolean);
    const seen={};
    legsS.forEach((L,li)=>{ L.ns.forEach((n,ix)=>{
      const isXferEnd=(ix===L.ns.length-1&&li<legsS.length-1)||(ix===0&&li>0);
      if(seen[n]!==undefined&&seen[n]!==li&&!isXferEnd&&!(seen[n]===li-1&&ix===0)) out.push({pi,tab:p.info&&p.info.tab,type:'revisit',name:n,legs:[seen[n],li]});
      seen[n]=li; }); });
  });
  return out;
}
