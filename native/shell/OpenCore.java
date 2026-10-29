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

    public static final class Seg { public double t0, t1, x0, x1, hop, hz; public String k = "pose", say = "", fx = ""; public int p, f = 1; }
    public static final class Actor { public String id = ""; public Seg[] tr = new Seg[0]; }
    /** 자리(왼쪽·가운데·오른쪽)마다의 연기 — 누가 서든 이 연기를 한다. t0 은 나타나는 시각. */
    public static final class Role { public double t0, hop, hz; public int p; public String say = "", fx = ""; }
    public static final class Slot {
        public String id = "", ko = "", kind = "pose";
        public double h0, h1;
        public int sky0, sky1, sky2, ground, hill;
        public double[] sun;        // {x, y 처음, y 끝, 반지름(판 폭 비), 색(0xAARRGGBB 를 double 로)} · 없으면 null
        public double[] moon;       // {x, y, 반지름} · 없으면 null
        public int stars, clouds;
        public Role[] roles = new Role[0];
        public Map<String, Seg[]> special = new java.util.HashMap<String, Seg[]>();
    }
    public static final class Script {
        public int dur = 2700, fade = 700; public String brand = ""; public int bg = 0xFFFAF9F7, ink = 0xFF2B2F4A;
        public String[] chars = new String[0]; public double[] x = {.30, .50, .70}, xs = {.27, .50, .73};
        public Slot[] slots = new Slot[0];
    }

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
            Object co = m.get("chars"); List<String> cl = new ArrayList<String>();
            if (co instanceof List) for (Object c : (List<Object>) co) if (c instanceof String && ((String) c).length() > 0 && !cl.contains(c)) cl.add((String) c);
            if (cl.size() < 3) return null;
            sc.chars = cl.toArray(new String[0]);
            Object so = m.get("slots"); if (!(so instanceof List)) return null;
            List<Slot> out = new ArrayList<Slot>();
            for (Object e : (List<Object>) so) {
                if (!(e instanceof Map)) continue;
                Map<String, Object> s = (Map<String, Object>) e; Slot sl = new Slot();
                sl.id = SceneModel.Json.strOr(s.get("id"), ""); sl.ko = SceneModel.Json.strOr(s.get("ko"), ""); sl.kind = "sleep".equals(SceneModel.Json.strOr(s.get("kind"), "pose")) ? "sleep" : "pose";
                sl.h0 = num(s.get("h0"), 0); sl.h1 = num(s.get("h1"), 0);
                Object sk = s.get("sky");
                if (sk instanceof List && ((List<Object>) sk).size() >= 3) { List<Object> k = (List<Object>) sk; sl.sky0 = col(k.get(0)); sl.sky1 = col(k.get(1)); sl.sky2 = col(k.get(2)); }
                else return null;
                sl.ground = col(s.get("ground")); sl.hill = col(s.get("hill"));
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
                Object spo = s.get("special");
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
                    if (!sg.isEmpty()) sl.special.put(en.getKey(), sg.toArray(new Seg[0]));
                }
                out.add(sl);
            }
            if (out.isEmpty()) return null;
            sc.slots = out.toArray(new Slot[0]); return sc;
        } catch (RuntimeException e) { return null; }
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
        if (cur.hop > 0) r.hop = Math.abs(Math.sin(Math.PI * cur.hz * r.segT)) * cur.hop;
        r.alpha = Math.min(1, (t - first.t0) / 320.0);                                                                         // 처음 나타날 때 조용히 떠오른다(걸어 들어오지 않는다)
        for (Seg s : a.tr) if (s.say.length() > 0 && t >= s.t0 && t - s.t0 < SAY_MS) {                      // 말풍선: 말하기 시작한 뒤 1.5초 동안(가장 나중 것)
            r.say = s.say; double ts = t - s.t0; r.sayA = Math.min(1, ts / 160.0) * Math.min(1, (SAY_MS - ts) / 260.0);
        }
        return r;
    }
}
