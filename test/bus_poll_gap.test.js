// 버스 도착 자동 갱신 간격 조절 시험 — 임박(30초)·먼 도착(60초)·화면 밖(90초)
// 실행: node test/bus_poll_gap.test.js [html 경로]
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
const a = html.indexOf('var _BUS_FAR_SEC'), bMark = 'window._refreshMapBusArrivals = _refreshMapBusArrivals;';
const b = html.indexOf(bMark, a);
assert(a > 0 && b > a, '대상 코드를 찾지 못함');
const code = html.slice(a, b + bMark.length);
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', e.message); } };

function mk() {
  const calls = [];
  const cardsView = {};                       // cardIdx -> {inView, hidden}
  const win = { innerHeight: 800, _mapBusCards: [], _busLastFetchAt: {} };
  const ctx = {
    window: win, Date: { now: () => ctx.__now }, isFinite, Infinity, Math,
    _BUSARR: {},
    document: {
      documentElement: { clientHeight: 800 },
      getElementById: (id) => {
        const m = /^mapBusCard_(.+)$/.exec(id); if (!m) return null;
        const v = cardsView[m[1]]; if (!v) return null;
        return { offsetParent: v.hidden ? null : {}, getBoundingClientRect: () => v.inView ? { top: 100, bottom: 200 } : { top: 1500, bottom: 1600 } };
      }
    },
    _loadMapBusArrival: (stop, idx) => { calls.push([ctx.__now, idx]); win._busLastFetchAt[idx] = ctx.__now; },
    __now: 1_000_000
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, win, calls, cardsView };
}
const addCard = (m, idx, rem, view) => {
  m.win._mapBusCards.push({ stop: {}, cardIdx: idx });
  m.cardsView[idx] = view || { inView: true };
  if (rem != null) m.ctx._BUSARR['busarr_' + idx + '_R1_1'] = { sec: rem, at: m.ctx.__now };
};
const run = (m, ticks) => { const out = []; for (let i = 0; i < ticks; i++) { m.ctx.__now += 30000; const n = m.calls.length; m.ctx.window._refreshMapBusArrivals(); out.push(m.calls.length - n); } return out; };

console.log('[간격 결정]');
t('임박(2분)·화면 안: 매 틱 조회', () => { const m = mk(); addCard(m, 'near_0', 120); assert.deepStrictEqual(run(m, 4), [1, 1, 1, 1]); });
t('먼 도착(15분)·화면 안: 60초마다(두 틱에 한 번)', () => { const m = mk(); addCard(m, 'near_0', 900); assert.deepStrictEqual(run(m, 4), [1, 0, 1, 0]); });
t('도착 정보 없음·화면 안: 60초마다', () => { const m = mk(); addCard(m, 'near_0', null); assert.deepStrictEqual(run(m, 4), [1, 0, 1, 0]); });
t('화면 밖: 90초마다(세 틱에 한 번)', () => { const m = mk(); addCard(m, 'near_0', 120, { inView: false }); assert.deepStrictEqual(run(m, 6), [1, 0, 0, 1, 0, 0]); });
t('숨은 탭(offsetParent 없음): 90초마다', () => { const m = mk(); addCard(m, 'near_0', 120, { hidden: true }); assert.deepStrictEqual(run(m, 6), [1, 0, 0, 1, 0, 0]); });
t('경계: 정확히 10분은 임박으로 본다(매 틱)', () => { const m = mk(); addCard(m, 'near_0', 600 + 30); /* 한 틱 흐르면 600 */ const r = run(m, 1); assert.strictEqual(r[0], 1); });
t('카운트다운이 흘러 10분 안으로 들어오면 매 틱으로 전환', () => {
  const m = mk(); addCard(m, 'near_0', 700);
  const r = run(m, 8);            // 4분 경과: 700→460초
  assert(r.slice(0, 4).reduce((x, y) => x + y) < 4 && r[7] === 1 && r[6] === 1, JSON.stringify(r));
});
t('카드 번호 접두 충돌 없음(near_1 / near_10)', () => {
  const m = mk(); addCard(m, 'near_1', 900); addCard(m, 'near_10', 60);
  assert.strictEqual(m.ctx.window._refreshMapBusArrivals !== undefined, true);
  // near_1 의 최소 남은 시간이 near_10 값(60초)에 끌려가지 않아야 한다 → near_1 은 60초 간격
  const r = run(m, 2); assert.strictEqual(r[0], 2); assert.strictEqual(r[1], 1);
});
t('DOM 에 없는 카드는 조회하지 않는다', () => { const m = mk(); m.win._mapBusCards.push({ stop: {}, cardIdx: 'gone' }); assert.deepStrictEqual(run(m, 2), [0, 0]); });
t('최초 조회 기록이 없으면(처음) 바로 조회', () => { const m = mk(); addCard(m, 'near_0', 900); assert.strictEqual(run(m, 1)[0], 1); });

console.log(`\n${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
