// 출퇴근 브리핑 시각 엔진(engine/commute-alarm.js) 시험 — 2026-10-19 (5번 5단계 셋째 조각: 판단)
//   · 예전 웹 규칙(_cmTick · _cmDayOn · _cmOccurrences)과 같은 판정 — REF 는 예전 웹 코드를 얼려 둔 사본(기기 시간대 = 한국시간)
//   · 요일 · 같은 분에 한 번만 · OS 예약이 있으면 보내지 않음 · 기다릴 시간 · 4주치 예약 시각
//   · Worker 내장본이 모듈과 같은 판단 · /commute-alarm 길
'use strict';
process.env.TZ = 'Asia/Seoul';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { cmWidgetScenes, cmDue, cmOccurrences, cmPreDue, handleCommuteAlarm } = require(path.join(root, 'engine/commute-alarm.js'));
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
  const mod = new Function('Response', body + '; return { cmDue: cmDue, cmOccurrences: cmOccurrences, cmPreDue: cmPreDue };')(Response);
  for (const c of configs) for (let k = 0; k < 600; k++) {
    const a = Object.assign({ nowMs: D0 + k * 61000 + 7 * 3600000, on: true, osOk: false, lastKey: '' }, c);
    assert.deepStrictEqual(mod.cmDue(a), cmDue(a)); assert.deepStrictEqual(mod.cmOccurrences(a), cmOccurrences(a));
    const b = Object.assign({ ageMorn: k % 3 ? null : 600000, ageEve: k % 5 ? null : 2000000 }, a);
    assert.deepStrictEqual(mod.cmPreDue(b), cmPreDue(b));
  }
});

// ── 2026-10-19(s64): 출퇴근 경로 미리 받기 '때' — 예전 웹 _commutePrefetch 의 시각 판단(얼린 사본; 기기 시간대 = 한국시간) ──
function refHm(str) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function refPre(a) {   // → ['morn','eve'] 중 때가 된 것(순서대로). 예전엔 첫 번째 쓸 수 있는 것에서 멈췄다
  if (!refDayOn(a.days, new Date(a.nowMs).getDay())) return [];
  const d = new Date(a.nowMs), nowM = d.getHours() * 60 + d.getMinutes(), out = [];
  [['morn', refHm(a.morn), a.ageMorn], ['eve', refHm(a.eve), a.ageEve]].forEach(c => {
    const tm = c[1]; if (tm == null) return;
    let diff = nowM - tm; if (diff > 720) diff -= 1440; if (diff < -720) diff += 1440;
    if (diff < -45 || diff > 20) return;
    if (c[2] != null && c[2] < 20 * 60 * 1000) return;
    out.push(c[0]);
  });
  return out;
}
t('미리 받기 때: 예전 웹 규칙과 같다(시각 · 요일 · 자정 넘김 · 20분 중복 · 이상한 시각)', () => {
  const times = ['07:30', '7:05', '00:10', '23:50', '18:30', '', 'x', '25:99', null, '12:00'], dayss = [[1, 2, 3, 4, 5], [], [0, 6], null, [1]];
  let n = 0;
  for (const morn of times) for (const eve of times) for (const days of dayss) for (let k = 0; k < 24; k++) for (const ages of [[null, null], [0, null], [1199999, 5000000], [1200000, 1200000], [null, 60000]]) {
    const nowMs = D0 + k * 3600000 + (k * 7919 % 60) * 60000 + (n % 5) * 11000;
    const a = { nowMs, morn, eve, days, ageMorn: ages[0], ageEve: ages[1] };
    assert.deepStrictEqual(cmPreDue(a).due, refPre(a), JSON.stringify(a)); n++;
  }
  assert.ok(n > 5000);
});
t('미리 받기 때: 구체 사례', () => {
  const at = (h, mi, o) => cmPreDue(Object.assign({ nowMs: D0 + (h * 60 + mi) * 60000, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] }, o)).due;
  assert.deepStrictEqual(at(6, 45), ['morn']); assert.deepStrictEqual(at(6, 44), []); assert.deepStrictEqual(at(7, 50), ['morn']); assert.deepStrictEqual(at(7, 51), []);
  assert.deepStrictEqual(at(17, 50), ['eve']); assert.deepStrictEqual(at(12, 0), []);
  assert.deepStrictEqual(at(7, 0, { ageMorn: 1199999 }), []); assert.deepStrictEqual(at(7, 0, { ageMorn: 1200000 }), ['morn']);
  assert.deepStrictEqual(at(7, 0, { days: [0, 6] }), []);        // 2026-10-19 는 월요일
  assert.deepStrictEqual(at(7, 0, { days: [] }), ['morn']);       // 비면 매일
  assert.deepStrictEqual(cmPreDue({ nowMs: D0 + 30 * 60000, morn: '00:20', eve: '23:50' }).due, ['morn']);   // 자정 넘김: 00:30 은 출근 00:20 의 +10분, 퇴근 23:50 의 +40분은 아님
  assert.deepStrictEqual(cmPreDue({ nowMs: D0 + 10 * 60000, morn: '00:20', eve: '23:50' }).due, ['morn', 'eve']);   // 00:10 = 출근 00:20 의 -10분 · 퇴근 23:50 의 +20분(경계 포함)
  assert.deepStrictEqual(cmPreDue({}).due, []); assert.deepStrictEqual(cmPreDue(null).due, []); assert.deepStrictEqual(cmPreDue({ nowMs: 'x', morn: '07:30' }).due, []);
});
async function call(method, body) {
  const req = new Request('https://x/commute-alarm', { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const res = await handleCommuteAlarm(req); return { status: res.status, json: await res.json().catch(() => null) };
}
// ── s272: 위젯 출퇴근 장면 목록 — 예전 위젯(WidgetCore.evalScene)의 규칙을 얼려 둔 사본과 같은 칸이 나와야 한다 ──
function refWidgetActive(cfg, now) {   // 예전 규칙: 설정 요일 · 켜진 쪽 · 시작 ≤ 지금 < 시작 + 90분 → [{k, key}]
  const out = [], n = new Date(now);
  [['morn', cfg.morn, 450, cfg.mOn !== false], ['eve', cfg.eve, 1110, cfg.eOn !== false]].forEach(([k, s, def, on]) => {
    if (!on || !cfg.on) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s); const sm = m ? (+m[1]) * 60 + (+m[2]) : def;
    for (let back = 0; back <= 0; back++) {        // 예전 위젯은 오늘 시작분만 봤다(자정을 넘겨 이어지는 어제 장면은 없음)
      const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - back, Math.floor(sm / 60), sm % 60, 0, 0);
      const days = cfg.days && cfg.days.length ? cfg.days : [0, 1, 2, 3, 4, 5, 6];
      if (days.indexOf(d.getDay()) < 0) continue;
      if (now >= d.getTime() && now < d.getTime() + 90 * 60000) out.push(k + ':' + (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) + k + sm);
    }
  });
  return out.sort();
}
t('위젯 장면 목록: 켜진 쪽 · 설정 요일만, 14일치, 시각 순, 끝이 안 지난 것만', () => {
  const NOW = new Date(2026, 9, 28, 10, 0, 0).getTime();       // 2026-10-28(수) 10:00
  const r = cmWidgetScenes({ nowMs: NOW, on: true, mOn: true, eOn: true, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] });
  assert.strictEqual(r.v, 1); assert.strictEqual(r.validMs, 5400000); assert.strictEqual(r.showMs, 180000);
  assert.deepStrictEqual(r.btn, { morn: '출근하기', eve: '퇴근하기' }); assert.strictEqual(r.say.morn[0], '오늘도 화이팅!'); assert.strictEqual(r.say.eve[0], '오늘도 수고 많았어요');
  assert.strictEqual(r.list[0].k, 'eve'); assert.strictEqual(r.list[0].key, '20261028eve1110'); assert.strictEqual(r.list[0].at, new Date(2026, 9, 28, 18, 30).getTime()); assert.strictEqual(r.list[0].until - r.list[0].at, 5400000);
  assert.ok(r.list.every((e, i) => i === 0 || e.at >= r.list[i - 1].at), '시각 순');
  assert.ok(r.list.every(e => [1, 2, 3, 4, 5].indexOf(new Date(e.at).getDay()) >= 0), '주말 없음');
  assert.ok(r.list.every(e => e.until > NOW));
  assert.strictEqual(r.list.length, 19);   // 10/28 저녁 1 + 이후 13일(10/29~11/10) 중 평일 9일 × 2
});
t('위젯 장면 목록: 꺼짐 · 한쪽 꺼짐 · 이상한 시각은 기본값 · 요일 비면 매일', () => {
  const NOW = new Date(2026, 9, 28, 10, 0, 0).getTime();
  assert.deepStrictEqual(cmWidgetScenes({ nowMs: NOW, on: false, morn: '07:30', eve: '18:30' }).list, []);
  assert.deepStrictEqual(cmWidgetScenes({ nowMs: NaN, on: true }).list, []);
  const e = cmWidgetScenes({ nowMs: NOW, on: true, mOn: false, eOn: true, morn: 'x', eve: 'zz:zz', days: [] });
  assert.ok(e.list.length === 14 && e.list.every(x => x.k === 'eve' && /eve1110$/.test(x.key)), '저녁만 · 기본 18:30 · 매일 14일');
  const m = cmWidgetScenes({ nowMs: NOW, on: true, mOn: true, eOn: false, morn: '25:99', eve: '18:30' });
  assert.ok(m.list.every(x => /morn450$/.test(x.key)), '범위 밖 시각은 기본 07:30');
});
t('위젯 장면 목록: 예전 위젯 규칙(오늘 시작 ≤ 지금 < 시작+90분)과 같은 칸 — 분 단위로 훑어 비교', () => {
  const cfgs = [{ on: true, mOn: true, eOn: true, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] }, { on: true, mOn: true, eOn: true, morn: '23:00', eve: '00:30', days: [] }, { on: true, mOn: false, eOn: true, morn: '08:00', eve: '17:45', days: [0, 6] }];
  const T0 = new Date(2026, 9, 28, 0, 0, 0).getTime();
  cfgs.forEach(cfg => {
    for (let k = 0; k < 4 * 1440; k += 7) {
      const now = T0 + k * 60000, sc = cmWidgetScenes(Object.assign({ nowMs: now }, cfg));
      const got = sc.list.filter(e => e.at <= now && now < e.until).map(e => e.k + ':' + e.key).sort();
      assert.deepStrictEqual(got, refWidgetActive(cfg, now), new Date(now).toString() + ' ' + JSON.stringify(cfg));
    }
  });
});
(async () => {
  const c0 = configs[0], nowMs = D0 + (7 * 60 + 30) * 60000 + 3000;
  let r = await call('POST', Object.assign({ nowMs, on: true, osOk: false, lastKey: '' }, c0));
  t('POST: 보낼 분이면 fire · ok · 키', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.fire, 'morn'); assert.strictEqual(r.json.key, 'Mon Oct 19 2026|07:30'); });
  r = await call('POST', Object.assign({ op: 'occ', nowMs }, c0));
  t('POST op=occ: 4주치 시각', () => { assert.strictEqual(r.status, 200); assert.ok(r.json.morn.length >= 25 && r.json.eve.length >= 25); assert.strictEqual(r.json.ok, true); });
  r = await call('POST', { op: 'pre', nowMs: D0 + 7 * 3600000, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5], ageMorn: null, ageEve: 5 });
  t('POST op=pre: 때가 된 구간 이름만 돌려준다', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.deepStrictEqual(r.json.due, ['morn']); assert.strictEqual(r.json.v, 1); });
  r = await call('POST', JSON.stringify({ op: 'wscene', nowMs: new Date(2026, 9, 28, 10, 0, 0).getTime(), on: true, mOn: true, eOn: true, morn: '07:30', eve: '18:30', days: [3] })); t('POST op=wscene: 장면 목록', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.list[0].key, '20261028eve1110'); assert.ok(r.json.list.length === 3); });
  r = await call('GET'); t('GET → 405', () => assert.strictEqual(r.status, 405));
  r = await call('OPTIONS'); t('OPTIONS → 204', () => assert.strictEqual(r.status, 204));
  r = await call('POST', '{not json'); t('이상한 JSON → 400', () => assert.strictEqual(r.status, 400));
  r = await call('POST', 'x'.repeat(4001)); t('너무 긴 본문 → 413', () => assert.strictEqual(r.status, 413));
  console.log('commute_alarm: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
