// s8: 정류장 상한(MAX_STOPS)에 걸린 요청만 '출발~도착 직선 주변(복도)' 정류장을 우선 채운다.
//  - 기존: near(출발·도착 근처 노선) + rest(넓은 bbox 에서 ORDER BY 없이 앞에서부터 자른 임의의 행).
//          bbox 안 행이 3만을 넘으면(30km대부터) 어떤 노선이 남는지가 임의였다.
//  - 신규: 상한에 닿았을 때만 복도 쿼리를 한 번 더 보내 near → 복도 → (남는 자리) 기존 rest 순으로 채운다.
//          상한에 안 닿은 요청은 코드 경로가 하나도 바뀌지 않는다(결과 동일).
//  - 켜는 법: ?cs=1 (실험) 또는 CS_DEFAULT=true. ?cs=0 은 항상 기존 동작. 캐시 키는 "c8:" 접두로 분리.
//  - ?cw=0.04 : 복도 반폭(도) 실험용.
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
function rep(a,b){ if(s.split(a).length!==2) throw new Error('anchor: '+a.slice(0,60)); s=s.replace(a,b); }

// 1) 헬퍼 + 스위치
rep('var MAX_STOPS = 3e4;',`var MAX_STOPS = 3e4;
var CS_DEFAULT = false;
function corridorBoxes(SY, SX, EY, EX, hw) {
  var cl = Math.cos((SY + EY) / 2 * Math.PI / 180);
  var dLat = Math.abs(EY - SY), dLng = Math.abs(EX - SX) * cl;
  var dist = Math.sqrt(dLat * dLat + dLng * dLng);
  hw = Math.max(hw, dist / 24);
  var n = Math.min(16, Math.max(2, Math.ceil(dist / (hw * 1.6)) + 1));
  var out = [];
  for (var i = 0; i < n; i++) {
    var t = i / (n - 1), y = SY + (EY - SY) * t, x = SX + (EX - SX) * t, hl = hw / Math.max(0.5, cl);
    out.push([y - hw, y + hw, x - hl, x + hl]);
  }
  return out;
}`);

// 2) 캐시 키 분리
rep('const _ck = rowsCacheKey(minLat, maxLat, minLng, maxLng);',
`const _csP = p.get("cs");
  const _cs = _csP === "1" || CS_DEFAULT && _csP !== "0";
  const _ck = (_cs ? "c8:" : "") + rowsCacheKey(minLat, maxLat, minLng, maxLng);`);

// 3) 상한에 닿았을 때만 복도 재선정
const loopEnd=`      for (let _ri = 0; _ri < _rl.length && rows.length < MAX_STOPS; _ri++) {
        const _r = _rl[_ri], _k = _r.route_key + "|" + _r.seq;
        if (seenRow[_k]) continue;
        seenRow[_k] = 1;
        rows.push(_r);
      }
    }
`;
rep(loopEnd, loopEnd+`    if (_cs && !_rr.e && !_nr.e && rows.length >= MAX_STOPS) {
      try {
        const _t2 = Date.now();
        const _hw = Math.min(0.2, Math.max(0.02, parseFloat(p.get("cw")) || 0.04));
        const _cor = corridorBoxes(SY, SX, EY, EX, _hw);
        let _w = "";
        const _bd = [minLat, maxLat, minLng, maxLng];
        for (let _i = 0; _i < _cor.length; _i++) {
          const _o = 5 + _i * 4;
          _w += (_i ? " OR " : "") + "(brs.lat BETWEEN ?" + _o + " AND ?" + (_o + 1) + " AND brs.lng BETWEEN ?" + (_o + 2) + " AND ?" + (_o + 3) + ")";
          _bd.push(_cor[_i][0], _cor[_i][1], _cor[_i][2], _cor[_i][3]);
        }
        _bd.push(MAX_STOPS);
        const _cq = await _dbR.prepare(SQL_COLS + "WHERE brs.lat BETWEEN ?1 AND ?2 AND brs.lng BETWEEN ?3 AND ?4 AND (" + _w + ") LIMIT ?" + (5 + _cor.length * 4)).bind(..._bd).all();
        const _cl = _cq && _cq.results || [];
        const _seen2 = /* @__PURE__ */ Object.create(null), _rows2 = [];
        const _push2 = (r) => { const k = r.route_key + "|" + r.seq; if (_seen2[k]) return; _seen2[k] = 1; _rows2.push(r); };
        for (let _i = 0; _i < _nearRowsCnt; _i++) _push2(rows[_i]);
        for (let _i = 0; _i < _cl.length && _rows2.length < MAX_STOPS; _i++) _push2(_cl[_i]);
        const _corN = _rows2.length;
        const _rl2 = _rr.q && _rr.q.results || [];
        for (let _i = 0; _i < _rl2.length && _rows2.length < MAX_STOPS; _i++) _push2(_rl2[_i]);
        rows = _rows2;
        _d1Diag.cs = { boxes: _cor.length, hw: _hw, corRows: _cl.length, upto: _corN, ms: Date.now() - _t2 };
      } catch (e) {
        _d1Diag.csErr = String(e && e.message || e).slice(0, 80);
      }
    }
`);
fs.writeFileSync(process.argv[3],s);console.log('ok-cs');
