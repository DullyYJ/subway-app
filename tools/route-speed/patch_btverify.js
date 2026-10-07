// s5: /bt-verify 강화 — 실제 경로와 동일한 JOIN SQL(고아 route_key 제외)로 D1 bbox를 조회하고,
// busRowsSort 후 13개 전 필드를 순서까지 비교한다. (진단 전용 라우트, 라우팅 결과 무영향)
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
const a='var _q1 = await env.DB.prepare("SELECT brs.route_key,brs.seq FROM bus_route_stops brs WHERE brs.lat BETWEEN ?1 AND ?2 AND brs.lng BETWEEN ?3 AND ?4 LIMIT ?5")';
const b='} else _out.missing = (_asm.missing || []).length;';
const i=s.indexOf(a), j=s.indexOf(b);
if(i<0||j<0||s.indexOf(a,i+1)>=0||s.indexOf(b,j+1)>=0||j<i)throw new Error('btverify anchors');
const NEW=`var _q1 = await env.DB.prepare("SELECT brs.route_key,brs.seq,brs.node_id,brs.node_nm,brs.lat,brs.lng,br.route_type,br.route_no,br.start_time,br.end_time,br.itv_wd,br.itv_sat,br.itv_sun FROM bus_route_stops brs JOIN bus_routes br ON brs.route_key=br.route_key WHERE brs.lat BETWEEN ?1 AND ?2 AND brs.lng BETWEEN ?3 AND ?4 LIMIT ?5").bind(_mnLa, _mxLa, _mnLn, _mxLn, MAX_STOPS).all();
      var _d1r = _q1 && _q1.results || [], _ds = {};
      for (var _i = 0; _i < _d1r.length; _i++) _ds[_d1r[_i].route_key + "|" + _d1r[_i].seq] = 1;
      var _out = { diag: _dg, d1: _d1r.length, capped: _d1r.length >= MAX_STOPS };
      if (_asm.rows) {
        var _ts = {}, _onlyT = 0, _onlyD = 0, _fd = 0, _od = 0, _smp = [];
        for (var _k = 0; _k < _asm.rows.length; _k++) {
          var _kk = _asm.rows[_k].route_key + "|" + _asm.rows[_k].seq;
          _ts[_kk] = 1;
          if (!_ds[_kk]) { _onlyT++; if (_smp.length < 3) _smp.push("T:" + _kk); }
        }
        for (var _kd in _ds) if (!_ts[_kd]) { _onlyD++; if (_smp.length < 3) _smp.push("D:" + _kd); }
        var _F = ["route_key","seq","node_id","node_nm","lat","lng","route_type","route_no","start_time","end_time","itv_wd","itv_sat","itv_sun"];
        var _fv = function(v) { return v === null ? "n" : v === void 0 ? "u" : typeof v + ":" + String(v); };
        var _tr = _asm.rows.slice(), _dr = _d1r.slice();
        busRowsSort(_tr); busRowsSort(_dr);
        if (_tr.length === _dr.length) {
          for (var _m = 0; _m < _tr.length; _m++) {
            for (var _f = 0; _f < _F.length; _f++) if (_fv(_tr[_m][_F[_f]]) !== _fv(_dr[_m][_F[_f]])) { _fd++; if (_smp.length < 3) _smp.push("F:" + _F[_f] + "@" + _tr[_m].route_key + "|" + _tr[_m].seq); break; }
          }
        } else _fd = -1;
        _out.tile = _asm.rows.length;
        _out.onlyTile = _onlyT;
        _out.onlyD1 = _onlyD;
        _out.rowDiff = _fd;
        if (_smp.length) _out.smp = _smp;
      } else _out.missing = (_asm.missing || []).length;`;
s=s.slice(0,i)+NEW+s.slice(j+b.length);
fs.writeFileSync(process.argv[3],s);console.log('ok5');
