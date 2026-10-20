package com.dullyyj.subway;

import java.util.List;
import java.util.Map;

/**
 * 캐릭터 시계 위젯 설정 화면(gw)의 값과 위젯으로 넘기는 설정 — 순수 자바(안드로이드 클래스를 쓰지 않는다).
 * 화면 글은 엔진(settings.js settingsPageGw)이 정한다. 여기는 값을 저장소에 적고, 엔진이 장소 이름으로 찾아 준 좌표를 모아 위젯 설정 JSON 을 만든다.
 */
public final class GwCore {
    private GwCore() { }

    public static final String K_ROAM = "gw_roam", K_M = "gw_m", K_E = "gw_e";
    public static final int ROAM_DEF = 6, ROAM_MIN = 2, ROAM_MAX = 10;

    /** 동물이 한 번 깨어나 돌아다니는 시간(분, 2~10, 기본 6). */
    public static int roam(ShellCore.Store st) {
        try {
            int v = Integer.parseInt(st.get(K_ROAM, String.valueOf(ROAM_DEF)).trim());
            return v < ROAM_MIN ? ROAM_MIN : (v > ROAM_MAX ? ROAM_MAX : v);
        } catch (NumberFormatException e) { return ROAM_DEF; }
    }
    /** gw.roam.dn / gw.roam.up → 1분 줄이거나 늘린다(2~10 안에서). 맞는 행동이면 true. */
    public static boolean stepRoam(ShellCore.Store st, String v) {
        int d = "gw.roam.dn".equals(v) ? -1 : ("gw.roam.up".equals(v) ? 1 : 0);
        if (d == 0) return false;
        int n = Math.max(ROAM_MIN, Math.min(ROAM_MAX, roam(st) + d));
        st.put(K_ROAM, String.valueOf(n));
        return true;
    }
    /** gw.add.<hb|hw|vb|vw> 누름 → 위젯 종류, 아니면 null. */
    public static String addType(String v) {
        if (v == null || !v.startsWith("gw.add.")) return null;
        String t = v.substring(7);
        return ("hb".equals(t) || "hw".equals(t) || "vb".equals(t) || "vw".equals(t)) ? t : null;
    }

    /** 출퇴근 경로 한 쪽({name,lat,lng,bus}). */
    public static final class Pt { public String name = ""; public double lat, lng; public boolean bus; }
    public static final class Route { public Pt from = new Pt(), to = new Pt(); }

    /** /commute-brief 응답의 route → 출발·도착. 없으면(장소를 못 찾았거나 안 정함) null. */
    @SuppressWarnings("unchecked")
    public static Route parseRoute(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            Object r = m.get("route");
            if (!(r instanceof Map)) return null;
            Route out = new Route();
            if (!pt(((Map<String, Object>) r).get("from"), out.from) || !pt(((Map<String, Object>) r).get("to"), out.to)) return null;
            return out;
        } catch (ScreenCore.ParseError e) { return null; }
    }
    @SuppressWarnings("unchecked")
    private static boolean pt(Object o, Pt p) {
        if (!(o instanceof Map)) return false;
        Map<String, Object> m = (Map<String, Object>) o;
        if (!(m.get("name") instanceof String) || !(m.get("lat") instanceof Number) || !(m.get("lng") instanceof Number)) return false;
        p.name = (String) m.get("name"); p.lat = ((Number) m.get("lat")).doubleValue(); p.lng = ((Number) m.get("lng")).doubleValue();
        p.bus = Boolean.TRUE.equals(m.get("bus"));
        return p.name.length() > 0 && p.lat != 0 && p.lng != 0;
    }

    /** 엔진이 찾아 준 출발지 좌표를 저장소에 적는다("위도,경도"; 못 찾았으면 빈 글). kind = morn | eve. */
    public static void putOrigin(ShellCore.Store st, String kind, Route r) {
        st.put("eve".equals(kind) ? K_E : K_M, r == null ? "" : (r.from.lat + "," + r.from.lng));
    }
    static double[] origin(ShellCore.Store st, String k) {
        String s = st.get(k, "");
        if (s.length() == 0) return null;
        String[] p = s.split(",");
        if (p.length != 2) return null;
        try { return new double[] { Double.parseDouble(p[0]), Double.parseDouble(p[1]) }; } catch (NumberFormatException e) { return null; }
    }
    public static boolean mOn(ShellCore.Store st) { return origin(st, K_M) != null; }
    public static boolean eOn(ShellCore.Store st) { return origin(st, K_E) != null; }

    /** 위젯에 넘기는 설정 JSON. 출·퇴근 장소가 정해진(좌표를 찾은) 쪽만 켜진다. 요일이 비면 매일. */
    public static String configJson(ShellCore.Store st) {
        double[] m = origin(st, K_M), e = origin(st, K_E);
        List<Integer> d = CmCore.days(st);
        StringBuilder b = new StringBuilder("{\"on\":").append(m != null || e != null);
        b.append(",\"mOn\":").append(m != null).append(",\"eOn\":").append(e != null);
        b.append(",\"morn\":").append(ShellCore.q(CmCore.morn(st))).append(",\"eve\":").append(ShellCore.q(CmCore.eve(st)));
        b.append(",\"days\":[");
        if (d.isEmpty()) b.append("0,1,2,3,4,5,6");
        else for (int i = 0; i < d.size(); i++) { if (i > 0) b.append(','); b.append(d.get(i)); }
        b.append("],\"roam\":").append(roam(st));
        if (m != null) b.append(",\"mLat\":").append(m[0]).append(",\"mLng\":").append(m[1]);
        if (e != null) b.append(",\"eLat\":").append(e[0]).append(",\"eLng\":").append(e[1]);
        return b.append('}').toString();
    }

    /** 엔진 설정 화면(gw)에 보내는 기기 사실. */
    public static String pageFacts(ShellCore.Store st) {
        return "{\"pf\":{\"nat\":true,\"nv\":true,\"roam\":" + roam(st) + ",\"mOn\":" + mOn(st) + ",\"eOn\":" + eOn(st)
            + ",\"morn\":" + ShellCore.q(CmCore.morn(st)) + ",\"eve\":" + ShellCore.q(CmCore.eve(st)) + "}}";
    }
}
