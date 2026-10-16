package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 경로 카드 맨 아래 줄(세부경로 · 확정 · 탑승/환승/도착)의 전환 연출 계산 — 순수 자바(android.* 없음, JVM 에서 시험).
 *
 * 2026-10-16 (YJ: "경로 선택하면 탑승 버튼 생성 — 왼쪽 두 버튼이 줄고 오른쪽에서 밀고 들어옴, 세 버튼 크기 같게 / 환승은 위에서 내려오며 탑승을 아래로 밀어냄 /
 *   도착은 아래에서 올라오며 환승을 위로 밀어냄. 계산은 엔진이 그림은 앱이, 애니메이션은 네이티브").
 * 어떤 칸이 되는지·어떤 전환인지(kind)·시간·곡선은 엔진(/ride-eta op:'row')이 정해 준다. 여기는 받은 kind 와 진행도 p(0~1)로 네 조각의 자리만 계산한다.
 *   조각: a=세부경로, b=확정, c=새(또는 사라지는) 오른쪽 칸, o=밀려 나가는 옛 오른쪽 칸(slide 일 때만)
 *   좌표는 줄 왼쪽 위 기준 px. 줄 밖(0~W, 0~H)은 그리지 않는다(호출한 쪽이 clip).
 */
public final class RowCore {
    public static final int A = 0, B = 1, C = 2, O = 3;
    /** out[i*5 .. i*5+4] = {보임(0/1), x, y, w, h} — i = A,B,C,O */
    public static final int STRIDE = 5, SIZE = 4 * STRIDE;

    private RowCore() { }

    /** CSS cubic-bezier(x1,y1,x2,y2) 와 같은 곡선 — 시간 t(0~1) → 진행도. 웹(WAAPI 대체)과 같은 식. */
    public static float ease(float t, float x1, float y1, float x2, float y2) {
        if (t <= 0f) return 0f;
        if (t >= 1f) return 1f;
        float lo = 0f, hi = 1f, u = t;
        for (int i = 0; i < 24; i++) {          // x(u) = t 인 u 를 이분법으로
            u = (lo + hi) * 0.5f;
            float x = bez(u, x1, x2);
            if (x < t) lo = u; else hi = u;
        }
        return bez(u, y1, y2);
    }
    private static float bez(float u, float p1, float p2) {
        float v = 1f - u;
        return 3f * v * v * u * p1 + 3f * v * u * u * p2 + u * u * u;
    }

    private static void put(float[] o, int i, float x, float y, float w, float h) {
        int k = i * STRIDE; o[k] = 1f; o[k + 1] = x; o[k + 2] = y; o[k + 3] = w; o[k + 4] = h;
    }

    /** kind: push_in | push_out | slide_down | slide_up. 모르는 kind 는 전부 보이는 최종 3칸. */
    public static void frame(String kind, float p, float W, float H, float gap, float[] out) {
        java.util.Arrays.fill(out, 0, SIZE, 0f);
        if (p < 0f) p = 0f; if (p > 1f) p = 1f;
        float w2 = (W - gap) / 2f, w3 = (W - 2f * gap) / 3f, x3 = 2f * (w3 + gap);
        if ("push_in".equals(kind) || "push_out".equals(kind)) {
            float q = "push_out".equals(kind) ? 1f - p : p;
            float wa = w2 + (w3 - w2) * q;
            put(out, A, 0f, 0f, wa, H);
            put(out, B, wa + gap, 0f, wa, H);
            put(out, C, 2f * (wa + gap), 0f, w3, H);          // 새 칸의 왼쪽 끝 = 두 번째 버튼 오른쪽 끝 + 간격 — 버튼이 줄어드는 만큼 밀려 들어온다
            return;
        }
        put(out, A, 0f, 0f, w3, H);
        put(out, B, w3 + gap, 0f, w3, H);
        if ("slide_down".equals(kind)) {                      // 새 칸이 위에서 내려오며 옛 칸을 아래로 밀어낸다
            put(out, C, x3, -H * (1f - p), w3, H);
            put(out, O, x3, H * p, w3, H);
        } else if ("slide_up".equals(kind)) {                 // 새 칸이 아래에서 올라오며 옛 칸을 위로 밀어낸다
            put(out, C, x3, H * (1f - p), w3, H);
            put(out, O, x3, -H * p, w3, H);
        } else {
            put(out, C, x3, 0f, w3, H);
        }
    }

    /** CSS 색 문자열 → ARGB int. '#rgb' '#rrggbb' '#rrggbbaa' 'rgb(r,g,b)' 'rgba(r,g,b,a)' 'transparent'. 못 읽으면 def. */
    public static int color(String s, int def) {
        if (s == null) return def;
        s = s.trim().toLowerCase();
        try {
            if (s.equals("transparent")) return 0;
            if (s.startsWith("#")) {
                String h = s.substring(1);
                if (h.length() == 3) { h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
                if (h.length() == 6) return 0xff000000 | (int) Long.parseLong(h, 16);
                if (h.length() == 8) { long v = Long.parseLong(h, 16); return (int) (((v & 0xff) << 24) | (v >> 8)); }
                return def;
            }
            if (s.startsWith("rgb")) {
                int a = s.indexOf('('), b = s.indexOf(')');
                if (a < 0 || b < a) return def;
                String[] t = s.substring(a + 1, b).split("[,/ ]+");
                java.util.ArrayList<String> v = new java.util.ArrayList<String>();
                for (String x : t) if (x.length() > 0) v.add(x);
                if (v.size() < 3) return def;
                int r = clamp255(Float.parseFloat(v.get(0))), g = clamp255(Float.parseFloat(v.get(1))), bl = clamp255(Float.parseFloat(v.get(2)));
                int al = 255;
                if (v.size() >= 4) { String av = v.get(3); float f = av.endsWith("%") ? Float.parseFloat(av.substring(0, av.length() - 1)) / 100f : Float.parseFloat(av); al = clamp255(f * 255f); }
                return (al << 24) | (r << 16) | (g << 8) | bl;
            }
        } catch (Throwable t) { /* 아래 기본값 */ }
        return def;
    }
    private static int clamp255(float f) { int i = Math.round(f); return i < 0 ? 0 : (i > 255 ? 255 : i); }
}
