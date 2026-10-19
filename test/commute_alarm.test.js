// 출퇴근 브리핑 시각 엔진(engine/commute-alarm.js) 시험 — 2026-10-19 (5번 5단계 셋째 조각: 판단)
//   · 예전 웹 규칙(_cmTick · _cmDayOn · _cmOccurrences)과 같은 판정 — REF 는 예전 웹 코드를 얼려 둔 사본(기기 시간대 = 한국시간)
//   · 요일 · 같은 분에 한 번만 · OS 예약이 있으면 보내지 않음 · 기다릴 시간 · 4주치 예약 시각
//   · Worker 내장본이 모듈과 같은 판단 · /commute-alarm 길
'use strict';
process.env.TZ = 'Asia/Seoul';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { cmDue, cmOccurrences, handleCommuteAlarm } = require(path.join(root, 'engine/commute-alarm.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }


// ── 예전 웹 규칙(얼린 사본) ──
function refDayOn(days, d) { try { if (!Array.isArray(days) || !days.length) return true; return days.indexOf(d) >= 0; } catch (e) { return true; } }
function refTick(a) {   // → { fire, key } (key 는 보낼 때만 의미)
  if (!a.on) return { fire: null };
  if (a.osOk === true) return { fire: null };
  const n = new Date(a.nowMs);
  const cur = ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2);
  const key = n.toDateString() + '|' + cur;
  if (a.lastKey === key) return { fire: null };
  if (!refDayOn(a.days, n.getDay())) return { fire: null };
  if (cur === a.morn) return { fire: 'morn', key };
  if (cur === a.eve) return { fire: 'eve', key };
  return { fire: null };
}
const OSD = 28;
function refOcc(hh, mi, days, now) {
  const out = [];
  for (let i = 0; i <= OSD + 7 && out.length < OSD; i++) {
    const tt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mi, 0, 0);
    if (tt.getTime() > now.getTime() + 2000 && days.indexOf(tt.getDay()) >= 0) out.push(tt.getTime());
  }
  return out;
}
function refOccAll(a) {
  const mh = parseInt(String(a.morn).split(':')[0]), mm = parseInt(String(a.morn).split(':')[1]);
  const eh = parseInt(String(a.eve).split(':')[0]), em = parseInt(String(a.eve).split(':')[1]);
  const days = (Array.isArray(a.days) && a.days.length) ? a.days : [0, 1, 2, 3, 4, 5, 6];
  const now = new Date(a.nowMs);
  return { morn: refOcc(mh, mm, days, now), eve: refOcc(eh, em, days, now) };
}

t('시험 환경: 기기 시간대가 한국시간', () => assert.strictEqual(new Date().getTimezoneOffset(), -540));

const D0 = Date.UTC(2026, 9, 18, 15, 0, 0);   // 2026-10-19(월) 00:00 KST
const configs = [
  { morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] },
  { morn: '07:30', eve: '18:30', days: [] },
  { morn: '23:59', eve: '00:00', days: [0, 6] },
  { morn: '07:30', eve: '07:30', days: [1] },
  { morn: '7:30', eve: '18:30', days: [1, 2, 3, 4, 5] },   // 두 자리가 아닌 시각은 같은 분으로 맞지 않는다(예전 그대로)
  { morn: '', eve: 'xx', days: [0, 1, 2, 3, 4, 5, 6] },
  { morn: '12:05', eve: '12:06', days: null }
];

t('1주일 × 1분 격자 × 설정 7종 × 켜짐/꺼짐 × OS예약: 보낼까·키가 예전 규칙과 같다', () => {
  let n = 0, fires = 0;
  for (const c of configs) for (const on of [true, false]) for (const osOk of [false, true]) {
    for (let m = 0; m < 7 * 1440; m += 1) {
      for (const sec of [0, 29, 59]) {
        const nowMs = D0 + m * 60000 + sec * 1000;
        const a = Object.assign({ nowMs, on, osOk, lastKey: '' }, c);
        const r = refTick(a), e = cmDue(a);
        if (r.fire !== e.fire || (r.fire && r.key !== e.key)) assert.fail('다름 ' + JSON.stringify(a) + ' ref=' + JSON.stringify(r) + ' eng=' + JSON.stringify(e));
        n++; if (r.fire) fires++;
        if (sec === 29 && !r.fire) { /* 건너뛰어 속도 확보 */ }
      }
    }
  }
  assert.ok(n > 400000 && fires > 100, n + ' ' + fires);
});

t('같은 분에 한 번만: 지난번 키가 같으면 보내지 않고, 다른 분이면 보낸다', () => {
  const c = configs[0]; const nowMs = D0 + (7 * 60 + 30) * 60000 + 5000;   // 월 07:30:05
  const first = cmDue(Object.assign({ nowMs, on: true, osOk: false, lastKey: '' }, c));
  assert.strictEqual(first.fire, 'morn'); assert.strictEqual(first.key, 'Mon Oct 19 2026|07:30');
  assert.strictEqual(cmDue(Object.assign({ nowMs: nowMs + 20000, on: true, osOk: false, lastKey: first.key }, c)).fire, null);
  assert.strictEqual(cmDue(Object.assign({ nowMs: nowMs + 7 * 86400000, on: true, osOk: false, lastKey: first.key }, c)).fire, 'morn');   // 다음 주 같은 시각은 새 키
});
t('키 글자가 예전 toDateString()|HH:MM 과 같다(저장된 기록과 호환)', () => {
  for (const d of [D0, D0 + 86400000 * 40, D0 + 86400000 * 200, Date.UTC(2027, 0, 1, 0, 0)]) {
    const e = cmDue({ nowMs: d + 7.5 * 3600000, on: true, osOk: false, morn: '08:30', eve: '09:30', days: [] });
    const n = new Date(d + 7.5 * 3600000);
    assert.strictEqual(e.key, n.toDateString() + '|' + ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2));
  }
});
t('기다릴 시간: 꺼짐·OS예약 → 10분 · 대상 분이 1분 반 안이면 0 · 멀면 (남은 시간 − 1분), 최대 9분', () => {
  const c = configs[0];
  assert.strictEqual(cmDue(Object.assign({ nowMs: D0, on: false }, c)).askMs, 600000);
  assert.strictEqual(cmDue(Object.assign({ nowMs: D0, on: true, osOk: true }, c)).askMs, 600000);
  assert.strictEqual(cmDue(Object.assign({ nowMs: D0 + (7 * 60 + 29) * 60000, on: true, osOk: false }, c)).askMs, 0);
  assert.strictEqual(cmDue(Object.assign({ nowMs: D0 + (7 * 60 + 25) * 60000, on: true, osOk: false }, c)).askMs, 4 * 60000);
  assert.strictEqual(cmDue(Object.assign({ nowMs: D0 + 3600000, on: true, osOk: false }, c)).askMs, 540000);   // 10분 넘게 멀면 9분 뒤에 다시
});
t('기다리는 동안 대상 분을 놓치지 않는다: askMs 만큼 쉬고 다시 물어도 대상 분 안에 한 번은 묻는다', () => {
  const c = configs[0];
  for (let start = D0 + 6 * 3600000; start < D0 + 8 * 3600000; start += 37000) {
    let now = start, hit = false;
    for (let k = 0; k < 400 && now < D0 + 8 * 3600000; k++) {
      const r = cmDue(Object.assign({ nowMs: now, on: true, osOk: false, lastKey: '' }, c));
      if (r.fire) { hit = true; break; }
      now += Math.max(r.askMs, 30000);   // 앱은 30초마다 돌고, 엔진이 기다리라 한 만큼은 쉰다
    }
    if (start < D0 + 7.5 * 3600000 - 1) assert.ok(hit, '놓침 ' + new Date(start).toISOString());
  }
});

t('4주치 예약 시각이 예전 _cmOccurrences 와 같다 (시각 × 설정 × 요일)', () => {
  let n = 0;
  const nows = []; for (let i = 0; i < 24 * 4; i++) nows.push(D0 + i * 15 * 60000 + 1500); for (let i = 0; i < 400; i++) nows.push(D0 + i * 86400000 + 3 * 3600000 - 2000 + (i % 5) * 1000);
  for (const c of configs) for (const nowMs of nows) {
    const a = Object.assign({ nowMs }, c); const r = refOccAll(a), e = cmOccurrences(a);
    assert.deepStrictEqual(e.morn, r.morn, 'morn ' + JSON.stringify(a)); assert.deepStrictEqual(e.eve, r.eve, 'eve ' + JSON.stringify(a)); n++;
  }
  assert.ok(n > 3000);
});
t('예약: 매일이면 28개 · 평일이면 36일 안의 평일 · 지금보다 2초 넘게 뒤 · 선택한 요일만 · 오름차순', () => {
  const r = cmOccurrences({ nowMs: D0 + (7 * 60 + 30) * 60000 - 2000, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] });
  const rr = refOccAll({ nowMs: D0 + (7 * 60 + 30) * 60000 - 2000, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] });
  assert.strictEqual(r.morn.length, rr.morn.length); assert.strictEqual(r.eve.length, rr.eve.length); assert.ok(r.morn.length >= 25 && r.morn.length < 28);   // 앞으로 36일 안의 평일(예전과 같다)
  for (let i = 1; i < r.morn.length; i++) assert.ok(r.morn[i] > r.morn[i - 1]);
  r.morn.concat(r.eve).forEach(ms => { const d = new Date(ms).getDay(); assert.ok(d >= 1 && d <= 5); });
  // 정확히 2초 이내인 오늘 시각은 빠진다
  const edge = cmOccurrences({ nowMs: D0 + (7 * 60 + 30) * 60000 - 2000, morn: '07:30', eve: '18:30', days: [] });
  assert.strictEqual(edge.morn.length, 28); assert.strictEqual(new Date(edge.morn[0]).getDate(), 20);
  const ok = cmOccurrences({ nowMs: D0 + (7 * 60 + 30) * 60000 - 2001, morn: '07:30', eve: '18:30', days: [] });
  assert.strictEqual(new Date(ok.morn[0]).getDate(), 19);
});
t('이상한 입력에도 죽지 않는다', () => {
  for (const bad of [undefined, null, {}, { nowMs: 'x' }, { nowMs: NaN }, { nowMs: D0, morn: null, eve: undefined, days: 'x' }, { nowMs: D0, on: true, morn: {}, eve: [], days: [1, 'a'] }]) {
    const r = cmDue(bad), o = cmOccurrences(bad);
    assert.strictEqual(r.v, 1); assert.ok(r.fire === null || r.fire === 'morn' || r.fire === 'eve'); assert.ok(Array.isArray(o.morn) && Array.isArray(o.eve));
  }
});
t('엔진에는 시각·요일·켜짐·기록만 간다 — 장소·좌표 필드를 읽지 않는다', () => {
  const src = fs.readFileSync(path.join(root, 'engine/commute-alarm.js'), 'utf8');
  assert.ok(!/\b(from|to|lat|lng|fromLat|toLat)\b\s*[:=.]/.test(src.replace(/\/\/.*$/gm, '')), '장소 필드가 코드에 있다');
});

// ── Worker 내장본 · 길 ──
const worker = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 내장되고 /commute-alarm 길이 있다', () => {
  assert.ok(/\/\/ ===== commute-alarm \(/.test(worker)); assert.ok(/commute-alarm \\ub05d =====/.test(worker));
  assert.ok(/url\.pathname === "\/commute-alarm"\) return handleCommuteAlarm\(request\)/.test(worker));
});
t('Worker 내장본 판단이 모듈과 같다', () => {
  const m = worker.match(/\/\/ ===== commute-alarm \([^\n]*\n([\s\S]*?)\/\/ ===== commute-alarm \\ub05d =====/);
  assert.ok(m);
  const body = m[1].replace(/^\s*if \(typeof module[^\n]*\n/m, '');
  const mod = new Function('Response', body + '; return { cmDue: cmDue, cmOccurrences: cmOccurrences };')(Response);
  for (const c of configs) for (let k = 0; k < 600; k++) {
    const a = Object.assign({ nowMs: D0 + k * 61000 + 7 * 3600000, on: true, osOk: false, lastKey: '' }, c);
    assert.deepStrictEqual(mod.cmDue(a), cmDue(a)); assert.deepStrictEqual(mod.cmOccurrences(a), cmOccurrences(a));
  }
});
async function call(method, body) {
  const req = new Request('https://x/commute-alarm', { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const res = await handleCommuteAlarm(req); return { status: res.status, json: await res.json().catch(() => null) };
}
(async () => {
  const c0 = configs[0], nowMs = D0 + (7 * 60 + 30) * 60000 + 3000;
  let r = await call('POST', Object.assign({ nowMs, on: true, osOk: false, lastKey: '' }, c0));
  t('POST: 보낼 분이면 fire · ok · 키', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.fire, 'morn'); assert.strictEqual(r.json.key, 'Mon Oct 19 2026|07:30'); });
  r = await call('POST', Object.assign({ op: 'occ', nowMs }, c0));
  t('POST op=occ: 4주치 시각', () => { assert.strictEqual(r.status, 200); assert.ok(r.json.morn.length >= 25 && r.json.eve.length >= 25); assert.strictEqual(r.json.ok, true); });
  r = await call('GET'); t('GET → 405', () => assert.strictEqual(r.status, 405));
  r = await call('OPTIONS'); t('OPTIONS → 204', () => assert.strictEqual(r.status, 204));
  r = await call('POST', '{not json'); t('이상한 JSON → 400', () => assert.strictEqual(r.status, 400));
  r = await call('POST', 'x'.repeat(4001)); t('너무 긴 본문 → 413', () => assert.strictEqual(r.status, 413));
  console.log('commute_alarm: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
