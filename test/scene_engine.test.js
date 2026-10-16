// 장면 엔진(engine/scene.js — 혼잡도 카드 창의 장면·구간·시간대·날씨·대표 캐릭터 판정) 시험.  실행: node test/scene_engine.test.js
// HTTP(/scene)·날씨 받기 시험은 route-v2 저장소 test/scene.test.js 에 있다(워커 전체가 필요).
// ★ YJ 규칙: 혼잡도는 '지하철 탑승 확정' 뒤에만. 기다리는 동안(버스·지하철)·버스 안·내린 뒤에는 장면만.
const assert = require('assert');
const E = require('../engine/scene');
const decide = E.sceneDecide, slot = E.sceneSlot, wxk = E.sceneWxKind, hint = E.SCENE_HINT_BUS;
const ms = (s) => Date.parse(s + '+09:00');
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', String(e.message || e).slice(0, 500)); } };
const N = (o) => Object.assign({ name: '', isSub: false, isBus: false, isWalk: false, isOrigin: false, lineName: '', hasLoc: true }, o);
const O = N({ name: '출발', isOrigin: true }), W1 = N({ name: '도보', isWalk: true });
const S = (name, line) => N({ name, isSub: true, lineName: line || '2호선' }), B = (name, line) => N({ name, isBus: true, lineName: line || '6659' });
(async () => {
  await t('시간대: 새벽·아침·점심·오후·저녁·밤 경계', () => {
    const e = { 3: 'night', 4: 'dawn', 6: 'dawn', 7: 'morning', 10: 'morning', 11: 'noon', 13: 'noon', 14: 'afternoon', 17: 'afternoon', 18: 'evening', 20: 'evening', 21: 'night', 0: 'night', 23: 'night' };
    Object.keys(e).forEach(h => assert.strictEqual(slot(+h), e[h], h + '시'));
  });
  await t('날씨 종류: 눈·비·안개·흐림·구름·맑음, 글이 없으면 강수확률로', () => {
    assert.strictEqual(wxk({ txt: '눈' }), 'snow'); assert.strictEqual(wxk({ txt: '진눈깨비' }), 'snow'); assert.strictEqual(wxk({ txt: '소나기' }), 'rain'); assert.strictEqual(wxk({ txt: '비' }), 'rain');
    assert.strictEqual(wxk({ txt: '흐림' }), 'overcast'); assert.strictEqual(wxk({ txt: '구름많음' }), 'cloudy'); assert.strictEqual(wxk({ txt: '맑음' }), 'clear'); assert.strictEqual(wxk({ txt: '안개' }), 'fog');
    assert.strictEqual(wxk({ txt: '', rain: 80 }), 'rain'); assert.strictEqual(wxk({ txt: '맑음', rain: 80 }), 'clear'); assert.strictEqual(wxk(null), 'clear');
  });
  await t('경로 없음 → idle(혼잡도 없음), 시간(한국 시각)·날씨·문구', () => {
    const a = decide({ nowMs: ms('2026-10-15T12:30:00'), locked: false }, { temp: 12.4, rain: 5, txt: '맑음' });
    assert.strictEqual(a.mode, 'idle'); assert.strictEqual(a.look.slot, 'noon'); assert.strictEqual(a.look.wk, 'clear'); assert.strictEqual(a.look.season, 'autumn'); assert.strictEqual(a.cong.kind, null); assert.strictEqual(a.hint, hint);
    assert(/점심/.test(a.tag) && /맑음/.test(a.tag) && /12°/.test(a.tag), a.tag);
    const b = decide({ nowMs: ms('2026-12-20T05:10:00'), locked: false }, { temp: -3, rain: 90, txt: '눈' });
    assert.strictEqual(b.look.slot, 'dawn'); assert.strictEqual(b.look.wk, 'snow'); assert.strictEqual(b.look.season, 'winter'); assert(b.look.hidesSun && b.look.lit);
    const c = decide({ nowMs: ms('2026-10-15T22:00:00'), locked: false }, null);
    assert.strictEqual(c.look.wxKnown, false); assert.strictEqual(c.look.wxKo, ''); assert(!/맑|흐|비|눈/.test(c.tag), '날씨를 못 받으면 날씨를 지어내지 않는다: ' + c.tag); assert(c.look.night);
  });
  await t('(07:43 YJ) fill: 경로도 경로 결과도 없을 때만 true — 경로 결과가 나오기 시작하면(확정 전) false, 확정 후에도 false', () => {
    const base = { nowMs: ms('2026-10-16T07:40:00') };
    assert.strictEqual(decide(Object.assign({ locked: false }, base), null).fill, true);
    assert.strictEqual(decide(Object.assign({ locked: false, routeShown: false }, base), null).fill, true);
    const r = decide(Object.assign({ locked: false, routeShown: true }, base), null); assert.strictEqual(r.mode, 'idle'); assert.strictEqual(r.fill, false);
    const nodes = [{ name: '출발', isOrigin: true }, { name: '도보', isWalk: true }, { name: 'A', isBus: true, lineName: '1', hasLoc: true }, { name: 'B', isBus: true, lineName: '1', hasLoc: true }];
    for (const here of [0, 1, 2, 3]) assert.strictEqual(decide(Object.assign({ locked: true, here, nodes }, base), null).fill, false, 'locked ' + here);
  });
  await t('tzOffsetMin 을 따른다(UTC 기기에서도 한국 시각으로 판단)', () => {
    assert.strictEqual(decide({ nowMs: Date.parse('2026-10-15T03:00:00Z'), tzOffsetMin: 540, locked: false }, null).look.slot, 'noon');
    assert.strictEqual(decide({ nowMs: Date.parse('2026-10-15T03:00:00Z'), tzOffsetMin: 0, locked: false }, null).look.slot, 'night');
  });
  const SUB = [O, W1, S('강남'), S('역삼'), S('선릉'), W1];
  await t('지하철: 타기 전(걷는 중·승강장 대기)은 장면(venue sub)만 · 탑승 확정 뒤에만 혼잡도(장면 없음)', () => {
    let r = decide({ locked: true, here: 1, boarded: false, nodes: SUB }, null);
    assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.venue, 'sub'); assert.strictEqual(r.cong.kind, null); assert.strictEqual(r.line, '2'); assert(/2호선 열차를 기다리는/.test(r.tag), r.tag); assert.strictEqual(r.hint, hint);
    r = decide({ locked: true, here: 2, boarded: false, nodes: SUB }, null); assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.cong.kind, null);           // 승차역에 닿았지만 아직 안 탔다
    r = decide({ locked: true, here: 2, boarded: true, nodes: SUB }, null); assert.strictEqual(r.mode, null); assert.strictEqual(r.cong.kind, 'sub'); assert.strictEqual(r.cong.idx, 2); assert.strictEqual(r.hint, null);
    [3, 4].forEach(h => { r = decide({ locked: true, here: h, boarded: true, nodes: SUB }, null); assert.strictEqual(r.mode, null); assert.strictEqual(r.cong.kind, 'sub'); assert.strictEqual(r.cong.idx, h); });
    r = decide({ locked: true, here: 5, boarded: true, nodes: SUB }, null);              // 내려서 목적지로 걷는 중: 혼잡도 없음, 지하철에서 내린 장면
    assert.strictEqual(r.mode, 'alight'); assert.strictEqual(r.venue, 'sub'); assert.strictEqual(r.cong.kind, null);
  });
  const BUS = [O, W1, B('A정류장'), B('B정류장'), B('C정류장'), B('D정류장'), W1];
  await t('버스: 혼잡도는 어느 단계에서도 없다 — 타기 전 wait → 타고 가는 중 ride → 내리기 직전 nearEnd → 내림 alight → 도보 alight', () => {
    const at = (h, boarded) => decide({ locked: true, here: h, boarded: !!boarded, nodes: BUS }, null);
    let r = at(1); assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.venue, 'bus'); assert.strictEqual(r.cong.kind, null); assert.strictEqual(r.hint, hint); assert.strictEqual(hint, '지하철을 타면 혼잡도가 표시돼요'); assert(/6659 버스를 기다리는/.test(r.tag), r.tag);
    r = at(2, false); assert.strictEqual(r.mode, 'wait');                      // 정류장에 도착, 아직 안 탔다
    r = at(2, true); assert.strictEqual(r.mode, 'ride');                       // 승차 확정
    r = at(3, false); assert.strictEqual(r.mode, 'ride'); assert.strictEqual(r.nearEnd, false);
    r = at(4); assert.strictEqual(r.mode, 'ride'); assert.strictEqual(r.nearEnd, true); assert(/곧 내려요/.test(r.tag));
    r = at(5); assert.strictEqual(r.mode, 'alight'); r = at(6); assert.strictEqual(r.mode, 'alight');
    for (let h = 0; h < 7; h++) { r = at(h, true); assert.strictEqual(r.cong.kind, null, h + ': 버스에는 혼잡도가 없다'); assert(r.mode, h + ': 항상 장면'); }
  });
  await t('지하철 → 버스 환승: 내려서 걷는 중엔 버스 기다림, 버스 승차 확정 전까지 wait, 지나면 ride(혼잡도 없음)', () => {
    const nodes = [O, S('강남'), S('교대'), W1, B('가'), B('나'), B('다')];
    assert.strictEqual(decide({ locked: true, here: 2, boarded: true, nodes }, null).cong.kind, 'sub');   // 지하철 타는 동안 → 혼잡도
    let r = decide({ locked: true, here: 3, boarded: true, nodes }, null); assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.venue, 'bus'); assert.strictEqual(r.cong.kind, null);
    assert.strictEqual(decide({ locked: true, here: 4, boarded: true, nodes }, null).mode, 'wait');        // 첫 탈것이 아니므로 승차 확정 플래그로는 탄 것으로 보지 않는다
    r = decide({ locked: true, here: 5, boarded: true, nodes }, null); assert.strictEqual(r.mode, 'ride'); assert.strictEqual(r.cong.kind, null);
  });
  await t('버스 → 지하철 환승: 내림(alight) → 지하철역으로 걷는 중엔 wait(sub) → 지하철 탑승 확정 뒤 혼잡도', () => {
    const nodes = [O, B('가', '1'), B('나', '1'), W1, S('시청'), S('종각')];
    assert.strictEqual(decide({ locked: true, here: 2, boarded: true, nodes }, null).mode, 'alight');
    let r = decide({ locked: true, here: 3, boarded: true, nodes }, null); assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.venue, 'sub'); assert.strictEqual(r.cong.kind, null);
    r = decide({ locked: true, here: 4, boarded: true, nodes }, null); assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.cong.kind, null);   // 지하철역에 닿았지만 아직 안 탔다(환승 구간)
    r = decide({ locked: true, here: 5, boarded: true, nodes }, null); assert.strictEqual(r.mode, null); assert.strictEqual(r.cong.kind, 'sub'); assert.strictEqual(r.cong.idx, 5);
  });
  await t('버스 → 버스 · 지하철 → 지하철', () => {
    const nodes = [O, B('가', '1'), B('나', '1'), W1, B('다', '2'), B('라', '2')];
    assert.strictEqual(decide({ locked: true, here: 2, boarded: true, nodes }, null).mode, 'alight');
    assert.strictEqual(decide({ locked: true, here: 3, boarded: true, nodes }, null).mode, 'wait');
    assert.strictEqual(decide({ locked: true, here: 5, boarded: true, nodes }, null).mode, 'alight');
    const nd2 = [O, S('a', '1호선'), S('b', '1호선'), W1, S('c', '9호선'), S('d', '9호선')];
    assert.strictEqual(decide({ locked: true, here: 2, boarded: true, nodes: nd2 }, null).cong.kind, 'sub');
    const r = decide({ locked: true, here: 3, boarded: true, nodes: nd2 }, null); assert.strictEqual(r.mode, 'wait'); assert.strictEqual(r.line, '9');       // 환승 도보 → 곧 탈 9호선을 기다림
    assert.strictEqual(decide({ locked: true, here: 4, boarded: true, nodes: nd2 }, null).mode, 'wait');
    assert.strictEqual(decide({ locked: true, here: 5, boarded: true, nodes: nd2 }, null).cong.idx, 5);
  });
  await t('대표 캐릭터·등장 순서: 6종 안, 같은 key·같은 날이면 같다, key 가 다르면 달라질 수 있다', () => {
    const IDS = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng'];
    const a = decide({ nowMs: ms('2026-10-15T09:00:00'), locked: true, key: 'k1', here: 1, nodes: BUS }, null), b = decide({ nowMs: ms('2026-10-15T09:01:00'), locked: true, key: 'k1', here: 3, nodes: BUS }, null);
    assert(IDS.includes(a.hero)); assert.strictEqual(a.hero, b.hero); assert.deepStrictEqual(a.cast.slice().sort(), IDS.slice().sort());
    const seen = new Set(); for (let i = 0; i < 40; i++) seen.add(decide({ nowMs: ms('2026-10-15T09:00:00'), locked: true, key: 'route' + i, here: 1, nodes: BUS }, null).hero);
    assert(seen.size >= 4, '여러 캐릭터가 골고루 뽑힌다: ' + [...seen]);
  });
  await t('잘못된 입력에도 죽지 않는다', () => {
    assert.strictEqual(decide({ locked: true, nodes: [] }, null).mode, null); assert.strictEqual(decide({ locked: true, here: 99, nodes: BUS }, null).mode, 'alight'); assert.strictEqual(decide(null, null).mode, 'idle');
    assert.strictEqual(decide({ locked: true, here: -5, nodes: BUS }, null).mode, 'wait');
  });
  console.log(pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
