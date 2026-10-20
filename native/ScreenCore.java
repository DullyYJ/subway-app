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
 *     news   { pad, title, sub, act }                                                      뉴스 줄(커뮤니티): 왼쪽 금색 막대 · 줄바꿈 제목(최대 4줄) · 작은 글(분류 · N분 전) · 오른쪽 ›. 아래에 가는 선
 *     post   { pad, id, title, cat, catc, nick, meta, open, kids:[…] }                     게시글 카드(아코디언): 머리(분류 딱지·제목·글쓴이·메타)를 누르면 앱이 바로 펼치고 접는다(한 번에 한 글). 펼치면 kids 를 쌓는다
 *     cmt    { pad, nick, nc, s, time, ind }                                                 댓글 한 줄: 글쓴이·시각 + 아래 줄바꿈 글(ind = 답글 들여쓰기)
 *     btnrow { pad, gap, h, items:[{label, on, right, fill, line, tc, act}] }               작은 단추 줄(반응 단추·삭제/신고). right 인 것은 오른쪽 끝에 붙는다
 *     inbar  { pad, key, hint, value, maxlen, h, r, btn, act, fill, line, tc, sc, onc, ckf } 글자 입력칸 + 오른쪽 단추 한 줄(댓글 달기·채팅 보내기). 단추를 누르면 입력된 글과 함께 act 를 알린다
 *     inbar 확장: dot(왼쪽 동그라미 색) · bold · bh(단추 높이) · bsize(단추 글자) · watch(글자가 바뀔 때마다 알림) · dim(단추 흐리게·눌려도 무시) · eact(키보드 확인 키 행동) — 홈 탭 출발/도착 입력
 *     swap   { size, fill, line, tc, icon(SVG path d), act }                                 두 줄 경계 한가운데 얹히는 동그란 단추(출발↔도착 바꾸기). 높이를 차지하지 않는다
 *     rhd    { pad, num, unit, s, btn, act, xact }                                     경로 결과 머리줄: 큰 분 숫자(num) · 단위(unit) · 구간명(s) · 오른쪽 즐겨찾기 알약(btn+act) · 닫기 ×(xact)
 *     sug    { pad, badge, bc, name, sub, last, btn, bact, act }                             한 줄 목록(자동완성·기준시각): 종류 딱지 · 이름(굵게) · 작은 글 · (오른쪽 작은 단추). 높이 44
 *     msg    { pad, mine, pre, nick, s, time, badge, bc, go, fill, tc, act }                 채팅 말풍선(내 것은 오른쪽·금색). act 가 있으면 go('신고') 글자 자리만 눌린다
 *     tabbar { pad, h, fill, line, onc, sc, items:[{label, icon(SVG path d), on, badge, act}] } 아래 탭 막대: 칸마다 아이콘 + 글자
 *     act    { a:'cat', v } | { a:'open', url } | { a:'refresh' } | { a:'search', tpl('{q}' 포함 http(s)), empty(http(s)) }
 *            | { a:'set', key } | { a:'call', v:이름 } | { a:'web', v:이름 } | { a:'sel', v:값 } | { a:'tog', v:글번호 }   (call/web/sel 은 웹이 허용 목록에 있는 것만 실행한다. tog = post 펼침 — 앱이 직접 펼치고 알리기만 한다)
 *   screen.anchor = 'bottom' (선택) 채팅처럼 새 글이 아래에 붙는 화면 — 처음 열릴 때와, 사용자가 맨 아래 근처에 있을 때 갱신되면 맨 아래로 붙는다.
 *   screen.foot = [노드…] (선택) 화면 맨 아래에 고정되는 줄(채팅 입력줄). 키보드가 올라와 화면이 줄어도 입력줄은 맨 아래에 붙는다.
 *   screen.bg = 'bg'(기본) | 'card' | 'card2' (선택) 화면 바탕 색 — 카드 안에 놓이는 화면(경로 결과 윗부분)은 'card'.
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
    public static final int MAX_ROW = 8;

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
        public float bh = 0f, bsize = 0f;                  // inbar: 단추 높이·글자 크기(0 이면 줄 높이·입력칸 글자 크기)
        public String dot = "";                            // inbar: 왼쪽 동그라미 색(출발/도착 점)
        public boolean watch;                              // inbar: 글자가 바뀔 때마다 앱이 웹에 알린다(자동완성)
        public boolean multi;                              // field: 여러 줄 입력칸(글쓰기 내용) — 줄바꿈을 받고 글자를 줄바꿔 그린다
        public Act bact;                                   // sug: 오른쪽 작은 단추의 행동
        public boolean bold, on;
        public String color = "text", bg = "", align = "left";
        public String s = "", label = "", badge = "", name = "", tag = "", img = "", fb = "";
        public float ipL = 12f, ipT = 8f, ipR = 12f, ipB = 8f, r = 10f, max = 340f, vp = 9f, ssize = 11f;
        public int maxlen = 60;
        public boolean top, big;
        public String key = "", title = "", sub = "", value = "";
        public String fill = "", line = "", hint = "", accent = "#e63329", tc = "", sc = "", onc = "", onl = "", chk = "", ckf = "";
        public String[] prev = new String[0];
        public boolean mine, right, ind;
        public String nick = "", pre = "", time = "";
        public float[] pathOps = new float[0];
        public List<Node> kids = new ArrayList<Node>();
        public int[][] hl = new int[0][];
        public Act act;
        public List<Node> items = new ArrayList<Node>();
        public Mark mk;                                    // trk: 내 위치 마커(엔진이 정한 것)
        public float val;                                  // gauge: 채움 비율(0~100)
        public int ci = -1;                                // chart: 지금 시각 막대 번호(가운데로 맞출 곳)
        public String[] hlc = new String[0];               // text·box: hl 구간마다 글자색(빈 글이면 기본)
        public long until;                                 // aih: 다음 갱신 마감 시각(기기 시계 ms, 0 이면 카운트다운 없음)
        public float[] bops = new float[0];                // inbar: 둥근 아이콘 단추의 그림(SVG path d 를 풀어 둔 것 — 있으면 글자 단추 대신 지름 bh 의 동그란 단추)
    }
    public static final class Screen {
        public String id = "", rev = "", cover = "chips";
        public List<Node> head = new ArrayList<Node>(), body = new ArrayList<Node>(), foot = new ArrayList<Node>();
        public String anchor = "", bg = "bg";                  // bg: 화면 바탕 색 역할(기본 bg = 페이지 바탕 · card = 카드 안에 놓이는 화면)
        public int skipped = 0, nodes = 0;
    }

    private static final String[] ROLES = { "bg", "card", "border", "text", "sub", "gold", "orange", "imgbg", "white", "border2", "none", "card2", "nav" };
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
        else if ("call".equals(a.a) || "web".equals(a.a) || "sel".equals(a.a) || "tog".equals(a.a)) { a.v = optStr(m, "v", "", 40); if (!ident(a.v)) throw new ParseError("act " + a.a + ": v 가 올바르지 않다"); }
        else if ("search".equals(a.a)) {
            a.tpl = optStr(m, "tpl", "", 1500); a.empty = optStr(m, "empty", "", 1500);
            if (!httpUrl(a.tpl) || a.tpl.indexOf("{q}") < 0) throw new ParseError("act search: tpl 은 {q} 가 든 http(s) 주소여야 한다");
            if (!httpUrl(a.empty)) throw new ParseError("act search: empty 가 http(s) 가 아니다");
        }
        else throw new ParseError("모르는 행동 " + a.a);
        return a;
    }

    private static Mark mark(Map<String, Object> m, int cells) throws ParseError {
        Mark k = new Mark();
        k.f = (int) optNum(m, "f", 0f, 0f, 9999f); k.t = (int) optNum(m, "t", (float) k.f, 0f, 9999f);
        if (k.f >= cells || k.t >= cells) throw new ParseError("mk: 칸 번호가 범위를 벗어났다");
        k.r = optNum(m, "r", 0f, 0f, 1f); k.ms = optNum(m, "ms", 0f, 0f, 10000f);
        k.d = optNum(m, "d", 14f, 6f, 30f); k.bw = optNum(m, "bw", 2f, 0f, 6f); k.hw = optNum(m, "hw", 6f, 0f, 16f);
        k.pms = optNum(m, "pms", 1300f, 300f, 6000f); k.rms = optNum(m, "rms", 1400f, 300f, 6000f); k.bz = optNum(m, "bz", 9f, 6f, 14f);
        k.pu = optStr(m, "pu", "b", 2); if (!"b".equals(k.pu) && !"w".equals(k.pu)) throw new ParseError("mk: pu 는 b 또는 w");
        k.c = roleOrCss(m, "c", "#0a84ff"); k.bc = roleOrCss(m, "bc", "#ffffff"); k.hc = roleOrCss(m, "hc", ""); k.ring = roleOrCss(m, "ring", "");
        k.bt = optStr(m, "bt", "", 24); k.bg = roleOrCss(m, "bg", "#ff9f0a"); k.btc = roleOrCss(m, "btc", "#ffffff");
        return k;
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
        if (l.size() > 48) throw new ParseError("hl: 너무 많다");
        int[][] r = new int[l.size()][];
        int prevEnd = 0;
        for (int i = 0; i < r.length; i++) {
            List<Object> p = asArr(l.get(i), "hl 구간");
            if ((p.size() != 2 && p.size() != 3) || !(p.get(0) instanceof Double) || !(p.get(1) instanceof Double)) throw new ParseError("hl: [시작,끝(,색)] 이어야 한다");
            int a = ((Double) p.get(0)).intValue(), b = ((Double) p.get(1)).intValue();
            if (a < prevEnd || b <= a || b > len) throw new ParseError("hl: 범위 밖 " + a + "-" + b);
            r[i] = new int[] { a, b }; prevEnd = b;
        }
        return r;
    }
    /** hl 구간마다 선택 글자색(세 번째 칸). 없으면 빈 글. */
    private static String[] hlc(Map<String, Object> m, int cnt) throws ParseError {
        String[] r = new String[cnt];
        for (int i = 0; i < cnt; i++) r[i] = "";
        Object v = m.get("hl");
        if (v == null) return r;
        List<Object> l = asArr(v, "hl");
        for (int i = 0; i < cnt && i < l.size(); i++) {
            List<Object> p = asArr(l.get(i), "hl 구간");
            if (p.size() == 3) {
                if (!(p.get(2) instanceof String)) throw new ParseError("hl: 색은 글자여야 한다");
                String c = (String) p.get(2);
                if (c.length() > 60 || (c.length() > 0 && !role(c) && color(c, BAD_COLOR) == BAD_COLOR)) throw new ParseError("hl: 읽을 수 없는 색 " + c);
                r[i] = c;
            }
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
                c.fill = roleOrCss(im, "c", "");                                                                      // 칩마다 켜진 바탕색(실시간소통 노선 색)
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
            n.hl = hl(m, n.s.length()); n.hlc = hlc(m, n.hl.length);
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
        } else if ("row".equals(t)) {                                                                       // 한 줄에 같은 폭으로 나란히(요일·시각 칸·시험 단추) — 안에는 button·box·text 만
            pad(m, n); n.gap = optNum(m, "gap", 8f, 0f, 40f);
            List<Object> rk = asArr(m.get("kids"), "row.kids");
            if (rk.size() < 1 || rk.size() > MAX_ROW) throw new ParseError("row: 칸은 1~" + MAX_ROW + "개");
            for (Object ko : rk) {
                Map<String, Object> km = asObj(ko, "row 안 노드");
                String kt = optStr(km, "t", "", 20);
                if (!"button".equals(kt) && !"box".equals(kt) && !"text".equals(kt)) throw new ParseError("row 안에 " + kt + " 를 둘 수 없다");
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
            n.hint = optStr(m, "hint", "", 60); n.value = optStr(m, "value", "", 1000); n.maxlen = (int) optNum(m, "maxlen", 60f, 1f, 1000f); n.multi = optBool(m, "multi", false);
            n.h = optNum(m, "h", 44f, 28f, 160f); n.size = optNum(m, "size", 14f, 8f, 30f); n.r = optNum(m, "r", 9f, 0f, 30f);
            n.fill = roleOrCss(m, "fill", "bg"); n.line = roleOrCss(m, "line", "border2"); n.tc = roleOrCss(m, "tc", "text"); n.sc = roleOrCss(m, "sc", "sub");
        } else if ("box".equals(t)) {
            pad(m, n); ip(m, n);
            n.s = optStr(m, "s", "", MAX_STR); if (n.s.length() == 0) throw new ParseError("box: s 없음");
            n.hl = hl(m, n.s.length()); n.hlc = hlc(m, n.hl.length);
            n.size = optNum(m, "size", 12f, 6f, 40f); n.lh = optNum(m, "lh", 1.35f, 1f, 3f);
            n.color = optStr(m, "color", "text", 12); if (!role(n.color)) throw new ParseError("color: 모르는 색 " + n.color);
            n.fill = roleOrCss(m, "fill", ""); n.line = roleOrCss(m, "line", ""); n.tc = roleOrCss(m, "tc", "");
            n.onc = roleOrCss(m, "hc", "");                                                                      // 굵은 구간(hl)의 색(없으면 글 색 그대로)
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
        } else if ("news".equals(t)) {
            pad(m, n);
            n.title = optStr(m, "title", "", 200); if (n.title.length() == 0) throw new ParseError("news: title 없음");
            n.sub = optStr(m, "sub", "", 60);
            n.act = act(m.get("act"), true);
        } else if ("tabbar".equals(t)) {
            pad(m, n);
            n.h = optNum(m, "h", 56f, 32f, 96f);
            n.fill = roleOrCss(m, "fill", "nav"); if (n.fill.length() == 0) n.fill = "nav";
            n.line = roleOrCss(m, "line", "border"); n.onc = roleOrCss(m, "onc", "gold"); if (n.onc.length() == 0) n.onc = "gold";
            n.sc = roleOrCss(m, "sc", "sub"); if (n.sc.length() == 0) n.sc = "sub";
            List<Object> its = asArr(m.get("items"), "tabbar.items");
            if (its.size() < 2 || its.size() > 6) throw new ParseError("tabbar: 칸은 2~6개");
            for (Object io : its) {
                Map<String, Object> im = asObj(io, "tab");
                Node c = new Node(); c.t = "tab";
                c.label = optStr(im, "label", "", 12); if (c.label.length() == 0) throw new ParseError("tab: label 없음");
                c.value = optStr(im, "icon", "", 900); c.pathOps = pathOps(c.value);
                c.on = optBool(im, "on", false); c.badge = optStr(im, "badge", "", 4); c.act = act(im.get("act"), true);
                n.items.add(c); sc.nodes++;
            }
        } else if ("post".equals(t)) {
            pad(m, n);
            n.key = optStr(m, "id", "", 40); if (!ident(n.key)) throw new ParseError("post: id 가 올바르지 않다");
            n.title = optStr(m, "title", "", 300); if (n.title.length() == 0) throw new ParseError("post: title 없음");
            n.badge = optStr(m, "cat", "", 12); n.tc = roleOrCss(m, "catc", "#8e8e93");
            n.tag = optStr(m, "nick", "", 40); n.sub = optStr(m, "meta", "", 160); n.on = optBool(m, "open", false);
            n.fill = roleOrCss(m, "fill", "card"); n.line = roleOrCss(m, "line", "border");
            for (Object ko : asArr(m.get("kids"), "post.kids")) {
                Map<String, Object> km = asObj(ko, "post 안 노드");
                String kt = optStr(km, "t", "", 20);
                if ("post".equals(kt) || "panel".equals(kt) || "grid".equals(kt) || "chips".equals(kt) || "search".equals(kt) || "tabbar".equals(kt)) throw new ParseError("post 안에 " + kt + " 를 둘 수 없다");
                Node kn = node(ko, sc);
                if (kn != null) n.kids.add(kn);
            }
        } else if ("cmt".equals(t)) {
            pad(m, n);
            n.nick = optStr(m, "nick", "", 40); if (n.nick.length() == 0) throw new ParseError("cmt: nick 없음");
            n.s = optStr(m, "s", "", 600); n.time = optStr(m, "time", "", 16); n.ind = optBool(m, "ind", false);
            n.tc = roleOrCss(m, "nc", "#5e5ce6"); if (n.tc.length() == 0) n.tc = "#5e5ce6";
        } else if ("btnrow".equals(t)) {
            pad(m, n); n.gap = optNum(m, "gap", 8f, 0f, 60f); n.h = optNum(m, "h", 30f, 20f, 60f);
            for (Object io : asArr(m.get("items"), "btnrow.items")) {
                Map<String, Object> im = asObj(io, "btn");
                Node c = new Node(); c.t = "rbtn";
                c.label = optStr(im, "label", "", 40); if (c.label.length() == 0) throw new ParseError("btn: label 없음");
                c.on = optBool(im, "on", false); c.right = optBool(im, "right", false); c.act = act(im.get("act"), true);
                c.fill = roleOrCss(im, "fill", "card2"); c.line = roleOrCss(im, "line", "border2"); c.tc = roleOrCss(im, "tc", "sub");
                n.items.add(c); sc.nodes++;
                if (sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
            }
        } else if ("inbar".equals(t)) {
            pad(m, n);
            n.key = optStr(m, "key", "", 40); if (!ident(n.key)) throw new ParseError("inbar: key 가 올바르지 않다");
            n.hint = optStr(m, "hint", "", 60); n.value = optStr(m, "value", "", 120); n.maxlen = (int) optNum(m, "maxlen", 120f, 1f, 300f);
            n.h = optNum(m, "h", 40f, 28f, 80f); n.r = optNum(m, "r", 9f, 0f, 40f); n.size = optNum(m, "size", 13f, 8f, 30f);
            n.label = optStr(m, "btn", "", 8); if (n.label.length() == 0) throw new ParseError("inbar: btn 없음");
            n.act = act(m.get("act"), true);
            n.top = optBool(m, "top", false);
            n.fill = roleOrCss(m, "fill", "card"); n.line = roleOrCss(m, "line", "border2"); n.tc = roleOrCss(m, "tc", "text"); n.sc = roleOrCss(m, "sc", "sub");
            n.onc = roleOrCss(m, "onc", "gold"); if (n.onc.length() == 0) n.onc = "gold"; n.chk = roleOrCss(m, "ckf", "#121214"); if (n.chk.length() == 0) n.chk = "#121214";
            n.dot = roleOrCss(m, "dot", ""); n.bold = optBool(m, "bold", false); n.watch = optBool(m, "watch", false);
            n.on = optBool(m, "dim", false); n.bact = act(m.get("eact"), false);              // dim = 단추를 흐리게(눌러도 아무 일 없음) · eact = 키보드의 확인 키 행동(없으면 단추 행동)
            n.bh = optNum(m, "bh", 0f, 0f, 60f); n.bsize = optNum(m, "bsize", 0f, 0f, 30f);
            if (n.bh > 0f && n.bh < 20f) throw new ParseError("inbar: bh 는 0 또는 20 이상");
            if (n.bsize > 0f && n.bsize < 8f) throw new ParseError("inbar: bsize 는 0 또는 8 이상");
            String bic = optStr(m, "bicon", "", 900); n.bops = pathOps(bic);                                    // bicon = 동그란 아이콘 단추(지름 bh)
            if (bic.length() > 0 && n.bh < 20f) throw new ParseError("inbar: bicon 에는 bh 가 20 이상이어야 한다");
        } else if ("swap".equals(t)) {
            n.size = optNum(m, "size", 34f, 20f, 60f);                                                           // 지름
            n.fill = roleOrCss(m, "fill", "#0a84ff"); if (n.fill.length() == 0) n.fill = "#0a84ff";
            n.line = roleOrCss(m, "line", "bg"); n.tc = roleOrCss(m, "tc", "white"); if (n.tc.length() == 0) n.tc = "white";
            n.value = optStr(m, "icon", "", 900); n.pathOps = pathOps(n.value);                                  // 24x24 안의 SVG path d
            n.act = act(m.get("act"), true);
        } else if ("rhd".equals(t)) {                                                                      // 경로 결과 머리줄: 큰 분 숫자 + 단위 + 구간명 + (즐겨찾기 알약) + (닫기 ×)
            pad(m, n);
            n.title = optStr(m, "num", "", 6); n.name = optStr(m, "msg", "", 80);                                 // msg 가 있으면 숫자 대신 안내 한 줄(고른 탭에 경로가 없을 때)
            if (n.title.length() == 0 && n.name.length() == 0) throw new ParseError("rhd: num 또는 msg 가 있어야 한다");
            n.badge = optStr(m, "unit", "", 6); n.s = optStr(m, "s", "", 80); n.label = optStr(m, "btn", "", 12);
            n.act = n.label.length() > 0 ? act(m.get("act"), true) : null;
            n.bact = act(m.get("xact"), false);
            if (n.act == null && n.bact == null) throw new ParseError("rhd: 누를 곳(act/xact)이 없다");
        } else if ("trk".equals(t)) {                                                                      // 구간 타임라인: 칸(역·도보) 가로 줄. 시각·색·글·배지·선·점은 전부 엔진이 정한다
            pad(m, n);
            for (Object io : asArr(m.get("cells"), "trk.cells")) {
                Map<String, Object> im = asObj(io, "cell");
                Node c = new Node(); c.t = "cell";
                c.max = optNum(im, "w", 64f, 24f, 200f);
                c.name = optStr(im, "n", "", 60); c.tc = roleOrCss(im, "nc", "text"); c.size = optNum(im, "ns", 10f, 6f, 20f); c.bold = optBool(im, "nb", false); c.ipB = optNum(im, "np", 0f, 0f, 10f);
                c.badge = optStr(im, "g", "", 40); c.tag = optStr(im, "gk", "p", 2); c.fill = roleOrCss(im, "gc", ""); c.ssize = optNum(im, "gs", 7f, 5f, 14f); c.vp = optNum(im, "gx", 4f, 0f, 12f);
                if (!"p".equals(c.tag) && !"t".equals(c.tag)) throw new ParseError("cell: gk 는 p 또는 t");
                c.line = roleOrCss(im, "lc", ""); c.accent = roleOrCss(im, "rc", "");
                c.dot = optStr(im, "dk", "", 2); if (c.dot.length() > 0 && !"e".equals(c.dot) && !"r".equals(c.dot) && !"m".equals(c.dot)) throw new ParseError("cell: dk 는 e r m");
                c.onc = roleOrCss(im, "dc", ""); c.onl = roleOrCss(im, "dc2", "");
                c.time = optStr(im, "t", "", 40); c.sc = roleOrCss(im, "tc", "sub"); c.lh = optNum(im, "ts", 9f, 6f, 20f); c.big = optBool(im, "tb", false);
                c.cols = (int) optNum(im, "ti", -1f, -1f, 9999f);
                n.items.add(c); sc.nodes++;
                if (sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
            }
            if (n.items.isEmpty()) throw new ParseError("trk: 칸이 없다");
            if (m.get("mk") != null) n.mk = mark(asObj(m.get("mk"), "trk.mk"), n.items.size());
        } else if ("aih".equals(t)) {                                                                      // AI 승무원 카드 머리줄: 제목 한 줄 + 다음 갱신 카운트다운 알약 + 새로고침 단추. 글·색·마감 시각은 엔진이 정한다
            pad(m, n);
            n.s = optStr(m, "s", "", 200); if (n.s.length() == 0) throw new ParseError("aih: s 없음");
            n.value = optStr(m, "icon", "", 900); n.pathOps = pathOps(n.value);
            n.label = optStr(m, "done", "", 16);
            Object tv = m.get("to");
            if (tv != null) { if (!(tv instanceof Double)) throw new ParseError("aih: to 는 수여야 한다"); double dv = (Double) tv; if (dv < 0 || dv > 4.0e12) throw new ParseError("aih: to 범위 밖"); n.until = (long) dv; }
            n.on = optBool(m, "bd", false);
            n.act = n.on ? null : act(m.get("act"), false);
            n.fill = roleOrCss(m, "pf", "rgba(47,124,246,0.12)"); n.tc = roleOrCss(m, "pc", "#2f7cf6");
            if (n.fill.length() == 0) n.fill = "rgba(47,124,246,0.12)"; if (n.tc.length() == 0) n.tc = "#2f7cf6";
        } else if ("lth".equals(t)) {                                                                      // 홈 '실시간 대화' 머리줄: 색 점 + 굵은 제목 + 작은 꼬리 글(›). 줄 전체가 눌린다
            pad(m, n);
            n.s = optStr(m, "s", "", 40); if (n.s.length() == 0) throw new ParseError("lth: s 없음");
            n.sub = optStr(m, "tail", "", 4);
            n.dot = roleOrCss(m, "dot", "#ff3b30"); if (n.dot.length() == 0) n.dot = "#ff3b30";
            n.act = act(m.get("act"), false);
        } else if ("ltr".equals(t)) {                                                                      // 홈 '실시간 대화' 한 줄: 닉네임(굵게) + 글(한 줄 말줄임) + 오른쪽 시각
            pad(m, n);
            n.nick = optStr(m, "nick", "", 40); n.s = optStr(m, "s", "", 200); n.time = optStr(m, "time", "", 8);
            if (n.s.length() == 0) throw new ParseError("ltr: s 없음");
            n.tc = roleOrCss(m, "nc", "gold"); if (n.tc.length() == 0) n.tc = "gold";
        } else if ("cgh".equals(t)) {                                                                      // 혼잡도 카드 머리줄: 왼쪽 '지하철 강남' + 작은 글, 오른쪽 혼잡 단계 글자. 글·색은 엔진이 정한다
            pad(m, n);
            n.label = optStr(m, "lab", "", 12); n.name = optStr(m, "nm", "", 40); n.sub = optStr(m, "meta", "", 80); n.s = optStr(m, "st", "", 24);
            n.tc = roleOrCss(m, "sc", "sub"); if (n.tc.length() == 0) n.tc = "sub";
        } else if ("gauge".equals(t)) {                                                                    // 혼잡도 게이지: 글자 두 개(왼쪽 이름 · 오른쪽 %) + 채움 막대
            pad(m, n);
            n.label = optStr(m, "s", "", 12); n.value = optStr(m, "txt", "", 8); n.val = optNum(m, "v", 0f, 0f, 100f);
            n.fill = roleOrCss(m, "c", "#34c759"); if (n.fill.length() == 0) n.fill = "#34c759";
        } else if ("chart".equals(t)) {                                                                    // 24시간 막대 차트: 머리(제목·출처·피크) + 가로로 밀리는 막대줄. 막대 높이·색·투명도는 엔진이 정한다
            pad(m, n);
            n.title = optStr(m, "ttl", "", 24); n.sub = optStr(m, "src", "", 24); n.name = optStr(m, "pk", "", 16);
            n.bh = optNum(m, "bh", 112f, 40f, 400f); n.ci = (int) optNum(m, "ci", -1f, -1f, 47f); n.key = optStr(m, "cs", "", 40);
            n.tc = roleOrCss(m, "co", "#ffffff"); if (n.tc.length() == 0) n.tc = "#ffffff";
            n.onc = roleOrCss(m, "pc", "gold"); if (n.onc.length() == 0) n.onc = "gold";
            List<Object> bl = asArr(m.get("bars"), "chart.bars");
            if (bl.size() > 48) throw new ParseError("chart: 막대가 너무 많다");
            for (Object io : bl) {
                Map<String, Object> im = asObj(io, "bar");
                Node c = new Node(); c.t = "bar24";
                c.label = optStr(im, "h", "", 4); c.max = optNum(im, "v", 0f, 0f, 400f); c.fill = roleOrCss(im, "c", "");
                c.alpha = optNum(im, "a", 1f, 0f, 1f); c.on = optBool(im, "u", false); c.top = optBool(im, "o", false);
                n.items.add(c); sc.nodes++;
                if (sc.nodes > MAX_NODES) throw new ParseError("노드가 너무 많다");
            }
            if (n.ci >= n.items.size()) throw new ParseError("chart: ci 가 막대 수를 넘었다");
        } else if ("cars".equals(t)) {                                                                     // 칸별 혼잡: 제목 + 칸 가로줄(테두리 색 · 글 세 줄), 칸이 없으면 안내 글
            pad(m, n);
            n.title = optStr(m, "ttl", "", 24); n.value = optStr(m, "msg", "", 60);
            for (Object io : asArr(m.get("cells"), "cars.cells")) {
                Map<String, Object> im = asObj(io, "cell");
                Node c = new Node(); c.t = "car";
                c.name = optStr(im, "n", "", 6); c.label = optStr(im, "l", "", 6); c.badge = optStr(im, "p", "", 6); c.fill = roleOrCss(im, "c", "#34c759"); if (c.fill.length() == 0) c.fill = "#34c759";
                n.items.add(c); sc.nodes++;
                if (n.items.size() > 12) throw new ParseError("cars: 칸이 너무 많다");
            }
            if (n.items.isEmpty() && n.value.length() == 0) throw new ParseError("cars: 칸도 안내 글도 없다");
        } else if ("sug".equals(t)) {
            pad(m, n);
            n.badge = optStr(m, "badge", "", 12);
            n.name = optStr(m, "name", "", 120); if (n.name.length() == 0) throw new ParseError("sug: name 없음");
            n.sub = optStr(m, "sub", "", 160); n.on = optBool(m, "last", false);
            n.accent = roleOrCss(m, "bc", "sub"); if (n.accent.length() == 0) n.accent = "sub";
            n.label = optStr(m, "btn", "", 6);
            if (n.label.length() > 0) n.bact = act(m.get("bact"), true);
            n.act = act(m.get("act"), true);
        } else if ("msg".equals(t)) {
            pad(m, n);
            n.mine = optBool(m, "mine", false); n.nick = optStr(m, "nick", "", 40); n.pre = optStr(m, "pre", "", 24);
            n.s = optStr(m, "s", "", 600); if (n.s.length() == 0) throw new ParseError("msg: s 없음");
            n.time = optStr(m, "time", "", 12); n.badge = optStr(m, "badge", "", 10); n.accent = roleOrCss(m, "bc", "#ff453a"); if (n.accent.length() == 0) n.accent = "#ff453a";
            n.title = optStr(m, "go", "", 8);
            n.act = act(m.get("act"), false);
            n.fill = roleOrCss(m, "fill", n.mine ? "gold" : "card2"); if (n.fill.length() == 0) n.fill = n.mine ? "gold" : "card2";
            n.tc = roleOrCss(m, "tc", n.mine ? "#121214" : "text"); if (n.tc.length() == 0) n.tc = n.mine ? "#121214" : "text";
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
        sc.bg = optStr(m, "bg", "bg", 8); if (!"bg".equals(sc.bg) && !"card".equals(sc.bg) && !"card2".equals(sc.bg)) throw new ParseError("bg: 모르는 값 " + sc.bg);
        sc.anchor = optStr(m, "anchor", "", 8); if (!"".equals(sc.anchor) && !"bottom".equals(sc.anchor)) throw new ParseError("anchor: 모르는 값 " + sc.anchor);
        for (Object o : asArr(m.get("head"), "head")) { Node n = node(o, sc); if (n != null) sc.head.add(n); }
        for (Object o : asArr(m.get("body"), "body")) { Node n = node(o, sc); if (n != null) sc.body.add(n); }
        if (m.get("foot") != null) for (Object o : asArr(m.get("foot"), "foot")) { Node n = node(o, sc); if (n != null) sc.foot.add(n); }
        if (sc.head.isEmpty() && sc.body.isEmpty() && sc.foot.isEmpty()) throw new ParseError("그릴 것이 없다");
        return sc;
    }

    public static Screen load(String json) throws ParseError { return validate(parse(json)); }

    // ═════════════ ③ 배치 ═════════════
    public static final int K_CHIP = 1, K_CARD = 2, K_TEXT = 3, K_BUTTON = 4, K_BOX = 5, K_SEARCH = 6, K_PANEL = 7, K_TOGGLE = 8, K_NAV = 9, K_SELECT = 10, K_FIELD = 11, K_BAR = 12, K_PLACE = 13, K_DIV = 14, K_NEWS = 15, K_POSTH = 16, K_CMT = 17, K_RBTN = 18, K_INBAR = 19, K_MSG = 20, K_TAB = 21, K_SUG = 22, K_SWAP = 23, K_RHD = 24, K_TRK = 25, K_CGH = 26, K_GAUGE = 27, K_CHART = 28, K_HBAR = 29, K_CARS = 30, K_AIH = 31, K_LTH = 32, K_LTR = 33;
    /** 경로 결과 머리줄 치수(웹 #transitResultHeader 와 같다: 분 숫자 28 · 단위 14 · 구간명 12 · 즐겨찾기 알약 11 · 닫기 ×) */
    /** 구간 타임라인 칸 치수(웹 #transitHtlTrack 과 같다): 이름 30 · 배지 18 · 축 26 · 시각 3+16 */
    public static final float TRK_NAME_H = 30f, TRK_BADGE_H = 18f, TRK_AXIS_H = 26f, TRK_TIME_GAP = 3f, TRK_TIME_H = 16f, TRK_H = 93f, TRK_LINE_Y = 12f, TRK_LINE_H = 3f, TRK_DOT_Y = 13f, TRK_E_R = 7f, TRK_R_R = 6f, TRK_M_R = 3f;
    public static final float RHD_H = 34f, RHD_NUM = 28f, RHD_UNIT = 14f, RHD_ROUTE = 12f, RHD_BTN = 11f, RHD_BTN_PX = 8f, RHD_BTN_H = 22f, RHD_X = 28f, RHD_MSG = 14f;
    /** 홈 '실시간 대화' 게시판 치수(웹 .livetalk-hdr / .livetalk-msg 와 같다): 머리줄 21 · 한 줄 20(줄 사이 5) · 닉네임 11 굵게(최대 80) · 글 12 · 시각 9 */
    public static final float LTH_H = 21f, LTH_TITLE = 12f, LTH_DOT = 7f, LTH_GAP = 6f, LTR_H = 20f, LTR_NICK = 11f, LTR_NICK_MAX = 80f, LTR_TXT = 12f, LTR_TIME = 9f, LTR_GAP = 7f, INBAR_ICON = 17f;
    /** 혼잡도 카드 치수(웹 .cong-top / .cong-gauge / .chart-wrap / .car-grid 와 같다) */
    public static final float AIH_H = 28f, AIH_BTN_W = 30f, AIH_TITLE = 13.5f, AIH_PILL = 11f, AIH_PILL_H = 19f, AIH_PILL_PX = 8f, AIH_GAP = 8f, AIH_ICON = 16f;
    public static final float CGH_L1 = 18f, CGH_L2 = 15f, CGH_NAME = 13f, CGH_META = 11f, CGH_ST = 17f, CGH_GAP = 10f, CGH_H = 33f,
            GAUGE_LBL = 10f, GAUGE_LBL_H = 14f, GAUGE_GAP = 5f, GAUGE_BAR_H = 8f, GAUGE_H = 27f,
            CHART_PADL = 11f, CHART_PADT = 11f, CHART_PADB = 11f, CHART_HDR = 11f, CHART_SRC = 9f, CHART_HDR_H = 15f, CHART_HDR_GAP = 9f, CHART_SCROLL_PB = 4f, CHART_COL_W = 28f, CHART_FILL_W = 16f, CHART_LBL = 8f, CHART_LBL_H = 13f, CHART_R = 11f,
            CARS_TTL = 11f, CARS_TTL_H = 15f, CARS_TTL_GAP = 6f, CARS_GAP = 4f, CARS_CELL_H = 58f, CARS_MSG_H = 26f;
    /** 홈 경로 입력 치수(웹 홈 탭 출발/도착 카드·자동완성과 같다) */
    public static final float SUG_H = 44f, SUG_PADX = 14f, SUG_BADGE = 11f, SUG_NAME = 14f, SUG_SUB = 11f, SUG_PILL_PX = 6f, SUG_GAP = 6f, SUG_BTN = 11f, SUG_BTN_PADX = 9f, SUG_BTN_H = 26f;
    /** 게시글 카드·댓글·말풍선 치수(웹 .dc-* / .chat-bub-* 와 같다) */
    public static final float POST_PADX = 14f, POST_PADT = 12f, POST_META_GAP = 8f, POST_PADB = 10f, POST_TITLE = 14f, POST_TITLE_LH = 1.4f, POST_BADGE = 10f, POST_BADGE_PX = 7f, POST_BADGE_GAP = 8f, POST_META = 11f, POST_BODYPAD = 14f,
            CMT_NICK = 11f, CMT_TXT = 12f, CMT_TIME = 10f, CMT_IND = 14f, RBTN_PADX = 12f, RBTN_SIZE = 12f,
            MSG_MAXF = 0.74f, MSG_PADX = 11f, MSG_PADY = 8f, MSG_TXT = 13f, MSG_LH = 1.45f, MSG_NICK = 11f, MSG_TIME = 9f, MSG_RAD = 13f, INBAR_BTN_PADX = 14f, INBAR_GAP = 8f, TAB_ICON = 20f, TAB_LABEL = 10f;
    /** 맛집 머리줄·장소 카드 치수(웹 .food-* 와 같다) */
    public static final float BAR_TITLE = 18f, BAR_SUB = 13f, BAR_BTN = 12f, BAR_LH = 1.4f, PLACE_PAD = 14f, PLACE_RANK = 24f, PLACE_GAP = 12f, PLACE_NAME = 15f, PLACE_SUB = 12f, PLACE_META = 11f, PLACE_STAR = 13f, PLACE_PILL_H = 20f,
            NEWS_PADV = 13f, NEWS_PADX = 4f, NEWS_BARW = 3f, NEWS_GAP = 10f, NEWS_TITLE = 14f, NEWS_SUB = 11f, NEWS_LH = 1.45f, NEWS_CHEV = 13f;
    public static final int NEWS_MAXLINES = 4;
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
        public float[] pathOps = new float[0];       // 탭 아이콘(절대 좌표 M/L/C/Z 로 풀어 둔 것: [연산, 좌표…])
        public float btnLX, btnLW, zoneX, zoneY, zoneW, zoneH;   // 말풍선 '신고' 글자 자리 · 입력줄 단추 글자 자리
        public Col fill2;                            // 말풍선 글자색 따로 필요할 때
        public Col dotC;                             // 입력줄 왼쪽 동그라미 색(없으면 null)
        public boolean watch;                        // 입력줄: 글자 바뀜을 알린다
        public boolean multi;                        // 글자 입력칸: 여러 줄
        public Act act2;                             // 자동완성 줄 오른쪽 작은 단추
        public float starX, badgeX, badgePw, distX, distPw, goX, metaY, metaH, subY, subLH2;   // 장소 카드 한 줄(별점·딱지·거리·길찾기) 자리 / 머리줄 작은 글 자리
        public String dk = "", time = "", gk = "";   // 타임라인 칸: 점 종류(e 끝점 · r 고리 · m 도보 가운데) · 시각 글 · 배지 종류(p 알약 · t 글)
        public Col lc, rc, dc, dc2, gc, nc, timec;   // 칸: 왼/오른 선 · 점 · 점 둘째 색 · 배지 · 이름 · 시각 글자 색
        public float tsz, gsz, gx, badgeTw, nameBot; // 칸: 시각 글 크기 · 배지 글 크기 · 알약 좌우 여백 · 배지 글 폭 · 이름 마지막 줄 아래쪽
        public boolean tb;
        public int ti = -1;                          // 칸: 위치 추적 번호(-1 은 추적 안 함)
        public Act act;
        public String t1 = "", t2 = "", t3 = "";    // 혼잡도 카드: 글 조각들(머리줄 '지하철 '·이름·작은 글 / 차트 제목·출처·피크)
        public float f1, f2, f3;                     // 혼잡도 카드: 수 조각들(글 폭 · 비율 · 높이 · 잘림 왼쪽)
        public String[] sa = new String[0];          // 칸별 혼잡: 칸마다 글 세 줄(칸·단계·%)
        public Col[] ca = new Col[0];                // 칸별 혼잡: 칸마다 색
        public Col[][] segCol;                       // hl 조각마다 글자색(null 이면 기본 색)
        public long ln;                              // aih: 카운트다운 마감 시각(기기 시계 ms)
    }

    /** 배치 결과. */
    /** 구간 타임라인 위의 내 위치 마커. 어느 칸에서 어느 칸으로 얼마나 갔는지·색·크기·맥박·대기 배지 글은 전부 엔진이 정했다 — 앱은 칸 가운데 사이를 이어 그리기만 한다. */
    public static final class Mark {
        public int f, t;                                   // 칸 번호(trk.cells 안)
        public float r, ms, d, bw, hw, pms, rms, bz;       // 구간 비율 · 옮겨 가는 ms(0 이면 곧바로) · 점 지름 · 흰 테두리 · 번쩍임 두께 · 번쩍임·퍼지는 고리 주기 ms · 배지 글자
        public String pu = "b", c = "", bc = "", hc = "", ring = "", bt = "", bg = "", btc = "";      // pu b=깜박임 w=승차 대기 맥박 · 점·테두리·번쩍임·고리·배지 글·배지 바탕·배지 글자 색
        // 배치 뒤(dp)
        public float x0, x1, y, btw, bty, bth;             // 시작·끝 칸 가운데 x · 점 가운데 y · 배지 글 폭 · 배지 위 y · 배지 높이
        public Col ccol, bcol, hcol, rcol, gcol, tcol;     // 점 · 테두리 · 번쩍임 · 고리 · 배지 바탕 · 배지 글자 (읽은 색)
        public float x(float ratio) { return x0 + (x1 - x0) * ratio; }
    }

    public static final class Layout {
        public Item[] head = new Item[0], body = new Item[0], foot = new Item[0];
        public float headH, headContentW, bodyH, footH, width, chipsTop = -1f, chipsBot = -1f;
        public String bg = "bg";                                          // 화면 바탕 색 역할
        public Mark mk;                                                   // 구간 타임라인의 내 위치 마커(없으면 null)
        public float initScrollX;                                         // 24시간 차트: 지금 시각 막대를 가운데로 맞추는 가로 위치
        public String ctrSig = "";                                        // 그 막대 내용이 바뀌면 이 값이 바뀐다 — 바뀔 때만 앱이 다시 가운데로 맞춘다
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
        /** 경로 결과 머리줄에서 x(dp) 가 닫기 × 쪽이면 닫기 행동, 아니면 즐겨찾기 행동. */
        public static Act rhdAct(Item it, float x) {
            if (it.on && x >= it.btx - 8f) return it.act2 != null ? it.act2 : it.act;
            return it.act;
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
            if (m.kind == K_RHD) return (m.sw > 0f && x >= m.sx - 6f && x < m.sx + m.sw + 6f && y >= m.sy - 6f && y < m.sy + m.sh + 6f) || (m.on && x >= m.btx - 6f && x < m.btx + RHD_X + 6f && y >= m.bty - 6f && y < m.bty + RHD_X + 6f);      // 머리줄은 두 단추 자리만
            if (m.kind == K_AIH) return m.act != null && x >= m.sx - 6f && x < m.sx + m.sw + 6f && y >= m.sy - 6f && y < m.sy + m.sh + 6f;      // 머리줄은 새로고침 단추만
            if (m.kind == K_BAR) return x >= m.sx - 6f && x < m.sx + m.sw + 6f && y >= m.sy - 6f && y < m.sy + m.sh + 6f;      // 머리줄은 오른쪽 단추만
            if (m.kind == K_MSG) return m.act != null && x >= m.zoneX - 6f && x < m.zoneX + m.zoneW + 6f && y >= m.zoneY - 6f && y < m.zoneY + m.zoneH + 6f;      // 말풍선은 '신고' 글자 자리만
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
        /** 아래 고정 줄(foot)에서 눌린 행동. x·y 는 foot 영역 안 좌표. */
        public Act hitFoot(float x, float y) {
            for (Item m : foot) if (m.act != null && hits(m, x, y)) return m.act;
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

    public static Layout layout(Screen sc, float width, Measurer m) { return layout(sc, width, m, null); }

    /** openKey: 펼쳐 둘 post 의 id. null 이면 엔진이 준 open 표시를 따르고, 빈 글자면 모두 접는다. */
    public static Layout layout(Screen sc, float width, Measurer m, String openKey) {
        Layout L = new Layout();
        L.width = width;
        L.bg = sc.bg;
        // 머리: 칩 줄은 한 줄이라 가로로 놓는다. 머리 노드는 위에서 아래로 쌓는다.
        List<Item> hi = new ArrayList<Item>();
        float y = 0f, contentW = width;
        for (Node n : sc.head) {
            if ("chips".equals(n.t)) {
                float x = n.padL;
                y += n.padT;
                for (Node c : n.items) {
                    Item it = new Item(); it.kind = K_CHIP; it.label = c.label; it.badge = c.badge; it.on = c.on; it.act = c.act;
                    it.size = 12f; it.bold = true; it.ac = col(c.fill.length() > 0 ? c.fill : n.onc, new Col("orange", 0)); it.tc = col(n.tc, new Col("white", 0));
                    it.labelW = m.width(c.label, 12f, true);
                    it.badgeW = c.badge.length() > 0 ? m.width(c.badge, 12f, true) : 0f;
                    it.w = CHIP_PADX * 2 + it.labelW + (c.badge.length() > 0 ? 6f + it.badgeW : 0f);
                    it.h = n.h; it.x = x; it.y = y;
                    hi.add(it); x += it.w + n.gap;
                }
                contentW = Math.max(contentW, x - n.gap + n.padR);
                L.chipsTop = y - n.padT; L.chipsBot = y + n.h + n.padB;
                y += n.h + n.padB;
            } else if ("trk".equals(n.t)) {
                float x = n.padL;
                y += n.padT;
                L.chipsTop = y - n.padT; L.chipsBot = y + TRK_H + n.padB;      // 이 줄이 가로로 밀린다
                int rowFrom = hi.size(); float rowY = y;
                for (Node c : n.items) {
                    Item it = new Item(); it.kind = K_TRK; it.x = x; it.y = y; it.w = c.max; it.h = TRK_H;
                    List<String> nl = wrap(c.name, Math.max(10f, c.max - 4f), c.size, c.bold, 2, m);
                    it.lines = nl.toArray(new String[0]); it.size = c.size; it.bold = c.bold; it.nc = col(c.tc, new Col("text", 0));
                    it.lineH = c.size * 1.25f; it.nameBot = TRK_NAME_H - c.ipB;
                    it.gk = c.tag; it.gsz = c.ssize; it.gx = c.vp; it.gc = col(c.fill, null);
                    if (c.badge.length() > 0) {
                        float avail = c.max - 2f - ("p".equals(c.tag) ? 2f * c.vp : 0f);
                        it.label = ellipsize(c.badge, Math.max(10f, avail), c.ssize, true, m);
                        it.badgeTw = m.width(it.label, c.ssize, true);
                    }
                    it.lc = col(c.line, null); it.rc = col(c.accent, null); it.dk = c.dot; it.dc = col(c.onc, null); it.dc2 = col(c.onl, null);
                    it.time = ellipsize(c.time, c.max - 2f, c.lh, c.big, m); it.timec = col(c.sc, new Col("sub", 0)); it.tsz = c.lh; it.tb = c.big; it.ti = c.cols;
                    hi.add(it); x += c.max;
                }
                contentW = Math.max(contentW, x + n.padR);
                if (n.mk != null && L.mk == null) {                                                  // 내 위치 마커: 칸 가운데 사이 · 점 높이 · (대기면) 배지 자리
                    Mark k = n.mk; Item a = hi.get(rowFrom + k.f), b = hi.get(rowFrom + k.t);
                    k.ccol = col(k.c, null); k.bcol = col(k.bc, null); k.hcol = col(k.hc, null); k.rcol = col(k.ring, null); k.gcol = col(k.bg, null); k.tcol = col(k.btc, null);
                    k.x0 = a.x + a.w / 2f; k.x1 = b.x + b.w / 2f; k.y = rowY + TRK_NAME_H + TRK_BADGE_H + TRK_DOT_Y;
                    if (k.bt.length() > 0) { k.btw = m.width(k.bt, k.bz, true); k.bth = k.bz * 1.25f + 2f; k.bty = rowY + TRK_NAME_H + (TRK_BADGE_H - k.bth) / 2f; }
                    L.mk = k;
                }
                y += TRK_H + n.padB;
            } else if ("chart".equals(n.t)) {                                                      // 24시간 막대 차트: 틀(제목·출처·피크)은 고정, 막대줄만 가로로 밀린다
                y += n.padT;
                float px = n.padL, pw = Math.max(1f, width - n.padL - n.padR), panelY = y;
                float bandY = panelY + CHART_PADT + CHART_HDR_H + CHART_HDR_GAP, innerL = px + CHART_PADL, innerW = px + pw - innerL;
                Item pn = new Item(); pn.kind = K_CHART; pn.x = px; pn.y = panelY; pn.w = pw; pn.fixed = true;
                pn.h = CHART_PADT + CHART_HDR_H + CHART_HDR_GAP + n.bh + CHART_SCROLL_PB + CHART_PADB; pn.radius = 11f;
                pn.t3 = n.name.length() > 0 ? n.name : ""; pn.f2 = n.name.length() > 0 ? m.width(n.name, CHART_HDR, true) : 0f;
                float titleW = m.width(n.title, CHART_HDR, false), srcRoom = pw - CHART_PADL - CHART_R - titleW - pn.f2 - 12f;
                pn.t1 = n.title; pn.f1 = titleW; pn.t2 = (n.sub.length() > 0 && srcRoom >= 20f) ? ellipsize(n.sub, srcRoom, CHART_SRC, false, m) : "";
                pn.ac = col(n.onc, new Col("gold", 0));
                hi.add(pn);
                float spacer = Math.max(0f, innerW / 2f - CHART_COL_W / 2f), bx = innerL + spacer;
                float centerX = Float.NaN;
                for (int bi = 0; bi < n.items.size(); bi++) {
                    Node c = n.items.get(bi);
                    Item it = new Item(); it.kind = K_HBAR; it.x = bx; it.y = bandY; it.w = CHART_COL_W; it.h = n.bh;
                    it.label = c.label; it.f1 = c.max; it.fill = col(c.fill, null); it.alpha = c.alpha; it.on = c.on; it.top = c.top; it.ac = col(n.tc, new Col(null, 0xFFFFFFFF)); it.f3 = innerL;
                    it.f2 = n.bh;
                    if (bi == n.ci) centerX = bx + CHART_COL_W / 2f;
                    hi.add(it); bx += CHART_COL_W;
                }
                contentW = Math.max(contentW, bx + spacer);
                if (!n.items.isEmpty()) { L.chipsTop = bandY; L.chipsBot = bandY + n.bh + CHART_SCROLL_PB; }
                L.ctrSig = n.key; L.initScrollX = Float.isNaN(centerX) ? 0f : Math.max(0f, centerX - (innerL + innerW / 2f));
                y += pn.h + n.padB;
            } else {
                int from = hi.size();
                y = stack(n, 0f, width, y, hi, m, openKey);
                for (int q = from; q < hi.size(); q++) hi.get(q).fixed = true;
            }
        }
        L.head = hi.toArray(new Item[0]); L.headH = y; L.headContentW = contentW;
        // 본문
        List<Item> bi = new ArrayList<Item>();
        y = 0f;
        for (Node n : sc.body) y = stack(n, 0f, width, y, bi, m, openKey);
        L.body = bi.toArray(new Item[0]); L.bodyH = y;
        // 아래 고정 줄
        List<Item> fi = new ArrayList<Item>();
        y = 0f;
        for (Node n : sc.foot) y = stack(n, 0f, width, y, fi, m, openKey);
        L.foot = fi.toArray(new Item[0]); L.footH = y;
        L.headMaxB = maxB(L.head); L.bodyMaxB = maxB(L.body);
        return L;
    }
    private static float[] maxB(Item[] it) {
        float[] r = new float[it.length]; float mx = -1e9f;
        for (int i = 0; i < it.length; i++) { mx = Math.max(mx, it[i].y + it[i].h); r[i] = mx; }
        return r;
    }

    private static String t0(Node n) { return n.t; }

    /** 색 이름/CSS → Col. 비었으면 null(그리지 않는다). 못 읽는 CSS 는 def. */
    static Col col(String s, Col def) {
        if (s == null || s.length() == 0) return def;
        if (role(s)) return new Col(s, 0);
        return new Col(null, color(s, 0xFFFF00FF));
    }

    /** 줄마다 굵은 구간/아닌 구간 조각으로 나눈다(그릴 때 새 글자를 안 만들도록 미리). 줄은 원문 안에서 차례로 찾는다. 못 찾는 줄(… 으로 줄인 줄)은 굵기 없이. */
    private static void richSegs(Item it, String s, int[][] hl, String[] hlc) {
        int nl = it.lines.length;
        it.segs = new String[nl][]; it.segBold = new boolean[nl][];
        boolean anyCol = false;
        if (hlc != null) for (String c : hlc) if (c != null && c.length() > 0) anyCol = true;
        if (anyCol) it.segCol = new Col[nl][];
        int cur = 0;
        for (int k = 0; k < nl; k++) {
            String ln = it.lines[k];
            int st = ln.length() == 0 ? cur : s.indexOf(ln, cur);
            if (st < 0) { it.segs[k] = new String[] { ln }; it.segBold[k] = new boolean[] { false }; if (anyCol) it.segCol[k] = new Col[] { null }; continue; }
            int en = st + ln.length();
            cur = en;
            List<String> ps = new ArrayList<String>(); List<Boolean> bs = new ArrayList<Boolean>(); List<Col> cs = new ArrayList<Col>();
            int pos = st;
            for (int hi = 0; hi < hl.length; hi++) {
                int[] h = hl[hi];
                int a = Math.max(st, h[0]), b = Math.min(en, h[1]);
                if (b <= a) continue;
                if (a > pos) { ps.add(s.substring(pos, a)); bs.add(Boolean.FALSE); cs.add(null); }
                ps.add(s.substring(a, b)); bs.add(Boolean.TRUE); pos = b;
                cs.add(anyCol && hlc[hi] != null && hlc[hi].length() > 0 ? col(hlc[hi], null) : null);
            }
            if (pos < en) { ps.add(s.substring(pos, en)); bs.add(Boolean.FALSE); cs.add(null); }
            if (ps.isEmpty()) { ps.add(ln); bs.add(Boolean.FALSE); cs.add(null); }
            if (anyCol) it.segCol[k] = cs.toArray(new Col[0]);
            it.segs[k] = ps.toArray(new String[0]);
            it.segBold[k] = new boolean[bs.size()];
            for (int q = 0; q < bs.size(); q++) it.segBold[k][q] = bs.get(q);
        }
    }

    /** 노드 하나를 y 에서부터 쌓고 다음 y 를 돌려준다. x0 = 이 노드를 담는 칸의 왼쪽(패널 안이면 패널 안쪽), width = 그 칸의 폭. */
    private static float stack(Node n, float x0, float width, float y, List<Item> out, Measurer m, String ok) {
        float innerW = Math.max(1f, width - n.padL - n.padR);
        float ox = x0 + n.padL;
        if ("spacer".equals(n.t)) return y + n.h;
        if ("swap".equals(n.t)) {                                                    // 두 줄의 경계 한가운데에 얹히는 동그란 단추 — 높이를 차지하지 않는다
            float d = n.size;
            Item it = new Item(); it.kind = K_SWAP; it.w = d; it.h = d; it.x = x0 + (width - d) / 2f; it.y = y - d / 2f; it.act = n.act; it.radius = d / 2f;
            it.fill = col(n.fill, new Col(null, 0xFF0A84FF)); it.line = col(n.line, new Col("bg", 0)); it.tc = col(n.tc, new Col("white", 0)); it.pathOps = n.pathOps;
            out.add(it);
            return y;
        }
        y += n.padT;
        if ("rhd".equals(n.t)) {                                                     // 경로 결과 머리줄: 분 숫자 · 단위 · 구간명 (+ 즐겨찾기 알약) (+ 닫기 ×)
            boolean isMsg = n.name.length() > 0 && n.title.length() == 0;
            float numW = isMsg ? 0f : m.width(n.title, RHD_NUM, true), unitW = (!isMsg && n.badge.length() > 0) ? m.width(n.badge, RHD_UNIT, false) : 0f;
            float favW = n.label.length() > 0 ? m.width(n.label, RHD_BTN, true) + RHD_BTN_PX * 2f + 2f : 0f;
            float xW = n.bact != null ? RHD_X : 0f;
            float unitX = ox + numW + 5f, routeX = isMsg ? ox : unitX + unitW + 13f;
            float rightW = (favW > 0f ? favW + 8f : 0f) + (xW > 0f ? xW + 4f : 0f);
            float avail = ox + innerW - rightW - routeX - 8f;
            String route = isMsg ? ellipsize(n.name, Math.max(30f, avail), RHD_MSG, true, m) : (n.s.length() > 0 && avail >= 30f ? ellipsize(n.s, avail, RHD_ROUTE, false, m) : "");
            Item it = new Item(); it.kind = K_RHD; it.x = ox; it.y = y; it.w = innerW; it.h = RHD_H;
            it.lines = new String[] { n.title }; it.size = RHD_NUM; it.bold = true; it.textX = ox;
            it.label = isMsg ? "" : n.badge; it.size2 = RHD_UNIT; it.tagX = unitX;
            it.go = route; it.zoneX = routeX; it.tag = isMsg ? "m" : "";
            it.on = n.bact != null;
            if (favW > 0f) { it.badge = n.label; it.sw = favW; it.sh = RHD_BTN_H; it.sx = ox + innerW - xW - (xW > 0f ? 4f : 0f) - favW; it.sy = y + (RHD_H - RHD_BTN_H) / 2f; }
            if (xW > 0f) { it.btx = ox + innerW - xW; it.bty = y + (RHD_H - RHD_X) / 2f; }
            it.act = n.act != null ? n.act : n.bact; it.act2 = n.act != null ? n.bact : null;
            out.add(it);
            return y + RHD_H + n.padB;
        }
        if ("aih".equals(n.t)) {                                                     // AI 승무원 머리줄: 제목(굵게, 한 줄) · 카운트다운 알약 · 새로고침 단추
            float pw = n.until > 0L ? m.width("00:00", AIH_PILL, true) + AIH_PILL_PX * 2f : 0f;
            float titleW = Math.max(40f, innerW - AIH_BTN_W - AIH_GAP - (pw > 0f ? pw + AIH_GAP : 0f));
            Item it = new Item(); it.kind = K_AIH; it.x = ox; it.y = y; it.w = innerW; it.h = AIH_H;
            it.lines = new String[] { ellipsize(n.s, titleW, AIH_TITLE, true, m) }; it.size = AIH_TITLE; it.bold = true; it.textX = ox;
            it.label = n.label; it.ln = n.until; it.f1 = pw; it.f2 = ox + innerW - AIH_BTN_W - AIH_GAP;
            it.fill = col(n.fill, new Col(null, 0x1F2F7CF6)); it.tc = col(n.tc, new Col(null, 0xFF2F7CF6));
            it.on = n.on; it.pathOps = n.pathOps; it.act = n.act;
            it.sx = ox + innerW - AIH_BTN_W; it.sy = y; it.sw = AIH_BTN_W; it.sh = AIH_H;
            out.add(it);
            return y + AIH_H + n.padB;
        }
        if ("lth".equals(n.t)) {                                                     // '실시간 대화' 머리줄
            Item it = new Item(); it.kind = K_LTH; it.x = ox; it.y = y; it.w = innerW; it.h = LTH_H;
            float tx = ox + LTH_DOT + LTH_GAP, tw = m.width(n.s, LTH_TITLE, true);
            float cw = n.sub.length() > 0 ? m.width(n.sub, LTH_TITLE, false) + 4f : 0f;
            it.t1 = ellipsize(n.s, Math.max(30f, innerW - LTH_DOT - LTH_GAP - cw), LTH_TITLE, true, m); it.f1 = tx;
            it.t2 = n.sub; it.f2 = tx + Math.min(tw, Math.max(30f, innerW - LTH_DOT - LTH_GAP - cw)) + 4f;
            it.dotC = col(n.dot, new Col(null, 0xFFFF3B30)); it.act = n.act;
            out.add(it);
            return y + LTH_H + n.padB;
        }
        if ("ltr".equals(n.t)) {                                                     // '실시간 대화' 한 줄
            Item it = new Item(); it.kind = K_LTR; it.x = ox; it.y = y; it.w = innerW; it.h = LTR_H;
            float timeW = n.time.length() > 0 ? m.width(n.time, LTR_TIME, false) : 0f;
            String nk = n.nick.length() > 0 ? ellipsize(n.nick, LTR_NICK_MAX, LTR_NICK, true, m) : "";
            float nw = nk.length() > 0 ? m.width(nk, LTR_NICK, true) : 0f;
            float tx = ox + (nw > 0f ? nw + LTR_GAP : 0f), avail = Math.max(20f, innerW - (nw > 0f ? nw + LTR_GAP : 0f) - (timeW > 0f ? timeW + LTR_GAP : 0f));
            it.t1 = nk; it.t2 = ellipsize(n.s, avail, LTR_TXT, false, m); it.f1 = tx;
            it.label = n.time; it.f2 = ox + innerW - timeW; it.tc = col(n.tc, new Col("gold", 0));
            out.add(it);
            return y + LTR_H + n.padB;
        }
        if ("cgh".equals(n.t)) {                                                     // 혼잡도 머리줄: 왼쪽 '지하철 강남'(이름은 굵은 금색) + 작은 글 · 오른쪽 혼잡 단계 글자
            float stW = n.s.length() > 0 ? m.width(n.s, CGH_ST, true) : 0f;
            float avail = Math.max(40f, innerW - stW - (stW > 0f ? CGH_GAP : 0f));
            String lab = n.label.length() > 0 ? n.label + " " : "";
            float labW = lab.length() > 0 ? m.width(lab, CGH_NAME, false) : 0f;
            Item it = new Item(); it.kind = K_CGH; it.x = ox; it.y = y; it.w = innerW; it.h = CGH_H;
            it.t1 = lab; it.f1 = labW; it.t2 = ellipsize(n.name, Math.max(20f, avail - labW), CGH_NAME, true, m);
            it.t3 = n.sub.length() > 0 ? ellipsize(n.sub, avail, CGH_META, false, m) : "";
            it.label = n.s; it.f2 = stW; it.sc = col(n.tc, new Col("sub", 0));
            out.add(it);
            return y + CGH_H + n.padB;
        }
        if ("gauge".equals(n.t)) {                                                   // 혼잡도 게이지
            Item it = new Item(); it.kind = K_GAUGE; it.x = ox; it.y = y; it.w = innerW; it.h = GAUGE_H;
            it.label = n.label; it.value = n.value; it.f1 = n.val / 100f; it.f2 = n.value.length() > 0 ? m.width(n.value, GAUGE_LBL, false) : 0f;
            it.ac = col(n.fill, new Col(null, 0xFF34C759));
            out.add(it);
            return y + GAUGE_H + n.padB;
        }
        if ("cars".equals(n.t)) {                                                    // 칸별 혼잡: 제목 + 칸 가로줄(칸마다 테두리 색 · 글 세 줄) / 칸이 없으면 안내 글
            Item it = new Item(); it.kind = K_CARS; it.x = ox; it.y = y; it.w = innerW;
            boolean hasTtl = n.title.length() > 0;
            it.t1 = hasTtl ? ellipsize(n.title, innerW, CARS_TTL, false, m) : "";
            float top = hasTtl ? CARS_TTL_H + CARS_TTL_GAP : 0f;
            it.f2 = top;
            int cn = n.items.size();
            if (cn > 0) {
                it.f1 = (innerW - CARS_GAP * (cn - 1)) / cn; it.f3 = CARS_CELL_H;
                it.sa = new String[cn * 3]; it.ca = new Col[cn];
                for (int i = 0; i < cn; i++) {
                    Node c = n.items.get(i);
                    float cw = Math.max(10f, it.f1 - 8f);
                    it.sa[i * 3] = ellipsize(c.name, cw, 11f, true, m); it.sa[i * 3 + 1] = ellipsize(c.label, cw, 10f, false, m); it.sa[i * 3 + 2] = ellipsize(c.badge, cw, 10f, false, m);
                    it.ca[i] = col(c.fill, new Col(null, 0xFF34C759));
                }
                it.h = top + CARS_CELL_H;
            } else { it.value = n.value; it.h = top + CARS_MSG_H; }
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("sug".equals(n.t)) {                                                     // 자동완성 한 줄: 종류 딱지 + 이름(굵게) + 작은 글 (+ 오른쪽 작은 단추)
            float pillW = n.badge.length() > 0 ? m.width(n.badge, SUG_BADGE, true) + SUG_PILL_PX * 2f : 0f;
            float sbw = n.label.length() > 0 ? m.width(n.label, SUG_BTN, true) + SUG_BTN_PADX * 2f : 0f;
            float nx = ox + SUG_PADX + (pillW > 0f ? pillW + SUG_GAP : 0f), avail = Math.max(30f, ox + innerW - SUG_PADX - nx - (sbw > 0f ? sbw + SUG_GAP : 0f));
            String nm = ellipsize(n.name, avail, SUG_NAME, true, m);
            float nw = m.width(nm, SUG_NAME, true);
            String sb = n.sub.length() > 0 && avail - nw - SUG_GAP >= 24f ? ellipsize(n.sub, avail - nw - SUG_GAP, SUG_SUB, false, m) : "";
            Item it = new Item(); it.kind = K_SUG; it.x = ox; it.y = y; it.w = innerW; it.h = SUG_H; it.act = n.act; it.on = n.on;
            it.badge = n.badge; it.badgeW = pillW; it.bx = ox + SUG_PADX;
            it.lines = new String[] { nm }; it.size = SUG_NAME; it.bold = true; it.textX = nx;
            it.label = sb; it.size2 = SUG_SUB; it.tagX = nx + nw + SUG_GAP;
            it.ac = col(n.accent, new Col("sub", 0));
            if (sbw > 0f) { it.go = n.label; it.act2 = n.bact; it.sw = sbw; it.sh = SUG_BTN_H; it.btx = ox + innerW - SUG_PADX - sbw; it.bty = y + (SUG_H - SUG_BTN_H) / 2f; }
            out.add(it);
            return y + SUG_H + n.padB;
        }
        if ("text".equals(n.t)) {
            boolean rich = n.hl.length > 0;
            List<String> ls = wrap(n.s, innerW, n.size, n.bold || rich, n.maxLines, m);        // 굵은 구간이 있으면 줄바꿈은 굵은 폭으로 잰다(넘치지 않게)
            Item it = new Item(); it.kind = K_TEXT; it.x = ox; it.y = y; it.w = innerW;
            it.lines = ls.toArray(new String[0]); it.size = n.size; it.bold = n.bold; it.color = n.color; it.alpha = n.alpha; it.align = n.align;
            it.lineH = n.size * n.lh; it.h = it.lineH * ls.size(); it.textX = ox; it.textY = y;
            if (rich) richSegs(it, n.s, n.hl, n.hlc);
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
            it.fill = col(n.fill, null); it.line = col(n.line, null); it.tc = col(n.tc, null); it.ac2 = col(n.onc, null);
            if (rich) richSegs(it, n.s, n.hl, n.hlc);
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
        if ("row".equals(n.t)) {                                                     // 같은 폭 칸으로 나란히: 칸마다 stack 으로 쌓고 가장 아래까지가 이 줄의 높이
            int c = Math.max(1, n.kids.size());
            float colW = Math.max(1f, (innerW - n.gap * (c - 1)) / c), maxY = y;
            for (int i = 0; i < n.kids.size(); i++) maxY = Math.max(maxY, stack(n.kids.get(i), ox + i * (colW + n.gap), colW, y, out, m, ok));
            return maxY + n.padB;
        }
        if ("panel".equals(n.t)) {
            Item pn = new Item(); pn.kind = K_PANEL; pn.x = ox; pn.y = y; pn.w = innerW; pn.radius = n.r;
            pn.fill = col(n.fill, null); pn.line = col(n.line, null);
            out.add(pn);
            float cy = y + 1f + n.ipT, cx = ox + 1f + n.ipL, cw = Math.max(1f, innerW - 2f - n.ipL - n.ipR);
            for (Node k : n.kids) cy = stack(k, cx, cw, cy, out, m, ok);
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
            it.key = n.key; it.label = n.hint; it.value = n.value; it.maxlen = n.maxlen; it.size = n.size; it.multi = n.multi;
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
        if ("news".equals(n.t)) {
            float chevW = m.width("\u203A", NEWS_CHEV, false);
            float tx = ox + NEWS_PADX + NEWS_BARW + NEWS_GAP, tw = Math.max(40f, innerW - NEWS_PADX * 2f - NEWS_BARW - NEWS_GAP * 2f - chevW);
            float tlh = NEWS_TITLE * NEWS_LH, slh = NEWS_SUB * NEWS_LH;
            List<String> tl = wrap(n.title, tw, NEWS_TITLE, true, NEWS_MAXLINES, m);
            Item it = new Item(); it.kind = K_NEWS; it.x = ox; it.y = y; it.w = innerW; it.act = n.act;
            it.lines = tl.toArray(new String[0]); it.size = NEWS_TITLE; it.bold = true; it.lineH = tlh;
            it.textX = tx; it.textY = y + NEWS_PADV;
            it.lines2 = n.sub.length() > 0 ? new String[] { ellipsize(n.sub, tw, NEWS_SUB, false, m) } : new String[0]; it.size2 = NEWS_SUB; it.lineH2 = slh;
            it.subY = it.textY + tlh * tl.size() + 4f;
            it.h = NEWS_PADV + tlh * tl.size() + (n.sub.length() > 0 ? 4f + slh : 0f) + NEWS_PADV + 1f;
            it.bx = ox + NEWS_PADX; it.by = y + NEWS_PADV + 2f; it.sh = Math.max(4f, it.h - NEWS_PADV - 1f - (NEWS_PADV + 2f));
            it.tagX = ox + innerW - NEWS_PADX - chevW; it.metaY = y + NEWS_PADV + 3f;
            out.add(it);
            return y + it.h + n.padB;
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
        if ("post".equals(n.t)) {
            boolean open = ok == null ? n.on : ok.equals(n.key);
            Item pn = new Item(); pn.kind = K_PANEL; pn.x = ox; pn.y = y; pn.w = innerW; pn.radius = 12f;
            pn.fill = col(n.fill, null); pn.line = col(n.line, null);
            out.add(pn);
            float hx = ox + 1f, hw = innerW - 2f, hy = y + 1f;
            float badgePw = n.badge.length() > 0 ? m.width(n.badge, POST_BADGE, true) + POST_BADGE_PX * 2f : 0f;
            float lead = badgePw > 0f ? badgePw + POST_BADGE_GAP : 0f;
            float titleW = Math.max(40f, hw - POST_PADX * 2f - lead), tlh = POST_TITLE * POST_TITLE_LH;
            List<String> tl = wrap(n.title, titleW, POST_TITLE, true, 4, m);
            float titleH = Math.max(tl.size() * tlh, badgePw > 0f ? POST_BADGE * 1.4f + 4f : 0f);
            float metaLH = POST_META * 1.4f;
            Item hd = new Item(); hd.kind = K_POSTH; hd.x = hx; hd.y = hy; hd.w = hw; hd.key = n.key; hd.on = open;
            hd.act = new Act(); hd.act.a = "tog"; hd.act.v = n.key;
            hd.lines = tl.toArray(new String[0]); hd.size = POST_TITLE; hd.bold = true; hd.lineH = tlh;
            hd.textX = hx + POST_PADX + lead; hd.textY = hy + POST_PADT;
            hd.badge = n.badge; hd.badgeW = badgePw; hd.bx = hx + POST_PADX; hd.by = hd.textY + 1f; hd.ac = col(n.tc, new Col(null, 0xFF8E8E93));
            hd.tag = n.tag; hd.tagW = n.tag.length() > 0 ? m.width(n.tag, POST_META, true) : 0f; hd.tagX = hx + POST_PADX;
            hd.label = n.sub; hd.size2 = POST_META; hd.lineH2 = metaLH;
            hd.distX = hd.tagX + hd.tagW + (hd.tagW > 0f && n.sub.length() > 0 ? 5f : 0f);
            hd.labelW = Math.max(20f, hx + hw - POST_PADX - hd.distX);
            if (n.sub.length() > 0) hd.label = ellipsize(n.sub, hd.labelW, POST_META, false, m);
            hd.metaY = hd.textY + titleH + POST_META_GAP;
            hd.h = POST_PADT + titleH + POST_META_GAP + metaLH + POST_PADB;
            out.add(hd);
            float cy = hy + hd.h;
            if (open && !n.kids.isEmpty()) {
                Item dv = new Item(); dv.kind = K_DIV; dv.x = hx; dv.y = cy; dv.w = hw; dv.h = 1f; dv.bg = "border2";
                out.add(dv);
                cy += 1f + POST_BODYPAD;
                float kx = hx + POST_BODYPAD, kw = Math.max(40f, hw - POST_BODYPAD * 2f);
                for (Node k : n.kids) cy = stack(k, kx, kw, cy, out, m, ok);
                cy += POST_BODYPAD;
            }
            pn.h = (cy + 1f) - y;
            return y + pn.h + n.padB;
        }
        if ("cmt".equals(t0(n))) {
            float ind = n.ind ? CMT_IND : 0f, w = Math.max(40f, innerW - ind), nlh = CMT_NICK * 1.4f, tlh = CMT_TXT * 1.5f;
            List<String> tl = wrap(n.s, w, CMT_TXT, false, 0, m);
            Item it = new Item(); it.kind = K_CMT; it.x = ox + ind; it.y = y; it.w = w;
            it.tag = (n.ind ? "↳ " : "") + n.nick; it.tagW = m.width(it.tag, CMT_NICK, true);
            it.label = n.time; it.labelW = n.time.length() > 0 ? m.width(n.time, CMT_TIME, false) : 0f;
            it.tagX = it.x + it.tagW + 6f; it.metaY = y;
            it.lines = tl.toArray(new String[0]); it.size = CMT_TXT; it.lineH = tlh; it.size2 = CMT_NICK; it.lineH2 = nlh;
            it.textX = it.x; it.textY = y + nlh + 2f; it.ac = col(n.tc, new Col(null, 0xFF5E5CE6));
            it.h = nlh + 2f + tlh * tl.size();
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("btnrow".equals(t0(n))) {
            float lx = ox, rx = ox + innerW, rowH = n.h, need = 0f;
            int nl = 0, nr = 0;
            for (Node c : n.items) { float bw = m.width(c.label, RBTN_SIZE, true) + RBTN_PADX * 2f + 2f; need += bw; if (c.right) nr++; else nl++; }
            need += n.gap * Math.max(0, nl + nr - 1);
            boolean wrap2 = need > innerW && nr > 0 && nl > 0;      // 좁으면 오른쪽 단추는 둘째 줄로
            float yy = y;
            for (Node c : n.items) {
                float bw = m.width(c.label, RBTN_SIZE, true) + RBTN_PADX * 2f + 2f;
                Item it = new Item(); it.kind = K_RBTN; it.y = (c.right && wrap2) ? y + rowH + 4f : y; it.w = bw; it.h = rowH; it.label = c.label; it.on = c.on; it.act = c.act; it.size = RBTN_SIZE; it.radius = 8f;
                it.fill = col(c.fill, new Col("card2", 0)); it.line = col(c.line, new Col("border2", 0)); it.tc = col(c.tc, new Col("sub", 0));
                if (c.right) { rx -= bw; it.x = rx; rx -= n.gap; }
                else { it.x = lx; lx += bw + n.gap; }
                out.add(it);
            }
            return y + rowH + (wrap2 ? rowH + 4f : 0f) + n.padB;
        }
        if ("inbar".equals(t0(n))) {
            float bsz = n.bsize > 0f ? n.bsize : n.size;
            float btnH = n.bh > 0f ? Math.min(n.bh, n.h) : n.h;
            float btnW = n.bops.length > 0 ? btnH : m.width(n.label, bsz, true) + INBAR_BTN_PADX * 2f;        // 아이콘 단추는 동그라미(가로=세로)
            Item it = new Item(); it.kind = K_INBAR; it.x = ox; it.y = y; it.w = innerW; it.h = n.h; it.radius = n.r;
            it.key = n.key; it.label = n.hint; it.value = n.value; it.maxlen = n.maxlen; it.size = n.size; it.act = n.act; it.badge = n.label;
            it.bold = n.bold; it.size2 = n.bsize > 0f ? n.bsize : 0f; it.watch = n.watch; it.on = n.on; it.act2 = n.bact;
            it.ix = ox; it.iy = y; it.iw = Math.max(40f, innerW - btnW - INBAR_GAP); it.ih = n.h;
            it.btx = ox + innerW - btnW; it.bty = y + (n.h - btnH) / 2f; it.sw = btnW; it.sh = btnH; it.top = n.top; it.pathOps = n.bops;
            it.textX = ox + 14f;
            if (n.dot.length() > 0) { it.dotC = col(n.dot, null); it.bx = ox + 14f + 5f; it.by = y + n.h / 2f; it.textX = ox + 14f + 10f + 10f; }       // 동그라미(지름 10) + 간격 10 → 글자
            it.fill = col(n.fill, null); it.line = col(n.line, null); it.tc = col(n.tc, new Col("text", 0)); it.sc = col(n.sc, new Col("sub", 0));
            it.ac = col(n.onc, new Col("gold", 0)); it.ac2 = col(n.chk, new Col(null, 0xFF121214));
            out.add(it);
            return y + n.h + n.padB;
        }
        if ("msg".equals(t0(n))) {
            float maxBub = innerW * MSG_MAXF, inner = Math.max(30f, maxBub - MSG_PADX * 2f);
            List<String> tl = wrap(n.s, inner, MSG_TXT, false, 0, m);
            float tw = 0f; for (String l : tl) tw = Math.max(tw, m.width(l, MSG_TXT, false));
            float badgeH = n.badge.length() > 0 ? 10f * 1.4f + 2f : 0f, badgeW = n.badge.length() > 0 ? m.width(n.badge, 10f, true) : 0f;
            float bw = Math.min(maxBub, Math.max(tw, badgeW) + MSG_PADX * 2f), lh = MSG_TXT * MSG_LH;
            String nickLine = n.mine ? "" : ellipsize((n.pre.length() > 0 ? n.pre + " " : "") + n.nick, innerW, MSG_NICK, false, m);
            float nickH = nickLine.length() > 0 ? MSG_NICK * 1.35f + 3f : 0f;
            float bubH = MSG_PADY * 2f + badgeH + lh * tl.size(), timeH = 3f + MSG_TIME * 1.35f;
            Item it = new Item(); it.kind = K_MSG; it.y = y; it.w = bw; it.x = n.mine ? ox + innerW - bw : ox; it.on = n.mine; it.act = n.act; it.radius = MSG_RAD;
            it.lines = tl.toArray(new String[0]); it.size = MSG_TXT; it.lineH = lh;
            it.tag = nickLine; it.size2 = MSG_NICK; it.lineH2 = MSG_NICK * 1.35f;
            it.sy = y + nickH; it.sh = bubH;                                    // 말풍선 사각형(위쪽)
            it.badge = n.badge; it.badgeW = badgeW; it.ac = col(n.accent, new Col(null, 0xFFFF453A));
            it.textX = it.x + MSG_PADX; it.textY = it.sy + MSG_PADY + badgeH; it.bx = it.x + MSG_PADX; it.by = it.sy + MSG_PADY;
            it.fill = col(n.fill, new Col("card2", 0)); it.tc = col(n.tc, new Col("text", 0));
            it.label = n.time; it.metaY = it.sy + bubH + 3f; it.labelW = n.time.length() > 0 ? m.width(n.time, MSG_TIME, false) : 0f;
            it.go = (n.act != null && n.title.length() > 0) ? n.title : "";
            if (it.go.length() > 0) {
                float sepW = m.width(" · ", MSG_TIME, false);
                it.zoneX = it.x + it.labelW + sepW; it.zoneW = m.width(it.go, MSG_TIME, false); it.zoneY = it.metaY - 2f; it.zoneH = MSG_TIME * 1.35f + 4f;
                it.btnLX = it.x + it.labelW;
            }
            it.h = nickH + bubH + timeH;
            out.add(it);
            return y + it.h + n.padB;
        }
        if ("tabbar".equals(t0(n))) {
            int cnt = n.items.size();
            float cw = width / cnt;
            for (int k = 0; k < cnt; k++) {
                Node c = n.items.get(k);
                Item it = new Item(); it.kind = K_TAB; it.x = x0 + k * cw; it.y = y; it.w = cw; it.h = n.h; it.act = c.act; it.on = c.on;
                it.label = c.label; it.badge = c.badge; it.pathOps = c.pathOps; it.size = TAB_LABEL;
                it.fill = col(n.fill, new Col("nav", 0)); it.line = col(n.line, new Col("border", 0)); it.ac = col(n.onc, new Col("gold", 0)); it.sc = col(n.sc, new Col("sub", 0));
                it.labelW = m.width(c.label, TAB_LABEL, c.on);
                out.add(it);
            }
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

    // ═════════════ ⑥ 아이콘 경로(SVG path d) ═════════════
    /** 연산 코드: 0 M(x,y) · 1 L(x,y) · 2 C(x1,y1,x2,y2,x,y) · 3 Z. 모두 절대 좌표. */
    public static final int OP_M = 0, OP_L = 1, OP_C = 2, OP_Z = 3, PATH_MAX_OPS = 500;

    private static final class PD {
        final String s; int i = 0;
        float[] out = new float[96]; int n = 0, ops = 0;
        float cx, cy, sx, sy, lcx, lcy;       // 현재점 · 시작점 · 직전 제어점(S/T 용)
        PD(String s) { this.s = s; }
        void put(float v) { if (n == out.length) out = java.util.Arrays.copyOf(out, n * 2); out[n++] = v; }
        void op(int c, float... a) throws ParseError {
            if (++ops > PATH_MAX_OPS) throw new ParseError("경로가 너무 길다");
            put(c); for (float v : a) put(v);
        }
        void skipSep() { while (i < s.length()) { char c = s.charAt(i); if (c == ' ' || c == ',' || c == '\n' || c == '\t' || c == '\r') i++; else break; } }
        boolean hasNum() { skipSep(); if (i >= s.length()) return false; char c = s.charAt(i); return c == '-' || c == '+' || c == '.' || (c >= '0' && c <= '9'); }
        float num() throws ParseError {
            skipSep();
            int st = i;
            if (i < s.length() && (s.charAt(i) == '-' || s.charAt(i) == '+')) i++;
            boolean dot = false, dig = false;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') { dig = true; i++; }
                else if (c == '.' && !dot) { dot = true; i++; }
                else break;
            }
            if (!dig) throw new ParseError("경로: 수가 아니다 @" + st);
            if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                int sv = i; i++;
                if (i < s.length() && (s.charAt(i) == '-' || s.charAt(i) == '+')) i++;
                int ds = i; while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
                if (ds == i) i = sv;
            }
            try { float f = Float.parseFloat(s.substring(st, i)); if (Float.isNaN(f) || Float.isInfinite(f) || Math.abs(f) > 5000f) throw new ParseError("경로: 수 범위"); return f; }
            catch (NumberFormatException e) { throw new ParseError("경로: 수"); }
        }
        boolean flag() throws ParseError {
            skipSep();
            if (i >= s.length()) throw new ParseError("경로: 플래그");
            char c = s.charAt(i++);
            if (c == '0') return false; if (c == '1') return true;
            throw new ParseError("경로: 호 플래그");
        }
    }

    /** SVG 경로 문자열 d → 절대 좌표 연산 배열. M/L/H/V/C/S/Q/T/A/Z(대소문자) 를 읽는다. 틀리면 ParseError. 빈 글이면 빈 배열. */
    public static float[] pathOps(String d) throws ParseError {
        if (d == null || d.trim().length() == 0) return new float[0];
        if (d.length() > 900) throw new ParseError("경로가 너무 길다");
        PD p = new PD(d);
        char cmd = 0; boolean first = true;
        while (true) {
            p.skipSep();
            if (p.i >= d.length()) break;
            char c = d.charAt(p.i);
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) { cmd = c; p.i++; if (cmd == 'z' || cmd == 'Z') { p.op(OP_Z); p.cx = p.sx; p.cy = p.sy; p.lcx = p.cx; p.lcy = p.cy; first = false; continue; } }
            else if (cmd == 0) throw new ParseError("경로: 명령이 없다");
            else if (!p.hasNum()) throw new ParseError("경로: 뜻밖의 글자");
            if (first && cmd != 'M' && cmd != 'm') throw new ParseError("경로: M 으로 시작해야 한다");
            first = false;
            boolean rel = cmd >= 'a';
            char u = Character.toUpperCase(cmd);
            float ox = rel ? p.cx : 0f, oy = rel ? p.cy : 0f;
            switch (u) {
                case 'M': {
                    float x = p.num() + ox, y = p.num() + oy;
                    p.op(OP_M, x, y); p.cx = p.sx = x; p.cy = p.sy = y; p.lcx = x; p.lcy = y;
                    cmd = rel ? 'l' : 'L';                         // M 뒤 짝은 L
                    break;
                }
                case 'L': { float x = p.num() + ox, y = p.num() + oy; p.op(OP_L, x, y); p.cx = x; p.cy = y; p.lcx = x; p.lcy = y; break; }
                case 'H': { float x = p.num() + ox; p.op(OP_L, x, p.cy); p.cx = x; p.lcx = p.cx; p.lcy = p.cy; break; }
                case 'V': { float y = p.num() + oy; p.op(OP_L, p.cx, y); p.cy = y; p.lcx = p.cx; p.lcy = p.cy; break; }
                case 'C': {
                    float x1 = p.num() + ox, y1 = p.num() + oy, x2 = p.num() + ox, y2 = p.num() + oy, x = p.num() + ox, y = p.num() + oy;
                    p.op(OP_C, x1, y1, x2, y2, x, y); p.lcx = x2; p.lcy = y2; p.cx = x; p.cy = y; break;
                }
                case 'S': {
                    float x2 = p.num() + ox, y2 = p.num() + oy, x = p.num() + ox, y = p.num() + oy;
                    float x1 = 2f * p.cx - p.lcx, y1 = 2f * p.cy - p.lcy;
                    p.op(OP_C, x1, y1, x2, y2, x, y); p.lcx = x2; p.lcy = y2; p.cx = x; p.cy = y; break;
                }
                case 'Q': {
                    float qx = p.num() + ox, qy = p.num() + oy, x = p.num() + ox, y = p.num() + oy;
                    quad(p, qx, qy, x, y); break;
                }
                case 'T': {
                    float x = p.num() + ox, y = p.num() + oy;
                    quad(p, 2f * p.cx - p.lcx, 2f * p.cy - p.lcy, x, y); break;
                }
                case 'A': {
                    float rx = p.num(), ry = p.num(), rot = p.num(); boolean fa = p.flag(), fs = p.flag();
                    float x = p.num() + ox, y = p.num() + oy;
                    arc(p, p.cx, p.cy, rx, ry, rot, fa, fs, x, y); p.cx = x; p.cy = y; p.lcx = x; p.lcy = y; break;
                }
                default: throw new ParseError("경로: 모르는 명령 " + cmd);
            }
        }
        if (p.ops == 0) throw new ParseError("경로: 비었다");
        return java.util.Arrays.copyOf(p.out, p.n);
    }
    private static void quad(PD p, float qx, float qy, float x, float y) throws ParseError {
        float c1x = p.cx + 2f / 3f * (qx - p.cx), c1y = p.cy + 2f / 3f * (qy - p.cy), c2x = x + 2f / 3f * (qx - x), c2y = y + 2f / 3f * (qy - y);
        p.op(OP_C, c1x, c1y, c2x, c2y, x, y); p.lcx = qx; p.lcy = qy; p.cx = x; p.cy = y;
    }
    private static double ang(double ux, double uy, double vx, double vy) {
        double a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        return a;
    }
    /** SVG 호 → 3차 곡선 조각들. */
    private static void arc(PD p, float x1, float y1, float rx, float ry, float rotDeg, boolean fa, boolean fs, float x2, float y2) throws ParseError {
        if (x1 == x2 && y1 == y2) return;
        rx = Math.abs(rx); ry = Math.abs(ry);
        if (rx == 0f || ry == 0f) { p.op(OP_L, x2, y2); return; }
        double phi = Math.toRadians(rotDeg), cp = Math.cos(phi), sp = Math.sin(phi);
        double dx2 = (x1 - x2) / 2.0, dy2 = (y1 - y2) / 2.0;
        double x1p = cp * dx2 + sp * dy2, y1p = -sp * dx2 + cp * dy2;
        double lam = (x1p * x1p) / ((double) rx * rx) + (y1p * y1p) / ((double) ry * ry);
        if (lam > 1.0) { double sl = Math.sqrt(lam); rx = (float) (rx * sl); ry = (float) (ry * sl); }
        double rx2 = (double) rx * rx, ry2 = (double) ry * ry;
        double num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p, den = rx2 * y1p * y1p + ry2 * x1p * x1p;
        double coef = (fa == fs ? -1.0 : 1.0) * Math.sqrt(Math.max(0.0, num / den));
        double cxp = coef * (rx * y1p / ry), cyp = coef * (-ry * x1p / rx);
        double cx = cp * cxp - sp * cyp + (x1 + x2) / 2.0, cy = sp * cxp + cp * cyp + (y1 + y2) / 2.0;
        double th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        double dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
        if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
        int segs = (int) Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9); if (segs < 1) segs = 1;
        double delta = dth / segs, t = 4.0 / 3.0 * Math.tan(delta / 4.0), a = th1;
        for (int k = 0; k < segs; k++) {
            double c1 = Math.cos(a), s1 = Math.sin(a), a2 = a + delta, c2 = Math.cos(a2), s2 = Math.sin(a2);
            double[] e1 = { c1 - t * s1, s1 + t * c1 }, e2 = { c2 + t * s2, s2 - t * c2 }, e3 = { c2, s2 };
            float[] o = new float[6];
            double[][] pts = { e1, e2, e3 };
            for (int q = 0; q < 3; q++) {
                double ex = pts[q][0] * rx, ey = pts[q][1] * ry;
                o[q * 2] = (float) (cp * ex - sp * ey + cx); o[q * 2 + 1] = (float) (sp * ex + cp * ey + cy);
            }
            if (k == segs - 1) { o[4] = x2; o[5] = y2; }
            p.op(OP_C, o[0], o[1], o[2], o[3], o[4], o[5]);
            a = a2;
        }
    }

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
