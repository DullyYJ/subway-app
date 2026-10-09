// 종점 역의 '다음 열차' 시각 바로잡기 — 번들의 종점 역 기록에는 들어오는 열차의 '도착' 시각이 들어 있는 곳이 있다(예: 7호선 장암 평일 05:48 = 도착, 실제 출발 05:35).
//   서울 열린데이터광장 시간표의 '출발' 시각(LEFTTIME)으로 그 역·그 요일·그 방향 키만 바꾼다. 다른 역·다른 키는 건드리지 않는다.
//   바꾸는 조건(모두 만족): 서울 자료에서 출발 행이 한 방향뿐(= 종점) · 번들도 한 방향 키에만 시각이 있음 · ±2분 일치 90% 미만 · ±12분 일치 80% 이상(같은 열차가 몇 분 어긋난 것) · 편수 차이 8% 이내.
//   사용: node terminals.js <seoul_tt.json.gz> <번들.json> [출력.json]  — 출력 없으면 보고만. refresh.js 가 불러 쓴다(applyTerminals).
const fs = require('fs'), zlib = require('zlib');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const tm = s => { if (!s || s === '00:00:00') return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const dec = a => { let p = 0; return (a || []).map(x => p += x); };
const enc = a => { let p = 0; return a.map(x => { const d = x - p; p = x; return d; }); };
function match(A, B, tol) { A = [...A].sort((x, y) => x - y); B = [...B].sort((x, y) => x - y); let i = 0, j = 0, m = 0; while (i < A.length && j < B.length) { const d = A[i] - B[j]; if (Math.abs(d) <= tol) { m++; i++; j++; } else if (d < 0) i++; else j++; } return m; }
const DK = { '1': 'D', '3': 'W' };     // 서울 WEEK_TAG 1 평일 → D, 3 휴일(일) → W. (토요일 = 일요일 시간표라 따로 두지 않는다)
function applyTerminals(bundle, seoul, lines) {
  const R = bundle.data._REAL_TT, changes = [];
  for (const c in seoul.stations) {
    const st = seoul.stations[c], n = +String(st.line).replace(/\D/g, ''); if (lines && !lines.has(n)) continue;
    const ln = n + '호선', key = ln + '|' + nz(st.nm), rec = R[key]; if (!rec) continue;
    for (const w of ['1', '3']) {
      const dk = DK[w], bd = rec[dk]; if (!bd) continue;
      const dd = st.days[w] || {}; const deps = io => (dd[io] || []).map(r => tm(r[2])).filter(x => x != null && x > 0 || x === 0);
      const s = ['1', '2'].map(deps).filter(a => a.length >= 20);
      const bk = ['상', '하'].filter(k => bd[k] && bd[k].length >= 20);
      if (s.length !== 1 || bk.length !== 1) continue;                               // 종점이 아니면 건너뜀
      if (['상', '하'].some(k => !bk.includes(k) && bd[k] && bd[k].length > 3)) continue;
      const S = s[0], b = dec(bd[bk[0]]).map(x => x % 1440), S2 = S.map(x => x % 1440);
      if (Math.abs(S.length - b.length) > 0.08 * Math.max(S.length, b.length)) continue;
      const r2 = match(S2, b, 2) / Math.max(S2.length, b.length), r12 = match(S2, b, 12) / Math.max(S2.length, b.length);
      if (r2 >= 0.9 || r12 < 0.8) continue;
      const sorted = [...S].sort((x, y) => x - y).map(x => x < 180 ? x + 1440 : x);       // 번들 관례: 새벽 3시 전은 +24시간(자정 넘김)
      const old = bd[bk[0]]; bd[bk[0]] = enc(sorted.sort((x, y) => x - y));
      changes.push({ key, day: dk, dirKey: bk[0], n: sorted.length, before: Math.round(r2 * 100), within12: Math.round(r12 * 100), oldHead: dec(old).slice(0, 3), newHead: sorted.slice(0, 3) });
    }
  }
  return changes;
}
module.exports = { applyTerminals };
if (require.main === module) {
  const seoul = JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2]))), b = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const ch = applyTerminals(b, seoul, new Set([2, 3, 4, 5, 6, 7, 8]));
  ch.forEach(c => console.log(c.key, c.day, c.dirKey, c.n + '편', '±2일치', c.before + '% →', '(±12분 ' + c.within12 + '%)', '예전', c.oldHead.join(','), '새', c.newHead.join(',')));
  console.log('바뀐 기록', ch.length);
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(b));
}
