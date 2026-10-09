// 길동무 — 지하철 '다음 열차' 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수)
//
// ★ 원칙(YJ): "계산은 전부 엔진이 한다. 앱은 그리기만 한다."
//   예전에는 앱(www/index.html)이 시각표 데이터(_REAL_TT·_INCHEON_TT·_GIMPO_TT)를 들고 있다가
//   방향 판정(_ttSegDir)·다음 열차(_ttNextDepForSeg)·첫차/막차 판정(_metroNextTrainInfo)을 직접 계산했다.
//   그 계산을 앱 코드 그대로 이 파일로 옮겼다(2026-10-09). 결과가 앱의 옛 계산과 같은지는
//   test/next_train_parity.ui.test.js 가 브라우저의 옛 함수와 이 모듈을 수만 건 비교해서 확인한다.
//
// 데이터(DATA): { _REAL_TT, _GIMPO_TT, _INCHEON_TT, _BUILTIN_TT, LINE_SCHEDULE, _REAL_SEG, _TT_ORDER_HARD, STNORDER }
//   · 서울 1~9호선·김포골드라인·기점격자·실측 역간시간·역순서 = gildongmu-tt 번들(`/tt` 의 data)
//   · 인천 1·2호선(_INCHEON_TT)·지방 노선 역 순서(STNORDER) = 앱에 들어 있던 것 → engine/next-train-data.js
//   엔진이 번들을 어떻게 불러오는지는 Worker 쪽 연결부(handleFetch)가 맡는다.
//
// 앱에서 가져오지 않은 것: TAGO·원격 timetable.json 캐시(_tagoTTCache·_TT) — 앱에서도 실제로는 쓰이지 않던 경로.
// 앱과 다른 점: 날짜 구분(평일/휴일)과 기준 시각은 요청의 baseMs 에서 엔진이 정한다(앱은 기준시각 설정을 반영해 같은 값을 보냈다).
'use strict';

var NT_HOLIDAYS = ['1-1','2-16','2-17','2-18','3-1','3-2','5-5','5-24','6-6','8-15','9-24','9-25','9-26','10-3','10-5','10-9','12-25'];

// 기준 시각(ms) → KST 기준 { nowMin(0~1439), isHol(주말·공휴일), dayCode('DAY'|'SAT'|'SUN') }
function ntDayInfo(baseMs) {
  var d = new Date(baseMs + 9 * 3600000);
  var dow = d.getUTCDay();
  var key = (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  var hol = NT_HOLIDAYS.indexOf(key) >= 0;
  return {
    nowMin: d.getUTCHours() * 60 + d.getUTCMinutes(),
    isHol: dow === 0 || dow === 6 || hol,
    dayCode: hol ? 'SUN' : (dow === 0 ? 'SUN' : (dow === 6 ? 'SAT' : 'DAY'))
  };
}

function ntCreate(DATA) {
  var window = {};   // 앱 코드가 캐시를 window 에 두던 것을 그대로 쓰기 위한 지역 객체
  var _REAL_TT = DATA._REAL_TT || {}, _GIMPO_TT = DATA._GIMPO_TT || {}, _INCHEON_TT = DATA._INCHEON_TT || {};
  var _BUILTIN_TT = DATA._BUILTIN_TT || {}, LINE_SCHEDULE = DATA.LINE_SCHEDULE || {};
  var _REAL_SEG = DATA._REAL_SEG || {}, _TT_ORDER_HARD = DATA._TT_ORDER_HARD || {};
  var STNDB;   // 번들에 없는 지방 노선의 역 순서(앱의 STNDB 와 같은 순서): DATA.STNORDER = { 노선: [역…] }
  if (DATA.STNORDER) {
    STNDB = [];
    for (var _ln in DATA.STNORDER) for (var _si = 0; _si < DATA.STNORDER[_ln].length; _si++) STNDB.push({ line: _ln, name: DATA.STNORDER[_ln][_si] });
  }
  var _ctxHol = false, _ctxDay = 'DAY';   // 호출마다 정해진다(아래 공개 함수)

  // ── 실측 역간소요(_REAL_SEG) 강건 조회: 표기차 무시 + 라인무관 역쌍 폴백 ──
  function _rsNorm(x){ return String(x||'').replace(/\(.*?\)/g,'').replace(/역$/,'').replace(/\s+/g,'').trim(); }

  function _realSeg(lineName, a, b){
    if(typeof _REAL_SEG === 'undefined') return null;
    if(!window._RS_NORM){
      window._RS_NORM = {}; window._RS_PAIR = {};
      for(var k in _REAL_SEG){
        var pr = k.split('|'); if(pr.length!==3) continue;
        var L=_rsNorm(pr[0]), A=_rsNorm(pr[1]), B=_rsNorm(pr[2]);
        window._RS_NORM[L+'|'+A+'|'+B] = _REAL_SEG[k];
        window._RS_PAIR[A+'|'+B] = _REAL_SEG[k];   // 라인 무관 역쌍
      }
    }
    var na=_rsNorm(a), nb=_rsNorm(b);
    var v = window._RS_NORM[_rsNorm(lineName)+'|'+na+'|'+nb];   // 1) 라인+역쌍 정확
    if(v==null) v = window._RS_PAIR[na+'|'+nb];                 // 2) 라인무관 역쌍
    return (v==null ? null : v);
  }

  // 델타 디코딩: [첫값,차이,차이...] → [절대분,절대분...]
  function _rttDecode(arr){
    if(!arr || !arr.length) return [];
    var out=[arr[0]];
    for(var i=1;i<arr.length;i++) out.push(out[i-1]+arr[i]);
    return out;
  }

  function _ttNm(n){ return String(n||'').replace(/\(.*?\)/g,'').replace(/역$/,'').replace(/\s+/g,'').trim(); }

  var _TT_SCHED_ALIAS = { '의정부선':'의정부경전철', '에버라인선':'용인경전철', '인천공항철도':'공항철도' };

  // ── 공식 시각표 시각배열(분) 조회: dk='상'|'하' ──
  function _ttOfficialTimes(lineName, stnNm, dk, isHol){
    var nm = _ttNm(stnNm);
    // ① 서울 1~9호선
    if(typeof _REAL_TT !== 'undefined' && _REAL_TT){
      var rec = _REAL_TT[lineName + '|' + nm];
      if(rec){
        var day = isHol ? (rec.W || rec.D) : (rec.D || rec.W);
        if(day){
          var arr = day[dk] || null;
          if(arr && arr.length && typeof _rttDecode === 'function') return _rttDecode(arr);
        }
      }
    }
    // ② 인천1·2호선
    if(typeof _INCHEON_TT !== 'undefined' && _INCHEON_TT && _INCHEON_TT[lineName]){
      var sd = _INCHEON_TT[lineName][nm];
      if(sd){
        var t2 = sd[(isHol ? '휴일' : '평일') + dk];
        if(t2 && t2.length) return t2.slice();
      }
    }
    // ③ 김포골드라인 (상=김포공항방면)
    if(lineName === '김포골드라인' && typeof _GIMPO_TT !== 'undefined' && _GIMPO_TT[nm]){
      var g = _GIMPO_TT[nm];
      var br = (dk === '상') ? g.up : g.down;
      if(br){
        var lst = isHol ? br.hd : br.wd;
        if(lst && lst.length){
          return lst.map(function(x){ return (x[0] >= 24 ? (x[0]-24)*60 + x[1] + 1440 : x[0]*60 + x[1]); });
        }
      }
    }
    return null;
  }

  // 실제 시각표에서 기준시각 이후 다음 열차 (분) 조회
  function _realNextDep(lineName, stnName, dir, baseMin, isWeekend){
    if(typeof _REAL_TT==='undefined') return null;
    // 역명 정규화 (역 접미사 제거)
    var nm = stnName;
    if(nm.length>1 && nm.charAt(nm.length-1)==='역') nm = nm.slice(0,-1);
    var key = lineName + '|' + nm;
    var rec = _REAL_TT[key];
    if(!rec) return null;
    var day = isWeekend ? (rec.W||rec.D) : (rec.D||rec.W);
    if(!day) return null;
    var dk = (dir==='상행'||dir==='상'||dir==='내선') ? '상' : '하';
    var arr = day[dk] || day['상'] || day['하'];
    if(!arr || !arr.length) return null;
    var times = _rttDecode(arr);
    // ★ 현재 시각 기준 가장 빠른 열차 (여유 제거)
    var minMin = baseMin;
    for(var i=0;i<times.length;i++){
      if(times[i] >= minMin) return times[i];
    }
    // 막차 지남 → 다음날 첫차
    return times[0] + 1440;
  }

  // ★ 역별 실제 첫차 시각(분) — _REAL_TT(실제) → _BUILTIN_TT(격자) 순
  function _realFirstDep(lineName, stnName, dir, isWeekend){
    var nm = stnName;
    if(nm.length>1 && nm.charAt(nm.length-1)==='역') nm = nm.slice(0,-1);
    // 1순위: 실제 시각표 (_REAL_TT) — 서울 1~9호선
    if(typeof _REAL_TT !== 'undefined'){
      var rec = _REAL_TT[lineName + '|' + nm];
      if(rec){
        var day = isWeekend ? (rec.W||rec.D) : (rec.D||rec.W);
        if(day){
          var firsts = [];
          if(dir){
            var dk = (dir==='상행'||dir==='상'||dir==='내선') ? '상' : '하';
            if(day[dk] && day[dk].length) firsts.push(_rttDecode(day[dk])[0]);
          } else {
            ['상','하'].forEach(function(k){
              if(day[k] && day[k].length) firsts.push(_rttDecode(day[k])[0]);
            });
          }
          if(firsts.length) return Math.min.apply(null, firsts);
        }
      }
    }
    // 2순위: 내장 격자 (_BUILTIN_TT) — 31개 노선, 역 순서로 첫차 보정
    if(typeof _BUILTIN_TT !== 'undefined' && _BUILTIN_TT[lineName] && _BUILTIN_TT[lineName].length){
      var lineFirst = _BUILTIN_TT[lineName][0];  // 노선 첫차(기점)
      // ★ 역 순서만큼 첫차 지연 (기점에서 N번째 역 = 첫차 + 누적 운행시간)
      if(typeof STNDB !== 'undefined'){
        var lnStns = STNDB.filter(function(s){ return s.line === lineName; });
        var idx = lnStns.findIndex(function(s){ return s.name === nm || s.name === stnName; });
        if(idx > 0){
          // 평균 역간 2분 가정 → 기점에서 idx개 역만큼 지연
          // 방향 고려: 상행이면 종점 기준 역산
          var offset = idx * 2;  // 분
          if(dir === '상행' || dir === '상'){
            offset = (lnStns.length - 1 - idx) * 2;  // 반대 방향
          }
          return lineFirst + offset;
        }
      }
      return lineFirst;
    }
    // 3순위: LINE_SCHEDULE 폴백
    if(typeof LINE_SCHEDULE !== 'undefined' && LINE_SCHEDULE[lineName]){
      return timeToMin(LINE_SCHEDULE[lineName].first);
    }
    return null;
  }

  function timeToMin(t) {
    if(!t) return 0;
    var parts = t.split(':');
    return parseInt(parts[0]||0) * 60 + parseInt(parts[1]||0);
  }

  // ── 역별 첫차(분, 04:00 이후) ──
  function _ttFirst(lineName, stnNm, dk, isHol){
    var t = _ttOfficialTimes(lineName, stnNm, dk, isHol);
    if(!t || !t.length) return null;
    for(var i=0;i<t.length;i++){ if(t[i] >= 240) return t[i]; }
    return t[0];
  }

  // ── 공식 시각표 보유 여부 ──
  function _ttHasOfficial(lineName, stnNm, isHol){
    return !!(_ttOfficialTimes(lineName, stnNm, '상', isHol) || _ttOfficialTimes(lineName, stnNm, '하', isHol));
  }

  // ── 노선 역순서: _TT_ORDER_HARD → _REAL_SEG 인접체인 → STNDB 순 ──
  function _ttOrderOf(lineName){
    if(!window._TT_ORD_CACHE) window._TT_ORD_CACHE = {};
    if(window._TT_ORD_CACHE[lineName]) return window._TT_ORD_CACHE[lineName];
    var out = null;
    if(_TT_ORDER_HARD[lineName]) out = _TT_ORDER_HARD[lineName].map(_ttNm);
    if(!out && typeof _REAL_SEG !== 'undefined'){
      var adj = {};
      for(var k in _REAL_SEG){
        var p = k.split('|'); if(p.length !== 3 || p[0] !== lineName) continue;
        var a = _ttNm(p[1]), b = _ttNm(p[2]), w = _REAL_SEG[k] || 120;
        if(!adj[a]) adj[a] = {};
        if(!adj[b]) adj[b] = {};
        if(adj[a][b] == null || w < adj[a][b]) adj[a][b] = w;
        if(adj[b][a] == null || w < adj[b][a]) adj[b][a] = w;
      }
      var nodes = Object.keys(adj);
      if(nodes.length > 2){
        // 급행 스킵간선 등 잡음 제거: 매 단계 '역간시간이 가장 짧은 미방문 이웃'으로 전진
        var ends = nodes.filter(function(n){ return Object.keys(adj[n]).length === 1; });
        var starts = ends.length ? ends : [nodes[0]];
        var best = [];
        for(var si=0; si<starts.length && si<8; si++){
          var seen = {}, seq = [starts[si]], cur = starts[si], guard = 0;
          seen[cur] = 1;
          while(guard++ < 600){
            var nb = null, nv = Infinity;
            for(var c in adj[cur]){ if(!seen[c] && adj[cur][c] < nv){ nv = adj[cur][c]; nb = c; } }
            if(nb == null) break;
            seen[nb] = 1; seq.push(nb); cur = nb;
          }
          if(seq.length > best.length) best = seq;
        }
        if(best.length >= 3) out = best;
      }
    }
    if(!out && typeof STNDB !== 'undefined'){
      out = STNDB.filter(function(s){ return s.line === lineName; }).map(function(s){ return _ttNm(s.name); });
    }
    window._TT_ORD_CACHE[lineName] = out || [];
    return window._TT_ORD_CACHE[lineName];
  }

  // ── 노선 내 위치(기준 종점으로부터 누적 초) — 지선·급행간선 있어도 단조 ──
  function _ttPosOf(lineName){
    if(!window._TT_POS_CACHE) window._TT_POS_CACHE = {};
    if(window._TT_POS_CACHE[lineName]) return window._TT_POS_CACHE[lineName];
    var g = {};
    if(typeof _REAL_SEG !== 'undefined'){
      for(var k in _REAL_SEG){
        var p = k.split('|'); if(p.length !== 3 || p[0] !== lineName) continue;
        var a = _ttNm(p[1]), b = _ttNm(p[2]), w = _REAL_SEG[k] || 120;
        if(!g[a]) g[a] = {}; if(!g[b]) g[b] = {};
        if(g[a][b] == null || w < g[a][b]) g[a][b] = w;
        if(g[b][a] == null || w < g[b][a]) g[b][a] = w;
      }
    }
    var nodes = Object.keys(g), pos = null;
    if(nodes.length > 2){
      var dij = function(src){
        var d = {}, done = {}, i, n;
        for(i=0;i<nodes.length;i++) d[nodes[i]] = Infinity;
        d[src] = 0;
        for(i=0;i<nodes.length;i++){
          var u = null, bd = Infinity;
          for(n in d){ if(!done[n] && d[n] < bd){ bd = d[n]; u = n; } }
          if(u == null) break;
          done[u] = 1;
          for(var v in g[u]){ var nd = d[u] + g[u][v]; if(nd < d[v]) d[v] = nd; }
        }
        return d;
      };
      var d0 = dij(nodes[0]), far = nodes[0], bv = -1;
      for(var ni=0;ni<nodes.length;ni++){
        var nn = nodes[ni];
        if(d0[nn] < Infinity && d0[nn] > bv){ bv = d0[nn]; far = nn; }
      }
      pos = dij(far);
    }
    if(!pos && typeof STNDB !== 'undefined'){
      pos = {};
      STNDB.filter(function(s){ return s.line === lineName; })
           .forEach(function(s, i){ pos[_ttNm(s.name)] = i * 120; });
    }
    window._TT_POS_CACHE[lineName] = pos || {};
    return window._TT_POS_CACHE[lineName];
  }

  // ── 노선별 '위치 증가 방향'에 해당하는 시각표 키(상/하) 전역 투표 ──
  function _ttForwardKey(lineName, isHol){
    var ck = lineName + '|' + (isHol ? 'H' : 'D');
    if(!window._TT_FWD_CACHE) window._TT_FWD_CACHE = {};
    if(window._TT_FWD_CACHE[ck] !== undefined) return window._TT_FWD_CACHE[ck];
    var pos = _ttPosOf(lineName);
    var arr = Object.keys(pos).filter(function(n){ return isFinite(pos[n]); })
                              .sort(function(a,b){ return pos[a] - pos[b]; });
    var pick = null, pickSc = 0;
    ['상','하'].forEach(function(dk){
      var prev = null, sc = 0;
      for(var i=0;i<arr.length;i++){
        var f = _ttFirst(lineName, arr[i], dk, isHol);
        if(f == null) continue;
        if(prev != null) sc += (f > prev ? 1 : (f < prev ? -1 : 0));
        prev = f;
      }
      if(Math.abs(sc) > Math.abs(pickSc)){ pickSc = sc; pick = dk; }
    });
    var fwd = null;
    if(pick && pickSc !== 0) fwd = (pickSc > 0) ? pick : (pick === '상' ? '하' : '상');
    window._TT_FWD_CACHE[ck] = fwd;
    return fwd;
  }

  // ── 방향키 판정(핵심): 같은 열차가 A→B 순으로 나타나는 시각표 키를 상호상관으로 탐지
  //    A의 각 시각 +k 가 B에 존재하는 개수를 k=1..120 로 스캔 → 뚜렷한 피크가 있는 키가 A→B 방향
  function _ttXcorrKey(lineName, a, b, isHol){
    var ck = lineName + '|' + a + '|' + b + '|' + (isHol ? 'H' : 'D');
    if(!window._TT_XC_CACHE) window._TT_XC_CACHE = {};
    if(window._TT_XC_CACHE[ck] !== undefined) return window._TT_XC_CACHE[ck];
    var pick = null, pickSc = 0;
    ['상','하'].forEach(function(dk){
      var A = _ttOfficialTimes(lineName, a, dk, isHol);
      var B = _ttOfficialTimes(lineName, b, dk, isHol);
      if(!A || !B || A.length < 5 || B.length < 5) return;
      var set = {}, i, j, k;
      for(i=0;i<B.length;i++) set[B[i]] = 1;
      var counts = [];
      for(k=1;k<=120;k++){
        var c = 0;
        for(j=0;j<A.length;j++){ if(set[A[j] + k]) c++; }
        counts.push(c);
      }
      var mx = 0; for(i=0;i<counts.length;i++) if(counts[i] > mx) mx = counts[i];
      var srt = counts.slice().sort(function(x,y){ return x - y; });
      var med = srt[Math.floor(srt.length/2)];
      var sc = mx - med;
      if(sc > pickSc){ pickSc = sc; pick = dk; }
    });
    var out = (pick && pickSc >= 5) ? pick : null;
    window._TT_XC_CACHE[ck] = out;
    return out;
  }

  // ── 방향 판정: ① 노선위치 + 전역 방향키 ② 구간 첫차 증감 폴백 ③ 역순서 폴백 ──
  function _ttSegDir(lineName, stops, isHol){
    var names = [];
    for(var i=0;i<stops.length;i++){
      var n = _ttNm(stops[i].stationName || stops[i].name || '');
      if(n) names.push(n);
    }
    if(names.length < 2) return null;
    // ① 상호상관(가장 신뢰도 높음)
    var _xk = _ttXcorrKey(lineName, names[0], names[names.length-1], isHol);
    if(!_xk && names.length > 2) _xk = _ttXcorrKey(lineName, names[0], names[1], isHol);
    if(_xk) return (_xk === '상') ? '상행' : '하행';
    // ② 노선 위치 + 전역 방향키
    var _pos = _ttPosOf(lineName), _fwd = _ttForwardKey(lineName, isHol);
    if(_fwd){
      var pa = _pos[names[0]], pb = _pos[names[names.length-1]];
      if(pa != null && pb != null && isFinite(pa) && isFinite(pb) && pa !== pb){
        var _key = (pb > pa) ? _fwd : (_fwd === '상' ? '하' : '상');
        return (_key === '상') ? '상행' : '하행';
      }
    }
    var best = null, bestSc = -999;
    ['상','하'].forEach(function(dk){
      var sc = 0, cnt = 0, prev = null;
      for(var i=0;i<names.length;i++){
        var f = _ttFirst(lineName, names[i], dk, isHol);
        if(f == null) continue;
        if(prev != null){ cnt++; sc += (f > prev ? 1 : (f < prev ? -1 : 0)); }
        prev = f;
      }
      if(cnt > 0 && sc > bestSc){ bestSc = sc; best = dk; }
    });
    if(best && bestSc > 0) return (best === '상') ? '상행' : '하행';
    // 폴백: 노선 순서 기반(기존 앱 규칙 = 순번 증가 시 '하행')
    var ord = _ttOrderOf(lineName);
    if(ord && ord.length > 1){
      var ia = ord.indexOf(names[0]), ib = ord.indexOf(names[names.length-1]);
      if(ia >= 0 && ib >= 0 && ia !== ib) return (ib > ia) ? '하행' : '상행';
    }
    return null;
  }

  // ── 미보유 노선: 기점격자 + 실측 역간시간 누적 오프셋 → 승차역 다음열차 ──
  // ★ 2026-09-03: 시각표 없는 역의 시각을 '이웃 역에서 평행 이동'으로 만든다.
  //   증상: 아라역(인천1호선 검단연장 신설역)처럼 공식 시각표에 없는 역은
  //        경로를 바꿀 때마다 출발 시각이 달라졌다(06:13 → 06:11 → …).
  //   원인: 폴백인 _genNextDep 이 방향에 따라 기점을 바꿔가며(상행이면 종점부터)
  //        누적 시간을 더하고, 실측 역간시간이 없으면 120초를 가정한다.
  //        같은 역이라도 경로·방향이 달라지면 값이 흔들릴 수밖에 없다.
  //   → 같은 노선에서 공식 시각표를 가진 '가장 가까운 역'을 찾아,
  //     그 역의 시각표를 실측 역간시간만큼 앞뒤로 옮겨 쓴다.
  //     기준이 노선 시각표 하나로 고정되므로 경로가 달라져도 값이 변하지 않는다.
  var _TT_DERIVED_CACHE = {};

  var _TT_DERIVE_MAX = 8;

  function _ttDerivedTimes(lineName, stnNm, dk, isHol){
    try{
      var nm = _ttNm(stnNm);
      var ck = lineName + '|' + nm + '|' + dk + '|' + (isHol ? 'H' : 'D');
      if(_TT_DERIVED_CACHE[ck] !== undefined) return _TT_DERIVED_CACHE[ck];

      var ord = (typeof _ttOrderOf === 'function') ? _ttOrderOf(lineName) : null;
      if(!ord || ord.length < 2){ _TT_DERIVED_CACHE[ck] = null; return null; }
      var i = ord.indexOf(nm);
      if(i < 0){ _TT_DERIVED_CACHE[ck] = null; return null; }

      // 가장 가까운 '시각표 보유' 역 찾기 (양방향으로 한 칸씩 넓혀 간다)
      var j = -1;
      for(var d = 1; d <= _TT_DERIVE_MAX && j < 0; d++){
        if(i - d >= 0 && _ttOfficialTimes(lineName, ord[i-d], dk, isHol)) j = i - d;
        else if(i + d < ord.length && _ttOfficialTimes(lineName, ord[i+d], dk, isHol)) j = i + d;
      }
      if(j < 0){ _TT_DERIVED_CACHE[ck] = null; return null; }

      var base = _ttOfficialTimes(lineName, ord[j], dk, isHol);
      if(!base || !base.length){ _TT_DERIVED_CACHE[ck] = null; return null; }

      // 두 역 사이 실측 소요시간(초)
      var lo = Math.min(i, j), hi = Math.max(i, j), sec = 0;
      for(var k = lo; k < hi; k++){
        var v = (typeof _realSeg === 'function') ? _realSeg(lineName, ord[k], ord[k+1]) : null;
        sec += (v != null ? v : 120);
      }
      var shift = Math.round(sec / 60);

      // 진행 방향에 따라 부호가 갈린다.
      //   하행(ord 증가 방향): 기준역이 뒤(j>i)면 이 역이 먼저 → 빼기
      //   상행(ord 감소 방향): 기준역이 앞(j<i)면 이 역이 먼저 → 빼기
      var down = (dk !== '상');
      var earlier = down ? (j > i) : (j < i);
      var delta = earlier ? -shift : shift;

      var out = base.map(function(t){ return t + delta; })
                    .filter(function(t){ return t >= 0; })
                    .sort(function(a, b){ return a - b; });
      _TT_DERIVED_CACHE[ck] = out.length ? out : null;
      return _TT_DERIVED_CACHE[ck];
    }catch(e){ return null; }
  }

  function _genNextDep(lineName, stops, baseMin){
    var grid = _ttGridFor(lineName);
    if(!grid || !grid.length) return null;
    var offMin = 0;
    try{
      var ord = _ttOrderOf(lineName);
      if(ord && ord.length > 1 && stops.length > 1){
        var a = _ttNm(stops[0].stationName || ''), b = _ttNm(stops[1].stationName || '');
        var ia = ord.indexOf(a), ib = ord.indexOf(b);
        if(ia >= 0 && ib >= 0 && ia !== ib){
          var step = (ib > ia) ? 1 : -1;
          var origin = (step > 0) ? 0 : ord.length - 1;
          var sec = 0;
          for(var i = origin; i !== ia; i += step){
            var v = (typeof _realSeg === 'function') ? _realSeg(lineName, ord[i], ord[i+step]) : null;
            sec += (v != null ? v : 120);
          }
          offMin = Math.round(sec / 60);
        }
      }
    }catch(e){}
    for(var g=0; g<grid.length; g++){
      var t = grid[g] + offMin;
      if(t >= baseMin) return t % 1440 === t ? t : t;
    }
    return grid[0] + offMin + 1440;
  }

  // ── 미보유 노선용 기점 출발격자 ──
  function _ttGridFor(lineName){
    if(!window._TT_GRID_CACHE) window._TT_GRID_CACHE = {};
    var _gck = lineName + '|' + _ctxDay;
    if(window._TT_GRID_CACHE[_gck]) return window._TT_GRID_CACHE[_gck];
    var grid = null;
    if(typeof _BUILTIN_TT !== 'undefined' && _BUILTIN_TT[lineName] && _BUILTIN_TT[lineName].length){
      grid = _BUILTIN_TT[lineName];
    } else {
      var key = _TT_SCHED_ALIAS[lineName] || lineName;
      var sc  = (typeof LINE_SCHEDULE !== 'undefined') ? LINE_SCHEDULE[key] : null;
      if(sc && typeof timeToMin === 'function'){
        var f = timeToMin(sc.first), l = timeToMin(sc.last);
        if(l < f) l += 1440;
        var base = sc.interval || 8, g = [], t = f, guard = 0;
        var wknd = (_ctxDay === 'SAT' || _ctxDay === 'SUN');
        while(t <= l && guard++ < 400){
          g.push(t % 1440 === t ? t : t);
          var h = Math.floor((t % 1440) / 60);
          var iv = base;
          if(h >= 7 && h < 9 || h >= 18 && h < 20) iv = Math.max(2, Math.round(base * 0.6));
          else if(h >= 22 || h < 6)                iv = Math.round(base * 2.2);
          else if(wknd)                            iv = Math.round(base * 1.4);
          if(iv < 1) iv = 1;
          t += iv;
        }
        if(g.length) grid = g;
      }
    }
    window._TT_GRID_CACHE[_gck] = grid || [];
    return window._TT_GRID_CACHE[_gck];
  }

  // ── 지하철 세그먼트의 다음 열차 출발시각(분) ──
  // ⚠ 2026-09-03부터 타임라인에서 사용하지 않음 — 출발 시각은 엔진이 정한다.
  //   되살리지 말 것. 앱이 시각표로 다시 맞추면 탭마다 시각이 달라진다.
  //   (다른 화면에서 '다음 열차' 안내용으로는 여전히 쓸 수 있다)
  function _ttNextDepForSeg(sg, baseMin){
    if(!sg || sg.type !== 1 || !sg.stops || !sg.stops.length) return null;
    var line = sg.name || '';
    var stn  = _ttNm(sg.stops[0].stationName || '');
    if(!line || !stn) return null;
    var isHol = _ctxHol;
    var dir = null;
    // ① 공식 시각표(방향키 직접 조회) — 방향 무관 병합캐시에 오염되지 않도록 우선 처리
    if(_ttHasOfficial(line, stn, isHol)){
      dir = _ttSegDir(line, sg.stops, isHol) || '하행';
      var tms = _ttOfficialTimes(line, stn, (dir === '상행') ? '상' : '하', isHol);
      if(tms && tms.length){
        for(var i=0;i<tms.length;i++){ if(tms[i] >= baseMin) return tms[i]; }
        return tms[0] + 1440;
      }
    }
    // ③ 파생 시각표 — 공식 시각표를 가진 이웃 역에서 평행 이동
    //    (신설역·연장구간처럼 시각표에 아직 없는 역을 위해)
    dir = dir || _ttSegDir(line, sg.stops, isHol) || '하행';
    var dv = _ttDerivedTimes(line, stn, (dir === '상행') ? '상' : '하', isHol);
    if(dv && dv.length){
      for(var di=0; di<dv.length; di++){ if(dv[di] >= baseMin) return dv[di]; }
      return dv[0] + 1440;
    }

    // ④ 생성 시각표(기점 배차 + 실측 역간시간)
    return _genNextDep(line, sg.stops, baseMin);
  }

  function _metroNextTrainInfo(q){
    try {
      var line = q.line, stn = q.from, nextStn = q.to, mins = q.mins;
      if(!line || !stn) return null;
      var nowMin = q.nowMin;
      var isWk = !!q.isHol;

      // ── 진행 방향 판정: 승차역·다음역의 첫차 시각차 (Bug2 _ttSegDir와 동일 원리) ──
      // (2026-10-09: 예전 코드는 한 번도 정의된 적 없는 함수를 불러 항상 '하'가 됐다 →
      //  Bug2 에서 만든 통합 방향 판정 _ttSegDir 를 쓴다)
      var dirKey = '하';
      try{
        if(typeof _ttSegDir==='function' && nextStn){
          var _sd = _ttSegDir(line, [{ stationName: stn }, { stationName: nextStn }], isWk);
          if(_sd === '상행') dirKey = '상'; else if(_sd === '하행') dirKey = '하';
        }
      }catch(e){}

      // ── 시각표 조회: 공식 시각표(_ttOfficialTimes) 우선 ──
      //   _realNextDep는 _REAL_TT(서울 1~9호선)만 담고 있어, 공항철도·인천1·2호선 등은
      //   항상 null → '막차 이후'로 잘못 표시됐다. Bug2에서 만든 통합 조회를 먼저 쓴다.
      var times = null;
      if(typeof _ttOfficialTimes === 'function'){
        try { times = _ttOfficialTimes(line, stn, dirKey, isWk); } catch(e){}
      }

      if(times && times.length){
        var dep = null;
        for(var i=0;i<times.length;i++){ if(times[i] >= nowMin){ dep = times[i]; break; } }
        // 다음 열차가 90분 넘게 남았으면 사실상 운행 종료(심야) → 첫차 안내로 처리
        if(dep != null && (dep - nowMin) > 90){
          return { found:false, depMin:null, arrMin:null, firstMin:((dep%1440)+1440)%1440, line:line, stn:stn, dir:dirKey };
        }
        if(dep != null){
          return { found:true, depMin:dep, arrMin:dep + (mins||0), firstMin:null, line:line, stn:stn, dir:dirKey };
        }
        // 오늘 남은 열차 없음 → 다음 첫차
        var first = null;
        for(var k=0;k<times.length;k++){ if(times[k] >= 240){ first = times[k]; break; } }
        if(first == null) first = times[0];
        return { found:false, depMin:null, arrMin:null, firstMin:((first%1440)+1440)%1440, line:line, stn:stn, dir:dirKey };
      }

      // ── 폴백: 기존 _realNextDep (서울 1~9호선) ──
      var dep2 = (typeof _realNextDep==='function') ? _realNextDep(line, stn, dirKey, nowMin, isWk) : null;
      if(dep2 != null){
        if(dep2 < 1440){
          return { found:true, depMin:dep2, arrMin:dep2 + (mins||0), firstMin:null, line:line, stn:stn, dir:dirKey };
        }
        var fm = dep2 - 1440;
        if(fm == null && typeof _realFirstDep === 'function'){
          var f2 = _realFirstDep(line, stn, dirKey, isWk);
          if(f2 != null) fm = ((f2%1440)+1440)%1440;
        }
        return { found:false, depMin:null, arrMin:null, firstMin:fm, line:line, stn:stn, dir:dirKey };
      }

      // ── 시각표 자체가 없는 노선 → '모름'. '열차 없음'으로 단정하지 않는다 ──
      return { found:null, depMin:null, arrMin:null, firstMin:null, line:line, stn:stn, dir:dirKey };
    } catch(e){ return null; }
  }

  function setCtx(info) { _ctxHol = !!info.isHol; _ctxDay = info.dayCode || 'DAY'; }

  return {
    // 첫 구간 '다음 열차' 안내(노선도 경로 브리핑): { line, from, to, baseMs, mins } → 앱의 옛 _metroNextTrainInfo 와 같은 모양
    metroInfo: function (q) {
      var di = ntDayInfo(q.baseMs); setCtx(di);
      return _metroNextTrainInfo({ line: q.line, from: q.from, to: q.to, mins: q.mins, nowMin: di.nowMin, isHol: di.isHol });
    },
    // 지하철 구간의 승차역 다음 열차 출발(분; 자정 넘으면 1440 이상): sg = { name(노선), type:1, stops:[{stationName}…] }
    segNextDep: function (sg, baseMs) {
      var di = ntDayInfo(baseMs); setCtx(di);
      return _ttNextDepForSeg(sg, di.nowMin);
    },
    segDir: function (line, stops, baseMs) {
      var di = ntDayInfo(baseMs); setCtx(di);
      return _ttSegDir(line, stops, di.isHol);
    },
    officialTimes: function (line, stn, dk, baseMs) {
      var di = ntDayInfo(baseMs); setCtx(di);
      return _ttOfficialTimes(line, stn, dk, di.isHol);
    },
    dayInfo: ntDayInfo
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { ntCreate: ntCreate, ntDayInfo: ntDayInfo, NT_HOLIDAYS: NT_HOLIDAYS };
