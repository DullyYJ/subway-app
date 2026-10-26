// 길동무 — API 남용 · 매크로 방어 엔진 모듈 (route-v2 Worker 입구에 붙이는 순수 함수) — 2026-10-26 (s226)
//
// ★ 원칙(YJ): "API 남용·매크로 공격으로 서비스가 과부하되지 않게, 사용자는 불편함이 없게."
//   - 보통 사용자는 절대 걸리지 않을 넉넉한 한도(버킷)만 둔다. 한도에 걸려도 앱이 '조용히 한 번 다시' 보내서 화면에는 아무 일도 안 보인다(NetPost).
//   - 요청마다 앱이 설치 때 만든 무작위 번호(X-Gdm-Id)를 실어 보낸다. 한 기기 = 한 통. 이동통신 공유 IP(CGNAT) 뒤의 여러 사용자가 서로의 한도를 갉아먹지 않는다.
//     번호를 요청마다 바꿔 가며 우회하려는 시도(한 IP 에서 1분에 번호 120개 넘게)는 번호를 무시하고 IP 하나로 묶는다.
//   - 상한이 한 군데로만 오지 않게 세 겹: ① IP 전체 상한(아주 넉넉) ② 종류별 통(가벼운 화면 · 무거운 조회 · 관리/진단용) ③ 연이어 한도를 넘으면 잠깐(60초부터 최대 10분) 차단.
//   - 관리·진단 주소(debug · probe · fill · live-test …)는 앱이 안 쓴다 → 아주 작은 한도 + 비밀값(env.ADMIN_KEY)이 있으면 그것 없이는 403.
//   - 무거운 조회가 한 인스턴스에 동시에 너무 몰리면(64) 대기시키지 않고 바로 503 + Retry-After(앱이 조용히 한 번 다시).
//   - 이 모듈이 틀려도 사용자 요청을 막지 않는다(워커 연결부가 예외는 통과시킨다).
// 한계(정직): 워커 인스턴스마다 따로 센다(한 인스턴스 안에서만 정확). 여러 인스턴스에 흩어진 분산 공격은 Cloudflare 속도 제한 바인딩(GDM_RL)이 있으면 그것으로 한 번 더 막는다.
'use strict';

var GD_V = 1;
// 종류별 통: cap = 한 번에 몰아 보낼 수 있는 양(버스트) · rate = 초당 채워지는 양
var GD_CFG = {
  light: { cap: 60, rate: 4 },          // 화면 · 탭 · 칩 누르기 … (1초에 4번을 계속 눌러도 안 걸린다)
  heavy: { cap: 40, rate: 2 },          // 외부 조회가 드는 것: 길찾기 · 버스/지하철 도착 · AI 문구 · 지도 (분당 120번)
  admin: { cap: 5, rate: 1 / 12 },      // 관리·진단 주소: 분당 5번
  total: { cap: 600, rate: 30 }         // IP 하나의 전체(공유 IP 도 넉넉): 한 번에 600 · 초당 30
};
var GD_BAN_VIO = 8;                     // 30초 안에 한도를 8번 넘으면
var GD_BAN_MS = 60000, GD_BAN_MAX_MS = 600000;
var GD_SPOOF_IDS = 120;                 // 한 IP 가 1분에 번호를 이만큼 넘게 바꾸면 번호를 무시한다
var GD_BATCH_COST = 3;                  // 묶음 요청(/screen/batch)은 안에 최대 16개가 든다 → 3칸

var GD_ADMIN_PATHS = ['/stops-near', '/debug-shared-nostop', '/debug-ghost-routes', '/live-usage', '/live-test', '/bt-verify', '/bt-fill', '/ld-pairs-warm',
  '/kric-rederive', '/kric-status', '/kric-ingest', '/kric-probe', '/kric-derive', '/est-status', '/xfer-status', '/xfer-probe', '/tago-probe', '/bus-split-test'];
var GD_HEAVY_PATHS = ['/route-v2', '/route-v2-app', '/route-v2-debug', '/warm', '/ride/start', '/ride/buspick', '/reco-text', '/commute-brief', '/widget-say', '/suggest',
  '/food-pub', '/bus-tago', '/screen/map', '/next-train', '/board-live', '/home-brief', '/scene', '/ride-eta', '/ride-track', '/ride-standby', '/pos-fuse'];

var GD_ST = { b: new Map(), ban: new Map(), vio: new Map(), ids: new Map(), gcAt: 0, stat: { ok: 0, limited: 0, banned: 0, admin: 0, spoof: 0 } };

function gdClass(path) {
  var p = String(path || '');
  if (GD_ADMIN_PATHS.indexOf(p) >= 0) return 'admin';
  if (GD_HEAVY_PATHS.indexOf(p) >= 0) return 'heavy';
  return 'light';
}
function gdIid(s) { s = String(s == null ? '' : s); return /^[A-Za-z0-9_-]{8,48}$/.test(s) ? s : ''; }

// 통에서 cost 칸을 꺼낸다. { ok, waitMs }
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
  if (GD_ST.b.size > 50000) GD_ST.b.clear();                       // 메모리 방어(공격으로 키가 폭증해도)
  if (GD_ST.ids.size > 20000) GD_ST.ids.clear();
}

// 한 요청을 통과시킬까. o = { ip, iid, path, method, now, adminSet, adminOk }
//   → { ok:true, cls } | { ok:false, status, retryS, reason, cls }
function gdDecide(o) {
  var now = Number(o.now) || 0, ip = String(o.ip || 'unknown'), method = String(o.method || 'GET').toUpperCase();
  var path = String(o.path || '/'), cls = gdClass(path);
  if (method === 'OPTIONS') return { ok: true, cls: cls };
  gdGc(now);
  if (cls === 'admin') {
    if (o.adminSet && !o.adminOk) { GD_ST.stat.admin++; return { ok: false, status: 403, retryS: 0, reason: 'admin', cls: cls }; }
    var ta = gdTake('A|' + ip, GD_CFG.admin.cap, GD_CFG.admin.rate, 1, now);
    if (!ta.ok) { GD_ST.stat.limited++; return { ok: false, status: 429, retryS: Math.max(1, Math.ceil(ta.waitMs / 1000)), reason: 'admin-rate', cls: cls }; }
    return { ok: true, cls: cls };
  }
  // 번호(기기) 구분 — 한 IP 가 번호를 마구 바꾸면 무시
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
  var c = GD_CFG[cls];
  var t1 = gdTake('T|' + ip, GD_CFG.total.cap, GD_CFG.total.rate, cost, now);
  var t2 = t1.ok ? gdTake(cls + '|' + who, spoof ? Math.ceil(c.cap / 2) : c.cap, spoof ? c.rate / 2 : c.rate, cost, now) : t1;
  if (t2.ok) { GD_ST.stat.ok++; return { ok: true, cls: cls }; }
  // 한도 초과 — 연이어 넘으면 잠깐 차단(60초 → 120초 … 최대 10분)
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

if (typeof module !== 'undefined' && module.exports) module.exports = { gdDecide: gdDecide, gdClass: gdClass, gdIid: gdIid, gdTake: gdTake, GD_CFG: GD_CFG, GD_ST: GD_ST, GD_ADMIN_PATHS: GD_ADMIN_PATHS, GD_HEAVY_PATHS: GD_HEAVY_PATHS, GD_SPOOF_IDS: GD_SPOOF_IDS, GD_BAN_VIO: GD_BAN_VIO, GD_V: GD_V };
