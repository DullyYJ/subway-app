package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 오프닝 화면의 계산(순수 자바 — 안드로이드를 쓰지 않아 JVM 에서 시험한다). 2026-10-29 s299.
 *
 * 앱을 켜면 길동무 친구들이 2초쯤 나와 인사한다(시간대 7칸 · 칸마다 다른 짧은 움직임). 무엇을 어떻게 움직일지는 엔진(engine/open.js)이 정한 대본이고,
 * 네트워크를 기다리지 않으려고 그 대본을 앱 assets/open.json 에 넣어 두었다. 이 클래스는 그 JSON 을 읽어
 *   ① 지금 시(時)가 속한 칸을 찾고(자정을 넘기는 23-07 포함) ② 날마다 번갈아 나오는 두 가지 중 하나를 고르고 ③ 시각 t(ms)에서 친구마다 어디서 무엇을 하는지 돌려준다.
 * 글·색·움직임은 모두 대본에 있다 — 여기에는 없다.
 */
public final class OpenCore {
    private OpenCore() {}

    public static final class Seg { public double t0, t1, x0, x1, hop, hz; public String k = "pose", say = "", fx = ""; public int p, f = 1; }
    public static final class Actor { public String id = ""; public Seg[] tr = new Seg[0]; }
    public static final class Slot {
        public String id = "", ko = "", title = "", sub = "";
        public double h0, h1;
        public int sky0, sky1, sky2, ground, hill, tc;
        public double[] sun;        // {x, y 처음, y 끝, 반지름(화면 폭 비), 색(0xAARRGGBB 를 double 로)} · 없으면 null
        public double[] moon;       // {x, y, 반지름} · 없으면 null
        public int stars, clouds;
        public Actor[][] variants = new Actor[0][];
    }
    public static final class Script { public int dur = 2400, fade = 350; public Slot[] slots = new Slot[0]; }

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
            Script sc = new Script(); sc.dur = (int) num(m.get("dur"), 2400); sc.fade = (int) num(m.get("fade"), 350);
            Object so = m.get("slots"); if (!(so instanceof List)) return null;
            List<Slot> out = new ArrayList<Slot>();
            for (Object e : (List<Object>) so) {
                if (!(e instanceof Map)) continue;
                Map<String, Object> s = (Map<String, Object>) e; Slot sl = new Slot();
                sl.id = SceneModel.Json.strOr(s.get("id"), ""); sl.ko = SceneModel.Json.strOr(s.get("ko"), "");
                sl.title = SceneModel.Json.strOr(s.get("title"), ""); sl.sub = SceneModel.Json.strOr(s.get("sub"), "");
                sl.h0 = num(s.get("h0"), 0); sl.h1 = num(s.get("h1"), 0);
                Object sk = s.get("sky");
                if (sk instanceof List && ((List<Object>) sk).size() >= 3) { List<Object> k = (List<Object>) sk; sl.sky0 = col(k.get(0)); sl.sky1 = col(k.get(1)); sl.sky2 = col(k.get(2)); }
                else return null;
                sl.ground = col(s.get("ground")); sl.hill = col(s.get("hill")); sl.tc = col(s.get("tc"));
                Object su = s.get("sun"); if (su instanceof Map) { Map<String, Object> q = (Map<String, Object>) su; sl.sun = new double[] { num(q.get("x"), .5), num(q.get("y0"), .3), num(q.get("y1"), .3), num(q.get("r"), .08), col(q.get("c")) & 0xFFFFFFFFL }; }
                Object mo = s.get("moon"); if (mo instanceof Map) { Map<String, Object> q = (Map<String, Object>) mo; sl.moon = new double[] { num(q.get("x"), .5), num(q.get("y"), .2), num(q.get("r"), .06) }; }
                sl.stars = (int) num(s.get("stars"), 0); sl.clouds = (int) num(s.get("clouds"), 0);
                Object vo = s.get("variants"); List<Actor[]> vs = new ArrayList<Actor[]>();
                if (vo instanceof List) for (Object v : (List<Object>) vo) {
                    if (!(v instanceof Map)) continue;
                    Object co = ((Map<String, Object>) v).get("cast"); if (!(co instanceof List)) continue;
                    List<Actor> cast = new ArrayList<Actor>();
                    for (Object a : (List<Object>) co) {
                        if (!(a instanceof Map)) continue;
                        Map<String, Object> am = (Map<String, Object>) a; Actor ac = new Actor(); ac.id = SceneModel.Json.strOr(am.get("id"), "");
                        Object to = am.get("tr"); List<Seg> sg = new ArrayList<Seg>();
                        if (to instanceof List) for (Object t : (List<Object>) to) {
                            if (!(t instanceof Map)) continue;
                            Map<String, Object> tm = (Map<String, Object>) t; Seg g = new Seg();
                            g.t0 = num(tm.get("t0"), 0); g.t1 = num(tm.get("t1"), g.t0); g.x0 = num(tm.get("x0"), .5); g.x1 = num(tm.get("x1"), g.x0);
                            g.hop = num(tm.get("hop"), 0); g.hz = num(tm.get("hz"), 2); g.p = (int) num(tm.get("p"), 0); g.f = num(tm.get("f"), 1) < 0 ? -1 : 1;
                            g.k = SceneModel.Json.strOr(tm.get("k"), "pose"); g.say = SceneModel.Json.strOr(tm.get("say"), ""); g.fx = SceneModel.Json.strOr(tm.get("fx"), "");
                            sg.add(g);
                        }
                        ac.tr = sg.toArray(new Seg[0]); if (ac.id.length() > 0 && ac.tr.length > 0) cast.add(ac);
                    }
                    if (!cast.isEmpty()) vs.add(cast.toArray(new Actor[0]));
                }
                sl.variants = vs.toArray(new Actor[0][]);
                if (sl.variants.length > 0) out.add(sl);
            }
            if (out.isEmpty()) return null;
            sc.slots = out.toArray(new Slot[0]); return sc;
        } catch (RuntimeException e) { return null; }
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
    /** 날(dayKey: 예를 들어 1970-01-01 부터의 날 수)마다 번갈아 나오는 두 가지 중 하나. */
    public static Actor[] cast(Slot s, long dayKey) { return s.variants[(int) Math.floorMod(dayKey, (long) s.variants.length)]; }

    // ───────────── 시각 t(ms) 의 모습 ─────────────
    /** 전체 진하기: 끝나기 fade ms 전부터 서서히 사라지고, dur 이 지나면 0. */
    public static double alpha(Script sc, long tMs) {
        if (tMs >= sc.dur) return 0; if (tMs <= sc.dur - sc.fade) return 1;
        return Math.max(0, Math.min(1, (sc.dur - tMs) / (double) Math.max(1, sc.fade)));
    }
    public static boolean done(Script sc, long tMs) { return tMs >= sc.dur; }
    /** 해의 높이(화면 높이의 0~1): 처음→끝으로 천천히 움직인다. */
    public static double sunY(Slot s, long tMs, Script sc) {
        if (s.sun == null) return -1; double u = Math.max(0, Math.min(1, tMs / (double) Math.max(1, sc.dur - sc.fade)));
        double e = u * u * (3 - 2 * u); return s.sun[1] + (s.sun[2] - s.sun[1]) * e;
    }

    private static final double SAY_MS = 1500;
    public static St at(Actor a, long tMs) {
        St r = new St(); r.id = a.id; Seg first = a.tr[0]; double t = tMs;
        if (t < first.t0) { r.on = true; r.x = first.x0; r.k = first.k; r.face = first.f; r.pose = first.p; r.alpha = 0; return r; }       // 아직 안 나왔다(걷는 동작은 화면 밖에서 시작한다)
        Seg cur = a.tr[a.tr.length - 1];
        for (Seg s : a.tr) if (t >= s.t0 && t < s.t1) { cur = s; break; }
        r.on = true; r.k = cur.k; r.pose = cur.p; r.face = cur.f; r.fx = t >= cur.t0 && t < cur.t1 + 1 ? cur.fx : "";
        double span = Math.max(1, cur.t1 - cur.t0), u = Math.max(0, Math.min(1, (t - cur.t0) / span));
        r.x = cur.x0 + (cur.x1 - cur.x0) * u; r.segT = (t - cur.t0) / 1000.0; r.tSec = tMs / 1000.0;
        if (cur.hop > 0) r.hop = Math.abs(Math.sin(Math.PI * cur.hz * r.segT)) * cur.hop;
        r.alpha = "sleep".equals(cur.k) ? Math.min(1, (t - cur.t0) / 300.0) : 1;
        for (Seg s : a.tr) if (s.say.length() > 0 && t >= s.t0 && t - s.t0 < SAY_MS) {                      // 말풍선: 말하기 시작한 뒤 1.5초 동안(가장 나중 것)
            r.say = s.say; double ts = t - s.t0; r.sayA = Math.min(1, ts / 160.0) * Math.min(1, (SAY_MS - ts) / 260.0);
        }
        return r;
    }
}
