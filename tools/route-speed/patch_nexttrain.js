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
const code='// ===== next-train 시작 =====\n'+body('holidays-data.js')+'\n'+body('holidays.js')+'\n'+body('next-train-data.js')+'\n'+body('next-train-tt.js')+'\n'+body('next-train.js')+'\n'+body('next-train-worker.js')+'\n// ===== next-train 끝 =====\n';
rep('async function handleFetch(request, env, ctx) {',code+'async function handleFetch(request, env, ctx) {');
rep('\n  if (url.pathname === "/ride-eta") return handleRideEta(request);','\n  if (url.pathname === "/ride-eta") return handleRideEtaNT(request, env);\n  if (url.pathname === "/next-train") return handleNextTrain(request, env);\n  if (url.pathname === "/holidays") return handleHolidays(request, env);');
// 공휴일 단일 출처: 요청마다(1시간에 한 번만 실제로 KV 를 읽음) 최신 공휴일을 확보 — 장거리(KTX) 요일 판정도 같은 자료를 쓴다
rep('async function handleFetch(request, env, ctx) {',  'async function handleFetch(request, env, ctx) {\n  try { await holEnsure(env); } catch (e) {}');
// 장거리 시간표의 옛 고정 공휴일 목록(2026·2027 일부만, 일부 틀림)을 없애고 holIs 를 쓴다
{ const re=/var LD_HOLIDAYS = \{\};\n"[0-9 ]+"\.split\(" "\)\.forEach\(function\(h\) \{\n  LD_HOLIDAYS\[h\] = 1;\n\}\);\nfunction ldIsHolidayYmd\(ymd\) \{\n  return !!LD_HOLIDAYS\[ymd\];\n\}/;
  if(!re.test(s)) throw new Error('anchor LD_HOLIDAYS'); s=s.replace(re,'function ldIsHolidayYmd(ymd) {\n  return holIsYmd(ymd);\n}'); }
rep('if (LD_HOLIDAYS[d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0")]) return "SUN";','if (holIs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())) return "SUN";');
rep('    await xferAnnotateAll(env, _od, ctx);\n    _od.rtwApplied','    await xferAnnotateAll(env, _od, ctx);\n    await ntAttachAll(env, _od, _baseMs, p.get("bf") === "1");\n    _od.rtwApplied');
// 공휴일을 모르던 요일 판정들 — 공휴일이면 일요일로 본다(버스 배차간격 itv_sun, 지하철 첫차·막차의 주말 여부)
rep('const nowMin = _t.getUTCHours() * 60 + _t.getUTCMinutes(), dow = _t.getUTCDay();','const nowMin = _t.getUTCHours() * 60 + _t.getUTCMinutes(), dow = holDowKST(G._baseMs);');
rep('const dow = new Date(_abBaseMs + 324e5).getUTCDay();','const dow = holDowKST(_abBaseMs);');
rep('var dk = new Date(acc + 324e5).getUTCDay();','var dk = holDowKST(acc);');
rep('var dk = new Date(arrMs + 324e5).getUTCDay();','var dk = holDowKST(arrMs);');
rep('const _dk = new Date(_baseMs + 324e5).getUTCDay();','const _dk = holDowKST(_baseMs);');
fs.writeFileSync(process.argv[3],s);console.log('ok-nt');

