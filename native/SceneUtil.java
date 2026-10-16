package com.dullyyj.subway;

import java.util.HashMap;

/** 장면 그림에 쓰는 작은 도구들(수학·색·둥근 사각형·시드 난수). android.* 를 쓰지 않는다. */
public final class SceneUtil {
    private SceneUtil() {}
    public static final double PI = Math.PI, PI2 = Math.PI * 2;

    public static double clamp(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
    public static double ease(double u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

    // ── 색 ──
    private static final HashMap<String, Integer> CSS = new HashMap<>();
    /** '#rgb' '#rrggbb' 'rgba(r,g,b,a)' 'rgb(r,g,b)' → 0xAARRGGBB (웹 글자 그대로 옮겨 쓰기 위한 것, 결과는 저장해 둔다) */
    public static synchronized int css(String s) {
        Integer v = CSS.get(s);
        if (v != null) return v;
        int r;
        String t = s.trim();
        if (t.charAt(0) == '#') {
            String h = t.substring(1);
            if (h.length() == 3) h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
            r = 0xFF000000 | (int) Long.parseLong(h, 16);
        } else {
            int p = t.indexOf('('), q = t.lastIndexOf(')');
            String[] f = t.substring(p + 1, q).split(",");
            double a = f.length > 3 ? Double.parseDouble(f[3].trim()) : 1;
            r = rgba((int) Double.parseDouble(f[0].trim()), (int) Double.parseDouble(f[1].trim()), (int) Double.parseDouble(f[2].trim()), a);
        }
        CSS.put(s, r);
        return r;
    }
    public static int rgba(int r, int g, int b, double a) {
        int al = (int) Math.round(clamp(a, 0, 1) * 255);
        return (al << 24) | (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
    }
    private static int clamp255(int v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    /** 색의 투명도에 a 를 곱한다. */
    public static int mulA(int argb, double a) {
        int al = (int) Math.round(((argb >>> 24) & 255) * clamp(a, 0, 1));
        return (al << 24) | (argb & 0xFFFFFF);
    }
    public static int mix(int a, int b, double t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        return 0xFF000000 | (rnd255(ar + (br - ar) * t) << 16) | (rnd255(ag + (bg - ag) * t) << 8) | rnd255(ab + (bb - ab) * t);
    }
    public static int mix(String a, String b, double t) { return mix(css(a), css(b), t); }
    public static int mix(int a, String b, double t) { return mix(a, css(b), t); }
    private static int rnd255(double v) { return (int) clamp(Math.round(v), 0, 255); }
    public static int shade(int a, double k) { return k >= 0 ? mix(a, 0xFFFFFFFF, k) : mix(a, 0xFF000000, -k); }
    public static int shade(String a, double k) { return shade(css(a), k); }

    /** 둥근 사각형 경로 */
    public static void rr(SceneCv c, double x, double y, double w, double h, double r) {
        r = Math.min(r, Math.min(w / 2, h / 2));
        c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
        c.quadTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadTo(x, y, x + r, y); c.closePath();
    }

    // ── 시드 난수(배경 그림이 같은 날씨·시간대면 늘 같은 모양이 되게) — 웹의 mulberry 와 같은 수열 ──
    public interface Rng { double next(); }
    public static final class Seeded implements Rng {
        private int a;
        public Seeded(int seed) { a = seed; }
        public double next() { return r(); }
        public double r() {
            a = a + 0x6D2B79F5;
            int t = a ^ (a >>> 15); t *= (1 | a);
            int u = t ^ (t >>> 7); u *= (61 | t);
            t = (t + u) ^ t;
            return ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0;
        }
        public double r(double lo, double hi) { return lo + r() * (hi - lo); }
        public int pick(int n) { return ((int) Math.floor(r() * n)) % n; }
    }
}
