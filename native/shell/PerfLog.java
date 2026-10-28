package com.dullyyj.subway;

/**
 * 반응 속도 기록 — 폰에서 "어디가 느린가"를 숫자로 읽기 위한 가벼운 집계. 순수 자바(android.* 없음), 어느 스레드에서 불러도 된다.
 *   · 그리기(onDraw) 한 번의 걸린 ms · 화면 구성(relayout) 한 번의 ms · 서버 요청 한 번의 ms(주소 경로별)
 *   · (s290) 구간 시간: begin(열쇠)~end(열쇠, 이름) = 사람이 느끼는 한 동작의 시작부터 끝까지(버스 탭 진입→정류장·도착정보, 소통방 전환→글) ·
 *     서버 처리 시간: 응답의 Server-Timing(app;dur=ms)을 경로별로 모아, 앱이 잰 시간에서 빼면 '전송·기다림'이 남는다
 *   · 기록은 숫자 몇 개뿐이다(칸·글·위치 같은 내용은 담지 않는다). 앱을 끄면 사라진다.
 * 무엇이 '느린' 것인지, 글로 어떻게 보일지는 엔진(settings.js 개발자 도구)이 정한다 — 여기는 모아서 건넬 뿐이다.
 */
public final class PerfLog {
    private PerfLog() { }

    private static final int MAX_PATHS = 40;                 // s292: 12 개로는 /screen/map · /bus-tago 가 밀려 안 보였다(YJ 폰 기록)
    private static long dN, dSum, dMax, dSlow, lN, lSum, lMax, lSlow;
    private static final java.util.LinkedHashMap<String, long[]> NET = new java.util.LinkedHashMap<String, long[]>();     // 경로 → {횟수, 합ms, 최대ms, 실패}
    private static final int MAX_SPANS = 14;
    private static final java.util.LinkedHashMap<String, long[]> SPAN = new java.util.LinkedHashMap<String, long[]>();    // 이름 → {횟수, 합ms, 최대ms}
    private static final java.util.HashMap<String, Long> OPEN = new java.util.HashMap<String, Long>();                    // 열쇠 → 시작 시각(ns)
    private static final long SLOW_DRAW_MS = 17L, SLOW_LAYOUT_MS = 16L;

    public static long now() { return System.nanoTime(); }
    private static long ms(long t0) { return Math.max(0L, (System.nanoTime() - t0) / 1000000L); }

    public static synchronized void draw(long t0) {
        long d = ms(t0); dN++; dSum += d; if (d > dMax) dMax = d; if (d >= SLOW_DRAW_MS) dSlow++;
    }
    public static synchronized void layout(long t0) {
        long d = ms(t0); lN++; lSum += d; if (d > lMax) lMax = d; if (d >= SLOW_LAYOUT_MS) lSlow++;
    }
    /** 서버 요청 한 번. url 은 '?' 앞의 경로만 쓴다(질문 내용은 남기지 않는다). */
    public static synchronized void net(String url, long t0, boolean ok) {
        String p = path(url);
        long[] a = NET.get(p);
        if (a == null) { if (NET.size() >= MAX_PATHS) return; a = new long[6]; NET.put(p, a); }
        long d = ms(t0); a[0]++; a[1] += d; if (d > a[2]) a[2] = d; if (!ok) a[3]++;
    }
    /** 서버가 알려 준 처리 시간(ms) 한 번 — 이미 기록된 경로에만 붙는다(net() 이 먼저 불린 뒤가 아니어도 경로를 만든다). */
    public static synchronized void srv(String url, long ms) {
        if (ms < 0 || ms > 600000L) return;
        String p = path(url);
        long[] a = NET.get(p);
        if (a == null) { if (NET.size() >= MAX_PATHS) return; a = new long[6]; NET.put(p, a); }
        a[4]++; a[5] += ms;
    }
    /** 응답 머리글 Server-Timing 값에서 'app;dur=123.4' 의 123(ms)을 읽는다. 없거나 엉터리면 -1. */
    public static long parseServerTiming(String v) {
        if (v == null) return -1L;
        int i = v.indexOf("app;dur=");
        if (i < 0) return -1L;
        i += 8; long n = 0; int digits = 0;
        while (i < v.length() && digits < 9) { char c = v.charAt(i); if (c < '0' || c > '9') break; n = n * 10 + (c - '0'); i++; digits++; }
        return digits == 0 ? -1L : n;
    }
    /** 한 동작의 시작을 적는다(같은 열쇠가 이미 열려 있으면 처음 시작을 지키지 않고 새로 시작한다 — 사람이 다시 누른 것이므로). */
    public static synchronized void begin(String key) { if (key != null && OPEN.size() < 16) OPEN.put(key, System.nanoTime()); }
    /** 한 번에 잰 구간(시작 시각 t0 은 now() 로 잡은 값). */
    public static synchronized void span(String name, long t0) {
        if (name == null) return;
        long[] a = SPAN.get(name);
        if (a == null) { if (SPAN.size() >= MAX_SPANS) return; a = new long[3]; SPAN.put(name, a); }
        long d = ms(t0); a[0]++; a[1] += d; if (d > a[2]) a[2] = d;
    }
    /** 열려 있는 동작이 끝났다 — 걸린 ms 를 name 으로 모은다. 열려 있지 않으면 아무것도 하지 않는다(한 번만 센다). */
    public static synchronized void end(String key, String name) {
        Long t0 = key == null ? null : OPEN.remove(key);
        if (t0 == null || name == null) return;
        long[] a = SPAN.get(name);
        if (a == null) { if (SPAN.size() >= MAX_SPANS) return; a = new long[3]; SPAN.put(name, a); }
        long d = Math.max(0L, (System.nanoTime() - t0) / 1000000L); a[0]++; a[1] += d; if (d > a[2]) a[2] = d;
    }
    /** 열린 동작을 이름 없이 버린다(화면을 떠났거나 다른 방으로 바뀌어 더는 잴 수 없을 때). */
    public static synchronized void drop(String key) { if (key != null) OPEN.remove(key); }
    static String path(String url) {
        if (url == null) return "";
        int s = url.indexOf("://"); s = s < 0 ? 0 : url.indexOf('/', s + 3);
        if (s < 0) return "/";
        int q = url.indexOf('?', s); String p = q < 0 ? url.substring(s) : url.substring(s, q);
        return p.length() > 40 ? p.substring(0, 40) : p;
    }
    private static String jq(String s) {                      // 주소 경로는 글자·숫자·/·-·_ 정도라 따옴표 처리만 하면 된다(ShellCore 에 기대지 않는다 — 단독으로 컴파일되게)
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (c == '"' || c == '\\') b.append('\\').append(c); else if (c < 32) b.append(' '); else b.append(c); }
        return b.append('"').toString();
    }
    public static synchronized void reset() { dN = dSum = dMax = dSlow = lN = lSum = lMax = lSlow = 0L; NET.clear(); SPAN.clear(); OPEN.clear(); }

    /** 엔진 개발자 도구에 건네는 사실: {"d":[횟수,평균,최대,느린수],"l":[…],"n":[["/screen/map",횟수,평균,최대,실패,서버평균(없으면 -1)],…],"s":[["버스 진입→정류장",횟수,평균,최대],…]} */
    public static synchronized String snapshot() {
        StringBuilder b = new StringBuilder("{\"d\":[").append(dN).append(',').append(dN == 0 ? 0 : dSum / dN).append(',').append(dMax).append(',').append(dSlow).append("],\"l\":[")
            .append(lN).append(',').append(lN == 0 ? 0 : lSum / lN).append(',').append(lMax).append(',').append(lSlow).append("],\"n\":[");
        boolean first = true;
        for (java.util.Map.Entry<String, long[]> e : NET.entrySet()) {
            long[] a = e.getValue();
            if (!first) b.append(','); first = false;
            b.append('[').append(jq(e.getKey())).append(',').append(a[0]).append(',').append(a[0] == 0 ? 0 : a[1] / a[0]).append(',').append(a[2]).append(',').append(a[3]).append(',').append(a[4] == 0 ? -1 : a[5] / a[4]).append(']');
        }
        b.append("],\"s\":[");
        first = true;
        for (java.util.Map.Entry<String, long[]> e : SPAN.entrySet()) {
            long[] a = e.getValue();
            if (!first) b.append(','); first = false;
            b.append('[').append(jq(e.getKey())).append(',').append(a[0]).append(',').append(a[0] == 0 ? 0 : a[1] / a[0]).append(',').append(a[2]).append(']');
        }
        return b.append("]}").toString();
    }
}
