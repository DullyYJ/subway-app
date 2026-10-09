// s11: '다음 열차' 계산을 엔진으로 — engine/next-train.js + next-train-data.js + next-train-worker.js 를 handleFetch 앞에 넣고,
//   /route-v2-app 응답의 지하철 구간마다 ttWaitMs·nextTrain 을 붙이고, /next-train 라우트를 추가하고, /ride-eta 가 boardInfo 를 받으면 시각표를 채운다.
//   기존 응답 필드는 그대로이고 새 필드(ttWaitMs, nextTrain, ntVer, info.ttApplied)만 추가된다.
const fs=require('fs'),path=require('path');
let s=fs.readFileSync(process.argv[2],'utf8');
const ENG=process.env.ENGINE_DIR||path.join(__dirname,'..','..','engine');
function rep(a,b,n){const c=s.split(a).length-1;if(c!==(n||1))throw new Error('anchor '+c+' '+a.slice(0,70));s=s.split(a).join(b);}
function body(f){
  let t=fs.readFileSync(path.join(ENG,f),'utf8');
  t=t.replace(/^\s*['"]use strict['"];?\s*$/mg,'');
  t=t.replace(/^\s*if \(typeof module !== 'undefined' && module\.exports\)[^\n]*\n?/mg,'');
  t=t.replace(/^\s*module\.exports\s*=[^\n]*\n?/mg,'');
  return t;
}
const code='// ===== next-train 시작 =====\n'+body('next-train-data.js')+'\n'+body('next-train-tt.js')+'\n'+body('next-train.js')+'\n'+body('next-train-worker.js')+'\n// ===== next-train 끝 =====\n';
rep('async function handleFetch(request, env, ctx) {',code+'async function handleFetch(request, env, ctx) {');
rep('\n  if (url.pathname === "/ride-eta") return handleRideEta(request);','\n  if (url.pathname === "/ride-eta") return handleRideEtaNT(request, env);\n  if (url.pathname === "/next-train") return handleNextTrain(request, env);');
rep('    await xferAnnotateAll(env, _od, ctx);\n    _od.rtwApplied','    await xferAnnotateAll(env, _od, ctx);\n    await ntAttachAll(env, _od, _baseMs, p.get("bf") === "1");\n    _od.rtwApplied');
fs.writeFileSync(process.argv[3],s);console.log('ok-nt');
