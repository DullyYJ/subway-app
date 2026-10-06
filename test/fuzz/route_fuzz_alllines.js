// 실제 인천1호선 시간표 기반 시뮬 — node fuzz2.js <index.html> <N> <seed> [ANOM=1]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const html = process.argv[2], N = +(process.argv[3] || 60), SEED = +(process.argv[4] || 1);
const ANOM = process.env.ANOM || '';   // 쉼표: pullback,stale,skip3,late6,reverse
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ORDER = ['검단호수공원','신검단중앙','아라','계양','귤현','박촌','임학','계산','경인교대입구','작전','갈산','부평구청','부평시장','부평','동수','부평삼거리','간석오거리','인천시청','예술회관','인천터미널','문학경기장','선학','신연수','원인재','동춘','동막','캠퍼스타운','테크노파크','지식정보단지','인천대입구','센트럴파크','국제업무지구','송도달빛축제공원'];
const LINES = [['1호선',2,3.5],['2호선',1.5,2.5],['3호선',2,3],['4호선',2,3],['5호선',1.5,3],['6호선',1.5,3],['7호선',2,3.5],['8호선',1.5,3],['9호선',1.5,3],['9호선(급행)',3,9],['신분당선',2,5],['수인분당선',2,4],['경의중앙선',2,5],['공항철도',2,4],['공항철도(직통)',6,15],['김포골드라인',1.5,2.5],['인천2호선',2,3],['경춘선',2.5,5],['GTX-A',5,12],['에버라인',2,3.5],['의정부경전철',1.5,3]];
const KINDS = [['gsub'], ['walk','gsub'], ['walk','gsub','xfer','gsub'], ['bus','xfer','gsub'], ['walk','gsub','xfer','gsub','xfer','gsub'], ['walk','gsub','walk','bus'], ['walk','bus','xfer','gsub','xfer','bus'], ['isub'], ['walk', 'isub'], ['bus', 'xfer', 'isub'], ['walk', 'isub', 'xfer', 'sub'], ['walk', 'isub', 'walk', 'bus'], ['walk', 'isub'], ['walk', 'isub', 'xfer', 'isub'], ['walk', 'bus', 'xfer', 'isub', 'xfer', 'bus']];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  let page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); const logs=[]; if(process.env.ONLY) page.on('console', m=>{ const t=m.text(); if(/승차시각|기준|앵커|진행도|정확도/.test(t)) logs.push(t); });
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await page.clock.install({ time: new Date('2026-10-06T17:00:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(3000);
  const TT = await page.evaluate(() => { const L = _INCHEON_TT['인천1호선']; const o = {}; for (const k in L) o[k] = { '상': L[k]['평일상'], '하': L[k]['평일하'] }; return o; });
  // 방향 판정: ORDER 증가 방향에서 시각이 증가하는 키
  let fwdKey = null; { const a = TT['동막'], c = TT['캠퍼스타운']; const t0 = a['상'].find(x => x > 1050); const n0 = c['상'].find(x => x > t0); const n1 = c['하'].find(x => x > a['하'].find(x2 => x2 > 1050)); fwdKey = (n0 - t0 < 6) ? '상' : '하'; }
  const revKey = fwdKey === '상' ? '하' : '상';
  const R = rng(SEED); const pick = (a) => a[Math.floor(R() * a.length)]; const ri = (a, b2) => a + Math.floor(R() * (b2 - a + 1));
  const out = [];
  for (let sc = 0; sc < N; sc++) {
    const kind = pick(KINDS); const pr = R(); const startMin = pr < 0.5 ? ri(17 * 60 + 5, 19 * 60) : pr < 0.75 ? ri(22 * 60 + 40, 23 * 60 + 55) : ri(5 * 60 + 10, 7 * 60);
    const nodes = []; let t = startMin, legId = 0, firstSub = true;
    nodes.push({ name: '출발', isOrigin: true, plan: t });
    const legs = []; const dirSign = R() < 0.5 ? 1 : -1; const dk = dirSign === 1 ? fwdKey : revKey;
    kind.forEach((k) => {
      if (k === 'walk') { t += ri(3, 8); nodes.push({ name: '도보', isWalk: true, plan: t }); }
      else if (k === 'xfer') { t += ri(3, 6); nodes.push({ name: '환승', isWalk: true, plan: t }); }
      else if (k === 'isub') {
        legId++; const n = ri(4, 14); const start = nodes.length;
        const lo = dirSign === 1 ? 0 : n - 1, hi = dirSign === 1 ? ORDER.length - n : ORDER.length - 1;
        let s0 = dirSign === 1 ? ri(0, ORDER.length - n) : ri(n - 1, ORDER.length - 1);
        const need = (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(1, 5) : 0; const arriveAtStn = t + need;
        // 실제 열차: 승차역에서 arriveAtStn 이후 첫 열차(이 분 + 대기)
        const names = []; for (let i = 0; i < n; i++) names.push(ORDER[s0 + dirSign * i]);
        const tt = []; const first = TT[names[0]][dk].find(x => x >= arriveAtStn + (R() < 0.3 ? 0 : 0)); if (first == null) { legId--; return; }
        tt.push(first); for (let i = 1; i < n; i++) { const arr = TT[names[i]][dk]; const nx = arr.find(x => x > tt[i - 1] && x <= tt[i - 1] + 6); tt.push(nx != null ? nx : tt[i - 1] + 2.5); }
        const bias = pick([0, 0, 0, -1, 1, 2]);       // 엔진 표시가 시간표와 어긋나는 정도
        for (let i = 0; i < n; i++) nodes.push({ name: names[i], isSub: true, line: '인천1호선', plan: tt[i] + bias, ttMin: tt[i], leg: legId, real: true });
        t = tt[n - 1] + bias - 2; firstSub = false; legs.push({ start, end: nodes.length - 1, id: legId, type: 'sub' });
      } else if (k === 'gsub') {
        legId++; const L = pick(LINES); const n = ri(4, 14); const start = nodes.length;
        t += (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(2, 6) : 0;
        for (let i = 0; i < n; i++) { nodes.push({ name: L[0] + '_' + legId + '_' + i, isSub: true, line: L[0], plan: t, leg: legId }); t += L[1] + R() * (L[2] - L[1]); }
        t -= 2; legs.push({ start, end: nodes.length - 1, id: legId, type: 'sub' });
      } else if (k === 'sub') {
        legId++; const n = ri(4, 10); const start = nodes.length; t += ri(2, 5);
        for (let i = 0; i < n; i++) { nodes.push({ name: '역' + legId + '_' + i, isSub: true, line: '7호선', plan: t, leg: legId }); t += ri(2, 3) + (R() < 0.3 ? 0.5 : 0); }
        t -= 2; legs.push({ start, end: nodes.length - 1, id: legId, type: 'sub' });
      } else if (k === 'bus') {
        legId++; const n = ri(4, 10); const start = nodes.length;
        t += (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(2, 7) : ri(1, 3);
        for (let i = 0; i < n; i++) { nodes.push({ name: '정류장' + legId + '_' + i, isBus: true, line: '버스 ' + legId, plan: t, leg: legId }); t += ri(1, 3); }
        t -= 1; legs.push({ start, end: nodes.length - 1, id: legId, type: 'bus' });
      }
    });
    if (!legs.length) { sc--; continue; }
    // 진실: 시간표 시각 + 지연(분)
    const truth = {};
    legs.forEach((lg) => {
      const late0 = pick([0, 0, 0, 0.5, 1, 1, 2, 3]); let cum = late0;
      for (let i = lg.start; i <= lg.end; i++) {
        if (i > lg.start) cum += (R() - 0.35) * 0.4 + (R() < 0.2 ? 0.4 : 0);
        const base = nodes[i].real ? nodes[i].ttMin : nodes[i].plan;
        truth[i] = (base + Math.max(0, cum)) * 60 + (nodes[i].real ? ri(0, 59) * 0 : 0);
      }
    });
    legs.forEach((lg, li) => { if (li > 0) { const prevEnd = truth[legs[li - 1].end]; if (truth[lg.start] < prevEnd + 120) { const d = prevEnd + 120 - truth[lg.start]; for (let i = lg.start; i <= lg.end; i++) truth[i] += d; } } });
    const destIdx = nodes.length - 1; const destTruth = truth[destIdx];
    const events = []; const trIdx = []; for (let i = 0; i < nodes.length; i++) if (truth[i] != null) trIdx.push(i);
    const A = ANOM.split(',');
    legs.forEach((lg, li) => {
      const lateConfirm = (A.includes('late6') ? R() < 0.3 : R() < 0.12) ? ri(180, 360) : ri(25, 110);
      events.push({ at: truth[lg.start] + lateConfirm, type: 'board', idx: lg.start });
      let lastAt = truth[lg.start] + lateConfirm;
      for (let i = lg.start + 1; i <= lg.end; i++) {
        const skipP = A.includes('skip3') ? 0.25 : 0.08;
        if (R() < skipP && i < lg.end) continue;
        if (R() < 0.5) { const le = truth[i] - ri(60, 170); if (le > lastAt + 5) { events.push({ at: le, type: 'adopt', idx: i, lead: true }); lastAt = le; } }
        const a = Math.max(lastAt + 5, truth[i] + ri(5, 70)); events.push({ at: a, type: 'adopt', idx: i }); lastAt = a;
        if (A.includes('pullback') && R() < 0.1 && i > lg.start + 1) events.push({ at: a + ri(10, 40), type: 'pull', idx: i - 1 });   // 위치가 한 칸 되돌아갔다 다시 오는 경우
      }
    });
    events.sort((x, y) => x.at - y.at);
    if (process.env.ONLY && +process.env.ONLY !== sc) continue;
    if (!process.env.NORELOAD) { await ctx.close(); ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' }); page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message)); if (process.env.ONLY) page.on('console', m => { const t = m.text(); if (/승차시각|기준|앵커|진행도|정확도/.test(t)) logs.push(t); }); await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); }); await page.clock.install({ time: new Date('2026-10-06T17:00:00+09:00') }); await page.goto('file://' + html); await page.clock.runFor(2500); }
    await page.clock.setSystemTime(new Date(new Date('2026-10-06T00:00:00+09:00').getTime() + (startMin - 3) * 60000));
    await page.evaluate(([nodes, LF, MODE]) => {
      const N = nodes.map((n, i) => ({ name: n.name, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: !!n.isSub, isBus: !!n.isBus, isWalk: !!n.isWalk, isOrigin: !!n.isOrigin, lineName: n.line || '', _schedMin: n.plan, el: null,
        arrTime: ('0' + Math.floor(Math.round(n.plan) / 60)).slice(-2) + ':' + ('0' + (Math.round(n.plan) % 60)).slice(-2) }));
      _transitNodeData = N; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false; window._markerPos = null; window._pfBest = null; window.__leadIdx = {}; window.__LEADFIX = LF; if (window.__NOSNAP) window._htlSnapBoardArr = function () {}; if (MODE) window._ANCHOR_MODE = MODE; window._rideEvReset && window._rideEvReset('fuzz2');
    }, [nodes, +(process.env.LEADFIX||0), process.env.MODE || '']);
    if (process.env.NOSNAP) await page.evaluate(() => { window._htlSnapBoardArr = function () {}; });
    const mid = new Date('2026-10-06T00:00:00+09:00').getTime(); const rec = [];
    for (const ev of events) {
      await page.clock.setSystemTime(new Date(mid + ev.at * 1000));
      const r = await page.evaluate(([ev, destIdx]) => {
        try {
          if (ev.type === 'board') { window._htlBoarded = true; window._gpsMaxIdx = Math.max(window._gpsMaxIdx, ev.idx); window._gpsConfirmIdx = window._gpsMaxIdx; window._nodePassMs[ev.idx] = window._nodePassMs[ev.idx] == null ? Date.now() : window._nodePassMs[ev.idx]; _recalcArrivalsFrom(ev.idx); }
          else if (ev.type === 'adopt') { const pg = window._gpsMaxIdx; window._gpsMaxIdx = Math.max(pg, ev.idx); window._gpsConfirmIdx = Math.max(window._gpsConfirmIdx, ev.idx); if (ev.idx > pg || window._nodePassMs[ev.idx] == null) window._nodePassMs[ev.idx] = Date.now(); else if (window.__LEADFIX && !ev.lead && window.__leadIdx[ev.idx]) { window._nodePassMs[ev.idx] = Date.now() - (window.__LEADFIX === 2 ? 35000 : 0); delete window.__leadIdx[ev.idx]; } if (ev.lead) window.__leadIdx[ev.idx] = true; _recalcArrivalsFrom(ev.idx); }
          else if (ev.type === 'pull') { try { _recalcArrivalsFrom(window._gpsMaxIdx); } catch (e) { throw e; } }
          const Nn = _transitNodeData; const p = Nn[destIdx].arrTime.split(':'); const eta = (+p[0]) * 60 + (+p[1]);
          let here = -1; try { here = _pipHereIdx(); } catch (e) {}
          return { eta: eta, here: here, tl: Nn.map(n => n.arrTime), sm: Nn.map(n => n._schedMin == null ? null : +n._schedMin.toFixed(1)), ps: Nn.map((n, i) => { const v = (window._nodePassMs || {})[i]; return v == null ? null : +(((v - new Date('2026-10-06T00:00:00+09:00').getTime()) / 60000).toFixed(1)); }) };
        } catch (e) { return { err: String(e.message) }; }
      }, [ev, destIdx]);
      if (r.err) { rec.push({ err: r.err }); continue; }
      let ti = -1; for (const i of trIdx) if (truth[i] <= ev.at) ti = i;
      if(process.env.ONLY) logs.push('--- ev '+ev.type+' idx '+ev.idx+' at '+Math.floor(ev.at/3600)+':'+Math.floor(ev.at%3600/60)+':'+Math.floor(ev.at%60));
      rec.push({ at: ev.at, type: ev.type, lead: !!ev.lead, idx: ev.idx, etaErr: (() => { let d = (r.eta - destTruth / 60) % 1440; if (d > 720) d -= 1440; if (d < -720) d += 1440; return d; })(), sm: r.sm, ps: r.ps, here: r.here, trueIdx: ti, tl: r.tl });
    }
    out.push({ sc, kind: kind.join('>'), dir: dk, truthBoard: truth[legs[0].start] / 60, firstTransit: legs[0].start, startMin, destPlan: nodes[destIdx].plan, destTruth: destTruth / 60, nodes: nodes.length, names: nodes.map(n => n.name), truthAll: nodes.map((n, i) => truth[i] != null ? truth[i] / 60 : null), rec });
  }
  console.log(JSON.stringify({ errs: errs, out: out, logs: logs }));
  await b.close();
})();
