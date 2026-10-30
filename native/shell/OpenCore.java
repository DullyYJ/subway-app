package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 오프닝 화면의 계산(순수 자바 — 안드로이드를 쓰지 않아 JVM 에서 시험한다). 2026-10-29 s299.
 *
 * 앱을 켜면 길동무 친구들이 2초쯤 나와 인사한다(시간대 7칸 · 칸마다 다른 짧은 움직임). 무엇을 어떻게 움직일지는 엔진(engine/open.js)이 정한 대본이고,
 * 네트워크를 기다리지 않으려고 그 대본을 앱 assets/open.json 에 넣어 두었다. 이 클래스는 그 JSON 을 읽어
 *   ① 지금 시(時)가 속한 칸을 찾고(자정을 넘기는 23-07 포함) ② 켤 때마다 8마리 중 셋을 무작위로 고르고(방금 나온 조합은 피한다) ③ 칸의 자리별 연기를 그 셋에 입히고
 *   ④ 시각 t(ms)에서 친구마다 어디서 무엇을 하는지 돌려준다.
 * 글·색·움직임은 모두 대본에 있다 — 여기에는 없다.
 */
public final class OpenCore {
    private OpenCore() {}

    public static final class Seg { public double t0, t1, x0, x1, hop, hz; public boolean arc; public String k = "pose", say = "", fx = ""; public int p, f = 1; }
    public static final class Actor {
        public String id = ""; public Seg[] tr = new Seg[0];
        public int row;                                  // s338 전원 인사: 줄(0 앞 · 1 가운데 · 2 뒤) — 오프닝은 늘 0
        public double scale = 1, gap, arrive;            // 친구 키 배율 · 줄 간격(친구 키의 배수) · 자리에 닿는 시각(ms · 전원 인사의 등장이 끝나는 때) — 오프닝은 1 · 0 · 0
        public String say = ""; public double sayAt = -1;     // 자기 차례에 하는 인사(전원 인사) — 동작 구간과 따로 시각을 정한다
    }
    /** 자리(왼쪽·가운데·오른쪽)마다의 연기 — 누가 서든 이 연기를 한다. t0 은 나타나는 시각. */
    public static final class Role { public double t0, hop, hz; public int p; public String say = "", fx = ""; }
    /** 전원 인사(s338)에서 한 칸의 모두의 모습: 친구별 인사 · 자세 · 콩콩 · 효과 · 전용 동작(죽순이·뽀송). */
    public static final class AllLook { public Map<String, String> say = new java.util.HashMap<String, String>(); public int p; public double hop, hz = 2; public String fx = ""; public Map<String, Seg[]> special = new java.util.HashMap<String, Seg[]>(); }
    /** 전원 인사에서 친구 한 마리의 등장(s339): 시작 x(NaN 이면 자기 자리에서) · 시작 시각 · 걷는 빠르기(화면 폭/초) 또는 정해진 시간 · 콩콩/포물선 · 동작·자세·효과. */
    public static final class Enter { public double from = Double.NaN, t0, speed, dur, hop, hz = 2; public boolean arc; public String k = "walk", fx = ""; public int p; }
    /** 전원 인사의 판: 길이 · 사라짐 · 첫 인사 · 인사 간격 · 친구 키 · 줄 간격 · 자리(x · 줄) · 인사 차례(자리 번호) · 친구별 등장. */
    public static final class All { public int dur = 10100, fade = 700; public double t0 = 2800, step = 700, scale = .82, gap = .72; public double[] sx = new double[0]; public int[] sr = new int[0], order = new int[0]; public Map<String, Enter> enter = new java.util.HashMap<String, Enter>(); }
    public static final class Slot {
        public String id = "", ko = "", kind = "pose", fx = ""; public boolean dark;
        public AllLook all;                              // 전원 인사 대본(없으면 null)
        public double h0, h1;
        public int sky0, sky1, sky2, ground, hill;
        public int bg, ink;          // 칸이 정한 화면 바탕 · 제목 글 색(0xFFRRGGBB) — 0 이면 대본(Script)의 bg · ink (밤 칸만 어두운 바탕 · 밝은 글)
        public double[] sun;        // {x, y 처음, y 끝, 반지름(판 폭 비), 색(0xAARRGGBB 를 double 로)} · 없으면 null
        public double[] moon;       // {x, y, 반지름} · 없으면 null
        public int stars, clouds;
        public Role[] roles = new Role[0];
        public Map<String, Seg[]> special = new java.util.HashMap<String, Seg[]>();
    }
    public static final class Script {
        public int dur = 2700, fade = 700; public String brand = ""; public int bg = 0xFFFAF9F7, ink = 0xFF2B2F4A;
        public String[] chars = new String[0]; public Map<String, String> names = new java.util.HashMap<String, String>(); public double[] x = {.30, .50, .70}, xs = {.27, .50, .73};
        public Slot[] slots = new Slot[0];
        public Map<String, Wx> wx = new java.util.HashMap<String, Wx>();
        public All all;                                  // 전원 인사 판(없으면 null)
    }
    /** 날씨 한 종류(엔진 대본 wx): 하늘·땅에 섞을 색(낮/밤) · 정도 · 해/달/별 가림 · 구름 수 · 비·눈·안개 효과 · 땅 색 바꿈(눈). */
    public static final class Wx { public int tintDay, tintNight, ground, hill; public double a, ga; public boolean sun = true, hasGround; public int clouds; public String fx = ""; }

    /** 친구 한 마리의 지금 모습. on=false 면 아직 안 나왔다. */
    public static final class St {
        public boolean on; public String id = "", k = "pose", say = "", fx = "";
        public double x, hop, tSec, segT, alpha = 1, sayA;      // x: 화면 폭의 0~1 · hop: 키의 몇 배 위로 떠 있는가 · tSec: 이 동작이 시작한 뒤(초) · alpha: 나타남(0~1) · sayA: 말풍선 진하기
        public int face = 1, pose;
    }

    // ───────────── 읽기 ─────────────
    @SuppressWarnings("unchecked")
    public static Script parse(String json) {
        try {
            Object o = SceneModel.Json.parse(json);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            Script sc = new Script(); sc.dur = (int) num(m.get("dur"), 2700); sc.fade = (int) num(m.get("fade"), 700); sc.brand = SceneModel.Json.strOr(m.get("brand"), "");
            if (m.get("bg") instanceof String) sc.bg = col(m.get("bg"));
            if (m.get("ink") instanceof String) sc.ink = col(m.get("ink"));
            sc.x = three(m.get("x"), sc.x); sc.xs = three(m.get("xs"), sc.xs);
            Object wo = m.get("wx");
            if (wo instanceof Map) for (Map.Entry<String, Object> en : ((Map<String, Object>) wo).entrySet()) {
                if (!(en.getValue() instanceof Map)) continue;
                Map<String, Object> q = (Map<String, Object>) en.getValue(); Wx w = new Wx(); Object ti = q.get("tint");
                if (!(ti instanceof List) || ((List<Object>) ti).size() < 2) continue;
                w.tintDay = col(((List<Object>) ti).get(0)); w.tintNight = col(((List<Object>) ti).get(1)); w.a = num(q.get("a"), 0);
                w.sun = !Boolean.FALSE.equals(q.get("sun")); w.clouds = (int) num(q.get("clouds"), 0); w.fx = SceneModel.Json.strOr(q.get("fx"), "");
                if (q.get("ground") instanceof String) { w.hasGround = true; w.ground = col(q.get("ground")); w.hill = col(q.get("hill")); w.ga = num(q.get("ga"), 0.8); }
                sc.wx.put(en.getKey(), w);
            }
            Object co = m.get("chars"); List<String> cl = new ArrayList<String>();
            if (co instanceof List) for (Object c : (List<Object>) co) if (c instanceof String && ((String) c).length() > 0 && !cl.contains(c)) cl.add((String) c);
            if (cl.size() < 3) return null;
            sc.chars = cl.toArray(new String[0]);
            Object no = m.get("names");
            if (no instanceof Map) for (Map.Entry<String, Object> en : ((Map<String, Object>) no).entrySet()) if (en.getValue() instanceof String) sc.names.put(en.getKey(), (String) en.getValue());
            sc.all = parseAll(m.get("all"));
            Object so = m.get("slots"); if (!(so instanceof List)) return null;
            List<Slot> out = new ArrayList<Slot>();
            for (Object e : (List<Object>) so) {
                if (!(e instanceof Map)) continue;
                Map<String, Object> s = (Map<String, Object>) e; Slot sl = new Slot();
                sl.dark = Boolean.TRUE.equals(s.get("dark")); sl.id = SceneModel.Json.strOr(s.get("id"), ""); sl.ko = SceneModel.Json.strOr(s.get("ko"), ""); sl.kind = "sleep".equals(SceneModel.Json.strOr(s.get("kind"), "pose")) ? "sleep" : "pose";
                sl.h0 = num(s.get("h0"), 0); sl.h1 = num(s.get("h1"), 0);
                Object sk = s.get("sky");
                if (sk instanceof List && ((List<Object>) sk).size() >= 3) { List<Object> k = (List<Object>) sk; sl.sky0 = col(k.get(0)); sl.sky1 = col(k.get(1)); sl.sky2 = col(k.get(2)); }
                else return null;
                sl.ground = col(s.get("ground")); sl.hill = col(s.get("hill"));
                if (s.get("bg") instanceof String) sl.bg = col(s.get("bg"));
                if (s.get("ink") instanceof String) sl.ink = col(s.get("ink"));
                Object su = s.get("sun"); if (su instanceof Map) { Map<String, Object> q = (Map<String, Object>) su; sl.sun = new double[] { num(q.get("x"), .5), num(q.get("y0"), .3), num(q.get("y1"), .3), num(q.get("r"), .08), col(q.get("c")) & 0xFFFFFFFFL }; }
                Object mo = s.get("moon"); if (mo instanceof Map) { Map<String, Object> q = (Map<String, Object>) mo; sl.moon = new double[] { num(q.get("x"), .5), num(q.get("y"), .2), num(q.get("r"), .06) }; }
                sl.stars = (int) num(s.get("stars"), 0); sl.clouds = (int) num(s.get("clouds"), 0);
                Object ro = s.get("roles"); List<Role> rl = new ArrayList<Role>();
                if (ro instanceof List) for (Object r : (List<Object>) ro) {
                    if (!(r instanceof Map)) continue;
                    Map<String, Object> rm = (Map<String, Object>) r; Role rr = new Role();
                    rr.t0 = num(rm.get("t0"), 0); rr.p = (int) num(rm.get("p"), 0); rr.hop = num(rm.get("hop"), 0); rr.hz = num(rm.get("hz"), 2);
                    rr.say = SceneModel.Json.strOr(rm.get("say"), ""); rr.fx = SceneModel.Json.strOr(rm.get("fx"), "");
                    rl.add(rr);
                }
                if (rl.size() < 3) continue;
                sl.roles = rl.toArray(new Role[0]);
                sl.special = parseSpecial(s.get("special"));
                sl.all = parseAllLook(s.get("all"));
                out.add(sl);
            }
            if (out.isEmpty()) return null;
            sc.slots = out.toArray(new Slot[0]); return sc;
        } catch (RuntimeException e) { return null; }
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Seg[]> parseSpecial(Object spo) {
        Map<String, Seg[]> out = new java.util.HashMap<String, Seg[]>();
        if (spo instanceof Map) for (Map.Entry<String, Object> en : ((Map<String, Object>) spo).entrySet()) {
            if (!(en.getValue() instanceof List)) continue;
            List<Seg> sg = new ArrayList<Seg>();
            for (Object t : (List<Object>) en.getValue()) {
                if (!(t instanceof Map)) continue;
                Map<String, Object> tm = (Map<String, Object>) t; Seg g = new Seg();
                g.t0 = num(tm.get("t0"), 0); g.t1 = num(tm.get("t1"), g.t0);
                g.hop = num(tm.get("hop"), 0); g.hz = num(tm.get("hz"), 2); g.p = (int) num(tm.get("p"), 0); g.f = num(tm.get("f"), 1) < 0 ? -1 : 1;
                g.k = SceneModel.Json.strOr(tm.get("k"), "pose"); g.say = SceneModel.Json.strOr(tm.get("say"), ""); g.fx = SceneModel.Json.strOr(tm.get("fx"), "");
                sg.add(g);
            }
            if (!sg.isEmpty()) out.put(en.getKey(), sg.toArray(new Seg[0]));
        }
        return out;
    }
    /** 전원 인사의 판(대본 all). 자리가 8개 미만이거나 차례가 자리 수와 안 맞으면 null — 앱은 그 경우 전원 인사를 쓰지 않는다. */
    @SuppressWarnings("unchecked")
    private static All parseAll(Object o) {
        if (!(o instanceof Map)) return null;
        Map<String, Object> m = (Map<String, Object>) o; All a = new All();
        a.dur = (int) num(m.get("dur"), 10100); a.fade = (int) num(m.get("fade"), 700); a.t0 = num(m.get("t0"), 2800); a.step = num(m.get("step"), 700); a.scale = num(m.get("scale"), .82); a.gap = num(m.get("gap"), .72);
        Object so = m.get("seats"), oo = m.get("order");
        if (!(so instanceof List) || !(oo instanceof List)) return null;
        List<Object> sl = (List<Object>) so, ol = (List<Object>) oo; int n = sl.size();
        if (n < 3 || ol.size() != n) return null;
        a.sx = new double[n]; a.sr = new int[n]; a.order = new int[n];
        for (int i = 0; i < n; i++) {
            if (!(sl.get(i) instanceof Map)) return null;
            Map<String, Object> q = (Map<String, Object>) sl.get(i); a.sx[i] = num(q.get("x"), .5); a.sr[i] = (int) num(q.get("r"), 0);
            a.order[i] = (int) num(ol.get(i), i); if (a.order[i] < 0 || a.order[i] >= n) return null;
        }
        Object eo = m.get("enter");
        if (eo instanceof Map) for (Map.Entry<String, Object> en : ((Map<String, Object>) eo).entrySet()) {
            if (!(en.getValue() instanceof Map)) continue;
            Map<String, Object> q = (Map<String, Object>) en.getValue(); Enter e = new Enter();
            if (q.get("from") instanceof Number) e.from = num(q.get("from"), 0);
            e.t0 = num(q.get("t0"), 0); e.speed = num(q.get("speed"), 0); e.dur = num(q.get("dur"), 0); e.hop = num(q.get("hop"), 0); e.hz = num(q.get("hz"), 2);
            e.arc = Boolean.TRUE.equals(q.get("arc")); e.k = SceneModel.Json.strOr(q.get("k"), "walk"); e.fx = SceneModel.Json.strOr(q.get("fx"), ""); e.p = (int) num(q.get("p"), 0);
            if (e.speed <= 0 && e.dur <= 0) continue;
            a.enter.put(en.getKey(), e);
        }
        return a;
    }
    @SuppressWarnings("unchecked")
    private static AllLook parseAllLook(Object o) {
        if (!(o instanceof Map)) return null;
        Map<String, Object> m = (Map<String, Object>) o; AllLook l = new AllLook();
        l.p = (int) num(m.get("p"), 0); l.hop = num(m.get("hop"), 0); l.hz = num(m.get("hz"), 2); l.fx = SceneModel.Json.strOr(m.get("fx"), "");
        Object so = m.get("say");
        if (so instanceof Map) for (Map.Entry<String, Object> en : ((Map<String, Object>) so).entrySet()) if (en.getValue() instanceof String) l.say.put(en.getKey(), (String) en.getValue());
        l.special = parseSpecial(m.get("special"));
        return l;
    }
    private static double[] three(Object o, double[] d) {
        if (o instanceof List && ((List<?>) o).size() >= 3) { List<?> l = (List<?>) o; double[] r = new double[3]; for (int i = 0; i < 3; i++) r[i] = num(l.get(i), d[i]); return r; }
        return d;
    }
    private static double num(Object o, double d) { return o instanceof Number ? ((Number) o).doubleValue() : d; }
    /** '#rrggbb' · '#rgb' → 0xFFRRGGBB (잘못된 글은 검정). 대본의 색은 모두 이 두 모양이다. */
    private static int col(Object o) {
        try {
            if (!(o instanceof String)) return 0xFF000000; String h = ((String) o).trim(); if (h.startsWith("#")) h = h.substring(1);
            if (h.length() == 3) h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
            return 0xFF000000 | (int) Long.parseLong(h, 16);
        } catch (RuntimeException e) { return 0xFF000000; }
    }

    // ───────────── 고르기 ─────────────
    /** 시(0~24 실수)가 속한 칸. 칸 범위는 [h0, h1) · 자정을 넘기는 칸은 h0 > h1. 어디에도 안 맞으면 첫 칸. */
    public static Slot slotFor(Script sc, double hour) {
        double h = ((hour % 24) + 24) % 24;
        for (Slot s : sc.slots) if (s.h0 < s.h1 ? (h >= s.h0 && h < s.h1) : (h >= s.h0 || h < s.h1)) return s;
        return sc.slots[0];
    }
    /**
     * 켤 때마다 나올 세 친구(왼쪽·가운데·오른쪽 순서)를 무작위로 고른다. 8마리 중 서로 다른 셋 — 방금 나온 조합(prev: "a,b,c")은 되도록 피한다.
     * seed 는 켠 순간의 값(System.nanoTime 등) — 시험은 정해진 값을 넣어 결과를 확인한다.
     */
    public static String[] pickIds(Script sc, long seed, String prev) {
        int n = sc.chars.length; java.util.Random rnd = new java.util.Random(mix(seed));
        String[] best = null;
        for (int tries = 0; tries < 8; tries++) {
            List<String> pool = new ArrayList<String>(); for (String c : sc.chars) pool.add(c);
            String[] pick = new String[3];
            for (int i = 0; i < 3; i++) pick[i] = pool.remove(rnd.nextInt(pool.size()));
            best = pick;
            if (prev == null || !sameTrio(pick, prev)) break;
        }
        return best;
    }
    private static boolean sameTrio(String[] a, String prev) {
        String[] pv = prev.split(","); if (pv.length != 3) return false;
        for (String x : a) { boolean f = false; for (String y : pv) if (x.equals(y.trim())) f = true; if (!f) return false; }
        return true;
    }
    private static long mix(long z) { z += 0x9E3779B97F4A7C15L; z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L; z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL; return z ^ (z >>> 31); }

    /** 마지막으로 받은 날씨(wk: clear·cloudy·overcast·rain·snow·fog)를 칸의 하늘·땅·해/달/별·구름·효과에 입힌 새 칸. 모르는 날씨·맑음·빈 값이면 칸 그대로. */
    public static Slot withWeather(Script sc, Slot s, String wk) {
        Wx w = wk == null ? null : sc.wx.get(wk); if (w == null) return s;
        Slot r = new Slot(); r.id = s.id; r.ko = s.ko; r.kind = s.kind; r.dark = s.dark; r.h0 = s.h0; r.h1 = s.h1; r.roles = s.roles; r.special = s.special; r.ink = s.ink; r.all = s.all;
        int t = s.dark ? w.tintNight : w.tintDay;
        r.bg = s.bg == 0 ? 0 : mix(s.bg, t, w.a);                                           // 바탕은 하늘 맨 위와 같은 비율로 물들어 둘의 이음매가 안 보인다
        r.sky0 = mix(s.sky0, t, w.a); r.sky1 = mix(s.sky1, t, w.a); r.sky2 = mix(s.sky2, t, w.a);
        r.ground = w.hasGround ? mix(s.ground, w.ground, w.ga) : mix(s.ground, t, w.a * 0.45);
        r.hill = w.hasGround ? mix(s.hill, w.hill, w.ga) : mix(s.hill, t, w.a * 0.45);
        r.sun = w.sun ? s.sun : null; r.moon = w.sun ? s.moon : null; r.stars = w.sun ? s.stars : 0;
        r.clouds = Math.max(s.clouds, w.clouds); r.fx = w.fx; return r;
    }
    /** a(0~1)만큼 b 쪽으로 섞은 색(0xFFRRGGBB). */
    static int mix(int c0, int c1, double a) {
        a = Math.max(0, Math.min(1, a)); int out = 0xFF000000;
        for (int sh = 16; sh >= 0; sh -= 8) { double v = ((c0 >> sh) & 255) * (1 - a) + ((c1 >> sh) & 255) * a; out |= (int) Math.round(v) << sh; }
        return out;
    }

    /** 칸의 자리별 연기를 고른 친구 셋에 입힌다. 죽순이·뽀송처럼 전용 동작이 있는 친구는 칸의 special 로 자기 자리의 연기를 바꾼다(말풍선은 자리의 것을 이어받는다). */
    public static Actor[] cast(Script sc, Slot s, String[] ids) {
        double[] xs = "sleep".equals(s.kind) ? sc.xs : sc.x; Actor[] out = new Actor[3];
        for (int i = 0; i < 3; i++) {
            Role r = s.roles[i]; Actor a = new Actor(); a.id = ids[i]; Seg[] sp = s.special.get(ids[i]);
            if (sp != null) {
                Seg[] tr = new Seg[sp.length];
                for (int j = 0; j < sp.length; j++) {
                    Seg q = sp[j], g = new Seg(); g.t0 = q.t0 + (j == 0 ? r.t0 : 0); g.t1 = q.t1; g.x0 = g.x1 = xs[i]; g.hop = q.hop; g.hz = q.hz; g.k = q.k; g.p = q.p; g.f = q.f; g.fx = q.fx; g.say = q.say;
                    if (j == 0 && g.say.length() == 0) g.say = r.say;
                    tr[j] = g;
                }
                a.tr = tr;
            } else {
                Seg g = new Seg(); g.t0 = r.t0; g.t1 = sc.dur; g.x0 = g.x1 = xs[i]; g.k = s.kind; g.p = r.p; g.hop = r.hop; g.hz = r.hz; g.fx = r.fx; g.say = r.say;
                a.tr = new Seg[] { g };
            }
            out[i] = a;
        }
        return out;
    }

    /** 전원 인사를 할 수 있는가 — 판과 이 칸의 인사 대본이 있고, 모든 친구에게 인사 글이 있고, 자리가 친구 수만큼 있다. */
    public static boolean canAll(Script sc, Slot s) {
        if (sc == null || s == null || sc.all == null || s.all == null || sc.all.sx.length < sc.chars.length) return false;
        for (String c : sc.chars) { String t = s.all.say.get(c); if (t == null || t.length() == 0) return false; }
        return true;
    }
    /** 전원 인사용 시간표(길이·사라짐만 전원 인사의 것) — alpha/bgAlpha/fgAlpha/done 을 그대로 쓴다. 나머지(칸·이름·날씨)는 같은 것을 가리킨다. */
    public static Script forAll(Script sc) {
        Script r = new Script(); r.dur = sc.all.dur; r.fade = sc.all.fade; r.brand = sc.brand; r.bg = sc.bg; r.ink = sc.ink; r.chars = sc.chars; r.names = sc.names; r.x = sc.x; r.xs = sc.xs; r.slots = sc.slots; r.wx = sc.wx; r.all = sc.all;
        return r;
    }
    /**
     * 모든 친구(8마리)를 판의 자리에 앉힌다. 누가 어느 자리에 서는지는 seed 로 무작위(시험은 정해진 값 · 같은 seed 면 같은 배치) — 인사 차례는 자리마다 판이 정한다.
     * 반환은 뒤 줄 → 앞 줄 순서(앞 줄이 뒤 줄을 가리도록 그릴 차례). 칸의 전용 동작(죽순이·뽀송)은 자기 자리에서 그대로 한다.
     */
    public static Actor[] castAll(Script sc, Slot s, long seed) {
        All al = sc.all; int n = sc.chars.length; java.util.Random rnd = new java.util.Random(mix(seed));
        List<String> pool = new ArrayList<String>(); for (String c : sc.chars) pool.add(c);
        java.util.Collections.shuffle(pool, rnd);
        int[] rank = new int[al.order.length]; for (int i = 0; i < al.order.length; i++) rank[al.order[i]] = i;
        List<Actor> list = new ArrayList<Actor>();
        for (int i = 0; i < n; i++) {
            String id = pool.get(i); Actor a = new Actor(); a.id = id; a.row = al.sr[i]; a.scale = al.scale; a.gap = al.gap;
            a.say = s.all.say.get(id); a.sayAt = al.t0 + rank[i] * al.step;
            // s339: 먼저 자기 방식으로 들어온다(걷기·달리기·날기·쏙 나타나기) — 도착 시각은 시작 x 에서 자리까지 거리 ÷ 빠르기(또는 정해진 시간)
            List<Seg> tr = new ArrayList<Seg>(); double seat = al.sx[i]; Enter e = al.enter.get(id);
            if (e != null) {
                Seg w = new Seg(); double x0 = Double.isNaN(e.from) ? seat : e.from;
                w.k = e.k; w.p = e.p; w.fx = e.fx; w.x0 = x0; w.x1 = seat; w.f = seat >= x0 ? 1 : -1; w.hop = e.hop; w.hz = e.hz; w.arc = e.arc;
                w.t0 = e.t0; w.t1 = e.t0 + (e.dur > 0 ? e.dur : Math.abs(seat - x0) / e.speed * 1000.0);
                tr.add(w); a.arrive = w.t1;
            }
            Seg[] sp = s.all.special.get(id);
            if (sp != null) {
                for (Seg q : sp) {
                    if (q.t1 <= a.arrive) continue;
                    Seg g = new Seg(); g.t0 = Math.max(q.t0, a.arrive); g.t1 = q.t1; g.x0 = g.x1 = seat; g.hop = q.hop; g.hz = q.hz; g.k = q.k; g.p = q.p; g.f = q.f; g.fx = q.fx;
                    tr.add(g);
                }
            } else {
                Seg g = new Seg(); g.t0 = a.arrive; g.t1 = al.dur; g.x0 = g.x1 = seat; g.k = s.kind; g.p = s.all.p; g.hop = s.all.hop; g.hz = s.all.hz; g.fx = s.all.fx;
                tr.add(g);
            }
            a.tr = tr.toArray(new Seg[0]);
            list.add(a);
        }
        java.util.Collections.sort(list, new java.util.Comparator<Actor>() { @Override public int compare(Actor p, Actor q) { return q.row - p.row; } });          // 뒤 줄(2) 먼저 · 앞 줄(0) 마지막 — 안정 정렬이라 같은 줄은 자리 순서
        return list.toArray(new Actor[0]);
    }

    // ───────────── 시각 t(ms) 의 모습 ─────────────
    /** 전체 진하기: 끝나기 fade ms 전부터 서서히 사라지고, dur 이 지나면 0. */
    public static double alpha(Script sc, long tMs) {
        if (tMs >= sc.dur) return 0; if (tMs <= sc.dur - sc.fade) return 1;
        return Math.max(0, Math.min(1, (sc.dur - tMs) / (double) Math.max(1, sc.fade)));
    }
    /** 배경(하늘·땅)의 진하기: 전체 진하기를 부드럽게(ease) 다듬은 값 — 앱 화면이 그라데이션으로 비쳐 나온다. */
    public static double bgAlpha(Script sc, long tMs) { double a = alpha(sc, tMs); return a * a * (3 - 2 * a); }
    /** 글·친구·해/달의 진하기: 사라지는 구간의 앞쪽 절반에 먼저 사라진다(앱 화면과 겹쳐 보이는 시간을 줄인다). */
    public static double fgAlpha(Script sc, long tMs) { double a = Math.max(0, Math.min(1, (alpha(sc, tMs) - 0.5) / 0.5)); return a * a * (3 - 2 * a); }
    public static boolean done(Script sc, long tMs) { return tMs >= sc.dur; }
    /** 해의 높이(화면 높이의 0~1): 처음→끝으로 천천히 움직인다. */
    public static double sunY(Slot s, long tMs, Script sc) {
        if (s.sun == null) return -1; double u = Math.max(0, Math.min(1, tMs / (double) Math.max(1, sc.dur - sc.fade)));
        double e = u * u * (3 - 2 * u); return s.sun[1] + (s.sun[2] - s.sun[1]) * e;
    }

    private static final double SAY_MS = 1700;
    public static St at(Actor a, long tMs) {
        St r = new St(); r.id = a.id; Seg first = a.tr[0]; double t = tMs;
        if (t < first.t0) { r.on = true; r.x = first.x0; r.k = first.k; r.face = first.f; r.pose = first.p; r.alpha = 0; return r; }       // 아직 안 나왔다(걷는 동작은 화면 밖에서 시작한다)
        Seg cur = a.tr[a.tr.length - 1];
        for (Seg s : a.tr) if (t >= s.t0 && t < s.t1) { cur = s; break; }
        r.on = true; r.k = cur.k; r.pose = cur.p; r.face = cur.f; r.fx = t >= cur.t0 && t < cur.t1 + 1 ? cur.fx : "";
        double span = Math.max(1, cur.t1 - cur.t0), u = Math.max(0, Math.min(1, (t - cur.t0) / span));
        r.x = cur.x0 + (cur.x1 - cur.x0) * u; r.segT = (t - cur.t0) / 1000.0; r.tSec = tMs / 1000.0;
        if (cur.arc) r.hop = Math.sin(Math.PI * u) * cur.hop;                                                                  // s339: 날아오기·쏙 나타나기 — 구간 동안 한 번 크게 포물선
        else if (cur.hop > 0) r.hop = Math.abs(Math.sin(Math.PI * cur.hz * r.segT)) * cur.hop;
        r.alpha = Math.min(1, (t - first.t0) / 320.0);                                                                         // 처음 나타날 때 조용히 떠오른다(걸어 들어오지 않는다)
        for (Seg s : a.tr) if (s.say.length() > 0 && t >= s.t0 && t - s.t0 < SAY_MS) {                      // 말풍선: 말하기 시작한 뒤 1.5초 동안(가장 나중 것)
            r.say = s.say; double ts = t - s.t0; r.sayA = Math.min(1, ts / 160.0) * Math.min(1, (SAY_MS - ts) / 260.0);
        }
        if (a.say.length() > 0 && a.sayAt >= 0 && t >= a.sayAt && t - a.sayAt < SAY_MS) { double ts = t - a.sayAt; r.say = a.say; r.sayA = Math.min(1, ts / 160.0) * Math.min(1, (SAY_MS - ts) / 260.0); }          // s338: 전원 인사 — 자기 차례에 한 번
        return r;
    }
}
