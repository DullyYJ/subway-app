package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 앱 본체가 엔진에 직접 글(POST)을 보내는 순수 자바 — 2026-10-20 (s82, 네이티브 통신).
 * 안드로이드를 쓰지 않아 JVM 에서 시험한다. 어디로 보낼 수 있는지는 ScreenCore.netAllowed 가 정한다(길동무 서버 세 곳뿐).
 */
public final class NetPost {
    private NetPost() { }

    /** 결과: status(-1 이면 보내지 못함) · body · err. */
    public static final class Res {
        public final int status; public final String body, err;
        public final String etag; public final int maxAge;          // 엔진이 준 ETag · Cache-Control max-age(초) — 앱은 그대로 따른다(없으면 "" · 0)
        Res(int s, String b, String e) { this(s, b, e, "", 0); }
        Res(int s, String b, String e, String tag, int ma) { status = s; body = b; err = e; etag = tag == null ? "" : tag; maxAge = ma; }
    }
    /** Cache-Control 글에서 max-age(초)를 읽는다. 없거나 엉터리면 0. */
    public static int parseMaxAge(String cc) {
        if (cc == null) return 0;
        int i = cc.indexOf("max-age=");
        if (i < 0) return 0;
        int j = i + 8, n = 0, digits = 0;
        while (j < cc.length() && cc.charAt(j) >= '0' && cc.charAt(j) <= '9' && digits < 7) { n = n * 10 + (cc.charAt(j) - '0'); j++; digits++; }
        return digits == 0 ? 0 : n;
    }
    /** 조건부 POST: etag 가 있으면 If-None-Match 로 보낸다. 엔진이 "같다"고 하면 status 304(본문 없음). */
    public static Res postCond(String url, String body, double timeoutMs, String etag) {
        if (body == null || body.length() > ScreenCore.NET_MAX_REQ) return new Res(-1, "", "too-long");
        return send("POST", url, body, timeoutMs, etag);
    }
    public static Res getCond(String url, double timeoutMs, String etag) { return send("GET", url, null, timeoutMs, etag); }
    /** 허용된 주소에 글을 POST 한다(다른 곳은 blocked). 응답은 ScreenCore.NET_MAX_RES 까지. 리다이렉트는 따르지 않는다. */
    public static Res post(String url, String body, double timeoutMs) {
        if (body == null || body.length() > ScreenCore.NET_MAX_REQ) return new Res(-1, "", "too-long");
        return send("POST", url, body, timeoutMs);
    }
    /** 허용된 주소에서 GET 으로 받는다(설정 같은 GET 전용 엔진 화면). 규칙은 post 와 같다. */
    public static Res get(String url, double timeoutMs) { return send("GET", url, null, timeoutMs); }

    // ── 버스 공공 API 받기 ──
    // 버스 서버(gildongmu-bus)는 공공 API(data.go.kr)가 오류를 내도 HTTP 200 으로 오류 봉투({"OpenAPI_ServiceResponse":…"HTTP_ERROR"})를 그대로 건넨다 — 여러 정류장을 한꺼번에 물으면 절반 넘게 이렇게 온다(실측: 8곳 동시 5곳).
    // 그걸 "받았다"로 치면 엔진이 '도착정보 없음'으로 그린다. 그래서 ① 동시에 4곳까지만 묻고(웹의 요청 줄과 같은 취지) ② 오류 봉투 · 빈 본문은 받지 못한 것으로 보고 짧게 쉬었다 두 번 더 묻는다. 끝내 못 받으면 빈 본문(status -3).
    // 본문이 맞는지(도착 정보가 있는지 · 없는지)는 엔진이 판단한다 — 여기서는 "서버가 준 오류 봉투인가"만 본다(웹 _safeParseResponse 의 오류 글자와 같다).
    private static final java.util.concurrent.Semaphore BUS_GATE = new java.util.concurrent.Semaphore(4);
    private static final String[] BUS_ERR = { "OpenAPI_ServiceResponse", "cmmMsgHeader", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" };
    /** 받지 못한 본문인가: 비었거나 공공 API 의 오류 봉투. */
    public static boolean busBodyBad(String b) {
        if (b == null || b.length() == 0) return true;
        if (b.length() > 4000) return false;                                  // 오류 봉투는 짧다 — 긴 본문은 정상(속도)
        for (String m : BUS_ERR) if (b.indexOf(m) >= 0) return true;
        return false;
    }
    /** 버스 서버에서 GET: 오류 봉투 · 빈 본문이면 0.2 · 0.4초 뒤 다시(최대 3번 — 1초 안쪽). 네트워크가 느리게 실패하면(2.5초 넘게) 또 매달리지 않는다. 못 받으면 status -3 · 빈 본문. */
    public static Res getBus(String url, double firstMs, double retryMs) {
        Res last = new Res(-1, "", "none");
        for (int a = 0; a < 3; a++) {
            long t0 = System.currentTimeMillis();
            try { BUS_GATE.acquire(); } catch (InterruptedException ie) { return last; }
            try { last = get(url, a == 0 ? firstMs : retryMs); } finally { BUS_GATE.release(); }
            if (last.status == 200 && !busBodyBad(last.body)) return last;
            if ("blocked".equals(last.err)) return last;
            if (last.status < 0 && System.currentTimeMillis() - t0 > 2500L) break;
            if (a < 2) { try { Thread.sleep(200L * (a + 1) + (long) (Math.random() * 100)); } catch (InterruptedException ie) { break; } }
        }
        return new Res(last.status == 200 ? -3 : last.status, "", last.err.length() > 0 ? last.err : "bus-bad");
    }

    // ── 공공데이터 키 2개 나눠 쓰기 ──
    // 버스 서버(gildongmu-bus)는 키 1개, route-v2 의 /bus-tago 는 키 2개를 번갈아 쓴다. 정류장을 번호 짝·홀로 나눠 서로 다른 길로 먼저 보내면(반반) 같은 키에 몰리지 않아 오류가 줄고 빠르다.
    // 정류장 목록처럼 하나뿐인 요청은 두 길에 동시에 보내(hedge) 먼저 온 정상 본문을 쓴다. route-v2 쪽이 아직 없거나(404) 막혀 있으면 이번 실행 동안 그 길을 끄고 예전처럼 버스 서버만 쓴다.
    private static volatile boolean altOff = false;
    private static final java.util.concurrent.Semaphore ALT_GATE = new java.util.concurrent.Semaphore(4);     // 두 번째 길은 자기 줄을 따로 쓴다 — 두 길이 동시에 4곳씩, 모두 8곳이 한꺼번에
    public static boolean altEnabled() { return !altOff; }
    public static void altReset() { altOff = false; }
    private static Res once(String url, double ms, boolean isAlt) {
        java.util.concurrent.Semaphore gate = isAlt ? ALT_GATE : BUS_GATE;
        try { gate.acquire(); } catch (InterruptedException ie) { return new Res(-1, "", "interrupted"); }
        Res r;
        try { r = get(url, ms); } finally { gate.release(); }
        if (isAlt && (r.status == 404 || r.status == 403 || r.status == 405)) altOff = true;
        return r;
    }
    private static Res race(final String a, final String b, final double ms) {
        final Res[] out = new Res[2]; final Object lock = new Object();
        for (int i = 0; i < 2; i++) {
            final int k = i;
            Thread t = new Thread(new Runnable() { @Override public void run() {
                Res r = once(k == 0 ? a : b, ms, k == 1);
                synchronized (lock) { out[k] = r; lock.notifyAll(); }
            } }, "bus-race"); t.setDaemon(true); t.start();
        }
        long end = System.currentTimeMillis() + (long) ms + 1500L;
        synchronized (lock) {
            while (true) {
                Res bestBad = null; int n = 0;
                for (int k = 0; k < 2; k++) {
                    Res r = out[k]; if (r == null) continue; n++;
                    if (r.status == 200 && !busBodyBad(r.body)) return r;
                    bestBad = r;
                }
                long left = end - System.currentTimeMillis();
                if (n == 2 || left <= 0) return bestBad != null ? bestBad : new Res(-1, "", "timeout");
                try { lock.wait(left); } catch (InterruptedException ie) { return new Res(-1, "", "interrupted"); }
            }
        }
    }
    /** 두 길(url=버스 서버 · alt=route-v2 키 2개)로 받는다. pref 0 이면 url 먼저 · 1 이면 alt 먼저(정류장 번호 짝·홀), 시도마다 길을 바꾼다. hedge 면 첫 시도를 두 길에 동시에. alt 가 비었거나 꺼져 있으면 예전과 같다. */
    public static Res getBus2(String url, String alt, int pref, boolean hedge, double firstMs, double retryMs) {
        if (alt == null || alt.length() == 0 || altOff) return getBus(url, firstMs, retryMs);
        Res last = new Res(-1, "", "none");
        for (int a = 0; a < 3; a++) {
            long t0 = System.currentTimeMillis();
            if (altOff) { Res r = getBus(url, a == 0 ? firstMs : retryMs, retryMs); return r; }
            if (a == 0 && hedge) last = race(url, alt, firstMs);
            else { boolean useAlt = ((a + pref) & 1) == 1; last = once(useAlt ? alt : url, a == 0 ? firstMs : retryMs, useAlt); }
            if (last.status == 200 && !busBodyBad(last.body)) return last;
            if ("blocked".equals(last.err)) return last;
            if (last.status < 0 && System.currentTimeMillis() - t0 > 2500L) break;
            if (a < 2) { try { Thread.sleep(150L * (a + 1) + (long) (Math.random() * 100)); } catch (InterruptedException ie) { break; } }
        }
        return new Res(last.status == 200 ? -3 : last.status, "", last.err.length() > 0 ? last.err : "bus-bad");
    }

    private static Res send(String method, String url, String body, double timeoutMs) { return send(method, url, body, timeoutMs, ""); }
    private static Res send(String method, String url, String body, double timeoutMs, String etag) {
        if (!ScreenCore.netAllowed(url)) return new Res(-1, "", "blocked");
        int to = ScreenCore.netTimeout(timeoutMs);
        java.net.HttpURLConnection c = null;
        boolean reuse = false;                                  // 응답을 끝까지 읽었으면 연결을 끊지 않는다 — 다음 요청이 같은 연결(HTTP/2 · TLS 이미 끝남)을 이어 쓴다(커넥션 풀)
        try {
            c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setConnectTimeout(Math.min(to, 6000)); c.setReadTimeout(to);
            c.setInstanceFollowRedirects(false);
            c.setRequestMethod(method);
            if (etag != null && etag.length() > 0 && etag.length() < 100) c.setRequestProperty("If-None-Match", etag);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "text/plain;charset=UTF-8");
                java.io.OutputStream os = c.getOutputStream(); os.write(body.getBytes("UTF-8")); os.close();
            }
            int code = c.getResponseCode();
            String tag = c.getHeaderField("ETag"); int ma = parseMaxAge(c.getHeaderField("Cache-Control"));
            if (code == 304) { reuse = true; return new Res(304, "", "", tag, ma); }
            java.io.InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            if (is != null) {
                byte[] buf = new byte[8192]; int n, total = 0;
                while ((n = is.read(buf)) > 0) { total += n; if (total > ScreenCore.NET_MAX_RES) return new Res(-1, "", "too-big"); bo.write(buf, 0, n); }
                is.close();
            }
            reuse = true;
            return new Res(code, bo.toString("UTF-8"), "", tag, ma);
        } catch (Throwable t) {
            return new Res(-1, "", "net: " + String.valueOf(t.getMessage()));
        } finally { if (c != null && !reuse) c.disconnect(); }
}
}
