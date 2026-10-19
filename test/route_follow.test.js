// 경로 요청 후속 지시 엔진(engine/route-follow.js) 시험 — 2026-10-19 (5번 3단계)
//   · 순수 함수의 판단이 예전 웹 규칙(_routeStaged · livePending 뒤따르기 · _estMissOf · _estRetry 의 '나아졌나')과 같은가
//   · Worker 에 내장된 본문이 모듈과 같은가 · /route-v2-app 응답 맨 앞에 follow 가 실리나 · pm/pa 를 읽나
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const M = require(path.join(root, 'engine/route-follow.js'));
const { routeFollow } = M;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

// 예전 웹 규칙을 그대로 옮긴 기준(www/index.html fmapDoRoute 의 _estMissOf)
function oldMiss(ls) { if (!ls) return 0; if (typeof ls.liveMissing === 'number') return ls.liveMissing; return ls.livePending ? 1 : 0; }

t('보통 응답: 그린다 · 뒤따를 것 없음 · 재조회 없음', () => {
  const f = routeFollow({ liveStat: { liveApplied: 2, liveMissing: 0 }, n: 3, ver: 'v' });
  assert.strictEqual(f.draw, true); assert.strictEqual(f.next, null); assert.strictEqual(f.retry, null);
  assert.strictEqual(f.miss, 0); assert.strictEqual(f.applied, 2); assert.strictEqual(f.n, 3); assert.strictEqual(f.v, 1); assert.strictEqual(f.ver, 'v');
  assert.ok(!('better' in f), 'pm 없으면 better 없음');
});
t('빠른 응답(livePending): 그리고 전체를 뒤따라 받는다 · miss=1 이라 재조회 목록도 있다', () => {
  const f = routeFollow({ liveStat: { livePending: true, liveSkipFast: true }, n: 2 });
  assert.strictEqual(f.draw, true); assert.strictEqual(f.next, 'full'); assert.strictEqual(f.miss, 1);
  assert.deepStrictEqual(f.retry, [12000, 16000, 20000]);
});
t('ldWait: 이 응답은 그리지 않고 전체를 받는다', () => {
  const f = routeFollow({ liveStat: { ldWait: true, livePending: true }, n: 1 });
  assert.strictEqual(f.draw, false); assert.strictEqual(f.next, 'full');
});
t('liveMissing 이 있으면 그 수가 miss 다(livePending 이어도 숫자가 우선)', () => {
  assert.strictEqual(routeFollow({ liveStat: { livePending: true, liveMissing: 3 } }).miss, 3);
  assert.strictEqual(routeFollow({ liveStat: { liveMissing: 2 } }).miss, 2);
});
t('기준시각을 직접 골랐으면(bf) 재조회 안 한다', () => {
  assert.strictEqual(routeFollow({ liveStat: { liveMissing: 2 }, bf: true }).retry, null);
  assert.deepStrictEqual(routeFollow({ liveStat: { liveMissing: 2 }, bf: false }).retry, [12000, 16000, 20000]);
});
t('재조회 목록은 호출마다 새 배열이다(바깥에서 고쳐도 상수가 안 변함)', () => {
  const a = routeFollow({ liveStat: { liveMissing: 1 } }); a.retry.push(1);
  assert.deepStrictEqual(routeFollow({ liveStat: { liveMissing: 1 } }).retry, [12000, 16000, 20000]);
});
t('나아졌나(better): miss 가 줄었다 / 같은데 applied 가 늘었다 / 그 밖엔 아니다 — 예전 웹 규칙과 같다', () => {
  const cases = [[3, 1, 2, 1], [2, 1, 2, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 0, 2, 0], [0, 0, 0, 0], [0, 5, 1, 0], [4, 2, 3, 9]];
  cases.forEach(c => {
    const m = c[0], ap = c[1], pm = c[2], pa = c[3];
    const f = routeFollow({ liveStat: { liveMissing: m, liveApplied: ap }, pm: pm, pa: pa });
    const old = (m < pm || (m === pm && ap > pa));
    assert.strictEqual(f.better, old, JSON.stringify(c));
  });
});
t('pm 이 문자열(쿼리)로 와도 읽고, 숫자가 아니면 better 를 만들지 않는다', () => {
  assert.strictEqual(routeFollow({ liveStat: { liveMissing: 0, liveApplied: 3 }, pm: '1', pa: '2' }).better, true);
  assert.ok(!('better' in routeFollow({ liveStat: {}, pm: 'abc', pa: '1' })));
  assert.ok(!('better' in routeFollow({ liveStat: {}, pm: null })));
  assert.ok(!('better' in routeFollow({ liveStat: {}, pm: '' })));
});
t('miss 가 예전 웹 _estMissOf 와 모든 조합에서 같다', () => {
  [undefined, {}, { livePending: true }, { liveMissing: 0 }, { liveMissing: 4 }, { liveMissing: 0, livePending: true }, { liveMissing: 'x', livePending: true }].forEach(ls => {
    assert.strictEqual(routeFollow({ liveStat: ls }).miss, oldMiss(ls), JSON.stringify(ls));
  });
});
t('입력이 비어도 죽지 않는다', () => {
  const f = routeFollow(); assert.strictEqual(f.draw, true); assert.strictEqual(f.n, 0); assert.strictEqual(f.miss, 0);
  routeFollow(null); routeFollow({ liveStat: null }); routeFollow({ n: -5, liveStat: { liveApplied: 'x' } });
});

// ── Worker 내장본 ──
const W = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 모듈 구간이 정확히 한 곳 내장돼 있다', () => {
  assert.strictEqual(W.split('// ===== route-follow (').length, 2);
  assert.strictEqual(W.split('// ===== route-follow \\ub05d =====').length, 2);
});
t('Worker 내장 본문이 모듈과 같은 판단을 한다(끝에서 끝까지)', () => {
  const a = W.indexOf('// ===== route-follow (');
  const s = W.indexOf('\n', a) + 1, e = W.indexOf('// ===== route-follow \\ub05d');
  const body = W.slice(s, e);
  assert.ok(!/[^\x00-\x7f]/.test(body), 'ASCII 만');
  const rf = new Function(body + '\nreturn routeFollow;')();
  const inputs = [
    { liveStat: { livePending: true }, n: 2, ver: 'x' }, { liveStat: { ldWait: true }, n: 0 },
    { liveStat: { liveMissing: 2, liveApplied: 1 }, n: 4, bf: true }, { liveStat: { liveMissing: 1, liveApplied: 3 }, pm: '2', pa: '0' }, {}
  ];
  inputs.forEach(i => assert.deepStrictEqual(rf(i), routeFollow(i), JSON.stringify(i)));
});
t('/route-v2-app 응답: follow 가 맨 앞 · pm/pa 를 요청에서 읽는다 · 실패해도 응답은 나간다', () => {
  const i = W.indexOf('let _outBody = _od;');
  assert.ok(i > 0, '_outBody');
  const seg = W.slice(i, i + 700);
  assert.ok(/Object\.assign\(\{ follow: routeFollow\(/.test(seg), 'follow 가 앞');
  assert.ok(/p\.get\("pm"\)/.test(seg) && /p\.get\("pa"\)/.test(seg) && /p\.get\("bf"\) === "1"/.test(seg), '요청 값');
  assert.ok(/catch \(e\)/.test(seg) && /JSON\.stringify\(_outBody\)/.test(seg), '실패해도 원본 응답');
});
t('엔진 버전이 s52 이상이다', () => {
  const m = W.match(/var ENGINE_VERSION = "route-v2-2026-10-19s(\d+)"/);
  assert.ok(m && parseInt(m[1], 10) >= 52, m && m[0]);
});

console.log(pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
