package com.dullyyj.subway;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 승차 엔진(ride-standby · ride-eta · ride-track) 자바 포팅 전용 도우미 — 자바스크립트와 같은 뜻으로 계산하게 해 준다.
 *
 * ★ 2026-10-22 (YJ: "탑승이 확정된 이후에는 외부 서버 요청을 일체 발생시키지 않는다"): 서버 엔진의 순수 함수를 한 줄씩 그대로 옮긴 '내 폰 안의 엔진'이다.
 *   값은 ScreenCore.parse 와 같은 모양(Map · List · Double · String · Boolean · null)으로 다룬다. 숫자는 항상 Double, 없음(undefined)과 null 은 둘 다 자바 null.
 *   수학 함수는 StrictMath(fdlibm) — V8(Node·Cloudflare)의 Math.sin/exp/log/pow 와 같은 알고리즘이라 서버와 같은 값이 나온다.
 */
final class RideJs {
    private RideJs() { }

    @SuppressWarnings("unchecked")
    static Map<String, Object> m(Object o) { return o instanceof Map ? (Map<String, Object>) o : null; }
    @SuppressWarnings("unchecked")
    static List<Object> l(Object o) { return o instanceof List ? (List<Object>) o : null; }

    /** o[k] — 객체가 아니면 null (JS 의 undefined). */
    static Object g(Object o, String k) { return o instanceof Map ? ((Map<?, ?>) o).get(k) : null; }
    /** 목록의 i 번째 — 범위 밖이면 null. */
    static Object at(Object o, int i) { return o instanceof List && i >= 0 && i < ((List<?>) o).size() ? ((List<?>) o).get(i) : null; }
    static int size(Object o) { return o instanceof List ? ((List<?>) o).size() : 0; }
    static double gn(Object o, String k) { return num(g(o, k)); }
    static String gs(Object o, String k) { Object v = g(o, k); return v instanceof String ? (String) v : ""; }

    /** JS Number(x) — null/undefined 는 NaN(이 포팅에서 null 은 '없음'이다), 문자열은 숫자로 읽는다. */
    static double num(Object o) {
        if (o instanceof Double) return (Double) o;
        if (o instanceof Number) return ((Number) o).doubleValue();
        if (o instanceof Boolean) return ((Boolean) o) ? 1 : 0;
        if (o instanceof String) {
            String s = ((String) o).trim();
            if (s.length() == 0) return 0;
            try { return Double.parseDouble(s); } catch (NumberFormatException e) { return Double.NaN; }
        }
        return Double.NaN;
    }
    /** JS 의 전역 isFinite(x) — 단 null/undefined 는 유한하지 않다고 본다(없음). */
    static boolean fin(Object o) { double d = num(o); return !Double.isNaN(d) && !Double.isInfinite(d); }
    static boolean fin(double d) { return !Double.isNaN(d) && !Double.isInfinite(d); }
    /** x != null && isFinite(x) */
    static boolean has(Object o) { return o != null && fin(o); }

    /** JS 참/거짓 판정. */
    static boolean truthy(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) { double d = ((Number) o).doubleValue(); return d != 0 && !Double.isNaN(d); }
        if (o instanceof String) return ((String) o).length() > 0;
        return true;
    }

    /** JS String(x == null ? '' : x). */
    static String str(Object o) {
        if (o == null) return "";
        if (o instanceof String) return (String) o;
        if (o instanceof Number) return ns(((Number) o).doubleValue());
        return String.valueOf(o);
    }

    /** JS 의 숫자 → 글자(정수는 소수점 없이). */
    static String ns(double d) {
        if (Double.isNaN(d)) return "NaN";
        if (Double.isInfinite(d)) return d > 0 ? "Infinity" : "-Infinity";
        if (d == 0) return "0";
        if (d == Math.rint(d) && Math.abs(d) < 1e21) return new BigDecimal(d).toBigInteger().toString();
        String s = Double.toString(d);
        int e = s.indexOf('E');
        if (e < 0) return s;
        double ab = Math.abs(d);
        if (ab >= 1e-6 && ab < 1e21) return new BigDecimal(s).toPlainString();
        String mant = s.substring(0, e), ex = s.substring(e + 1);
        if (mant.endsWith(".0")) mant = mant.substring(0, mant.length() - 2);
        return mant + "e" + (ex.startsWith("-") ? "-" : "+") + ex.replace("-", "");
    }

    /** JS (x).toFixed(n) — 정확한 값 기준 반올림(동점은 올림). */
    static String toFixed(double d, int n) {
        if (Double.isNaN(d) || Double.isInfinite(d)) return ns(d);
        return new BigDecimal(d).setScale(n, RoundingMode.HALF_UP).toPlainString();
    }

    /** JS Math.round. */
    static double round(double x) { return Double.isNaN(x) || Double.isInfinite(x) ? x : Math.floor(x + 0.5); }
    /** JS x | 0 (ToInt32). */
    static int toInt(double x) { return Double.isNaN(x) || Double.isInfinite(x) ? 0 : (int) (long) x; }

    // ── 수학: V8 과 같은 fdlibm ──
    static double sin(double x) { return StrictMath.sin(x); }
    static double cos(double x) { return StrictMath.cos(x); }
    static double asin(double x) { return StrictMath.asin(x); }
    static double exp(double x) { return StrictMath.exp(x); }
    static double log(double x) { return StrictMath.log(x); }
    static double pow(double x, double y) { return StrictMath.pow(x, y); }
    static double sqrt(double x) { return Math.sqrt(x); }

    // ── 모양 만들기 ──
    static Map<String, Object> obj() { return new LinkedHashMap<String, Object>(); }
    /** obj("a", 1, "b", "x") — 숫자는 Double 로 담는다. */
    static Map<String, Object> obj(Object... kv) {
        Map<String, Object> o = new LinkedHashMap<String, Object>();
        for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], v(kv[i + 1]));
        return o;
    }
    static List<Object> list(Object... v) { List<Object> l = new ArrayList<Object>(); for (Object x : v) l.add(v(x)); return l; }
    /** 숫자(Integer·Long 등)는 Double 로, 나머지는 그대로. NaN/Infinity 는 null(JSON.stringify 와 같다). */
    static Object v(Object o) {
        if (o instanceof Double) { double d = (Double) o; return (Double.isNaN(d) || Double.isInfinite(d)) ? null : o; }
        if (o instanceof Number) return Double.valueOf(((Number) o).doubleValue());
        return o;
    }
    static Double d(double x) { return (Double.isNaN(x) || Double.isInfinite(x)) ? null : Double.valueOf(x); }

    /** JSON 으로 복제하듯 깊은 복사(JS rsClone = JSON.parse(JSON.stringify(o))): NaN·Infinity 는 null. */
    @SuppressWarnings("unchecked")
    static Object copy(Object o) {
        if (o instanceof Map) {
            Map<String, Object> r = new LinkedHashMap<String, Object>();
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) r.put(e.getKey(), copy(e.getValue()));
            return r;
        }
        if (o instanceof List) {
            List<Object> r = new ArrayList<Object>(((List<Object>) o).size());
            for (Object x : (List<Object>) o) r.add(copy(x));
            return r;
        }
        return v(o);
    }
    static Map<String, Object> copyM(Object o) { return m(copy(o)); }

    /** 키가 정수 모양인 객체의 키를 JS 처럼 오름차순으로(for-in 순서) — 나머지 키는 넣은 순서대로 뒤에. */
    static List<String> keys(Map<String, Object> o) {
        List<String> ints = new ArrayList<String>(), rest = new ArrayList<String>();
        if (o != null) for (String k : o.keySet()) { if (isIdx(k)) ints.add(k); else rest.add(k); }
        java.util.Collections.sort(ints, new java.util.Comparator<String>() {
            @Override public int compare(String a, String b) { return Long.compare(Long.parseLong(a), Long.parseLong(b)); }
        });
        ints.addAll(rest);
        return ints;
    }
    private static boolean isIdx(String k) {
        int n = k.length();
        if (n == 0 || n > 10) return false;
        for (int i = 0; i < n; i++) { char c = k.charAt(i); if (c < '0' || c > '9') return false; }
        return n == 1 || k.charAt(0) != '0';
    }
    /** 정수 키 → 글자 키 (노드 번호를 객체 키로 쓸 때). */
    static String ik(double i) { return ns(i); }

    // ── 거리 ──
    /** ride-track rtHav / ride-standby rsDistM 과 같은 식(곱셈·나눗셈 순서까지). */
    static double hav(double aLat, double aLng, double bLat, double bLng) {
        double R = 6371000, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
        double s = sin(dLat / 2) * sin(dLat / 2) + cos(aLat * Math.PI / 180) * cos(bLat * Math.PI / 180) * sin(dLng / 2) * sin(dLng / 2);
        return 2 * R * asin(Math.min(1, sqrt(s)));
    }
    /** ride-standby rsHav — 같은 식이지만 p = PI/180 을 미리 곱한다(마지막 자리가 달라 따로 둔다). */
    static double rsHav(double a, double b, double c, double d) {
        double R = 6371000, p = Math.PI / 180, dLa = (c - a) * p, dLo = (d - b) * p;
        double x = sin(dLa / 2) * sin(dLa / 2) + cos(a * p) * cos(c * p) * sin(dLo / 2) * sin(dLo / 2);
        return 2 * R * asin(Math.min(1, sqrt(x)));
    }
}
