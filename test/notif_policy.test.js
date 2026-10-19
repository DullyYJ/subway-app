// 알림 정책 엔진(engine/notif-policy.js) 시험 — 2026-10-19 (5번 5단계 첫 조각: 판단)
//   · 예전 웹 규칙(_NOTIF_ALLOW · _VIBE_ALLOW · _NOTIF_TOP · 그룹 · 사용자가 끈 분류 · 출퇴근 브리핑 토글 · 예전 모드)과 모든 조합에서 같은 답 — 아래 REF 는 예전 웹 코드를 그대로 옮겨 얼려 둔 것
//   · 표에 없는 종류는 셋 다 허용 안 함 · 엉뚱한 입력에도 죽지 않는다 · Worker 내장본이 모듈과 같은 판단 · /notif-policy 길
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { notifPolicy, npGroup } = require(path.join(root, 'engine/notif-policy.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

// ── 예전 웹 규칙(얼린 사본) ──
const A = { arrive_reco: 1, commute_brief: 0, fg_service: 1, arrive: 1, near_arrive: 1, near_arrive2: 1, transfer: 1, transfer2: 1, arrival: 1, proximity: 1 };
const V = { transfer: 1, transfer2: 1, arrive: 1, arrival: 1, near_arrive: 1, near_arrive2: 1, arrive_reco: 0, commute_brief: 0, fg_service: 0, proximity: 1 };
const TOP = { transfer: 1, near_arrive2: 1, near_arrive: 1 };
function grp(type) { const x = String(type || ''); if (x === 'near_arrive' || x === 'near_arrive2' || x === 'arrive' || x === 'arrival') return 'arrive'; if (x === 'transfer' || x === 'transfer2') return 'transfer'; if (x === 'proximity') return 'proximity'; if (x === 'arrive_reco') return 'arrive_reco'; return null; }
function refFeature(type, p, o) { const x = String(type || ''); if (x === 'commute_brief') return !!o.cm; if (!A[x]) return false; const g = grp(x); if (g && p[g] === 0) return false; return true; }
function refNotif(type, p, o) { const x = String(type || ''); if (o.legacy !== true && !TOP[x]) return false; return refFeature(x, p, o); }
function refVibe(type, p, o) { const x = String(type || ''); if (o.legacy !== true && !TOP[x]) return false; if (x === 'commute_brief') return !!o.cm; if (!V[x]) return false; const g = grp(x); if (g && p[g] === 0) return false; return true; }

const TYPES = ['transfer', 'transfer2', 'near_arrive', 'near_arrive2', 'arrive', 'arrival', 'proximity', 'arrive_reco', 'commute_brief', 'fg_service'];
const UNK = ['general', '', 'zzz', 'Transfer'];
const KEYS = ['arrive', 'transfer', 'proximity', 'arrive_reco'];

t('모든 조합(예전 모드 × 브리핑 × 분류 스위치 16가지 × 종류)에서 예전 웹 규칙과 같다', () => {
  let n = 0;
  for (const legacy of [false, true]) for (const cm of [false, true]) for (let mask = 0; mask < 16; mask++) {
    const prefs = {}; KEYS.forEach((k, i) => { prefs[k] = (mask >> i) & 1; });
    const r = notifPolicy({ prefs, legacy, cm }), o = { legacy, cm };
    TYPES.concat(UNK).forEach(ty => {
      const e = r.types[ty] || { n: 0, v: 0, f: 0 };
      assert.strictEqual(e.n === 1, refNotif(ty, prefs, o), 'n ' + ty + ' ' + JSON.stringify({ legacy, cm, mask }));
      assert.strictEqual(e.v === 1, refVibe(ty, prefs, o), 'v ' + ty + ' ' + JSON.stringify({ legacy, cm, mask }));
      assert.strictEqual(e.f === 1, refFeature(ty, prefs, o), 'f ' + ty + ' ' + JSON.stringify({ legacy, cm, mask })); n++;
    });
  }
  assert.strictEqual(n, 896);
});
t('기본(아무것도 안 건드림): 상단 알림·진동은 환승 1정거장 전·목적지 2·1정거장 전 세 가지만 · 기능 스위치는 대부분 켬', () => {
  const r = notifPolicy({ prefs: { arrive: 1, transfer: 1, proximity: 1, arrive_reco: 1 }, legacy: false, cm: false });
  assert.deepStrictEqual(TYPES.filter(x => r.types[x].n), ['transfer', 'near_arrive', 'near_arrive2'].sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b)));
  assert.deepStrictEqual(TYPES.filter(x => r.types[x].v), ['transfer', 'near_arrive', 'near_arrive2'].sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b)));
  assert.strictEqual(r.types.arrive_reco.f, 1); assert.strictEqual(r.types.commute_brief.f, 0); assert.strictEqual(r.types.fg_service.f, 1);
});
t('분류 스위치를 끄면 그 분류의 알림·진동·기능이 같이 꺼진다 · 값이 없으면 켬', () => {
  const r = notifPolicy({ prefs: { transfer: 0 }, legacy: false, cm: false });
  assert.deepStrictEqual(r.types.transfer, { n: 0, v: 0, f: 0 }); assert.deepStrictEqual(r.types.near_arrive, { n: 1, v: 1, f: 1 });
  assert.strictEqual(r.types.arrive_reco.f, 1);
  const r2 = notifPolicy({ prefs: { arrive_reco: 0 }, legacy: false, cm: false });
  assert.strictEqual(r2.types.arrive_reco.f, 0);
});
t('출퇴근 브리핑은 정책 표가 아니라 사용자 토글을 따른다(예전 모드가 아니면 상단 알림·진동은 안 나가고 기능만 켜짐)', () => {
  const r = notifPolicy({ prefs: {}, legacy: false, cm: true });
  assert.deepStrictEqual(r.types.commute_brief, { n: 0, v: 0, f: 1 });
  const r2 = notifPolicy({ prefs: {}, legacy: true, cm: true });
  assert.deepStrictEqual(r2.types.commute_brief, { n: 1, v: 1, f: 1 });
  assert.deepStrictEqual(notifPolicy({ prefs: {}, legacy: true, cm: false }).types.commute_brief, { n: 0, v: 0, f: 0 });
});
t('표에 없는 종류는 표에 안 나온다(= 셋 다 허용 안 함) · 그룹표 · 엉뚱한 입력에도 죽지 않는다', () => {
  const r = notifPolicy({ prefs: {}, legacy: true, cm: true });
  assert.ok(!('general' in r.types) && !('' in r.types));
  assert.deepStrictEqual(r.groups, { arrive: 'arrive', arrival: 'arrive', near_arrive: 'arrive', near_arrive2: 'arrive', transfer: 'transfer', transfer2: 'transfer', proximity: 'proximity', arrive_reco: 'arrive_reco' });
  assert.deepStrictEqual(r.top, ['near_arrive', 'near_arrive2', 'transfer']);
  notifPolicy(); notifPolicy(null); notifPolicy('x'); notifPolicy({ prefs: 5, legacy: 'yes', cm: 1 }); notifPolicy({ prefs: null });
  assert.strictEqual(npGroup(null), null); assert.strictEqual(npGroup('transfer2'), 'transfer');
  assert.strictEqual(notifPolicy({ legacy: 'true' }).types.arrive.n, 0, 'legacy 는 진짜 true 만');
});

// ── Worker 내장본 ──
const W = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 모듈 구간이 정확히 한 곳 내장돼 있다', () => {
  assert.strictEqual(W.split('// ===== notif-policy (').length, 2);
  assert.strictEqual(W.split('// ===== notif-policy \\ub05d =====').length, 2);
});
t('Worker 내장 본문이 모듈과 같은 판단을 한다(끝에서 끝까지)', () => {
  const a = W.indexOf('// ===== notif-policy ('), s = W.indexOf('\n', a) + 1, e = W.indexOf('// ===== notif-policy \\ub05d');
  const body = W.slice(s, e);
  assert.ok(!/[^\x00-\x7f]/.test(body), 'ASCII 만');
  const f = new Function(body + '\nreturn { notifPolicy: notifPolicy, npGroup: npGroup };')();
  for (const legacy of [false, true]) for (const cm of [false, true]) for (let mask = 0; mask < 16; mask++) {
    const prefs = {}; KEYS.forEach((k, i) => { prefs[k] = (mask >> i) & 1; });
    assert.deepStrictEqual(f.notifPolicy({ prefs, legacy, cm }), notifPolicy({ prefs, legacy, cm }));
  }
  assert.deepStrictEqual(f.notifPolicy(), notifPolicy());
});
t('Worker 길: /notif-policy(POST · 크기 제한 · 잘못된 JSON 400)', () => {
  assert.ok(/url\.pathname === "\/notif-policy"\) return handleNotifPolicy\(request\)/.test(W), '/notif-policy 길');
  const i = W.indexOf('function handleNotifPolicy(');
  assert.ok(i > 0, 'handleNotifPolicy');
  const seg = W.slice(i, i + 2200);
  assert.ok(/notifPolicy\(body\)/.test(seg) && /status: 413/.test(seg) && /bad-json/.test(seg) && /POST only/.test(seg), '크기·JSON·메서드 검사');
});

console.log(pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
