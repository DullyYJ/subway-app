package com.dullyyj.subway;

/**
 * 반응 속도 기록 — 폰에서 "어디가 느린가"를 숫자로 읽기 위한 가벼운 집계. 순수 자바(android.* 없음), 어느 스레드에서 불러도 된다.
 *   · 그리기(onDraw) 한 번의 걸린 ms · 화면 구성(relayout) 한 번의 ms · 서버 요청 한 번의 ms(주소 경로별)
 *   · 기록은 숫자 몇 개뿐이다(칸·글·위치 같은 내용은 담지 않는다). 앱을 끄면 사라진다.
 * 무엇이 '느린' 것인지, 글로 어떻게 보일지는 엔진(settings.js 개발자 도구)이 정한다 — 여기는 모아서 건넬 뿐이다.
 */
public final class PerfLog {
    private PerfLog() { }

    private static final int MAX_PATHS = 12;
    private static long dN, dSum, dMax, dSlow, lN, lSum, lMax, lSlow;
    private static final java.util.LinkedHashMap<String, long[]> NET = new java.util.LinkedHashMap<String, long[]>();     // 경로 → {횟수, 합ms, 최대ms, 실패}
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
        if (a == null) { if (NET.size() >= MAX_PATHS) return; a = new long[4]; NET.put(p, a); }
        long d = ms(t0); a[0]++; a[1] += d; if (d > a[2]) a[2] = d; if (!ok) a[3]++;
    }
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
    public static synchronized void reset() { dN = dSum = dMax = dSlow = lN = lSum = lMax = lSlow = 0L; NET.clear(); }

    /** 엔진 개발자 도구에 건네는 사실: {"d":[횟수,평균,최대,느린수],"l":[…],"n":[["/screen/map",횟수,평균,최대,실패],…]} */
    public static synchronized String snapshot() {
        StringBuilder b = new StringBuilder("{\"d\":[").append(dN).append(',').append(dN == 0 ? 0 : dSum / dN).append(',').append(dMax).append(',').append(dSlow).append("],\"l\":[")
            .append(lN).append(',').append(lN == 0 ? 0 : lSum / lN).append(',').append(lMax).append(',').append(lSlow).append("],\"n\":[");
        boolean first = true;
        for (java.util.Map.Entry<String, long[]> e : NET.entrySet()) {
            long[] a = e.getValue();
            if (!first) b.append(','); first = false;
            b.append('[').append(jq(e.getKey())).append(',').append(a[0]).append(',').append(a[0] == 0 ? 0 : a[1] / a[0]).append(',').append(a[2]).append(',').append(a[3]).append(']');
        }
        return b.append("]}").toString();
    }
}
