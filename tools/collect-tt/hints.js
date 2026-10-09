// 갱신 대상이 아닌 선형 노선(1호선·7호선)에 '방향 힌트'를 붙인다 — 시각표 자료는 그대로 두고 _TT_ORIENT 만 더한다.
//   · 선로 순서 = KRIC 열차별 정차에서 가장 긴 열차의 정차 순서. 상/하 라벨이 그 순서 기준으로 일관(다수 키)인지 KRIC 정답과 대조해 확인.
//   · 라벨이 어긋난 끝 역(7호선 석남, 1호선 인천)은 힌트 순서에서 뺀다(그 역이 낀 쌍은 예전처럼 시각표 상관으로 판정).
//   · 안전장치: 힌트를 붙인 뒤 KRIC 정답과 어긋나는 인접쌍이 늘거나 새로 틀리는 쌍이 하나라도 생기면 붙이지 않는다.
//   · 갈라지는 구간(1호선 경부·경인 지선 등)은 순서에 없는 역이라 예전처럼 시각표 상관으로 판정한다.
const path = require('path');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const toMin = s => { if (!s || s.length < 6) return null; let m = +s.slice(0, 2) * 60 + +s.slice(2, 4); if (m < 180) m += 1440; return m; };
const dec = a => { let p = 0; return a.map(x => p += x); };

function trainsOf(rows, SRC) {
  const trains = {};
  for (const r of rows) if (SRC.has(r.opr + '|' + r.ln) && r.day === '8') for (const ln of String(r.data).split('\n').filter(Boolean)) { const [trn, arr, dep] = ln.split(','); const t = toMin(dep) ?? toMin(arr); if (t == null) continue; (trains[r.opr + r.ln + trn] = trains[r.opr + r.ln + trn] || []).push({ st: nz(r.nm), t }); }
  return trains;
}
function pairsOf(trains) {
  const pairs = {};
  for (const k in trains) { const a = trains[k].sort((x, y) => x.t - y.t); for (let i = 0; i + 1 < a.length; i++) { if (a[i + 1].t - a[i].t > 20) continue; const kk = a[i].st + '>' + a[i + 1].st; (pairs[kk] = pairs[kk] || []).push(a[i].t); } }
  return pairs;
}
const hitOf = (rec, key, ts) => { const bt = rec && rec.D && rec.D[key] ? dec(rec.D[key]) : []; return ts.filter(t => bt.some(x => Math.abs(x - t) <= 2)).length / ts.length; };

// 번들 bundle 에서 line 의 인접쌍 방향 판정을 KRIC 정답과 비교해 틀린 쌍 목록을 돌려준다
function wrongPairs(bundle, line, pairs) {
  const W = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'nt_load'))(); const d = bundle.data;
  const nt = W.ntCreate({ _REAL_TT: d._REAL_TT, _GIMPO_TT: d._GIMPO_TT, _BUILTIN_TT: d._BUILTIN_TT, LINE_SCHEDULE: d.LINE_SCHEDULE, _REAL_SEG: d._REAL_SEG, _TT_ORDER_HARD: d._TT_ORDER_HARD, _TT_ORIENT: d._TT_ORIENT, _INCHEON_TT: W.NT_INCHEON_TT, STNORDER: W.NT_STNORDER });
  const MS = Date.UTC(2026, 9, 14, 4, 0), bad = [];
  for (const k in pairs) {
    const [A, B] = k.split('>'); if (pairs[k].length < 10) continue; const rec = d._REAL_TT[line + '|' + A]; if (!rec || !rec.D || !d._REAL_TT[line + '|' + B]) continue;
    const sd = nt.segDir(line, [{ stationName: A }, { stationName: B }], MS);
    if (!sd) { bad.push(k + '(판정없음)'); continue; }
    const key = sd === '상행' ? '상' : '하', other = key === '상' ? '하' : '상';
    if (hitOf(rec, other, pairs[k]) > hitOf(rec, key, pairs[k]) + 0.1) bad.push(k);
  }
  return bad;
}

// bundle(최종본, 제자리 수정) 에 힌트를 붙인다. spec: { 노선: 'opr|ln,opr|ln' }. 돌려주는 값: { 노선: { ok, why, … } }
function addHints(bundle, kricRows, spec) {
  const out = {};
  for (const line in spec) {
    try {
      const SRC = new Set(spec[line].split(',')), trains = trainsOf(kricRows, SRC), pairs = pairsOf(trains);
      let best = null; for (const k in trains) { const a = trains[k].sort((x, y) => x.t - y.t); if (!best || a.length > best.length) best = a; }
      if (!best || best.length < 8) { out[line] = { ok: false, why: 'KRIC 열차 자료 부족' }; continue; }
      const chain = best.map(x => x.st), d = bundle.data;
      if (d._TT_ORIENT[line]) {   // 이미 힌트가 붙어 있으면: 지금 틀린 쌍이 없으면 그대로 둔다(매번 다시 붙이지 않음)
        const w0 = wrongPairs(bundle, line, pairs); if (!w0.length) { out[line] = { ok: true, same: true, why: '', stations: d._TT_ORIENT[line].order.length }; continue; }
      }
      const cnt = { 상: 0, 하: 0 }, per = [];
      for (let i = 0; i + 1 < chain.length; i++) {
        const A = chain[i], k = A + '>' + chain[i + 1], rec = d._REAL_TT[line + '|' + A]; if (!rec || !pairs[k]) continue;
        const h = { 상: hitOf(rec, '상', pairs[k]), 하: hitOf(rec, '하', pairs[k]) };
        const tk = h.상 > h.하 + 0.1 ? '상' : h.하 > h.상 + 0.1 ? '하' : null; if (tk) { cnt[tk]++; per.push({ A, tk, h }); }
      }
      const fwd = cnt.상 >= cnt.하 ? '상' : '하', n = cnt.상 + cnt.하;
      if (n < 15) { out[line] = { ok: false, why: '정답을 알 수 있는 쌍이 적음(' + n + ')' }; continue; }
      const odd = per.filter(x => x.tk !== fwd);
      if (odd.length > 0.1 * n) { out[line] = { ok: false, why: '라벨이 순서와 일관되지 않음(' + odd.length + '/' + n + ')' }; continue; }
      const drop = new Set(odd.map(x => x.A));           // 라벨이 어긋난 끝 역
      const before = wrongPairs(bundle, line, pairs), keep = d._TT_ORIENT[line];
      let order, after, newBad, tries = 0;
      for (;;) {   // 힌트 때문에 새로 틀린 쌍이 생기면 그 쌍의 두 역을 순서에서 빼고(그 쌍은 예전처럼 시각표 상관으로 판정) 다시 확인 — 최대 6번
        order = chain.filter(s => !drop.has(s) && d._REAL_TT[line + '|' + s]);
        d._TT_ORIENT[line] = { order, fwd };
        after = wrongPairs(bundle, line, pairs); newBad = after.filter(x => !before.includes(x));
        if (!newBad.length || ++tries > 6) break;
        for (const x of newBad) for (const s of x.replace('(판정없음)', '').split('>')) drop.add(s);
      }
      if (after.length < before.length && !newBad.length) out[line] = { ok: true, why: '', fwd, stations: order.length, dropped: [...drop], before: before.length, after: after.length, fixed: before.filter(x => !after.includes(x)) };
      else { if (keep) d._TT_ORIENT[line] = keep; else delete d._TT_ORIENT[line]; out[line] = { ok: false, why: '검증 불통과(틀린 쌍 ' + before.length + '→' + after.length + (newBad.length ? ', 새로 틀림 ' + newBad.join(',') : '') + ')' }; }
    } catch (e) { out[line] = { ok: false, why: '오류: ' + e.message }; }
  }
  return out;
}
module.exports = { addHints, wrongPairs, trainsOf, pairsOf };
if (require.main === module) {   // 시험: node hints.js <번들.json> <kric.json> → 결과 출력(파일은 건드리지 않음)
  const fs = require('fs'); const b = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const rows = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  console.log(JSON.stringify(addHints(b, rows, { '1호선': 'KR|1,S1|1', '7호선': 'S1|7,IC|7' }), null, 1));
}
