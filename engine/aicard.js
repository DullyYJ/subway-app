// 길동무 — 홈 'AI 승무원' 카드 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-20 (s77)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   카드 제목(출발 → 도착 · 남은시간 / 예상 · 시각) · 미리보기 문장(날짜·소요·혼잡 전망) · 브리핑 문장(engine/home-brief.js) ·
//   굵은 글 색 · 노선 색 배지(노선 이름 → 글자색 표) · 빈/생성 중/준비 중 안내 · 새로고침 단추 상태 · 다음 갱신 마감 시각을 전부 엔진이 정한다.
//   앱(웹)은 사실만 보낸다: 출발/도착 이름 · 기준 시각(ms) · 혼잡도 · 날씨 · 경로 구간 · 다음 열차 · 남은 분 · 도착 예정(ms) 같은 원자료.
//   앱(기기)은 받은 화면을 그린다. 카운트다운은 엔진이 준 마감 시각(to, 기기 시계 ms)까지 남은 시간을 기기가 매초 m:ss 로 그린다.
//
// 입력  aiScreen({ cap }, f)   cap 14 이상
//   f = { mode:'empty'|'loading'|'prep'|'route'|'brief'|'preview', now, tz(분), busy, nextAt(ms, 0 이면 없음),
//         tk:'brief'|'preview'|''  (제목을 어떤 틀로 만들지; 비면 기본 제목),
//         from, to, base(기준 시각 ms), hour, cong, hol, mins, dist(미터, 모르면 0), rem(남은 분, 0 이면 없음), metro,
//         wF, wT, segs, nt, tl, nowMin, arrMs, dm, rnd }          (뒤쪽은 engine/home-brief.js 의 입력과 같다)
// 출력  { ok, v:1, screen:'ai', cover:'tab', bg:'card', head:[aih, 글…], body:[{t:'spacer',h:0}], info:{}, rev }

var AI_CAP = 14;
var AI_BLUE = '#2f7cf6';
var AI_ICON = 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z';
var AI_MODES = { empty: 1, loading: 1, prep: 1, route: 1, brief: 1, preview: 1 };
var AI_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
var AI_PASTELS = [
  { bg: '#d9e8ff', fg: '#1b4b8a' }, { bg: '#d7f2e3', fg: '#1c7a4d' }, { bg: '#ffe1e6', fg: '#b23a4d' },
  { bg: '#fff0d1', fg: '#9a6b12' }, { bg: '#e7ddff', fg: '#5a3aa8' }, { bg: '#d5f2f5', fg: '#137580' },
  { bg: '#ffe6cf', fg: '#a85d1e' }, { bg: '#e3f0cf', fg: '#5a7a1e' }, { bg: '#ffd9f0', fg: '#a83a86' },
  { bg: '#f0e6d0', fg: '#8a6a2e' }, { bg: '#e0e4ea', fg: '#455066' }
];

function aiNum(v, d) { v = Number(v); return isFinite(v) ? v : d; }
function aiStr(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }
function aiPad(n) { return (n < 10 ? '0' : '') + n; }

// 노선 이름 → 글자색 (웹 _lineColorKey / _lineColor 와 같은 표)
function aiLineKey(line) {
  var s = String(line || '');
  if (/신분당/.test(s)) return '#b23025';
  if (/수인|분당/.test(s)) return '#a5731a';
  if (/경의|중앙/.test(s)) return '#1a7a63';
  if (/경춘/.test(s)) return '#1c8a5a';
  if (/공항/.test(s)) return '#1a6a95';
  if (/인천\s*1/.test(s)) return '#137a95';
  if (/인천\s*2/.test(s)) return '#c07a1a';
  if (/1호선/.test(s)) return '#0d3b7a';
  if (/2호선/.test(s)) return '#1a7a2e';
  if (/3호선/.test(s)) return '#b5551a';
  if (/4호선/.test(s)) return '#1560c4';
  if (/5호선/.test(s)) return '#5b2e9e';
  if (/6호선/.test(s)) return '#8a4b1e';
  if (/7호선/.test(s)) return '#5a6a12';
  if (/8호선/.test(s)) return '#b03378';
  if (/9호선/.test(s)) return '#8a6a2e';
  return null;
}
function aiLineColor(line) {
  var nm = String(line || '노선'), k = aiLineKey(nm);
  if (k) return k;
  var h = 0;
  for (var i = 0; i < nm.length; i++) h = ((h * 31) + nm.charCodeAt(i)) >>> 0;
  return AI_PASTELS[h % AI_PASTELS.length].fg;
}

// 기기 시각(tz 분) 기준 날짜 조각
function aiLocal(ms, tz) {
  var d = new Date(Number(ms) + Number(tz) * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
// 웹 toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) 와 같은 글: '오후 02:35'
function aiClock(ms, tz) {
  var t = aiLocal(ms, tz);
  return (t.h < 12 ? '오전 ' : '오후 ') + aiPad(t.h % 12 === 0 ? 12 : t.h % 12) + ':' + aiPad(t.mi);
}

// 조각 → { s, hl:[[시작,끝,색]] }  (조각 = 글자 | {b} | {stn:[이름,노선]} | {ln:노선} | {id, t|raw})
function aiRuns(toks) {
  var s = '', hl = [];
  function add(txt, col) {
    txt = String(txt == null ? '' : txt);
    if (!txt) return;
    var a = s.length; s += txt;
    if (col) hl.push([a, s.length, col]);
  }
  (function walk(arr) {
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      if (typeof x === 'string') add(x, '');
      else if (x && typeof x === 'object') {
        if (x.b != null) add(x.b, AI_BLUE);
        else if (x.stn) add(x.stn[0], aiLineColor(x.stn[1]));
        else if (x.ln != null) add(x.ln === '' ? '노선' : x.ln, aiLineColor(x.ln));
        else if (x.id === 'homeAiArr' || x.id === 'homeAiDep') { if (x.raw != null) add(x.raw, ''); else walk(Array.isArray(x.t) ? x.t : []); }
      }
    }
  })(toks);
  if (s.length > 1900) { s = s.slice(0, 1899) + '…'; hl = hl.filter(function (h) { return h[1] <= s.length; }); }
  if (hl.length > 48) hl = hl.slice(0, 48);
  return { s: s, hl: hl };
}

function aiPara(toks, last, sub) {
  var r = aiRuns(toks);
  var n = { t: 'text', pad: [0, 0, 0, last ? 0 : 7], s: r.s, size: sub ? 12 : 14, lh: sub ? 1.75 : 1.5, color: sub ? 'sub' : 'text' };
  if (r.hl.length) n.hl = r.hl;
  return n;
}

function aiTitle(f, tz) {
  var from = aiStr(f.from), to = aiStr(f.to), hasRoute = !!to && to !== from;
  var base = aiNum(f.base, aiNum(f.now, 0)), timeStr = aiClock(base, tz);
  if (f.fz === true) return f.tk === 'preview' ? 'AI 승무원 브리핑 · 예상 ' + timeStr : 'AI 승무원 브리핑';      // 경로 통합 카드(s217): 출발·도착 이름은 위 머리줄에 이미 있다
  if (f.tk === 'preview') return (hasRoute ? from + ' → ' + to : from) + ' · 예상 · ' + timeStr;
  if (f.tk === 'brief') {
    var rem = aiNum(f.rem, 0);
    var remT = (hasRoute && rem > 0) ? ((f.metro === true ? '소요시간: ' : '남은시간: ') + rem + '분') : timeStr;
    return hasRoute ? from + ' → ' + to + ' · ' + remT : from + ' · ' + timeStr + ' 기준';
  }
  return 'AI 승무원 브리핑';
}

// 소요 분: 경로에서 받은 값 > 좌표 거리로 어림(웹과 같은 식)
function aiMins(f, hasRoute) {
  var mins = aiNum(f.mins, 0);
  if (mins <= 0 && hasRoute) {
    var dist = aiNum(f.dist, 0);
    if (dist > 0) mins = Math.max(5, Math.round(dist / 1000 * 2.5) + 5);
  }
  return mins > 0 ? mins : 0;
}

function aiPreviewParas(f, tz) {
  var from = aiStr(f.from), to = aiStr(f.to), hasRoute = !!to && to !== from;
  var base = aiNum(f.base, aiNum(f.now, 0)), t = aiLocal(base, tz);
  var hour = isFinite(Number(f.hour)) && f.hour !== null && f.hour !== '' ? Number(f.hour) : t.h;
  var cong = aiNum(f.cong, 0), hol = f.hol === true;
  var peak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  var congTxt = cong >= 70 ? '매우 혼잡' : cong >= 45 ? '다소 혼잡' : '여유로운 편';
  var dateTxt = t.mo + '월 ' + t.d + '일(' + AI_DAYS[t.dow] + ') ' + (t.h < 12 ? '오전 ' : '오후 ') + ((t.h % 12) || 12) + '시' + (t.mi ? ' ' + t.mi + '분' : '');
  var tmin = aiMins(f, hasRoute);
  var p1 = hasRoute
    ? [{ b: dateTxt }, ' 기준, ', { b: from }, '에서 ', { b: to }, '까지는 약 ', { b: (tmin || '?') + '분' }, ' 걸릴 것으로 보입니다.']
    : [{ b: dateTxt }, ' 기준으로 ', { b: from }, ' 일대를 안내해 드리겠습니다.'];
  var p2;
  if (peak && cong >= 45) p2 = ['그 시간대는 ' + (hol ? '주말이지만 ' : '') + '출퇴근 피크라 ', { b: congTxt }, ' 수준의 혼잡이 예상됩니다. 여유 있게 출발하시길 권합니다.'];
  else if (peak) p2 = ['출퇴근 시간대이지만 ', { b: congTxt }, ' 수준으로 비교적 여유로울 전망입니다.'];
  else if (hour >= 22 || hour < 6) p2 = ['심야 시간대라 한산하겠지만, ', { b: '막차 시간' }, '을 꼭 확인하세요.'];
  else if (hol) p2 = ['주말·공휴일이라 평일보다 여유로울 전망입니다. 혼잡도는 ', { b: congTxt }, ' 수준으로 예상됩니다.'];
  else p2 = ['해당 시간대 혼잡도는 ', { b: congTxt }, ' 수준으로 예상됩니다. 무난하게 이동하실 수 있습니다.'];
  return [{ t: p1 }, { t: p2 }, { sub: ['설정하신 시각 기준 예측이에요. 실제 상황과 다를 수 있습니다.'] }];
}

function aiBriefParas(f, tz) {
  var HB = (typeof homeBrief === 'function') ? homeBrief : null;
  if (!HB) { try { if (typeof require === 'function') HB = require('./home-brief').homeBrief; } catch (e) {} }
  if (!HB) return null;
  var from = aiStr(f.from), to = aiStr(f.to), hasRoute = !!to && to !== from;
  var now = aiNum(f.now, 0), base = aiNum(f.base, now);
  var hour = (f.hour === null || f.hour === undefined || f.hour === '' || !isFinite(Number(f.hour))) ? aiLocal(base, tz).h : Number(f.hour);
  var o = {
    from: from, to: to, hour: hour, cong: aiNum(f.cong, 0), hol: f.hol === true, mins: aiMins(f, hasRoute),
    wF: f.wF || null, wT: f.wT || null, segs: Array.isArray(f.segs) ? f.segs.slice(0, 20) : null, metro: f.metro === true,
    nt: f.nt || null, tl: f.tl || null, nowMin: aiNum(f.nowMin, 0), nowMs: now, arrMs: aiNum(f.arrMs, 0), dm: aiStr(f.dm, 200), rnd: aiNum(f.rnd, 0), compact: f.cp === true
  };
  var r = HB(o);
  return r && r.paras ? r.paras : null;
}

function aiEmptyNodes(mode) {
  if (mode === 'empty') {
    return [
      { t: 'text', pad: [8, 18, 8, 0], s: '현재 위치와 시간을 기준으로', size: 13, lh: 1.7, color: 'sub', align: 'center' },
      { t: 'text', pad: [8, 0, 8, 18], s: '예상 상황을 분석해드릴게요.', size: 13, lh: 1.7, color: 'sub', align: 'center' }
    ];
  }
  if (mode === 'loading') return [{ t: 'text', pad: [8, 18, 8, 18], s: '브리핑 생성 중...', size: 13, lh: 1.7, color: 'sub', align: 'center' }];
  if (mode === 'route') return [{ t: 'text', pad: [0, 0, 0, 0], s: '경로를 확인하고 있습니다...', size: 14, lh: 1.5, color: 'sub' }];
  return [{ t: 'text', pad: [0, 0, 0, 0], s: '브리핑 준비 중...', size: 14, lh: 1.5, color: 'sub' }];       // prep
}

function aiScreen(cfg, f) {
  var cap = aiNum(cfg && cfg.cap, 0);
  if (cap < AI_CAP) return { ok: false, error: 'cap' };
  if (!f || typeof f !== 'object' || !isFinite(Number(f.now)) || !(Number(f.now) > 0)) return { ok: false, error: 'now' };
  if (!AI_MODES[f.mode]) return { ok: false, error: 'mode' };
  var tz = aiNum(f.tz, 540);
  var head = [];
  var title = aiTitle(f, tz), busy = f.busy === true, nextAt = aiNum(f.nextAt, 0);
  var h = { t: 'aih', pad: [0, 0, 0, 10], s: title, icon: AI_ICON, done: '갱신 중...' };
  if (nextAt > 0) h.to = Math.round(nextAt);
  if (busy) h.bd = true; else h.act = { a: 'call', v: 'ai.refresh' };
  head.push(h);
  var mode = f.mode;
  if (mode === 'brief' || mode === 'preview') {
    var paras = mode === 'preview' ? aiPreviewParas(f, tz) : aiBriefParas(f, tz);
    if (!paras || !paras.length) { head = head.concat(aiEmptyNodes('prep')); mode = 'prep'; }
    else {
      for (var i = 0; i < paras.length; i++) {
        var p = paras[i], last = i === paras.length - 1;
        head.push(Array.isArray(p.sub) ? aiPara(p.sub, last, true) : aiPara(p.t || [], last, false));
      }
    }
  } else head = head.concat(aiEmptyNodes(mode));
  var rev = 'a1:' + aiHash(JSON.stringify(head));
  return { ok: true, v: 1, screen: 'ai', cover: 'tab', bg: 'card', head: head, body: [{ t: 'spacer', h: 0 }], info: { mode: mode }, rev: rev };
}

function aiHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

if (typeof module !== 'undefined' && module.exports) module.exports = { aiScreen: aiScreen, aiLineColor: aiLineColor, aiClock: aiClock, AI_CAP: AI_CAP };
