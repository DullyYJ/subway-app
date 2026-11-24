// 폰 안의 승차 엔진(RideLocal) 검증 — 2026-10-22
//   YJ 핵심 규칙: "탑승이 확정된 이후에는 외부 서버 요청을 일체 발생시키지 않는다."
//   ① 서버 엔진(ride-standby · ride-eta · ride-track · posfusion)을 옮긴 자바가 서버 JS 가 낸 답(녹화본)과 같은 값을 낸다
//   ② 순수 자바 — 안드로이드·네트워크·시계를 쓰지 않는다
//   ③ RideService 의 5초 걸음은 서버를 부르지 않는다(시각표가 필요한 [탑승] 한 번만 예외) · 추천 문구는 탑승 전에 받아 둔 글만 쓴다
// 실행: node test/ride_local.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 8).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', 'shell', n);
const CORE = ['ScreenCore', 'ShellCore', 'HomeSearchCore', 'HomeCore', 'WalkCore', 'BoardCore', 'ChatCore', 'FoodCore', 'MapCore', 'FavCore', 'HcardsCore', 'RideCore', 'RulesCore', 'LegacyCore', 'CmCore', 'GwCore', 'DevCore', 'ErrCore', 'ShareCore', 'OvCore', 'RsCore', 'ActRowCore', 'TileMapCore', 'NetPost', 'PerfLog', 'Latest', 'Debounce', 'Swr', 'RunnerCore', 'SceneModel'];
const RIDE = ['RideJs', 'RideTrackJ', 'RideEtaJ', 'RideStandbyJ', 'RidePosFusionJ', 'RideLocal'];
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rlocal-'));
  await t('폰 안 엔진이 서버 엔진의 녹화된 답(eta · standby · track)과 모두 같다', async () => {
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out].concat(CORE.concat(RIDE).map(c => N(c + '.java')), [path.join(__dirname, 'java', 'RideLocalJvmTest.java')]), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    // s349: 말뭉치의 standby 줄은 '입력'만 쓰고, 기대 답은 지금 서버 엔진(engine/ride-standby.js)으로 그때그때 다시 계산한다 — 엔진을 고칠 때마다 7MB 녹화본을 다시 올리지 않아도 '자바 = 서버 JS' 가 같은 입력으로 비교된다(eta · track 줄은 녹화 그대로).
    const { rideStandby } = require(path.join(ROOT, 'engine', 'ride-standby.js')), { rideEta } = require(path.join(ROOT, 'engine', 'ride-eta.js')), corpusNow = path.join(out, 'ride_corpus_now.jsonl');
    fs.writeFileSync(corpusNow, fs.readFileSync(path.join(__dirname, 'fixtures', 'ride_corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(ln => { const o = JSON.parse(ln); if (o.fn === 'eta') { o.out = JSON.parse(JSON.stringify(rideEta(JSON.parse(JSON.stringify(o.in))))); return JSON.stringify(o); }      /* s379: eta 줄도 지금 서버 엔진으로 다시 계산(실시간 없는 노선 20초 당김 반영) */
 if (o.fn === 'track') { o.out = JSON.parse(JSON.stringify(require(path.join(ROOT, 'engine', 'ride-track.js')).rideTrack(JSON.parse(JSON.stringify(o.in))))); return JSON.stringify(o); }      /* s380: track 줄도 지금 서버 엔진으로(영점 반경·정확도 조정 반영) */
 if (o.fn !== 'standby') return ln; o.out = JSON.parse(JSON.stringify(rideStandby(JSON.parse(JSON.stringify(o.in))))); return JSON.stringify(o); }).join('\n') + '\n');
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', corpusNow], { env: ENV, encoding: 'utf8' });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1200) + (r.stderr || '').slice(-300));
    assert.ok(+/ALL OK \((\d+)\)/.exec(r.stdout)[1] >= 40, '녹화본이 너무 적다');
    assert.ok(!/FAIL/.test(r.stdout), r.stdout.slice(-800));
    console.log('        ' + r.stdout.split('\n').filter(l => /같음|RideLocal:|ALL OK/.test(l)).join(' / '));
    // s336: 새 규칙(승강장 신호 끊김 승차 · 거리 트리거+버스트 · 종착 고정)을 시뮬레이션(test/sim/multimodal_sim.js)에서 그때그때 서버 JS 로 녹화해 — 새 상태 키도 빠짐없이(-Dstrict=1) 비교한다
    const s336 = path.join(out, 'ride_corpus_s336.jsonl'), rc = spawnSync('node', [path.join(__dirname, 'sim', 'multimodal_sim.js'), '--record', s336], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(rc.status, 0, (rc.stderr || rc.stdout || '').slice(0, 800));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', s336], { env: ENV, encoding: 'utf8' });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-300));
    assert.ok(+/ALL OK \((\d+)\)/.exec(r.stdout)[1] >= 30, 's336 녹화본이 너무 적다');
    console.log('        s336: ' + r.stdout.split('\n').filter(l => /같음|ALL OK/.test(l)).join(' / '));
  });
  await t('s432 앞 역 승차: 폰 안 엔진(자바)이 서버 JS 와 같이 승차역을 옮기고 같은 상태를 낸다', async () => {
    const SK = require(path.join(__dirname, 'helpers', 'skip_ahead_scenario.js')), { rideStandby } = require(path.join(ROOT, 'engine', 'ride-standby.js')), lines = [];
    const run = SK.run(rideStandby, { rec: (req, o) => lines.push(JSON.stringify({ fn: 'standby', in: JSON.parse(JSON.stringify(req)), out: JSON.parse(JSON.stringify(o)) })) });
    assert.ok(run.st.eta.skipBd && run.st.eta.skipBd.to === 5, '서버 JS 가 먼저 승차역을 옮겨야 한다');
    const f = path.join(out, 'ride_corpus_s432.jsonl'); fs.writeFileSync(f, lines.join('\n') + '\n');
    const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', f], { env: ENV, encoding: 'utf8' });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-300));
    assert.ok(+/ALL OK \((\d+)\)/.exec(r.stdout)[1] >= 60, '걸음이 너무 적다');
  });
  await t('s456 환승 지하철 시각표 · 지난 역 잠금 · 아직 안 닿음 이어가기: 폰 안 엔진(자바)이 서버 JS 와 걸음마다 같은 답 · 같은 상태를 낸다', async () => {
    const SC = require(path.join(__dirname, 'helpers', 'xfer_tt_scenario.js')), SB = require(path.join(ROOT, 'engine', 'ride-standby.js')), { rideEta } = require(path.join(ROOT, 'engine', 'ride-eta.js')), { rideTrack } = require(path.join(ROOT, 'engine', 'ride-track.js'));
    const f = path.join(out, 'ride_corpus_s456.jsonl'), fd = fs.openSync(f, 'w'), J = (x) => JSON.parse(JSON.stringify(x));
    let n = 0, sawTt = false, sawFz = false, sawNy = false, sawXf = false;
    const rec = (req, o) => { fs.writeSync(fd, JSON.stringify({ fn: 'standby', in: req, out: J(o) }) + '\n'); n++; const st = o.state; if (st.eta.live && st.eta.live.some(q => q.tt === 1)) sawTt = true; if (st.fz && Object.keys(st.fz.m).length > 3) sawFz = true; if (st.notYet && Object.keys(st.notYet).length) sawNy = true; if (st.eta.prevXfer) sawXf = true; };
    // 실기기 화면(991 버스 → 아라 06:18)을 위치 받는 방식 · 버스 지연 · 열차 지연 · [탑승] 누름을 바꿔 가며 처음부터 끝까지
    for (const c of [{ mode: 'none' }, { mode: 'stale', press: '17:30' }, { mode: 'ground', depLate: 120 }, { mode: 'live', depLate: 120 }, { mode: 'none', busLate: 480, tt: true, dep: 28, end: 34 }, { mode: 'none', busLate: 480, dep: 28, end: 34 },
      { mode: 'none', busLate: 400, tt: true, dep: 28, end: 34 }, { mode: 'live', busLate: 600, tt: true, dep: 28, end: 36 }, { mode: 'none', busLate: 0 }, { mode: 'ground', press: '18:10' }, { mode: 'stale', staleSec: 600, end: 30 }, { mode: 'stale', staleSec: 600, staleAcc: 25, press: '18:40', end: 30 }]) SC.run(SB.rideStandby, Object.assign({ rec, attachPress: SB.rsAttachPressTT }, c));
    const U = SC.unitInputs();
    for (const inp of U.eta) { fs.writeSync(fd, JSON.stringify({ fn: 'eta', in: inp, out: J(rideEta(J(inp))) }) + '\n'); n++; }
    for (const inp of U.track) { fs.writeSync(fd, JSON.stringify({ fn: 'track', in: inp, out: J(rideTrack(J(inp))) }) + '\n'); n++; }
    fs.closeSync(fd);
    assert.ok(sawTt && sawFz && sawNy && sawXf, '새 규칙의 상태(시각표 답 표시 · 잠금 · 아직 안 닿음 · 환승 판단 기억)가 녹화에 모두 들어 있어야 한다 ' + [sawTt, sawFz, sawNy, sawXf]);
    const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', f], { env: ENV, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-300));
    assert.strictEqual(+/ALL OK \((\d+)\)/.exec(r.stdout)[1], n, '모든 줄을 견줬다');
    assert.ok(n >= 3000 && U.eta.length >= 130, '걸음 ' + n + ' · 낱개 ' + U.eta.length);
    console.log('        s456: ' + r.stdout.split('\n').filter(l => /같음|ALL OK/.test(l)).join(' / '));
    try { fs.unlinkSync(f); } catch (e) { }
  });
  await t('s460 귤현(인천1호선 늦은 열차 · 아직 안 닿음 400m 안 · 앵커 뒤 역 · 영점 반경 안 이어가기): 폰 안 엔진(자바)이 서버 JS 와 걸음마다 같은 답 · 같은 상태를 낸다', async () => {
    const GY = require(path.join(__dirname, 'helpers', 'gyul_scenario.js')), SB = require(path.join(ROOT, 'engine', 'ride-standby.js')), { rideEta } = require(path.join(ROOT, 'engine', 'ride-eta.js')), { rideTrack } = require(path.join(ROOT, 'engine', 'ride-track.js'));
    const f = path.join(out, 'ride_corpus_s460.jsonl'), fd = fs.openSync(f, 'w'), J = (x) => JSON.parse(JSON.stringify(x));
    let n = 0, sawNy = false;
    const rec = (req, o) => { fs.writeSync(fd, JSON.stringify({ fn: 'standby', in: req, out: J(o) }) + '\n'); n++; if (o.state.notYet && Object.keys(o.state.notYet).length) sawNy = true; };
    for (const mode of ['live', 'ground', 'none']) for (const delaySec of [0, 60, 120, 180, 240]) GY.run(SB.rideStandby, { mode, delaySec, end: 33, rec });
    // 낱개: 앵커가 임학인데 귤현이 아직 안 닿음 · 400m 안 판정 경계(영점 반경 150m · 달려 올 시간 · ny 이어가기 · 15초 앞)
    const st = GY.mkState(), now = GY.at(18, 23, 20);
    for (const ny of [[4], [5], [4, 5], [3], [], [6]]) for (const dm of [0, 20]) { const inp = { nodes: st.eta.nodes, passes: [{ idx: 2, ms: GY.at(18, 19, 0), src: 'gps' }], boarded: true, nowMs: now + dm * 1000, tzOffsetMin: 540, timetableFirst: true, notYet: ny }; fs.writeSync(fd, JSON.stringify({ fn: 'eta', in: inp, out: J(rideEta(J(inp))) }) + '\n'); n++; }
    const KX = 111320 * Math.cos(37.5 * Math.PI / 180), NOW = GY.at(18, 23, 0);
    for (const arrOff of [-200, -160, -60, -20, -5, 10, 30]) for (const x of [1900, 2600, 2800, 2860, 2900, 3200]) for (const ny of [false, true]) {
      const inp = { nowMs: NOW, trail: [[NOW - 10000, 37.5, 126.7 + x / KX, 20]], plan: { pts: [], boarded: true, stops: [{ i: 1, lat: 37.5, lng: 126.7, arrMs: NOW - 200000 }, { i: 2, lat: 37.5, lng: 126.7 + 3000 / KX, arrMs: NOW + arrOff * 1000, pass: true, ny: ny || undefined }] }, want: { zero: true } };
      fs.writeSync(fd, JSON.stringify({ fn: 'track', in: inp, out: J(rideTrack(J(inp))) }) + '\n'); n++;
    }
    fs.closeSync(fd);
    assert.ok(sawNy, '아직 안 닿음 상태가 녹화에 있어야 한다');
    const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', f], { env: ENV, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1800) + (r.stderr || '').slice(-300));
    assert.strictEqual(+/ALL OK \((\d+)\)/.exec(r.stdout)[1], n, '모든 줄을 견줬다');
    assert.ok(n >= 2500, '걸음 ' + n);
    console.log('        s460: ' + r.stdout.split('\n').filter(l => /같음|ALL OK/.test(l)).join(' / '));
    try { fs.unlinkSync(f); } catch (e) { }
  });
  await t('s475 귤현 · 계양 같은 분(지난 역 잠금이 늦은데 뒤 역은 시각표 그대로): 잠근 역 뒤를 앞 역 + 예정 간격보다 이르지 않게 — 폰 안 엔진(자바)이 서버 JS 와 같은 답을 낸다', async () => {
    const { rideEta } = require(path.join(ROOT, 'engine', 'ride-eta.js')), J = (x) => JSON.parse(JSON.stringify(x));
    const f = path.join(out, 'ride_corpus_s475.jsonl'), fd = fs.openSync(f, 'w');
    const DAY = Date.parse('2026-11-24T00:00:00+09:00'), at = (h, m, sx) => DAY + ((h * 60 + m) * 60 + (sx || 0)) * 1000;
    const nodes = [{ name: '집', isOrigin: true }, { name: '선학', isSub: true, lineName: '인천1호선', planMin: 1087 }, { name: '임학', isSub: true, lineName: '인천1호선', planMin: 1095 }, { name: '박촌', isSub: true, lineName: '인천1호선', planMin: 1097 },
      { name: '귤현', isSub: true, lineName: '인천1호선', planMin: 1100 }, { name: '계양', isSub: true, lineName: '인천1호선', planMin: 1102 }, { name: '아라', isSub: true, lineName: '인천1호선', planMin: 1107 }];
    let n = 0, pushed = 0;
    for (const fz of [{ 2: at(18, 18, 40), 3: at(18, 20, 45), 4: at(18, 22, 10) }, { 2: at(18, 18, 40), 3: at(18, 20, 45) }, { 4: at(18, 20, 40) }, {}, { 2: at(18, 15, 30), 3: at(18, 17, 30), 4: at(18, 20, 30) }])
      for (const ps of [[{ idx: 1, ms: at(18, 7, 20), src: 'board' }], [{ idx: 1, ms: at(18, 7, 20), src: 'board' }, { idx: 5, ms: at(18, 24, 30), src: 'gps' }]])
        for (const now of [at(18, 22, 40), at(18, 23, 0), at(18, 25, 0)]) {
          const inp = { nodes, nowMs: now, tzOffsetMin: 540, boarded: true, timetableFirst: true, passes: ps, frozen: fz }, o = J(rideEta(J(inp)));
          if ((o.notes || []).some((m) => m.indexOf('잠근 역 뒤') >= 0)) pushed++;
          fs.writeSync(fd, JSON.stringify({ fn: 'eta', in: inp, out: o }) + '\n'); n++;
        }
    fs.closeSync(fd);
    const g = rideEta({ nodes, nowMs: at(18, 23, 0), tzOffsetMin: 540, boarded: true, timetableFirst: true, passes: [{ idx: 1, ms: at(18, 7, 20), src: 'board' }], frozen: { 2: at(18, 18, 40), 3: at(18, 20, 45), 4: at(18, 22, 10) } });
    assert.ok(g.arr[4] === '18:22' && g.arr[5] !== g.arr[4] && g.etaMs[5] - g.etaMs[4] >= 110000, '귤현 ' + g.arr[4] + ' 계양 ' + g.arr[5] + ' ' + g.notes.join(' | '));
    assert.ok(pushed > 0, '새 규칙이 녹화에 들어 있어야 한다');
    const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', f], { env: ENV, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-300));
    assert.strictEqual(+/ALL OK \((\d+)\)/.exec(r.stdout)[1], n, '모든 줄을 견줬다');
    try { fs.unlinkSync(f); } catch (e) { }
  });
  await t('s471~s474 건너뜀 방지(U자 · 환승 대기 xFree) · 이른 시각표 버림 · 버스→버스 환승(판교 · 동탄) · 지하철→버스 환승(의정부→홍대입구): 폰 안 엔진(자바)이 서버 JS 와 걸음마다 같은 답 · 같은 상태를 낸다', async () => {
    const BX = require(path.join(__dirname, 'helpers', 'bus_xfer_scenario.js')), SB = require(path.join(ROOT, 'engine', 'ride-standby.js'));
    const f = path.join(out, 'ride_corpus_s473.jsonl'), fd = fs.openSync(f, 'w'), J = (x) => JSON.parse(JSON.stringify(x));
    let n = 0; const saw = {};
    const rec = (req, o) => { fs.writeSync(fd, JSON.stringify({ fn: 'standby', in: req, out: J(o) }) + '\n'); n++; (o.notes || []).forEach(m => { for (const k of ['재동기', '환승 승차역', '계획 승차보다', '영점']) if (m.indexOf(k) >= 0) saw[k] = true; }); if (o.state.zp) saw.zp = true; if (o.state.xfNote != null) saw.xfNote = true; };
    const tunnel = (ft, p, STOPS) => Math.min.apply(null, STOPS.map(s => BX.hav(p[0], p[1], s.lat, s.lng))) <= 350;
    const flaky = (ft) => (Math.floor(ft / 3000) % 5) < 2;
    const TR = BX.transfer(), PL = TR.stops.slice().sort((a, b) => a.i - b.i).map(x => x.arrMs);
    for (const ans of [null, (b) => ({ ms: b.fromMs + 30000, src: 'table' }), () => ({ ms: PL[4] - 60000, src: 'table' }), () => ({ ms: PL[4] + 180000, src: 'table' }), () => ({ ms: PL[4] - 20000, src: 'realtime' })])
      for (const gps of [undefined, tunnel]) BX.run(SB, TR, { answer: ans || undefined, gps, rec });
    const UL = BX.uloop();
    for (const gps of [undefined, flaky]) BX.run(SB, UL, { gps, rec, answer: (b) => ({ ms: b.fromMs + 30000, src: 'table' }) });
    const PG = BX.run(SB, BX.fixture('pangyo'), { realMove: true, rec }), DT = BX.run(SB, BX.fixture('dongtan'), { realMove: true, rec });
    BX.run(SB, BX.fixture('dongtan'), { realMove: true, noise: 8, rec }); BX.run(SB, BX.fixture('pangyo'), { realMove: true, gps: flaky, rec });
    BX.run(SB, BX.fixture474(), { realMove: true, rec }); BX.run(SB, BX.fixture474(), { realMove: true, noise: 8, rec }); BX.run(SB, BX.fixture474(), { realMove: true, gps: tunnel, rec }); BX.run(SB, BX.fixture474(), { rec });
    for (const [D, W, o2] of [[30, 180, { realMove: true }], [95, 420, { realMove: true, noise: 8 }], [500, 700, { realMove: true, walkFirst: true, noise: 25 }], [900, 180, { realMove: true, walkFirst: true, noise: 8 }]]) { BX.run(SB, BX.subBus(D, W, false), Object.assign({ rec }, o2)); }
    BX.run(SB, BX.subBus(95, 420, true), { realMove: true, rec });      // s474: 지하철 → 버스 환승(역과 정류장 95m)에서 기다리는 사람
    fs.closeSync(fd);
    assert.ok(saw['재동기'] && saw['환승 승차역'] && saw['계획 승차보다'] && saw['영점'] && saw.zp && saw.xfNote, '새 규칙의 상태·기록이 녹화에 모두 들어 있어야 한다 ' + JSON.stringify(saw));
    // 서버 JS 가 먼저 제대로 가야 한다(판교: 환승 정류장에서 기다렸다 출발해도 도착 1정거장 전이 울림(시각은 첫 정류장 통과 기준 초) · 동탄: 붙은 정류장(52m)에서 기다려도 목적지 2정거장 전이 일찍 울리지 않음)
    assert.ok(PG.at('5_1') != null && PG.at('5_1') >= 1790 && PG.at('5_1') <= 1900, '판교 5_1 ' + PG.at('5_1'));
    assert.ok(DT.at('7_1') != null && DT.at('10_2') != null && DT.at('10_2') >= 3560 && DT.at('10_2') <= 3640, '동탄 7_1 ' + DT.at('7_1') + ' · 10_2 ' + DT.at('10_2'));
    const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', f], { env: ENV, encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1800) + (r.stderr || '').slice(-300));
    assert.strictEqual(+/ALL OK \((\d+)\)/.exec(r.stdout)[1], n, '모든 줄을 견줬다');
    assert.ok(n >= 3000, '걸음 ' + n);
    console.log('        s473: ' + r.stdout.split('\n').filter(l => /같음|ALL OK/.test(l)).join(' / '));
    try { fs.unlinkSync(f); } catch (e) { }
  });
  await t('계산 코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 자바)', async () => {
    for (const c of RIDE) {
      const src = fs.readFileSync(N(c + '.java'), 'utf8').replace(/System\.currentTimeMillis\(\)/g, '0');   // 서버 JS 의 'nowMs 없으면 Date.now()' 대비 줄만 허용(승차 엔진은 늘 nowMs 를 준다)
      assert.ok(!/import\s+android\.|HttpURLConnection|NetPost|System\.currentTimeMillis|SystemClock|new Random|java\.io\.File|java\.net\./.test(src), c + ' 는 순수 계산이어야 한다');
    }
  });
  await t('탑승 서비스: 5초 걸음은 폰 안에서 계산하고, 서버는 [탑승] 시각표 한 번만 부른다', async () => {
    const s = fs.readFileSync(N('RideService.java'), 'utf8');
    const posts = s.match(/NetPost\.post\([^;]*\);/g) || [];
    assert.strictEqual(posts.length, 3, '서버 호출은 시각표 한 번 + 승차 대기 중 실시간 다음 차(/board-live) + 추천 문구 미리 받기 한 번뿐이어야 한다: ' + posts.join(' | '));
    // 승차 대기 중 실시간 재보정(s196): 엔진이 ask 를 낼 때만(= 승차 대기 st.wait 중에만) 부른다 — 탑승이 확정되면 엔진이 묻지 않으므로 요청 0
    assert.ok(/s\.askBody\.length\(\) > 0\) fetchBoardLive\(s\.askBody\)/.test(s) && /NetPost\.post\(ShellCore\.BASE \+ "\/board-live"/.test(s), '/board-live 는 엔진의 ask 로만');
    assert.ok(!/fetchBoardLive\([^)]*\)[\s\S]{0,40}(RideLocal\.step)/.test(s), '걸음 계산과 섞이지 않는다');
    assert.ok(/RideLocal\.needsTable\(body\)[\s\S]{0,200}NetPost\.post\(ShellCore\.BASE \+ "\/ride-standby"/.test(s), '/ride-standby 는 needsTable 일 때만');
    assert.ok(/if \(resp == null\) resp = RideLocal\.step\(body\)/.test(s), '나머지는 로컬 엔진');
    const i = s.indexOf('private void fireReco');
    const fr = s.slice(i, s.indexOf('private void fireAlert'));
    assert.ok(i > 0 && !/NetPost/.test(fr) && /RecoNotify\.sendCached\(/.test(fr), '추천 알림은 받아 둔 문구로 띄운다(서버 요청 없음)');
    // s237: 받아 둔 글이 없거나 시간대가 달라진 때만(한 여정에 한 번뿐인 추천이 사라지지 않게) 바로 한 번 받는다
    assert.ok(/if \(ok \|\| recoLive\) return;[\s\S]*RecoNotify\.send\(app, body, core\)/.test(fr), '받아 둔 문구가 없을 때만 바로 받는다');
    assert.ok(/prefetchReco\(body, resp\)/.test(s) && /RideLocal\.prefetchBody/.test(s), '추천 문구는 탑승 전에 미리 받는다');
    const n = fs.readFileSync(N('RecoNotify.java'), 'utf8');
    assert.ok(/static boolean sendCached\(/.test(n), '받아 둔 글로 알림');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
