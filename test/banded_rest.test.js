// 정류장 상한(3만) 위도 띠 균등 추출(bandedRest) 검증: 가짜 D1로 동작만 확인
const fs = require('fs'), path = require('path'), assert = require('assert');
const W = fs.readFileSync(path.join(__dirname, '..', 'engine/route-v2-worker.ascii.js'), 'utf8');
const a = W.indexOf('async function bandedRest'), b = W.indexOf('__name(bandedRest');
assert(a > 0 && b > a, 'bandedRest 소스를 찾지 못함');
const MAX_STOPS = +W.match(/var MAX_STOPS = ([0-9e]+);/)[1], BD_K = +W.match(/var BD_K = (\d+);/)[1];
assert.strictEqual(/var BD_DEFAULT = "off";/.test(W), true, '기본값은 꺼짐이어야 함');
// 자동 모드(bd=auto)는 3만에 닿았을 때만 띠 조회를 한다 → 다른 지역(상한 미달)은 기존 한 번 조회 그대로
assert.ok(/_bdMode === "auto" && !_rr\.e && !_nr\.e && rows\.length >= MAX_STOPS/.test(W), '자동 모드 조건');
assert.ok(/const _restP = _bdMode === "force" \? bandedRest/.test(W), '강제 모드만 나머지 조회를 대체');
const bandedRest = new Function('MAX_STOPS', 'BD_K', 'return (' + W.slice(a, b).replace(/^async function bandedRest/, 'async function') + ')')(MAX_STOPS, BD_K);

function fakeDb(rows) {
  let calls = 0;
  const sorted = rows.slice().sort((x, y) => x.lat - y.lat || x.lng - y.lng);
  return {
    calls: () => calls,
    prepare() {
      return { bind(la, lb, na, nb, lim) {
        return { all: async () => { calls++; const r = sorted.filter(x => x.lat >= la && x.lat <= lb && x.lng >= na && x.lng <= nb).slice(0, lim); return { results: r, meta: { duration: 1, rows_read: r.length } }; } };
      } };
    }
  };
}
const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ route_key: 'r' + (i % 977), seq: i, lat: f(i), lng: 127 + (i % 100) * 1e-4 }));
(async () => {
  // 1) 균등 분포 13만 개: 3만 개가 위도 전 구간에서 고르게 나와야 함(기존 방식은 남쪽 39%만)
  const dense = mk(130000, (i) => 37 + (i / 130000) * 0.5);
  const d1 = {}; const r1 = await bandedRest(fakeDb(dense), '', 37, 37.5, 126.9, 127.1, d1);
  const out1 = r1.q.results; assert.strictEqual(out1.length, MAX_STOPS);
  const maxLat = Math.max(...out1.map(x => x.lat));
  assert(maxLat > 37.45, '북쪽 끝까지 포함해야 함: ' + maxLat);
  const north = out1.filter(x => x.lat > 37.25).length;
  assert(north > MAX_STOPS * 0.4 && north < MAX_STOPS * 0.6, '남북 비율 균등: ' + north);
  assert.strictEqual(d1.bd.trunc, true);
  // 2) 성긴 지역: 전부 가져오고 잘림 표시 없음, 2차 조회 없음
  const sparse = mk(5000, (i) => 37 + (i / 5000) * 0.5);
  const d2 = {}; const r2 = await bandedRest(fakeDb(sparse), '', 37, 37.5, 126.9, 127.1, d2);
  assert.strictEqual(r2.q.results.length, 5000); assert.strictEqual(d2.bd.trunc, false); assert.strictEqual(d2.bd.r2, 0);
  // 3) 한 띠만 아주 빽빽(몰림): 2차 조회로 남는 예산을 그 띠에 더 배정, 합계 3만 미만이면 잘림 표시
  const crowd = mk(20000, (i) => 37 + (i / 20000) * 0.05).concat(mk(3000, (i) => 37.2 + (i / 3000) * 0.3));
  const d3 = {}; const r3 = await bandedRest(fakeDb(crowd), '', 37, 37.5, 126.9, 127.1, d3);
  assert.strictEqual(d3.bd.r2, 1); assert(r3.q.results.length > 5625 + 3000, '2차 조회로 더 가져옴: ' + r3.q.results.length);
  const keys = new Set(r3.q.results.map(x => x.route_key + '|' + x.seq)); assert.strictEqual(keys.size, r3.q.results.length, '중복 없음');
  // 4) 오류 전달
  const bad = { prepare: () => ({ bind: () => ({ all: async () => { throw new Error('boom'); } }) }) };
  const r4 = await bandedRest(bad, '', 37, 37.5, 126.9, 127.1, {}); assert(r4.e);
  console.log('banded_rest ok');
})().catch((e) => { console.error(e); process.exit(1); });
