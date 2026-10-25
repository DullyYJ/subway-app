// 길동무 — 위치 판단기(PosFusion) 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-20 (s83)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   노선 위 위치를 '확률'로 추정하는 은닉 마르코프 판단기(예전엔 웹 www/index.html 안의 PosFusion)를 엔진으로 옮겼다. 알고리즘은 한 글자도 바꾸지 않았다(웹 원본과 같은 결과를
//   내는지 시험이 대조한다). 엔진은 기억하지 않으므로(stateless) 상태(지연 가정 31개 × 상태 확률)가 요청에 실려 가서 갱신된 채로 돌아온다.
//   앱(네이티브)은 GPS · 기지국 · (선택) 움직임 증거를 '받은 순서 그대로' 모아 보내고, 돌려받은 채택 역(best.idx)과 확신도를 그대로 따른다.
//
// 입력  posFuseRun({ nowMs, stations:[{lat,lng,schedMs|null,xferFromPrev,name?}], state?, seed?:{idx,conf}, ev:[{t:'gps',at,fix:{lat,lng,ts,acc}} |
//                                                                                          {t:'cell',at,idx,conf} | {t:'arrived',at,idx,strength}] })
//   state 없음(처음) → 판단기를 만들고 seed(기본 0역 0.9, idx>0 이면 0.8)로 시작. ev 는 시각(at) 오름차순으로 처리하고, 마지막에 nowMs 까지 시간을 진행한다.
// 출력  { ok, state, best:{idx,conf,kind,nextConf,delayS,delayW}, median:{idx,delayS,delayW}, fed:{gps,cell,arrived,skipped} }
//   best.idx/median.idx = stations 배열 번호(=웹의 _pf.st 번호)
var pfuLib = (function(){
'use strict';

  var C = {
    DWELL_S: 30,          // 일반 정차 평균(초)
    DWELL_XFER_S: 150,    // 환승 구간 평균(초)
    DEP_AFTER_ARR_S: 20,  // 도착 후 출발까지(초)
    SEG_DEFAULT_S: 120,   // 시각표가 없을 때 구간 평균(초)
    OVERDUE_FLOOR_S: 75,  // 예정 도착이 지난 뒤에도 '곧 도착'으로 보는 최소 남은 시간(초)
    EARLY_BRAKE: 0.12,    // 예정 출발 45초 전보다 이르면 출발 확률을 이만큼으로 줄인다
    BACK_LEAK: 5e-4,      // 한 걸음 되돌아갈 수 있는 아주 작은 누수
    FLOOR: 1e-4,          // 어디든 갈 수 있는 바닥 확률(증거가 틀려도 복구되게)
    GPS_MAX_ACC: 80,      // 이보다 부정확한 fix 는 쓰지 않는다(m) — 2026-10-12: 150 → 80 (지하에서 살아난 기지국식 좌표 100m 안팎이 위치를 흔들었다)
    GPS_MAX_AGE_S: 10,    // 이보다 오래된 fix 는 쓰지 않는다
    GPS_EPS: 0.02,        // GPS 이상값 허용
    CELL_EPS: 0.15,       // 셀 증거가 틀렸을 때의 최소 가능도
    CELL_SIGMA: 0.9,      // 셀 증거가 가리키는 역 주변 폭(역 단위)
    SIG_DWELL_S: 18,      // 출발 시각 흔들림(초) — 시각표가 분 단위라 오차 포함
    SIG_SEG_S: 25,        // 도착 시각 흔들림(초)
    STEP_S: 5             // 시간 진행 한 걸음(초)
  };

  function rad(d){ return d * Math.PI / 180; }
  function hav(la1, ln1, la2, ln2){
    var R = 6371000, dLa = rad(la2-la1), dLn = rad(ln2-ln1);
    var a = Math.sin(dLa/2)*Math.sin(dLa/2) + Math.cos(rad(la1))*Math.cos(rad(la2))*Math.sin(dLn/2)*Math.sin(dLn/2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  // 가우스 지속시간의 '위험률'(hazard): 예정 시각 T 근처에서 집중적으로 떠난다.
  //  z = (지금 - T)/sigma.  예정 한참 전이면 ≈0, 예정 시각이면 1/sigma 정도, 지나가면 커진다.
  function erfc(x){
    // Abramowitz-Stegun 7.1.26
    var z = Math.abs(x), t = 1/(1 + 0.5*z);
    var r = t*Math.exp(-z*z - 1.26551223 + t*(1.00002368 + t*(0.37409196 + t*(0.09678418 + t*(-0.18628806 + t*(0.27886807 + t*(-1.13520398 + t*(1.48851587 + t*(-0.82215223 + t*0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function gaussHaz(z, sigma, h){
    var phi = Math.exp(-0.5*z*z) / 2.5066282746;
    var tail = 0.5*erfc(z/1.4142135624);
    var lam = phi / (sigma * Math.max(tail, 1e-6));
    var v = lam * h;
    return v > 0.6 ? 0.6 : v;
  }
  // 점 → 선분 거리(m), 등장방형 근사(역간 수 km 이내라 충분)
  function distSeg(lat, lng, a, b){
    var kx = 111320 * Math.cos(rad(lat)), ky = 110540;
    var px = (lng - a.lng) * kx, py = (lat - a.lat) * ky;
    var bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * ky;
    var L2 = bx*bx + by*by;
    var t = L2 > 0 ? Math.max(0, Math.min(1, (px*bx + py*by) / L2)) : 0;
    var dx = px - t*bx, dy = py - t*by;
    return { d: Math.sqrt(dx*dx + dy*dy), f: t };
  }

  // stations: [{ lat, lng, schedMs|null, xferFromPrev:boolean, name }]
  //
  // ★ 지연을 '모르는 값'으로 둔다. 열차가 몇 분 늦는지 모르는 채로 시각표를 믿으면
  //   시각표만큼 앞서가 버린다. 그래서 지연 가정(-2분 ~ +10분)을 K개 두고 각각 독립된
  //   HMM 을 돌린 뒤, 증거를 잘 설명한 가정에 가중치를 몰아준다(다중 모델 필터).
  //   정차/주행 패턴이 시각표의 어느 지연과 맞는지가 곧 '지금 몇 분 늦었나'의 답이다.
  function create(stations, opts){
    var cfg = {}; for(var k in C) cfg[k] = C[k];
    if(opts) for(var k2 in opts) cfg[k2] = opts[k2];
    var N = stations.length, M = Math.max(1, 2*N - 1);
    var DELAYS = [];
    for(var dd = -300; dd <= 600; dd += 30) DELAYS.push(dd);   // 2026-10-12: -120 → -300 (인천1호선 실측: 열차가 시각표보다 2분 넘게 빠르다. 하한이 -2분이면 빨리 달리는 열차를 '정차 중'으로 오해)
    var K = DELAYS.length, i;
    var subs = DELAYS.map(function(d){
      return { delay: d, w: Math.exp(-Math.abs(d) / (d < 0 ? 60 : 200)), P: new Array(M) };
    });
    var self = { N: N, M: M, cfg: cfg, lastMs: null };
    var lastGpsTs = 0, lastCellAt = 0;

    function normW(){
      var s = 0, j; for(j=0;j<K;j++) s += subs[j].w;
      if(!(s > 0)){ for(j=0;j<K;j++) subs[j].w = 1/K; return; }
      for(j=0;j<K;j++){ subs[j].w = Math.max(subs[j].w / s, 2e-3); }
      s = 0; for(j=0;j<K;j++) s += subs[j].w;
      for(j=0;j<K;j++) subs[j].w /= s;
    }
    function normP(P){
      var s = 0, j; for(j=0;j<M;j++) s += P[j];
      if(!(s > 0)){ for(j=0;j<M;j++) P[j] = 1/M; return; }
      for(j=0;j<M;j++) P[j] /= s;
    }
    function seed(idx, conf, nowMs){
      idx = Math.max(0, Math.min(N-1, idx|0));
      conf = conf == null ? 0.9 : conf;
      for(var k3=0;k3<K;k3++){
        var P = subs[k3].P;
        for(i=0;i<M;i++) P[i] = (1-conf)/Math.max(1, M-1);
        P[2*idx] = conf; normP(P);
      }
      if(nowMs != null) self.lastMs = nowMs;
    }
    function isXferDwell(j){ return j > 0 && !!stations[j].xferFromPrev; }

    function stepOne(sub, nowMs, h){
      var P = sub.P, nx = new Array(M), a, delayMs = sub.delay*1000;
      for(a=0;a<M;a++) nx[a] = 0;
      for(var j=0;j<N;j++){
        var p = P[2*j];
        if(p > 0){
          if(j >= N-1){ nx[2*j] += p; }
          else{
            var hd, sj = stations[j].schedMs;
            if(sj != null){
              var Td = sj + delayMs + (j === 0 ? 0 : cfg.DEP_AFTER_ARR_S*1000);
              hd = gaussHaz((nowMs - Td)/1000 / cfg.SIG_DWELL_S, cfg.SIG_DWELL_S, h);
              if(isXferDwell(j)) hd = gaussHaz((nowMs - (sj + delayMs))/1000 / (cfg.SIG_DWELL_S*2), cfg.SIG_DWELL_S*2, h);
            }else hd = h / cfg.DWELL_S;
            if(hd > 0.6) hd = 0.6;
            nx[2*j] += p*(1-hd); nx[2*j+1] += p*hd;
          }
        }
        if(j < N-1){
          var q = P[2*j+1];
          if(q > 0){
            var sn = stations[j+1].schedMs, hs;
            if(sn != null){
              var sg = cfg.SIG_SEG_S;
              if(stations[j+1].xferFromPrev) sg *= 2;
              hs = gaussHaz((nowMs - (sn + delayMs))/1000 / sg, sg, h);
            }else hs = h / cfg.SEG_DEFAULT_S;
            if(hs > 0.6) hs = 0.6;
            nx[2*j+1] += q*(1-hs); nx[2*(j+1)] += q*hs;
          }
        }
      }
      var out = new Array(M);
      for(var b=0;b<M;b++) out[b] = nx[b]*(1 - cfg.BACK_LEAK) + (b+1<M ? nx[b+1]*cfg.BACK_LEAK : 0) + cfg.FLOOR/M;
      sub.P = out; normP(sub.P);
    }
    function stepAll(nowMs, h){
      for(var k4=0;k4<K;k4++) stepOne(subs[k4], nowMs, h);
      // 지연 가정끼리 아주 조금 섞는다(열차가 더 늦어지는 일 · 가정 고착 방지)
      var mix = 0.012 * h / cfg.STEP_S, nw = new Array(K), k5;
      for(k5=0;k5<K;k5++){
        var l = k5 > 0 ? subs[k5-1].w : subs[k5].w, r = k5 < K-1 ? subs[k5+1].w : subs[k5].w;
        nw[k5] = subs[k5].w*(1-2*mix) + (l + r)*mix;
      }
      for(k5=0;k5<K;k5++) subs[k5].w = nw[k5];
      normW();
    }

    self.seed = seed;
    self.predict = function(nowMs){
      if(self.lastMs == null){ self.lastMs = nowMs; return; }
      var dt = (nowMs - self.lastMs)/1000;
      if(dt <= 0) return;
      if(dt > 600) dt = 600;
      var t = self.lastMs;
      while(dt > 1e-6){
        var h = Math.min(cfg.STEP_S, dt);
        t += h*1000; stepAll(t, h); dt -= h;
      }
      self.lastMs = nowMs;
    };

    // L(j): 상태 j 의 가능도. 모든 가정에 적용하고, 증거를 설명한 정도만큼 가정 가중치를 갱신한다.
    function applyEvidence(Lfn, w){
      for(var k6=0;k6<K;k6++){
        var P = subs[k6].P, Z = 0;
        for(var j=0;j<M;j++){
          var v = Lfn(j); if(!(v > 1e-9)) v = 1e-9;
          if(w != null && w !== 1) v = Math.pow(v, w);
          P[j] *= v; Z += P[j];
        }
        subs[k6].w *= Math.max(Z, 1e-12);
        normP(P);
      }
      normW();
    }

    self.gps = function(fix, nowMs){
      if(!fix || fix.lat == null) return false;
      if(fix.ts && fix.ts === lastGpsTs) return false;
      var age = fix.ts ? (nowMs - fix.ts)/1000 : 0;
      if(age > cfg.GPS_MAX_AGE_S) return false;
      var acc = fix.acc == null ? 60 : fix.acc;
      if(acc > cfg.GPS_MAX_ACC) return false;
      lastGpsTs = fix.ts || nowMs;
      var Lc = new Array(M);
      for(var j=0;j<M;j++){
        var idx = j >> 1, d, sg;
        if(j % 2 === 0){
          var s = stations[idx];
          if(s.lat == null){ Lc[j] = 1; continue; }
          d = hav(fix.lat, fix.lng, s.lat, s.lng); sg = Math.max(acc, 70) + 60;
        }else{
          var a = stations[idx], b = stations[idx+1];
          if(a.lat == null || b.lat == null){ Lc[j] = 1; continue; }
          d = distSeg(fix.lat, fix.lng, a, b).d; sg = Math.max(acc, 70) + 120;
        }
        Lc[j] = cfg.GPS_EPS + Math.exp(-(d*d)/(2*sg*sg));
      }
      applyEvidence(function(j){ return Lc[j]; }, acc <= 50 ? 1 : 0.7);
      return true;
    };

    self.cell = function(stnIdx, conf, nowMs){
      if(stnIdx == null || stnIdx < 0 || stnIdx >= N) return;
      if(nowMs - lastCellAt < 15000) return;
      lastCellAt = nowMs;
      applyEvidence(function(j){
        var pos = (j % 2 === 0) ? (j >> 1) : ((j >> 1) + 0.5), d = pos - stnIdx;
        return cfg.CELL_EPS + (1 - cfg.CELL_EPS) * Math.exp(-(d*d)/(2*cfg.CELL_SIGMA*cfg.CELL_SIGMA));
      }, Math.max(0.3, Math.min(1, conf == null ? 0.7 : conf)));
    };

    self.arrived = function(stnIdx, nowMs, strength){
      if(stnIdx == null || stnIdx < 0 || stnIdx >= N) return;
      var s = strength == null ? 0.9 : strength;
      applyEvidence(function(j){ return ((j >> 1) === stnIdx) ? 1 : (1 - s) + 0.02; }, 1);
    };

    function combined(){
      var Pm = new Array(M), j, k7;
      for(j=0;j<M;j++) Pm[j] = 0;
      for(k7=0;k7<K;k7++){ var P = subs[k7].P, w = subs[k7].w; for(j=0;j<M;j++) Pm[j] += w*P[j]; }
      return Pm;
    }
    self.best = function(){
      var Pm = combined(), A = new Array(N), j, bi = 0, bv = -1;
      for(j=0;j<N;j++){ A[j] = Pm[2*j] + (j < N-1 ? Pm[2*j+1] : 0); if(A[j] > bv){ bv = A[j]; bi = j; } }
      var pd = Pm[2*bi], ps = bi < N-1 ? Pm[2*bi+1] : 0;
      var mapK = 0; for(j=1;j<K;j++) if(subs[j].w > subs[mapK].w) mapK = j;
      return {
        idx: bi, conf: bv,
        kind: (pd >= ps || bi >= N-1) ? 'dwell' : 'seg',
        nextConf: bi < N-1 ? A[bi+1] : 0,
        delayS: subs[mapK].delay, delayW: subs[mapK].w
      };
    };
    // '마지막으로 도착한 역'의 중앙값: 도착 분포 P(마지막 도착 = j) 의 누적이 처음 1/2 를 넘는 역.
    //   최빈값(best)은 분포가 퍼지면 확률이 낮은 한 역으로 튀지만, 중앙값은 '이 역은 이미 지났을 확률이 절반 이상'인 가장 앞 역이라
    //   기대 오차(역 단위 절대값)를 가장 작게 한다. 근거가 끊겨 분포가 시각표·지연 가정만으로 퍼질 때의 대표값으로 쓴다.
    self.median = function(){
      var Pm = combined(), c = 0, j, bi = N - 1;
      for(j=0;j<N;j++){
        c += Pm[2*j] + (j < N-1 ? Pm[2*j+1] : 0);
        if(c >= 0.5){ bi = j; break; }
      }
      var mapK = 0; for(j=1;j<K;j++) if(subs[j].w > subs[mapK].w) mapK = j;
      return { idx: bi, delayS: subs[mapK].delay, delayW: subs[mapK].w };
    };
    self.dist = combined;
    self.cfgGet = function(){ return cfg; };

    // ── (엔진 추가) 상태 내보내기/불러오기: 엔진은 기억하지 않으므로 상태가 요청에 실려 오간다 ──
    self.exportState = function(){
      var r = function(v){ return Number(v.toPrecision(6)); };
      return { lastMs: self.lastMs, g: lastGpsTs, c: lastCellAt, w: subs.map(function(s){ return r(s.w); }), P: subs.map(function(s){ return s.P.map(r); }) };
    };
    self.importState = function(st){
      if(!st || !Array.isArray(st.w) || !Array.isArray(st.P) || st.w.length !== K || st.P.length !== K) return false;
      for(var q = 0; q < K; q++){ if(!Array.isArray(st.P[q]) || st.P[q].length !== M) return false; }
      for(var q2 = 0; q2 < K; q2++){
        subs[q2].w = Number(st.w[q2]) || 0; var P = subs[q2].P;
        for(i = 0; i < M; i++) P[i] = Math.max(0, Number(st.P[q2][i]) || 0);
        normP(P);
      }
      normW();
      self.lastMs = (typeof st.lastMs === 'number') ? st.lastMs : null; lastGpsTs = Number(st.g) || 0; lastCellAt = Number(st.c) || 0;
      return true;
    };

    seed(0, 0.9, null);
    normW();
    return self;
  }


return { create: create, hav: hav, distSeg: distSeg, defaults: C };
})();

function pfuStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }

function posFuseRun(inp) {
  inp = (inp && typeof inp === 'object') ? inp : {};
  var nowMs = Number(inp.nowMs);
  if (!(nowMs > 0)) return { ok: false, error: 'nowMs' };
  var src = Array.isArray(inp.stations) ? inp.stations : [];
  if (src.length < 2 || src.length > 300) return { ok: false, error: 'stations' };
  var st = [];
  for (var i = 0; i < src.length; i++) {
    var s = src[i] || {};
    var lat = (typeof s.lat === 'number' && isFinite(s.lat)) ? s.lat : null, lng = (typeof s.lng === 'number' && isFinite(s.lng)) ? s.lng : null;
    st.push({ lat: lat, lng: lng, schedMs: (typeof s.schedMs === 'number' && isFinite(s.schedMs)) ? s.schedMs : null, xferFromPrev: !!s.xferFromPrev, name: pfuStr(s.name, 40) });
  }
  var f = pfuLib.create(st), fed = { gps: 0, cell: 0, arrived: 0, skipped: 0 };
  var restored = inp.state ? f.importState(inp.state) : false;
  if (!restored) {
    var sd = (inp.seed && typeof inp.seed === 'object') ? inp.seed : {};
    var idx = Math.max(0, Math.min(st.length - 1, Math.floor(Number(sd.idx) || 0)));
    var conf = (typeof sd.conf === 'number' && sd.conf > 0 && sd.conf < 1) ? sd.conf : (idx > 0 ? 0.8 : 0.9);
    var evs0 = Array.isArray(inp.ev) ? inp.ev : [];
    f.seed(idx, conf, Number(inp.startMs) > 0 ? Number(inp.startMs) : (evs0.length && Number(evs0[0] && evs0[0].at) > 0 ? Number(evs0[0].at) : nowMs));
  }
  var ev = (Array.isArray(inp.ev) ? inp.ev : []).slice(0, 2000).filter(function (e) { return e && typeof e === 'object' && Number(e.at) > 0; });
  ev.sort(function (a, b) { return a.at - b.at; });
  for (var k = 0; k < ev.length; k++) {
    var e = ev[k], at = Number(e.at);
    if (at > nowMs) { fed.skipped++; continue; }
    f.predict(at);
    if (e.t === 'gps') { var fx = e.fix || {}; if (f.gps({ lat: fx.lat, lng: fx.lng, ts: fx.ts, acc: fx.acc }, at)) fed.gps++; else fed.skipped++; }
    else if (e.t === 'cell') { f.cell(Number(e.idx), typeof e.conf === 'number' ? e.conf : null, at); fed.cell++; }
    else if (e.t === 'arrived') { f.arrived(Number(e.idx), at, typeof e.strength === 'number' ? e.strength : null); fed.arrived++; }
    else fed.skipped++;
  }
  f.predict(nowMs);
  var b = f.best(), m = f.median();
  return { ok: true, state: f.exportState(), best: b, median: m, fed: fed };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { posFuseRun: posFuseRun, pfuLib: pfuLib };
