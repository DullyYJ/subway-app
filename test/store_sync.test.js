// 저장값 맞추기 엔진(engine/store-sync.js) 시험 — 2026-10-19 (5번 4단계)
//   · 정책: 어떤 키를 보관하나(정확/접두어/제외) · 한도 · 같은 입력이면 같은 결과
//   · 맞추기: 웹이 살아 있을 때 / 웹 저장소가 지워졌을 때(되돌리기·다시 열기) / 처음 / 한도 · 엉뚱한 입력에도 죽지 않는다
//   · Worker 에 내장된 본문이 모듈과 같은 판단을 한다 · /store-policy · /store-merge 길이 연결돼 있다
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const M = require(path.join(root, 'engine/store-sync.js'));
const { storePolicy, storeEligible, storeMerge, STORE_SENTINEL: S } = M;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

t('정책: 기능 스위치(gdm_*)와 사용자 설정은 보관 대상, 로그·화면 저장본·캐시는 아니다', () => {
  ['gdm_rtf', 'gdm_cnd', 'gdm_sbh', 'gdm_scr_on', 'gdm_nm_off', 'gdm_sto', 'gdm_sto_seen', 'app_theme', 'notifPref', 'commuteAlarm', 'mk_favorites', 'savedBusStops', 'myPosts', 'busProxyUrl', 'rideLogOff'].forEach(k => assert.ok(storeEligible(k), k));
  ['gdm_err_log', 'gdm_scr_c', 'gdm_scrf_c', 'gdm_scrs_why', 'gdm_nm_fail', 'gdm_sn_why', 'gdm_rtf_why', 'shopDataCache', 'busLmCache3', 'rtLineMap', 'topisPath_1', 'liveTalk', 'commPosts', 'ovlDiag', 'srv:x', 'pfRec', 'lastStall', 'kakaoLocalCache'].forEach(k => assert.ok(!storeEligible(k), k));
});
t('정책: 문제로 웹으로 돌아갔다는 표시(_fail)·사유(_why)는 되살리지 않는다 — 지워진 뒤 첫 실행에서 낡은 진단이 남지 않게', () => {
  const r = storeMerge({ web: {}, nat: { [S]: '1', gdm_rtf: '1', gdm_rtf_why: '옛 사유', gdm_nm_fail: '1' } });
  assert.deepStrictEqual(r.toWeb.sort(), ['gdm_rtf', S].sort());
});
t('정책: 키 모양이 이상하면 보관하지 않는다(빈 문자열·공백·너무 긴 이름·특수문자)', () => {
  ['', ' ', 'gdm_ a', 'gdm_' + 'x'.repeat(70), 'gdm_a/b', 'gdm_한글', null, undefined, 5, {}].forEach(k => assert.ok(!storeEligible(k), String(k)));
});
t('정책: 호출마다 새 객체(바깥에서 고쳐도 상수가 안 변함) · 한도 값 · 표시 키', () => {
  const a = storePolicy(); a.exact.push('zzz'); a.maxValue = 1;
  const b = storePolicy(); assert.ok(!b.exact.includes('zzz')); assert.ok(b.maxValue > 1000);
  assert.strictEqual(b.sentinel, S); assert.strictEqual(b.v, 1);
  assert.ok(storeEligible(S), '표시 키 자신도 보관 대상');
});
const { storeHash, storeSig } = M;
const sg = o => { const r = {}; for (const k of Object.keys(o)) r[k] = storeSig(o[k]); return r; };   // 값 → {n,h}
t('지문: FNV-1a 32비트(UTF-16 글자 단위) 알려진 값과 같다 · 글자 수 n 과 함께 쓴다', () => {
  assert.strictEqual(storeHash(''), '811c9dc5'); assert.strictEqual(storeHash('a'), 'e40c292c'); assert.strictEqual(storeHash('foobar'), 'bf9cf968');
  assert.strictEqual(storeHash('한글🚇'), '28ac6449');
  assert.deepStrictEqual(storeSig('ab'), { n: 2, h: storeHash('ab') }); assert.deepStrictEqual(storeSig(12), { n: 2, h: storeHash('12') });
  assert.deepStrictEqual(storeSig({ n: 3, h: 'abc123' }), { n: 3, h: 'abc123' });
  [null, undefined, {}, { n: 'x', h: 'a' }, { n: -1, h: 'a' }, { n: 1, h: 'ZZ' }, { n: 1, h: '123456789' }, { n: 1 }].forEach(v => assert.strictEqual(storeSig(v), null, JSON.stringify(v)));
});
t('맞추기 ③ 처음(둘 다 표시 없음): 웹의 키가 앱 본체로 올라가고 표시가 양쪽에 생긴다 · 다시 열 필요 없음 · 값은 서버로 안 간다(키만 돌려준다)', () => {
  const r = storeMerge({ web: sg({ gdm_rtf: '1', app_theme: 'dark', junk: 'x', gdm_err_log: '[]' }), nat: {} });
  assert.deepStrictEqual(r.toNat, ['app_theme', 'gdm_rtf', S]); assert.deepStrictEqual(r.toWeb, [S]);
  assert.strictEqual(r.restore, false); assert.strictEqual(r.reload, false); assert.deepStrictEqual(r.delNat, []);
  assert.ok(!/"1"|dark/.test(JSON.stringify(r)), '응답에 값이 없다');
});
t('맞추기: 글자(문자열) 값으로 와도 같은 결과(엔진이 지문을 만든다)', () => {
  const a = storeMerge({ web: { gdm_rtf: '1', app_theme: 'dark' }, nat: { [S]: '1', gdm_rtf: '0' } });
  const b = storeMerge({ web: sg({ gdm_rtf: '1', app_theme: 'dark' }), nat: sg({ [S]: '1', gdm_rtf: '0' }) });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});
t('맞추기 ① 웹이 살아 있음: 웹이 기준 — 다른 값·웹에만 있는 키는 앱 본체로, 앱 본체에만 있는 키는 지운다', () => {
  const r = storeMerge({ web: sg({ [S]: '1', gdm_rtf: '1', app_theme: 'pastel', gdm_cnd: '0' }), nat: sg({ [S]: '1', gdm_rtf: '0', app_theme: 'pastel', gdm_sbh: '1', mk_favorites: '[]' }) });
  assert.deepStrictEqual(r.toNat, ['gdm_cnd', 'gdm_rtf']); assert.deepStrictEqual(r.delNat, ['gdm_sbh', 'mk_favorites']);
  assert.deepStrictEqual(r.toWeb, []); assert.strictEqual(r.restore, false); assert.strictEqual(r.reload, false);
});
t('맞추기 ① 같으면 할 일이 없다(조용히 끝)', () => {
  const x = { [S]: '1', gdm_rtf: '1', app_theme: 'dark' };
  const r = storeMerge({ web: sg(x), nat: sg(x) });
  assert.deepStrictEqual(r.toNat, []); assert.deepStrictEqual(r.toWeb, []); assert.deepStrictEqual(r.delNat, []);
});
t('맞추기 ① 값이 한 글자만 달라도(같은 길이) 다르다고 안다 · 길이만 같고 내용이 다른 경우', () => {
  const r = storeMerge({ web: sg({ [S]: '1', mk_pt: '{"a":1}' }), nat: sg({ [S]: '1', mk_pt: '{"a":2}' }) });
  assert.deepStrictEqual(r.toNat, ['mk_pt']);
});
t('맞추기 ② 웹 저장소가 지워졌다(웹에 표시 없음 · 앱 본체에 있음): 앱 본체 키를 웹으로 되돌리고 다시 열라고 한다', () => {
  const r = storeMerge({ web: {}, nat: sg({ [S]: '1', gdm_rtf: '1', gdm_sbh: '1', app_theme: 'dark', mk_favorites: '[{"a":1}]' }) });
  assert.strictEqual(r.restore, true); assert.strictEqual(r.reload, true);
  assert.deepStrictEqual(r.toWeb, ['app_theme', 'gdm_rtf', 'gdm_sbh', S, 'mk_favorites'].sort());
  assert.deepStrictEqual(r.toNat, []); assert.deepStrictEqual(r.delNat, []);
});
t('맞추기 ② 지워진 뒤 시작하며 웹이 기본값을 이미 써 넣었어도 앱 본체(사용자가 고른 값)가 이긴다 · 웹에 새로 생긴 키는 올린다', () => {
  const r = storeMerge({ web: sg({ gdm_rtf: '0', pfLive2: '1' }), nat: sg({ [S]: '1', gdm_rtf: '1' }) });
  assert.ok(r.toWeb.includes('gdm_rtf')); assert.deepStrictEqual(r.toNat, ['pfLive2']); assert.strictEqual(r.reload, true);
});
t('맞추기 ② 되돌릴 키가 표시뿐이면 다시 열지 않는다(restore 지만 reload 아님)', () => {
  const r = storeMerge({ web: {}, nat: sg({ [S]: '1' }) });
  assert.strictEqual(r.restore, true); assert.strictEqual(r.reload, false); assert.deepStrictEqual(r.toWeb, [S]);
});
t('다시 열고 나면(웹에 표시가 생겼으니) 같은 되돌리기를 되풀이하지 않는다 — 한 번 맞춘 뒤 다시 맞추면 할 일 없음', () => {
  const natV = { [S]: '1', gdm_rtf: '1', app_theme: 'dark' };
  const r1 = storeMerge({ web: {}, nat: sg(natV) });
  const webV = {}; r1.toWeb.forEach(k => { webV[k] = natV[k] === undefined ? '1' : natV[k]; });
  const r2 = storeMerge({ web: sg(webV), nat: sg(natV) });
  assert.strictEqual(r2.restore, false); assert.strictEqual(r2.reload, false); assert.deepStrictEqual(r2.toWeb, []); assert.deepStrictEqual(r2.toNat, []); assert.deepStrictEqual(r2.delNat, []);
});
t('웹에서 일부러 지운 키는 되살아나지 않는다(웹이 살아 있으면 앱 본체에서도 지운다)', () => {
  const r = storeMerge({ web: sg({ [S]: '1' }), nat: sg({ [S]: '1', gdm_rtf: '1' }) });
  assert.deepStrictEqual(r.delNat, ['gdm_rtf']); assert.deepStrictEqual(r.toWeb, []);
});
t('한도: 값이 너무 길면 건너뛴다(skip 에 이름) · 키가 너무 많으면 이름 순으로 한도까지만 · 합계 한도', () => {
  const p = storePolicy();
  const r = storeMerge({ web: { gdm_big: { n: p.maxValue + 1, h: 'abcd' }, gdm_ok: { n: 1, h: 'abcd' } }, nat: {} });
  assert.deepStrictEqual(r.skip, ['gdm_big']); assert.ok(r.toNat.includes('gdm_ok') && !r.toNat.includes('gdm_big'));
  const many = {}; for (let i = 0; i < p.maxKeys + 25; i++) many['gdm_k' + String(i).padStart(4, '0')] = { n: 1, h: 'ab' };
  const r2 = storeMerge({ web: many, nat: {} });
  assert.strictEqual(r2.toNat.filter(k => k !== S).length, p.maxKeys);
  assert.ok(r2.toNat.includes('gdm_k0000') && !r2.toNat.includes('gdm_k' + String(p.maxKeys + 24).padStart(4, '0')));
  const half = {}; for (let i = 0; i < 20; i++) half['gdm_h' + i] = { n: p.maxValue - 1, h: 'ab' };
  const r3 = storeMerge({ web: half, nat: {} });
  assert.ok(r3.toNat.filter(k => k !== S).length * (p.maxValue - 1) <= p.maxTotal);
});
t('같은 입력은 키 순서가 달라도 같은 결과(결정적)', () => {
  const a = storeMerge({ web: sg({ gdm_b: '1', gdm_a: '2', [S]: '1' }), nat: sg({ gdm_c: '3', [S]: '1' }) });
  const b = storeMerge({ web: sg({ [S]: '1', gdm_a: '2', gdm_b: '1' }), nat: sg({ [S]: '1', gdm_c: '3' }) });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});
t('값이 글자가 아니어도(숫자·불리언) 글자로 다루고, null 은 버린다', () => {
  const r = storeMerge({ web: { gdm_n: 5, gdm_b: true, gdm_z: null, gdm_u: undefined }, nat: {} });
  assert.ok(r.toNat.includes('gdm_n') && r.toNat.includes('gdm_b') && !r.toNat.includes('gdm_z') && !r.toNat.includes('gdm_u'));
});
t('입력이 비어도·엉뚱해도 죽지 않는다', () => {
  storeMerge(); storeMerge(null); storeMerge({}); storeMerge({ web: 5, nat: 'x' }); storeMerge({ web: [], nat: [1, 2] }); storeMerge({ web: { gdm_a: {} }, nat: { gdm_a: [] } });
  const r = storeMerge({}); assert.deepStrictEqual(r.toNat, [S]);
});

// ── Worker 내장본 ──
const W = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 모듈 구간이 정확히 한 곳 내장돼 있다', () => {
  assert.strictEqual(W.split('// ===== store-sync (').length, 2);
  assert.strictEqual(W.split('// ===== store-sync \\ub05d =====').length, 2);
});
t('Worker 내장 본문이 모듈과 같은 판단을 한다(끝에서 끝까지)', () => {
  const a = W.indexOf('// ===== store-sync (');
  const s = W.indexOf('\n', a) + 1, e = W.indexOf('// ===== store-sync \\ub05d');
  const body = W.slice(s, e);
  assert.ok(!/[^\x00-\x7f]/.test(body), 'ASCII 만');
  const f = new Function(body + '\nreturn { storePolicy: storePolicy, storeMerge: storeMerge, storeEligible: storeEligible, storeHash: storeHash };')();
  assert.deepStrictEqual(f.storePolicy(), storePolicy());
  const inputs = [
    { web: { gdm_rtf: '1', app_theme: 'dark' }, nat: {} }, { web: {}, nat: { [S]: '1', gdm_rtf: '1' } },
    { web: { [S]: '1', a: '1', gdm_x: '2' }, nat: { [S]: '1', gdm_y: '3', gdm_x: '9' } }, {}, { web: { gdm_n: 5 } }, { web: sg({ gdm_q: '한글' }), nat: {} }
  ];
  inputs.forEach(i => assert.deepStrictEqual(f.storeMerge(i), storeMerge(i), JSON.stringify(i)));
  ['gdm_rtf', 'gdm_scr_c', 'x y', 'app_theme', 'shopDataCache'].forEach(k => assert.strictEqual(f.storeEligible(k), storeEligible(k), k));
  ['', 'a', 'foobar', '한글🚇'].forEach(x => assert.strictEqual(f.storeHash(x), storeHash(x), x));
});
t('Worker 길: /store-policy(GET) · /store-merge(POST, 크기 제한 · 잘못된 JSON 400)', () => {
  assert.ok(/url\.pathname === "\/store-policy"\) return handleStorePolicy\(request\)/.test(W), '/store-policy 길');
  assert.ok(/url\.pathname === "\/store-merge"\) return handleStoreMerge\(request\)/.test(W), '/store-merge 길');
  const i = W.indexOf('function handleStoreMerge(');
  assert.ok(i > 0, 'handleStoreMerge');
  const seg = W.slice(i, i + 1800);
  assert.ok(/storeMerge\(/.test(seg) && /body-too-long|too-long/.test(seg) && /bad-json/.test(seg) && /status: 413/.test(seg), '크기·JSON 검사');
  const j = W.indexOf('function handleStorePolicy(');
  assert.ok(j > 0 && /storePolicy\(\)/.test(W.slice(j, j + 900)), 'handleStorePolicy');
});
t('엔진 버전이 s53 이상이다', () => {
  const m = W.match(/var ENGINE_VERSION = "route-v2-\d{4}-\d{2}-\d{2}s(\d+)"/);
  assert.ok(m && parseInt(m[1], 10) >= 53, m && m[0]);
});

console.log(pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
