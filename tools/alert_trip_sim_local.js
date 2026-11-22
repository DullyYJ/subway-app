// 길동무 — 브라우저 시험기(tools/alert_trip_sim.js)를 노드에서 그대로 돌린다. /ride-standby 는 서버에 부르지 않고 저장소 엔진(engine/ride-standby.js)을 직접 부른다.
//
// 왜 있나: "배포된 엔진이 내 저장소 코드와 정말 같은 일을 하나?" 를 확인하려고 — 브라우저 시험기가 배포 엔진에 낸 결과(알림 시각 · curIdx 바뀐 때 · 누락)와
//   이 스크립트가 저장소 엔진에 낸 결과가 걸음마다 같으면 같은 코드다(s472 에서 정확히 일치함을 확인). 다르면 ① 배포가 안 됐거나 옛 파일이거나 ② 시험기 옵션이 다른 것이다
//   (s473 때 브라우저 탭에 붙여 둔 시험기가 realMove 옵션 없는 옛 함수라 '기어가는 사람'이 돌았고, 그걸 이 스크립트가 가려냈다 → 탭에는 항상 이 저장소의 alert_trip_sim.js 를 새로 붙일 것).
//
// 쓰는 법: node tools/alert_trip_sim_local.js <state.json> ['{"realMove":true,"delaySec":150,"noise":25}']
//   state.json = /ride/start 가 준 state(브라우저: JSON.stringify(__A.states[이름].state)). 출력 = 알림 시각(첫 정류장 기준) · 누락 · 안내 끝 · curIdx 앞섬/뒤처짐.
//   엔진 파일을 바꿔 보려면 ENGINE 환경변수: ENGINE=/경로/ride-standby.js node tools/alert_trip_sim_local.js …   (옛 버전과 견줄 때)
'use strict';
const fs = require('fs'), path = require('path');
const SB = require(process.env.ENGINE ? path.resolve(process.env.ENGINE) : path.join(__dirname, '..', 'engine', 'ride-standby.js'));
global.window = global;
global.fetch = async (url, init) => {       // 시험기가 부르는 서버 요청을 저장소 엔진으로 대신한다(/ride-standby 만; 시각표 /next-train 은 빈 답 = 시각표 없음)
  const u = String(url), none = { status: 200, headers: { get: () => null }, json: async () => ({}) };
  if (u.indexOf('/ride-standby') < 0) return none;
  const r = SB.rideStandby(JSON.parse(init.body));
  return { status: 200, headers: { get: () => null }, json: async () => JSON.parse(JSON.stringify(r)) };
};
require('./alert_trip_sim.js');
const A = global.__A;
module.exports = { A, SB };

if (require.main === module) {
  (async () => {
    const st = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), opt = JSON.parse(process.argv[3] || '{}');
    const r = await A.trip(st, opt);
    if (r.error) { console.log('error', JSON.stringify(r)); process.exit(1); }
    const tl = []; let prev = null;
    for (const c of r.__calls) if (c[2] !== prev) { tl.push(c[0] + ':' + c[2]); prev = c[2]; }
    console.log(JSON.stringify({ want: r.want, alerted: r.alerted, missing: r.missing, dup: r.dup, unexpected: r.unexpected, lat: r.lat, latMin: r.latMin, latMax: r.latMax, doneSecAfterArr: r.doneSecAfterArr, aheadMaxSteps: r.aheadMaxSteps, aheadSec: r.aheadSec, behindSec: r.behindSec, ciChanges: tl.join(' ') }, null, 1));
  })();
}
