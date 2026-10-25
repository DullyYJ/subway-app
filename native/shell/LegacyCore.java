package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 예전(웹뷰) 앱의 즐겨찾기 가져오기 — 2026-10-21 (s101). 순수 자바(안드로이드 없음).
 * 같은 앱 이름(com.dullyyj.subway)으로 새 앱을 덮어 설치하면 예전 웹뷰의 localStorage(크롬 leveldb 파일)가 앱 폴더에 남아 있다.
 * 거기서 `mk_favorites`(예전 웹의 즐겨찾기 키 — [{s,d,name}…] 모양 그대로, 새 앱과 같다)를 찾아 낸다.
 *  · 파일의 '쓰기 기록(.log)'은 압축 없이 그대로라 찾을 수 있다. 압축된 표(.ldb) 안에 들어간 값은 찾지 못할 수 있다 — 못 찾으면 아무것도 하지 않는다(지어내지 않는다).
 *  · 값 글자는 첫 바이트가 0x00 이면 UTF-16LE, 0x01 이면 Latin1 이다(크롬 규칙).
 * 계산은 여기서 끝나고, 파일 읽기·저장은 껍데기(ShellActivity)가 한다.
 */
public final class LegacyCore {
    private LegacyCore() {}
    public static final String K_DONE = "mk_legacy_done", K_DONE2 = "mk_legacy_done2";
    /** 예전 앱 본체 저장소의 파일 이름과 열쇠(shared_prefs/gdm_store.xml 의 kv). */
    public static final String OLD_PREFS = "gdm_store", OLD_KV = "kv";
    static final int MAX = 8;
    /** 앱 폴더 안의 예전 localStorage 위치(검사기가 옛 웹 흔적으로 오해하지 않게 이름을 쪼개 둔다). */
    public static final String[] DIRS = { "app_" + "web" + "view/Default/Local Storage/leveldb", "app_" + "web" + "view/Local Storage/leveldb" };

    /** 값 종류: 즐겨찾기 목록 · 커뮤니티 아이디 · 출퇴근 브리핑 설정. */
    static final int M_FAV = 0, M_ID = 1, M_CM = 3;
    static final String KEY_FAV = "mk_favorites", KEY_ID = "mk_comm_id", KEY_CM = "commuteAlarm", KEY_KV = "kv";

    /** 파일 내용들(오래된 것 먼저)에서 가장 나중에 찾은 즐겨찾기 목록을 새 앱 저장 모양(JSON 글)으로. 없으면 null. */
    public static String findFavorites(List<byte[]> files) { return scan(files, KEY_FAV, M_FAV); }

    /** 열쇠 이름의 값을 파일들에서 찾아 모양을 검사한 결과(없거나 모양이 틀리면 null). 가장 나중 것이 이긴다. */
    static String scan(List<byte[]> files, String key, int mode) {
        byte[] needle = key.getBytes(Charset.forName("ISO-8859-1"));
        String best = null;
        for (byte[] f : files) {
            if (f == null) continue;
            for (int i = 0; i + needle.length < f.length; i++) {
                if (!match(f, i, needle)) continue;
                String got = tryAt(f, i + needle.length, mode);
                if (got != null) best = got;
            }
        }
        return best;
    }
    private static boolean match(byte[] f, int at, byte[] needle) {
        for (int j = 0; j < needle.length; j++) if (f[at + j] != needle[j]) return false;
        return true;
    }
    /** 열쇠 글자 바로 뒤에서 값을 읽어 본다: ① 쓰기 기록(길이 → 값) ② 표(값이 바로). */
    private static String tryAt(byte[] f, int p, int mode) {
        // ① 길이(varint) 다음 값
        int[] vi = varint(f, p);
        if (vi != null && vi[0] > 1 && vi[0] < 20000 && vi[1] + vi[0] <= f.length) {
            String s = decode(f, vi[1], vi[0]);
            String r = s == null ? null : check(s, mode);
            if (r != null) return r;
        }
        // ② 값이 바로 이어짐(첫 바이트 = 글자 방식). 짝이 닫힐 때까지 읽는다.
        return check(decodeOpen(f, p), mode);
    }
    private static String check(String raw, int mode) {
        if (raw == null) return null;
        switch (mode) {
            case M_FAV: return shape(raw);
            case M_ID: return idOf(raw);
            case M_CM: return cmOf(raw);
            default: return null;
        }
    }
    private static int[] varint(byte[] f, int p) {
        int v = 0, sh = 0;
        for (int k = 0; k < 4 && p < f.length; k++, p++) {
            int b = f[p] & 255; v |= (b & 127) << sh; sh += 7;
            if ((b & 128) == 0) return new int[] { v, p + 1 };
        }
        return null;
    }
    private static String decode(byte[] f, int at, int len) {
        int kind = f[at];
        if (kind == 1) return new String(f, at + 1, len - 1, Charset.forName("ISO-8859-1"));
        if (kind == 0 && (len - 1) % 2 == 0) return new String(f, at + 1, len - 1, Charset.forName("UTF-16LE"));
        return null;
    }
    private static boolean opener(char c) { return c == '[' || c == '{' || c == '"'; }
    private static String decodeOpen(byte[] f, int at) {
        if (at >= f.length) return null;
        int kind = f[at];
        StringBuilder b = new StringBuilder();
        int depth = 0; boolean str = false, esc = false, quoted = false;
        if (kind != 0 && kind != 1) return null;
        int step = kind == 1 ? 1 : 2;
        for (int i = at + 1; i + step - 1 < f.length && b.length() < 20000; i += step) {
            char c = kind == 1 ? (char) (f[i] & 255) : (char) ((f[i] & 255) | ((f[i + 1] & 255) << 8));
            if (b.length() == 0) { if (!opener(c)) return null; quoted = c == '"'; }
            b.append(c);
            if (quoted) {                                                   // 글자 값: 닫는 따옴표까지
                if (b.length() == 1) continue;
                if (esc) { esc = false; continue; }
                if (c == '\\') { esc = true; continue; }
                if (c == '"') return b.toString();
                continue;
            }
            if (esc) { esc = false; continue; }
            if (str) { if (c == '\\') esc = true; else if (c == '"') str = false; continue; }
            if (c == '"') str = true; else if (c == '[' || c == '{') depth++; else if (c == ']' || c == '}') { depth--; if (depth == 0) return b.toString(); }
        }
        return null;
    }
    /** 글이 [{s,d,name}…] 모양이면 걸러 낸 목록(JSON 글), 아니면 null. 같은 출발-도착·출발=도착은 뺀다(새 앱 규칙과 같다). */
    @SuppressWarnings("unchecked")
    static String shape(String s) {
        if (s == null || s.length() < 2 || s.charAt(0) != '[') return null;
        Object o;
        try { o = ScreenCore.parse(s); } catch (ScreenCore.ParseError e) { return null; }
        if (!(o instanceof List)) return null;
        List<Object> out = new ArrayList<Object>(); List<String> seen = new ArrayList<String>();
        for (Object x : (List<Object>) o) {
            if (!(x instanceof Map)) continue;
            Map<String, Object> m = (Map<String, Object>) x;
            Object a = m.get("s"), d = m.get("d"), n = m.get("name");
            if (!(a instanceof String) || !(d instanceof String)) continue;
            String sn = ((String) a).trim(), dn = ((String) d).trim();
            if (sn.length() == 0 || dn.length() == 0 || sn.length() > 30 || dn.length() > 30 || sn.equals(dn) || seen.contains(sn + ">" + dn)) continue;
            String nm = n instanceof String ? ((String) n).trim() : "";
            if (nm.length() == 0 || nm.length() > 20) nm = (sn + "→" + dn);
            if (nm.length() > 20) nm = nm.substring(0, 20);
            seen.add(sn + ">" + dn);
            Map<String, Object> r = new LinkedHashMap<String, Object>(); r.put("s", sn); r.put("d", dn); r.put("name", nm);
            out.add(r);
            if (out.size() >= MAX) break;
        }
        return out.isEmpty() ? null : HomeSearchCore.toJson(out);
    }
    // ═════════════ 즐겨찾기 밖의 값들(커뮤니티 아이디 · 출퇴근 브리핑) ═════════════
    /** 예전 웹은 값을 JSON.stringify 해서 저장했다 → 아이디는 따옴표로 싼 글자. 아이디 규칙(2~12자 한글/영문/숫자/밑줄)에 맞을 때만. */
    static String idOf(String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.length() >= 2 && v.charAt(0) == '"' && v.charAt(v.length() - 1) == '"') v = v.substring(1, v.length() - 1);
        else if (v.length() > 0 && (v.charAt(0) == '{' || v.charAt(0) == '[')) return null;
        v = v.trim();
        return ShellCore.idError(v).length() == 0 ? v : null;
    }
    /** 출퇴근 브리핑 설정: 객체이고 시각이 'HH:MM' 이거나 켜짐 값이 있을 때만(그대로 돌려준다 — 적용은 applyCommute). */
    @SuppressWarnings("unchecked")
    static String cmOf(String raw) {
        if (raw == null || raw.length() < 2 || raw.charAt(0) != '{') return null;
        try {
            Object o = ScreenCore.parse(raw);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            boolean hm = CmCore.hm(str(m.get("morn")), "").length() == 5 || CmCore.hm(str(m.get("eve")), "").length() == 5;
            return (hm || m.get("on") instanceof Boolean) ? raw : null;
        } catch (ScreenCore.ParseError e) { return null; }
    }
    private static String str(Object o) { return o instanceof String ? (String) o : ""; }

    /** 예전 출퇴근 브리핑 설정을 새 앱 저장값으로 옮긴다. 형식이 틀린 칸은 건너뛴다. @return 옮긴 칸이 있으면 true */
    @SuppressWarnings("unchecked")
    public static boolean applyCommute(ShellCore.Store st, String raw) {
        String ok = cmOf(raw);
        if (ok == null) return false;
        Map<String, Object> m;
        try { m = (Map<String, Object>) ScreenCore.parse(ok); } catch (ScreenCore.ParseError e) { return false; }
        boolean any = false;
        if (m.get("on") instanceof Boolean) { st.put(CmCore.K_ON, ((Boolean) m.get("on")) ? "1" : "0"); any = true; }
        String mo = CmCore.hm(str(m.get("morn")), ""), ev = CmCore.hm(str(m.get("eve")), "");
        if (mo.length() == 5) { st.put(CmCore.K_MORN, mo); any = true; }
        if (ev.length() == 5) { st.put(CmCore.K_EVE, ev); any = true; }
        if (m.get("days") instanceof List) {
            List<Integer> d = new ArrayList<Integer>();
            for (Object x : (List<Object>) m.get("days")) if (x instanceof Number) { int n = ((Number) x).intValue(); if (n >= 0 && n <= 6 && !d.contains(n)) d.add(n); }
            java.util.Collections.sort(d);
            st.put(CmCore.K_DAYS, CmCore.daysStr(d)); any = true;
        }
        String[][] map = { { "from", "from" }, { "to", "to" }, { "eFrom", "eFrom" }, { "eTo", "eTo" } };
        for (String[] k : map) {
            String nm = str(m.get(k[0])).trim();
            if (nm.length() == 0 || nm.length() > 40) continue;
            double[] geo = null;
            Object la = m.get(k[1] + "Lat"), ln = m.get(k[1] + "Lng"), bus = m.get(k[1] + "Bus");
            if (Boolean.TRUE.equals(bus) && la instanceof Number && ln instanceof Number) geo = new double[] { ((Number) la).doubleValue(), ((Number) ln).doubleValue() };
            CmCore.setPlace(st, k[0], nm, geo); any = true;
        }
        return any;
    }

    /** 예전 앱 본체 저장소(shared_prefs/gdm_store 의 kv)는 {열쇠:글자} 모양이다. 거기서 열쇠 하나의 글자를 꺼낸다. 없으면 null. */
    @SuppressWarnings("unchecked")
    public static String fromKv(String kvJson, String key) {
        if (kvJson == null || kvJson.length() < 2) return null;
        try {
            Object o = ScreenCore.parse(kvJson);
            Object v = o instanceof Map ? ((Map<String, Object>) o).get(key) : null;
            return v instanceof String ? (String) v : null;
        } catch (ScreenCore.ParseError e) { return null; }
    }

    /** 찾은 예전 값 묶음(모양을 검사한 새 앱 저장 모양). 없는 것은 null. */
    public static final class Found {
        public String fav, id, commute;
        public boolean any() { return fav != null || id != null || commute != null; }
    }
    /** kvJson(앱 본체 저장소 · 없으면 null)을 먼저 보고, 없는 것만 localStorage 파일들에서 찾는다. */
    public static Found find(List<byte[]> files, String kvJson) {
        Found f = new Found();
        f.fav = shape(fromKv(kvJson, KEY_FAV));
        f.id = idOf(fromKv(kvJson, KEY_ID));
        f.commute = cmOf(fromKv(kvJson, KEY_CM));
        if (files != null) {
            if (f.fav == null) f.fav = scan(files, KEY_FAV, M_FAV);
            if (f.id == null) f.id = scan(files, KEY_ID, M_ID);
            if (f.commute == null) f.commute = scan(files, KEY_CM, M_CM);
        }
        return f;
    }

    public static int count(String json) {
        try { Object o = ScreenCore.parse(json); return o instanceof List ? ((List<?>) o).size() : 0; } catch (ScreenCore.ParseError e) { return 0; }
    }
}
