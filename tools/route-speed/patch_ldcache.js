// ld(장거리) 캐시 콜드 I/O 단축: KV 3-way 병렬 읽기 + 엣지 cacheTtl + fast(live=0) 미스 메모. 결과값 불변(데이터 동일, 대기만 감소).
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
function rep(a,b,n){const c=s.split(a).length-1;if(c!==(n||1))throw new Error('anchor '+c+' '+a.slice(0,60));s=s.split(a).join(b);}
// 1) 시그니처 + 호출부(stat 전달)
rep('async function ldTagoCached(mode, depId, arrId, ymd, env, ctx, fetcher) {','async function ldTagoCached(mode, depId, arrId, ymd, env, ctx, stat, fetcher) {');
rep('ldTagoCached("train", depId, arrId, ymd, env, ctx, async function() {','ldTagoCached("train", depId, arrId, ymd, env, ctx, stat, async function() {',2);
rep('ldTagoCached("expbus", depId, arrId, ymd, env, ctx, async function() {','ldTagoCached("expbus", depId, arrId, ymd, env, ctx, stat, async function() {');
rep('ldTagoCached("subbus", depId, arrId, ymd, env, ctx, async function() {','ldTagoCached("subbus", depId, arrId, ymd, env, ctx, stat, async function() {');
// 2) 전역 미스 메모
rep('var LD_TAGO_NEG_TTL_MS = 30 * 60 * 1e3;','var LD_TAGO_NEG_TTL_MS = 30 * 60 * 1e3;\nvar LD_MISS = /* @__PURE__ */ new Map();\nvar LD_MISS_TTL_MS = 60 * 1e3;');
// 3) 본문
rep(`  if (env && env.ROWS_KV) {
    try {
      var kvs = await Promise.all([env.ROWS_KV.get("ld:" + k, "json"), env.ROWS_KV.get("ldn:" + k)]);
      var kv = kvs[0];`,`  var __fast = !!(stat && stat.ldFast);
  var __dk0 = ldDtKey(mode, depId, arrId, ymd);
  var __dt0 = null;
  var __dtDone = false;
  if (__fast) {
    var __ms = LD_MISS.get(k);
    if (__ms && Date.now() - __ms < LD_MISS_TTL_MS && !LD_TAGO_DT.get(__dk0)) {
      return { items: await fetcher(), via: null };
    }
  }
  if (env && env.ROWS_KV) {
    try {
      var __needDt = !LD_TAGO_DT.get(__dk0);
      var kvs = await Promise.all([env.ROWS_KV.get("ld:" + k, { type: "json", cacheTtl: 60 }), env.ROWS_KV.get("ldn:" + k, { cacheTtl: 60 }), __needDt ? env.ROWS_KV.get("ld2:" + __dk0, { type: "json", cacheTtl: 60 }).catch(function() {
        return null;
      }) : null]);
      __dt0 = kvs[2];
      __dtDone = __needDt;
      var kv = kvs[0];`);
rep(`  var dk = ldDtKey(mode, depId, arrId, ymd);
  var dtRec = await ldDtGet(dk, env);`,`  var dk = __dk0;
  if (__dt0 && __dt0.items && __dt0.items.length && __dt0.ymd && !LD_TAGO_DT.get(dk)) LD_TAGO_DT.set(dk, __dt0);
  var dtRec = __dtDone ? LD_TAGO_DT.get(dk) || null : await ldDtGet(dk, env);`);
rep(`  var items = await fetcher();
  if (Array.isArray(items) && !items.length) {
    LD_TAGO_NEG.set(k, Date.now());`,`  var items = await fetcher();
  if (__fast && !items && env && env.ROWS_KV) {
    LD_MISS.set(k, Date.now());
    if (LD_MISS.size > 600) LD_MISS.clear();
  }
  if (Array.isArray(items) && !items.length) {
    LD_TAGO_NEG.set(k, Date.now());`);
fs.writeFileSync(process.argv[3],s);console.log('ok ldcache');
