// 무작위 경로 시뮬레이션 — 사용: node fuzz.js <index.html> <N> <seed> > out.json
// 경로 유형(도보/지하철/버스/환승)을 섞고, 실제 도착 시각(진실)과 앱이 받는 이벤트(승차 확정 지연·기지국 선행·위치 채택 지연·역 건너뜀)를 변형해
// 화면의 도착 예정·남은 시간·승차 시각·오버레이 현재 역이 진실에서 얼마나 벗어나는지 잰다.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const html = process.argv[2], N = +(process.argv[3] || 60), SEED = +(process.argv[4] || 1);
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const KINDS = [
  ['walk', 'sub'], ['walk', 'sub', 'xfer', 'sub'], ['walk', 'sub', 'xfer', 'sub', 'walk', 'bus'], ['bus'], ['bus', 'xfer', 'sub'],
  ['sub'], ['walk', 'bus', 'xfer', 'bus'], ['walk', 'sub', 'walk', 'bus'], ['walk', 'bus'], ['sub', 'xfer', 'sub', 'xfer', 'sub'],
];
const INC = ['동막', '동춘', '원인재', '신연수', '선학', '문학경기장', '인천터미널', '예술회관', '인천시청', '간석오거리', '부평삼거리', '동수', '부평', '부평시장', '부평구청', '갈산'];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await page.clock.install({ time: new Date('2026-10-06T17:00:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(2500); await page.evaluate((v) => { window.__LEADFIXENV = v; }, !!process.env.LEADFIX);
  const R = rng(SEED); const pick = (a) => a[Math.floor(R() * a.length)]; const ri = (a, b2) => a + Math.floor(R() * (b2 - a + 1));
  const out = [];
  for (let sc = 0; sc < N; sc++) {
    const kind = pick(KINDS); const startMin = ri(17 * 60 + 10, 19 * 60 + 20);
    // ── 경로 만들기(계획 시각, 분 단위 실수) ──
    const nodes = []; const truthDelayMin = {}; let t = startMin, firstSub = true, legId = 0;
    nodes.push({ name: '출발', isOrigin: true, plan: t });
    const legs = [];
    kind.forEach((k) => {
      if (k === 'walk') { t += ri(3, 8); nodes.push({ name: '도보', isWalk: true, plan: t }); }
      else if (k === 'xfer') { t += ri(3, 6); nodes.push({ name: '환승', isWalk: true, plan: t }); }
      else if (k === 'sub') {
        legId++; const n = ri(4, 12); const line = firstSub ? '인천1호선' : '7호선'; const start = nodes.length;
        t += (k === 'sub' && nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(2, 6) : 0;   // 승차 대기
        for (let i = 0; i < n; i++) { nodes.push({ name: firstSub ? (i === 0 ? '캠퍼스타운' : INC[i - 1]) : '역' + legId + '_' + i, isSub: true, line, plan: t, leg: legId }); t += ri(2, 3) + (R() < 0.3 ? 0.5 : 0); }
        t -= 2; firstSub = false; legs.push({ start, end: nodes.length - 1, id: legId, type: 'sub' });
      } else if (k === 'bus') {
        legId++; const n = ri(4, 10); const start = nodes.length;
        t += (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(2, 7) : ri(1, 3);
        for (let i = 0; i < n; i++) { nodes.push({ name: '정류장' + legId + '_' + i, isBus: true, line: '버스 ' + legId, plan: t, leg: legId }); t += ri(1, 3); }
        t -= 1; legs.push({ start, end: nodes.length - 1, id: legId, type: 'bus' });
      }
    });
    // ── 진실(실제 도착 시각, ms from midnight) ──
    const truth = {}; let drift = 0;
    legs.forEach((lg) => {
      const lateBoard = pick([0, 0, 0, 0.5, 1, 1, 2, 3]);           // 열차·버스가 계획보다 늦게 출발(분)
      let cum = lateBoard; drift = lateBoard;
      for (let i = lg.start; i <= lg.end; i++) {
        if (i > lg.start) { const seg = nodes[i].plan - nodes[i - 1].plan; cum += (R() - 0.35) * 0.5 + (R() < 0.2 ? 0.5 : 0); }
        truth[i] = (nodes[i].plan + cum) * 60;
      }
    });
    // 이전 구간이 늦으면 다음 승차는 그만큼 밀림(환승): 간단히 구간 시작 진실이 이전 구간 끝 진실보다 앞서지 않게
    legs.forEach((lg, li) => { if (li > 0) { const prevEnd = truth[legs[li - 1].end]; if (truth[lg.start] < prevEnd + 120) { const d = prevEnd + 120 - truth[lg.start]; for (let i = lg.start; i <= lg.end; i++) truth[i] += d; } } });
    const destIdx = nodes.length - 1; const destTruth = truth[destIdx];
    // ── 앱이 받는 이벤트 ──
    const events = [];   // {at(sec), type:'board'|'adopt', idx}
    const trIdx = []; for (let i = 0; i < nodes.length; i++) if (truth[i] != null) trIdx.push(i);
    legs.forEach((lg, li) => {
      const lateConfirm = R() < 0.12 ? ri(180, 360) : ri(25, 110);
      events.push({ at: truth[lg.start] + lateConfirm, type: 'board', idx: lg.start });
      let lastAt = truth[lg.start] + lateConfirm;
      for (let i = lg.start + 1; i <= lg.end; i++) {
        if (R() < 0.08 && i < lg.end) continue;                                    // PF 가 이 역을 건너뜀
        if (R() < 0.5) { const le = truth[i] - ri(60, 170); if (le > lastAt + 5) { events.push({ at: le, type: 'adopt', idx: i, lead: true }); lastAt = le; } }   // 기지국 선행
        const a = Math.max(lastAt + 5, truth[i] + ri(5, 70)); events.push({ at: a, type: 'adopt', idx: i }); lastAt = a;
      }
    });
    events.sort((x, y) => x.at - y.at);
    // ── 앱에 설치 ──
    await page.clock.setSystemTime(new Date(new Date('2026-10-06T00:00:00+09:00').getTime() + (startMin - 3) * 60000));
    await page.evaluate((nodes) => {
      const N = nodes.map((n, i) => ({ name: n.name, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: !!n.isSub, isBus: !!n.isBus, isWalk: !!n.isWalk, isOrigin: !!n.isOrigin, lineName: n.line || '', _schedMin: n.plan, el: null,
        arrTime: ('0' + Math.floor(Math.round(n.plan) / 60)).slice(-2) + ':' + ('0' + (Math.round(n.plan) % 60)).slice(-2) }));
      _transitNodeData = N; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false; window._markerPos = null; window._pfBest = null; window.__leadIdx = {}; window.__LEADFIX = !!window.__LEADFIXENV; window._rideEvReset && window._rideEvReset('fuzz');
    }, nodes);
    const mid = new Date('2026-10-06T00:00:00+09:00').getTime();
    const rec = [];
    for (const ev of events) {
      await page.clock.setSystemTime(new Date(mid + ev.at * 1000));
      const r = await page.evaluate(([ev, destIdx]) => {
        try {
          if (ev.type === 'board') { window._htlBoarded = true; window._gpsMaxIdx = Math.max(window._gpsMaxIdx, ev.idx); window._gpsConfirmIdx = window._gpsMaxIdx; window._nodePassMs[ev.idx] = window._nodePassMs[ev.idx] == null ? Date.now() : window._nodePassMs[ev.idx]; _recalcArrivalsFrom(ev.idx); }
          else { const pg = window._gpsMaxIdx; window._gpsMaxIdx = Math.max(pg, ev.idx); window._gpsConfirmIdx = Math.max(window._gpsConfirmIdx, ev.idx); if (ev.idx > pg || window._nodePassMs[ev.idx] == null) window._nodePassMs[ev.idx] = Date.now(); else if (window.__LEADFIX && !ev.lead && window.__leadIdx && window.__leadIdx[ev.idx]) { window._nodePassMs[ev.idx] = Date.now(); delete window.__leadIdx[ev.idx]; } if (ev.lead) { window.__leadIdx = window.__leadIdx || {}; window.__leadIdx[ev.idx] = true; } _recalcArrivalsFrom(ev.idx); }
          const Nn = _transitNodeData; const p = Nn[destIdx].arrTime.split(':'); const eta = (+p[0]) * 60 + (+p[1]);
          const bn = Nn.findIndex(n => !n.isOrigin && !n.isWalk); const bp = Nn[bn].arrTime.split(':');
          let here = -1; try { here = _pipHereIdx(); } catch (e) {}
          return { eta: eta, here: here, boardShown: (+bp[0]) * 60 + (+bp[1]), tl: Nn.map(n => n.arrTime) };
        } catch (e) { return { err: String(e.message) }; }
      }, [ev, destIdx]);
      if (r.err) { rec.push({ err: r.err }); continue; }
      // 진실 위치: 이 시각까지 도착한 마지막 노드
      let ti = -1; for (const i of trIdx) if (truth[i] <= ev.at) ti = i;
      rec.push({ at: ev.at, type: ev.type, lead: !!ev.lead, idx: ev.idx, etaErr: r.eta - destTruth / 60, here: r.here, trueIdx: ti, tl: r.tl });
    }
    out.push({ sc, kind: kind.join('>'), truthBoard: truth[legs[0].start] / 60, firstTransit: legs[0].start, startMin, destPlan: nodes[destIdx].plan, destTruth: destTruth / 60, nodes: nodes.length, rec });
  }
  console.log(JSON.stringify({ errs: errs, out: out }));
  await b.close();
})();
