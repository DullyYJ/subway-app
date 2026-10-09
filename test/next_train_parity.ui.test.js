// 지하철 '다음 열차' 계산을 앱(옛 코드)에서 엔진(engine/next-train.js)으로 옮긴 것이 결과까지 같은지 비교한다.
// 같은 시각표 데이터(test/fixtures/tt_bundle.json = gildongmu-tt 번들 + 앱에 들어 있던 _INCHEON_TT)를 양쪽에 넣고,
// 모든 노선의 인접 역쌍 × 시각 × 평일/토/일 에 대해 방향 판정·다음 열차·첫차/막차 안내(_metroNextTrainInfo)를 비교한다.
// 실행: node test/next_train_parity.ui.test.js [html 경로]   (옛 코드는 www/index.html 에 남아 있는 동안만 비교할 수 있다)
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const { ntCreate } = require('../engine/next-train.js');
const { NT_INCHEON_TT, NT_STNORDER } = require('../engine/next-train-data.js');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8'));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n').slice(0, 6).join('\n       ')); } };

const DAYS = { DAY: Date.UTC(2026, 9, 8, 0, 0) - 9 * 3600e3, SAT: Date.UTC(2026, 9, 10, 0, 0) - 9 * 3600e3, SUN: Date.UTC(2026, 9, 11, 0, 0) - 9 * 3600e3 };  // KST 자정
const NOWS = [0, 30, 200, 270, 300, 330, 360, 420, 480, 600, 780, 900, 1020, 1140, 1260, 1330, 1380, 1410, 1439];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:')) return r.continue(); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await p.goto('file://' + html); await p.waitForTimeout(2500);
  await p.evaluate(bd => { _ttApplyBundle(bd); }, bundle);
  // 엔진 데이터 파일이 앱에 들어 있던 값과 같은지도 확인
  const incheon = await p.evaluate(() => JSON.parse(JSON.stringify(_INCHEON_TT)));
  await t('엔진 내장 데이터(인천 시각표)가 앱 값과 같다', async () => { assert.deepStrictEqual(NT_INCHEON_TT, incheon); });
  const gimpoApp = await p.evaluate(() => Object.keys(_GIMPO_TT).length);
  const eng = ntCreate({ _REAL_TT: bundle.data._REAL_TT, _GIMPO_TT: bundle.data._GIMPO_TT, _INCHEON_TT: incheon, _BUILTIN_TT: bundle.data._BUILTIN_TT, LINE_SCHEDULE: bundle.data.LINE_SCHEDULE, _REAL_SEG: bundle.data._REAL_SEG, _TT_ORDER_HARD: bundle.data._TT_ORDER_HARD, STNORDER: NT_STNORDER });

  // 비교 대상 노선·역 목록: 시각표가 있는 역 전부(앱 쪽 노선 순서 기준) + 기점격자만 있는 노선
  const lineStations = await p.evaluate(() => {
    const out = {}; const lines = new Set();
    for (const k in _REAL_TT) lines.add(k.split('|')[0]);
    for (const k in _INCHEON_TT) lines.add(k);
    lines.add('김포골드라인');
    for (const k in _BUILTIN_TT) lines.add(k);
    for (const l of lines) out[l] = _ttOrderOf(l).slice();
    return out;
  });
  const cases = [];   // [line, from, to, stops3?]
  for (const [line, ord] of Object.entries(lineStations)) {
    for (let i = 0; i + 1 < ord.length; i++) {
      cases.push([line, [ord[i], ord[i + 1]]]);
      cases.push([line, [ord[i + 1], ord[i]]]);
      if (i + 3 < ord.length) cases.push([line, [ord[i], ord[i + 1], ord[i + 2], ord[i + 3]]]);
    }
  }
  console.log('  비교 역쌍/구간', cases.length, '× 시각', NOWS.length, '× 요일 3');

  for (const [dayCode, dayMs] of Object.entries(DAYS)) {
    const hol = dayCode !== 'DAY';
    const appRes = await p.evaluate(({ cases, NOWS, dayCode, hol }) => {
      window._isHolidayOrWeekend = () => hol;
      window.getDayCode = () => dayCode;
      const out = [];
      for (const [line, names] of cases) {
        const stops = names.map(n => ({ stationName: n }));
        const sg = { type: 1, name: line, stops };
        const dir = _ttSegDir(line, stops, hol);
        const row = { dir, dep: [], info: [] };
        for (const now of NOWS) {
          window._TT_GRID_CACHE = null;
          row.dep.push(_ttNextDepForSeg(sg, now));
          window.kstMinutesAdj = () => now;
          window._buildRouteBrief = () => ({ segments: [{ line, from: names[0], to: names[1] }] });
          row.info.push(_metroNextTrainInfo(7));
        }
        out.push(row);
      }
      return out;
    }, { cases, NOWS, dayCode, hol });
    await t(dayCode + ': 방향 판정·다음 열차·첫차/막차 안내가 옛 앱 계산과 같다(' + cases.length * NOWS.length + '건)', async () => {
      let bad = 0; const samples = []; const badLines = {};
      cases.forEach(([line, names], ci) => {
        const stops = names.map(n => ({ stationName: n }));
        const sg = { type: 1, name: line, stops };
        const A = appRes[ci];
        const dir = eng.segDir(line, stops, dayMs + 12 * 3600e3);
        if (dir !== A.dir) { bad++; badLines[line] = (badLines[line] || 0) + 1; if (samples.length < 6) samples.push('dir ' + line + ' ' + names.join('>') + ' 앱=' + A.dir + ' 엔진=' + dir); }
        NOWS.forEach((now, ni) => {
          const baseMs = dayMs + now * 60e3;
          const dep = eng.segNextDep(sg, baseMs);
          if (dep !== A.dep[ni]) { bad++; badLines[line] = (badLines[line] || 0) + 1; if (samples.length < 6) samples.push('dep ' + line + ' ' + names.join('>') + ' @' + now + ' 앱=' + A.dep[ni] + ' 엔진=' + dep); }
          const info = eng.metroInfo({ line, from: names[0], to: names[1], baseMs, mins: 7 });
          if (JSON.stringify(info) !== JSON.stringify(A.info[ni])) { bad++; badLines[line] = (badLines[line] || 0) + 1; if (samples.length < 6) samples.push('info ' + line + ' ' + names.slice(0, 2).join('>') + ' @' + now + ' 앱=' + JSON.stringify(A.info[ni]) + ' 엔진=' + JSON.stringify(info)); }
        });
      });
      assert.strictEqual(bad, 0, bad + "건 불일치 " + JSON.stringify(badLines) + "\n" + samples.join("\n"));
    });
  }
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs, []); });
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
