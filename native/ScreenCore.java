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
 *     box    { pad, ip, s, hl:[[시작,끝]…], size, lh, color, fill, line, r }       테두리·바탕이 있는 안내 상자(hl = 굵은 글자 구간). fill/line = 색 역할 이름 또는 CSS 색
 *     search { pad, max, hint, badge, accent, maxlen, act:{a:'search',tpl,empty} } 검색줄(알약). 입력은 기기의 진짜 입력칸(EditText)이 받는다
 *     panel  { pad, ip, fill, line, r, kids:[…] }                                        카드(배경·테두리) 안에 아래 노드들을 쌓는다(중첩은 한 단계)
 *     toggle { pad, title, sub, size, ssize, bold, on, key, onc, big, top, vp }          제목(+설명) 오른쪽에 스위치. 누르면 앱이 바로 뒤집고 {a:'set',key,on} 을 알린다
 *     navrow { pad, title, sub, size, act, top, vp }                                       오른쪽에 › 가 있는 줄(sub = 오른쪽 작은 상태 글자)
 *     select { pad, title, sub, on, act:{a:'sel',v}, fill, line, onl, tc, sc, prev:[색×5], chk, ckf }  미리보기 칸이 있는 고르기 카드(테마 등)
 *     field  { pad, key, hint, value, maxlen, h, fill, line, r, size }                    글자 입력칸(누르면 기기의 진짜 입력칸이 그 자리에 뜬다)
 *     bar    { pad, title, sub, btn, act }                                                   머리줄: 제목 + 금색 작은 글(예: '○○역 인근') + 오른쪽 알약 단추(btn 이 있으면 act 필수)
 *     place  { pad, rank, pub, name, sub, stars, badge, dist, go, act }                    장소 카드(맛집): 순위 동그라미 · 이름 · 업종/주소 · 별점/딱지/거리/길찾기 글. pub=true 면 순위 칸은 글자 없이 흐리게
 *     divider { pad }                                                                      가는 가로선
 *     act    { a:'cat', v } | { a:'open', url } | { a:'refresh' } | { a:'search', tpl('{q}' 포함 http(s)), empty(http(s)) }
 *            | { a:'set', key } | { a:'call', v:이름 } | { a:'web', v:이름 } | { a:'sel', v:값 }   (call/web/sel 은 웹이 허용 목록에 있는 것만 실행한다)
 *   screen.cover = 'tab'(탭 맨 위부터 덮음: 안내 상자·검색줄 포함) | 'chips'(기본, 칩 줄부터). 앱이 cap=2 를 보냈을 때만 엔진이 'tab' 을 준다.
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
        public String a = "", v = "", url = "", tpl = "", empty = "", key = "";
    }
    /** 색: 역할 이름(role)이거나 CSS 색을 읽은 ARGB. */
    public static final class Col {
        public final String role; public final int argb;
        Col(String role, int argb) { this.role = role; this.argb = argb; }
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
        public float ipL = 12f, ipT = 8f, ipR = 12f, ipB = 8f, r = 10f, max = 340f, vp = 9f, ssize = 11f;
        public int maxlen = 60;
        public boolean top, big;
        public String key = "", title = "", sub = "", value = "";
        public String fill = "", line = "", hint = "", accent = "#e63329", tc = "", sc = "", onc = "", onl = "", chk = "", ckf = "";
        public String[] prev = new String[0];
        public List<Node> kids = new ArrayList<Node>();
        public int[][] hl = new int[0][];
        public Act act;
        public List<Node> items = new ArrayList<Node>();
    }
    public static final class Screen {
        public String id = "", rev = "", cover = "chips";
        public List<Node> head = new ArrayList<Node>(), body = new ArrayList<Node>();
        public int skipped = 0, nodes = 0;
    }

    private static final String[] ROLES = { "bg", "card", "border", "text", "sub", "gold", "orange", "imgbg", "white", "border2", "none" };
    private static boolean role(String s) { for (String r : ROLES) if (r.equals(s)) return true; return false; }
    private static boolean httpUrl(String u) {
        if (u == null || u.length() == 0 || u.length() > 1500) return false;
        String l = u.length() > 8 ? u.substring(0, 8).toLowerCase() : u.toLowerCase();
        return l.startsWith("http://") || l.startsWith("https://");
    }

    /** 행동 이름·키로 쓰는 짧은 식별자: 영문·숫자·_ . : - 만 1~40자. */
    static boolean ident(String s) {
        if (s == null || s.length() == 0 || s.length() > 40) return false;
        for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '.' || c == ':' || c == '-')) return false; }
        return true;
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
        else if ("set".equals(a.a)) { a.key = optStr(m, "key", "", 40); if (!ident(a.key)) throw new ParseError("act set: key 가 올바르지 않다"); }
        else if ("call".equals(a.a) || "web".equals(a.a) || "sel".equals(a.a)) { a.v = optStr(m, "v", "", 40); if (!ident(a.v)) throw new ParseError("act " + a.a + ": v 가 올바르지 않다"); }
        else if ("search".equals(a.a)) {
            a.tpl = optStr(m, "tpl", "", 1500); a.empty = optStr(m, "empty", "", 1500);
            if (!httpUrl(a.tpl) || a.tpl.indexOf("{q}") < 0) throw new ParseError("act search: tpl 은 {q} 가 든 http(s) 주소여야 한다");
            if (!httpUrl(a.empty)) throw new ParseError("act search: empty 가 http(s) 가 아니다");
        }
        else throw new ParseError("모르는 행동 " + a.a);
        return a;
    }

    private static final int BAD_COLOR = 0x01234567;
    /** 색 역할 이름이거나 CSS 색(#rgb·#rrggbb·rgb()·rgba())이어야 한다. */
    private static String roleOrCss(Map<String, Object> m, String k, String def) throws ParseError {
        String v = optStr(m, k, def, 60);
        if (v.length() == 0 || role(v)) return v;
        if (color(v, BAD_COLOR) == BAD_COLOR) throw new ParseError(k + ": 읽을 수 없는 색 " + v);
        return v;
    }
    private static int[][] hl(Map<String, Object> m, int len) throws ParseError {
        Object v = m.get("hl");
        if (v == null) return new int[0][];
        List<Object> l = asArr(v, "hl");
        if (l.size() > 20) throw new ParseError("hl: 너무 많다");
        int[][] r = new int[l.size()][];
        int prevEnd = 0;
        for (int i = 0; i < r.length; i++) {
            List<Object> p = asArr(l.get(i), "hl 구간");
            if (p.size() != 2 || !(p.get(0) instanceof Double) || !(p.get(1) instanceof Double)) throw new ParseError("hl: [시작,끝] 이어야 한다");
            int a = ((Double) p.get(0)).intValue(), b = ((Double) p.get(1)).intValue();
            if (a < prevEnd || b <= a || b > len) throw new ParseError("hl: 범위 밖 " + a + "-" + b);
            r[i] = new int[] { a, b }; prevEnd = b;
        }
        return r;
    }
    private static void ip(Map<String, Object> m, Node n) throws ParseError {
        Object v = m.get("ip");
        if (v == null) return;
        List<Object> l = asArr(v, "ip");
        if (l.size() != 4) throw new ParseError("ip: 네 개여야 한다");
        float[] f = new float[4];
        for (int i = 0; i < 4; i++) {
            if (!(l.get(i) instanceof Double)) throw new ParseError("ip: 수가 아니다");
            f[i] = ((Double) l.get(i)).floatValue();
            if (f[i] < 0f || f[i] > 80f) throw new ParseError("ip: 범위 밖");
        }
        n.ipL = f[0]; n.ipT = f[1]; n.ipR = f[2]; n.ipB = f[3];
    }

    private static Node node(Object o, Screen sc) throws ParseError {
        Map<String, Object> m = asObj(o, "노드");
        String t = optStr(m, "t", "", 20);
        Node n = new Node();
        n.t = t;
        if (++sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
        if ("chips".equals(t)) {
            pad(m, n); n.gap = optNum(m, "gap", 6f, 0f, 60f); n.h = optNum(m, "h", 30f, 16f, 80f);
            n.onc = roleOrCss(m, "onc", "orange"); if (n.onc.length() == 0) n.onc = "orange";                   // 켜진 칩 바탕(쇼핑 주황 · 맛집 금색)
            n.tc = roleOrCss(m, "onfg", "white"); if (n.tc.length() == 0) n.tc = "white";                       // 켜진 칩 글자색
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
            n.hl = hl(m, n.s.length());
        } else if ("button".equals(t)) {
            pad(m, n); n.s = optStr(m, "s", "", 80); if (n.s.length() == 0) throw new ParseError("button: s 없음");
            n.size = optNum(m, "size", 12f, 6f, 40f); n.h = optNum(m, "h", 40f, 20f, 120f); n.act = act(m.get("act"), true);
            n.fill = roleOrCss(m, "fill", ""); n.line = roleOrCss(m, "line", ""); n.tc = roleOrCss(m, "tc", ""); n.bold = optBool(m, "bold", false);
            n.r = optNum(m, "r", 12f, 0f, 40f);
        } else if ("panel".equals(t)) {
            pad(m, n); n.ipL = n.ipR = 16f; n.ipT = n.ipB = 16f; ip(m, n);
            n.fill = roleOrCss(m, "fill", "card"); n.line = roleOrCss(m, "line", "border"); n.r = optNum(m, "r", 14f, 0f, 40f);
            for (Object ko : asArr(m.get("kids"), "panel.kids")) {
                Map<String, Object> km = asObj(ko, "panel 안 노드");
                String kt = optStr(km, "t", "", 20);
                if ("panel".equals(kt) || "grid".equals(kt) || "chips".equals(kt) || "search".equals(kt)) throw new ParseError("panel 안에 " + kt + " 를 둘 수 없다");
                Node kn = node(ko, sc);
                if (kn != null) n.kids.add(kn);
            }
        } else if ("toggle".equals(t)) {
            pad(m, n);
            n.title = optStr(m, "title", "", 120); if (n.title.length() == 0) throw new ParseError("toggle: title 없음");
            n.sub = optStr(m, "sub", "", 300); n.size = optNum(m, "size", 13.5f, 8f, 30f); n.ssize = optNum(m, "ssize", 11f, 7f, 20f);
            n.bold = optBool(m, "bold", true); n.on = optBool(m, "on", false); n.big = optBool(m, "big", false); n.top = optBool(m, "top", false);
            n.vp = optNum(m, "vp", 9f, 0f, 40f);
            n.key = optStr(m, "key", "", 40); if (!ident(n.key)) throw new ParseError("toggle: key 가 올바르지 않다");
            n.onc = roleOrCss(m, "onc", "#30d158"); n.tc = roleOrCss(m, "tc", "text"); n.sc = roleOrCss(m, "sc", "sub");
            n.act = new Act(); n.act.a = "set"; n.act.key = n.key;
        } else if ("navrow".equals(t)) {
            pad(m, n);
            n.title = optStr(m, "title", "", 120); if (n.title.length() == 0) throw new ParseError("navrow: title 없음");
            n.sub = optStr(m, "sub", "", 60); n.size = optNum(m, "size", 13f, 8f, 30f); n.top = optBool(m, "top", false); n.vp = optNum(m, "vp", 11f, 0f, 40f);
            n.tc = roleOrCss(m, "tc", "text"); n.sc = roleOrCss(m, "sc", "sub"); n.act = act(m.get("act"), true);
        } else if ("select".equals(t)) {
            pad(m, n);
            n.title = optStr(m, "title", "", 80); if (n.title.length() == 0) throw new ParseError("select: title 없음");
            n.sub = optStr(m, "sub", "", 120); n.on = optBool(m, "on", false);
            n.act = act(m.get("act"), true); if (!"sel".equals(n.act.a)) throw new ParseError("select: act 는 sel 이어야 한다");
            n.fill = roleOrCss(m, "fill", "card"); n.line = roleOrCss(m, "line", "border"); n.onl = roleOrCss(m, "onl", "gold");
            n.tc = roleOrCss(m, "tc", "text"); n.sc = roleOrCss(m, "sc", "sub"); n.chk = roleOrCss(m, "chk", "gold"); n.ckf = roleOrCss(m, "ckf", "#121214");
            List<Object> pv = m.get("prev") == null ? new ArrayList<Object>() : asArr(m.get("prev"), "prev");
            if (pv.size() != 0 && pv.size() != 5) throw new ParseError("prev: 다섯 개여야 한다");
            n.prev = new String[pv.size()];
            for (int i = 0; i < pv.size(); i++) { if (!(pv.get(i) instanceof String)) throw new ParseError("prev: 글자가 아니다"); n.prev[i] = (String) pv.get(i); if (color(n.prev[i], BAD_COLOR) == BAD_COLOR) throw new ParseError("prev: 읽을 수 없는 색"); }
        } else if ("field".equals(t)) {
            pad(m, n);
            n.key = optStr(m, "key", "", 40); if (!ident(n.key)) throw new ParseError("field: key 가 올바르지 않다");
            n.hint = optStr(m, "hint", "", 60); n.value = optStr(m, "value", "", 120); n.maxlen = (int) optNum(m, "maxlen", 60f, 1f, 200f);
            n.h = optNum(m, "h", 44f, 28f, 120f); n.size = optNum(m, "size", 14f, 8f, 30f); n.r = optNum(m, "r", 9f, 0f, 30f);
            n.fill = roleOrCss(m, "fill", "bg"); n.line = roleOrCss(m, "line", "border2"); n.tc = roleOrCss(m, "tc", "text"); n.sc = roleOrCss(m, "sc", "sub");
        } else if ("box".equals(t)) {
            pad(m, n); ip(m, n);
            n.s = optStr(m, "s", "", MAX_STR); if (n.s.length() == 0) throw new ParseError("box: s 없음");
            n.hl = hl(m, n.s.length());
            n.size = optNum(m, "size", 12f, 6f, 40f); n.lh = optNum(m, "lh", 1.35f, 1f, 3f);
            n.color = optStr(m, "color", "text", 12); if (!role(n.color)) throw new ParseError("color: 모르는 색 " + n.color);
            n.fill = roleOrCss(m, "fill", ""); n.line = roleOrCss(m, "line", ""); n.tc = roleOrCss(m, "tc", "");
            n.r = optNum(m, "r", 10f, 0f, 40f);
        } else if ("search".equals(t)) {
            pad(m, n);
            n.max = optNum(m, "max", 340f, 160f, 800f);
            n.hint = optStr(m, "hint", "", 40); n.badge = optStr(m, "badge", "", 2);
            n.accent = roleOrCss(m, "accent", "#e63329"); if (n.accent.length() == 0) n.accent = "#e63329";
            n.maxlen = (int) optNum(m, "maxlen", 60f, 1f, 120f);
            n.act = act(m.get("act"), true);
            if (!"search".equals(n.act.a)) throw new ParseError("search: act 는 search 여야 한다");
        } else if ("bar".equals(t)) {
            pad(m, n);
            n.title = optStr(m, "title", "", 60); if (n.title.length() == 0) throw new ParseError("bar: title 없음");
            n.sub = optStr(m, "sub", "", 80); n.label = optStr(m, "btn", "", 16);
            if (n.label.length() > 0) n.act = act(m.get("act"), true); else n.act = act(m.get("act"), false);
        } else if ("place".equals(t)) {
            pad(m, n);
            n.s = optStr(m, "rank", "", 6); n.on = optBool(m, "pub", false);
            n.name = optStr(m, "name", "", 120); if (n.name.length() == 0) throw new ParseError("place: name 없음");
            n.sub = optStr(m, "sub", "", 200); n.tag = optStr(m, "stars", "", 10); n.badge = optStr(m, "badge", "", 20);
            n.label = optStr(m, "dist", "", 12); n.title = optStr(m, "go", "", 30);
            n.act = act(m.get("act"), true);
        } else if ("divider".equals(t)) {
            pad(m, n);
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
        sc.cover = optStr(m, "cover", "chips", 8); if (!"tab".equals(sc.cover) && !"chips".equals(sc.cover)) throw new ParseError("cover: 모르는 값 " + sc.cover);
        for (Object o : asArr(m.get("head"), "head")) { Node n = node(o, sc); if (n != null) sc.head.add(n); }
        for (Object o : asArr(m.get("body"), "body")) { Node n = node(o, sc); if (n != null) sc.body.add(n); }
        if (sc.head.isEmpty() && sc.body.isEmpty()) throw new ParseError("그릴 것이 없다");
        return sc;
    }

    public static Screen load(String json) throws ParseError { return validate(parse(json)); }

    // ═════════════ ③ 배치 ═════════════
    public static final int K_CHIP = 1, K_CARD = 2, K_TEXT = 3, K_BUTTON = 4, K_BOX = 5, K_SEARCH = 6, K_PANEL = 7, K_TOGGLE = 8, K_NAV = 9, K_SELECT = 10, K_FIELD = 11, K_BAR = 12, K_PLACE = 13, K_DIV = 14;
    /** 맛집 머리줄·장소 카드 치수(웹 .food-* 와 같다) */
    public static final float BAR_TITLE = 18f, BAR_SUB = 13f, BAR_BTN = 12f, BAR_LH = 1.4f, PLACE_PAD = 14f, PLACE_RANK = 24f, PLACE_GAP = 12f, PLACE_NAME = 15f, PLACE_SUB = 12f, PLACE_META = 11f, PLACE_STAR = 13f, PLACE_PILL_H = 20f;
    /** 검색줄 치수(웹 쿠팡 검색줄과 같다): 알약 높이 · 왼쪽 배지 · 오른쪽 단추 · 안쪽 여백 */
    public static final float SEARCH_H = 44f, SEARCH_BADGE = 20f, SEARCH_BTN = 30f, SEARCH_PADL = 14f, SEARCH_PADR = 8f, SEARCH_GAP = 8f;
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
        public boolean fixed;                        // 머리에서 가로로 안 밀리는 조각(안내 상자·검색줄)
        public String[][] segs;                      // hl 이 있으면 줄마다 [조각…] (null 이면 줄 전체 한 가지 굵기)
        public boolean[][] segBold;
        public Col fill, line, tc, sc, ac, ac2, tcCk;      // 칸마다 쓰는 색(null 이면 안 그린다/기본)
        public String[] lines2 = new String[0];      // 스위치 줄·고르기 카드의 설명 줄
        public float size2, lineH2;
        public float sx, sy, sw, sh;                 // 스위치 자리(왼쪽위·크기) / 고르기 카드의 미리보기 칸
        public boolean top;                          // 줄 위에 가는 선
        public Col[] prevC = new Col[0];
        public String key = "", value = "";
        public float radius = 10f;
        public float bx, by, btx, bty;               // 검색줄: 배지 · 단추 왼쪽위 (영역 좌표)
        public int maxlen = 60;
        public String label = "", badge = "", tag = "", img = "", fb = "";
        public float labelW, badgeW, tagX, tagW;    // 칩: 라벨·뱃지 폭 · 카드: 최저가 글자 자리
        public float ix, iy, iw, ih;                // 카드 그림 자리
        public String go = "", dist = "", stars = "", rank = "";           // 장소 카드: 길찾기 글 · 거리 · 별점 · 순위
        public boolean pub;
        public float starX, badgeX, badgePw, distX, distPw, goX, metaY, metaH, subY, subLH2;   // 장소 카드 한 줄(별점·딱지·거리·길찾기) 자리 / 머리줄 작은 글 자리
        public Act act;
    }

    /** 배치 결과. */
    public static final class Layout {
        public Item[] head = new Item[0], body = new Item[0];
        public float headH, headContentW, bodyH, width, chipsTop = -1f, chipsBot = -1f;
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
        /** 머리에서 눌린 행동. 칩은 가로로 밀린 만큼(scrollX) 보정, 고정 조각(안내·검색줄)은 그대로. */
        public Act hitHead(float x, float y) { return hitHead(x, y, 0f); }
        public Act hitHead(float x, float y, float scrollX) {
            for (Item m : head) {
                float px = m.fixed ? x : x + scrollX;
                if (m.act != null && hits(m, px, y)) return m.act;
            }
            return null;
        }
        /** 이 조각이 (x, y) 에서 눌리나. 스위치 줄은 스위치(+8dp)만, 나머지는 조각 전체. */
        public static boolean hits(Item m, float x, float y) {
            if (m.kind == K_TOGGLE) return x >= m.sx - 8f && x < m.sx + m.sw + 8f && y >= m.sy - 8f && y < m.sy + m.sh + 8f;
            if (m.kind == K_BAR) return x >= m.sx - 6f && x < m.sx + m.sw + 6f && y >= m.sy - 6f && y < m.sy + m.sh + 6f;      // 머리줄은 오른쪽 단추만
            return x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h;
        }
        private static Act hit(Item[] it, float[] maxB, float x, float y) {
            if (maxB != null) {
                int[] r = range(it, maxB, y, y + 0.01f);
                for (int i = r[0]; i < r[1]; i++) { Item m = it[i]; if (m.act != null && hits(m, x, y)) return m.act; }
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
                    it.size = 12f; it.bold = true; it.ac = col(n.onc, new Col("orange", 0)); it.tc = col(n.tc, new Col("white", 0));
                    it.labelW = m.width(c.label, 12f, true);
                    it.badgeW = c.badge.length() > 0 ? m.width(c.badge, 12f, true) : 0f;
                    it.w = CHIP_PADX * 2 + it.labelW + (c.badge.length() > 0 ? 6f + it.badgeW : 0f);
                    it.h = n.h; it.x = x; it.y = y;
                    hi.add(it); x += it.w + n.gap;
                }
                contentW = Math.max(contentW, x - n.gap + n.padR);
                L.chipsTop = y - n.padT; L.chipsBot = y + n.h + n.padB;
                y += n.h + n.padB;
            } else {
                int from = hi.size();
                y = stack(n, 0f, width, y, hi, m);
                for (int q = from; q < hi.size(); q++) hi.get(q).fixed = true;
            }
        }
        L.head = hi.toArray(new Item[0]); L.headH = y; L.headContentW = contentW;
        // 본문
        List<Item> bi = new ArrayList<Item>();
        y = 0f;
        for (Node n : sc.body) y = stack(n, 0f, width, y, bi, m);
        L.body = bi.toArray(new Item[0]); L.bodyH = y;
        L.headMaxB = maxB(L.head); L.bodyMaxB = maxB(L.body);
        return L;
    }
    private static float[] maxB(Item[] it) {
        float[] r = new float[it.length]; float mx = -1e9f;
        for (int i = 0; i < it.length; i++) { mx = Math.max(mx, it[i].y + it[i].h); r[i] = mx; }
        return r;
    }

    /** 색 이름/CSS → Col. 비었으면 null(그리지 않는다). 못 읽는 CSS 는 def. */
    static Col col(String s, Col def) {
        if (s == null || s.length() == 0) return def;
        if (role(s)) return new Col(s, 0);
        return new Col(null, color(s, 0xFFFF00FF));
    }

    /** 줄마다 굵은 구간/아닌 구간 조각으로 나눈다(그릴 때 새 글자를 안 만들도록 미리). 줄은 원문 안에서 차례로 찾는다. 못 찾는 줄(… 으로 줄인 줄)은 굵기 없이. */
    private static void richSegs(Item it, String s, int[][] hl) {
        int nl = it.lines.length;
        it.segs = new String[nl][]; it.segBold = new boolean[nl][];
        int cur = 0;
        for (int k = 0; k < nl; k++) {
            String ln = it.lines[k];
            int st = ln.length() == 0 ? cur : s.indexOf(ln, cur);
            if (st < 0) { it.segs[k] = new String[] { ln }; it.segBold[k] = new boolean[] { false }; continue; }
            int en = st + ln.length();
            cur = en;
            List<String> ps = new ArrayList<String>(); List<Boolean> bs = new ArrayList<Boolean>();
            int pos = st;
            for (int[] h : hl) {
                int a = Math.max(st, h[0]), b = Math.min(en, h[1]);
                if (b <= a) continue;
                if (a > pos) { ps.add(s.substring(pos, a)); bs.add(Boolean.FALSE); }
                ps.add(s.substring(a, b)); bs.add(Boolean.TRUE); pos = b;
            }
            if (pos < en) { ps.add(s.substring(pos, en)); bs.add(Boolean.FALSE); }
            if (ps.isEmpty()) { ps.add(ln); bs.add(Boolean.FALSE); }
            it.segs[k] = ps.toArray(new String[0]);
            it.segBold[k] = new boolean[bs.size()];
            for (int q = 0; q < bs.size(); q++) it.segBold[k][q] = bs.get(q);
        }
    }

    /** 노드 하나를 y 에서부터 쌓고 다음 y 를 돌려준다. x0 = 이 노드를 담는 칸의 왼쪽(패널 안이면 패널 안쪽), width = 그 칸의 폭. */
    private static float stack(Node n, float x0, float width, float y, List<Item> out, Measurer m) {
        float innerW = Math.max(1f, width - n.padL - n.padR);
        float ox = x0 + n.padL;
        if ("spacer".equals(n.t)) return y + n.h;
        y += n.padT;
        if ("text".equals(n.t)) {
            boolean rich = n.hl.length > 0;
            List<String> ls = wrap(n.s, innerW, n.size, n.bold || rich, n.maxLines, m);        // 굵은 구간이 있으면 줄바꿈은 굵은 폭으로 잰다(넘치지 않게)
            Item it = new Item(); it.kind = K_TEXT; it.x = ox; it.y = y; it.w = innerW;
            it.lines = ls.toArray(new String[0]); it.size = n.size; it.bold = n.bold; it.color = n.color; it.alpha = n.alpha; it.align = n.align;
            it.lineH = n.size * n.lh; it.h = it.lineH * ls.size(); it.textX = ox; it.textY = y;
            if (rich) richSegs(it, n.s, n.hl);
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("box".equals(n.t)) {
            float innerBoxW = Math.max(1f, innerW - 2f - n.ipL - n.ipR);
            boolean rich = n.hl.length > 0;
            List<String> ls = wrap(n.s, innerBoxW, n.size, rich, 0, m);
            Item it = new Item(); it.kind = K_BOX; it.x = ox; it.y = y; it.w = innerW;
            it.lines = ls.toArray(new String[0]); it.size = n.size; it.bold = false; it.color = n.color; it.lineH = n.size * n.lh;
            it.h = 2f + n.ipT + it.lineH * ls.size() + n.ipB;
            it.textX = ox + 1f + n.ipL; it.textY = y + 1f + n.ipT; it.radius = n.r;
            it.fill = col(n.fill, null); it.line = col(n.line, null); it.tc = col(n.tc, null);
            if (rich) richSegs(it, n.s, n.hl);
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("search".equals(n.t)) {
            Item it = new Item(); it.kind = K_SEARCH;
            it.w = Math.min(n.max, innerW); it.x = ox + (innerW - it.w) / 2f; it.y = y; it.h = SEARCH_H;
            it.label = n.hint; it.badge = n.badge; it.act = n.act; it.maxlen = n.maxlen; it.radius = SEARCH_H / 2f;
            it.bx = it.x + 1f + SEARCH_PADL; it.by = y + (SEARCH_H - SEARCH_BADGE) / 2f;
            it.btx = it.x + it.w - 1f - SEARCH_PADR - SEARCH_BTN; it.bty = y + (SEARCH_H - SEARCH_BTN) / 2f;
            it.ix = it.bx + SEARCH_BADGE + SEARCH_GAP; it.iw = Math.max(20f, it.btx - SEARCH_GAP - it.ix);
            it.ih = SEARCH_BTN; it.iy = it.bty;
            it.ac = col(n.accent, new Col(null, 0xFFE63329));
            out.add(it);
            return y + SEARCH_H + n.padB;
        }
        if ("button".equals(n.t)) {
            Item it = new Item(); it.kind = K_BUTTON; it.x = ox; it.y = y; it.w = innerW; it.h = n.h;
            it.label = n.s; it.size = n.size; it.act = n.act; it.bold = n.bold; it.radius = n.r;
            it.lines = new String[] { ellipsize(n.s, innerW - 16f, n.size, n.bold, m) };
            it.fill = col(n.fill, new Col("card", 0)); it.line = col(n.line, new Col("border", 0)); it.tc = col(n.tc, new Col("sub", 0));
            out.add(it);
            return y + n.h + n.padB;
        }
        if ("panel".equals(n.t)) {
            Item pn = new Item(); pn.kind = K_PANEL; pn.x = ox; pn.y = y; pn.w = innerW; pn.radius = n.r;
            pn.fill = col(n.fill, null); pn.line = col(n.line, null);
            out.add(pn);
            float cy = y + 1f + n.ipT, cx = ox + 1f + n.ipL, cw = Math.max(1f, innerW - 2f - n.ipL - n.ipR);
            for (Node k : n.kids) cy = stack(k, cx, cw, cy, out, m);
            pn.h = (cy + n.ipB + 1f) - y;
            return y + pn.h + n.padB;
        }
        if ("toggle".equals(n.t)) {
            float sw = n.big ? 46f : 44f, sh = n.big ? 26f : 25f;
            float textW = Math.max(40f, innerW - sw - 12f);
            List<String> tl = wrap(n.title, textW, n.size, n.bold, 0, m);
            List<String> sl = n.sub.length() > 0 ? wrap(n.sub, textW, n.ssize, false, 0, m) : new ArrayList<String>();
            float tlh = n.size * 1.3f, slh = n.ssize * 1.4f;
            float textH = tl.size() * tlh + (sl.isEmpty() ? 0f : 2f + sl.size() * slh);
            float rowH = Math.max(textH, sh), top = n.top ? 1f : 0f;
            Item it = new Item(); it.kind = K_TOGGLE; it.x = ox; it.y = y; it.w = innerW; it.h = top + n.vp + rowH + n.vp; it.top = n.top;
            it.lines = tl.toArray(new String[0]); it.lines2 = sl.toArray(new String[0]);
            it.size = n.size; it.size2 = n.ssize; it.bold = n.bold; it.lineH = tlh; it.lineH2 = slh;
            it.textX = ox; it.textY = y + top + n.vp + (rowH - textH) / 2f;
            it.sw = sw; it.sh = sh; it.sx = ox + innerW - sw; it.sy = y + top + n.vp + (rowH - sh) / 2f;
            it.on = n.on; it.key = n.key; it.act = n.act;
            it.ac = col(n.onc, new Col(null, 0xFF30D158)); it.tc = col(n.tc, new Col("text", 0)); it.sc = col(n.sc, new Col("sub", 0));
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("navrow".equals(n.t)) {
            float top = n.top ? 1f : 0f, chev = 14f;
            float subW = n.sub.length() > 0 ? m.width(n.sub, 11f, false) : 0f;
            float titleW = Math.max(20f, innerW - chev - (subW > 0f ? subW + 10f : 0f));
            Item it = new Item(); it.kind = K_NAV; it.x = ox; it.y = y; it.w = innerW; it.top = n.top; it.act = n.act;
            it.lines = new String[] { ellipsize(n.title, titleW, n.size, false, m) };
            it.size = n.size; it.size2 = 11f; it.lineH = n.size * 1.3f; it.label = n.sub; it.labelW = subW;
            it.h = top + n.vp + it.lineH + n.vp; it.textX = ox; it.textY = y + top + n.vp;
            it.sx = ox + innerW - chev;                    // › 자리
            it.tc = col(n.tc, new Col("text", 0)); it.sc = col(n.sc, new Col("sub", 0));
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("select".equals(n.t)) {
            float pd = 14f, pv = 52f, ck = 22f, gp = 14f;
            float textW = Math.max(40f, innerW - 4f - pd * 2f - pv - gp - ck - gp);
            List<String> tl = wrap(n.title, textW, 14f, true, 0, m);
            List<String> sl = n.sub.length() > 0 ? wrap(n.sub, textW, 11f, false, 0, m) : new ArrayList<String>();
            float tlh = 14f * 1.3f, slh = 11f * 1.4f, textH = tl.size() * tlh + (sl.isEmpty() ? 0f : 2f + sl.size() * slh);
            Item it = new Item(); it.kind = K_SELECT; it.x = ox; it.y = y; it.w = innerW; it.h = 4f + pd * 2f + Math.max(pv, Math.max(textH, ck)); it.act = n.act; it.on = n.on;
            it.radius = 12f; it.size = 14f; it.size2 = 11f; it.lineH = tlh; it.lineH2 = slh; it.bold = true;
            it.lines = tl.toArray(new String[0]); it.lines2 = sl.toArray(new String[0]);
            it.sx = ox + 2f + pd; it.sy = y + (it.h - pv) / 2f; it.sw = pv; it.sh = pv;
            it.textX = it.sx + pv + gp; it.textY = y + (it.h - textH) / 2f;
            it.bx = ox + innerW - 2f - pd - ck; it.by = y + (it.h - ck) / 2f;     // 체크 원
            it.fill = col(n.fill, new Col("card", 0)); it.line = col(n.line, new Col("border", 0)); it.ac = col(n.onl, new Col("gold", 0));
            it.tc = col(n.tc, new Col("text", 0)); it.sc = col(n.sc, new Col("sub", 0)); it.ac2 = col(n.chk, new Col("gold", 0));
            it.tcCk = col(n.ckf, new Col(null, 0xFF121214));
            it.prevC = new Col[n.prev.length]; for (int i = 0; i < n.prev.length; i++) it.prevC[i] = col(n.prev[i], null);
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("field".equals(n.t)) {
            Item it = new Item(); it.kind = K_FIELD; it.x = ox; it.y = y; it.w = innerW; it.h = n.h; it.radius = n.r;
            it.key = n.key; it.label = n.hint; it.value = n.value; it.maxlen = n.maxlen; it.size = n.size;
            it.fill = col(n.fill, null); it.line = col(n.line, null); it.tc = col(n.tc, new Col("text", 0)); it.sc = col(n.sc, new Col("sub", 0));
            it.textX = ox + 13f;
            out.add(it);
            return y + n.h + n.padB;
        }
        if ("divider".equals(n.t)) {
            Item it = new Item(); it.kind = K_DIV; it.x = ox; it.y = y; it.w = innerW; it.h = 1f;
            out.add(it);
            return y + 1f + n.padB;
        }
        if ("bar".equals(n.t)) {
            float btnW = 0f, btnH = 0f;
            if (n.label.length() > 0) { btnW = m.width(n.label, BAR_BTN, false) + 28f + 2f; btnH = BAR_BTN * BAR_LH + 12f + 2f; }
            float region = Math.max(40f, innerW - (btnW > 0f ? btnW + 8f : 0f));
            float tlh = BAR_TITLE * BAR_LH, slh = BAR_SUB * BAR_LH;
            String title = ellipsize(n.title, region, BAR_TITLE, true, m);
            float tw = m.width(title, BAR_TITLE, true);
            String sub = n.sub.length() > 0 ? ellipsize(n.sub, region, BAR_SUB, true, m) : "";
            float sw = sub.length() > 0 ? m.width(sub, BAR_SUB, true) : 0f;
            boolean same = sub.length() == 0 || tw + 8f + sw <= region;
            float blockH = tlh + (sub.length() > 0 && !same ? slh : 0f);
            float h = Math.max(blockH, btnH);
            Item it = new Item(); it.kind = K_BAR; it.x = ox; it.y = y; it.w = innerW; it.h = h; it.act = n.act;
            it.lines = new String[] { title }; it.size = BAR_TITLE; it.bold = true; it.lineH = tlh;
            it.textX = ox; it.textY = y + (h - blockH) / 2f;
            it.label = sub; it.size2 = BAR_SUB; it.lineH2 = slh; it.top = same;
            it.tagX = same ? ox + tw + 8f : ox; it.tagW = sw; it.subY = same ? it.textY : it.textY + tlh;
            it.badge = n.label; it.sw = btnW; it.sh = btnH; it.sx = ox + innerW - btnW; it.sy = y + (h - btnH) / 2f;
            it.ac = col("gold", null); it.tc = col("text", null); it.sc = col("sub", null);
            out.add(it);
            return y + h + n.padB;
        }
        if ("place".equals(n.t)) {
            float infoX = ox + 1f + PLACE_PAD + PLACE_RANK + PLACE_GAP, infoW = Math.max(40f, innerW - 2f - PLACE_PAD * 2f - PLACE_RANK - PLACE_GAP);
            float nlh = PLACE_NAME * BAR_LH, slh = PLACE_SUB * BAR_LH;
            List<String> sl = n.sub.length() > 0 ? wrap(n.sub, infoW, PLACE_SUB, false, 2, m) : new ArrayList<String>();
            Item it = new Item(); it.kind = K_PLACE; it.x = ox; it.y = y; it.w = innerW; it.act = n.act; it.radius = 16f;
            it.rank = n.s; it.pub = n.on;
            it.bx = ox + 1f + PLACE_PAD; it.by = y + 1f + PLACE_PAD;
            it.lines = new String[] { ellipsize(n.name, infoW, PLACE_NAME, true, m) }; it.size = PLACE_NAME; it.bold = true; it.lineH = nlh;
            it.textX = infoX; it.textY = y + 1f + PLACE_PAD;
            it.lines2 = sl.toArray(new String[0]); it.size2 = PLACE_SUB; it.lineH2 = slh;
            it.subY = it.textY + nlh + 3f;
            it.metaY = it.subY + slh * sl.size() + (sl.isEmpty() ? 0f : 5f); it.metaH = PLACE_PILL_H;
            // 한 줄: 별점 | 딱지 | 거리 | 길찾기 (웹 .food-meta 와 같은 간격 8)
            float cx = infoX, right = infoX + infoW;
            it.stars = n.tag; it.badge = n.badge; it.dist = n.label;
            if (n.tag.length() > 0) { it.starX = cx; cx += m.width(n.tag, PLACE_STAR, true) + 8f; }
            if (n.badge.length() > 0) { it.badgeX = cx; it.badgePw = m.width(n.badge, PLACE_META, false) + 16f; cx += it.badgePw + 8f; }
            if (n.label.length() > 0) { it.distX = cx; it.distPw = m.width(n.label, PLACE_META, false) + 16f; cx += it.distPw + 8f; }
            if (n.title.length() > 0 && right - cx >= 24f) { it.goX = cx; it.go = ellipsize(n.title, right - cx, PLACE_META, true, m); }
            it.h = 1f + PLACE_PAD + nlh + 3f + slh * sl.size() + (sl.isEmpty() ? 0f : 5f) + PLACE_PILL_H + PLACE_PAD + 1f;
            it.fill = col("card", null); it.line = col("border", null);
            out.add(it);
            return y + it.h + n.padB;
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
                    Item it = new Item(); it.kind = K_CARD; it.w = cw; it.x = ox + k * (cw + n.gap); it.y = y; it.act = c.act;
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
