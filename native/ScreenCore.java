package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 서버 구동 화면(엔진이 화면 구성 JSON 을 내려 주고 앱은 그리기만 하는 방식)의 순수 자바 코어 — android.* 없음, JVM 에서 시험.
 *
 * 2026-10-18 (YJ: "최종목표는 웹뷰를 100% 네이티브로 — 엔진이 화면 구성까지 내려주는 방식. 로컬 캐시·검증 실패 시 기본 화면 폴백 포함").
 *   원칙: 계산은 엔진이, 그림은 앱이. 이 코어는 (1) 엔진이 준 JSON 을 읽고(작은 파서) (2) 모양을 검증하고(틀리면 ParseError → 웹이 저장본/예전 화면으로 폴백)
 *   (3) 폭이 정해지면 줄바꿈·칸 배치·높이를 계산(글자 폭은 Measurer 가 알려 준다)하고 (4) 손가락 위치에서 눌린 행동을 찾는다. 무엇을 보일지는 정하지 않는다.
 *
 *   JSON(v:1)  { ok:true, v:1, screen:'shop', rev, head:[노드], body:[노드] }
 *     chips  { pad:[l,t,r,b], gap, h, items:[{label, badge, on, act}] }          가로로 밀리는 칩 줄
 *     grid   { pad, cols, gap, items:[{t:'card', name, tag, img, fb, act}] }      칸 격자(각 줄 높이는 그 줄에서 가장 큰 카드)
 *     text   { pad, s, size, bold, color, alpha, lh, align, lines }               줄바꿈 글
 *     button { pad, s, size, h, act }                                             넓은 단추
 *     spacer { h }
 *     act    { a:'cat', v } | { a:'open', url } | { a:'refresh' }
 *   모르는 노드 종류는 건너뛴다(앞으로 늘려도 옛 앱이 안 깨진다). 아는 종류인데 모양이 틀리면 화면 전체를 거절한다(깨진 화면을 그리지 않는다).
 *   좌표 단위는 dp(CSS px 와 같다) — 그릴 때 밀도를 곱한다.
 */
public final class ScreenCore {
    private ScreenCore() { }

    /** 글자 폭을 재는 쪽(안드로이드는 Paint, 시험은 가짜). */
    public interface Measurer { float width(String s, float size, boolean bold); }

    /** 검증 실패. 앱은 이 화면을 그리지 않고 폴백한다. */
    public static final class ParseError extends Exception { public ParseError(String m) { super(m); } }

    // ═════════════ ① JSON 읽기 ═════════════
    public static final int MAX_JSON = 3_000_000, MAX_DEPTH = 24, MAX_NODES = 6000, MAX_STR = 2000;

    private static final class P {
        final String s; int i = 0, depth = 0;
        P(String s) { this.s = s; }
        ParseError err(String m) { return new ParseError("JSON " + i + ": " + m); }
        void ws() { while (i < s.length()) { char c = s.charAt(i); if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++; else break; } }
        Object value() throws ParseError {
            ws();
            if (i >= s.length()) throw err("끝");
            char c = s.charAt(i);
            if (c == '{') return obj();
            if (c == '[') return arr();
            if (c == '"') return str();
            if (c == 't' && s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (c == 'f' && s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (c == 'n' && s.startsWith("null", i)) { i += 4; return null; }
            if (c == '-' || (c >= '0' && c <= '9')) return num();
            throw err("뜻밖의 글자 " + c);
        }
        Map<String, Object> obj() throws ParseError {
            if (++depth > MAX_DEPTH) throw err("너무 깊다");
            Map<String, Object> m = new HashMap<String, Object>();
            i++; ws();
            if (i < s.length() && s.charAt(i) == '}') { i++; depth--; return m; }
            while (true) {
                ws();
                if (i >= s.length() || s.charAt(i) != '"') throw err("키");
                String k = str(); ws();
                if (i >= s.length() || s.charAt(i) != ':') throw err(":");
                i++; m.put(k, value()); ws();
                if (i >= s.length()) throw err("끝");
                char c = s.charAt(i++);
                if (c == '}') break;
                if (c != ',') throw err(", 또는 }");
            }
            depth--; return m;
        }
        List<Object> arr() throws ParseError {
            if (++depth > MAX_DEPTH) throw err("너무 깊다");
            List<Object> l = new ArrayList<Object>();
            i++; ws();
            if (i < s.length() && s.charAt(i) == ']') { i++; depth--; return l; }
            while (true) {
                l.add(value()); ws();
                if (i >= s.length()) throw err("끝");
                char c = s.charAt(i++);
                if (c == ']') break;
                if (c != ',') throw err(", 또는 ]");
            }
            depth--; return l;
        }
        String str() throws ParseError {
            i++;
            StringBuilder b = new StringBuilder();
            while (true) {
                if (i >= s.length()) throw err("문자열 끝");
                char c = s.charAt(i++);
                if (c == '"') break;
                if (c < 0x20) throw err("제어문자");
                if (c == '\\') {
                    if (i >= s.length()) throw err("이스케이프");
                    char e = s.charAt(i++);
                    switch (e) {
                        case '"': b.append('"'); break; case '\\': b.append('\\'); break; case '/': b.append('/'); break;
                        case 'b': b.append('\b'); break; case 'f': b.append('\f'); break; case 'n': b.append('\n'); break;
                        case 'r': b.append('\r'); break; case 't': b.append('\t'); break;
                        case 'u': {
                            if (i + 4 > s.length()) throw err("\\u");
                            int v = 0;
                            for (int k = 0; k < 4; k++) { int d = Character.digit(s.charAt(i + k), 16); if (d < 0) throw err("\\u 16진수"); v = v * 16 + d; }
                            i += 4; b.append((char) v); break;
                        }
                        default: throw err("이스케이프 " + e);
                    }
                } else b.append(c);
                if (b.length() > MAX_STR * 4) throw err("문자열이 너무 길다");
            }
            return b.toString();
        }
        Double num() throws ParseError {
            int st = i;
            if (s.charAt(i) == '-') i++;
            while (i < s.length()) { char c = s.charAt(i); if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i++; else break; }
            try { double d = Double.parseDouble(s.substring(st, i)); if (Double.isNaN(d) || Double.isInfinite(d)) throw err("수"); return d; }
            catch (NumberFormatException e) { throw err("수"); }
        }
    }

    public static Object parse(String s) throws ParseError {
        if (s == null || s.length() == 0) throw new ParseError("비어 있다");
        if (s.length() > MAX_JSON) throw new ParseError("너무 크다");
        P p = new P(s);
        Object v = p.value(); p.ws();
        if (p.i != s.length()) throw p.err("뒤에 남은 글자");
        return v;
    }

    // ═════════════ ② 모델 + 검증 ═════════════
    public static final class Act {
        public String a = "", v = "", url = "";
    }
    /** 노드 하나(chips·grid·text·button·spacer) 또는 그 안의 항목(chip·card). */
    public static final class Node {
        public String t = "";
        public float padL, padT, padR, padB;
        public float gap = 6f, h = 0f, size = 12f, lh = 1.35f, alpha = 1f;
        public int cols = 2, maxLines = 0;
        public boolean bold, on;
        public String color = "text", bg = "", align = "left";
        public String s = "", label = "", badge = "", name = "", tag = "", img = "", fb = "";
        public Act act;
        public List<Node> items = new ArrayList<Node>();
    }
    public static final class Screen {
        public String id = "", rev = "";
        public List<Node> head = new ArrayList<Node>(), body = new ArrayList<Node>();
        public int skipped = 0, nodes = 0;
    }

    private static final String[] ROLES = { "bg", "card", "border", "text", "sub", "gold", "orange", "imgbg", "white", "none" };
    private static boolean role(String s) { for (String r : ROLES) if (r.equals(s)) return true; return false; }
    private static boolean httpUrl(String u) {
        if (u == null || u.length() == 0 || u.length() > 1500) return false;
        String l = u.length() > 8 ? u.substring(0, 8).toLowerCase() : u.toLowerCase();
        return l.startsWith("http://") || l.startsWith("https://");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asObj(Object o, String what) throws ParseError {
        if (!(o instanceof Map)) throw new ParseError(what + ": 객체가 아니다");
        return (Map<String, Object>) o;
    }
    @SuppressWarnings("unchecked")
    private static List<Object> asArr(Object o, String what) throws ParseError {
        if (!(o instanceof List)) throw new ParseError(what + ": 배열이 아니다");
        return (List<Object>) o;
    }
    private static String optStr(Map<String, Object> m, String k, String def, int max) throws ParseError {
        Object v = m.get(k);
        if (v == null) return def;
        if (!(v instanceof String)) throw new ParseError(k + ": 글자가 아니다");
        String s = (String) v;
        if (s.length() > max) s = s.substring(0, max);
        return s;
    }
    private static float optNum(Map<String, Object> m, String k, float def, float lo, float hi) throws ParseError {
        Object v = m.get(k);
        if (v == null) return def;
        if (!(v instanceof Double)) throw new ParseError(k + ": 수가 아니다");
        float f = ((Double) v).floatValue();
        if (f < lo || f > hi) throw new ParseError(k + ": 범위 밖 " + f);
        return f;
    }
    private static boolean optBool(Map<String, Object> m, String k, boolean def) throws ParseError {
        Object v = m.get(k);
        if (v == null) return def;
        if (!(v instanceof Boolean)) throw new ParseError(k + ": 참거짓이 아니다");
        return (Boolean) v;
    }
    private static void pad(Map<String, Object> m, Node n) throws ParseError {
        Object v = m.get("pad");
        if (v == null) return;
        List<Object> l = asArr(v, "pad");
        if (l.size() != 4) throw new ParseError("pad: 네 개여야 한다");
        float[] f = new float[4];
        for (int i = 0; i < 4; i++) {
            if (!(l.get(i) instanceof Double)) throw new ParseError("pad: 수가 아니다");
            f[i] = ((Double) l.get(i)).floatValue();
            if (f[i] < 0f || f[i] > 200f) throw new ParseError("pad: 범위 밖");
        }
        n.padL = f[0]; n.padT = f[1]; n.padR = f[2]; n.padB = f[3];
    }
    private static Act act(Object o, boolean required) throws ParseError {
        if (o == null) { if (required) throw new ParseError("act 가 없다"); return null; }
        Map<String, Object> m = asObj(o, "act");
        Act a = new Act();
        a.a = optStr(m, "a", "", 20);
        if ("cat".equals(a.a)) { a.v = optStr(m, "v", "", 60); if (a.v.length() == 0) throw new ParseError("act cat: v 없음"); }
        else if ("open".equals(a.a)) { a.url = optStr(m, "url", "", 1500); if (!httpUrl(a.url)) throw new ParseError("act open: 주소가 http(s) 가 아니다"); }
        else if ("refresh".equals(a.a)) { }
        else throw new ParseError("모르는 행동 " + a.a);
        return a;
    }

    private static Node node(Object o, Screen sc) throws ParseError {
        Map<String, Object> m = asObj(o, "노드");
        String t = optStr(m, "t", "", 20);
        Node n = new Node();
        n.t = t;
        if (++sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
        if ("chips".equals(t)) {
            pad(m, n); n.gap = optNum(m, "gap", 6f, 0f, 60f); n.h = optNum(m, "h", 30f, 16f, 80f);
            for (Object io : asArr(m.get("items"), "chips.items")) {
                Map<String, Object> im = asObj(io, "chip");
                Node c = new Node(); c.t = "chip";
                c.label = optStr(im, "label", "", 60); if (c.label.length() == 0) throw new ParseError("chip: label 없음");
                c.badge = optStr(im, "badge", "", 20); c.on = optBool(im, "on", false); c.act = act(im.get("act"), false);
                n.items.add(c); sc.nodes++;
                if (sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
            }
        } else if ("grid".equals(t)) {
            pad(m, n); n.gap = optNum(m, "gap", 8f, 0f, 60f); n.cols = (int) optNum(m, "cols", 2f, 1f, 4f);
            for (Object io : asArr(m.get("items"), "grid.items")) {
                Map<String, Object> im = asObj(io, "card");
                if (!"card".equals(optStr(im, "t", "", 20))) { sc.skipped++; continue; }
                Node c = new Node(); c.t = "card";
                c.name = optStr(im, "name", "", 200); if (c.name.length() == 0) throw new ParseError("card: name 없음");
                c.tag = optStr(im, "tag", "", 40); c.fb = optStr(im, "fb", "", 16);
                c.img = optStr(im, "img", "", 1500);
                if (c.img.length() > 0 && !httpUrl(c.img)) c.img = "";                // 이미지 주소가 이상하면 그림만 뺀다(카드는 그대로)
                c.act = act(im.get("act"), true);
                n.items.add(c); sc.nodes++;
                if (sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
            }
        } else if ("text".equals(t)) {
            pad(m, n); n.s = optStr(m, "s", "", MAX_STR); n.size = optNum(m, "size", 12f, 6f, 40f); n.bold = optBool(m, "bold", false);
            n.color = optStr(m, "color", "text", 12); if (!role(n.color)) throw new ParseError("color: 모르는 색 " + n.color);
            n.alpha = optNum(m, "alpha", 1f, 0f, 1f); n.lh = optNum(m, "lh", 1.35f, 1f, 3f);
            n.align = optStr(m, "align", "left", 8); if (!"left".equals(n.align) && !"center".equals(n.align) && !"right".equals(n.align)) throw new ParseError("align");
            n.maxLines = (int) optNum(m, "lines", 0f, 0f, 50f);
        } else if ("button".equals(t)) {
            pad(m, n); n.s = optStr(m, "s", "", 80); if (n.s.length() == 0) throw new ParseError("button: s 없음");
            n.size = optNum(m, "size", 12f, 6f, 40f); n.h = optNum(m, "h", 40f, 20f, 120f); n.act = act(m.get("act"), true);
        } else if ("spacer".equals(t)) {
            n.h = optNum(m, "h", 8f, 0f, 400f);
        } else { sc.skipped++; return null; }
        return n;
    }

    /** 읽고 검증한다. 틀리면 ParseError. */
    public static Screen validate(Object root) throws ParseError {
        Map<String, Object> m = asObj(root, "루트");
        Object ok = m.get("ok");
        if (ok instanceof Boolean && !((Boolean) ok)) throw new ParseError("엔진이 실패를 알렸다");
        Object v = m.get("v");
        if (!(v instanceof Double) || ((Double) v).intValue() != 1) throw new ParseError("지원하지 않는 화면 규격 v=" + v);
        Screen sc = new Screen();
        sc.id = optStr(m, "screen", "", 40); if (sc.id.length() == 0) throw new ParseError("screen 없음");
        sc.rev = optStr(m, "rev", "", 120);
        for (Object o : asArr(m.get("head"), "head")) { Node n = node(o, sc); if (n != null) sc.head.add(n); }
        for (Object o : asArr(m.get("body"), "body")) { Node n = node(o, sc); if (n != null) sc.body.add(n); }
        if (sc.head.isEmpty() && sc.body.isEmpty()) throw new ParseError("그릴 것이 없다");
        return sc;
    }

    public static Screen load(String json) throws ParseError { return validate(parse(json)); }

    // ═════════════ ③ 배치 ═════════════
    public static final int K_CHIP = 1, K_CARD = 2, K_TEXT = 3, K_BUTTON = 4;
    public static final float CARD_PAD = 8f, CARD_IMG_H = 78f, CARD_IMG_GAP = 5f, CARD_NAME_SIZE = 11f, CARD_LH = 1.35f, CARD_TAG_GAP = 6f, CHIP_PADX = 12f;

    /** 그릴 조각 하나. 좌표는 속한 영역(머리 또는 본문) 안의 dp. */
    public static final class Item {
        public int kind;
        public float x, y, w, h;
        public String[] lines = new String[0];      // 글 줄 / 카드 이름 줄
        public float size, lineH, textX, textY;     // 글 크기 · 줄 높이 · 첫 줄 위쪽 시작점(영역 좌표)
        public boolean bold, on;
        public String color = "text", bg = "", align = "left";
        public float alpha = 1f;
        public String label = "", badge = "", tag = "", img = "", fb = "";
        public float labelW, badgeW, tagX, tagW;    // 칩: 라벨·뱃지 폭 · 카드: 최저가 글자 자리
        public float ix, iy, iw, ih;                // 카드 그림 자리
        public Act act;
    }

    /** 배치 결과. */
    public static final class Layout {
        public Item[] head = new Item[0], body = new Item[0];
        public float headH, headContentW, bodyH, width;
        float[] headMaxB = new float[0], bodyMaxB = new float[0];     // 앞에서부터 가장 아래쪽(이진 탐색용)
        float headMaxH, bodyMaxH;

        /** 영역 안에서 보이는 조각 범위 [from,to) — 위/아래 한 장 가까이 걸친 것까지. */
        public int[] bodyRange(float y0, float y1) { return range(body, bodyMaxB, y0, y1); }
        public int[] headRange(float x0, float x1) { return rangeX(head, x0, x1); }

        private static int[] range(Item[] it, float[] maxB, float y0, float y1) {
            int lo = 0, hi = it.length;
            while (lo < hi) { int mid = (lo + hi) >>> 1; if (maxB[mid] < y0) lo = mid + 1; else hi = mid; }
            int from = lo, to = from;
            while (to < it.length && it[to].y < y1) to++;
            return new int[] { from, to };
        }
        private static int[] rangeX(Item[] it, float x0, float x1) {
            int from = 0;
            while (from < it.length && it[from].x + it[from].w < x0) from++;
            int to = from;
            while (to < it.length && it[to].x < x1) to++;
            return new int[] { from, to };
        }
        /** 본문 좌표 (x, y) 에서 눌린 행동. 없으면 null. */
        public Act hitBody(float x, float y) { return hit(body, bodyMaxB, x, y); }
        public Act hitHead(float x, float y) { return hit(head, null, x, y); }
        private static Act hit(Item[] it, float[] maxB, float x, float y) {
            if (maxB != null) {
                int[] r = range(it, maxB, y, y + 0.01f);
                for (int i = r[0]; i < r[1]; i++) { Item m = it[i]; if (m.act != null && x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return m.act; }
                return null;
            }
            for (Item m : it) if (m.act != null && x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return m.act;
            return null;
        }
        /** 머리 칩 줄을 가로로 얼마나 밀 수 있나(0 이상). */
        public float headMaxScroll() { return Math.max(0f, headContentW - width); }
        public float bodyMaxScroll(float viewH) { return Math.max(0f, bodyH - viewH); }
    }

    /** 폭 maxW 안에 글을 줄로 나눈다. 공백이 있으면 거기서, 없으면 글자 단위로. maxLines>0 이면 넘는 부분은 … 으로 줄인다. */
    public static List<String> wrap(String s, float maxW, float size, boolean bold, int maxLines, Measurer m) {
        List<String> out = new ArrayList<String>();
        if (s == null || s.length() == 0) return out;
        String[] paras = s.split("\n", -1);
        for (String para : paras) {
            String rest = para;
            if (rest.length() == 0) { out.add(""); continue; }
            while (rest.length() > 0) {
                if (m.width(rest, size, bold) <= maxW) { out.add(rest); rest = ""; break; }
                int cut = fit(rest, maxW, size, bold, m);          // maxW 안에 들어가는 가장 긴 글자 수(≥1)
                int br = -1;
                for (int i = cut; i > 0; i--) { if (rest.charAt(i - 1) == ' ') { br = i; break; } }
                int take = br > 0 ? br : cut;
                out.add(stripEnd(rest.substring(0, take)));
                rest = rest.substring(take);
                while (rest.startsWith(" ")) rest = rest.substring(1);
            }
        }
        if (maxLines > 0 && out.size() > maxLines) {
            List<String> cut = new ArrayList<String>(out.subList(0, maxLines));
            String last = cut.get(maxLines - 1);
            StringBuilder rest = new StringBuilder(last).append(' ').append(join(out.subList(maxLines, out.size())));
            cut.set(maxLines - 1, ellipsize(rest.toString(), maxW, size, bold, m));
            return cut;
        }
        return out;
    }
    private static String join(List<String> l) { StringBuilder b = new StringBuilder(); for (int i = 0; i < l.size(); i++) { if (i > 0) b.append(' '); b.append(l.get(i)); } return b.toString(); }
    private static String stripEnd(String s) { int e = s.length(); while (e > 0 && s.charAt(e - 1) == ' ') e--; return s.substring(0, e); }
    private static int fit(String s, float maxW, float size, boolean bold, Measurer m) {
        int lo = 1, hi = s.length();
        while (lo < hi) { int mid = (lo + hi + 1) >>> 1; if (m.width(s.substring(0, mid), size, bold) <= maxW) lo = mid; else hi = mid - 1; }
        return Math.max(1, lo);
    }
    /** 한 줄에 들어가게 끝을 … 으로 줄인다. */
    public static String ellipsize(String s, float maxW, float size, boolean bold, Measurer m) {
        if (m.width(s, size, bold) <= maxW) return s;
        String e = "…";
        int lo = 0, hi = s.length();
        while (lo < hi) { int mid = (lo + hi + 1) >>> 1; if (m.width(stripEnd(s.substring(0, mid)) + e, size, bold) <= maxW) lo = mid; else hi = mid - 1; }
        return stripEnd(s.substring(0, lo)) + e;
    }

    public static Layout layout(Screen sc, float width, Measurer m) {
        Layout L = new Layout();
        L.width = width;
        // 머리: 칩 줄은 한 줄이라 가로로 놓는다. 머리 노드는 위에서 아래로 쌓는다.
        List<Item> hi = new ArrayList<Item>();
        float y = 0f, contentW = width;
        for (Node n : sc.head) {
            if ("chips".equals(n.t)) {
                float x = n.padL;
                y += n.padT;
                for (Node c : n.items) {
                    Item it = new Item(); it.kind = K_CHIP; it.label = c.label; it.badge = c.badge; it.on = c.on; it.act = c.act;
                    it.size = 12f; it.bold = true;
                    it.labelW = m.width(c.label, 12f, true);
                    it.badgeW = c.badge.length() > 0 ? m.width(c.badge, 12f, true) : 0f;
                    it.w = CHIP_PADX * 2 + it.labelW + (c.badge.length() > 0 ? 6f + it.badgeW : 0f);
                    it.h = n.h; it.x = x; it.y = y;
                    hi.add(it); x += it.w + n.gap;
                }
                contentW = Math.max(contentW, x - n.gap + n.padR);
                y += n.h + n.padB;
            } else y = stack(n, width, y, hi, m);
        }
        L.head = hi.toArray(new Item[0]); L.headH = y; L.headContentW = contentW;
        // 본문
        List<Item> bi = new ArrayList<Item>();
        y = 0f;
        for (Node n : sc.body) y = stack(n, width, y, bi, m);
        L.body = bi.toArray(new Item[0]); L.bodyH = y;
        L.headMaxB = maxB(L.head); L.bodyMaxB = maxB(L.body);
        return L;
    }
    private static float[] maxB(Item[] it) {
        float[] r = new float[it.length]; float mx = -1e9f;
        for (int i = 0; i < it.length; i++) { mx = Math.max(mx, it[i].y + it[i].h); r[i] = mx; }
        return r;
    }

    /** 노드 하나를 y 에서부터 쌓고 다음 y 를 돌려준다. */
    private static float stack(Node n, float width, float y, List<Item> out, Measurer m) {
        float innerW = Math.max(1f, width - n.padL - n.padR);
        if ("spacer".equals(n.t)) return y + n.h;
        y += n.padT;
        if ("text".equals(n.t)) {
            List<String> ls = wrap(n.s, innerW, n.size, n.bold, n.maxLines, m);
            Item it = new Item(); it.kind = K_TEXT; it.x = n.padL; it.y = y; it.w = innerW;
            it.lines = ls.toArray(new String[0]); it.size = n.size; it.bold = n.bold; it.color = n.color; it.alpha = n.alpha; it.align = n.align;
            it.lineH = n.size * n.lh; it.h = it.lineH * ls.size(); it.textX = n.padL; it.textY = y;
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("button".equals(n.t)) {
            Item it = new Item(); it.kind = K_BUTTON; it.x = n.padL; it.y = y; it.w = innerW; it.h = n.h;
            it.label = n.s; it.size = n.size; it.act = n.act; it.lines = new String[] { ellipsize(n.s, innerW - 16f, n.size, false, m) };
            out.add(it);
            return y + n.h + n.padB;
        }
        if ("grid".equals(n.t)) {
            int cols = n.cols;
            float cw = (innerW - n.gap * (cols - 1)) / cols;
            int i = 0;
            while (i < n.items.size()) {
                int cnt = Math.min(cols, n.items.size() - i);
                float rowH = 0f;
                int firstIdx = out.size();
                for (int k = 0; k < cnt; k++) {
                    Node c = n.items.get(i + k);
                    Item it = new Item(); it.kind = K_CARD; it.w = cw; it.x = n.padL + k * (cw + n.gap); it.y = y; it.act = c.act;
                    it.img = c.img; it.fb = c.fb; it.tag = c.tag;
                    float tagW = c.tag.length() > 0 ? m.width(c.tag, CARD_NAME_SIZE, true) : 0f;
                    it.tagW = tagW;
                    float nameW = Math.max(1f, cw - CARD_PAD * 2 - (tagW > 0f ? tagW + CARD_TAG_GAP : 0f) - 2f);   // -2: 테두리
                    List<String> nl = wrap(c.name, nameW, CARD_NAME_SIZE, true, 2, m);
                    it.lines = nl.toArray(new String[0]); it.size = CARD_NAME_SIZE; it.bold = true; it.lineH = CARD_NAME_SIZE * CARD_LH;
                    it.ix = it.x + 1f + CARD_PAD; it.iy = y + 1f + CARD_PAD; it.iw = cw - 2f - CARD_PAD * 2; it.ih = CARD_IMG_H;
                    it.textX = it.ix; it.textY = it.iy + CARD_IMG_H + CARD_IMG_GAP;
                    it.tagX = it.x + cw - 1f - CARD_PAD - tagW;
                    it.h = 1f + CARD_PAD + CARD_IMG_H + CARD_IMG_GAP + Math.max(it.lineH, it.lineH * nl.size()) + CARD_PAD + 1f;
                    rowH = Math.max(rowH, it.h);
                    out.add(it);
                }
                for (int k = firstIdx; k < out.size(); k++) out.get(k).h = rowH;          // 같은 줄 카드는 높이를 맞춘다(웹 격자와 같다)
                y += rowH; i += cnt;
                if (i < n.items.size()) y += n.gap;
            }
            return y + n.padB;
        }
        return y + n.padB;
    }

    // ═════════════ ④ 색 ═════════════
    /** "#rgb" "#rrggbb" "#aarrggbb" "rgb(r,g,b)" "rgba(r,g,b,a)" → ARGB. 못 읽으면 def. */
    public static int color(String s, int def) {
        if (s == null) return def;
        s = s.trim();
        try {
            if (s.startsWith("#")) {
                String h = s.substring(1);
                if (h.length() == 3) { int r = Integer.parseInt(h.substring(0, 1), 16), g = Integer.parseInt(h.substring(1, 2), 16), b = Integer.parseInt(h.substring(2, 3), 16); return 0xFF000000 | (r * 17) << 16 | (g * 17) << 8 | (b * 17); }
                if (h.length() == 6) return 0xFF000000 | (int) Long.parseLong(h, 16);
                if (h.length() == 8) return (int) Long.parseLong(h, 16);
                return def;
            }
            int p = s.indexOf('(');
            if (p > 0 && s.endsWith(")")) {
                String[] a = s.substring(p + 1, s.length() - 1).split("[,\\s/]+");
                int r = Math.round(Float.parseFloat(a[0])), g = Math.round(Float.parseFloat(a[1])), b = Math.round(Float.parseFloat(a[2]));
                int al = a.length > 3 && a[3].length() > 0 ? Math.round(Float.parseFloat(a[3]) * 255f) : 255;
                return (clamp(al) << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
            }
        } catch (RuntimeException e) { return def; }
        return def;
    }
    private static int clamp(int v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

    // ═════════════ ⑤ 스크롤 물리(손가락 따라가기·관성) ═════════════
    /** 스크롤 위치를 [0, max] 로. */
    public static float clamp(float v, float max) { return v < 0f ? 0f : (v > max ? max : v); }
    /** 가장자리를 넘어 끌 때의 저항(넘은 만큼의 절반이 보인다). */
    public static float rubber(float v, float max) {
        if (v < 0f) return v * 0.5f;
        if (v > max) return max + (v - max) * 0.5f;
        return v;
    }
}
