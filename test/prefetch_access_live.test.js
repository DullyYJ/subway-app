'use strict';
// route-v2 prefetchAccessLive 단계 조회(s201) — 앞 3곳만 먼저, 버스 잡힌 곳이 2곳 미만일 때만 6곳까지 넓힌다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const W = fs.readFileSync(path.join(__dirname, '..', 'engine/route-v2-worker.ascii.js'), 'utf8');
const a = W.indexOf('async function prefetchAccessLive('), b = W.indexOf('__name(prefetchAccessLive', a);
if (a < 0 || b < 0) throw new Error('prefetchAccessLive 를 찾지 못함');
const src = W.slice(a, b);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
async function run(spec) {
  const calls = [], usage = {}, cache = new Map();
  const ctx = {
    LIVE_ACCESS_STOPS: 6, LIVE_ACCESS_FIRST: 3, LIVE_BUDGET_REF: { used: 0 }, __name: (f) => f, TOWARD_MIN_M: 0, Infinity,
    accessNodes: () => spec.stops.map((id, i) => ['B|' + id, 60 + i * 30]),
    stopHasCircular: () => false, towardGain: () => 999,
    stopNorm: (x) => String(x), routesAtStop: () => null,
    coordOfG: () => null,
    budgetLeft: () => spec.left == null ? 2500 : spec.left,
    liveCacheGet: (k) => cache.get(k) || null, liveCacheSet: (k, m) => cache.set(k, m),
    usageAdd: (k) => { usage[k] = (usage[k] || 0) + 1; },
    fetchStopArrivalsAny: async (cc, sid) => {
      calls.push(sid);
      const r = spec.res[sid];
      if (r === 'err') throw new Error('boom');
      return { __names: r ? ['1'] : [], __id: sid };
    },
    Object, Math, String, Array, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.fn = prefetchAccessLive;', ctx);
  const G = { _allowBus: [], stopCity: {}, _baseCustom: !!spec.custom };
  for (const s of spec.stops) G.stopCity[s] = '11';
  const stat = {};
  await ctx.fn(G, {}, 37, 127, 37.1, 127.1, {}, stat, Date.now() + 3000);
  return { calls, usage, stat, G };
}
(async () => {
  const S6 = ['a', 'b', 'c', 'd', 'e', 'f'];
  let r = await run({ stops: S6, res: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 } });
  ok(r.calls.length === 3 && r.calls.join() === 'a,b,c', '버스 잡히면 3곳만 조회: ' + r.calls);
  ok(r.usage['pre.narrow'] === 1 && !r.stat.preWide, '좁게 끝남 표시');
  ok(Object.keys(r.G.accessSec).length === 6, '접근 시간은 6곳 모두 기록');
  r = await run({ stops: S6, res: { a: 1, b: 0, c: 0, d: 1, e: 1, f: 0 } });
  ok(r.calls.length === 6 && r.stat.preWide === true && r.usage['pre.wide'] === 1, '버스 1곳뿐이면 6곳까지 넓힘: ' + r.calls);
  r = await run({ stops: S6, res: { a: 0, b: 0, c: 0, d: 1, e: 1, f: 1 } });
  ok(r.calls.length === 6, '앞 3곳에 버스가 없으면 넓힘');
  r = await run({ stops: S6, res: { a: 'err', b: 'err', c: 'err', d: 1, e: 1, f: 1 } });
  ok(r.calls.length === 3, '앞 3곳 모두 오류면 넓혀도 소용없어 멈춤');
  r = await run({ stops: S6, res: { a: 'err', b: 1, c: 0, d: 1, e: 1, f: 1 } });
  ok(r.calls.length === 6, '일부 오류+버스 1곳이면 넓힘');
  r = await run({ stops: ['a', 'b', 'c'], res: { a: 0, b: 0, c: 0 } });
  ok(r.calls.length === 3 && !r.usage['pre.wide'] && !r.usage['pre.narrow'], '후보 3곳 이하는 기존 그대로');
  r = await run({ stops: S6, res: { a: 1, b: 0, c: 0, d: 1, e: 1, f: 1 }, left: 800 });
  ok(r.calls.length === 3 , '남은 시간 900ms 이하면 넓히지 않음');
  r = await run({ stops: S6, res: { a: 1, b: 1, c: 1 }, custom: true });
  ok(r.calls.length === 0, '예상 시각 모드는 조회 없음');
  console.log('prefetch_access_live: pass', pass, 'fail', fail);
  process.exit(fail ? 1 : 0);
})();
