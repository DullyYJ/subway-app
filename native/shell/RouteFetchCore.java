package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 경로 요청의 순수 자바 코어 — 2026-10-19 (5번 3단계: 경로 탐색 요청·결과 상태를 웹뷰 밖으로).
 *
 *   ★ 원칙(YJ): "모든 계산은 엔진이, 앱은 그림만." — 이 코어는 판단하지 않는다.
 *     '빠른 응답을 그릴지 · 전체를 뒤따라 받을지 · 언제 다시 조회할지'는 엔진이 응답 맨 앞에 실어 보내는 `follow` 지시(engine/route-follow.js)가 정하고,
 *     이 코어는 그 지시를 글자 그대로 따른다(draw 가 false 면 전체를, next 가 'full' 이면 한 번 더). 지시가 없으면(옛 엔진) 아무것도 하지 않고 웹에 돌려준다(legacy).
 *   · 안드로이드·시계·통신을 직접 쓰지 않는다 — 통신·시계·'이미 낡은 요청인가'는 Env 로 받는다(플러그인이 채운다). 그래서 JVM 에서 가짜 Env 로 그대로 시험된다.
 *   · 하는 일: ① 단계 진행(첫 응답 → [전체] → 사건 알림) ② 응답 맨 앞 follow 읽기 ③ 웹 진단 줄(_routeFetchLog 와 같은 모양) ④ 가장 최근에 받은 '경로 있는 응답' 보관(State).
 *   · 요청 주소는 웹이 만든다(좌표·기준시각·승차 후보·사용자 뜻). 이 코어는 `&live=0` 만 붙여 보낸다 — 웹의 _routeStaged 와 같다.
 */
public final class RouteFetchCore {
    private RouteFetchCore() { }

    public static final int DEFAULT_TIMEOUT_MS = 15000, MIN_TIMEOUT_MS = 1000, MAX_TIMEOUT_MS = 30000;
    public static final int MAX_BODY = 8_000_000;
    private static final int FOLLOW_SCAN_MAX = 4000;

    // ═════════════ ① 주소 검사 · 시간 제한 ═════════════
    /** 경로 서버 주소만 받는다(https 이고 /route-v2-app 경로) — 플러그인이 아무 주소나 열어 주는 통로가 되지 않게. */
    public static boolean isRouteUrl(String u) {
        if (u == null || u.length() > 4000) return false;
        if (!u.startsWith("https://")) return false;
        int q = u.indexOf('?');
        String head = q < 0 ? u : u.substring(0, q);
        return head.endsWith("/route-v2-app") && q > 0;
    }

    public static int clampTimeout(Integer ms) {
        if (ms == null) return DEFAULT_TIMEOUT_MS;
        return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, ms.intValue()));
    }

    /** 첫 응답 주소: 웹의 _routeStaged 와 같이 `&live=0` 을 붙인다(실시간 조회 없는 빠른 응답). */
    public static String liveZero(String url) { return url + "&live=0"; }

    // ═════════════ ② 통신 결과 · 환경 ═════════════
    public static final class Res {
        public final boolean ok; public final String body, err; public final long ms;
        public Res(boolean ok, String body, String err, long ms) { this.ok = ok; this.body = body; this.err = err == null ? "" : err; this.ms = ms; }
        public static Res good(String body, long ms) { return new Res(true, body, "", ms); }
        public static Res bad(String err, long ms) { return new Res(false, null, err, ms); }
    }

    /** 플러그인이 채우는 바깥 세상: 통신 · 시계 · 낡은 요청 확인 · 웹으로 알리기. */
    public interface Env {
        Res get(String url, int timeoutMs);
        long now();
        boolean stale();
        void emit(Map<String, Object> ev);
    }

    // ═════════════ ③ 응답 맨 앞 follow 읽기 ═════════════
    /** 본문이 {"follow":{…},…} 로 시작하면 그 follow 를 읽어 돌려준다. 없거나 깨졌으면 null(옛 엔진). 전체를 파싱하지 않는다(응답이 클 수 있다). */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> extractFollow(String body) {
        if (body == null) return null;
        int i = 0, n = body.length();
        while (i < n && body.charAt(i) <= ' ') i++;
        String pre = "{\"follow\":";
        if (!body.startsWith(pre, i)) return null;
        int s = i + pre.length();
        if (s >= n || body.charAt(s) != '{') return null;
        int depth = 0; boolean str = false;
        for (int k = s; k < n && k < s + FOLLOW_SCAN_MAX; k++) {
            char c = body.charAt(k);
            if (str) { if (c == '\\') k++; else if (c == '"') str = false; continue; }
            if (c == '"') str = true;
            else if (c == '{') depth++;
            else if (c == '}') {
                depth--;
                if (depth == 0) {
                    try {
                        Object o = ScreenCore.parse(body.substring(s, k + 1));
                        return (o instanceof Map) ? (Map<String, Object>) o : null;
                    } catch (Exception e) { return null; }
                }
            }
        }
        return null;
    }

    /** draw 가 명시적으로 false 일 때만 그리지 않는다(없으면 그린다). */
    public static boolean draws(Map<String, Object> f) { return f == null || !Boolean.FALSE.equals(f.get("draw")); }
    public static boolean wantsFull(Map<String, Object> f) { return f != null && "full".equals(f.get("next")); }
    public static int num(Map<String, Object> f, String k) {
        if (f == null) return 0;
        Object v = f.get(k);
        return (v instanceof Number) ? ((Number) v).intValue() : 0;
    }
    public static String ver(Map<String, Object> f) { Object v = f == null ? null : f.get("ver"); return v instanceof String ? (String) v : ""; }

    // ═════════════ ④ 웹 진단 줄 (_routeFetchLog 와 같은 모양) ═════════════
    public static Map<String, Object> logEntry(Res r, int timeoutMs, Map<String, Object> follow) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("ms", Long.valueOf(r.ms));
        if (r.ok) {
            int n = num(follow, "n");
            m.put("how", n > 0 ? "경로 " + n + "건" : "경로 0건");
            m.put("n", Integer.valueOf(n)); m.put("ver", ver(follow).length() == 0 ? null : ver(follow)); m.put("err", null);
        } else {
            boolean to = r.err.startsWith("timeout");
            m.put("how", to ? "타임아웃(" + timeoutMs + "ms)" : "실패");
            m.put("n", null); m.put("ver", null); m.put("err", to ? null : (r.err.length() > 60 ? r.err.substring(0, 60) : r.err));
        }
        return m;
    }

    // ═════════════ ⑤ 보관 (가장 최근에 받은 '경로 있는 응답') ═════════════
    public static final class State {
        private String id = "", url = "", stage = "", raw = ""; private long at; private int n;
        public synchronized void offer(String id, String url, String stage, String raw, int n, long at) {
            if (raw == null || n <= 0) return;           // 경로가 없는 응답은 화면에 쓸 결과가 아니다
            this.id = id == null ? "" : id; this.url = url == null ? "" : url; this.stage = stage; this.raw = raw; this.n = n; this.at = at;
        }
        public synchronized boolean has() { return raw.length() > 0; }
        public synchronized String id() { return id; }
        public synchronized String url() { return url; }
        public synchronized String stage() { return stage; }
        public synchronized String raw() { return raw; }
        public synchronized int n() { return n; }
        public synchronized long at() { return at; }
        public synchronized void clear() { id = ""; url = ""; stage = ""; raw = ""; n = 0; at = 0; }
    }

    // ═════════════ ⑥ 단계 진행 ═════════════
    private static Map<String, Object> ev(String id, String stage) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", id); m.put("stage", stage);
        return m;
    }

    private static List<Object> logs(List<Map<String, Object>> l) { return new ArrayList<Object>(l); }

    /**
     * 요청 하나를 단계대로 진행한다(블로킹 — 플러그인이 일꾼 스레드에서 부른다).
     *   1) `url&live=0` 로 빠른 응답을 받는다.
     *   2) 응답 맨 앞 follow 를 읽는다:
     *        · follow 없음(옛 엔진)        → first 이벤트 {ok:true, legacy:true, raw} — 웹이 예전 방식으로 이어간다
     *        · follow.draw == false        → 이 응답은 내보내지 않고 `url` 로 전체를 받아 first 로 낸다(전체가 실패하면 빠른 응답을 forced 로 낸다)
     *        · 그 밖                        → first 로 낸다. 그 뒤 follow.next == 'full' 이면 `url` 로 전체를 받아 full 이벤트로 낸다
     *   3) 낡은 요청이면(Env.stale) 조용히 멈춘다 — 단, first 는 호출이 끝나도록 {stale:true} 로 한 번 알린다.
     *   이벤트 모양: {id, stage:'first'|'full', ok, raw?, why?, legacy?, forced?, stale?, log:[{ms,how,n,ver,err}], bytes}
     */
    public static void run(String id, String url, int timeoutMs, Env env, State state) {
        List<Map<String, Object>> lg = new ArrayList<Map<String, Object>>();
        Res r0;
        try { r0 = env.get(liveZero(url), timeoutMs); } catch (Throwable t) { r0 = Res.bad(String.valueOf(t.getMessage()), 0); }
        if (env.stale()) { Map<String, Object> e = ev(id, "first"); e.put("ok", Boolean.FALSE); e.put("stale", Boolean.TRUE); e.put("log", logs(lg)); env.emit(e); return; }
        Map<String, Object> f0 = r0.ok ? extractFollow(r0.body) : null;
        lg.add(logEntry(r0, timeoutMs, f0));
        if (!r0.ok) {
            Map<String, Object> e = ev(id, "first"); e.put("ok", Boolean.FALSE); e.put("why", r0.err); e.put("log", logs(lg)); env.emit(e);
            return;
        }
        if (f0 == null) {                                      // 옛 엔진: 지시가 없다 — 판단은 웹이 예전 방식으로
            Map<String, Object> e = ev(id, "first"); e.put("ok", Boolean.TRUE); e.put("legacy", Boolean.TRUE); e.put("raw", r0.body); e.put("bytes", Integer.valueOf(r0.body.length())); e.put("log", logs(lg));
            env.emit(e);
            return;
        }
        String firstRaw = r0.body; Map<String, Object> firstF = f0; boolean forced = false;
        if (!draws(f0)) {                                      // 엔진이 '이 응답은 그리지 말고 전체를 기다려라'
            Res r1;
            try { r1 = env.get(url, timeoutMs); } catch (Throwable t) { r1 = Res.bad(String.valueOf(t.getMessage()), 0); }
            if (env.stale()) { Map<String, Object> e = ev(id, "first"); e.put("ok", Boolean.FALSE); e.put("stale", Boolean.TRUE); e.put("log", logs(lg)); env.emit(e); return; }
            Map<String, Object> f1 = r1.ok ? extractFollow(r1.body) : null;
            lg.add(logEntry(r1, timeoutMs, f1));
            if (r1.ok) { firstRaw = r1.body; firstF = f1; } else forced = true;     // 전체를 못 받으면 빠른 응답이라도 그린다(웹의 `full || main0` 과 같다)
        }
        state.offer(id, url, "first", firstRaw, num(firstF, "n"), env.now());
        Map<String, Object> e1 = ev(id, "first"); e1.put("ok", Boolean.TRUE); e1.put("raw", firstRaw); e1.put("bytes", Integer.valueOf(firstRaw.length()));
        if (forced) e1.put("forced", Boolean.TRUE);
        e1.put("log", logs(lg));
        env.emit(e1);
        if (!forced && draws(f0) && wantsFull(f0)) {            // 빠른 응답을 그린 뒤 엔진이 '전체도 뒤따라 받아라'
            if (env.stale()) return;
            Res r2;
            try { r2 = env.get(url, timeoutMs); } catch (Throwable t) { r2 = Res.bad(String.valueOf(t.getMessage()), 0); }
            if (env.stale()) return;
            Map<String, Object> f2 = r2.ok ? extractFollow(r2.body) : null;
            List<Map<String, Object>> lg2 = new ArrayList<Map<String, Object>>();
            lg2.add(logEntry(r2, timeoutMs, f2));
            Map<String, Object> e2 = ev(id, "full"); e2.put("ok", Boolean.valueOf(r2.ok));
            if (r2.ok) {
                e2.put("raw", r2.body); e2.put("bytes", Integer.valueOf(r2.body.length()));
                state.offer(id, url, "full", r2.body, num(f2, "n"), env.now());
            } else e2.put("why", r2.err);
            e2.put("log", logs(lg2));
            env.emit(e2);
        }
    }

    /** 재조회 한 건(웹이 엔진의 retry 간격에 맞춰 부른다): 받아서 돌려주고, 경로가 있으면 보관한다. 반환 {ok, raw?, why?, bytes, log:[…]}. */
    public static Map<String, Object> once(String id, String url, int timeoutMs, Env env, State state) {
        Res r;
        try { r = env.get(url, timeoutMs); } catch (Throwable t) { r = Res.bad(String.valueOf(t.getMessage()), 0); }
        Map<String, Object> f = r.ok ? extractFollow(r.body) : null;
        List<Map<String, Object>> lg = new ArrayList<Map<String, Object>>();
        lg.add(logEntry(r, timeoutMs, f));
        Map<String, Object> m = ev(id, "retry"); m.put("ok", Boolean.valueOf(r.ok));
        if (r.ok) {
            m.put("raw", r.body); m.put("bytes", Integer.valueOf(r.body.length()));
            if (f == null) m.put("legacy", Boolean.TRUE);
            if (f == null || !Boolean.FALSE.equals(f.get("better"))) state.offer(id, url, "retry", r.body, num(f, "n"), env.now());   // 엔진이 '나아지지 않았다'고 한 응답은 보관하지 않는다(화면에 안 그려진다)
        } else m.put("why", r.err);
        m.put("log", logs(lg));
        return m;
    }
}
