// 하차 전 추천 시점 엔진(engine/arrive-reco.js) 시험 — 2026-10-19 (5번 5단계 둘째 조각: 판단)
//   · 예전 웹 규칙(_arrCheckPreAlert · _arrSlot · _arrIsDinner · _arrRemainMin)과 같은 판정 — REF 는 예전 웹 코드를 한국시간 계산으로 옮겨 얼려 둔 사본
//   · 7분~1분 구간 경계 · 여정당 1회(같은 키) · 30분 안 재발송 없음 · 입력이 이상해도 죽지 않는다 · 다시 물을 때까지 기다릴 시간
//   · Worker 내장본이 모듈과 같은 판단 · /arrive-reco 길
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { arrRecoWhen, arrSlot, arrIsDinner, arrRemainMin, ARR_PRE_MIN } = require(path.join(root, 'engine/arrive-reco.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

// ── 예전 웹 규칙(얼린 사본, 시각은 한국시간 분으로) ──
const PRE = 7;
function kmin(ms) { const m = Math.floor(ms / 60000) + 540; return ((m % 1440) + 1440) % 1440; }
function refSlot(ms) { const m = kmin(ms); if (m >= 17 * 60 && m <= 21 * 60) return 'night'; if (m >= 21 * 60 + 1) return 'shop'; if (m >= 7 * 60 + 1 && m <= 10 * 60) return 'morning'; if (m >= 10 * 60 + 1 && m <= 16 * 60 + 59) return 'lunch'; return 'none'; }
function refDinner(ms) { const m = kmin(ms); return m >= 17 * 60 && m < 19 * 60; }
function refRemain(arr, now) { const m = Math.round((Number(arr) - now) / 60000); if (!isFinite(m) || m < 1 || m > PRE + 2) return PRE; return Math.min(PRE, m); }
// _arrCheckPreAlert 본체 → 보낼까
function refFire(a) {
  if (!a.arrMs || a.remSec == null) return { fire: false };
  if (a.remSec > PRE * 60 || a.remSec < 60) return { fire: false };
  const key = String(a.arrMs) + '|' + (a.dest || '');
  if (a.lastKey === key) return { fire: false };
  if (a.lastAt && (a.nowMs - a.lastAt) < 30 * 60 * 1000) return { fire: false };
  return { fire: true, key };
}

const T0 = Date.UTC(2026, 9, 19, 3, 0, 0);   // 12:00 KST

t('시간대: 하루 1440분 모두 예전 _arrSlot · _arrIsDinner 와 같다(이틀 치 · 자정 넘김 포함)', () => {
  for (let k = 0; k < 2 * 1440; k++) {
    const ms = Date.UTC(2026, 9, 18, 15, 0, 0) + k * 60000;   // 10/19 00:00 KST 부터
    assert.strictEqual(arrSlot(ms), refSlot(ms), 'slot ' + k); assert.strictEqual(arrIsDinner(ms), refDinner(ms), 'dinner ' + k);
  }
  const at = (h, m) => Date.UTC(2026, 9, 19, h - 9, m);
  assert.deepStrictEqual([arrSlot(at(6, 59)), arrSlot(at(7, 1)), arrSlot(at(10, 0)), arrSlot(at(10, 1)), arrSlot(at(16, 59)), arrSlot(at(17, 0)), arrSlot(at(21, 0)), arrSlot(at(21, 1)), arrSlot(at(0, 30))], ['none', 'morning', 'morning', 'lunch', 'lunch', 'night', 'night', 'shop', 'none']);
  assert.deepStrictEqual([arrIsDinner(at(16, 59)), arrIsDinner(at(17, 0)), arrIsDinner(at(18, 59)), arrIsDinner(at(19, 0))], [false, true, true, false]);
});
t('남은 분: 예전 _arrRemainMin 과 같다(1~7분 · 범위 밖이면 7)', () => {
  for (const d of [-5, 0, 10, 29, 30, 31, 59, 60, 61, 90, 150, 289, 330, 420, 449, 450, 479, 480, 481, 600, 3600]) {
    const arr = T0 + d * 1000; assert.strictEqual(arrRemainMin(arr, T0), refRemain(arr, T0), 'd ' + d);
  }
  assert.strictEqual(arrRemainMin(NaN, T0), PRE); assert.strictEqual(arrRemainMin('x', T0), PRE);
});
t('보낼까: 7분~1분 구간 경계(421초 → 아니오 · 420 → 예 · 60 → 예 · 59 → 아니오) · 예전 규칙과 같다', () => {
  for (const rem of [0, 1, 59, 60, 61, 300, 419, 420, 421, 600, 3600, -30]) {
    const a = { arrMs: T0 + 400000, remSec: rem, dest: '강남', lastKey: '', lastAt: 0, nowMs: T0 };
    const r = arrRecoWhen(a), e = refFire(a);
    assert.strictEqual(r.fire, e.fire, 'rem ' + rem); if (e.fire) assert.strictEqual(r.key, e.key);
  }
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 420, nowMs: T0 }).fire, true);
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 421, nowMs: T0 }).why, 'window');
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 59, nowMs: T0 }).why, 'window');
});
t('보낼까: 이번 여정 1회(같은 키면 아니오) · 30분 안이면 아니오(29분 59초) · 30분이면 예 · 목적지가 바뀌면 다른 키', () => {
  const a = { arrMs: T0 + 300000, remSec: 300, dest: '강남', lastKey: '', lastAt: 0, nowMs: T0 };
  const k = arrRecoWhen(a).key; assert.strictEqual(k, String(T0 + 300000) + '|강남');
  assert.strictEqual(arrRecoWhen(Object.assign({}, a, { lastKey: k })).why, 'dup');
  assert.strictEqual(arrRecoWhen(Object.assign({}, a, { lastKey: 'x|y', lastAt: T0 - (30 * 60000 - 1000) })).why, 'recent');
  assert.strictEqual(arrRecoWhen(Object.assign({}, a, { lastKey: 'x|y', lastAt: T0 - 30 * 60000 })).fire, true);
  assert.notStrictEqual(arrRecoWhen(Object.assign({}, a, { dest: '역삼' })).key, k);
  // 예전 규칙과 모든 조합에서 같다
  for (const rem of [30, 120, 400, 500]) for (const lk of ['', k, 'z']) for (const la of [0, T0 - 1000, T0 - 31 * 60000]) for (const dest of ['', '강남']) {
    const b = { arrMs: T0 + 300000, remSec: rem, dest, lastKey: lk, lastAt: la, nowMs: T0 };
    const r = arrRecoWhen(b), e = refFire(b); assert.strictEqual(r.fire, e.fire, JSON.stringify(b)); if (e.fire) assert.strictEqual(r.key, e.key);
  }
});
t('입력이 이상해도 죽지 않고 보내지 않는다(arrMs 없음·remSec 없음·글자·NaN)', () => {
  for (const a of [undefined, null, {}, { arrMs: 0, remSec: 100 }, { arrMs: T0 }, { arrMs: T0, remSec: null }, { arrMs: T0, remSec: 'x' }, { arrMs: 'x', remSec: 100 }, { arrMs: NaN, remSec: 100 }, 5, 'x']) {
    const r = arrRecoWhen(a); assert.strictEqual(r.fire, false); assert.strictEqual(r.why, 'input'); assert.strictEqual(r.v, 1);
  }
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 100 }).fire, true, 'nowMs 가 없어도(0) 보낸 기록이 없으면 보낸다');
});
t('시간대·저녁 여부·남은 분도 같이 돌려준다 · 다시 물을 때까지: 남으면 길게(5~60초) · 구간 안에서 보낸 뒤엔 60초', () => {
  const r = arrRecoWhen({ arrMs: Date.UTC(2026, 9, 19, 9, 5), remSec: 300, dest: 'a', nowMs: Date.UTC(2026, 9, 19, 9, 0) });   // 18:05 KST 도착
  assert.deepStrictEqual([r.slot, r.dinner, r.remMin, r.pre, r.fire, r.askMs], ['night', true, 5, ARR_PRE_MIN, true, 60000]);
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 3600, nowMs: T0 }).askMs, 60000);
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 430, nowMs: T0 }).askMs, 5000);
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 450, nowMs: T0 }).askMs, 25000);
  assert.strictEqual(arrRecoWhen({ arrMs: T0, remSec: 30, nowMs: T0 }).askMs, 60000);
});

// ── Worker 내장본 ──
const W = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 모듈 구간이 정확히 한 곳 내장돼 있다', () => {
  assert.strictEqual(W.split('// ===== arrive-reco (').length, 2);
  assert.strictEqual(W.split('// ===== arrive-reco \\ub05d =====').length, 2);
});
t('Worker 내장 본문이 모듈과 같은 판단을 한다(끝에서 끝까지)', () => {
  const a = W.indexOf('// ===== arrive-reco ('), s = W.indexOf('\n', a) + 1, e = W.indexOf('// ===== arrive-reco \\ub05d');
  const body = W.slice(s, e);
  assert.ok(!/[^\x00-\x7f]/.test(body), 'ASCII 만');
  const f = new Function(body + '\nreturn { arrRecoWhen: arrRecoWhen, arrSlot: arrSlot, arrIsDinner: arrIsDinner };')();
  for (const rem of [10, 59, 60, 300, 420, 421, 3600]) for (const lk of ['', 'q']) for (const la of [0, T0 - 1000]) {
    const b = { arrMs: T0 + 123456, remSec: rem, dest: '강남', lastKey: lk, lastAt: la, nowMs: T0 };
    assert.deepStrictEqual(f.arrRecoWhen(b), arrRecoWhen(b));
  }
  for (let k = 0; k < 1440; k += 7) { const ms = T0 + k * 60000; assert.strictEqual(f.arrSlot(ms), arrSlot(ms)); assert.strictEqual(f.arrIsDinner(ms), arrIsDinner(ms)); }
  assert.deepStrictEqual(f.arrRecoWhen(), arrRecoWhen());
});
t('Worker 길: /arrive-reco(POST · 크기 제한 · 잘못된 JSON 400)', () => {
  assert.ok(/url\.pathname === "\/arrive-reco"\) return handleArriveReco\(request\)/.test(W), '/arrive-reco 길');
  const i = W.indexOf('function handleArriveReco(');
  assert.ok(i > 0, 'handleArriveReco');
  const seg = W.slice(i, i + 2200);
  assert.ok(/arrRecoWhen\(body\)/.test(seg) && /status: 413/.test(seg) && /bad-json/.test(seg) && /POST only/.test(seg), '크기·JSON·메서드 검사');
});

console.log(pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
