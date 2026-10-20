package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 앱 본체가 엔진에 직접 글(POST)을 보내는 순수 자바 — 2026-10-20 (s82, 네이티브 통신).
 * 안드로이드를 쓰지 않아 JVM 에서 시험한다. 어디로 보낼 수 있는지는 ScreenCore.netAllowed 가 정한다(길동무 서버 세 곳뿐).
 */
public final class NetPost {
    private NetPost() { }

    /** 결과: status(-1 이면 보내지 못함) · body · err. */
    public static final class Res { public final int status; public final String body, err; Res(int s, String b, String e) { status = s; body = b; err = e; } }
    /** 허용된 주소에 글을 POST 한다(다른 곳은 blocked). 응답은 ScreenCore.NET_MAX_RES 까지. 리다이렉트는 따르지 않는다. */
    public static Res post(String url, String body, double timeoutMs) {
        if (body == null || body.length() > ScreenCore.NET_MAX_REQ) return new Res(-1, "", "too-long");
        return send("POST", url, body, timeoutMs);
    }
    /** 허용된 주소에서 GET 으로 받는다(설정 같은 GET 전용 엔진 화면). 규칙은 post 와 같다. */
    public static Res get(String url, double timeoutMs) { return send("GET", url, null, timeoutMs); }

    private static Res send(String method, String url, String body, double timeoutMs) {
        if (!ScreenCore.netAllowed(url)) return new Res(-1, "", "blocked");
        int to = ScreenCore.netTimeout(timeoutMs);
        java.net.HttpURLConnection c = null;
        try {
            c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setConnectTimeout(Math.min(to, 6000)); c.setReadTimeout(to);
            c.setInstanceFollowRedirects(false);
            c.setRequestMethod(method);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "text/plain;charset=UTF-8");
                java.io.OutputStream os = c.getOutputStream(); os.write(body.getBytes("UTF-8")); os.close();
            }
            int code = c.getResponseCode();
            java.io.InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            if (is != null) {
                byte[] buf = new byte[8192]; int n, total = 0;
                while ((n = is.read(buf)) > 0) { total += n; if (total > ScreenCore.NET_MAX_RES) return new Res(-1, "", "too-big"); bo.write(buf, 0, n); }
                is.close();
            }
            return new Res(code, bo.toString("UTF-8"), "");
        } catch (Throwable t) {
            return new Res(-1, "", "net: " + String.valueOf(t.getMessage()));
        } finally { if (c != null) c.disconnect(); }
}
}
