// 속도 패치 2: accessNodes 의 버스 정류장 전수 순회 → addBus 가 만든 지도 칸 색인 사용(결과·순서 동일), xpWait 의 Date 객체 제거(동일 연산)
const fs = require('fs');
let s = fs.readFileSync(process.argv[2], 'utf8');
function rep(a, b) { const n = s.split(a).length - 1; if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 70)); s = s.replace(a, () => b); }

rep('  const ST = G.ST;\n  const sgrid = /* @__PURE__ */ new Map();',
    '  G.__bgrid = { busCoord, bids, grid, CELL, GK };\n  const ST = G.ST;\n  const sgrid = /* @__PURE__ */ new Map();');

rep(`    for (const bid in busCoord) {
      const y = busCoord[bid][0], x = busCoord[bid][1];
      if (Math.abs(y - lat) > R / 11e4 || Math.abs(x - lng) > R / (11e4 * _cl)) continue;
      const d = hav(lat, lng, y, x);
      if (d > R) continue;
      o.push(["B|" + bid, d / WALK_MPS, d, busAllowed(allowBus, y, x)]);
    }
`, `    if (G && G.__bgrid && G.__bgrid.busCoord === busCoord) {
      const BG = G.__bgrid, wLat = R / 11e4, wLng = R / (11e4 * _cl);
      const ci0 = Math.floor((lat - wLat) / BG.CELL) - 1, ci1 = Math.floor((lat + wLat) / BG.CELL) + 1;
      const cj0 = Math.floor((lng - wLng) / BG.CELL) - 1, cj1 = Math.floor((lng + wLng) / BG.CELL) + 1;
      const idxs = [];
      for (let ci = ci0; ci <= ci1; ci++) for (let cj = cj0; cj <= cj1; cj++) {
        const g = BG.grid.get(ci * BG.GK + cj);
        if (g) for (let q = 0; q < g.length; q++) idxs.push(g[q]);
      }
      idxs.sort((a, b) => a - b);
      for (let q = 0; q < idxs.length; q++) {
        const bid = BG.bids[idxs[q]];
        const y = busCoord[bid][0], x = busCoord[bid][1];
        if (Math.abs(y - lat) > wLat || Math.abs(x - lng) > wLng) continue;
        const d = hav(lat, lng, y, x);
        if (d > R) continue;
        o.push(["B|" + bid, d / WALK_MPS, d, busAllowed(allowBus, y, x)]);
      }
    } else for (const bid in busCoord) {
      const y = busCoord[bid][0], x = busCoord[bid][1];
      if (Math.abs(y - lat) > R / 11e4 || Math.abs(x - lng) > R / (11e4 * _cl)) continue;
      const d = hav(lat, lng, y, x);
      if (d > R) continue;
      o.push(["B|" + bid, d / WALK_MPS, d, busAllowed(allowBus, y, x)]);
    }
`);

rep(`  var t = new Date((G && G._baseMs != null ? G._baseMs : Date.now()) + dSec * 1e3 + 324e5);
  var nm = t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;`,
`  var _xms = Math.trunc((G && G._baseMs != null ? G._baseMs : Date.now()) + dSec * 1e3 + 324e5);
  var _xsod = Math.floor(((_xms % 864e5) + 864e5) % 864e5 / 1e3);
  var nm = Math.floor(_xsod / 3600) * 60 + Math.floor(_xsod % 3600 / 60) + _xsod % 60 / 60;`);
fs.writeFileSync(process.argv[3], s);
console.log('ok2');
