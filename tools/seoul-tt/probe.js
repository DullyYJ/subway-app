// 서울 열린데이터광장 「역코드로 지하철 열차 시간표 검색」(SearchSTNTimeTableByFRCodeService) 시험 호출.
//   키는 환경변수 SEOUL_TT_KEY — 결과·로그에 키가 나오지 않게 모두 가린다. 사용: node probe.js <출력폴더>
const fs = require('fs'), path = require('path');
const KEY = process.env.SEOUL_TT_KEY || ''; const OUT = process.argv[2] || 'out-seoul-tt'; fs.mkdirSync(OUT, { recursive: true });
if (!KEY) { console.error('SEOUL_TT_KEY 없음'); process.exit(1); }
const mask = s => String(s).split(KEY).join('<KEY>');
const res = { at: new Date().toISOString(), calls: [] };
async function call(code, week, inout, from = 1, to = 3, scheme = 'http', port = 8088) {
  const url = `${scheme}://openapi.seoul.go.kr:${port}/${KEY}/json/SearchSTNTimeTableByFRCodeService/${from}/${to}/${code}/${week}/${inout}/`;
  const t0 = Date.now(); let r = { code, week, inout, scheme };
  try {
    const x = await fetch(url, { signal: AbortSignal.timeout(20000) }); const txt = await x.text(); r.status = x.status; r.ms = Date.now() - t0;
    try { const j = JSON.parse(txt); const b = j.SearchSTNTimeTableByFRCodeService || j; r.result = b.RESULT || (j.RESULT) || null; r.total = b.list_total_count; r.rows = (b.row || []).map(o => ({ ...o })); if (!b.row) r.raw = mask(txt).slice(0, 300); }
    catch (e) { r.raw = mask(txt).slice(0, 300); }
  } catch (e) { r.err = mask(e && (e.cause && e.cause.code || e.message)).slice(0, 120); r.ms = Date.now() - t0; }
  res.calls.push(r); return r;
}
(async () => {
  // 1) 접속 가능 여부 — 기준 호출(2호선 시청 201, 일요일=3, 상행 1)
  let r = await call('201', '3', '1'); console.log('기준 호출(http):', r.status, r.err || '', r.result && JSON.stringify(r.result), 'rows', (r.rows || []).length);
  if (r.err || !r.rows || !r.rows.length) { const r2 = await call('201', '3', '1', 1, 3, 'https', 443); console.log('https:', r2.status, r2.err || '', r2.result && JSON.stringify(r2.result), 'rows', (r2.rows || []).length); }
  // 2) 2·7호선 역 코드(외부코드) 훑기 — 응답에서 역 이름·호선을 읽는다
  const codes = []; for (let i = 201; i <= 243; i++) codes.push(String(i)); for (let i = 700; i <= 761; i++) codes.push(String(i));
  const names = {};
  for (const c of codes) { const q = await call(c, '3', '1', 1, 1); const row = (q.rows || [])[0]; if (row) names[c] = { nm: row.STATION_NM, line: row.LINE_NUM, week: row.WEEK_TAG, inout: row.INOUT_TAG }; await new Promise(z => setTimeout(z, 120)); }
  res.names = names; console.log('역 코드 응답', Object.keys(names).length, '/', codes.length);
  // 3) 한 역의 일요일 전체 열차(상·하) 건수
  const first = Object.keys(names).find(c => c.startsWith('7')) || Object.keys(names)[0];
  if (first) { for (const io of ['1', '2']) { const q = await call(first, '3', io, 1, 1000); res['sample_' + first + '_' + io] = { total: q.total, n: (q.rows || []).length, head: (q.rows || []).slice(0, 3) }; console.log(first, 'inout', io, '건수', q.total, (q.rows || []).length); } }
  fs.writeFileSync(path.join(OUT, 'probe.json'), mask(JSON.stringify(res, null, 1)));
})().catch(e => { console.error('실패', mask(e.message)); process.exit(1); });
