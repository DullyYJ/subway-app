// 서울교통공사 1~8호선 역별 열차 시간표(평일·토·일) 전부 받기 — 서울 열린데이터광장 SearchSTNTimeTableByFRCodeService.
//   사용: node collect.js <출력폴더> [코드시작 코드끝]   키: 환경변수 SEOUL_TT_KEY(출력·로그에 나오지 않게 가린다)
//   출력: seoul_tt.json.gz — { at, stations: { FR코드: { nm, line, cd, days: { '1'|'2'|'3': { '1'|'2': [[열차번호, 도착, 출발, 출발역코드, 도착역코드, 급행여부], …] } } } } }
//   WEEK_TAG 1 평일 · 2 토요일 · 3 휴일(일요일),  INOUT_TAG 1 상행·내선 · 2 하행·외선
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const KEY = process.env.SEOUL_TT_KEY || ''; if (!KEY) { console.error('SEOUL_TT_KEY 없음'); process.exit(1); }
const OUT = process.argv[2] || 'out-seoul-tt'; fs.mkdirSync(OUT, { recursive: true });
const LO = +(process.argv[3] || 100), HI = +(process.argv[4] || 899);
const mask = s => String(s).split(KEY).join('<KEY>');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(code, week, inout, from, to) {
  const url = `http://openapi.seoul.go.kr:8088/${KEY}/json/SearchSTNTimeTableByFRCodeService/${from}/${to}/${code}/${week}/${inout}/`;
  let last = '';
  for (let a = 0; a < 4; a++) {
    try {
      const x = await fetch(url, { signal: AbortSignal.timeout(25000) }); const j = await x.json(); const b = j.SearchSTNTimeTableByFRCodeService || j;
      const rc = (b.RESULT || j.RESULT || {}).CODE;
      if (rc === 'INFO-000') return { total: +b.list_total_count || 0, rows: b.row || [] };
      if (rc === 'INFO-200') return { total: 0, rows: [] };      // 그 코드·요일에 자료 없음
      last = rc + ' ' + ((b.RESULT || j.RESULT || {}).MESSAGE || '');
    } catch (e) { last = String(e && (e.cause && e.cause.code || e.message)); }
    await sleep(600 * (a + 1));
  }
  throw new Error(mask(last).slice(0, 120));
}
async function pool(items, n, fn) { let i = 0; const out = new Array(items.length); await Promise.all(Array.from({ length: n }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k], k); } })); return out; }
(async () => {
  const stations = {}, errors = [];
  const codes = []; for (let c = LO; c <= HI; c++) codes.push(String(c));
  await pool(codes, 6, async c => { try { const r = await call(c, '3', '1', 1, 1); const w = r.rows[0]; if (w) stations[c] = { nm: w.STATION_NM, line: w.LINE_NUM, cd: w.STATION_CD, days: {} }; } catch (e) { errors.push(c + ' 탐색: ' + e.message); } });
  console.log('역 코드', Object.keys(stations).length, '개 발견');
  const jobs = []; for (const c in stations) for (const w of ['1', '2', '3']) for (const io of ['1', '2']) jobs.push([c, w, io]);
  let done = 0;
  await pool(jobs, 6, async ([c, w, io]) => {
    try {
      let all = [], from = 1; for (;;) { const r = await call(c, w, io, from, from + 999); all = all.concat(r.rows); if (all.length >= r.total || r.rows.length < 1000) break; from += 1000; }
      ((stations[c].days[w] = stations[c].days[w] || {})[io]) = all.map(o => [o.TRAIN_NO, o.ARRIVETIME, o.LEFTTIME, o.ORIGINSTATION, o.DESTSTATION, o.EXPRESS_YN || '']);
    } catch (e) { errors.push(`${c}/${w}/${io}: ${e.message}`); }
    if (++done % 200 === 0) console.log('진행', done, '/', jobs.length);
  });
  const n = Object.values(stations).reduce((a, s) => a + Object.values(s.days).reduce((b, d) => b + Object.values(d).reduce((x, l) => x + l.length, 0), 0), 0);
  console.log('열차 행', n, '오류', errors.length); errors.slice(0, 10).forEach(e => console.log(' ', e));
  fs.writeFileSync(path.join(OUT, 'seoul_tt.json.gz'), zlib.gzipSync(mask(JSON.stringify({ at: new Date().toISOString(), errors: errors.slice(0, 50), stations }))));
  fs.writeFileSync(path.join(OUT, 'summary.txt'), mask(`stations ${Object.keys(stations).length} rows ${n} errors ${errors.length}\n` + errors.slice(0, 50).join('\n')));
  if (errors.length > jobs.length * 0.05) process.exit(1);
})().catch(e => { console.error('실패', mask(e.message)); process.exit(1); });
