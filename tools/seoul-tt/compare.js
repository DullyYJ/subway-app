// 서울 열린데이터광장 시간표(collect.js 결과)와 번들 _REAL_TT 를 호선·요일·역·방향별로 대조한다.
//   사용: node compare.js <seoul_tt.json.gz> <번들.json> [호선들: 1,2,7 …]
//   종점의 도착 전용 행(출발 00:00:00)은 뺀다.
//   일치도 = 짝지은 수 / max(서울 편수, 번들 편수) (±2분). 방향은 서울 INOUT 1/2 ↔ 번들 상/하 를 역마다 두 가지로 맞춰 보고 좋은 쪽을 쓴다(그 매핑이 호선 안에서 일관된지도 센다).
const fs = require('fs'), zlib = require('zlib');
const S = JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2]))); const B = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).data._REAL_TT;
const want = new Set((process.argv[4] || '1,2,3,4,5,6,7,8').split(','));
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const tm = s => { if (!s || s === '00:00:00') return null; const [h, m] = s.split(':').map(Number); return (h * 60 + m) % 1440; };
const dec = a => { let p = 0; return (a || []).map(x => (p += x) % 1440); };
const match = (A, Bb) => { A = [...A].sort((x, y) => x - y); Bb = [...Bb].sort((x, y) => x - y); let i = 0, j = 0, m = 0; while (i < A.length && j < Bb.length) { const d = A[i] - Bb[j]; if (Math.abs(d) <= 2) { m++; i++; j++; } else if (d < 0) i++; else j++; } return m; };
const DK = { '1': 'D', '2': 'S', '3': 'W' }, DN = { '1': '평일', '2': '토', '3': '일' };
const agg = {}, worst = {}, map = {};
for (const c in S.stations) {
  const st = S.stations[c], ln = (+st.line.replace(/\D/g, '')) + '호선'; if (!want.has(String(+st.line.replace(/\D/g, '')))) continue;
  const rec = B[ln + '|' + nz(st.nm)]; if (!rec) { (agg[ln + ' 번들에 없는 역'] = agg[ln + ' 번들에 없는 역'] || []).push(st.nm); continue; }
  for (const w of ['1', '2', '3']) {
    const dd = st.days[w]; const bd = rec[DK[w]]; if (!dd) continue; if (!bd) { const k = ln + ' ' + DN[w] + ' 번들 자료 없음'; agg[k] = (agg[k] || 0) + 1; continue; }
    const t = io => (dd[io] || []).map(r => tm(r[2])).filter(x => x != null);
    const s1 = t('1'), s2 = t('2'), b1 = dec(bd['상']), b2 = dec(bd['하']);
    const mA = match(s1, b1) + match(s2, b2), mB = match(s1, b2) + match(s2, b1), use = mA >= mB ? 'A' : 'B', m = Math.max(mA, mB);
    const key = ln + ' ' + DN[w]; const a = agg[key] = agg[key] || { st: 0, m: 0, s: 0, b: 0 }; a.st++; a.m += m; a.s += s1.length + s2.length; a.b += b1.length + b2.length;
    const mk = ln + ' ' + DN[w]; map[mk] = map[mk] || { A: 0, B: 0 }; if (m > 0.5 * Math.max(s1.length + s2.length, 1)) map[mk][use]++;
    const r = m / Math.max(s1.length + s2.length, b1.length + b2.length, 1); (worst[key] = worst[key] || []).push([r, st.nm, s1.length + s2.length, b1.length + b2.length]);
  }
}
for (const k of Object.keys(agg).sort()) { const a = agg[k]; if (Array.isArray(a)) { console.log(k, a.length, a.slice(0, 8).join(',')); continue; } if (typeof a === 'number') { console.log(k, a, '역'); continue; }
  const w = worst[k].sort((x, y) => x[0] - y[0]); console.log(k.padEnd(10), '역', String(a.st).padStart(3), '서울', String(a.s).padStart(6), '번들', String(a.b).padStart(6), '일치', (a.m / Math.max(a.s, a.b) * 100).toFixed(1) + '%', '| 방향매핑 A(1=상)', map[k].A, 'B(1=하)', map[k].B, '| 낮은 역:', w.slice(0, 4).map(x => x[1] + ' ' + Math.round(x[0] * 100) + '%(' + x[2] + '/' + x[3] + ')').join(', ')); }
