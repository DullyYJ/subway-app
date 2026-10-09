// 길동무 — 공공데이터포털(TAGO) 지하철 역별 시각표 수집기 (GitHub Actions 에서 TAGO_KEY 시크릿으로 실행)
//   · 대상: 역별 실제 시각표가 없는 노선(engine/next-train-data.js 의 NT_STNORDER 역 목록 기준)
//   · 1) 역 이름으로 역 ID 목록 조회 → 2) 노선 이름이 대상 노선과 맞는 후보마다 평일/토/일 × 상/하 시각표 조회
//   · 결과: out/stations.json(역 후보·노선 이름 전체), out/raw.json(후보별 시각표), out/report.json(요약)
//   ※ 키·원본 응답 전문은 로그에 찍지 않는다.
const fs = require('fs'), path = require('path');
const KEY = process.env.TAGO_KEY || '';
if (!KEY) { console.error('TAGO_KEY 없음'); process.exit(1); }
const BASE = 'https://apis.data.go.kr/1613000/SubwayInfo';
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const { NT_STNORDER } = require('../../engine/next-train-data.js');
const only = (process.env.LINES || '').split(',').map(s => s.trim()).filter(Boolean);
const COVERED = new Set(['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '인천1호선', '인천2호선', '김포골드라인']);
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
// 우리 노선명 → TAGO 노선 이름에 들어 있을 만한 말(공백 제거 뒤 부분일치)과 제외할 말
const ALIAS = {
  '신분당선': { any: ['신분당'] }, '경의중앙선': { any: ['경의', '중앙'] }, '수인분당선': { any: ['수인', '분당'], not: ['신분당'] },
  '경춘선': { any: ['경춘'] }, '경강선': { any: ['경강'] }, '서해선': { any: ['서해'] }, '우이신설선': { any: ['우이'] }, '신림선': { any: ['신림'] },
  'GTX-A': { any: ['GTX', 'gtx', 'A노선'] }, '공항철도': { any: ['공항'] }, '의정부선': { any: ['의정부'] }, '에버라인선': { any: ['에버', '용인'] },
  '부산1호선': { any: ['부산'], num: '1' }, '부산2호선': { any: ['부산'], num: '2' }, '부산3호선': { any: ['부산'], num: '3' }, '부산4호선': { any: ['부산'], num: '4' },
  '대구1호선': { any: ['대구'], num: '1' }, '대구2호선': { any: ['대구'], num: '2' }, '대구3호선': { any: ['대구'], num: '3' },
  '광주1호선': { any: ['광주'], num: '1' }, '대전1호선': { any: ['대전'], num: '1' },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0, fails = 0; const T0 = Date.now(); const BUDGET = (+process.env.BUDGET_MIN || 40) * 60000; const left = () => Date.now() - T0 < BUDGET;
let lastErr = ''; const errs = {}; setInterval(() => console.log('진행 calls', calls, 'fails', fails, '경과(분)', Math.round((Date.now() - T0) / 60000), lastErr), 60000).unref();
async function api(op, params) {
  if (!left()) return { items: [], total: 0, err: '시간 초과' };
  const qs = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const url = BASE + '/' + op + '?serviceKey=' + encodeURIComponent(KEY) + '&_type=json&' + qs;
  for (let a = 0; a < 3; a++) {
    calls++;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const t = await r.text();
      if (t.trim()[0] !== '{') throw new Error('비JSON ' + r.status + ' ' + t.slice(0, 60).replace(/serviceKey=[^&\s]*/g, 'serviceKey=***'));
      const j = JSON.parse(t); const h = j.response && j.response.header;
      if (!h || h.resultCode !== '00') { const c = h && h.resultCode; if (c === '03' || c === '00') return { items: [], total: 0 }; throw new Error('resultCode ' + c + ' ' + (h && h.resultMsg)); }
      const b = j.response.body || {}; let it = b.items && b.items.item; if (!it) it = []; if (!Array.isArray(it)) it = [it];
      return { items: it, total: +b.totalCount || it.length };
    } catch (e) { fails++; lastErr = String(e.message).slice(0, 60) + (e.cause ? ' / ' + String(e.cause.code || e.cause.message || e.cause).slice(0, 60) : ''); errs[lastErr] = (errs[lastErr] || 0) + 1; if (a === 2) { console.log('실패', op, JSON.stringify(params).slice(0, 100), String(e.message).slice(0, 120)); return { items: [], total: 0, err: String(e.message).slice(0, 120) }; } await sleep(1500 * (a + 1)); }
  }
}
async function pool(items, n, fn) { let i = 0; const out = new Array(items.length); await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
function routeMatches(line, routeName) {
  const a = ALIAS[line]; if (!a) return false; const r = String(routeName || '').replace(/\s+/g, '');
  if (a.not && a.not.some(x => r.includes(x))) return false;
  if (!a.any.some(x => r.includes(x))) return false;
  if (a.num) { const m = r.match(/(\d+)\s*호?선?/); if (!m || m[1] !== a.num) return false; }
  return true;
}
(async () => {
  const lines = Object.keys(NT_STNORDER).filter(l => !COVERED.has(l) && (!only.length || only.includes(l)));
  const names = {}; lines.forEach(l => NT_STNORDER[l].forEach(s => { (names[nz(s)] = names[nz(s)] || new Set()).add(l); }));
  const nameList = Object.keys(names);
  console.log('대상 노선', lines.length, '역 이름', nameList.length);
  // 1) 역 후보
  const stations = {};
  await pool(nameList, 6, async (nm) => {
    const r = await api('GetKwrdFndSubwaySttnList', { subwayStationName: nm, numOfRows: 50, pageNo: 1 });
    stations[nm] = r.items.map(x => ({ id: x.subwayStationId, nm: x.subwayStationName, route: x.subwayRouteName })).filter(x => nz(x.nm) === nm);
    if (r.err) stations[nm].err = r.err;
  });
  fs.writeFileSync(path.join(OUT, 'stations.json'), JSON.stringify(stations));
  // 2) 우리 노선과 맞는 후보 → 시각표
  const jobs = [];
  for (const nm of nameList) for (const c of stations[nm]) for (const l of names[nm]) if (routeMatches(l, c.route)) jobs.push({ line: l, nm, id: c.id, route: c.route });
  const seen = new Set(), uniq = jobs.filter(j => { const k = j.id; if (seen.has(k)) return false; seen.add(k); return true; });
  console.log('시각표 조회 대상 후보', uniq.length);
  const raw = {};
  await pool(uniq, 6, async (j) => {
    const rec = { line: j.line, nm: j.nm, route: j.route, tt: {} };
    for (const day of ['01', '02', '03']) for (const ud of ['U', 'D']) {
      let all = [], page = 1, total = 0;
      do {
        const r = await api('GetSubwaySttnAcctoSchdulList', { subwayStationId: j.id, dailyTypeCode: day, upDownTypeCode: ud, numOfRows: 300, pageNo: page });
        total = r.total; all = all.concat(r.items); if (r.err || !r.items.length) break; page++;
      } while (all.length < total && page < 6);
      rec.tt[day + ud] = all.map(x => [x.arrTime || '', x.depTime || '', x.endSubwayStationNm || '', x.endSubwayStationId || '']);
    }
    raw[j.id] = rec;
  });
  fs.writeFileSync(path.join(OUT, 'raw.json'), JSON.stringify(raw));
  // 요약
  const rep = { calls, fails, errs, lines: {}, routeNames: {}, unmatched: [] };
  for (const nm of nameList) for (const c of stations[nm]) rep.routeNames[c.route] = (rep.routeNames[c.route] || 0) + 1;
  for (const l of lines) {
    const have = Object.values(raw).filter(r => r.line === l); const cnt = have.filter(r => Object.values(r.tt).some(a => a.length)).length;
    rep.lines[l] = { stations: NT_STNORDER[l].length, candidates: have.length, withData: cnt };
    for (const s of NT_STNORDER[l]) if (!have.some(r => r.nm === nz(s) && Object.values(r.tt).some(a => a.length))) rep.unmatched.push(l + '|' + s);
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rep, null, 1));
  console.log(JSON.stringify(rep.lines));
  console.log('calls', calls, 'fails', fails);
})();
