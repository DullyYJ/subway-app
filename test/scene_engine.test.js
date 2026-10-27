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
    assert.strictEqual(a.tag, '', 's253: 홈 장면 왼쪽 위 날씨 알약은 없다(길동무 브리핑과 겹침)'); assert(a.look.slotKo === '점심' && a.look.wxKo === '맑음' && a.look.temp === 12, '시간대·날씨는 장면 look 에 그대로');
    const b = decide({ nowMs: ms('2026-12-20T05:10:00'), locked: false }, { temp: -3, rain: 90, txt: '눈' });
    assert.strictEqual(b.look.slot, 'dawn'); assert.strictEqual(b.look.wk, 'snow'); assert.strictEqual(b.look.season, 'winter'); assert(b.look.hidesSun && b.look.lit);
    const c = decide({ nowMs: ms('2026-10-15T22:00:00'), locked: false }, null);
    assert.strictEqual(c.look.wxKnown, false); assert.strictEqual(c.look.wxKo, ''); assert.strictEqual(c.look.wxKnown, false); assert.strictEqual(c.tag, ''); assert(c.look.night);
  });
  await t('(07:43 YJ) fill: 경로도 경로 결과도 없을 때만 true — 경로 결과가 나오기 시작하면(확정 전) false, 확정 후에도 false', () => {
    const base = { nowMs: ms('2026-10-16T07:40:00') };
    assert.strictEqual(decide(Object.assign({ locked: false }, base), null).fill, true);
    assert.strictEqual(decide(Object.assign({ locked: false, routeShown: false }, base), null).fill, true);
    const r = decide(Object.assign({ locked: false, routeShown: true }, base), null); assert.strictEqual(r.mode, 'idle'); assert.strictEqual(r.fill, false);
    const nodes = [{ name: '출발', isOrigin: true }, { name: '도보', isWalk: true }, { name: 'A', isBus: true, lineName: '1', hasLoc: true }, { name: 'B', isBus: true, lineName: '1', hasLoc: true }];
    for (const here of [0, 1, 2, 3]) assert.strictEqual(decide(Object.assign({ locked: true, here, nodes }, base), null).fill, false, 'locked ' + here);
  });
  await t('(10:23 YJ) 대표 캐릭터: 키마다 6종이 골고루(독수리만 나오지 않는다) · 같은 키라도 탈것 구간이 다르면 다르게 뽑힌다 · 같은 키·같은 구간이면 그대로', () => {
    const NODES = [{ name: 'o', isOrigin: true }, { name: 'w', isWalk: true }, { name: 'A', isBus: true, lineName: '43', hasLoc: true }, { name: 'B', isBus: true, lineName: '43', hasLoc: true }, { name: 'w', isWalk: true }, { name: 'C', isBus: true, lineName: '6633', hasLoc: true }, { name: 'D', isBus: true, lineName: '6633', hasLoc: true }];
    const cnt = {}; let legDiff = 0;
    for (let i = 0; i < 360; i++) {
      const key = String(1760580000000 + i * 7919 + (i * i) % 977), base = { nowMs: ms('2026-10-16T10:20:00'), locked: true, key, boarded: false, nodes: NODES };
      const a = decide(Object.assign({ here: 1 }, base), null), b = decide(Object.assign({ here: 4 }, base), null), a2 = decide(Object.assign({ here: 2 }, base), null);
      cnt[a.hero] = (cnt[a.hero] || 0) + 1; if (a.hero !== b.hero) legDiff++;
      assert.strictEqual(a.hero, decide(Object.assign({ here: 1 }, base), null).hero, '같은 키·같은 구간이면 그대로');
      assert.strictEqual(a.hero, a2.hero, '같은 구간 안에서는 그대로(here 1→2)');
    }
    assert.strictEqual(Object.keys(cnt).length, 6, '6종 모두: ' + JSON.stringify(cnt));
    Object.values(cnt).forEach(v => assert(v >= 360 / 6 * .6 && v <= 360 / 6 * 1.45, '치우치지 않는다 ' + JSON.stringify(cnt)));
    assert(legDiff > 360 * .6, '구간이 다르면 대체로 다른 캐릭터 ' + legDiff);
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
  await t('캐릭터 특성(YJ 10-16): 6종 모두 착지 연출·동작 대본이 있고, 가을·눈 올 때만 낙엽 다이빙이 들어간다', () => {
    const LAND = { dolsom: 'cotton', ppopu: 'pose', dudung: 'dig', lovel: 'flip', sul: 'fly', chaeng: 'puddle' };
    const sp = { dolsom: ['shake', 'tailchase', 'loaf', 'ball', 'mirror'], ppopu: ['dig', 'bone', 'dance', 'slide'], lovel: ['punch', 'box', 'stretch', 'melt', 'pounce'], dudung: ['shades', 'flag', 'lens', 'dust', 'vanish'], sul: ['glasses', 'stumble', 'feather', 'binoc', 'hover'], chaeng: ['dash', 'flop', 'hide', 'bubbles', 'dew'] };
    const aut = decide({ nowMs: ms('2026-10-16T12:00:00'), locked: false }, null), sum = decide({ nowMs: ms('2026-07-16T12:00:00'), locked: false }, null), snow = decide({ nowMs: ms('2026-01-16T12:00:00'), locked: false }, { txt: '눈', temp: -2, rain: 80 });
    Object.keys(LAND).forEach(id => {
      assert.strictEqual(aut.traits[id].land, LAND[id]);
      sp[id].forEach(x => assert(aut.traits[id].acts.includes(x), id + ' 동작 ' + x));
      assert(aut.traits[id].acts.includes('walk'), '걷기가 사이에 끼는지');
    });
    assert(aut.traits.ppopu.acts.includes('dive') && snow.traits.ppopu.acts.includes('dive'), '가을·눈에는 다이빙');
    assert(!sum.traits.ppopu.acts.includes('dive'), '여름엔 다이빙 없음');
    const a2 = decide({ nowMs: ms('2026-10-16T12:01:00'), locked: false }, null); assert.deepStrictEqual(a2.traits, aut.traits, '같은 시각대(10분)면 같은 대본');
  });
  await t('장소(YJ 10-25): 경로가 없을 때만 바뀌고(20분 단위·같은 시각이면 같다) 7곳이 골고루 나오며, 정류장·역이 있는 장면은 늘 거리, 겨울·추위엔 바닷가가 없다', () => {
    const PL = E.SCENE_PLACES; assert.strictEqual(PL.length, 7);
    const wxC = { temp: 20, feel: 20, txt: '맑음', rain: 0, wind: 5, uv: 3 };
    const seen = new Set(); for (let i = 0; i < 60; i++) { const r = decide({ nowMs: ms('2026-10-15T10:00:00') + i * 21 * 6e4, locked: false, key: 'k' }, wxC); assert(PL.includes(r.look.place), r.look.place); assert(r.look.placeKo); seen.add(r.look.place); }
    assert(seen.size >= 5, '장소가 골고루: ' + [...seen]);
    const a = decide({ nowMs: ms('2026-10-15T10:01:00'), locked: false, key: 'k' }, wxC), b = decide({ nowMs: ms('2026-10-15T10:03:00'), locked: false, key: 'k' }, wxC); assert.strictEqual(a.look.place, b.look.place);
    assert.strictEqual(decide({ nowMs: ms('2026-10-15T10:00:00'), locked: true, key: 'k', here: 1, nodes: BUS }, wxC).look.place, 'street', '정류장 장면은 거리');
    for (let i = 0; i < 80; i++) assert.notStrictEqual(decide({ nowMs: ms('2026-01-15T10:00:00') + i * 21 * 6e4, locked: false, key: 'w' }, { temp: -3, feel: -6, txt: '맑음', rain: 0, wind: 5, uv: 1 }).look.place, 'beach', '겨울·추위엔 바닷가 없음');
  });
  await t('장소가 바뀔 때 걸어 나갈 쪽(s246): 엔진이 +1/-1 로 정하고(20분 칸마다 고정) 양쪽이 다 나온다 · 바람은 km/h 눈금', () => {
    const wxC = { temp: 20, feel: 20, txt: '맑음', rain: 0, wind: 5, uv: 3 }, got = new Set();
    for (let i = 0; i < 40; i++) { const r = decide({ nowMs: ms('2026-10-15T10:00:00') + i * 21 * 6e4, locked: false, key: 'k' }, wxC); assert(r.look.pdir === 1 || r.look.pdir === -1); got.add(r.look.pdir); }
    assert(got.has(1) && got.has(-1), '양쪽 방향이 다 나온다');
    const a = decide({ nowMs: ms('2026-10-15T10:01:00'), locked: false, key: 'k' }, wxC), b = decide({ nowMs: ms('2026-10-15T10:03:00'), locked: false, key: 'k' }, wxC);
    assert.strictEqual(a.look.pdir, b.look.pdir, '같은 20분 칸이면 같은 방향');
    assert.strictEqual(decide({ nowMs: ms('2026-10-15T10:00:00'), locked: true, key: 'k', here: 1, nodes: BUS }, wxC).look.pdir, undefined, '정류장 장면은 장소가 안 바뀌니 방향 없음');
    assert.strictEqual(decide({ nowMs: ms('2026-10-15T09:00:00'), locked: false, key: 'w' }, { temp: 15, feel: 15, txt: '맑음', rain: 0, wind: 16, uv: 2 }).look.wind, 1, '시속 16km = 산들바람');
    assert.strictEqual(decide({ nowMs: ms('2026-10-15T09:00:00'), locked: false, key: 'w' }, { temp: 15, feel: 15, txt: '맑음', rain: 0, wind: 4, uv: 2 }).look.wind, 0, '시속 4km = 잔잔');
  });
  await t('날씨 반응(YJ 10-25): 추위·더위·햇빛·바람·비·눈·안개마다 반응 동작과 말이 있고, 날씨를 모르면 없다', () => {
    const run = (wx, when) => decide({ nowMs: ms(when || '2026-10-15T13:00:00'), locked: false, key: 'r' }, wx);
    const has = (r, name) => SCENE_IDS.every(id => !r.traits[id].acts.includes(name)) ? false : SCENE_IDS.every(id => r.traits[id].acts.includes(name) && typeof r.traits[id].say[name] === 'string' && r.traits[id].say[name]);
    const SCENE_IDS = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng'];
    const cold = run({ temp: -4, feel: -9, txt: '맑음', rain: 0, wind: 5, uv: 1 }, '2026-01-15T09:00:00'); assert(has(cold, 'shiver'), '추위');
    const hot = run({ temp: 33, feel: 36, txt: '맑음', rain: 0, wind: 4, uv: 8 }, '2026-07-15T14:00:00'); assert(has(hot, 'pant'), '더위');
    const sun = run({ temp: 22, feel: 22, txt: '맑음', rain: 0, wind: 4, uv: 7 }); assert(has(sun, 'squint'), '햇빛');
    const wind = run({ temp: 15, feel: 13, txt: '맑음', rain: 0, wind: 35, uv: 2 }, '2026-10-15T09:00:00'); assert(wind.look.wind === 2); assert(has(wind, 'gust') || has(wind, 'squint') || has(wind, 'pant') || SCENE_IDS.every(id => wind.traits[id].acts.includes('gust')), '바람');
    const rain = run({ temp: 18, feel: 18, txt: '비', rain: 90, wind: 5, uv: 0 }); assert(SCENE_IDS.every(id => rain.traits[id].acts.includes('splash') || rain.traits[id].acts.includes('shakeoff')), '비');
    const snow = run({ temp: -1, feel: -4, txt: '눈', rain: 0, wind: 5, uv: 0 }, '2026-01-15T10:00:00'); assert(SCENE_IDS.every(id => snow.traits[id].acts.includes('snowcatch')), '눈');
    const fog = run({ temp: 12, feel: 12, txt: '안개', rain: 0, wind: 2, uv: 0 }); assert(SCENE_IDS.every(id => fog.traits[id].acts.includes('peer')), '안개');
    const none = decide({ nowMs: ms('2026-10-15T13:00:00'), locked: false, key: 'r' }, null);
    SCENE_IDS.forEach(id => ['shiver', 'pant', 'squint', 'gust', 'splash', 'shakeoff', 'snowcatch', 'peer'].forEach(x => assert(!none.traits[id].acts.includes(x), '날씨를 모르면 반응을 지어내지 않는다: ' + x)));
    const a2 = run({ temp: -4, feel: -9, txt: '맑음', rain: 0, wind: 5, uv: 1 }, '2026-01-15T09:00:00'); assert.deepStrictEqual(a2.traits, cold.traits, '같은 입력이면 같은 대본');
  });
  await t('지하철 객실(s232): 승하차 계획 — 첫 역은 변화 없음 · 내리는 건 타고 있던 친구만 · 타는 건 안 타고 있던 친구만 · 대표는 종점까지 · 종점에서 모두 내림 · 같은 입력이면 같다', () => {
    const SUBS = [O, S('임학', '인천1호선'), S('박촌', '인천1호선'), S('귤현', '인천1호선'), S('계양', '인천1호선'), S('아시아드', '인천1호선'), S('검단', '인천1호선'), S('검암', '인천1호선'), N({ name: '도착' })];
    const r = decide({ nowMs: ms('2026-10-26T12:00:00'), tzOffsetMin: 540, locked: true, here: 2, boarded: true, key: 'k', nodes: SUBS }, null);
    assert.strictEqual(r.mode, null); assert(r.train, '지하철 타는 중엔 train 이 있다');
    const T = r.train, idx = id => E.SCENE_CHARS ? E.SCENE_CHARS.indexOf(id) : ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng'].indexOf(id);
    assert.strictEqual(T.first, 1); assert.deepStrictEqual(T.names, ['임학', '박촌', '귤현', '계양', '아시아드', '검단', '검암']); assert.strictEqual(T.stops.length, T.names.length);
    const hb = 1 << idx(r.hero); assert(T.init & hb, '대표는 처음부터 타고 있다');
    assert.deepStrictEqual(T.stops[0].slice(1), [0, 0], '첫 역(타는 역)에서는 내리고 타는 일이 없다');
    let on = T.init;
    T.stops.forEach((sp, k) => {
      assert.strictEqual(sp[0], on, k + '번째 역 직전 탑승자가 이어진다');
      assert.strictEqual(sp[1] & ~sp[0], 0, '내리는 건 타고 있던 친구만'); assert.strictEqual(sp[2] & sp[0], 0, '타는 건 안 타고 있던 친구만'); assert.strictEqual(sp[1] & sp[2], 0, '같은 역에서 내리고 바로 타지 않는다');
      if (k < T.stops.length - 1) assert(!(sp[1] & hb), '대표는 종점 전에는 안 내린다');
      on = (on & ~sp[1]) | sp[2];
    });
    const last = T.stops[T.stops.length - 1]; assert.strictEqual(last[1], last[0], '종점에서는 모두 내린다'); assert.strictEqual(last[2], 0);
    assert(T.stops.slice(1, -1).some(sp => sp[1] || sp[2]), '중간 역 어딘가에서는 내리거나 타는 친구가 있다');
    assert(T.say.out.length >= 3 && T.say.in.length >= 3 && T.lb.length === 2, '말풍선 글·라벨은 엔진이 준다');
    const again = decide({ nowMs: ms('2026-10-26T12:00:00'), tzOffsetMin: 540, locked: true, here: 2, boarded: true, key: 'k', nodes: SUBS }, null);
    assert.deepStrictEqual(again.train, T, '같은 입력이면 같은 계획');
    const later = decide({ nowMs: ms('2026-10-26T12:05:00'), tzOffsetMin: 540, locked: true, here: 4, boarded: true, key: 'k', nodes: SUBS }, null);
    assert.deepStrictEqual(later.train, T, '여정 안에서 역이 지나가도 계획은 그대로(시각·위치가 아니라 여정으로 정해진다)');
    assert.strictEqual(later.cong.idx, 4, '혼잡도 칸은 지금 역을 따라간다');
    const busR = decide({ nowMs: ms('2026-10-26T12:00:00'), tzOffsetMin: 540, locked: true, here: 1, boarded: true, key: 'b', nodes: [O, B('A'), B('B'), N({ name: '도착' })] }, null);
    assert(!busR.train, '버스에는 객실 계획이 없다');
  });
  await t('잘못된 입력에도 죽지 않는다', () => {
    assert.strictEqual(decide({ locked: true, nodes: [] }, null).mode, null); assert.strictEqual(decide({ locked: true, here: 99, nodes: BUS }, null).mode, 'alight'); assert.strictEqual(decide(null, null).mode, 'idle');
    assert.strictEqual(decide({ locked: true, here: -5, nodes: BUS }, null).mode, 'wait');
  });
  console.log(pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
