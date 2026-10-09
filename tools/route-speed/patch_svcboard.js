// s18: 버스 운행시간 — 승차 '시각' 기준으로 모든 경로를 다시 확인한다.
//  문제(2026-10-09, 인천 아라동→구의 새벽): 그래프는 '출발 시각'에 운행 중인 노선만 넣고, 승차 시각 확인(svcAtBoard)은 경로를 다 고른 뒤에야 했다.
//   · 출발 23:15 → 버스를 실제로 타는 시각 00:26 이 이미 막차(22:30 + 여유 60분) 뒤인데도 그 버스로 경로가 나왔다.
//   · 막차 뒤(자정 직후)를 svcOffState 가 '첫차 전(before)'으로 잘못 분류해, 앱이 '버스 첫차 05:30 기준'이라고 안내했다.
//  수정:
//   1) svcOffState: 마지막 운행 종료 후 경과 vs 첫차까지 남은 시간(원형 시계)을 비교해 가까운 쪽으로 분류.
//   2) svcAtBoard: 버스 경고에 노선 키(rk)를 함께 싣는다.
//   3) dijkstra 를 감싸, 결과 경로에 '타는 시각에 운행 안 하는 버스'가 있으면 그 노선을 막고(G.svcBan) 다시 탐색(최대 8번).
//      다시 찾은 경로에 버스 경고가 없을 때만 그걸 쓰고, 못 찾으면 원래 경로와 경고를 그대로 낸다(정직한 안내).
//      버스 경고가 없는 경로는 코드 경로가 하나도 바뀌지 않는다(결과 동일).
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
function rep(a,b){ if(s.split(a).length!==2) throw new Error('anchor: '+a.slice(0,70)); s=s.replace(a,b); }

// 1) svcOffState
rep(`  const e = w.e + SVC_GRACE_MIN;
  const s = w.s;
  if (e >= s && e < 1440) {
    return nowMin < s ? "before" : "after";
  }
  return "before";
}`,`  const e = (w.e + SVC_GRACE_MIN) % 1440;
  const s = w.s;
  const since = ((nowMin - e) % 1440 + 1440) % 1440;   // 마지막 운행(여유 포함)이 끝난 지 얼마나 됐나
  const until = ((s - nowMin) % 1440 + 1440) % 1440;   // 첫차까지 얼마나 남았나
  return since < until ? "after" : "before";
}`);

// 2) svcAtBoard — 노선 키
rep(`out.push({ type: "bus", name: L.busNo || L.line, at: boardMin, last: w.e, state: svcOffState(w, boardMin) });`,
    `out.push({ type: "bus", name: L.busNo || L.line, at: boardMin, last: w.e, first: w.s, state: svcOffState(w, boardMin), rk: L.line });`);

// 3) 간선 건너뛰기
rep(`  let _bwM = null;
  if (_liveE &&`,`  const _svcBan = G.svcBan || null;
  let _bwM = null;
  if (_liveE &&`);
rep(`      if (ride && G.subOff && G.subOff.has(e.line)) continue;`,
    `      if (ride && G.subOff && G.subOff.has(e.line)) continue;
      if (_svcBan !== null && ek === "bus" && _svcBan[e.line] === 1) continue;`);

// 4) 래퍼
rep(`function dijkstra(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt) {
  DJ_STAT.calls++;`,`function dijkstra(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt) {
  const r0 = dijkstraRaw(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt);
  const hasBusWarn = (r) => !!(r && r.svcWarn && r.svcWarn.some((w) => w && w.type === "bus" && w.rk));
  if (!hasBusWarn(r0)) return r0;
  const outerBan = G.svcBan || null;
  const bd0 = G.__djLastBd;
  const ban = Object.create(null);
  if (outerBan) for (const k in outerBan) ban[k] = 1;
  let cur = r0;
  try {
    for (let it = 0; it < 8 && hasBusWarn(cur); it++) {
      for (const w of cur.svcWarn) if (w && w.type === "bus" && w.rk) ban[w.rk] = 1;
      G.svcBan = ban;
      const r2 = dijkstraRaw(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt);
      if (!r2) { G.__djLastBd = bd0; return r0; }
      cur = r2;
    }
  } finally {
    G.svcBan = outerBan;
  }
  if (hasBusWarn(cur)) { G.__djLastBd = bd0; return r0; }
  cur.svcRerouted = true;
  return cur;
}
function dijkstraRaw(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt) {
  DJ_STAT.calls++;`);
fs.writeFileSync(process.argv[3],s);console.log('ok svcboard');
