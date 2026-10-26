// 길동무 — 홈 'AI 승무원' 브리핑 문장 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (s65, 네이티브화 4단계 셋째 조각)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   홈 화면 맨 위 'AI 승무원' 카드의 문장 — 소요시간·환승 안내·출발/도착 시각·혼잡 한마디·날씨와 준비물·마무리 — 은 예전엔 웹(www/index.html 의 _renderHomeConductorBrief 안 compose)이 만들었다.
//   이 함수는 같은 규칙으로 문장을 엔진이 만든다. 앱(웹)은 '지금 상태(출발/도착 이름 · 시각 · 혼잡도 · 날씨 · 경로 구간 · 다음 열차 정보)'만 알리고, 돌아온 문단 조각을 색 배지·굵은 글씨로 그리기만 한다.
//   (노선 색·역 배지 같은 '그림'은 앱에 남는다. 으로/로 같은 조사 고르기와 문장 순서·문턱값은 모두 엔진.)
//
// 입력  homeBrief({ from, to, hour, cong, hol, mins, wF, wT, segs, metro, nt, tl, nowMin, nowMs, arrMs, dm, rnd })
//   from/to : 출발·도착 이름(to 가 비었거나 from 과 같으면 '목적지 미설정') · hour : 지금 시(0~23) · cong : 혼잡도(0~100) · hol : 주말·공휴일이면 true
//   mins : 소요 분(0 이면 모름) · wF/wT : 날씨 { temp, txt, rain }|null · segs : 경로 구간 [{ type(1 지하철·2 버스·4 장거리), line, from, to, min, depClock, arrClock, rideMin }]|null
//   metro : 노선도 경로 미리보기 모드 · nt : 다음 열차 { found, depMin, arrMin, firstMin }|null(엔진 /next-train 값) · tl : 경로 카드 타임라인의 { dep, arr }|null
//   nowMin : 지금 한국시간의 분(0~1439) · nowMs/arrMs : 지금·도착 예정 시각(ms) · dm : 출발 비교 문구(이미 만들어진 HTML 조각)|'' · rnd : 0~1 난수(마무리 문구 고르기; 같은 값 → 같은 문구)
// 출력  { v:1, paras:[ 문단… ] }   문단 = { t:[조각…] } 또는 { sub:[조각…] }(작고 흐린 글씨 문단)
//   조각 = 글자 | {b:글자}(굵게) | {stn:[역이름, 노선]}(노선 색 역 배지) | {ln:노선}(노선 색 노선 배지) | {id:'homeAiArr'|'homeAiDep', t:[조각…]|raw:'HTML'}(갱신용 id 를 단 구간)
'use strict';

var HB_V = 1;

function hbPad(n) { return (n < 10 ? '0' : '') + n; }
function hbKstClock(ms) { var d = new Date(Number(ms) + 9 * 3600000); return hbPad(d.getUTCHours()) + ':' + hbPad(d.getUTCMinutes()); }
// 받침 판별 → 으로/로 조사 (받침 없거나 ㄹ이면 '로') — 예전 웹 _josRo 와 같다
function hbJosRo(w) {
  if (!w) return '으로';
  var s = String(w), c = s.charCodeAt(s.length - 1);
  if (c < 0xAC00 || c > 0xD7A3) return '로';
  var j = (c - 0xAC00) % 28;
  return (j === 0 || j === 8) ? '로' : '으로';
}
function hbNum(v, d) { v = Number(v); return isFinite(v) ? v : d; }
// 시스템 이름이 '부산_부산' 처럼 같은 말 두 번으로 오면 한 번만(s217)
function hbNmFix(s) {
  s = String(s == null ? '' : s).trim();
  var i = s.indexOf('_');
  if (i > 0) { var a = s.slice(0, i).trim(), b = s.slice(i + 1).trim(); if (a && a.replace(/역$/, '') === b.replace(/역$/, '')) return a.length >= b.length ? a : b; }
  return s;
}

var HB_CLOSINGS = [
  '이동 중에도 5분마다 현황을 새로 알려드릴게요.',
  '가시는 동안 바뀌는 상황은 제가 5분마다 챙겨서 알려드릴게요.',
  '편안히 다녀오세요. 5분마다 최신 정보로 다시 안내해 드릴게요.',
  '안전하게 다녀오세요. 달라지는 점이 있으면 5분 간격으로 알려드릴게요.'
];

function homeBrief(o) {
  o = o || {};
  var from = hbNmFix(o.from), to = hbNmFix(o.to);
  var hasRoute = !!to && to !== from;
  var hour = hbNum(o.hour, 12), cong = hbNum(o.cong, 0), hol = o.hol === true;
  var mins = hbNum(o.mins, 0);
  var wF = hbWx(o.wF), wT = hbWx(o.wT);
  var segs = Array.isArray(o.segs) ? o.segs.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return (x.from != null || x.to != null) ? Object.assign({}, x, { from: hbNmFix(x.from), to: hbNmFix(x.to) }) : x; }) : null;
  var peak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  var late = (hour >= 22 || hour < 5);
  var ps = [];
  var P = function (arr) { ps.push({ t: arr }); };

  // 혼잡 한마디(모순 없이 한 문장)
  function cgLine() {
    if (late) return '늦은 시간이라 막차 시간은 꼭 확인해 두세요.';
    if (cong >= 70) return peak ? '지금은 출퇴근 피크라 많이 붐벼요. 한 칸 안쪽으로 들어가시면 한결 나아요.' : '지금 꽤 혼잡해요. 여유를 두고 움직이세요.';
    if (cong >= 45) return peak ? '지금은 출퇴근 피크라 다소 붐벼요.' : '지금은 다소 붐비는 편이에요.';
    if (hol) return '주말이라 한산한 편이에요.';
    return peak ? '출퇴근 시간대지만 크게 붐비진 않아요.' : '지금은 여유로운 편이에요.';
  }
  // 날씨·준비물 문단(공통)
  function wxParas() {
    var out = [], w = [], prep = [];
    if (wF) w.push([{ b: from }, ' ', { b: wF.temp + '도' }, ' ' + wF.txt]);
    if (wT) w.push([{ b: to }, ' ', { b: wT.temp + '도' }, ' ' + wT.txt]);
    var maxRain = Math.max((wF && wF.rain) || 0, (wT && wT.rain) || 0);
    if (maxRain >= 60) prep.push('비 소식이 있어요. 우산 꼭 챙기세요.');
    else if (maxRain >= 40) prep.push('비가 올 수도 있어요. 우산 하나 챙기시면 좋아요.');
    var coldest = Math.min(wF ? wF.temp : 99, wT ? wT.temp : 99);
    var hottest = Math.max(wF ? wF.temp : -99, wT ? wT.temp : -99);
    if (coldest <= 2) prep.push('많이 추워요. 따뜻하게 입고 나오세요.');
    else if (coldest <= 8) prep.push('쌀쌀하니 겉옷 챙기세요.');
    else if (hottest >= 28) prep.push('더우니 물 한 병 챙기시면 좋아요.');
    if (wF && wT && Math.abs(wF.temp - wT.temp) >= 4) prep.push('두 곳 기온 차가 ' + Math.abs(wF.temp - wT.temp) + '도라 옷차림 참고하세요.');
    if (w.length) {
      var t = ['날씨는 '];
      w.forEach(function (x, i) { if (i) t.push(', '); x.forEach(function (y) { t.push(y); }); });
      t.push('이에요.' + (prep.length ? ' ' + prep.join(' ') : ''));
      out.push(t);
    } else if (prep.length) out.push([prep.join(' ')]);
    return out;
  }

  if (hasRoute && o.compact === true && o.metro !== true) {
    // 통합 카드용 짧은 브리핑(s217): 위 경로 카드가 이미 보여 주는 '어디서 어디로' 긴 문장은 되풀이하지 않고
    //   핵심 시각(출발·도착) → 첫 탑승·환승 한 줄 → 혼잡 → 날씨·준비물 → 마무리 순으로 말한다. 단계별 환승·정거장은 [세부경로 보기] 로 미룬다.
    var cs = segs || [], cld = -1;
    for (var ci = 0; ci < cs.length; ci++) { if (cs[ci] && cs[ci].type === 4) { cld = ci; break; } }
    var cx = Math.max(0, cs.length - 1), tot = mins > 0 ? [' 총 ', { b: mins + '분' }, ' 걸려요.'] : [];
    if (cld >= 0 && cs[cld].depClock && cs[cld].arrClock) {
      var cl = cs[cld], pk = [{ ln: cl.line }, ' ', { b: cl.depClock }, ' 출발, ', { b: cl.arrClock }, ' 도착이에요.'];
      if (cl.rideMin) pk.push(' 타는 시간은 약 ' + cl.rideMin + '분이에요.');
      P(pk.concat(tot));
    } else if (mins > 0) {
      var carr = hbNum(o.arrMs, NaN); if (!isFinite(carr) || !carr) carr = hbNum(o.nowMs, 0) + mins * 60000;
      var cline = [{ id: 'homeAiArr', t: ['도착은 ', { b: hbKstClock(carr) }, '경 예정이에요.'].concat(tot) }];
      if (o.dm) { cline.push(' '); cline.push({ id: 'homeAiDep', raw: String(o.dm) }); }
      P(cline);
    } else P(['소요시간은 경로가 정해지면 알려드릴게요.']);
    if (cs.length) {
      var c0 = cs[0], tp = [{ stn: [c0.from, c0.line] }, '에서 '];
      if (c0.type === 2) { tp.push({ ln: c0.line + '번' }); tp.push(' 버스를 타고 출발하세요.'); } else { tp.push({ ln: c0.line || '열차' }); tp.push(' 타고 출발하세요.'); }
      if (cx >= 2) tp.push(' 환승이 ' + cx + '번이라 안내 방송을 놓치지 마세요.');
      else if (cx === 1) tp.push(' 환승은 한 번이에요.');
      if (cld >= 0) tp.push(' 승차권과 출발 시각은 한 번 더 확인해 주세요.');
      if (cx >= 1) tp.push(' 환승 순서와 정거장은 [세부경로 보기]에서 볼 수 있어요.');
      P(tp);
    }
    P([cgLine()]);
    wxParas().forEach(function (x) { P(x); });
    var cr = Number(o.rnd); if (!isFinite(cr) || cr < 0 || cr >= 1) cr = 0;
    ps.push({ sub: [HB_CLOSINGS[Math.floor(cr * HB_CLOSINGS.length)]] });
    return { v: HB_V, paras: ps };
  }
  if (hasRoute) {
    // 1) 핵심: 소요시간 + 환승 안내
    var head = [{ b: from }, '에서 ', { b: to }, '까지는 '];
    if (mins > 0) { head.push('약 '); head.push({ b: mins + '분' }); head.push(' 걸려요.'); } else head.push('이렇게 가시면 돼요.');
    var ldIdx = -1;
    if (segs) for (var li = 0; li < segs.length; li++) { if (segs[li] && segs[li].type === 4) { ldIdx = li; break; } }
    var t = [];
    if (ldIdx >= 0) {
      // 장거리(열차·고속버스·시외버스): 몇 시에 출발해 몇 시에 도착하는지까지 짚어 준다.
      var ld = segs[ldIdx], acc = segs.slice(0, ldIdx), egr = segs.slice(ldIdx + 1);
      var parts = [];
      if (acc.length) {
        var af = acc[0], al = acc[acc.length - 1];
        parts.push([{ stn: [af.from, af.line] }, '에서 ', { stn: [al.to, al.line] }, '까지 먼저 이동하시고']);
      }
      var p2 = [{ stn: [ld.from, ld.line] }, '에서 ', { ln: ld.line }, '를 타고 ', { stn: [ld.to, ld.line] }, '까지 가시면 돼요. '];
      if (ld.depClock && ld.arrClock) { p2.push({ b: ld.depClock }); p2.push(' 출발, '); p2.push({ b: ld.arrClock }); p2.push('경 도착이에요'); }
      else { p2.push('약 '); p2.push({ b: ld.min + '분' }); p2.push(' 걸려요'); }
      if (ld.rideMin) p2.push(' (타고 가는 시간은 약 ' + ld.rideMin + '분)');
      p2.push('.');
      parts.push(p2);
      parts.forEach(function (pp, i) { if (i) t.push(', '); pp.forEach(function (y) { t.push(y); }); });
      if (egr.length) {
        t.push(' 도착하시면 ');
        egr.forEach(function (sg, i) { var nl = sg.line || '다음 노선'; if (i) t.push(', '); t.push({ stn: [sg.from, sg.line] }); t.push('에서 '); t.push({ ln: nl }); t.push(hbJosRo(nl)); });
        t.push(' 갈아타고 목적지까지 가시면 돼요.');
      } else t.push(' 내리신 곳이 목적지와 가까워서 따로 환승은 없어요.');
      t.push(' 승차권과 출발 시각은 한 번 더 확인해 주세요.');
    } else if (segs && segs.length > 1) {
      if (segs[0] && segs[0].type === 2) {
        t.push({ stn: [segs[0].from, segs[0].line] }); t.push('에서 '); t.push({ ln: segs[0].line + '번' }); t.push(' 버스를 타고 '); t.push({ stn: [segs[0].to, segs[0].line] }); t.push('까지 가신 다음, ');
      }
      t.push('가는 길에 ');
      for (var i = 1; i < segs.length; i++) { var nl2 = segs[i].line || '다음 노선'; if (i > 1) t.push(', '); t.push({ stn: [segs[i].from, segs[i].line] }); t.push('에서 '); t.push({ ln: nl2 }); t.push(hbJosRo(nl2)); }
      var nx = segs.length - 1;
      t.push(' 갈아타시면 돼요.' + (nx >= 2 ? ' 환승이 ' + nx + '번이라 안내 방송 놓치지 마세요.' : ''));
    } else if (segs && segs.length === 1) {
      var l1 = segs[0].line || '한 노선';
      t.push('환승 없이 '); t.push({ ln: l1 }); t.push(hbJosRo(segs[0].line) + ' 한 번에 가실 수 있어요.');
    } else t.push('환승 정보는 경로가 확정되면 구간별로 알려드릴게요.');
    P(head.concat([' ']).concat(t));

    // 2) 출발·도착 시각
    var info = o.nt && typeof o.nt === 'object' ? o.nt : null;
    if (o.metro === true) {
      // 노선도 경로: 위치추적 없이 현재시각 기준 열차 유무만 안내(소요시간은 위 첫 문장에 있다)
      var mm = mins > 0 ? mins : 0;
      if (info && info.found && info.depMin != null) {
        var dR = Math.round(info.depMin) % 1440, aR = Math.round(info.arrMin) % 1440;     // 분 반올림으로 '13:60' 방지
        var depStr = hbPad(Math.floor(dR / 60)) + ':' + hbPad(dR % 60), arrStr = hbPad(Math.floor(aR / 60)) + ':' + hbPad(aR % 60);
        // 위 경로 카드 타임라인에 실제 시각이 있으면 그쪽을 따른다(숫자 불일치 방지).
        if (o.tl && o.tl.dep && o.tl.arr) { depStr = String(o.tl.dep); arrStr = String(o.tl.arr); }
        P(['지금 출발하시면 다음 열차는 ', { b: depStr }, ', 도착은 ', { b: arrStr }, '경이에요.']);
      } else if (info && info.found === false) {
        var f = ['지금은 ', { b: '운행 중인 열차가 없어요' }, ' (막차 이후).'];
        if (info.firstMin != null) {
          var fh = Math.floor(info.firstMin / 60), fm = Math.round(info.firstMin % 60);
          if (fm >= 60) { fm -= 60; fh = (fh + 1) % 24; }
          var nowM = hbNum(o.nowMin, 0);
          var wait = info.firstMin - nowM; if (wait < 0) wait += 1440;
          var wTxt = (wait >= 60) ? (Math.floor(wait / 60) + '시간 ' + (wait % 60) + '분 후') : (Math.round(wait) + '분 후');
          f.push(' 첫차는 '); f.push({ b: hbPad(fh) + ':' + hbPad(fm) }); f.push('(' + wTxt + ')에 있어요.');
          if (mm > 0) {
            var arrF = info.firstMin + mm, ah2 = Math.floor((arrF % 1440) / 60), am2 = Math.round(arrF % 60);
            if (am2 >= 60) { am2 -= 60; ah2 = (ah2 + 1) % 24; }
            f.push(' 첫차를 타시면 '); f.push({ b: hbPad(ah2) + ':' + hbPad(am2) }); f.push('경 도착해요.');
          }
        } else f.push(' 경로와 소요시간만 참고해 주세요.');
        P(f);
      }
    } else if (mins > 0) {
      // (실시간 추적 모드) 도착 예정 시각 — 남은시간 갱신에 따라 실시간 업데이트(#homeAiArr 는 별도 갱신기가 같은 문장 틀로 덮어쓴다)
      var arrMs = hbNum(o.arrMs, NaN); if (!isFinite(arrMs) || !arrMs) arrMs = hbNum(o.nowMs, 0) + mins * 60000;
      var line = [{ id: 'homeAiArr', t: ['도착은 ', { b: hbKstClock(arrMs) }, '경 예정이에요.'] }];
      if (o.dm) { line.push(' '); line.push({ id: 'homeAiDep', raw: String(o.dm) }); }
      P(line);
    }
    // 3) 혼잡 한마디 → 4) 날씨·준비물
    P([cgLine()]);
    wxParas().forEach(function (x) { P(x); });
  } else {
    // 목적지 미설정: 현위치 상태 안내(비서 톤)
    if (wF) P(['지금 ', { b: from }, ' 일대는 ', { b: wF.temp + '도' }, ', ' + wF.txt + '이에요.']);
    var prep2 = [], mr = (wF && wF.rain) || 0;
    if (mr >= 60) prep2.push('비 소식이 있어요. 우산 꼭 챙기세요.');
    else if (mr >= 40) prep2.push('비가 올 수도 있어요. 우산 하나 챙기시면 좋아요.');
    if (wF) { if (wF.temp <= 2) prep2.push('많이 추워요. 따뜻하게 입으세요.'); else if (wF.temp <= 8) prep2.push('쌀쌀하니 겉옷 챙기세요.'); else if (wF.temp >= 28) prep2.push('더우니 물 한 병 챙기시면 좋아요.'); }
    if (prep2.length) P([prep2.join(' ')]);
    var timeNote = late ? '늦은 시간이라 배차 간격이 길어질 수 있어요. 여유 있게 움직이세요.' : hol ? '오늘은 주말·공휴일 시간표로 운행해요.' : peak ? '지금은 출퇴근 혼잡 시간대예요. 이용에 참고하세요.' : '';
    if (timeNote) P([timeNote]);
    P([{ b: from }, ' 일대 교통은 ' + (cong >= 70 ? (peak && cong >= 45 ? '피크라 매우 붐벼요' : '꽤 혼잡해요') : cong >= 45 ? (peak ? '피크라 다소 붐벼요' : '다소 붐비는 편이에요') : '원활해요') + '. 목적지를 정해 주시면 소요시간과 환승 경로까지 챙겨 드릴게요.']);
  }

  // 6) 마무리 — 같은 정보를 전달하는 여러 표현 중 하나(같은 난수면 같은 문구)
  if (o.metro === true) ps.push({ sub: ['노선도에서 고르신 경로 미리보기예요. 출발하시면 위치에 맞춰 안내를 이어갈게요.'] });
  else {
    var r = Number(o.rnd); if (!isFinite(r) || r < 0 || r >= 1) r = 0;
    ps.push({ sub: [HB_CLOSINGS[Math.floor(r * HB_CLOSINGS.length)]] });
  }
  return { v: HB_V, paras: ps };
}
function hbWx(w) {
  if (!w || typeof w !== 'object') return null;
  var temp = Number(w.temp); if (!isFinite(temp)) return null;
  return { temp: temp, txt: String(w.txt == null ? '' : w.txt), rain: hbNum(w.rain, 0) };
}

// ── Worker 연결부 — POST /home-brief (handleFetch 에 길을 둔다) ──
function handleHomeBrief(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (raw) {
    if (raw.length > 30000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
    var body;
    try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
    var out;
    try { out = homeBrief(body); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
    out.ok = true;
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { homeBrief: homeBrief, hbJosRo: hbJosRo, handleHomeBrief: handleHomeBrief, HB_V: HB_V };
