/**
 * \uae38\ub3d9\ubb34 \ubc84\uc2a4 \ud504\ub85d\uc2dc \uc6cc\ucee4
 *  - \uacf5\uacf5\ub370\uc774\ud130 API\uc758 serviceKey\ub97c \uc11c\ubc84\uc5d0\uc11c \uc8fc\uc785 (\uc571\uc5d0 \ud0a4\uac00 \ub178\ucd9c\ub418\uc9c0 \uc54a\uc74c)
 *  - TAGO / \uc11c\uc6b8 TOPIS / \uacbd\uae30 GBIS \ub3c4\uba54\uc778\ub9cc \ud5c8\uc6a9
 *  - XML\u00b7JSON \uc751\ub2f5\uc744 \uadf8\ub300\ub85c \uc804\ub2ec (\uc571\uc774 text\ub85c \ubc1b\uc544 \ud30c\uc2f1)
 *
 * \uc0ac\uc6a9\ubc95:  GET /tago?url=<\uc778\ucf54\ub529\ub41c \uc6d0\ubcf8 API URL>
 * \uc608\uc2dc:    /tago?url=http%3A%2F%2Fws.bus.go.kr%2Fapi%2Frest%2Farrive%2FgetArrInfoByUid%3FarsId%3D02123
 */

const ALLOWED_HOSTS = [
  'apis.data.go.kr',    // TAGO(\uad6d\ud1a0\ubd80), \uacbd\uae30 GBIS, \uc18c\uc0c1\uacf5\uc778 \uc0c1\uac00\uc815\ubcf4
  'api.odcloud.kr',     // \uc77c\ubd80 data.go.kr \uc2e0\uaddc API
  'ws.bus.go.kr',       // \uc11c\uc6b8 TOPIS (\ubc84\uc2a4\ub3c4\ucc29\u00b7\uc815\ub958\uc18c)
  'openapi.gbis.go.kr', // \uacbd\uae30 GBIS \uc608\ube44 \uc5d4\ub4dc\ud3ec\uc778\ud2b8
  'apis.data.go.kr.'    // \ub05d\uc5d0 \uc810\uc774 \ubd99\ub294 \ubcc0\ud615 \ubc29\uc5b4
];

// -- \ud638\ucd9c\ub7c9 \uc9d1\uacc4 (2026-10-06) --------------------------------------------------
// \uc0c1\uc704(\uacf5\uacf5\ub370\uc774\ud130\u00b7\uc11c\uc6b8\uc2dc\u00b7\uce74\uce74\uc624) API \ub97c \uc2e4\uc81c\ub85c \ubd80\ub978 \ud69f\uc218\ub97c D1 live_usage(day,k,n) \uc5d0 gl.* \ud0a4\ub85c \ubaa8\uc740\ub2e4.
// \uc11c\ubc84 \uba54\ubaa8\ub9ac\uc5d0 \ubaa8\uc558\ub2e4\uac00 \uc57d 1\ubd84 \ub2e8\uc704\ub85c \uae30\ub85d(\uadfc\uc0ac\uce58). \ud654\uba74: https://gildongmu-bus.phg0643.workers.dev/usage
var USAGE = { n: {}, last: 0, ready: false };
var _glCtx = null;
var _glEnv = null;
function usageAdd(k) { USAGE.n[k] = (USAGE.n[k] || 0) + 1; }
function usageDay(ms) {
  return new Date((ms || Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function usageKeyOfTago(u) {
  const h = String(u.hostname || '').toLowerCase().replace(/[.]$/, '');
  const p = String(u.pathname || '');
  if (h === 'ws.bus.go.kr') return 'gl.seoul-bus';
  if (h === 'apis.data.go.kr') {
    if (p.indexOf('/6410000/') >= 0) return 'gl.gbis';
    if (p.indexOf('ArvlInfo') >= 0) return 'gl.tago.arr';
    const seg = p.split('/').filter(function (x) { return /Info$/.test(x); })[0];
    if (seg) return 'gl.ld.' + seg;
    return 'gl.datago.other';
  }
  if (h === 'api.odcloud.kr') return 'gl.odcloud';
  if (h === 'openapi.gbis.go.kr') return 'gl.gbis-alt';
  return 'gl.other';
}
function usageFlush(env, force) {
  try {
    env = env || _glEnv;
    if (!env || !env.DB) return;
    const now = Date.now();
    if (!force && now - USAGE.last < 60000) return;
    const keys = Object.keys(USAGE.n);
    if (!keys.length) return;
    USAGE.last = now;
    const snap = USAGE.n;
    USAGE.n = {};
    const day = usageDay(now);
    const run = (async () => {
      try {
        if (!USAGE.ready) {
          await env.DB.prepare('CREATE TABLE IF NOT EXISTS live_usage (day TEXT, k TEXT, n INTEGER, PRIMARY KEY (day, k))').run();
          USAGE.ready = true;
        }
        await env.DB.batch(keys.map((k) => env.DB.prepare('INSERT INTO live_usage (day, k, n) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET n = n + excluded.n').bind(day, k, snap[k])));
      } catch (e) {
        for (const k of keys) USAGE.n[k] = (USAGE.n[k] || 0) + snap[k];
      }
    })();
    if (_glCtx && _glCtx.waitUntil) _glCtx.waitUntil(run);
  } catch (e) { /* \uc9d1\uacc4 \uc2e4\ud328\ub294 \ubcf8 \uae30\ub2a5\uc5d0 \uc601\ud5a5 \uc5c6\uc74c */ }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function hostAllowed(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.some(a => h === a.replace(/\.$/, ''));
}


/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
 * \ud83d\udcf0 \ub274\uc2a4 \uc218\uc9d1\u00b7\uc81c\uacf5
 *   \uc65c \uc11c\ubc84\uc5d0\uc11c \ud558\ub098:
 *     \uc571\uc774 \uae30\uae30\ub9c8\ub2e4 70\uac1c \ud53c\ub4dc\ub97c CORS \ud504\ub85d\uc2dc\ub85c \uae01\uc73c\uba74 \ub290\ub9ac\uace0 \uc790\uc8fc \uc2e4\ud328\ud55c\ub2e4.
 *     \uc11c\ubc84\uac00 \uc815\uae30\uc801\uc73c\ub85c \ud55c \ubc88 \ubaa8\uc544 D1\uc5d0 \ub123\uc5b4\ub450\uba74 \uc571\uc740 \ud55c \ubc88\ub9cc \ubc1b\uc544\uac00\uba74 \ub41c\ub2e4.
 *   \uc911\ubcf5 \ubc29\uc9c0: link \ub97c PRIMARY KEY \ub85c \ub450\uace0 INSERT OR IGNORE
 *   \uc790\ub3d9 \uc0ad\uc81c: \ub9e4\uc77c \uc0c8\ubcbd, \ubcf4\uad00 \uae30\uac04\uc774 \uc9c0\ub09c \uae30\uc0ac \uc81c\uac70
 * \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

const NEWS_FEEDS = {
  '\uc99d\uc2dc': [
    'https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC%20%EC%BD%94%EC%8A%A4%EB%8B%A5%20%EC%A6%9D%EC%8B%9C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A3%BC%EC%8B%9D%EC%8B%9C%EC%9E%A5%20%EC%99%B8%EA%B5%AD%EC%9D%B8%20%EC%88%9C%EB%A7%A4%EC%88%98%20%EA%B3%B5%EB%AA%A8%EC%A3%BC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%89%B4%EC%9A%95%EC%A6%9D%EC%8B%9C%20%EB%82%98%EC%8A%A4%EB%8B%A5%20%EB%8B%A4%EC%9A%B0%EC%A7%80%EC%88%98+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%AF%B8%EA%B5%AD%EC%A6%9D%EC%8B%9C%20%EC%9B%94%EA%B0%80%20S%26P500+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A6%9D%EA%B6%8C%EC%82%AC%20%EB%AA%A9%ED%91%9C%EC%A3%BC%EA%B0%80%20%EC%8B%A4%EC%A0%81%EB%B0%9C%ED%91%9C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B0%B0%EB%8B%B9%20%EC%9E%90%EC%82%AC%EC%A3%BC%20%EC%86%8C%EA%B0%81+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%83%81%EC%9E%A5%EA%B8%B0%EC%97%85%20%EC%9D%B8%EC%88%98%ED%95%A9%EB%B3%91+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A6%9D%EC%8B%9C%20%EC%A0%84%EB%A7%9D%20%EB%A6%AC%ED%8F%AC%ED%8A%B8+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B0%9C%EC%9D%B8%20%EA%B8%B0%EA%B4%80%20%EB%A7%A4%EB%A7%A4%EB%8F%99%ED%96%A5+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B9%84%ED%8A%B8%EC%BD%94%EC%9D%B8%20%EA%B0%80%EC%83%81%EC%9E%90%EC%82%B0%20%EC%8B%9C%EC%84%B8+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ],
  '\uacbd\uc81c': [
    'https://news.google.com/rss/search?q=%ED%99%98%EC%9C%A8%20%EC%9B%90%EB%8B%AC%EB%9F%AC%20%EA%B8%B0%EC%A4%80%EA%B8%88%EB%A6%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%AC%BC%EA%B0%80%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%AC%BC%EA%B0%80%20%EC%9D%B8%ED%94%8C%EB%A0%88%EC%9D%B4%EC%85%98+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B6%80%EB%8F%99%EC%82%B0%20%EC%95%84%ED%8C%8C%ED%8A%B8%20%EC%A0%84%EC%84%B8%20%EB%B6%84%EC%96%91+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%88%98%EC%B6%9C%20%EB%AC%B4%EC%97%AD%EC%88%98%EC%A7%80%20%EA%B2%BD%EC%83%81%EC%88%98%EC%A7%80+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B3%A0%EC%9A%A9%20%EC%B7%A8%EC%97%85%EC%9E%90%20%EC%8B%A4%EC%97%85%EB%A5%A0%20%EC%9E%84%EA%B8%88+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%86%8C%EB%B9%84%20%EB%82%B4%EC%88%98%20%EA%B2%BD%EA%B8%B0+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B8%88%EC%9C%B5%EA%B6%8C%20%EB%8C%80%EC%B6%9C%20%EA%B8%88%EB%A6%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%84%B8%EA%B8%88%20%EC%97%B0%EB%A7%90%EC%A0%95%EC%82%B0%20%EC%A0%95%EC%B1%85+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%9B%90%EC%9E%90%EC%9E%AC%20%EC%9C%A0%EA%B0%80%20%EA%B5%AD%EC%A0%9C%EC%9C%A0%EA%B0%80+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B8%B0%EC%97%85%20%EC%8B%A4%EC%A0%81%20%EB%A7%A4%EC%B6%9C%20%EC%98%81%EC%97%85%EC%9D%B4%EC%9D%B5+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ],
  '\uc0ac\ud68c': [
    'https://news.google.com/rss/search?q=%EC%82%AC%EA%B1%B4%EC%82%AC%EA%B3%A0%20%EA%B2%BD%EC%B0%B0%20%ED%99%94%EC%9E%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B5%90%ED%86%B5%EC%82%AC%EA%B3%A0%20%EC%A7%80%ED%95%98%EC%B2%A0%20%EB%B2%84%EC%8A%A4%20%EC%82%AC%EA%B3%A0+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B2%95%EC%9B%90%20%ED%8C%90%EA%B2%B0%20%EA%B2%80%EC%B0%B0%20%EC%88%98%EC%82%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%82%A0%EC%94%A8%20%EA%B8%B0%EC%83%81%EC%B2%AD%20%ED%83%9C%ED%92%8D%20%ED%8F%AD%EC%97%BC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B5%90%EC%9C%A1%20%ED%95%99%EA%B5%90%20%EB%8C%80%ED%95%99%20%EC%9E%85%EC%8B%9C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A7%80%ED%95%98%EC%B2%A0%20%EB%B2%84%EC%8A%A4%20%EA%B5%90%ED%86%B5%20%EC%A0%95%EC%B1%85+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B3%91%EC%9B%90%20%EC%9D%98%EB%A3%8C%20%EA%B1%B4%EA%B0%95%EB%B3%B4%ED%97%98+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%95%84%ED%8C%8C%ED%8A%B8%20%EC%9E%AC%EA%B0%9C%EB%B0%9C%20%EC%A3%BC%EB%AF%BC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%ED%99%98%EA%B2%BD%20%EB%AF%B8%EC%84%B8%EB%A8%BC%EC%A7%80%20%EC%9E%AC%ED%99%9C%EC%9A%A9+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B3%B5%EC%A7%80%20%EC%97%B0%EA%B8%88%20%EC%A7%80%EC%9B%90%EA%B8%88+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ],
  '\uc815\uce58': [
    'https://news.google.com/rss/search?q=%EA%B5%AD%ED%9A%8C%20%EB%B3%B8%ED%9A%8C%EC%9D%98%20%EB%B2%95%EC%95%88%20%EC%B2%98%EB%A6%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%8C%80%ED%86%B5%EB%A0%B9%EC%8B%A4%20%EC%A0%95%EB%B6%80%20%EC%A0%95%EC%B1%85%20%EB%B0%9C%ED%91%9C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%97%AC%EC%95%BC%20%EB%8C%80%ED%91%9C%20%EC%A0%95%EC%B9%98%EA%B6%8C%20%EA%B3%B5%EB%B0%A9+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%84%A0%EA%B1%B0%20%EC%97%AC%EB%A1%A0%EC%A1%B0%EC%82%AC%20%EC%A7%80%EC%A7%80%EC%9C%A8+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%99%B8%EA%B5%90%20%EC%A0%95%EC%83%81%ED%9A%8C%EB%8B%B4%20%ED%95%9C%EB%AF%B8%20%ED%95%9C%EC%9D%BC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B5%AD%EC%A0%95%EA%B0%90%EC%82%AC%20%EC%83%81%EC%9E%84%EC%9C%84+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A7%80%EB%B0%A9%EC%9E%90%EC%B9%98%EB%8B%A8%EC%B2%B4%20%EC%8B%9C%EB%8F%84%EC%A7%80%EC%82%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A0%95%EB%8B%B9%20%EB%8B%B9%EB%8C%80%ED%91%9C%20%ED%9A%8C%EC%9D%98+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B5%AD%EB%B0%A9%20%EC%95%88%EB%B3%B4%20%EA%B5%B0+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B2%95%20%EA%B0%9C%EC%A0%95%EC%95%88%20%EC%8B%9C%ED%96%89+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ],
  '\uc5f0\uc608': [
    'https://news.google.com/rss/search?q=%EC%97%B0%EC%98%88%EA%B3%84%20%EC%86%8C%EC%8B%9D+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%95%84%EC%9D%B4%EB%8F%8C%20%EA%B7%B8%EB%A3%B9+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%93%9C%EB%9D%BC%EB%A7%88%20%EB%B0%A9%EC%98%81+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%98%81%ED%99%94%20%EA%B0%9C%EB%B4%89+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B0%80%EC%88%98%20%EC%8B%A0%EA%B3%A1+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B0%B0%EC%9A%B0%20%EC%B6%9C%EC%97%B0+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%98%88%EB%8A%A5%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B0%A9%EC%86%A1%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=K%ED%8C%9D%20%EC%95%84%EC%9D%B4%EB%8F%8C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%97%B0%EC%98%88%EC%9D%B8%20%EA%B7%BC%ED%99%A9+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ],
  '\uc2a4\ud3ec\uce20': [
    'https://news.google.com/rss/search?q=%ED%94%84%EB%A1%9C%EC%95%BC%EA%B5%AC%20KBO%20%EA%B2%BD%EA%B8%B0%20%EA%B2%B0%EA%B3%BC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%B6%95%EA%B5%AC%20K%EB%A6%AC%EA%B7%B8%20%EA%B5%AD%EA%B0%80%EB%8C%80%ED%91%9C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%86%90%ED%9D%A5%EB%AF%BC%20%EC%9D%B4%EA%B0%95%EC%9D%B8%20%ED%95%B4%EC%99%B8%EC%B6%95%EA%B5%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%ED%94%84%EB%A1%9C%EB%86%8D%EA%B5%AC%20%EB%B0%B0%EA%B5%AC%20KBL+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%98%AC%EB%A6%BC%ED%94%BD%20%EC%95%84%EC%8B%9C%EC%95%88%EA%B2%8C%EC%9E%84%20%EB%A9%94%EB%8B%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%95%BC%EA%B5%AC%20%EC%88%9C%EC%9C%84%20%EA%B2%BD%EA%B8%B0%20%EC%9D%BC%EC%A0%95+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%B6%95%EA%B5%AC%20%EB%8C%80%ED%91%9C%ED%8C%80%20%ED%8F%89%EA%B0%80%EC%A0%84+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B3%A8%ED%94%84%20%EB%8C%80%ED%9A%8C%20%EC%9A%B0%EC%8A%B9+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=e%EC%8A%A4%ED%8F%AC%EC%B8%A0%20%EB%A6%AC%EA%B7%B8+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EA%B2%A9%ED%88%AC%EA%B8%B0%20UFC%20%EA%B2%BD%EA%B8%B0+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ],
  'IT': [
    'https://news.google.com/rss/search?q=%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%20AI%20%EC%B1%97GPT+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B0%98%EB%8F%84%EC%B2%B4%20%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90%20SK%ED%95%98%EC%9D%B4%EB%8B%89%EC%8A%A4+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%8A%A4%EB%A7%88%ED%8A%B8%ED%8F%B0%20%EA%B0%A4%EB%9F%AD%EC%8B%9C%20%EC%95%84%EC%9D%B4%ED%8F%B0%20%EC%B6%9C%EC%8B%9C+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%84%A4%EC%9D%B4%EB%B2%84%20%EC%B9%B4%EC%B9%B4%EC%98%A4%20%ED%94%8C%EB%9E%AB%ED%8F%BC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85%20%ED%88%AC%EC%9E%90%20%EC%9C%A0%EC%B9%98%20IT%EC%97%85%EA%B3%84+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C%20%EB%8D%B0%EC%9D%B4%ED%84%B0%EC%84%BC%ED%84%B0+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%B3%B4%EC%95%88%20%ED%95%B4%ED%82%B9%20%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%A0%84%EA%B8%B0%EC%B0%A8%20%EB%B0%B0%ED%84%B0%EB%A6%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EC%9A%B0%EC%A3%BC%20%EC%9C%84%EC%84%B1%20%EB%B0%9C%EC%82%AC+when:14d&hl=ko&gl=KR&ceid=KR:ko',
    'https://news.google.com/rss/search?q=%EB%A1%9C%EB%B4%87%20%EC%9E%90%EB%8F%99%ED%99%94%20%EA%B8%B0%EC%88%A0+when:14d&hl=ko&gl=KR&ceid=KR:ko'
  ]
};

const NEWS_KEEP_DAYS  = 30;   // \uc774 \uae30\uac04\uc774 \uc9c0\ub098\uba74 \uc0ad\uc81c
const NEWS_PER_CAT    = 120;  // \uce74\ud14c\uace0\ub9ac\ubcc4\ub85c \ub0b4\ub824\uc8fc\ub294 \ucd5c\ub300 \uac74\uc218
const NEWS_FEED_LIMIT = 60;   // \ud53c\ub4dc \ud558\ub098\uc5d0\uc11c \uac00\uc838\uc62c \ucd5c\ub300 \uac74\uc218

async function ensureNewsTable(env) {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS news (
       link TEXT PRIMARY KEY,
       cat TEXT NOT NULL,
       title TEXT NOT NULL,
       source TEXT DEFAULT '',
       ts INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_news_cat_ts ON news(cat, ts DESC)`
  ];
  for (const sql of sqls) {
    try { await env.DB.prepare(sql).run(); } catch (e) { /* \uc774\ubbf8 \uc788\uc73c\uba74 \ubb34\uc2dc */ }
  }
}

// XML \uc5d4\ud2f0\ud2f0 \ub418\ub3cc\ub9ac\uae30 \u2014 Workers \uc5d0\ub294 DOMParser \uac00 \uc5c6\uc5b4 \uc9c1\uc811 \ucc98\ub9ac\ud55c\ub2e4
function xmlDecode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    // \ub274\uc2a4 \uc81c\ubaa9\uc5d0 \uc790\uc8fc \ub098\uc624\ub294 \uc774\ub984 \uc5d4\ud2f0\ud2f0\ub4e4 (\u2026, \u2013, \u2018\u2019, \u201c\u201d)
    .replace(/&hellip;/g, '\u2026').replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
    .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
    .replace(/&middot;/g, '\u00B7')
    // \uc22b\uc790 \uc5d4\ud2f0\ud2f0 (&#8230; / &#x2026;)
    .replace(/&#x([0-9A-Fa-f]+);/g, function(_, h){ return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d){ return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTag(block, tag) {
  const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>').exec(block);
  return m ? m[1] : '';
}

// \uad6c\uae00 \ub274\uc2a4 RSS \u2192 [{title, link, source, ts}]
function parseRss(xml) {
  const out = [];
  const chunks = String(xml || '').split(/<item[\s>]/).slice(1);
  for (const raw of chunks) {
    const cut = raw.indexOf('</item>');
    const block = cut >= 0 ? raw.slice(0, cut) : raw;
    const rawTitle = xmlDecode(pickTag(block, 'title'));
    const link = xmlDecode(pickTag(block, 'link'));
    if (!rawTitle || !link) continue;
    // \uad6c\uae00 \ub274\uc2a4 \uc81c\ubaa9 \ud615\uc2dd: "\uae30\uc0ac\uc81c\ubaa9 - \uc5b8\ub860\uc0ac"
    const parts = rawTitle.split(' - ');
    const title  = parts.length > 1 ? parts.slice(0, -1).join(' - ') : rawTitle;
    const source = parts.length > 1 ? parts[parts.length - 1] : xmlDecode(pickTag(block, 'source'));
    let ts = Date.parse(xmlDecode(pickTag(block, 'pubDate')));
    if (!isFinite(ts)) ts = Date.now();
    out.push({ title, link, source, ts });
    if (out.length >= NEWS_FEED_LIMIT) break;
  }
  return out;
}

const NEWS_GAP_MS   = 700;   // \ud53c\ub4dc \uc0ac\uc774 \uac04\uaca9 \u2014 \ud55c\uaebc\ubc88\uc5d0 \uc3d8\uba74 \uad6c\uae00\uc774 503\uc73c\ub85c \ub9c9\ub294\ub2e4
const NEWS_RETRY     = 2;    // 503/429 \uc77c \ub54c \uc7ac\uc2dc\ub3c4 \ud69f\uc218
const NEWS_RETRY_MS  = 2500; // \uc7ac\uc2dc\ub3c4 \uc804 \ub300\uae30

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* \ud53c\ub4dc \ud558\ub098\ub97c \ubc1b\uc544\uc628\ub2e4. \ub9c9\ud788\uba74(503/429) \uc7a0\uc2dc \uc26c\uc5c8\ub2e4 \ub2e4\uc2dc \uc2dc\ub3c4\ud55c\ub2e4. */
async function fetchFeed(u) {
  for (let attempt = 0; attempt <= NEWS_RETRY; attempt++) {
    try {
      const r = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; gildongmu/1.0)',
          'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9'
        },
        cf: { cacheTtl: 600, cacheEverything: true }
      });
      if (r.status === 503 || r.status === 429) {
        if (attempt < NEWS_RETRY) { await sleep(NEWS_RETRY_MS * (attempt + 1)); continue; }
        return [];
      }
      if (!r.ok) return [];
      return parseRss(await r.text());
    } catch (e) {
      if (attempt < NEWS_RETRY) { await sleep(NEWS_RETRY_MS); continue; }
      return [];
    }
  }
  return [];
}

// \uce74\ud14c\uace0\ub9ac \ud558\ub098\ub97c \uc218\uc9d1\ud574 D1 \uc5d0 \ub123\ub294\ub2e4
//   \u2605 \uc608\uc804\uc5d0\ub294 10\uac1c \ud53c\ub4dc\ub97c Promise.all \ub85c \ud55c\uaebc\ubc88\uc5d0 \uc408\ub2e4. \uce74\ud14c\uace0\ub9ac 4\uac1c\ucbe4 \uc9c0\ub098\uba74
//     \uad6c\uae00\uc774 503("Sorry...")\uc73c\ub85c \ub9c9\uc544 \uadf8 \uce74\ud14c\uace0\ub9ac\uac00 \ud1b5\uc9f8\ub85c 0\uac74\uc774 \ub410\ub2e4.
//     \uc21c\ucc28\ub85c \ub3cc\ub9ac\uace0 \uc0ac\uc774\uc5d0 \uac04\uaca9\uc744 \ub454\ub2e4.
async function collectCat(env, cat) {
  const feeds = NEWS_FEEDS[cat] || [];
  const now = Date.now();

  const results = [];
  for (let i = 0; i < feeds.length; i++) {
    if (i > 0) await sleep(NEWS_GAP_MS);
    results.push(await fetchFeed(feeds[i]));
  }

  // \uac19\uc740 \uc218\uc9d1 \uc548\uc5d0\uc11c\uc758 \uc911\ubcf5 \uba3c\uc800 \uc81c\uac70
  const seen = new Set();
  const rows = [];
  for (const arr of results) {
    for (const n of arr) {
      if (seen.has(n.link)) continue;
      seen.add(n.link);
      rows.push(n);
    }
  }

  // D1 \uc740 \ud55c \ubc88\uc5d0 \ub108\ubb34 \ub9ce\uc740 \ubb38\uc7a5\uc744 \ubb36\uc73c\uba74 \uc2e4\ud328\ud558\ubbc0\ub85c \ub098\ub220 \ub123\ub294\ub2e4
  let added = 0, failed = 0;
  const CHUNK = 25;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    try {
      await env.DB.batch(part.map((n) => env.DB.prepare(
        'INSERT OR IGNORE INTO news (link, cat, title, source, ts, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(n.link, cat, n.title, n.source || '', n.ts, now)));
      added += part.length;
    } catch (e) { failed += part.length; }
  }
  // \ubc1b\uc544\uc628 \uac74 \uc788\ub294\ub370 \ud558\ub098\ub3c4 \uc548 \ub4e4\uc5b4\uac14\ub2e4\uba74 \uc6d0\uc778\uc744 \uc54c \uc218 \uc788\uc5b4\uc57c \ud55c\ub2e4
  return { fetched: rows.length, added, failed };
}

// \uc804\uccb4 \uc218\uc9d1 \u2014 \uce74\ud14c\uace0\ub9ac\ub97c \uc21c\ucc28\ub85c \ub3c8\ub2e4(\ub3d9\uc2dc\uc5d0 \ub2e4 \ub3cc\ub9ac\uba74 \uc11c\ube0c\uc694\uccad \ud55c\ub3c4\uc5d0 \uac78\ub9b0\ub2e4)
async function collectAllNews(env) {
  await ensureNewsTable(env);
  const stat = {};
  for (const cat of Object.keys(NEWS_FEEDS)) {
    stat[cat] = await collectCat(env, cat);
  }
  return stat;
}

/* \u2500\u2500 \uc815\uae30 \uc218\uc9d1: \ud55c \ubc88\uc5d0 \ud55c \uce74\ud14c\uace0\ub9ac\uc529 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 *   3\uc2dc\uac04\ub9c8\ub2e4 \ub3c4\ub2c8 \ud558\ub8e8 8\ud68c. \uce74\ud14c\uace0\ub9ac\uac00 7\uac1c\ub77c \ud558\ub8e8\uba74 \ud55c \ubc14\ud034\ub97c \ub3c8\ub2e4.
 *   \ud55c \ubc88\uc5d0 10\uac1c \ud53c\ub4dc\ub9cc \ubc1b\uc73c\ubbc0\ub85c \uad6c\uae00\uc774 \ub9c9\uc744 \uc774\uc720\uac00 \uc5c6\uace0,
 *   D1 \uc5d0\ub294 30\uc77c\uce58\uac00 \uc313\uc5ec \uc788\uc5b4 \ubaa9\ub85d\uc774 \ube44\uc9c0 \uc54a\ub294\ub2e4.
 *   \uc5b4\ub514\uae4c\uc9c0 \ub3cc\uc558\ub294\uc9c0\ub294 meta \ud14c\uc774\ube14\uc5d0 \uc800\uc7a5\ud55c\ub2e4(\uc6cc\ucee4\ub294 \uc0c1\ud0dc\ub97c \uae30\uc5b5\ud558\uc9c0 \ubabb\ud55c\ub2e4).
 */
async function ensureMetaTable(env) {
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS news_meta (k TEXT PRIMARY KEY, v TEXT)').run();
  } catch (e) {}
}

async function metaGet(env, k) {
  try {
    const r = await env.DB.prepare('SELECT v FROM news_meta WHERE k = ?').bind(k).first();
    return r ? r.v : null;
  } catch (e) { return null; }
}

async function metaSet(env, k, v) {
  try {
    await env.DB.prepare(
      'INSERT INTO news_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    ).bind(k, String(v)).run();
  } catch (e) {}
}

async function collectNextCat(env) {
  await ensureNewsTable(env);
  await ensureMetaTable(env);
  const cats = Object.keys(NEWS_FEEDS);
  let idx = parseInt(await metaGet(env, 'rotIdx'), 10);
  if (!isFinite(idx) || idx < 0 || idx >= cats.length) idx = 0;
  const cat = cats[idx];
  const stat = await collectCat(env, cat);
  await metaSet(env, 'rotIdx', (idx + 1) % cats.length);
  return { cat, ...stat };
}

// \ubcf4\uad00 \uae30\uac04\uc774 \uc9c0\ub09c \uae30\uc0ac \uc0ad\uc81c
async function purgeOldNews(env) {
  await ensureNewsTable(env);
  const cut = Date.now() - NEWS_KEEP_DAYS * 24 * 3600 * 1000;
  try {
    const r = await env.DB.prepare('DELETE FROM news WHERE ts < ?').bind(cut).run();
    return (r && r.meta && r.meta.changes) || 0;
  } catch (e) { return 0; }
}

async function readNews(env, cat, limit) {
  await ensureNewsTable(env);
  const n = Math.min(Math.max(parseInt(limit, 10) || NEWS_PER_CAT, 1), 300);
  const q = cat
    ? env.DB.prepare('SELECT link, cat, title, source, ts FROM news WHERE cat = ? ORDER BY ts DESC LIMIT ?').bind(cat, n)
    : env.DB.prepare('SELECT link, cat, title, source, ts FROM news ORDER BY ts DESC LIMIT ?').bind(n);
  const r = await q.all();
  return (r && r.results) || [];
}

// \uce74\ud14c\uace0\ub9ac \uc804\ubd80\ub97c \ud55c \ubc88\uc5d0 \u2014 \uc571\uc740 \uc774 \ud558\ub098\ub9cc \ubd80\ub974\uba74 \ub41c\ub2e4
async function readAllNews(env, per) {
  await ensureNewsTable(env);
  const n = Math.min(Math.max(parseInt(per, 10) || NEWS_PER_CAT, 1), 300);
  const out = {};
  for (const cat of Object.keys(NEWS_FEEDS)) {
    try {
      const r = await env.DB.prepare(
        'SELECT link, cat, title, source, ts FROM news WHERE cat = ? ORDER BY ts DESC LIMIT ?'
      ).bind(cat, n).all();
      out[cat] = (r && r.results) || [];
    } catch (e) { out[cat] = []; }
  }
  return out;
}

function jsonRes(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// /kakao-local \ud504\ub85d\uc2dc + D1 \uce90\uc2dc
//   gentle-lab-7e47subway-api \uc6cc\ucee4(worker/index.js)\uc5d0 \ubd99\uc5ec \ub123\ub294 \uc870\uac01.
//   \uac19\uc740 \uc9c8\ubb38\uc740 \uce74\uce74\uc624\uc5d0 \ub2e4\uc2dc \ubb3b\uc9c0 \uc54a\ub294\ub2e4 \u2192 \ud638\ucd9c\ub7c9\uc774 \uc2e4\uc0ac\uc6a9\uc758 5~10% \uc218\uc900\uc73c\ub85c \ub5a8\uc5b4\uc9c4\ub2e4.
//
//   \ud544\uc694\ud55c \uac83: \uc2dc\ud06c\ub9bf KAKAO_REST_KEY  (npx wrangler secret put KAKAO_REST_KEY)
//              D1 \ubc14\uc778\ub529 env.DB       (\uc774\ubbf8 subway-db \ub85c \uc5f0\uacb0\ub3fc \uc788\uc74c)
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

const KAKAO_TTL_MS   = 90 * 24 * 3600 * 1000;   // \uc800\uc7a5 90\uc77c
const KAKAO_CACHE_MAX = 20000;                  // \uc815\ub9ac \uae30\uc900 \ud589 \uc218

// \uce90\uc2dc \ud14c\uc774\ube14 (\ucd5c\ucd08 1\ud68c\ub9cc \ub9cc\ub4e4\uc5b4\uc9d0)
let _kakaoTableReady = false;
async function ensureKakaoCache(env) {
  if (_kakaoTableReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS kakao_cache (k TEXT PRIMARY KEY, v TEXT, ts INTEGER)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_kakao_ts ON kakao_cache(ts)'
  ).run();
  _kakaoTableReady = true;
}

// \u2605 \uc88c\ud45c\ub294 100m \uaca9\uc790(\uc18c\uc218 3\uc790\ub9ac)\ub85c \ubb49\uce5c\ub2e4.
//   \uc9c0\uc624\ucf54\ub529 \uacb0\uacfc\ub294 \uba87 \uc2ed m \uc6c0\uc9c1\uc778\ub2e4\uace0 \ub2ec\ub77c\uc9c0\uc9c0 \uc54a\ub294\ub2e4.
//   \uc571\uc5d0\uc11c\ub3c4 \uac19\uc740 \uaddc\uce59\uc73c\ub85c \ud0a4\ub97c \ub9cc\ub4e4\uae30 \ub54c\ubb38\uc5d0 \ub450 \uacb9\uc774 \uc11c\ub85c \uc5b4\uae0b\ub098\uc9c0 \uc54a\ub294\ub2e4.
function kakaoCacheKey(path, qs) {
  let q = String(qs || '');
  if (/coord2/.test(String(path || ''))) {
    q = q.replace(/(^|&)(x|y)=(-?\d+(?:\.\d+)?)/g,
      (_m, pre, k, v) => pre + k + '=' + (Math.round(parseFloat(v) * 1000) / 1000).toFixed(3));
  }
  return String(path || '') + '?' + q;
}

async function handleKakaoLocal(request, env) {
  const url  = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const qs   = url.searchParams.get('qs')   || '';

  // \ud5c8\uc6a9 \uacbd\ub85c\ub9cc (\uc784\uc758 \uacbd\ub85c \ud504\ub85d\uc2dc \ubc29\uc9c0)
  if (!/^(search\/(keyword|address|category)\.json|geo\/(coord2regioncode|coord2address|transcoord)\.json)$/.test(path)) {
    return new Response(JSON.stringify({ error: 'path not allowed' }), {
      status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    });
  }

  const key = kakaoCacheKey(path, qs);
  const now = Date.now();

  // 1) \uce90\uc2dc \uba3c\uc800
  try {
    await ensureKakaoCache(env);
    const row = await env.DB.prepare('SELECT v, ts FROM kakao_cache WHERE k = ?').bind(key).first();
    if (row && (now - Number(row.ts || 0)) < KAKAO_TTL_MS) {
      usageAdd('gl.kakao.saved');
      usageFlush(env);
      return new Response(row.v, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'access-control-allow-origin': '*',
          'x-cache': 'HIT'
        }
      });
    }
  } catch (e) { /* \uce90\uc2dc\uac00 \uc2e4\ud328\ud574\ub3c4 \uc6d0\ubcf8 \ud638\ucd9c\ub85c \uc9c4\ud589 */ }

  // 2) \uce74\uce74\uc624 \ud638\ucd9c
  const key_ = env.KAKAO_REST_KEY;
  if (!key_) {
    return new Response(JSON.stringify({ error: 'KAKAO_REST_KEY not set' }), {
      status: 500, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    });
  }

  let body = '', status = 502;
  try {
    usageAdd(path.indexOf('search/') === 0 ? 'gl.kakao.search' : 'gl.kakao.geo');
    usageFlush(env);
    const r = await fetch('https://dapi.kakao.com/v2/local/' + path + (qs ? ('?' + qs) : ''), {
      headers: { Authorization: 'KakaoAK ' + key_ }
    });
    status = r.status;
    if (status >= 400) usageAdd('gl.kakao.err');
    body   = await r.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 502, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    });
  }

  // 3) \uc131\uacf5\ud558\uace0 \uacb0\uacfc\uac00 \uc788\uc744 \ub54c\ub9cc \uc800\uc7a5 \u2014 \ube48 \uc751\ub2f5\u00b7\uc624\ub958\ub97c 90\uc77c \ubd99\ub4e4\uc9c0 \uc54a\ub294\ub2e4
  if (status === 200) {
    try {
      const j = JSON.parse(body);
      if (j && Array.isArray(j.documents) && j.documents.length) {
        await env.DB.prepare(
          'INSERT INTO kakao_cache (k, v, ts) VALUES (?, ?, ?) ' +
          'ON CONFLICT(k) DO UPDATE SET v = excluded.v, ts = excluded.ts'
        ).bind(key, body, now).run();
      }
    } catch (e) { /* \uc800\uc7a5 \uc2e4\ud328\ub294 \ubb34\uc2dc */ }
  }

  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'x-cache': 'MISS'
    }
  });
}

// \uc624\ub798\ub41c \uce90\uc2dc \uc815\ub9ac (cron \uc774\ub098 /admin/kakao-purge \uc5d0\uc11c \ud638\ucd9c)
async function purgeKakaoCache(env) {
  await ensureKakaoCache(env);
  const cut = Date.now() - KAKAO_TTL_MS;
  const r = await env.DB.prepare('DELETE FROM kakao_cache WHERE ts < ?').bind(cut).run();
  return (r && r.meta && r.meta.changes) || 0;
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// /seoul \u2014 \uc11c\uc6b8 \uc5f4\ub9b0\ub370\uc774\ud130 \uc9c0\ud558\ucca0 \uc2e4\uc2dc\uac04 (\ud0a4 \uc8fc\uc785 + \ud0a4 \ub85c\ud14c\uc774\uc158)
//   \uc571 \ud638\ucd9c: /seoul?path=realtimeStationArrival/0/10/\uc544\ub77c
//   \uc2e4\uc81c \uc8fc\uc18c: https://swopenapi.seoul.go.kr/api/subway/{KEY}/json/{path}
//
//   \ud0a4\ub294 \uc2dc\ud06c\ub9bf SEOUL_API_KEY \uc5d0 \ub454\ub2e4. \uc27c\ud45c\ub85c \uc5ec\ub7ec \uac1c \ub123\uc73c\uba74
//   \uc77c\uc77c \ud55c\ub3c4(ERROR-337)\ub098 \uc778\uc99d \uc2e4\ud328(INFO-100)\uac00 \ub730 \ub54c \ub2e4\uc74c \ud0a4\ub85c \ub118\uc5b4\uac04\ub2e4.
//     npx wrangler secret put SEOUL_API_KEY
//     \u2192 key1,key2,key3
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

const SEOUL_BASE = 'https://swopenapi.seoul.go.kr/api/subway';

// \u2605 \ud638\ucd9c \uc544\ub07c\uae30 \u2014 \uc11c\uc6b8 \uc9c0\ud558\ucca0 \uc778\uc99d\ud0a4\ub294 \ud558\ub8e8 1,000\uac74\uc774\ub77c \uadf8\ub0e5 \uc4f0\uba74 \uae08\ubc29 \ub2f3\ub294\ub2e4.
//   \uac19\uc740 \uc5ed\uc744 \uc5ec\ub7ec \uc0ac\ub78c\uc774 \ubd10\ub3c4 \ud55c \ubc88\ub9cc \ub098\uac00\ub3c4\ub85d \uc138 \uacb9\uc73c\ub85c \ub9c9\ub294\ub2e4.
//     \u2460 \uac19\uc740 isolate \uba54\ubaa8\ub9ac   (\uac00\uc7a5 \ube60\ub984)
//     \u2461 Cloudflare \uc5e3\uc9c0 \uce90\uc2dc  (\uac19\uc740 \uc9c0\uc5ed \uc0ac\uc6a9\uc790\ub07c\ub9ac \uacf5\uc720)
//     \u2462 \ub3d9\uc2dc\uc694\uccad \ud569\uce58\uae30       (10\uba85\uc774 \ub3d9\uc2dc\uc5d0 \ub20c\ub7ec\ub3c4 upstream 1\ud68c)
//   \ub3c4\ucc29\uc815\ubcf4\ub294 10\ucd08, \uc5f4\ucc28\uc704\uce58\ub294 15\ucd08. \uc6d0\ubcf8\uc774 \uadf8 \uc815\ub3c4 \uc8fc\uae30\ub85c \uac31\uc2e0\ub418\ubbc0\ub85c
//   \uc2e0\uc120\ub3c4 \uc190\ud574\ub294 \uac70\uc758 \uc5c6\uace0 \ud638\ucd9c\ub7c9\uc740 \uc0ac\uc6a9\uc790 \uc218\uc5d0 \ube44\ub840\ud558\uc9c0 \uc54a\uac8c \ub41c\ub2e4.
const SEOUL_TTL = { arrival: 10, position: 15, other: 1800 };

function seoulTtl(path) {
  if (/^realtimeStationArrival\//.test(path)) return SEOUL_TTL.arrival;
  if (/^realtimePosition\//.test(path))       return SEOUL_TTL.position;
  return SEOUL_TTL.other;
}

const _seoulMem      = new Map();   // path -> { exp, body, status }
const _seoulInflight = new Map();   // path -> Promise
const seoulStats     = { upstream: 0, mem: 0, edge: 0, coalesced: 0 };

function seoulMemGet(path) {
  const e = _seoulMem.get(path);
  if (!e) return null;
  if (Date.now() > e.exp) { _seoulMem.delete(path); return null; }
  return e;
}
function seoulMemPut(path, status, body, ttlSec) {
  _seoulMem.set(path, { exp: Date.now() + ttlSec * 1000, body, status });
  if (_seoulMem.size > 500) {                       // \uc624\ub798\ub41c \uac83\ubd80\ud130 \uc815\ub9ac
    for (const [k, v] of _seoulMem) { if (Date.now() > v.exp) _seoulMem.delete(k); }
  }
}
function seoulRes(body, status, from, ttlSec, usedKey) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS,
    'Cache-Control': 'public, max-age=' + ttlSec,
    'x-seoul-cache': from
  };
  if (usedKey != null) h['x-seoul-key'] = String(usedKey);   // \uba87 \ubc88\uc9f8 \ud0a4\uac00 \uc4f0\uc600\ub294\uc9c0
  return new Response(body, { status, headers: h });
}

// \uc774 \uc11c\ube44\uc2a4\ub4e4\ub9cc \ud5c8\uc6a9 (\uc784\uc758 \uacbd\ub85c \ud504\ub85d\uc2dc \ubc29\uc9c0)
const SEOUL_SERVICES = /^(realtimeStationArrival|realtimePosition|getShtrmPath|SearchSTNBySubwayLineInfo|SearchInfoBySubwayNameService)\//;

function seoulKeys(env) {
  return String(env.SEOUL_API_KEY || '')
    .split(',')
    // \u2605 2026-10-04: \ub300\uc2dc\ubcf4\ub4dc\uc5d0 \uac12\uc744 \ubd99\uc5ec \ub123\uc744 \ub54c \ub530\uc634\ud45c\u00b7\uc904\ubc14\uafc8\u00b7\uacf5\ubc31\uc774 \uac19\uc774 \ub4e4\uc5b4\uac00\uba74 URL \uacbd\ub85c\uac00 \uae68\uc838 \uc5c5\uc2a4\ud2b8\ub9bc\uc774 \ubcf8\ubb38 \uc5c6\ub294 400 \uc744 \uc904 \uc218 \uc788\ub2e4 \u2192 \uc55e\ub4a4\uc758 \ub530\uc634\ud45c/\uacf5\ubc31/\uc81c\uc5b4\ubb38\uc790\ub97c \uac77\uc5b4\ub0b8\ub2e4
    .map((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^[\s"'`]+|[\s"'`]+$/g, ''))
    .filter(Boolean);
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \ud55c\uad6d IP \uc911\uacc4 \uc5f0\ub3d9 (2026-10-04)
//   \uc11c\uc6b8 swopenapi \uac00 Cloudflare \ucd9c\uad6c IP \ub97c \uac70\ubd80\ud574\uc11c /seoul \uc758 \uc9c1\uc811 \ud638\ucd9c\uc740 \uc2e4\ud328\ud55c\ub2e4.
//   \ud55c\uad6d \uc9d1 \uc778\ud130\ub137\uc5d0 \uc788\ub294 \ub178\ud2b8\ubd81(tools/seoul-relay)\uc774 '\uc571\uc774 \ucc3e\ub294 \uacbd\ub85c'\ub9cc \ub300\uc2e0 \ubd88\ub7ec \uc640 D1 \uc5d0 \uc62c\ub824 \ub450\uace0,
//   /seoul \uc740 \uadf8 \uac12\uc744 \ub3cc\ub824\uc900\ub2e4. \ub178\ud2b8\ubd81\uc740 \uc0ac\uc6a9\uc790 \uc694\uccad\uc744 \uc9c1\uc811 \ubc1b\uc9c0 \uc54a\ub294\ub2e4(\ubc16\uc73c\ub85c \ubcf4\ub0b4\uae30\ub9cc \ud55c\ub2e4).
//     \uc571 \u2192 /seoul?path=\u2026  \u2192 \u2460 \uba54\ubaa8\ub9ac \u2461 \uc5e3\uc9c0 \uce90\uc2dc \u2462 [\uc911\uacc4 \uac12(D1)] \u2463 (\uc911\uacc4\uac00 \uc8fd\uc5c8\uc744 \ub54c\ub9cc) \uc61b \uc9c1\uc811 \ud638\ucd9c
//     \ub178\ud2b8\ubd81 \u2192 GET /relay/wanted (\ucc3e\ub294 \uacbd\ub85c \ubaa9\ub85d) \u2192 \uc11c\uc6b8 \ud638\ucd9c \u2192 POST /relay/push (\uacb0\uacfc \uc62c\ub9ac\uae30)
//   \uc778\uc99d: \uc2dc\ud06c\ub9bf RELAY_TOKEN(16\uc790 \uc774\uc0c1) \uacfc \uac19\uc740 \uac12\uc744 \ub178\ud2b8\ubd81\uc774 x-relay-token \ud5e4\ub354\ub85c \ubcf4\ub0b8\ub2e4.
//   \uc911\uacc4\uac00 3\ubd84 \ub118\uac8c \uc18c\uc2dd\uc774 \uc5c6\uc73c\uba74(\uaebc\uc9d0) \uc61b \ub3d9\uc791\uc73c\ub85c \ub3cc\uc544\uac00\uace0, \uc571\uc740 \uadf8\ub3d9\uc548 \uc815\uc801 \uc2dc\uac01\ud45c\ub85c \ub3d9\uc791\ud55c\ub2e4.
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
const RELAY_MAX_AGE = { arrival: 75, position: 90, other: 1800 };   // \uc911\uacc4\uac00 \uc62c\ub9b0 \uac12\uc744 \uc774 \ucd08 \uc548\uc77c \ub54c\ub9cc \uc4f4\ub2e4
const RELAY_ALIVE_MS = 180000;
let _relayReady = false;
let _relayAliveMem = { at: 0, v: false };
let _relayHbAt = 0;
let _relayPruneAt = 0;
const _relayWantAt = new Map();   // path -> \ub9c8\uc9c0\ub9c9\uc73c\ub85c \uae30\ub85d\ud55c \uc2dc\uac01(isolate \uc548\uc5d0\uc11c 20\ucd08\uc5d0 \ud55c \ubc88\ub9cc \uc4f4\ub2e4)

async function relayInit(env) {
  if (_relayReady || !env || !env.DB) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS relay_cache (path TEXT PRIMARY KEY, status INTEGER, body TEXT, at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS relay_want (path TEXT PRIMARY KEY, at INTEGER, n INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS relay_state (k TEXT PRIMARY KEY, v TEXT, at INTEGER)').run();
  _relayReady = true;
}
function relayAuth(request, env) {
  const t = String((env && env.RELAY_TOKEN) || ''), h = String(request.headers.get('x-relay-token') || '');
  if (t.length < 16 || h.length !== t.length) return false;
  let d = 0;
  for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ h.charCodeAt(i);
  return d === 0;
}
function relayMaxAgeSec(path) {
  if (/^realtimeStationArrival\//.test(path)) return RELAY_MAX_AGE.arrival;
  if (/^realtimePosition\//.test(path))       return RELAY_MAX_AGE.position;
  return RELAY_MAX_AGE.other;
}
async function relayAlive(env) {
  if (!env || !env.DB) return false;
  const now = Date.now();
  if (now - _relayAliveMem.at < 20000) return _relayAliveMem.v;
  let v = false;
  try {
    await relayInit(env);
    const row = await env.DB.prepare("SELECT at FROM relay_state WHERE k='hb'").first();
    v = !!(row && now - row.at < RELAY_ALIVE_MS);
  } catch (e) { v = false; }
  _relayAliveMem = { at: now, v };
  return v;
}
async function relayLookup(path, env) {
  try {
    const row = await env.DB.prepare('SELECT status, body, at FROM relay_cache WHERE path=?').bind(path).first();
    if (row && Date.now() - row.at <= relayMaxAgeSec(path) * 1000) return row;
  } catch (e) { /* \uc5c6\ub294 \uac83\uc73c\ub85c */ }
  return null;
}
async function relayWant(path, env) {
  const now = Date.now(), last = _relayWantAt.get(path) || 0;
  if (now - last < 20000) return;
  _relayWantAt.set(path, now);
  if (_relayWantAt.size > 500) { for (const [k, v] of _relayWantAt) { if (now - v > 60000) _relayWantAt.delete(k); } }
  try {
    await env.DB.prepare('INSERT INTO relay_want (path, at, n) VALUES (?, ?, 1) ON CONFLICT(path) DO UPDATE SET at=excluded.at, n=n+1').bind(path, now).run();
  } catch (e) { /* \uae30\ub85d \uc2e4\ud328\ub294 \ubb34\uc2dc */ }
}
async function relayHeartbeat(env, info) {
  const now = Date.now();
  if (now - _relayHbAt < 25000) return;
  _relayHbAt = now;
  try {
    await env.DB.prepare("INSERT INTO relay_state (k, v, at) VALUES ('hb', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(String(info || ''), now).run();
    _relayAliveMem = { at: now, v: true };
  } catch (e) { /* \ubb34\uc2dc */ }
}
async function relayWanted(request, env) {
  if (!relayAuth(request, env)) return jsonRes({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return jsonRes({ ok: false, error: 'DB not bound' }, 500);
  await relayInit(env);
  const now = Date.now();
  const u = new URL(request.url);
  await relayHeartbeat(env, u.searchParams.get('info') || '');
  if (now - _relayPruneAt > 3600000) {
    _relayPruneAt = now;
    try {
      await env.DB.prepare('DELETE FROM relay_want WHERE at < ?').bind(now - 86400000).run();
      await env.DB.prepare('DELETE FROM relay_cache WHERE at < ?').bind(now - 86400000).run();
    } catch (e) { /* \ubb34\uc2dc */ }
  }
  const rows = await env.DB.prepare(
    'SELECT w.path AS path, w.n AS n, w.at AS at, COALESCE(c.at, 0) AS have FROM relay_want w LEFT JOIN relay_cache c ON c.path = w.path WHERE w.at > ? ORDER BY w.n DESC LIMIT 80'
  ).bind(now - 150000).all();
  return jsonRes({ ok: true, now, wanted: (rows && rows.results) || [] });
}
async function relayPush(request, env) {
  if (request.method !== 'POST') return jsonRes({ ok: false, error: 'POST only' }, 405);
  if (!relayAuth(request, env)) return jsonRes({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return jsonRes({ ok: false, error: 'DB not bound' }, 500);
  await relayInit(env);
  let j = null;
  try { j = await request.json(); } catch (e) { return jsonRes({ ok: false, error: 'bad json' }, 400); }
  const items = (j && Array.isArray(j.items)) ? j.items.slice(0, 60) : [];
  const now = Date.now(), stmts = []; let skipped = 0;
  for (const it of items) {
    const path = it && it.path, body = it && it.body;
    if (typeof path !== 'string' || typeof body !== 'string' || !SEOUL_SERVICES.test(path) || body.length > 400000) { skipped++; continue; }
    let code = '';   // \uc815\uc0c1\uc740 errorMessage.code, \uc624\ub958\ub294 \ucd5c\uc0c1\uc704 code
    try { const b = JSON.parse(body); code = (b && b.errorMessage && b.errorMessage.code) || (b && b.status && b.status.code) || (b && typeof b.code === 'string' && b.code) || ''; } catch (e) { skipped++; continue; }
    if (/^ERROR-/.test(code) || code === 'INFO-100') { skipped++; continue; }   // \ud55c\ub3c4\u00b7\ud0a4 \uc624\ub958\ub294 \uc62c\ub9ac\uc9c0 \uc54a\ub294\ub2e4
    stmts.push(env.DB.prepare('INSERT INTO relay_cache (path, status, body, at) VALUES (?, 200, ?, ?) ON CONFLICT(path) DO UPDATE SET status=200, body=excluded.body, at=excluded.at').bind(path, body, now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  _relayHbAt = 0;
  await relayHeartbeat(env, j && j.info);
  return jsonRes({ ok: true, stored: stmts.length, skipped });
}

async function handleSeoul(request, env) {
  usageFlush(env);
  const url  = new URL(request.url);
  const path = url.searchParams.get('path') || '';

  if (!SEOUL_SERVICES.test(path)) {
    return jsonRes({ ok: false, error: 'path not allowed' }, 400);
  }

  const keys = seoulKeys(env);

  // \u2605 2026-10-04: \uc9c4\ub2e8\uc6a9(\ub300\uc2dc\ubcf4\ub4dc\uc5d0\uc11c \ubcc0\uc218 SEOUL_DEBUG=1 \uc744 \ucf20 \ub3d9\uc548\ub9cc). \uc5c5\uc2a4\ud2b8\ub9bc \uc0c1\ud0dc\ucf54\ub4dc\u00b7\ubcf8\ubb38 \uc55e\ubd80\ubd84\u00b7\ud0a4 \ubaa8\uc591(\uae38\uc774\u00b7\ubb38\uc790 \uc885\ub958 \uac1c\uc218)\ub9cc \ub0b4\uace0 \ud0a4 \uac12\uc740 \uc808\ub300 \ub0b4\uc9c0 \uc54a\ub294\ub2e4.
  if (url.searchParams.get('debug') === '1') {
    if (env.SEOUL_DEBUG !== '1') return jsonRes({ ok: false, error: 'debug off' }, 403);
    if (!keys.length) return jsonRes({ ok: false, error: 'SEOUL_API_KEY not set' }, 500);
    return seoulDebug(path, keys);
  }

  const ttl = seoulTtl(path);

  // \u2460 \uba54\ubaa8\ub9ac
  const hit = seoulMemGet(path);
  if (hit) { seoulStats.mem++; usageAdd('gl.sw.saved'); return seoulRes(hit.body, hit.status, 'MEM', ttl); }

  // \u2461 \uc5e3\uc9c0 \uce90\uc2dc (\uac19\uc740 \uc9c0\uc5ed \uc0ac\uc6a9\uc790\ub07c\ub9ac \uacf5\uc720)
  const cacheKey = new Request('https://seoul-cache/' + encodeURIComponent(path));
  let edge = null;
  try { edge = await caches.default.match(cacheKey); } catch (e) { /* \uce90\uc2dc \uc5c6\uc73c\uba74 \uadf8\ub0e5 \uc9c4\ud589 */ }
  if (edge) {
    seoulStats.edge++;
    usageAdd('gl.sw.saved');
    const body = await edge.text();
    seoulMemPut(path, edge.status, body, ttl);
    return seoulRes(body, edge.status, 'EDGE', ttl);
  }

  // \u2461-b \ud55c\uad6d IP \uc911\uacc4\uac00 \uc0b4\uc544 \uc788\uc73c\uba74 \uadf8 \uac12\uc744 \uc4f4\ub2e4(\uc5c6\uc73c\uba74 \ucc3e\ub294 \uacbd\ub85c\ub85c \uae30\ub85d\ud558\uace0 '\uc900\ube44 \uc911'\uc744 \ub3cc\ub824\uc900\ub2e4 \u2192 \uc571\uc740 \uc2dc\uac01\ud45c\ub85c \ub3d9\uc791)
  if (await relayAlive(env)) {
    const row = await relayLookup(path, env);
    if (row) {
      await relayWant(path, env);
      seoulMemPut(path, 200, row.body, ttl);
      try {
        await caches.default.put(cacheKey, new Response(row.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + ttl } }));
      } catch (e) { /* \uc5e3\uc9c0 \uce90\uc2dc \uc2e4\ud328\ub294 \ubb34\uc2dc */ }
      seoulStats.relay = (seoulStats.relay || 0) + 1;
      usageAdd('gl.sw.relay');
      return seoulRes(row.body, 200, 'RELAY', ttl);
    }
    await relayWant(path, env);
    return new Response(JSON.stringify({ ok: false, error: 'relay pending', relay: true }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, 'Retry-After': '5', 'Cache-Control': 'no-store', 'x-seoul-cache': 'RELAY-PENDING' } });
  }

  if (!keys.length) {
    return jsonRes({ ok: false, error: 'SEOUL_API_KEY not set' }, 500);
  }

  // \u2462 \uac19\uc740 \uacbd\ub85c\ub97c \ub3d9\uc2dc\uc5d0 \uc5ec\ub7ec \uba85\uc774 \uc694\uccad\ud558\uba74 upstream \uc740 \ud55c \ubc88\ub9cc
  const flying = _seoulInflight.get(path);
  if (flying) {
    seoulStats.coalesced++;
    usageAdd('gl.sw.saved');
    const r = await flying;
    return seoulRes(r.body, r.status, 'WAIT', ttl, r.key);
  }

  const job = seoulUpstream(path, keys, ttl, cacheKey);
  _seoulInflight.set(path, job);
  try {
    const r = await job;
    return seoulRes(r.body, r.status, 'MISS', ttl, r.key);
  } finally {
    _seoulInflight.delete(path);
  }
}

// \u2605 2026-10-04 (\ubcf8\ubb38 \uc5c6\ub294 HTTP 400): \uc11c\uc6b8 \uc5c5\uc2a4\ud2b8\ub9bc\uc774 \ubcf8\ubb38 \uc5c6\ub294 4xx \ub97c \uc8fc\uba74 \uc608\uc804\uc5d4 \uadf8\ub300\ub85c '\ubcf8\ubb38 \uc5c6\ub294 400' \uc774 \uc571\u00b7\uc5d4\uc9c4\uae4c\uc9c0 \uac14\ub2e4.
//   \uc6d0\uc778\uc744 \ucf54\ub4dc\ub9cc\uc73c\ub85c \ub2e8\uc815\ud560 \uc218 \uc5c6\uc5b4(\uac00\ub2a5\uc131: \ud0a4 \uac12 \ubaa8\uc591, \uc694\uccad \ud5e4\ub354, \uc2a4\ud0b4) \ub450 \uac00\uc9c0\ub97c \ud55c\ub2e4.
//   \u2460 \ubcf8\ubb38 \uc5c6\ub294 4xx \uba74 \ubc29\uc2dd\uc744 \ubc14\uafd4 \ub2e4\uc2dc \uc2dc\ub3c4\ud55c\ub2e4: std(https+Accept/UA) \u2192 plain(https, \ud5e4\ub354 \uc5c6\uc74c) \u2192 http. \ud1b5\ud55c \ubc29\uc2dd\uc740 \uae30\uc5b5\ud574 \ub2e4\uc74c\ubd80\ud130 \uadf8\uac83\ubd80\ud130 \uc4f4\ub2e4.
//   \u2461 \ub05d\ub0b4 \uc548 \ub418\uba74 \ubcf8\ubb38 \uc5c6\ub294 \uc751\ub2f5 \ub300\uc2e0 JSON({ok:false, error, upstream}) \uc744 \ub3cc\ub824\uc8fc\uace0, \uac19\uc740 \uacbd\ub85c\ub294 30\ucd08 \uc270\ub2e4(\uc7ac\uc2dc\ub3c4 \ud3ed\uc8fc\u00b7\ucffc\ud130 \ub0ad\ube44 \ubc29\uc9c0).
//   \uc9c4\ub2e8\uc740 /seoul?path=\u2026&debug=1 (SEOUL_DEBUG=1 \uc77c \ub54c\ub9cc). \ud0a4 \uac12\uc740 \uc5b4\ub514\uc5d0\ub3c4 \ub0b4\uc9c0 \uc54a\ub294\ub2e4.
const SEOUL_VARIANTS = [
  { id: 'std',   scheme: 'https', headers: true  },
  { id: 'plain', scheme: 'https', headers: false },
  { id: 'http',  scheme: 'http',  headers: false }
];
let _seoulVariant = 0;
const _seoulBad = new Map();   // path -> { until, status }
function seoulEmptyClientErr(status, body) { return status >= 400 && status < 500 && !String(body || '').trim(); }
function seoulTarget(v, key, path) {
  const base = v.scheme === 'http' ? SEOUL_BASE.replace(/^https:/, 'http:') : SEOUL_BASE;
  return base + '/' + encodeURIComponent(key) + '/json/' + path;
}
async function seoulFetchVariant(v, key, path, ttl) {
  const init = v.headers
    ? { headers: { Accept: 'application/json', 'User-Agent': 'gildongmu/1.0' }, cf: { cacheTtl: ttl, cacheEverything: false } }
    : { cf: { cacheTtl: ttl, cacheEverything: false } };
  const r = await fetch(seoulTarget(v, key, path), init);
  return { status: r.status, body: await r.text() };
}

// \uc2e4\uc81c \ud638\ucd9c (\ud0a4 \ub85c\ud14c\uc774\uc158 \ud3ec\ud568) \u2014 \uc131\uacf5\ud558\uba74 \ub450 \uce90\uc2dc\uc5d0 \ubaa8\ub450 \ub123\ub294\ub2e4
async function seoulUpstream(path, keys, ttl, cacheKey) {
  let lastBody = '', lastStatus = 502;

  const bad = _seoulBad.get(path);
  if (bad && Date.now() < bad.until) {
    return { body: JSON.stringify({ ok: false, error: 'upstream rejected (cooling down)', upstream: bad.status }), status: bad.status, key: 'cooldown' };
  }

  for (let i = 0; i < keys.length; i++) {
    let body = '', status = 502, got = null, emptyErr = null;
    for (let k = 0; k < SEOUL_VARIANTS.length; k++) {
      const vi = (_seoulVariant + k) % SEOUL_VARIANTS.length;
      try {
        usageAdd('gl.sw.k' + (i + 1));
        usageFlush(_glEnv);
        const r = await seoulFetchVariant(SEOUL_VARIANTS[vi], keys[i], path, ttl);
        seoulStats.upstream++;
        if (r.status >= 400) usageAdd('gl.sw.k' + (i + 1) + '.err');
        if (seoulEmptyClientErr(r.status, r.body)) { emptyErr = r; continue; }   // \ubcf8\ubb38 \uc5c6\ub294 4xx \u2192 \ub2e4\ub978 \ubc29\uc2dd\uc73c\ub85c
        got = r; _seoulVariant = vi; break;
      } catch (e) {
        lastBody = JSON.stringify({ ok: false, error: String((e && e.message) || e) });
      }
    }
    if (!got && emptyErr) {
      // \ubaa8\ub4e0 \ubc29\uc2dd\uc774 \ubcf8\ubb38 \uc5c6\ub294 4xx \u2014 \ubcf8\ubb38 \uc5c6\ub294 \uc751\ub2f5 \ub300\uc2e0 \uc774\uc720\uac00 \ubcf4\uc774\ub294 JSON \uc73c\ub85c
      lastStatus = emptyErr.status;
      lastBody = JSON.stringify({ ok: false, error: 'upstream ' + emptyErr.status + ' (empty body)', upstream: emptyErr.status });
      continue;                       // \ub2e4\uc74c \ud0a4\ub85c
    }
    if (!got) continue;               // \ub124\ud2b8\uc6cc\ud06c \uc624\ub958 \u2014 \ub2e4\uc74c \ud0a4\ub85c
    status = got.status; body = got.body;

    lastBody = body; lastStatus = status;

    // \ud55c\ub3c4 \ucd08\uacfc\u00b7\ud0a4 \ubb38\uc81c\uba74 \ub2e4\uc74c \ud0a4\ub85c, \uadf8 \uc678\uc5d0\ub294 \uadf8\ub300\ub85c \ub3cc\ub824\uc900\ub2e4
    let code = '';
    try {
      const j = JSON.parse(body);
      code = (j && j.errorMessage && j.errorMessage.code)
          || (j && j.status && j.status.code) || '';
    } catch (e) { /* JSON \uc774 \uc544\ub2c8\uba74 \uadf8\ub300\ub85c \ubc18\ud658 */ }

    if (code === 'ERROR-337' || code === 'INFO-100' || code === 'ERROR-336') continue;

    // \uc815\uc0c1 \uc751\ub2f5\ub9cc \uce90\uc2dc\uc5d0 \ub123\ub294\ub2e4(\ud55c\ub3c4 \ucd08\uacfc \uba54\uc2dc\uc9c0\ub97c 10\ucd08 \ubd99\ub4e4\uba74 \uc548 \ub41c\ub2e4)
    if (status === 200) {
      seoulMemPut(path, status, body, ttl);
      try {
        await caches.default.put(cacheKey, new Response(body, {
          headers: { 'Content-Type': 'application/json; charset=utf-8',
                     'Cache-Control': 'public, max-age=' + ttl }
        }));
      } catch (e) { /* \uc5e3\uc9c0 \uce90\uc2dc \uc2e4\ud328\ub294 \ubb34\uc2dc */ }
    }
    return { body, status, key: i + 1 };
  }

  if (seoulEmptyClientErr(lastStatus, '') || /"upstream":/.test(lastBody)) {
    _seoulBad.set(path, { until: Date.now() + 30000, status: lastStatus });
    if (_seoulBad.size > 200) { for (const [k, v] of _seoulBad) { if (Date.now() > v.until) _seoulBad.delete(k); } }
  }
  // \ubaa8\ub4e0 \ud0a4\uac00 \ub9c9\ud798 \u2014 \uc571\uc740 \uc774 \uacbd\uc6b0 \uc815\uc801 \uc2dc\uac01\ud45c\ub85c \ud3f4\ubc31\ud55c\ub2e4
  return { body: lastBody || JSON.stringify({ ok: false, error: 'all keys exhausted' }),
           status: lastStatus, key: 'exhausted' };
}

// \u2500\u2500 \uc9c4\ub2e8 (SEOUL_DEBUG=1 \uc77c \ub54c\ub9cc). \ud0a4 \uac12\u00b7\ud0a4\uac00 \ub4e4\uc5b4\uac04 URL \uc740 \uc751\ub2f5\uc5d0 \uc808\ub300 \uc2e3\uc9c0 \uc54a\ub294\ub2e4. 20\ucd08\uc5d0 \ud55c \ubc88\ub9cc. \u2500\u2500
let _seoulDebugAt = 0;
function seoulRedact(str, keys) {
  let t = String(str == null ? '' : str);
  keys.forEach((k) => {
    if (!k) return;
    [k, encodeURIComponent(k)].forEach((x) => { if (x) t = t.split(x).join('***'); });
  });
  return t;
}
function seoulKeyShape(k) {
  const s = String(k || '');
  return {
    len: s.length,
    letters: (s.match(/[A-Za-z]/g) || []).length,
    digits: (s.match(/[0-9]/g) || []).length,
    other: (s.match(/[^A-Za-z0-9]/g) || []).length,
    nonAscii: /[^\x00-\x7f]/.test(s),
    hasPercent: s.indexOf('%') >= 0,
    hasSlashPlusEq: /[\/+=]/.test(s),
    needsEncoding: encodeURIComponent(s) !== s
  };
}
async function seoulProbe(label, url, init, keys, group) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, init);
    const txt = await r.text();
    const names = []; r.headers.forEach((_v, k) => names.push(k));          // \ud5e4\ub354 \uc774\ub984\ub9cc(\uac12\uc740 \ub0b4\uc9c0 \uc54a\ub294\ub2e4)
    return {
      label, group: group || 'seoul', status: r.status, statusText: r.statusText || '', ms: Date.now() - t0,
      redirected: !!r.redirected, finalUrl: seoulRedact(r.url || '', keys).slice(0, 120),
      contentType: r.headers.get('content-type') || '', server: r.headers.get('server') || '',
      headerNames: names.slice(0, 20), bodyLen: txt.length, head: seoulRedact(txt.slice(0, 300), keys)
    };
  } catch (e) {
    return { label, group: group || 'seoul', error: seoulRedact(String((e && e.message) || e).slice(0, 160), keys) };
  }
}
// \uc9c4\ub2e8 \uacb0\uacfc\ub97c \uc0ac\ub78c\uc774 \ubc14\ub85c \uc77d\uc744 \uc218 \uc788\uac8c \ud55c \uc904\ub85c \uc694\uc57d\ud55c\ub2e4(\uc5b4\ub514\uae4c\uc9c0 \ud655\uc778\ub410\ub294\uc9c0 \ub2e8\uc815\ud558\uc9c0 \uc54a\ub294\ub2e4)
function seoulHint(probes) {
  const sw = probes.filter((p) => p.group === 'swopenapi');
  const ctl = probes.filter((p) => p.group === 'control');
  const okOf = (p) => p && !p.error && p.status >= 200 && p.status < 400;
  const swOk = sw.filter(okOf);
  const ctlOk = ctl.filter(okOf);
  const allEmpty400 = sw.length > 0 && sw.every((p) => !p.error && p.status === 400 && p.bodyLen === 0);
  if (swOk.length) return 'swopenapi \uc77c\ubd80 \ubc29\uc2dd\uc774 \ud1b5\ud568: ' + swOk.map((p) => p.label).join(', ') + ' \u2192 \uadf8 \ubc29\uc2dd\uc744 \uae30\ubcf8\uc73c\ub85c \uc4f0\ub3c4\ub85d \ubc14\uafb8\uba74 \ub428';
  if (allEmpty400 && ctlOk.length) return 'swopenapi \ub85c \uac00\ub294 \ubaa8\ub4e0 \ubc29\uc2dd(\ud5e4\ub354\u00b7http\u00b7ASCII \uacbd\ub85c\u00b7sample \ud0a4 \ud3ec\ud568)\uc774 \ubcf8\ubb38 \uc5c6\ub294 400, \ub2e4\ub978 \uc0ac\uc774\ud2b8\ub294 \uc815\uc0c1 \u2192 swopenapi \ucabd\uc774 \uc774 Worker \uc758 \uc694\uccad(\ucd9c\uad6c IP/\uc9c0\uc5ed)\uc744 \uac70\uc808\ud558\ub294 \uac83\uc73c\ub85c \ubcf4\uc784. \ucf54\ub4dc\ub85c\ub294 \ubabb \uace0\uce68';
  if (allEmpty400 && !ctlOk.length) return '\ubaa8\ub4e0 \uc678\ubd80 \uc694\uccad\uc774 \uc2e4\ud328 \u2192 \uc774 Worker \uc758 \uc678\ubd80 \uc811\uc18d \uc790\uccb4 \ubb38\uc81c';
  return '\uacb0\uacfc\uac00 \uc11e\uc5ec \uc788\uc74c \u2014 probes \ub97c \uc9c1\uc811 \ud655\uc778';
}
async function seoulDebug(path, keys) {
  if (Date.now() - _seoulDebugAt < 20000) return jsonRes({ ok: false, error: 'wait 20s between debug calls' }, 429);
  _seoulDebugAt = Date.now();
  const k = keys[0];
  const std = { headers: { Accept: 'application/json', 'User-Agent': 'gildongmu/1.0' } };
  const browserLike = { headers: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    Accept: 'application/json, text/plain, */*', 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: 'https://data.seoul.go.kr/' } };
  const SW = 'swopenapi';
  const probes = [];
  // \u2500\u2500 \uc774 Worker \uac00 \uc4f0\ub294 \ubc29\uc2dd \uadf8\ub300\ub85c \u2500\u2500
  probes.push(await seoulProbe('std-https', SEOUL_BASE + '/' + encodeURIComponent(k) + '/json/' + path, std, keys, SW));
  probes.push(await seoulProbe('plain-https', SEOUL_BASE + '/' + encodeURIComponent(k) + '/json/' + path, undefined, keys, SW));
  probes.push(await seoulProbe('plain-http', SEOUL_BASE.replace(/^https:/, 'http:') + '/' + encodeURIComponent(k) + '/json/' + path, undefined, keys, SW));
  if (encodeURIComponent(k) !== k) probes.push(await seoulProbe('raw-key-https', SEOUL_BASE + '/' + k + '/json/' + path, undefined, keys, SW));
  // \u2500\u2500 \uacf5\uac1c sample \ud0a4(\ud0a4 \ubb38\uc81c\ub97c \ubc30\uc81c) \u00d7 \uc694\uccad \ubaa8\uc591 \u2500\u2500
  probes.push(await seoulProbe('sample-https', SEOUL_BASE + '/sample/json/realtimeStationArrival/0/5/' + '\uc11c\uc6b8', undefined, keys, SW));
  probes.push(await seoulProbe('sample-http', SEOUL_BASE.replace(/^https:/, 'http:') + '/sample/json/realtimeStationArrival/0/5/' + '\uc11c\uc6b8', undefined, keys, SW));
  probes.push(await seoulProbe('sample-ascii-path', SEOUL_BASE + '/sample/json/realtimeStationArrival/0/5/%EC%84%9C%EC%9A%B8', undefined, keys, SW));
  probes.push(await seoulProbe('sample-browser-headers', SEOUL_BASE + '/sample/json/realtimeStationArrival/0/5/%EC%84%9C%EC%9A%B8', browserLike, keys, SW));
  // \u2500\u2500 \ub2e4\ub978 \uc11c\uc6b8\uc2dc \ud638\uc2a4\ud2b8(\uc11c\uc6b8 \ub3c4\uba54\uc778 \uc804\uccb4\uac00 \ub9c9\ud78c \uac74\uc9c0) \u2500\u2500
  probes.push(await seoulProbe('swopenapi-root', SEOUL_BASE.replace(/\/api\/subway$/, '/'), undefined, keys, 'seoul-other'));
  probes.push(await seoulProbe('seoul-8088-http', 'http://openapi.seoul.go.kr:8088/sample/json/CardSubwayStatsNew/1/5/20220301/', undefined, keys, 'seoul-other'));
  probes.push(await seoulProbe('seoul-data-portal', 'https://data.seoul.go.kr/', undefined, keys, 'seoul-other'));
  // \u2500\u2500 \ub300\uc870\uad70(\uc774 Worker \uac00 \uc678\ubd80\ub85c \ub098\uac00\uae34 \ud558\ub294\uc9c0) \u2500\u2500
  probes.push(await seoulProbe('control-apis-data-go-kr', 'https://apis.data.go.kr/', undefined, keys, 'control'));
  probes.push(await seoulProbe('control-example', 'https://example.com/', undefined, keys, 'control'));
  return jsonRes({
    ok: true, debug: true, path, hint: seoulHint(probes),
    keyCount: keys.length, firstKeyShape: seoulKeyShape(k),
    variantInUse: SEOUL_VARIANTS[_seoulVariant].id, stats: seoulStats,
    probes
  });
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// /bus-stops?lat=..&lng=..&radius=800  \u2192  { ok, count, stops:[{node_id,node_nm,city_code,lat,lng,dist}] }
//   D1(subway-db) bus_stops \ud14c\uc774\ube14\uc758 \uc88c\ud45c \ubc94\uc704 \uc870\ud68c. \uc5f4 \uc774\ub984\uc774 \ub2ec\ub77c\ub3c4 \ub3d9\uc791\ud558\ub3c4\ub85d SELECT * \ud6c4
//   node_id/node_nm/city_code \uc758 \ud754\ud55c \ubcc4\uce6d\uc744 \ubaa8\ub450 \ubc1b\uc544 \uc900\ub2e4(\uc571\uc774 \uae30\ub300\ud558\ub294 \uc774\ub984\uc73c\ub85c \ub0b4\ubcf4\ub0b8\ub2e4).
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
function _hav(y1, x1, y2, x2) {
  const R = 6371e3, t = Math.PI / 180;
  const dy = (y2 - y1) * t, dx = (x2 - x1) * t;
  const a = Math.sin(dy / 2) ** 2 + Math.cos(y1 * t) * Math.cos(y2 * t) * Math.sin(dx / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
async function handleBusStops(url, env) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  if (!isFinite(lat) || !isFinite(lng) || lat < 32 || lat > 39.6 || lng < 124 || lng > 132.5) {
    return jsonRes({ ok: false, error: 'lat,lng \ud544\uc694(\uad6d\ub0b4 \uc88c\ud45c)' }, 400);
  }
  const radius = Math.min(3000, Math.max(100, parseInt(url.searchParams.get('radius') || '800', 10) || 800));
  const dLat = radius / 111000;
  const dLng = radius / (111000 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  try {
    const q = await env.DB.prepare(
      'SELECT * FROM bus_stops WHERE lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4 LIMIT 800'
    ).bind(lat - dLat, lat + dLat, lng - dLng, lng + dLng).all();
    const pick = (r, ...ks) => { for (const k of ks) if (r[k] != null && r[k] !== '') return r[k]; return ''; };
    const stops = [];
    for (const r of (q && q.results) || []) {
      const la = parseFloat(r.lat), ln = parseFloat(r.lng);
      if (!isFinite(la) || !isFinite(ln)) continue;
      const d = _hav(lat, lng, la, ln);
      if (d > radius) continue;
      stops.push({
        node_id:   String(pick(r, 'node_id', 'nodeid', 'nodeId', 'id', 'stop_id')),
        node_nm:   String(pick(r, 'node_nm', 'nodenm', 'nodeNm', 'name', 'stop_nm')),
        city_code: String(pick(r, 'city_code', 'citycode', 'cityCode')),
        lat: la, lng: ln, dist: Math.round(d)
      });
    }
    stops.sort((a, b) => a.dist - b.dist);
    return jsonRes({ ok: true, count: Math.min(stops.length, 60), stops: stops.slice(0, 60) });
  } catch (e) {
    return jsonRes({ ok: false, error: String((e && e.message) || e).slice(0, 160) }, 500);
  }
}

var __gd_inner = {
  async fetch(request, env, ctx) {
    _glCtx = ctx || null;
    _glEnv = env;
    const reqUrl = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // \uc0c1\ud0dc \ud655\uc778\uc6a9
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/health') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'gildongmu-bus-proxy',
          // \ubc30\ud3ec\ub41c \ucf54\ub4dc\uac00 \uc5b4\ub290 \ubc84\uc804\uc778\uc9c0 \ud655\uc778\uc6a9 \u2014 \uc0c8 \uae30\ub2a5\uc774 \uc548 \ubcf4\uc774\uba74 \uc5ec\uae30\ubd80\ud130 \ubcf8\ub2e4
          version: 'gentle-2026-10-01a',
          routes: ['/tago', '/seoul', '/kakao-local', '/bus-stops', '/news/all', '/news',
                   '/admin/news-collect', '/admin/news-debug', '/admin/news-purge', '/admin/kakao-purge'],
          keySet: !!env.DATA_GO_KR_KEY,
          kakaoKeySet: !!env.KAKAO_REST_KEY,
          seoulKeyCount: seoulKeys(env).length,
          seoulStats,   // upstream=\uc2e4\uc81c \ud638\ucd9c, mem/edge/coalesced=\uc544\ub080 \ud69f\uc218

          keyType: env.DATA_GO_KR_KEY
            ? (/%[0-9A-Fa-f]{2}/.test(env.DATA_GO_KR_KEY) ? 'encoding(\uc790\ub3d9 \ub514\ucf54\ub4dc \uc801\uc6a9)' : 'decoding')
            : 'none',
          allowed: ALLOWED_HOSTS
        }),
        { headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } }
      );
    }

    /* \u2500\u2500 \ud83d\udd12 \uad00\ub9ac \uacbd\ub85c \ubcf4\ud638 (2026-10-01) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     *   /admin/* \uc740 \uc608\uc804\uc5d4 \uc778\uc99d\uc774 \uc5c6\uc5b4 \ub204\uad6c\ub098 \ud638\ucd9c\ud560 \uc218 \uc788\uc5c8\ub2e4.
     *   \uc2dc\ud06c\ub9bf ADMIN_TOKEN \uc774 \uc5c6\uc73c\uba74 \ub2eb\ud78c\ub2e4(fail closed). \ud638\ucd9c: ?token=... \ub610\ub294 X-Admin-Token \ud5e4\ub354.
     */
    if (reqUrl.pathname.indexOf('/admin/') === 0) {
      const want = String(env.ADMIN_TOKEN || '');
      const got  = request.headers.get('X-Admin-Token') || reqUrl.searchParams.get('token') || '';
      if (!want || got !== want) return jsonRes({ ok: false, error: 'unauthorized' }, 401);
    }

    /* \u2500\u2500 \ud83d\ude8c \uc8fc\ubcc0 \uc815\ub958\uc7a5 (D1 \ubcf4\uc870 \uc870\ud68c) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     *   \uc571\uc740 TAGO \uac00 0\uac74\uc774\uac70\ub098 \uc2e4\ud328\ud560 \ub54c \uc774 \uacbd\ub85c\ub85c D1 \uc758 \uc815\ub958\uc7a5 \ubaa9\ub85d\uc744 \ubc1b\uc544 \uc4f4\ub2e4.
     *   (\uadf8\ub3d9\uc548 \uc774 \uc6cc\ucee4\uc5d0 \uc5c6\uc5b4 \ud56d\uc0c1 404 \u2192 \uc678\uacfd\u00b7TAGO \uc7a5\uc560 \uc9c0\uc5ed\uc5d0\uc11c '\uc815\ub958\uc7a5 \uc5c6\uc74c'\uc774 \ub410\ub2e4)
     */
    if (reqUrl.pathname === '/bus-stops') {
      return handleBusStops(reqUrl, env);
    }

    /* \u2500\u2500 \ud83d\udcf0 \ub274\uc2a4 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    if (reqUrl.pathname === '/news/all') {
      try {
        const per = reqUrl.searchParams.get('per');
        return jsonRes({ ok: true, per: Number(per) || NEWS_PER_CAT, cats: await readAllNews(env, per) });
      } catch (e) {
        return jsonRes({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }
    if (reqUrl.pathname === '/news') {
      try {
        const cat = reqUrl.searchParams.get('cat') || '';
        return jsonRes({ ok: true, cat, items: await readNews(env, cat, reqUrl.searchParams.get('limit')) });
      } catch (e) {
        return jsonRes({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }
    /* \uc810\uac80\uc6a9 \uc218\ub3d9 \uc2e4\ud589 \u2014 cron \uc774 \ub3c4\ub294\uc9c0 \ud655\uc778\ud560 \ub54c \uc4f4\ub2e4 */
    if (reqUrl.pathname === '/admin/news-collect') {
      try {
        // ?cat=\uc5f0\uc608 \u2192 \ud55c \uce74\ud14c\uace0\ub9ac\ub9cc (\uad6c\uae00\uc5d0 \ub9c9\ud788\uc9c0 \uc54a\ub294 \uc548\uc804\ud55c \ubc29\ubc95)
        // ?next=1  \u2192 \uc21c\ud658 \uc21c\uc11c\uc0c1 \ub2e4\uc74c \uce74\ud14c\uace0\ub9ac \ud558\ub098
        const one = reqUrl.searchParams.get('cat');
        if (one) {
          if (!NEWS_FEEDS[one]) return jsonRes({ ok: false, error: 'unknown cat: ' + one }, 400);
          await ensureNewsTable(env);
          return jsonRes({ ok: true, cat: one, ...(await collectCat(env, one)) });
        }
        if (reqUrl.searchParams.get('next')) {
          return jsonRes({ ok: true, ...(await collectNextCat(env)) });
        }
        return jsonRes({ ok: true, added: await collectAllNews(env) });
      } catch (e) { return jsonRes({ ok: false, error: String((e && e.message) || e) }, 500); }
    }
    /* \ud53c\ub4dc\uac00 \uc65c \ube44\ub294\uc9c0 \uc9d1\uc5b4\ub0b4\ub294 \uc9c4\ub2e8 \u2014 \uce74\ud14c\uace0\ub9ac \ud558\ub098\ub97c \ud53c\ub4dc\ubcc4\ub85c \ub72f\uc5b4\ubcf8\ub2e4 */
    if (reqUrl.pathname === '/admin/news-debug') {
      try {
        const cat = reqUrl.searchParams.get('cat') || '\uc5f0\uc608';
        const feeds = NEWS_FEEDS[cat] || [];
        const out = [];
        for (const u of feeds) {
          const row = { q: decodeURIComponent((/q=([^&]+)/.exec(u) || [])[1] || '') };
          try {
            const r = await fetch(u, {
              headers: { 'User-Agent': 'gildongmu-news/1.0', 'Accept': 'application/rss+xml,*/*' }
            });
            row.status = r.status;
            const t = await r.text();
            row.bytes = t.length;
            row.itemTags = (t.match(/<item[\s>]/g) || []).length;
            row.parsed = parseRss(t).length;
            if (!row.parsed) row.head = t.slice(0, 300);   // \ubb34\uc5c7\uc774 \uc654\ub294\uc9c0 \ub208\uc73c\ub85c \ubcf8\ub2e4
          } catch (e) {
            row.error = String((e && e.message) || e);
          }
          out.push(row);
        }
        return jsonRes({ ok: true, cat, feeds: out });
      } catch (e) {
        return jsonRes({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }
    /* \uc5b4\ub5a4 \ud615\ud0dc\uc758 \uac80\uc0c9\uc5b4\uac00 \ud1b5\uacfc\ud558\ub294\uc9c0 \ud55c \ubc88\uc5d0 \ube44\uad50\ud55c\ub2e4.
       503 \uc774 \uac80\uc0c9\uc5b4 \ub54c\ubb38\uc778\uc9c0, \uc18d\ub3c4 \uc81c\ud55c\uc778\uc9c0, \ud30c\ub77c\ubbf8\ud130 \ub54c\ubb38\uc778\uc9c0 \uac00\ub978\ub2e4. */
    if (reqUrl.pathname === '/admin/news-probe') {
      const q = reqUrl.searchParams.get('q') || '\uc544\uc774\ub3cc';
      const eq = encodeURIComponent(q);
      const cases = [
        { name: 'search+when14d', url: 'https://news.google.com/rss/search?q=' + eq + '+when:14d&hl=ko&gl=KR&ceid=KR:ko' },
        { name: 'search(\uae30\uac04\uc5c6\uc74c)', url: 'https://news.google.com/rss/search?q=' + eq + '&hl=ko&gl=KR&ceid=KR:ko' },
        { name: 'search(\ub85c\ucf00\uc77c\uc5c6\uc74c)', url: 'https://news.google.com/rss/search?q=' + eq },
        { name: 'ENTERTAINMENT\ud1a0\ud53d', url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko' },
        { name: '\uc804\uccb4\ud5e4\ub4dc\ub77c\uc778', url: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko' },
        { name: '\ube44\uad50\uc6a9(\ucf54\uc2a4\ud53c)', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('\ucf54\uc2a4\ud53c') + '+when:14d&hl=ko&gl=KR&ceid=KR:ko' }
      ];
      const out = [];
      for (const c of cases) {
        try {
          const r = await fetch(c.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; gildongmu/1.0)',
              'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9'
            }
          });
          const t = await r.text();
          out.push({
            name: c.name, status: r.status, bytes: t.length,
            items: (t.match(/<item[\s>]/g) || []).length,
            head: (t.match(/<item[\s>]/g) || []).length ? undefined : t.slice(0, 160)
          });
        } catch (e) {
          out.push({ name: c.name, error: String((e && e.message) || e) });
        }
        await sleep(1200);   // \uc0ac\uc774\ub97c \ucda9\ubd84\ud788 \ubc8c\ub824 \uc18d\ub3c4 \uc81c\ud55c \uc601\ud5a5\uc744 \ubc30\uc81c\ud55c\ub2e4
      }
      return jsonRes({ ok: true, q, cases: out });
    }
    if (reqUrl.pathname === '/admin/news-purge') {
      try { return jsonRes({ ok: true, deleted: await purgeOldNews(env) }); }
      catch (e) { return jsonRes({ ok: false, error: String((e && e.message) || e) }, 500); }
    }

    /* \u2500\u2500 \ud83d\udccd \uce74\uce74\uc624 \ub85c\uceec (D1 \uce90\uc2dc \uacbd\uc720) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     *   \uac19\uc740 \uc88c\ud45c(100m \uaca9\uc790)\u00b7\uac19\uc740 \uac80\uc0c9\uc5b4\ub294 \uce74\uce74\uc624\uc5d0 \ub2e4\uc2dc \ubb3b\uc9c0 \uc54a\ub294\ub2e4.
     */
    if (reqUrl.pathname === '/kakao-local') {
      return handleKakaoLocal(request, env);
    }
    if (reqUrl.pathname === '/admin/kakao-purge') {
      try { return jsonRes({ ok: true, purged: await purgeKakaoCache(env) }); }
      catch (e) { return jsonRes({ ok: false, error: String((e && e.message) || e) }, 500); }
    }

    /* \u2500\u2500 \ud83d\ude87 \uc11c\uc6b8 \uc9c0\ud558\ucca0 \uc2e4\uc2dc\uac04 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    if (reqUrl.pathname === '/seoul') {
      return handleSeoul(request, env);
    }
    if (reqUrl.pathname === '/relay/wanted') return relayWanted(request, env);
    if (reqUrl.pathname === '/relay/push')   return relayPush(request, env);

    if (reqUrl.pathname !== '/tago') {
      return new Response('Not found', { status: 404, headers: CORS });
    }

    const target = reqUrl.searchParams.get('url');
    if (!target) {
      return new Response('Missing url', { status: 400, headers: CORS });
    }

    let u;
    try {
      u = new URL(target);
    } catch (e) {
      return new Response('Bad url', { status: 400, headers: CORS });
    }

    if (!hostAllowed(u.hostname)) {
      return new Response('Forbidden host: ' + u.hostname, { status: 403, headers: CORS });
    }

    if (!env.DATA_GO_KR_KEY) {
      return new Response('Server key not configured', { status: 500, headers: CORS });
    }

    // \u2605 serviceKey \uc8fc\uc785 (\uc571\uc740 \ube48 \uac12\uc73c\ub85c \ubcf4\ub0c4)
    //   data.go.kr \ud0a4\ub294 Encoding(%2B..) / Decoding(+..) \ub450 \ud615\ud0dc\uac00 \uc788\ub2e4.
    //   Encoding \ud0a4\ub97c \uadf8\ub300\ub85c \ub123\uc73c\uba74 searchParams.set\uc774 \ub2e4\uc2dc \uc778\ucf54\ub529\ud574(%252B) \uc778\uc99d \uc2e4\ud328\ud55c\ub2e4.
    //   \u2192 \ud37c\uc13c\ud2b8 \uc778\ucf54\ub529\uc774 \ubcf4\uc774\uba74 \ud55c \ubc88 \ub514\ucf54\ub4dc\ud574 \uc6d0\ubcf8\uc73c\ub85c \ub418\ub3cc\ub9b0 \ub4a4 \ub123\ub294\ub2e4.
    let key = String(env.DATA_GO_KR_KEY || '');
    if (/%[0-9A-Fa-f]{2}/.test(key)) {
      try { key = decodeURIComponent(key); } catch (e) { /* \ub514\ucf54\ub4dc \uc2e4\ud328 \uc2dc \uc6d0\ubcf8 \uc0ac\uc6a9 */ }
    }
    u.searchParams.set('serviceKey', key);
    // \uc11c\uc6b8 TOPIS(ws.bus.go.kr)\ub294 "\ubcc0\uc218\uba85\uc740 \ub300\uc18c\ubb38\uc790\ub97c \uad6c\ubd84"\ud55c\ub2e4\uace0 \ubb38\uc11c\uc5d0 \uba85\uc2dc\ub3fc \uc788\uc5b4
    // \ub300\ubb38\uc790 S \ud615\ud0dc\ub3c4 \ud568\uaed8 \ub123\uc5b4 \ub454\ub2e4(\ubb34\uc2dc\ub418\uba74 \uadf8\ub9cc, \ud544\uc694\ud558\uba74 \uc774\ucabd\uc774 \uc778\uc2dd\ub41c\ub2e4).
    if (/(^|\.)ws\.bus\.go\.kr$/.test(u.hostname)) {
      u.searchParams.set('ServiceKey', key);
      u.searchParams.set('resultType', 'json');
    }

    // \uc11c\uc6b8 TOPIS\ub294 https\ub97c \uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uacbd\uc6b0\uac00 \uc788\uc5b4 http\ub85c \uc2dc\ub3c4 \ud6c4 \uc2e4\ud328 \uc2dc https \uc7ac\uc2dc\ub3c4
    const gk = usageKeyOfTago(u);
    const tryFetch = async (urlStr) => {
      usageAdd(gk);
      usageFlush(env);
      const r = await fetch(urlStr, {
        method: 'GET',
        headers: { 'Accept': '*/*', 'User-Agent': 'gildongmu/1.0' },
        cf: { cacheTtl: 5, cacheEverything: false }
      });
      if (!r.ok) usageAdd(gk + '.err');
      return r;
    };

    let upstream;
    try {
      upstream = await tryFetch(u.toString());
      if (!upstream.ok && u.protocol === 'https:') {
        const alt = new URL(u.toString());
        alt.protocol = 'http:';
        upstream = await tryFetch(alt.toString());
      }
    } catch (e) {
      try {
        const alt = new URL(u.toString());
        alt.protocol = u.protocol === 'https:' ? 'http:' : 'https:';
        upstream = await tryFetch(alt.toString());
      } catch (e2) {
        return new Response('Upstream error: ' + (e2.message || e2), { status: 502, headers: CORS });
      }
    }

    const body = await upstream.text();
    const ct = upstream.headers.get('Content-Type') || 'text/xml; charset=utf-8';

    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': ct, ...CORS }
    });
  },

  /* \u2500\u2500 \u23f0 \uc815\uae30 \uc2e4\ud589 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   *   wrangler.toml \uc758 crons \uc640 \uc9dd\uc744 \ub9de\ucd98\ub2e4.
   *     "20 4 * * *"  \u2192 \ub9e4\uc77c \uc0c8\ubcbd 4\uc2dc 20\ubd84, \uc624\ub798\ub41c \uae30\uc0ac \uc0ad\uc81c
   *     \uadf8 \uc678         \u2192 \ub274\uc2a4 \uc218\uc9d1
   */
  async scheduled(event, env, ctx) {
    const cron = String((event && event.cron) || '');
    if (cron.indexOf('20 4 ') === 0) {
      ctx.waitUntil(purgeOldNews(env).then((n) => console.log('[\ub274\uc2a4] \uc624\ub798\ub41c \uae30\uc0ac ' + n + '\uac74 \uc0ad\uc81c')));
      ctx.waitUntil(purgeKakaoCache(env).then((n) => console.log('[\uce74\uce74\uc624] \uc624\ub798\ub41c \uce90\uc2dc ' + n + '\uac74 \uc0ad\uc81c')).catch(() => {}));
      return;
    }
    ctx.waitUntil(collectNextCat(env).then((s) => console.log('[\ub274\uc2a4] \uc218\uc9d1 ' + JSON.stringify(s))));
  }
};
// ===== GUARD BEGIN (API abuse protection, tools/guard-wrap.js) =====
// \uae38\ub3d9\ubb34 \u2014 API \ub0a8\uc6a9 \u00b7 \ub9e4\ud06c\ub85c \ubc29\uc5b4 \uc5d4\uc9c4 \ubaa8\ub4c8 (route-v2 Worker \uc785\uad6c\uc5d0 \ubd99\uc774\ub294 \uc21c\uc218 \ud568\uc218) \u2014 2026-10-26 (s226)
//
// \u2605 \uc6d0\uce59(YJ): "API \ub0a8\uc6a9\u00b7\ub9e4\ud06c\ub85c \uacf5\uaca9\uc73c\ub85c \uc11c\ube44\uc2a4\uac00 \uacfc\ubd80\ud558\ub418\uc9c0 \uc54a\uac8c, \uc0ac\uc6a9\uc790\ub294 \ubd88\ud3b8\ud568\uc774 \uc5c6\uac8c."
//   - \ubcf4\ud1b5 \uc0ac\uc6a9\uc790\ub294 \uc808\ub300 \uac78\ub9ac\uc9c0 \uc54a\uc744 \ub109\ub109\ud55c \ud55c\ub3c4(\ubc84\ud0b7)\ub9cc \ub454\ub2e4. \ud55c\ub3c4\uc5d0 \uac78\ub824\ub3c4 \uc571\uc774 '\uc870\uc6a9\ud788 \ud55c \ubc88 \ub2e4\uc2dc' \ubcf4\ub0b4\uc11c \ud654\uba74\uc5d0\ub294 \uc544\ubb34 \uc77c\ub3c4 \uc548 \ubcf4\uc778\ub2e4(NetPost).
//   - \uc694\uccad\ub9c8\ub2e4 \uc571\uc774 \uc124\uce58 \ub54c \ub9cc\ub4e0 \ubb34\uc791\uc704 \ubc88\ud638(X-Gdm-Id)\ub97c \uc2e4\uc5b4 \ubcf4\ub0b8\ub2e4. \ud55c \uae30\uae30 = \ud55c \ud1b5. \uc774\ub3d9\ud1b5\uc2e0 \uacf5\uc720 IP(CGNAT) \ub4a4\uc758 \uc5ec\ub7ec \uc0ac\uc6a9\uc790\uac00 \uc11c\ub85c\uc758 \ud55c\ub3c4\ub97c \uac09\uc544\uba39\uc9c0 \uc54a\ub294\ub2e4.
//     \ubc88\ud638\ub97c \uc694\uccad\ub9c8\ub2e4 \ubc14\uafd4 \uac00\uba70 \uc6b0\ud68c\ud558\ub824\ub294 \uc2dc\ub3c4(\ud55c IP \uc5d0\uc11c 1\ubd84\uc5d0 \ubc88\ud638 120\uac1c \ub118\uac8c)\ub294 \ubc88\ud638\ub97c \ubb34\uc2dc\ud558\uace0 IP \ud558\ub098\ub85c \ubb36\ub294\ub2e4.
//   - \uc0c1\ud55c\uc774 \ud55c \uad70\ub370\ub85c\ub9cc \uc624\uc9c0 \uc54a\uac8c \uc138 \uacb9: \u2460 IP \uc804\uccb4 \uc0c1\ud55c(\uc544\uc8fc \ub109\ub109) \u2461 \uc885\ub958\ubcc4 \ud1b5(\uac00\ubcbc\uc6b4 \ud654\uba74 \u00b7 \ubb34\uac70\uc6b4 \uc870\ud68c \u00b7 \uad00\ub9ac/\uc9c4\ub2e8\uc6a9) \u2462 \uc5f0\uc774\uc5b4 \ud55c\ub3c4\ub97c \ub118\uc73c\uba74 \uc7a0\uae50(60\ucd08\ubd80\ud130 \ucd5c\ub300 10\ubd84) \ucc28\ub2e8.
//   - \uad00\ub9ac\u00b7\uc9c4\ub2e8 \uc8fc\uc18c(debug \u00b7 probe \u00b7 fill \u00b7 live-test \u2026)\ub294 \uc571\uc774 \uc548 \uc4f4\ub2e4 \u2192 \uc544\uc8fc \uc791\uc740 \ud55c\ub3c4 + \ube44\ubc00\uac12(env.ADMIN_KEY)\uc774 \uc788\uc73c\uba74 \uadf8\uac83 \uc5c6\uc774\ub294 403.
//   - \ubb34\uac70\uc6b4 \uc870\ud68c\uac00 \ud55c \uc778\uc2a4\ud134\uc2a4\uc5d0 \ub3d9\uc2dc\uc5d0 \ub108\ubb34 \ubab0\ub9ac\uba74(64) \ub300\uae30\uc2dc\ud0a4\uc9c0 \uc54a\uace0 \ubc14\ub85c 503 + Retry-After(\uc571\uc774 \uc870\uc6a9\ud788 \ud55c \ubc88 \ub2e4\uc2dc).
//   - \uc774 \ubaa8\ub4c8\uc774 \ud2c0\ub824\ub3c4 \uc0ac\uc6a9\uc790 \uc694\uccad\uc744 \ub9c9\uc9c0 \uc54a\ub294\ub2e4(\uc6cc\ucee4 \uc5f0\uacb0\ubd80\uac00 \uc608\uc678\ub294 \ud1b5\uacfc\uc2dc\ud0a8\ub2e4).
// \ud55c\uacc4(\uc815\uc9c1): \uc6cc\ucee4 \uc778\uc2a4\ud134\uc2a4\ub9c8\ub2e4 \ub530\ub85c \uc13c\ub2e4(\ud55c \uc778\uc2a4\ud134\uc2a4 \uc548\uc5d0\uc11c\ub9cc \uc815\ud655). \uc5ec\ub7ec \uc778\uc2a4\ud134\uc2a4\uc5d0 \ud769\uc5b4\uc9c4 \ubd84\uc0b0 \uacf5\uaca9\uc740 Cloudflare \uc18d\ub3c4 \uc81c\ud55c \ubc14\uc778\ub529(GDM_RL)\uc774 \uc788\uc73c\uba74 \uadf8\uac83\uc73c\ub85c \ud55c \ubc88 \ub354 \ub9c9\ub294\ub2e4.
'use strict';

var GD_V = 1;
// \uc885\ub958\ubcc4 \ud1b5: cap = \ud55c \ubc88\uc5d0 \ubab0\uc544 \ubcf4\ub0bc \uc218 \uc788\ub294 \uc591(\ubc84\uc2a4\ud2b8) \u00b7 rate = \ucd08\ub2f9 \ucc44\uc6cc\uc9c0\ub294 \uc591
var GD_CFG = {
  light: { cap: 60, rate: 4 },          // \ud654\uba74 \u00b7 \ud0ed \u00b7 \uce69 \ub204\ub974\uae30 \u2026 (1\ucd08\uc5d0 4\ubc88\uc744 \uacc4\uc18d \ub20c\ub7ec\ub3c4 \uc548 \uac78\ub9b0\ub2e4)
  heavy: { cap: 40, rate: 2 },          // \uc678\ubd80 \uc870\ud68c\uac00 \ub4dc\ub294 \uac83: \uae38\ucc3e\uae30 \u00b7 \ubc84\uc2a4/\uc9c0\ud558\ucca0 \ub3c4\ucc29 \u00b7 AI \ubb38\uad6c \u00b7 \uc9c0\ub3c4 (\ubd84\ub2f9 120\ubc88)
  write: { cap: 20, rate: 0.5 },        // \uae00 \u00b7 \ub313\uae00 \u00b7 \uc81c\ubcf4 \u00b7 \ucc44\ud305 \uc4f0\uae30(\ub3c4\ubc30 \ubc29\uc9c0): \ud55c \ubc88\uc5d0 20\uac1c, \uc774\ud6c4 \ubd84\ub2f9 30\uac1c (\uc0ac\ub78c\uc774 \uce58\ub294 \uc18d\ub3c4\ub294 \uac78\ub9ac\uc9c0 \uc54a\ub294\ub2e4)
  admin: { cap: 5, rate: 1 / 12 },      // \uad00\ub9ac\u00b7\uc9c4\ub2e8 \uc8fc\uc18c: \ubd84\ub2f9 5\ubc88
  total: { cap: 600, rate: 30 }         // IP \ud558\ub098\uc758 \uc804\uccb4(\uacf5\uc720 IP \ub3c4 \ub109\ub109): \ud55c \ubc88\uc5d0 600 \u00b7 \ucd08\ub2f9 30
};
var GD_BAN_VIO = 8;                     // 30\ucd08 \uc548\uc5d0 \ud55c\ub3c4\ub97c 8\ubc88 \ub118\uc73c\uba74
var GD_BAN_MS = 60000, GD_BAN_MAX_MS = 600000;
var GD_SPOOF_IDS = 120;                 // \ud55c IP \uac00 1\ubd84\uc5d0 \ubc88\ud638\ub97c \uc774\ub9cc\ud07c \ub118\uac8c \ubc14\uafb8\uba74 \ubc88\ud638\ub97c \ubb34\uc2dc\ud55c\ub2e4
var GD_BATCH_COST = 3;                  // \ubb36\uc74c \uc694\uccad(/screen/batch)\uc740 \uc548\uc5d0 \ucd5c\ub300 16\uac1c\uac00 \ub4e0\ub2e4 \u2192 3\uce78

var GD_ADMIN_PATHS = ['/stops-near', '/debug-shared-nostop', '/debug-ghost-routes', '/live-usage', '/live-test', '/bt-verify', '/bt-fill', '/ld-pairs-warm',
  '/kric-rederive', '/kric-status', '/kric-ingest', '/kric-probe', '/kric-derive', '/est-status', '/xfer-status', '/xfer-probe', '/tago-probe', '/bus-split-test'];
var GD_HEAVY_PATHS = ['/route-v2', '/route-v2-app', '/route-v2-debug', '/warm', '/ride/start', '/ride/buspick', '/reco-text', '/commute-brief', '/widget-say', '/suggest',
  '/food-pub', '/bus-tago', '/screen/map', '/next-train', '/board-live', '/home-brief', '/scene', '/ride-eta', '/ride-track', '/ride-standby', '/pos-fuse'];

var GD_ST = { b: new Map(), ban: new Map(), vio: new Map(), ids: new Map(), gcAt: 0, stat: { ok: 0, limited: 0, banned: 0, admin: 0, spoof: 0 } };

// \ub2e4\ub978 \uc6cc\ucee4(\uac8c\uc2dc\ud310 \u00b7 \ubc84\uc2a4 \u00b7 \uc74c\uc2dd \u00b7 \uc1fc\ud551 \u00b7 \uc911\uacc4)\ub294 o.cls(\uc885\ub958 \uc774\ub984 \u00b7 'free' \uba74 \uac80\uc0ac \uc5c6\uc774 \ud1b5\uacfc)\uc640 o.cfg(\uc885\ub958\ubcc4 \ud1b5 \ud06c\uae30 \ub36e\uc5b4\uc4f0\uae30)\ub97c \ub118\uae34\ub2e4.
function gdClass(path) {
  var p = String(path || '');
  if (GD_ADMIN_PATHS.indexOf(p) >= 0) return 'admin';
  if (GD_HEAVY_PATHS.indexOf(p) >= 0) return 'heavy';
  return 'light';
}
function gdIid(s) { s = String(s == null ? '' : s); return /^[A-Za-z0-9_-]{8,48}$/.test(s) ? s : ''; }

// \ud1b5\uc5d0\uc11c cost \uce78\uc744 \uaebc\ub0b8\ub2e4. { ok, waitMs }
function gdTake(key, cap, rate, cost, now) {
  var b = GD_ST.b.get(key);
  if (!b) { b = { v: cap, t: now }; GD_ST.b.set(key, b); }
  else { b.v = Math.min(cap, b.v + (now - b.t) / 1000 * rate); b.t = now; }
  if (b.v >= cost) { b.v -= cost; return { ok: true, waitMs: 0 }; }
  return { ok: false, waitMs: Math.ceil((cost - b.v) / rate * 1000) };
}

function gdGc(now) {
  if (now - GD_ST.gcAt < 30000 && GD_ST.b.size < 20000) return;
  GD_ST.gcAt = now;
  GD_ST.b.forEach(function (b, k) { if (now - b.t > 300000) GD_ST.b.delete(k); });
  GD_ST.ban.forEach(function (x, k) { if (x.until < now - 600000) GD_ST.ban.delete(k); });
  GD_ST.vio.forEach(function (x, k) { if (now - x.t0 > 600000) GD_ST.vio.delete(k); });
  GD_ST.ids.forEach(function (x, k) { if (now - x.t0 > 120000) GD_ST.ids.delete(k); });
  if (GD_ST.b.size > 50000) GD_ST.b.clear();                       // \uba54\ubaa8\ub9ac \ubc29\uc5b4(\uacf5\uaca9\uc73c\ub85c \ud0a4\uac00 \ud3ed\uc99d\ud574\ub3c4)
  if (GD_ST.ids.size > 20000) GD_ST.ids.clear();
}

function gdCfgOf(o, cls) { return (o.cfg && o.cfg[cls]) || GD_CFG[cls] || GD_CFG.light; }

// \ud55c \uc694\uccad\uc744 \ud1b5\uacfc\uc2dc\ud0ac\uae4c. o = { ip, iid, path, method, now, adminSet, adminOk }
//   \u2192 { ok:true, cls } | { ok:false, status, retryS, reason, cls }
function gdDecide(o) {
  var now = Number(o.now) || 0, ip = String(o.ip || 'unknown'), method = String(o.method || 'GET').toUpperCase();
  var path = String(o.path || '/'), cls = o.cls ? String(o.cls) : gdClass(path);
  if (method === 'OPTIONS' || cls === 'free') return { ok: true, cls: cls };
  gdGc(now);
  if (cls === 'admin') {
    if (o.adminSet && !o.adminOk) { GD_ST.stat.admin++; return { ok: false, status: 403, retryS: 0, reason: 'admin', cls: cls }; }
    var ca = gdCfgOf(o, 'admin');
    var ta = gdTake('A|' + ip, ca.cap, ca.rate, 1, now);
    if (!ta.ok) { GD_ST.stat.limited++; return { ok: false, status: 429, retryS: Math.max(1, Math.ceil(ta.waitMs / 1000)), reason: 'admin-rate', cls: cls }; }
    return { ok: true, cls: cls };
  }
  // \ubc88\ud638(\uae30\uae30) \uad6c\ubd84 \u2014 \ud55c IP \uac00 \ubc88\ud638\ub97c \ub9c8\uad6c \ubc14\uafb8\uba74 \ubb34\uc2dc
  var iid = gdIid(o.iid), spoof = false;
  if (iid) {
    var rec = GD_ST.ids.get(ip);
    if (!rec || now - rec.t0 > 60000) { rec = { t0: now, set: new Set() }; GD_ST.ids.set(ip, rec); }
    rec.set.add(iid);
    if (rec.set.size > GD_SPOOF_IDS) { spoof = true; iid = ''; GD_ST.stat.spoof++; }
  }
  var who = ip + '|' + iid;
  var ban = GD_ST.ban.get(who);
  if (ban && ban.until > now) { GD_ST.stat.banned++; return { ok: false, status: 429, retryS: Math.max(1, Math.ceil((ban.until - now) / 1000)), reason: 'ban', cls: cls }; }
  var cost = path === '/screen/batch' ? GD_BATCH_COST : 1;
  var c = gdCfgOf(o, cls), ct = gdCfgOf(o, 'total');
  var t1 = gdTake('T|' + ip, ct.cap, ct.rate, cost, now);
  var t2 = t1.ok ? gdTake(cls + '|' + who, spoof ? Math.ceil(c.cap / 2) : c.cap, spoof ? c.rate / 2 : c.rate, cost, now) : t1;
  if (t2.ok) { GD_ST.stat.ok++; return { ok: true, cls: cls }; }
  // \ud55c\ub3c4 \ucd08\uacfc \u2014 \uc5f0\uc774\uc5b4 \ub118\uc73c\uba74 \uc7a0\uae50 \ucc28\ub2e8(60\ucd08 \u2192 120\ucd08 \u2026 \ucd5c\ub300 10\ubd84)
  GD_ST.stat.limited++;
  var v = GD_ST.vio.get(who);
  if (!v || now - v.t0 > 30000) { v = { n: 0, t0: now, lvl: v ? v.lvl : 0 }; GD_ST.vio.set(who, v); }
  v.n++;
  if (v.n >= GD_BAN_VIO) {
    var ms = Math.min(GD_BAN_MAX_MS, GD_BAN_MS * Math.pow(2, Math.min(4, v.lvl)));
    GD_ST.ban.set(who, { until: now + ms }); v.lvl++; v.n = 0; v.t0 = now;
    return { ok: false, status: 429, retryS: Math.ceil(ms / 1000), reason: 'ban', cls: cls };
  }
  return { ok: false, status: 429, retryS: Math.max(1, Math.ceil(t2.waitMs / 1000)), reason: 'rate', cls: cls };
}
// API \ub0a8\uc6a9 \ubc29\uc5b4 Worker \uc5f0\uacb0\ubd80 \u2014 route-v2 \uc758 fetch \ub9e8 \uc55e\uc5d0\uc11c guardEnter \ub97c \ubd80\ub978\ub2e4(engine/guard.js \uc758 gdDecide \ub97c \uc4f4\ub2e4).
//   guardEnter(request, env) \u2192 { res, done } \u2014 res \uac00 \uc788\uc73c\uba74 \uadf8 \uc751\ub2f5(429/403/503)\uc744 \uadf8\ub300\ub85c \ub3cc\ub824\uc8fc\uace0, \uc5c6\uc73c\uba74 \ud1b5\uacfc(\ub05d\ub098\uba74 done() \uc744 \ubd80\ub978\ub2e4).
//   \uc774 \uc5f0\uacb0\ubd80\ub294 \uc5b4\ub5a4 \uc624\ub958\uac00 \ub098\ub3c4 \uc694\uccad\uc744 \ub9c9\uc9c0 \uc54a\ub294\ub2e4(\ud1b5\uacfc). \uc120\ud0dd: env.GDM_RL(Cloudflare \uc18d\ub3c4 \uc81c\ud55c \ubc14\uc778\ub529, .limit({key}))\uc774 \uc788\uc73c\uba74 \ud55c \ubc88 \ub354 \uac74\ub2e4.
var GD_HEAVY_MAX = 64;                   // \ud55c \uc778\uc2a4\ud134\uc2a4\uc5d0\uc11c \ub3d9\uc2dc\uc5d0 \ucc98\ub9ac \uc911\uc778 \ubb34\uac70\uc6b4 \uc870\ud68c \uc0c1\ud55c \u2014 \ub118\uc73c\uba74 \uc904 \uc138\uc6b0\uc9c0 \uc54a\uace0 \ubc14\ub85c 503
var GD_INFLIGHT = { heavy: 0 };
function gdReject(d) {
  var h = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (d.retryS > 0) h["Retry-After"] = String(d.retryS);
  return new Response(JSON.stringify({ ok: false, error: d.status === 403 ? "forbidden" : d.status === 503 ? "busy" : "rate", retry: d.retryS || 0 }), { status: d.status, headers: h });
}
//   opt(\uc120\ud0dd \u00b7 \ub2e4\ub978 \uc6cc\ucee4\uc6a9) = { cls: function (path, method) \u2192 'light'|'heavy'|'write'|'admin'|'free', cfg: { \uc885\ub958: { cap, rate } }, heavyMax }
//   CF-Connecting-IP \uac00 \uc5c6\ub294 \uc694\uccad(\uc6cc\ucee4\ub07c\ub9ac \uc11c\ube44\uc2a4 \ubc14\uc778\ub529\uc73c\ub85c \ubd80\ub974\ub294 \ub0b4\ubd80 \ud638\ucd9c)\uc740 \uac80\uc0ac\ud558\uc9c0 \uc54a\ub294\ub2e4 \u2014 \ubc14\uae65\uc5d0\uc11c \uc624\ub294 \uc694\uccad\uc5d0\ub294 \ud074\ub77c\uc6b0\ub4dc\ud50c\ub808\uc5b4\uac00 \ud56d\uc0c1 \ubd99\uc778\ub2e4.
async function guardEnter(request, env, opt) {
  var none = { res: null, done: function () { } };
  try {
    var url = new URL(request.url), hd = request.headers;
    if (!(hd.get("CF-Connecting-IP") || hd.get("cf-connecting-ip"))) return none;
    opt = opt || {};
    var adminSet = !!(env && env.ADMIN_KEY && typeof env.ADMIN_KEY === "string");
    var adminOk = adminSet && (hd.get("x-admin-key") === env.ADMIN_KEY || url.searchParams.get("k") === env.ADMIN_KEY);
    var d = gdDecide({ ip: hd.get("CF-Connecting-IP") || hd.get("cf-connecting-ip"), iid: hd.get("X-Gdm-Id"), path: url.pathname, method: request.method, now: Date.now(), adminSet: adminSet, adminOk: adminOk, cls: opt.cls ? opt.cls(url.pathname, request.method) : undefined, cfg: opt.cfg });
    if (!d.ok) return { res: gdReject(d), done: none.done };
    if (request.method !== "OPTIONS" && d.cls !== "admin" && d.cls !== "free" && env && env.GDM_RL && typeof env.GDM_RL.limit === "function") {
      try {
        var r = await env.GDM_RL.limit({ key: (hd.get("CF-Connecting-IP") || "unknown") + "|" + d.cls });
        if (r && r.success === false) return { res: gdReject({ status: 429, retryS: 10, reason: "rl" }), done: none.done };
      } catch (e2) { }
    }
    if (d.cls === "heavy") {
      if (GD_INFLIGHT.heavy >= (opt.heavyMax || GD_HEAVY_MAX)) return { res: gdReject({ status: 503, retryS: 2, reason: "busy" }), done: none.done };
      GD_INFLIGHT.heavy++;
      var fin = false;
      return { res: null, done: function () { if (!fin) { fin = true; GD_INFLIGHT.heavy = Math.max(0, GD_INFLIGHT.heavy - 1); } } };
    }
    return none;
  } catch (e) { return none; }
}
var GD_OPT = { cls: function (p, m) { if (p.indexOf("/relay/") === 0) return "free"; if (p.indexOf("/admin/") === 0) return "admin"; if (p === "/tago" || p === "/seoul" || p === "/kakao-local" || p === "/bus-stops") return "heavy"; return "light"; }, cfg: {"heavy":{"cap":60,"rate":3},"light":{"cap":120,"rate":10},"admin":{"cap":30,"rate":0.5}}, heavyMax: 64 };
function gdWrap(inner) {
  var out = {};
  for (var k in inner) out[k] = inner[k];
  out.fetch = async function (request, env, ctx) {
    var g = await guardEnter(request, env, GD_OPT);
    if (g.res) return g.res;
    try { return await inner.fetch(request, env, ctx); } finally { g.done(); }
  };
  return out;
}
// ===== GUARD END =====
export default gdWrap(__gd_inner);
