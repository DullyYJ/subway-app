'use strict';
// 공개 방침 페이지 — GET /legal/privacy (?doc=privacy | terms | open). 앱 안 '약관 및 정책'(SETTINGS_POL, engine/settings.js)의 글을 그대로 웹 문서로 보여 준다.
//   구글 플레이 '개인정보처리방침 주소' 칸과 위치 권한 선언에 넣는 주소다. 글은 한 곳(SETTINGS_POL)에만 있고 여기서는 그리지만 한다.
var LEGAL_DOCS = { privacy: 'polp', terms: 'poll', open: 'polo' };
function legalEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function legalHtml(doc, pol, updated) {
  var key = LEGAL_DOCS[doc] ? doc : 'privacy';
  var d = pol[LEGAL_DOCS[key]];
  var body = d.paras.map(function (q) {
    var h = q.parts.map(function (p) { var t = legalEsc(p[0]).replace(/\n/g, '<br>'); return p[1] ? '<b>' + t + '</b>' : t; }).join('');
    return '<p' + (q.small ? ' class="s"' : '') + '>' + h + '</p>';
  }).join('\n');
  var nav = [['privacy', '개인정보처리방침'], ['terms', '위치기반서비스 이용약관'], ['open', '데이터 출처 및 고지']].map(function (x) {
    return x[0] === key ? '<b>' + x[1] + '</b>' : '<a href="?doc=' + x[0] + '">' + x[1] + '</a>';
  }).join(' · ');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + legalEsc(d.title) + ' · 길동무</title>' +
    '<style>:root{color-scheme:light dark}body{margin:0;font:15px/1.8 -apple-system,"Noto Sans KR",sans-serif;background:#fff;color:#1b1b1f}' +
    '@media(prefers-color-scheme:dark){body{background:#121214;color:#e6e6ea}a{color:#8ab4ff}}' +
    'main{max-width:720px;margin:0 auto;padding:20px 16px 48px}h1{font-size:22px;margin:8px 0 4px}.m{color:#777;font-size:13px;margin:0 0 18px}' +
    'p{margin:0 0 16px}p.s{font-size:13px;color:#777}nav{font-size:13px;margin:0 0 18px}</style></head><body><main>' +
    '<h1>' + legalEsc(d.title) + '</h1>' +
    '<p class="m">길동무 (com.dullyyj.subway) · 운영자 원윤재 · 시행일 · 최종 개정일 ' + legalEsc(updated) + '</p>' +
    '<nav>' + nav + '</nav>' + body + '</main></body></html>';
}
if (typeof module !== 'undefined' && module.exports) module.exports = { legalHtml: legalHtml, LEGAL_DOCS: LEGAL_DOCS };
