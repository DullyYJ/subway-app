package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 출퇴근 브리핑 알림 설정의 "기기 쪽 상태" (2026-10-21 s104) — 순수 자바(안드로이드·시계·네트워크 없음).
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
 *   화면의 글·칸·요일 안내·퇴근 힌트·역 후보는 모두 엔진(/screen/settings?p=cm)이 만든다. 여기는 사용자가 누른 것을 저장소에 적고
 *   (켜짐·출근/퇴근 시각·요일·장소 이름과 버스 좌표), 시각 고르기·장소 고르기 하위 화면의 "지금 어디까지 골랐나"만 기억한다.
 *   알림 문구는 엔진 POST /commute-brief, 언제 울릴지는 엔진 POST /commute-alarm(op:'occ') 가 정한다 — 여기는 그 요청 본문을 만들 뿐이다.
 */
public final class CmCore {
    public static final String K_ON = "cm_on", K_MORN = "cm_morn", K_EVE = "cm_eve", K_DAYS = "cm_days";
    /** 장소 칸 이름(엔진 SETTINGS_PICK 의 키와 같다): 출근 출발 · 출근 도착 · 퇴근 출발 · 퇴근 도착. */
    public static final String[] PK = { "from", "to", "eFrom", "eTo" };
    /** 눌림 결과(비트) — 껍데기가 이 값을 보고 다시 그리기·알림 다시 예약·미리보기·닫기·버스 정류장 찾기를 한다. */
    public static final int R_NONE = 0, R_RENDER = 1, R_RESCHED = 2, R_TEST = 4, R_CLOSE = 8, R_BUS = 16;

    /** s281: 시각 고르기를 가운데 팝업으로 열었다 — 엔진이 뒤로 가기 줄을 빼고 단추 묶음(grp)을 준다. */
    public boolean pop;
    public String sub = "";                          // "" · "tp"(시각 고르기) · "pick"(장소 고르기)
    public String tpT = "morn", tpAp = "am";
    public int tpH = 7, tpM = 30;
    public String pkK = "from", pkQ = "";
    /** s278: 설정 화면 안 장소 입력칸에서 고치는 중(하위 화면 없이 그 자리에서). 켜져 있으면 pkK 가 그 칸 · pkQ 가 친 글자 — 엔진이 후보 줄을 그 칸 아래에 끼운다. */
    public boolean inl;
    /** 설정 화면 요청(f=)에 싣는 '지금 고치는 칸 + 버스 후보' 조각(없으면 ""). 열쇠에도 들어가므로 바뀔 때마다 새 화면을 받는다. */
    public static volatile String inlX = "";
    private final List<String> uNames = new ArrayList<String>();          // 엔진이 보여 준 지하철역 후보(pk.u.<번호>)
    private final List<String> busNames = new ArrayList<String>();        // 앱이 찾아 온 버스정류장 후보(pk.b.<번호>)
    private final List<double[]> busGeo = new ArrayList<double[]>();

    // ═════════════ 저장 값 ═════════════
    public static boolean on(ShellCore.Store st) { return "1".equals(st.get(K_ON, "0")); }
    public static String morn(ShellCore.Store st) { return hm(st.get(K_MORN, "07:30"), "07:30"); }
    public static String eve(ShellCore.Store st) { return hm(st.get(K_EVE, "18:30"), "18:30"); }
    /** 'HH:MM' 두 자리 모양만 받는다. */
    static String hm(String s, String def) {
        if (s == null || s.length() != 5 || s.charAt(2) != ':') return def;
        for (int i = 0; i < 5; i++) if (i != 2 && !Character.isDigit(s.charAt(i))) return def;
        int h = (s.charAt(0) - '0') * 10 + (s.charAt(1) - '0'), m = (s.charAt(3) - '0') * 10 + (s.charAt(4) - '0');
        return (h < 24 && m < 60) ? s : def;
    }
    /** 보낼 요일(0=일 … 6=토). 저장 안 했으면 평일. 비어 있으면(고른 게 없음) 엔진이 매일로 본다. */
    public static List<Integer> days(ShellCore.Store st) {
        String s = st.get(K_DAYS, "1,2,3,4,5");
        List<Integer> out = new ArrayList<Integer>();
        if (s == null) return out;
        for (String p : s.split(",")) {
            p = p.trim();
            if (p.length() == 1 && p.charAt(0) >= '0' && p.charAt(0) <= '6') { Integer d = p.charAt(0) - '0'; if (!out.contains(d)) out.add(d); }
        }
        java.util.Collections.sort(out);
        return out;
    }
    static String daysStr(List<Integer> d) { StringBuilder b = new StringBuilder(); for (int i = 0; i < d.size(); i++) { if (i > 0) b.append(','); b.append(d.get(i)); } return b.toString(); }
    static String nameKey(String k) { return "cm_" + k.toLowerCase(java.util.Locale.ROOT); }
    public static String place(ShellCore.Store st, String k) { return st.get(nameKey(k), ""); }
    /** 장소 좌표 저장: "위도,경도,1"(버스정류장). 지하철역·직접 입력은 없음 — 역은 엔진이 이름으로 찾는다. */
    static String geoKey(String k) { return nameKey(k) + "_g"; }
    static void setPlace(ShellCore.Store st, String k, String name, double[] geo) {
        st.put(nameKey(k), name == null ? "" : name);
        st.put(geoKey(k), geo == null ? "" : (geo[0] + "," + geo[1] + ",1"));
    }
    /** 엔진에 보낼 장소 {nm,lat?,lng?,bus?} — 이름이 비면 null. */
    static String placeJson(ShellCore.Store st, String k) {
        String nm = place(st, k).trim();
        if (nm.length() == 0) return null;
        StringBuilder b = new StringBuilder("{\"nm\":").append(ShellCore.q(nm));
        String g = st.get(geoKey(k), "");
        if (g.length() > 0) {
            String[] p = g.split(",");
            if (p.length == 3) {
                try { b.append(",\"lat\":").append(Double.parseDouble(p[0])).append(",\"lng\":").append(Double.parseDouble(p[1])).append(",\"bus\":true"); }
                catch (NumberFormatException e) { /* 깨진 좌표는 이름만 */ }
            }
        }
        return b.append('}').toString();
    }

    // ═════════════ 엔진 요청 본문 ═════════════
    /** POST /commute-brief 본문. gps 가 null 이면 싣지 않는다. */
    public static String briefBody(ShellCore.Store st, String kind, long nowMs, double[] gps) {
        StringBuilder b = new StringBuilder("{\"kind\":").append(ShellCore.q("eve".equals(kind) ? "eve" : ("auto".equals(kind) ? "auto" : "morn"))).append(",\"nowMs\":").append(nowMs);
        for (String k : PK) { String p = placeJson(st, k); if (p != null) b.append(',').append(ShellCore.q(k)).append(':').append(p); }
        if (gps != null) b.append(",\"gps\":{\"lat\":").append(gps[0]).append(",\"lng\":").append(gps[1]).append('}');
        return b.append('}').toString();
    }
    /** POST /commute-alarm 본문(op:'occ') — 앞으로 28일치 울릴 시각을 엔진이 정한다. */
    public static String occBody(ShellCore.Store st, long nowMs) {
        return "{\"op\":\"occ\",\"nowMs\":" + nowMs + ",\"morn\":" + ShellCore.q(morn(st)) + ",\"eve\":" + ShellCore.q(eve(st)) + ",\"days\":[" + daysStr(days(st)) + "]}";
    }
    /** /commute-alarm occ 응답 → 시각 목록(ms). kind = "morn" | "eve". 이상하면 빈 배열. */
    @SuppressWarnings("unchecked")
    public static long[] parseOcc(String resp, String kind, int max) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return new long[0];
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get(kind) instanceof List)) return new long[0];
            List<Object> l = (List<Object>) m.get(kind);
            int n = Math.min(max, l.size());
            long[] out = new long[n]; int c = 0;
            for (int i = 0; i < n; i++) if (l.get(i) instanceof Number) out[c++] = ((Number) l.get(i)).longValue();
            return java.util.Arrays.copyOf(out, c);
        } catch (ScreenCore.ParseError e) { return new long[0]; }
    }
    /** /commute-brief 응답 → { 제목, 본문 }. 없으면 null. */
    @SuppressWarnings("unchecked")
    public static String[] parseBrief(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get("title") instanceof String) || !(m.get("body") instanceof String)) return null;
            String t = (String) m.get("title"), b = (String) m.get("body");
            if (t.length() == 0 || b.length() == 0) return null;
            String k = "eve".equals(m.get("kind")) ? "eve" : "morn";                 // 엔진이 정한 출근/퇴근(미리보기 auto 도 여기서 정해진다)
            return new String[] { t.length() > 80 ? t.substring(0, 80) : t, b.length() > 800 ? b.substring(0, 800) : b, k };
        } catch (ScreenCore.ParseError e) { return null; }
    }

    // ═════════════ 엔진 화면 요청에 싣는 기기 사실 ═════════════
    public String pageFacts(ShellCore.Store st) {
        StringBuilder b = new StringBuilder("{\"pf\":{\"nat\":true,\"nv\":true,\"on\":").append(on(st));
        b.append(",\"morn\":").append(ShellCore.q(morn(st))).append(",\"eve\":").append(ShellCore.q(eve(st)));
        b.append(",\"days\":[").append(daysStr(days(st))).append(']');
        for (String k : PK) b.append(',').append(ShellCore.q(k)).append(':').append(ShellCore.q(place(st, k)));
        if ("tp".equals(sub) && pop) b.append(",\"pop\":true");
        if ("tp".equals(sub)) b.append(",\"sub\":\"tp\",\"tp\":{\"t\":").append(ShellCore.q(tpT)).append(",\"ap\":").append(ShellCore.q(tpAp)).append(",\"h\":").append(tpH).append(",\"m\":").append(tpM).append('}');
        else if ("pick".equals(sub)) {
            b.append(",\"sub\":\"pick\",\"pick\":{\"k\":").append(ShellCore.q(pkK)).append(",\"q\":").append(ShellCore.q(pkQ)).append("},\"bus\":[");
            for (int i = 0; i < busNames.size(); i++) { if (i > 0) b.append(','); b.append(ShellCore.q(busNames.get(i))); }
            b.append(']');
        }
        return b.append("}}").toString();
    }
    /** 시각 고르기 팝업 화면의 기기 사실(미리 받아 두려고 — 상태를 바꾸지 않는다). kind = morn | eve. */
    public static String tpPopFacts(ShellCore.Store st, String kind) {
        String s = "eve".equals(kind) ? eve(st) : morn(st);
        int h24 = (s.charAt(0) - '0') * 10 + (s.charAt(1) - '0'), m = (s.charAt(3) - '0') * 10 + (s.charAt(4) - '0');
        CmCore c = new CmCore(); c.sub = "tp"; c.pop = true; c.tpT = "eve".equals(kind) ? "eve" : "morn";
        c.tpAp = h24 >= 12 ? "pm" : "am"; c.tpH = h24 % 12 == 0 ? 12 : h24 % 12; c.tpM = m - (m % 5);
        return c.pageFacts(st);
    }
    /** 엔진이 보여 준 지하철역 후보(info.pk.u 의 이름들)를 받아 둔다 — pk.u.<번호> 를 눌렀을 때 이름을 찾는다. */
    private void syncX() {
        if (!inl) { inlX = ""; return; }
        StringBuilder b = new StringBuilder(",\"pick\":{\"k\":").append(ShellCore.q(pkK)).append(",\"q\":").append(ShellCore.q(pkQ)).append("},\"bus\":[");
        for (int i = 0; i < busNames.size(); i++) { if (i > 0) b.append(','); b.append(ShellCore.q(busNames.get(i))); }
        inlX = b.append(']').toString();
    }
    /** 설정 화면 안 출퇴근 패널의 기기 사실(엔진 settingsPageFacts 와 같은 모양 · cmf). */
    public static String inlineFacts(ShellCore.Store st) {
        StringBuilder b = new StringBuilder("{\"nat\":true,\"nv\":true,\"on\":").append(on(st));
        b.append(",\"morn\":").append(ShellCore.q(morn(st))).append(",\"eve\":").append(ShellCore.q(eve(st)));
        b.append(",\"days\":[").append(daysStr(days(st))).append(']');
        for (String k : PK) b.append(',').append(ShellCore.q(k)).append(':').append(ShellCore.q(place(st, k)));
        return b.append(inlX).append('}').toString();
    }
    static boolean isPk(String k) { for (String x : PK) if (x.equals(k)) return true; return false; }
    /** 입력칸에 손가락이 들어옴: 어느 칸인지만 적는다(그려 다시 받지 않는다). */
    public void focusInline(String k, String q) {
        if (!isPk(k)) return;
        inl = true; pkK = k; pkQ = q == null ? "" : q; clearBus(); syncX();
    }
    /** 입력칸에서 글자가 바뀜. */
    public int onInline(String k, String q) {
        if (!isPk(k)) return R_NONE;
        boolean same = inl && k.equals(pkK);
        inl = true; pkK = k; pkQ = q == null ? "" : q;
        if (!same) clearBus();
        if (pkQ.trim().length() < 2) { clearBus(); syncX(); return R_RENDER; }
        syncX();
        return R_RENDER | R_BUS;                   // 지하철역 후보는 엔진이 바로 그린다 · 버스정류장은 찾아 오는 대로 한 번 더 그린다
    }
    /** 입력칸을 벗어남(s281) — 친 글자가 있고 저장된 것과 다르면 자동 저장한다. @return 눌림 결과(R_*) */
    public int blurInline(ShellCore.Store st, String k, String typed) {
        if (!inl || !k.equals(pkK)) return R_NONE;
        String t = typed == null ? "" : typed.trim();
        if (t.length() > 0 && t.length() <= 60 && !t.equals(place(st, k).trim())) {          // 글자를 모두 지운 채 벗어나면 저장된 것을 그대로 둔다 — 비우기는 Enter 로만

            setPlace(st, k, t, null); endInline();
            return R_RENDER | R_RESCHED;
        }
        endInline();
        return R_RENDER;
    }
    /** 고치기를 끝낸다(저장하지 않은 글자는 버린다). 켜져 있었으면 true. */
    public boolean endInline() { boolean was = inl; inl = false; clearBus(); syncX(); return was; }
    public void setStations(List<String> names) { uNames.clear(); if (names != null) uNames.addAll(names); }
    /** 앱이 찾아 온 버스정류장 후보(이름 · 위도 · 경도). */
    public void setBus(List<String> names, List<double[]> geo) {
        busNames.clear(); busGeo.clear();
        if (names == null || geo == null) { syncX(); return; }
        for (int i = 0; i < names.size() && i < geo.size(); i++) { busNames.add(names.get(i)); busGeo.add(geo.get(i)); }
        syncX();
    }
    public void clearBus() { busNames.clear(); busGeo.clear(); if (inl) syncX(); }
    public boolean picking() { return "pick".equals(sub); }

    /** 장소 칸에서 글자가 바뀜 → 검색어를 기억하고 버스정류장을 다시 찾게 한다. */
    public int onQuery(String q) {
        if (!"pick".equals(sub)) return R_NONE;
        pkQ = q == null ? "" : q;
        if (pkQ.trim().length() < 2) { clearBus(); return R_RENDER; }
        return R_BUS;
    }

    // ═════════════ 눌림 ═════════════
    /**
     * @param a  행동 종류(call · set)  @param v  call 이름  @param key  스위치 키(cm)  @param on  스위치 값  @param q  입력칸 글자(pk.save 일 때)
     */
    public int act(ShellCore.Store st, String a, String v, String key, boolean on, String q) {
        if ("set".equals(a)) {
            if (!"cm".equals(key)) return R_NONE;
            st.put(K_ON, on ? "1" : "0");
            return R_RENDER | R_RESCHED;
        }
        if (!"call".equals(a) || v == null) return R_NONE;
        if ("pg.back".equals(v)) { if (sub.length() > 0) { sub = ""; clearBus(); return R_RENDER; } return R_CLOSE; }
        if (v.startsWith("cm.day.")) {
            int d = digit(v, 7);
            if (d < 0 || d > 6) return R_NONE;
            List<Integer> l = days(st);
            if (l.contains(d)) l.remove(Integer.valueOf(d)); else l.add(d);
            java.util.Collections.sort(l);
            st.put(K_DAYS, daysStr(l));
            return R_RENDER | R_RESCHED;
        }
        if (v.startsWith("cm.preset.")) {
            String p = v.substring(10);
            st.put(K_DAYS, "weekday".equals(p) ? "1,2,3,4,5" : "weekend".equals(p) ? "0,6" : "all".equals(p) ? "0,1,2,3,4,5,6" : st.get(K_DAYS, "1,2,3,4,5"));
            return R_RENDER | R_RESCHED;
        }
        if ("cm.tp.morn".equals(v) || "cm.tp.eve".equals(v)) {
            tpT = v.endsWith("eve") ? "eve" : "morn";
            String s = "eve".equals(tpT) ? eve(st) : morn(st);
            int h24 = (s.charAt(0) - '0') * 10 + (s.charAt(1) - '0'), m = (s.charAt(3) - '0') * 10 + (s.charAt(4) - '0');
            tpAp = h24 >= 12 ? "pm" : "am"; tpH = h24 % 12 == 0 ? 12 : h24 % 12; tpM = m - (m % 5);
            sub = "tp";
            return R_RENDER;
        }
        if ("tp.ap.am".equals(v) || "tp.ap.pm".equals(v)) { tpAp = v.endsWith("pm") ? "pm" : "am"; return R_RENDER; }
        if (v.startsWith("tp.h.")) { int h = num(v, 5); if (h < 1 || h > 12) return R_NONE; tpH = h; return R_RENDER; }
        if (v.startsWith("tp.m.")) { int m = num(v, 5); if (m < 0 || m > 55 || m % 5 != 0) return R_NONE; tpM = m; return R_RENDER; }
        if ("tp.cancel".equals(v)) { sub = ""; pop = false; return R_RENDER; }
        if ("tp.ok".equals(v)) {
            int h24 = (tpH % 12) + ("pm".equals(tpAp) ? 12 : 0);
            String s = (h24 < 10 ? "0" : "") + h24 + ":" + (tpM < 10 ? "0" : "") + tpM;
            st.put("eve".equals(tpT) ? K_EVE : K_MORN, s);
            sub = ""; pop = false;
            return R_RENDER | R_RESCHED;
        }
        if (v.startsWith("cm.pick.")) {
            String k = v.substring(8);
            boolean known = false; for (String x : PK) if (x.equals(k)) known = true;
            if (!known) return R_NONE;
            pkK = k; pkQ = place(st, k); sub = "pick"; clearBus(); uNames.clear();
            return pkQ.trim().length() >= 2 ? (R_RENDER | R_BUS) : R_RENDER;
        }
        if ("cm.test".equals(v)) return R_TEST;
        if (v.startsWith("pk.save.")) {                                            // 설정 화면 안 입력칸의 [저장] · 엔터: 그 칸 글자를 저장(비면 지움)
            String k = v.substring(8);
            if (!isPk(k)) return R_NONE;
            setPlace(st, k, q == null ? "" : q.trim(), null); endInline();
            return R_RENDER | R_RESCHED;
        }
        if ("pk.n".equals(v)) {                                                    // 설정 화면 안 지하철 후보 줄(이름은 엔진이 줬다)
            if (!inl || q == null || q.trim().length() == 0 || q.length() > 60) return R_NONE;
            setPlace(st, pkK, q.trim(), null); endInline();
            return R_RENDER | R_RESCHED;
        }
        if (!"pick".equals(sub) && !inl) return R_NONE;
        if ("pk.cancel".equals(v)) { sub = ""; clearBus(); return R_RENDER; }
        if ("pk.clear".equals(v)) { setPlace(st, pkK, "", null); sub = ""; clearBus(); return R_RENDER | R_RESCHED; }
        if ("pk.save".equals(v)) { setPlace(st, pkK, q == null ? pkQ.trim() : q.trim(), null); sub = ""; clearBus(); return R_RENDER | R_RESCHED; }
        if (v.startsWith("pk.u.")) {
            int i = num(v, 5);
            if (i < 0 || i >= uNames.size()) return R_NONE;
            setPlace(st, pkK, uNames.get(i), null); sub = ""; clearBus();
            return R_RENDER | R_RESCHED;
        }
        if (v.startsWith("pk.b.")) {
            int i = num(v, 5);
            if (i < 0 || i >= busNames.size()) return R_NONE;
            setPlace(st, pkK, busNames.get(i), busGeo.get(i)); sub = ""; inl = false; clearBus(); syncX();
            return R_RENDER | R_RESCHED;
        }
        return R_NONE;
    }
    private static int digit(String v, int at) { return (v.length() == at + 1 && Character.isDigit(v.charAt(at))) ? v.charAt(at) - '0' : -1; }
    private static int num(String v, int at) {
        if (v.length() <= at || v.length() > at + 3) return -1;
        int n = 0;
        for (int i = at; i < v.length(); i++) { char c = v.charAt(i); if (!Character.isDigit(c)) return -1; n = n * 10 + (c - '0'); }
        return n;
    }
}
