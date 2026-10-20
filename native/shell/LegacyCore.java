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
    public static final String K_DONE = "mk_legacy_done";
    static final byte[] NEEDLE = "mk_favorites".getBytes(Charset.forName("ISO-8859-1"));
    static final int MAX = 8;
    /** 앱 폴더 안의 예전 localStorage 위치(검사기가 옛 웹 흔적으로 오해하지 않게 이름을 쪼개 둔다). */
    public static final String[] DIRS = { "app_" + "web" + "view/Default/Local Storage/leveldb", "app_" + "web" + "view/Local Storage/leveldb" };

    /** 파일 내용들(오래된 것 먼저)에서 가장 나중에 찾은 즐겨찾기 목록을 새 앱 저장 모양(JSON 글)으로. 없으면 null. */
    public static String findFavorites(List<byte[]> files) {
        String best = null;
        for (byte[] f : files) {
            if (f == null) continue;
            for (int i = 0; i + NEEDLE.length < f.length; i++) {
                if (!match(f, i)) continue;
                String got = tryAt(f, i + NEEDLE.length);
                if (got != null) best = got;
            }
        }
        return best;
    }
    private static boolean match(byte[] f, int at) {
        for (int j = 0; j < NEEDLE.length; j++) if (f[at + j] != NEEDLE[j]) return false;
        return true;
    }
    /** 열쇠 글자 바로 뒤에서 값을 읽어 본다: ① 쓰기 기록(길이 → 값) ② 표(값이 바로). */
    private static String tryAt(byte[] f, int p) {
        // ① 길이(varint) 다음 값
        int[] vi = varint(f, p);
        if (vi != null && vi[0] > 1 && vi[0] < 20000 && vi[1] + vi[0] <= f.length) {
            String s = decode(f, vi[1], vi[0]);
            String r = s == null ? null : shape(s);
            if (r != null) return r;
        }
        // ② 값이 바로 이어짐(첫 바이트 = 글자 방식). 대괄호가 닫힐 때까지 읽는다.
        return shape(decodeOpen(f, p));
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
    private static String decodeOpen(byte[] f, int at) {
        if (at >= f.length) return null;
        int kind = f[at];
        StringBuilder b = new StringBuilder();
        int depth = 0; boolean str = false, esc = false;
        if (kind == 1) {
            for (int i = at + 1; i < f.length && b.length() < 20000; i++) {
                char c = (char) (f[i] & 255);
                if (b.length() == 0 && c != '[') return null;
                b.append(c);
                if (esc) { esc = false; continue; }
                if (str) { if (c == '\\') esc = true; else if (c == '"') str = false; continue; }
                if (c == '"') str = true; else if (c == '[' || c == '{') depth++; else if (c == ']' || c == '}') { depth--; if (depth == 0) return b.toString(); }
            }
        } else if (kind == 0) {
            for (int i = at + 1; i + 1 < f.length && b.length() < 20000; i += 2) {
                char c = (char) ((f[i] & 255) | ((f[i + 1] & 255) << 8));
                if (b.length() == 0 && c != '[') return null;
                b.append(c);
                if (esc) { esc = false; continue; }
                if (str) { if (c == '\\') esc = true; else if (c == '"') str = false; continue; }
                if (c == '"') str = true; else if (c == '[' || c == '{') depth++; else if (c == ']' || c == '}') { depth--; if (depth == 0) return b.toString(); }
            }
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
    public static int count(String json) {
        try { Object o = ScreenCore.parse(json); return o instanceof List ? ((List<?>) o).size() : 0; } catch (ScreenCore.ParseError e) { return 0; }
    }
}
