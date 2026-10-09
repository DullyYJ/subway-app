// 노선 방향 정답 대조 — KRIC 열차별 정차 순서로 알아낸 '이 역에서 다음 역으로 가는 열차'의 출발 시각이 엔진이 고른 방향 키(상/하)의 시각표와 맞는지 본다.
// 갈라지는 노선이라 방향 힌트(_TT_ORIENT)를 못 만들어 엔진이 시각표 상관으로 방향을 판정한다 — 그 판정이 맞는지 재는 도구. 사용: node tools/collect-tt/k4_truth.js <번들.json> <kric.json(KR:K4 포함)>
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const W=require(root+'/test/helpers/nt_load')();
const B=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const d=B.data; const KRIC=process.argv[3];
const L=process.argv[4]||'경의중앙선'; const SRC=new Set((process.argv[5]||'KR|K4').split(','));   // 사용: … <번들> <kric.json> <노선> <opr|ln,opr|ln…>
const nz=n=>String(n||'').replace(/\(.*?\)/g,'').replace(/역$/,'').replace(/\s+/g,'').trim();
const rows=JSON.parse(fs.readFileSync(KRIC,'utf8')).filter(r=>SRC.has(r.opr+'|'+r.ln)&&r.day==='8');
const toMin=s=>{if(!s||s.length<6)return null;let m=+s.slice(0,2)*60+ +s.slice(2,4);if(m<180)m+=1440;return m;};
const trains={};
for(const r of rows) for(const ln of String(r.data).split('\n').filter(Boolean)){const [trn,arr,dep,org,dst]=ln.split(',');const t=toMin(dep)??toMin(arr);if(t==null)continue;(trains[trn]=trains[trn]||[]).push({st:nz(r.nm),t,dst});}
const pairs={}; // "A>B" -> [dep times at A]
for(const trn in trains){const a=trains[trn].sort((x,y)=>x.t-y.t);for(let i=0;i+1<a.length;i++){if(a[i+1].t-a[i].t>20)continue;(pairs[a[i].st+'>'+a[i+1].st]=pairs[a[i].st+'>'+a[i+1].st]||[]).push(a[i].t);}}
const dec=a=>{let p=0;return a.map(x=>p+=x)};
const nt=W.ntCreate({_REAL_TT:d._REAL_TT,_GIMPO_TT:d._GIMPO_TT,_BUILTIN_TT:d._BUILTIN_TT,LINE_SCHEDULE:d.LINE_SCHEDULE,_REAL_SEG:d._REAL_SEG,_TT_ORDER_HARD:d._TT_ORDER_HARD,_TT_ORIENT:d._TT_ORIENT,_INCHEON_TT:W.NT_INCHEON_TT,STNORDER:W.NT_STNORDER});
let tot=0,bad=0,nul=0,skip=0,weak=0;const badL=[],weakL=[];
const MS=Date.UTC(2026,9,14,4,0);
for(const k in pairs){const [A,Bn]=k.split('>');if(pairs[k].length<10){skip++;continue;}const rec=d._REAL_TT[L+'|'+A];if(!rec||!rec.D||!d._REAL_TT[L+'|'+Bn]){skip++;continue;}
 const sd=nt.segDir(L,[{stationName:A},{stationName:Bn}],MS);tot++;
 if(!sd){nul++;badL.push(k+' 판정없음');continue;}
 const key=sd==='상행'?'상':'하', other=key==='상'?'하':'상';
 const hitOf=kk=>{const bt=rec.D[kk]?dec(rec.D[kk]):[];return pairs[k].filter(t=>bt.some(x=>Math.abs(x-t)<=2)).length/pairs[k].length;};
 const hit=hitOf(key), oh=hitOf(other);
 if(oh>hit+0.1){bad++;badL.push(k+' 방향틀림 '+sd+' 일치'+Math.round(hit*100)+'% (반대쪽 '+Math.round(oh*100)+'%)');}
 else if(hit<0.8){weak++;weakL.push(k+' '+Math.round(hit*100)+'%');}}
console.log(L+' 인접쌍',tot,'방향틀림',bad,'판정없음',nul,'시각일치낮음(<80%, 방향은 맞음)',weak,'제외',skip);console.log(badL.join('\n'));console.log('낮은 곳 예:',weakL.slice(0,10).join(' '));
