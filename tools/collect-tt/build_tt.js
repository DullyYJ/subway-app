// TAGO 수집 결과(raw.json 여러 개) → gildongmu-tt 번들 형식의 _REAL_TT 기록으로 변환해 기존 번들에 합친다.
// 사용: node tools/collect-tt/build_tt.js <기존번들.json> <출력번들.json> <raw1.json> [raw2.json ...]
//   · 기록: _REAL_TT["노선|역"] = { D:{상:[델타],하:[델타]}, W:{…}, S:{…(토요일 자료가 있을 때만)} }  (상=TAGO 'U', 하=TAGO 'D')
//   · 시각: 출발시각(없으면 도착시각)의 '분'(초는 버림). 03:00 이전은 전날 운행의 연장이라 +1440. 같은 시각 중복(TAGO 가 3번씩 줌)은 하나로.
//   · 평일=01, 휴일(W)=03(일요일·공휴일), 토요일(S)=02 — 02 가 비어 있으면 S 는 만들지 않는다(엔진은 W 로 대신한다).
const fs = require('fs');
const [,, inP, outP, ...raws] = process.argv;
const bundle = JSON.parse(fs.readFileSync(inP, 'utf8'));
const { NT_STNORDER } = require('../../engine/next-train-data.js');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
function minutes(row) {
  const pick = (row[1] && row[1] !== '0') ? row[1] : ((row[0] && row[0] !== '0') ? row[0] : null);
  if (!pick || !/^\d{6}$/.test(pick)) return null;
  let m = (+pick.slice(0, 2)) * 60 + (+pick.slice(2, 4));
  if (m < 180) m += 1440;
  return m;
}
function list(rows) {
  const s = Array.from(new Set(rows.map(minutes).filter(x => x != null))).sort((a, b) => a - b);
  if (!s.length) return null;
  const out = [s[0]]; for (let i = 1; i < s.length; i++) out.push(s[i] - s[i - 1]);
  return out;
}
const stats = {}; let added = 0; const idOrder = {};   // 선 안의 역 ID(번호가 선로 순서와 대체로 같다)를 검증용 순서로 남긴다
for (const f of raws) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const id in raw) {
    const r = raw[id];
    if (!NT_STNORDER[r.line] || !NT_STNORDER[r.line].some(s => nz(s) === r.nm)) continue;
    const rec = {};
    const mk = (day) => { const o = {}; const u = list(r.tt[day + 'U'] || []), d = list(r.tt[day + 'D'] || []); if (u) o['상'] = u; if (d) o['하'] = d; return (u || d) ? o : null; };
    const D = mk('01'), S = mk('02'), W = mk('03');
    if (D) rec.D = D; if (W) rec.W = W; if (S) rec.S = S;
    if (!rec.D && !rec.W && !rec.S) continue;
    (idOrder[r.line] = idOrder[r.line] || []).push({ id, nm: r.nm });
    const key = r.line + '|' + r.nm;
    if (bundle.data._REAL_TT[key]) continue;           // 기존(서울 1~9호선) 기록은 건드리지 않는다
    bundle.data._REAL_TT[key] = rec; added++;
    (stats[r.line] = stats[r.line] || { n: 0, S: 0, onlyOneDir: 0 }).n++;
    if (rec.S) stats[r.line].S++;
    const dd = rec.D || rec.W; if (!(dd['상'] && dd['하'])) stats[r.line].onlyOneDir++;
  }
}
const today = new Date().toISOString().slice(0, 10);
bundle.version = String(bundle.version).replace(/\+tago.*$/, '') + '+tago-' + today;
fs.writeFileSync(outP, JSON.stringify(bundle));
const idSort = (a, b) => { const f = x => { const m = x.id.match(/^(\D*)(\d*)(\D*)(\d+)$/); return m ? [m[1] + m[2] + m[3], +m[4]] : [x.id, 0]; }; const A = f(a), B = f(b); return A[0] < B[0] ? -1 : A[0] > B[0] ? 1 : A[1] - B[1]; };
for (const l in idOrder) idOrder[l] = idOrder[l].sort(idSort).map(x => x.nm);
fs.writeFileSync(outP.replace(/\.json$/, '') + '.order.json', JSON.stringify(idOrder));
console.log('추가', added, JSON.stringify(stats), bundle.version);
