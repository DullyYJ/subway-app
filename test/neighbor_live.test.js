'use strict';
// route-v2 s228: 같은 버스의 이웃 정류장 실시간으로 빈 정류장을 채운다 + 실시간 있는 곳이 가정치 정류장에 밀리지 않는다 (순환43 한진/선광).
const fs = require('fs'), path = require('path'), vm = require('vm');
const W = fs.readFileSync(process.env.W_PATH || path.join(__dirname, '..', 'engine/route-v2-worker.ascii.js'), 'utf8');
function cut(name, kind) {
  const a = W.indexOf((kind || 'function ') + name);
  if (a < 0) throw new Error(name + ' 없음');
  const b = W.indexOf('__name2(' + name + ',', a);
  const c = W.indexOf('__name(' + name + ',', a);
  const e = b > 0 ? b : c;
  return W.slice(a, e > 0 ? e : a + 1);
}
const parts = ['hav', 'busSegSec', 'stopNorm', 'noKey', 'buildStopRouteIdx', 'neighborLiveList', 'busWaitAtRaw', 'boardAbsSec', 'shiftBoard'].map((n) => cut(n));
const consts = ['BUS_STOP_SEC', 'BUS_CRUISE_MPS', 'BUS_LONGHOP_LOW_M', 'BUS_LONGHOP_HIGH_M', 'BUS_HIGHWAY_MPS', 'CATCH_BUFFER_SEC', 'NEIGH_STOPS', 'NEIGH_MAX_SEC', 'NEIGH_DOWN_K', 'NEIGH_UP_K', 'BUS_WAIT', 'LOOP_BACK_M', 'LOOP_MIN_GAIN', 'LOOP_LOOKAHEAD', 'WALK_MPS', 'UNKNOWN_MULT', 'UNKNOWN_MULT_RED'].map((n) => {
  const m = new RegExp('^var ' + n + ' = [^;]+;', 'm').exec(W);
  if (!m) throw new Error(n + ' 상수 없음');
  return m[0];
}).join('\n');
const ctx = { __name: (f) => f, __name2: (f) => f, Math, String, Array, Object, isFinite, Infinity, RED_BUS_RE: /광역|급행/, rtwLookup: () => null, isPassStop: () => false, walkCapSec: () => 1800, busAllowed: () => true, stopNmKey: (x) => String(x || ''), CROSS_ROAD_M: 60 };
vm.createContext(ctx);
vm.runInContext('var _SN_MEMO=new Map();\n' + consts + '\n' + parts.join('\n') + '\nthis.nl=neighborLiveList;this.bw=busWaitAtRaw;this.ba=boardAbsSec;this.sb=shiftBoard;', ctx);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// 순환43 하행: 한진(ICB364000541) -> 선광(ICB364000543) -> 앰코 -> 대동도어 ...
const RK = '23_ICB365000516';
const stops = [
  ['ICB364000541', 37.347225, 126.628096, 42], ['ICB364000543', 37.347214, 126.636187, 43],
  ['ICB365000880', 37.358526, 126.653653, 44], ['ICB365000983', 37.360842, 126.654278, 45], ['ICB365000864', 37.36587, 126.657822, 46],
];
function mk(live, acc) {
  return {
    routeStops: { [RK]: stops.map((s) => ({ node_id: s[0], lat: s[1], lng: s[2], seq: s[3] })) },
    routeNoOf: { [RK]: '순환43'.replace('순환43', '순환' + '43') }, routeWait: { [RK]: 480 }, routeTypeOf: { [RK]: '지선버스' },
    live, accessSec: acc || {},
  };
}
const NO = '순환' + '43';
const H = 'ICB364000541', S = 'ICB364000543';
// 1) 선광에만 실시간 -> 한진은 (선광 도착 - 이동) 으로 채워진다
let G = mk({ [S.replace(/^(ICB)3/, '$1#')]: { [NO]: [400], __names: [NO] } });
G.live = { [ctx.stopNorm(S)]: { [NO]: [400], __names: [NO] } };
let l = ctx.nl(G, RK, H);
ok(l && l.length === 1 && l[0] > 150 && l[0] < 330, '선광 400s -> 한진은 더 일찍: ' + JSON.stringify(l));
// 2) 한진에만 실시간 -> 선광은 더 늦게
G.live = { [ctx.stopNorm(H)]: { [NO]: [200], __names: [NO] } };
l = ctx.nl(G, RK, S);
ok(l && l[0] > 300 && l[0] < 450, '한진 200s -> 선광은 더 늦게: ' + JSON.stringify(l));
// 3) 다른 노선 도착뿐이면 채우지 않는다
G.live = { [ctx.stopNorm(H)]: { '99': [200], __names: ['99'] } };
ok(ctx.nl(G, RK, S) === null, '다른 노선만 있으면 null');
// 4) 핵심: 한진 버스가 곧 도착(걸어서 못 탐) + 선광 정보 없음 -> 선광도 못 탄다고 나와야 하고 가정치(절반)로 유리해지면 안 됨
G = mk({}, {}); G.live = { [ctx.stopNorm(H)]: { [NO]: [120], __names: [NO] } };
const walkH = 130, walkS = 480;
const bH = ctx.ba(G, RK, H, walkH), bS = ctx.ba(G, RK, S, walkS);
ok(bH.src === '다놓침' && bS.src === '다놓침', '둘 다 다 놓침 취급: ' + bH.src + '/' + bS.src);
ok(bS.sec >= bH.sec, '선광이 한진보다 빠르게 계산되지 않음: ' + bS.sec + ' vs ' + bH.sec);
// 5) 선광 정보만 있는 경우 한진은 같은 버스를 탈 수 있다(걸음이 더 짧으니까)
G = mk({}, {}); G.live = { [ctx.stopNorm(S)]: { [NO]: [700], __names: [NO] } };
const bH2 = ctx.ba(G, RK, H, walkH);
ok(bH2.real === true && bH2.sec < 700 && bH2.sec > walkH, '선광 700s 버스를 한진에서 먼저 탐: ' + bH2.sec);
// 6) busWaitAtRaw 도 같은 값
G = mk({}, { [ctx.stopNorm(H)]: walkH, [ctx.stopNorm(S)]: walkS }); G.live = { [ctx.stopNorm(S)]: { [NO]: [700], __names: [NO] } };
const w = ctx.bw(G, RK, H);
ok(Math.abs(w - (bH2.sec - walkH)) < 1 && G.__waitSrc === '실측', '대기시간 계산도 이웃 값 사용: ' + w + ' ' + G.__waitSrc);
// 7) 자기 정류장 실시간이 있으면 이웃은 무시
G.live[ctx.stopNorm(H)] = { [NO]: [500], __names: [NO] };
ok(ctx.bw(G, RK, H) === 500 - walkH, '자기 정류장 우선');
// 8) 정류장 정보가 전혀 없으면 기존 가정치
G = mk({}, { [ctx.stopNorm(H)]: walkH }); G.live = {};
ok(ctx.bw(G, RK, H) > 0 && G.__waitSrc !== '실측', '정보 없으면 가정치');
// 9) shiftBoard: 한진 버스가 곧 도착(못 탐)이어도 정보 없는 선광으로 옮기지 않는다 (s228 이전엔 옮겼음)
function leg(G) {
  const st = G.routeStops[RK];
  return { mode: 'bus', line: RK, busNo: NO, boardStopId: H, from: 'h', stopList: st.map((x, i) => 'n' + i), coordList: st.map((x) => [x.lat, x.lng]), secList: [0, 170, 900, 1000, 1200], sec: 1200 + 400, waitSec: 400 };
}
G = mk({}, {}); G.live = { [ctx.stopNorm(H)]: { [NO]: [120], __names: [NO] } };
let lg = leg(G);
let sh = ctx.sb([lg], G, 37.3472, 126.6325, 300);
ok(sh === null && lg.boardStopId === H, '곧 도착(놓침)+이웃 정보 없음 -> 한진 유지: ' + JSON.stringify(sh));
// 10) 한진 정보가 없고 선광 정보만 -> 한진 유지(같은 버스를 먼저 탄다)
G = mk({}, {}); G.live = { [ctx.stopNorm(S)]: { [NO]: [700], __names: [NO] } };
lg = leg(G);
sh = ctx.sb([lg], G, 37.3472, 126.6325, 300);
ok(sh === null && lg.boardStopId === H, '선광 실시간만 있어도 한진 유지');
console.log('neighbor_live: pass', pass, 'fail', fail);
process.exit(fail ? 1 : 0);
