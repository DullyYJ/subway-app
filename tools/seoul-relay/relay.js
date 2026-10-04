// 길동무 서울 지하철 실시간 중계 (한국 IP 노트북용) — 의존 패키지 없음, Node 18 이상
//   30초마다가 아니라 '앱이 지금 찾는 경로'만 서울 API 로 불러 와 Cloudflare(gentle-lab)에 올린다.
//   노트북은 밖으로 요청만 보낸다(포트 열기·고정 IP 필요 없음). 사용자 수와 상관없이 호출량은 일정하다.
//   사용:  node relay.js            (계속 실행)
//          node relay.js --check    (설정·서울 응답·워커 인증을 한 번 점검하고 끝)
const fs = require('fs'), path = require('path');

function loadEnv(file) {
  const out = {};
  try {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) return;
      out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* .env 없으면 환경변수만 */ }
  return out;
}
function makeConfig(env) {
  const g = (k, d) => (env[k] != null && env[k] !== '' ? env[k] : d);
  return {
    workerUrl: String(g('WORKER_URL', 'https://gentle-lab-7e47subway-api.phg0643.workers.dev')).replace(/\/+$/, ''),
    token: String(g('RELAY_TOKEN', '')),
    keys: String(g('SEOUL_API_KEYS', g('SEOUL_API_KEY', ''))).split(',').map((s) => s.trim()).filter(Boolean),
    seoulBase: String(g('SEOUL_BASE', 'https://swopenapi.seoul.go.kr/api/subway')).replace(/\/+$/, ''),
    perKeyDaily: parseInt(g('DAILY_BUDGET_PER_KEY', '950'), 10),   // 키당 하루 한도(서울 기본 1,000건)보다 조금 낮게
    pollSec: Math.max(3, parseInt(g('POLL_SEC', '8'), 10)),
    arrivalRefetchSec: parseInt(g('ARRIVAL_REFETCH_SEC', '25'), 10),
    positionRefetchSec: parseInt(g('POSITION_REFETCH_SEC', '30'), 10),
    stateFile: g('STATE_FILE', path.join(__dirname, 'state.json')),
  };
}

// ── 날짜(한국 시각) ──
function kst(nowMs) { return new Date(nowMs + 9 * 3600000); }
function kstDay(nowMs) { return kst(nowMs).toISOString().slice(0, 10); }
// 오늘 남은 '운행 시간'(초). 01:00~05:00 은 운행이 없으므로 세지 않는다.
function serviceSecondsLeft(nowMs) {
  const d = kst(nowMs), sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  const START = 5 * 3600, END = 24 * 3600, DEAD_FROM = 1 * 3600;
  let left = 0;
  if (sec < DEAD_FROM) left += DEAD_FROM - sec;              // 00:00~01:00 남은 부분
  left += END - Math.max(sec, START);                          // 05:00~24:00 남은 부분
  return Math.max(60, left);
}

// ── 하루 호출 예산(키별) ──
class Budget {
  constructor(keys, perKeyDaily, state) {
    this.keys = keys; this.cap = perKeyDaily;
    this.day = (state && state.day) || ''; this.used = (state && state.used) || {}; this.dead = (state && state.dead) || {};
    this.tokens = 3; this.last = 0;
  }
  roll(nowMs) {
    const d = kstDay(nowMs);
    if (d !== this.day) { this.day = d; this.used = {}; this.dead = {}; }
  }
  remaining(nowMs) {
    this.roll(nowMs);
    let r = 0;
    this.keys.forEach((k, i) => { if (!this.dead[i]) r += Math.max(0, this.cap - (this.used[i] || 0)); });
    return r;
  }
  // 남은 호출을 남은 운행 시간에 고르게 나눠 쓴다(토큰 버킷, 한 번에 최대 12건)
  refill(nowMs) {
    if (!this.last) { this.last = nowMs; return; }
    const dt = (nowMs - this.last) / 1000; this.last = nowMs;
    const rate = this.remaining(nowMs) / serviceSecondsLeft(nowMs);
    this.tokens = Math.min(12, this.tokens + dt * rate);
  }
  pickKey(nowMs) {
    this.roll(nowMs);
    let best = -1, bestLeft = 0;
    this.keys.forEach((k, i) => { if (this.dead[i]) return; const left = this.cap - (this.used[i] || 0); if (left > bestLeft) { best = i; bestLeft = left; } });
    return best;
  }
  spend(i) { this.used[i] = (this.used[i] || 0) + 1; this.tokens -= 1; }
  kill(i) { this.dead[i] = true; }
  snapshot() { return { day: this.day, used: this.used, dead: this.dead }; }
}

function refetchMs(cfg, p) {
  if (/^realtimeStationArrival\//.test(p)) return cfg.arrivalRefetchSec * 1000;
  if (/^realtimePosition\//.test(p)) return cfg.positionRefetchSec * 1000;
  return 30 * 60 * 1000;
}
// 이번 차례에 부를 경로를 고른다: 값이 없거나 낡은 것만, 많이 찾는 것부터, 토큰이 허락하는 만큼
function pickWork(cfg, wanted, nowMs, tokens) {
  const limit = Math.min(8, Math.floor(tokens));
  if (limit <= 0) return [];
  return (wanted || [])
    .filter((w) => w && typeof w.path === 'string' && nowMs - (w.have || 0) > refetchMs(cfg, w.path))
    .sort((a, b) => ((b.have || 0) === 0) - ((a.have || 0) === 0) || (b.n || 0) - (a.n || 0))   // 값이 아예 없는 것(사용자가 기다리는 중) 먼저
    .slice(0, limit);
}

function seoulUrl(cfg, key, p, scheme) {
  const base = scheme === 'http' ? cfg.seoulBase.replace(/^https:/, 'http:') : cfg.seoulBase;
  return base + '/' + encodeURIComponent(key) + '/json/' + p;
}
function errCode(body) {
  try { const b = JSON.parse(body); return (b && b.errorMessage && b.errorMessage.code) || (b && b.status && b.status.code) || (b && typeof b.code === 'string' && b.code) || ''; } catch (e) { return 'NOTJSON'; }
}
async function seoulGet(cfg, key, p, fetchFn) {
  let last = null;
  for (const scheme of ['https', 'http']) {
    try {
      const r = await fetchFn(seoulUrl(cfg, key, p, scheme), { headers: { Accept: 'application/json' } });
      const body = await r.text();
      last = { status: r.status, body, scheme };
      if (r.status === 200) return last;
    } catch (e) { last = { status: 0, body: '', error: String((e && e.message) || e), scheme }; }
  }
  return last;
}

class Relay {
  constructor(cfg, deps) {
    this.cfg = cfg; this.f = (deps && deps.fetch) || fetch; this.now = (deps && deps.now) || Date.now;
    this.log = (deps && deps.log) || ((...a) => console.log(new Date(this.now()).toISOString().slice(11, 19), ...a));
    let st = null; try { st = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8')); } catch (e) { /* 처음 */ }
    this.budget = new Budget(cfg.keys, cfg.perKeyDaily, st);
    this.stats = { fetched: 0, pushed: 0, errors: 0, polls: 0 };
  }
  save() { try { fs.writeFileSync(this.cfg.stateFile, JSON.stringify(this.budget.snapshot())); } catch (e) { /* 무시 */ } }
  hdr() { return { 'x-relay-token': this.cfg.token, 'content-type': 'application/json' }; }
  async wanted() {
    const info = encodeURIComponent('ok:' + this.stats.fetched + '/' + this.budget.remaining(this.now()));
    const r = await this.f(this.cfg.workerUrl + '/relay/wanted?info=' + info, { headers: this.hdr() });
    if (r.status === 401) throw new Error('워커가 토큰을 거부했습니다(401) — RELAY_TOKEN 이 워커 시크릿과 같은지 확인');
    if (r.status !== 200) throw new Error('워커 /relay/wanted ' + r.status);
    return (await r.json()).wanted || [];
  }
  async push(items) {
    const r = await this.f(this.cfg.workerUrl + '/relay/push', { method: 'POST', headers: this.hdr(), body: JSON.stringify({ items, info: 'ok' }) });
    if (r.status !== 200) throw new Error('워커 /relay/push ' + r.status);
    return r.json();
  }
  // 한 차례: 찾는 경로 목록 → 필요한 것만 서울에서 → 올리기
  async cycle() {
    const nowMs = this.now();
    this.budget.refill(nowMs);
    const wanted = await this.wanted(); this.stats.polls++;
    const work = pickWork(this.cfg, wanted, nowMs, this.budget.tokens);
    if (!work.length) return { fetched: 0, pushed: 0 };
    const items = [];
    for (const w of work) {
      const ki = this.budget.pickKey(nowMs);
      if (ki < 0) { this.log('오늘 쓸 수 있는 키 호출이 없습니다 — 앱은 시각표로 동작합니다'); break; }
      this.budget.spend(ki);
      const r = await seoulGet(this.cfg, this.cfg.keys[ki], w.path, this.f);
      this.stats.fetched++;
      if (!r || r.status !== 200) { this.stats.errors++; this.log('서울 응답 실패', r && r.status, r && (r.error || '').slice(0, 80), w.path); continue; }
      const code = errCode(r.body);
      if (code === 'ERROR-337' || code === 'INFO-100' || code === 'ERROR-336') { this.budget.kill(ki); this.log('키 #' + (ki + 1) + ' 사용 불가(' + code + ') — 오늘은 건너뜁니다'); continue; }
      items.push({ path: w.path, status: 200, body: r.body });
    }
    let pushed = 0;
    if (items.length) { const j = await this.push(items); pushed = j.stored || 0; this.stats.pushed += pushed; }
    this.save();
    return { fetched: work.length, pushed };
  }
  async run() {
    this.log('시작 — 키 ' + this.cfg.keys.length + '개, 오늘 남은 호출 ' + this.budget.remaining(this.now()) + '건, 워커 ' + this.cfg.workerUrl);
    let fails = 0;
    for (;;) {
      try { await this.cycle(); fails = 0; }
      catch (e) { fails++; this.log('오류:', String((e && e.message) || e)); }
      if (this.stats.polls % 40 === 1) this.log('상태 — 조회 ' + this.stats.polls + ' · 서울 호출 ' + this.stats.fetched + ' · 올림 ' + this.stats.pushed + ' · 오류 ' + this.stats.errors + ' · 남은 예산 ' + this.budget.remaining(this.now()));
      await new Promise((r) => setTimeout(r, Math.min(60, this.cfg.pollSec * (1 + Math.min(fails, 6))) * 1000));
    }
  }
}

async function check(cfg) {
  const say = (ok, msg) => console.log((ok ? '[정상] ' : '[문제] ') + msg);
  say(cfg.token.length >= 16, 'RELAY_TOKEN ' + (cfg.token.length >= 16 ? '설정됨' : '16자 이상으로 .env 에 넣어야 합니다'));
  say(cfg.keys.length > 0, '서울 API 키 ' + cfg.keys.length + '개');
  for (let i = 0; i < cfg.keys.length; i++) {
    const r = await seoulGet(cfg, cfg.keys[i], 'realtimeStationArrival/0/1/' + encodeURIComponent('서울'), fetch);
    const code = r && r.status === 200 ? errCode(r.body) : '';
    say(r && r.status === 200 && !/^ERROR|INFO-100/.test(code), '키 #' + (i + 1) + ' 서울 응답 ' + (r ? r.status : '-') + (code ? ' (' + code + ')' : '') + (r && r.error ? ' ' + r.error : '') + (r && r.status === 200 ? '  ← 한국 IP 에서 서울 서버가 열려 있음' : ''));
  }
  try { const rr = await fetch(cfg.workerUrl + '/relay/wanted', { headers: { 'x-relay-token': cfg.token } }); say(rr.status === 200, '워커 인증 ' + rr.status + (rr.status === 401 ? ' — 워커의 RELAY_TOKEN 시크릿과 .env 값이 다릅니다' : rr.status === 200 ? ' (연결됨)' : '')); }
  catch (e) { say(false, '워커에 연결 못 함: ' + e.message); }
}

module.exports = { loadEnv, makeConfig, kstDay, serviceSecondsLeft, Budget, pickWork, errCode, Relay, refetchMs };

if (require.main === module) {
  const cfg = makeConfig(Object.assign({}, loadEnv(path.join(__dirname, '.env')), process.env));
  if (process.argv.includes('--check')) { check(cfg).then(() => process.exit(0)); }
  else {
    if (cfg.token.length < 16) { console.error('.env 에 RELAY_TOKEN(16자 이상)이 필요합니다.'); process.exit(1); }
    if (!cfg.keys.length) { console.error('.env 에 SEOUL_API_KEYS 가 필요합니다.'); process.exit(1); }
    new Relay(cfg).run();
  }
}
