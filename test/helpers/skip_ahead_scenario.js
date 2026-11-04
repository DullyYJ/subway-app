// s432 앞 역 승차 시나리오(YJ: 다른 버스로 지식정보단지가 아닌 테크노파크에 먼저 와서 기다리는데 탑승 버튼도 시각 갱신도 없었다) — 결정적 좌표로 5초 걸음을 재생한다.
'use strict';
const DAY = Date.parse('2026-11-04T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const LAT = 37.39, LNG0 = 126.64, DL = 0.0137;
// 노드: 0 출발, 1~3 버스 6번(3 하차=지식정보단지), 4~8 인천1호선(4 지식정보단지, 5 테크노파크, 6 캠퍼스타운, 7 동막, 8 아라)
function build() {
  const PL = [null, 17 * 60 + 12, 17 * 60 + 25, 17 * 60 + 50, 17 * 60 + 53, 17 * 60 + 55, 17 * 60 + 57, 17 * 60 + 59, 18 * 60 + 49];
  const nd = [{ name: '출발', isOrigin: true }], stops = [], seq = [], cells = [], map = [];
  for (let i = 1; i <= 8; i++) {
    const bus = i <= 3;
    nd.push({ name: ['', '라이크홈', 'B2', '지식정보단지(버스)', '지식정보단지', '테크노파크', '캠퍼스타운', '동막', '아라'][i], isBus: bus, isSub: !bus, lineName: bus ? '6' : '인천1호선', planMin: PL[i] });
    stops.push({ i, lat: LAT + (bus ? 0.01 : 0), lng: LNG0 + DL * (bus ? i - 1 : i - 4 + 3), arrMs: DAY + PL[i] * 60000, pass: true, fin: i === 8 });
    seq.push(i); cells.push({ n: nd[i].name, t: '--:--', dc: '#336699', dk: 1, m: nd[i].name }); map.push(i);
  }
  stops[3].lat = stops[2].lat; stops[3].lng = stops[2].lng;
  return { v: 1, tripSig: 'R1', eta: { nodes: nd, passes: [{ idx: 1, ms: at(17, 12, 0), src: 'gps' }, { idx: 2, ms: at(17, 25, 0), src: 'gps' }], boarded: true, notDeparted: false, timetableFirst: false, tzOffsetMin: 540 },
    stops, trail: [], cfg: { targets: [{ seqPos: 7, nodeIdx: 8, name: '아라', kind: 'dest' }], seq, allowed: {}, destName: '아라' }, fired: {},
    ovl: { cells, map, base: 0, theme: { bg: '#fff', fg: '#111', sub: '#888' } } };
}
// 사용자가 who 번 역(기본 5=테크노파크) 자리에 서 있다. rec(req, out) 은 걸음마다 불린다.
function run(rideStandby, opt) {
  opt = opt || {}; const who = opt.who || 5, from = opt.from || at(17, 36, 0), to = opt.to || at(17, 41, 30);
  let st = build(), out = null, ask = null, k = 0; const s = st.stops[who - 1], notes = [];
  for (let ms = from; ms <= to; ms += 5000, k++) {
    const j = ((k * 7) % 11 - 5) * 0.000004;
    const req = { nowMs: ms, fixes: [[ms, s.lat + j, s.lng - j, 12]], state: JSON.parse(JSON.stringify(st)), ovl: true };
    if (ask) { req.bl = { kind: 'sub', i: ask.i, at: ms - 1000, ms: ms + 240000, src: 'timetable' }; ask = null; }
    out = rideStandby(JSON.parse(JSON.stringify(req)));
    if (opt.rec) opt.rec(req, out);
    st = out.state; if (out.ask) ask = out.ask.body;
    (out.notes || []).forEach(n => notes.push(n));
  }
  return { st, out, notes };
}
module.exports = { run, build, at, DAY };
