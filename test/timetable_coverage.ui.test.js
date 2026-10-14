// 지도에 있는 모든 역 × 그 역을 지나는 모든 노선 = 시간표가 있어야 한다 (YJ 2026-10-14: "시간표는 무조건 다 넣어, 모르는 건 말이 안 돼")
//   앱의 진짜 역 목록·노선 판정(_metroLines)과 엔진에 들어 있는 시각표 묶음(NT_TT_EMBED)을 맞대어 본다 — 하나라도 비면 실패.
// 실행: node test/timetable_coverage.ui.test.js
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const W = require('./helpers/nt_load')();
const html = path.join(__dirname, '..', 'www', 'index.html');
const d = JSON.parse(W.NT_TT_EMBED).data;
const nt = W.ntCreate({ _REAL_TT: d._REAL_TT, _GIMPO_TT: d._GIMPO_TT, _INCHEON_TT: W.NT_INCHEON_TT, _BUILTIN_TT: d._BUILTIN_TT, LINE_SCHEDULE: d.LINE_SCHEDULE, _REAL_SEG: d._REAL_SEG, _TT_ORDER_HARD: d._TT_ORDER_HARD, STNORDER: W.NT_STNORDER });
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
  await page.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {} });
  await page.goto('file://' + html); await page.waitForTimeout(2000);
  const pairs = await page.evaluate(() => {
    _ensureMetroSvg(); const svg = document.querySelector('#svgContainer svg'); const out = [];
    const SKIP = ['호선', '경전철', '수도권', '도시철도', '한강버스', '지하철망', '노선도', '환승'];
    svg.querySelectorAll('g.lb').forEach(g => {
      const n = (g.getAttribute('data-n') || '').replace(/\s+/g, ''); if (!n || n.length < 2 || SKIP.some(k => n.indexOf(k) >= 0)) return;
      const ls = (_metroLines(n) || []).filter((x, i, a) => x && a.indexOf(x) === i); out.push([n, ls]);
    });
    return out;
  });
  await b.close();
  const base = new Date('2026-10-14T13:00:00+09:00').getTime();
  await t('지도의 역(600+)은 모두 노선이 판정된다', async () => { assert(pairs.length > 600, '역 ' + pairs.length); assert.deepStrictEqual(pairs.filter(p => !p[1].length).map(p => p[0]), []); });
  for (const day of ['DAY', 'SUN']) {
    await t('모든 (역, 노선) 쌍에 시간표가 있다 — ' + day, async () => {
      const miss = [], bad = []; let tot = 0;
      for (const [n, ls] of pairs) for (const l of ls) {
        tot++;
        const a = W.ntAnswer(nt, { op: 'timetable', line: l, from: n, baseMs: base, day });
        if (a.error || a.noData || !a.dirs.length) { miss.push(l + ' ' + n); continue; }
        for (const dir of a.dirs) {
          if (!(dir.times.length >= 1) || !(dir.first <= dir.last) || dir.times.some((x, i) => i && x < dir.times[i - 1])) bad.push(l + ' ' + n + ' ' + dir.dk + ' ' + dir.times.length);
        }
      }
      assert(tot > 800, '쌍 ' + tot);
      assert.deepStrictEqual(miss, [], '시간표 없는 (노선 역) ' + miss.length + '/' + tot + ': ' + miss.slice(0, 20).join(', '));
      assert.deepStrictEqual(bad, [], '이상한 시간표(비었거나 순서 틀림) ' + bad.length + ': ' + bad.slice(0, 10).join(', '));
    });
  }
  await t('같은 역을 다르게 부르는 곳: 7호선 총신대입구 = 이수', async () => {
    const a = W.ntAnswer(nt, { op: 'timetable', line: '7호선', from: '총신대입구', baseMs: base });
    assert(!a.noData && a.dirs.length === 2 && a.stn === '총신대입구', JSON.stringify(a).slice(0, 120));
  });
  console.log(`\ntimetable_coverage: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
