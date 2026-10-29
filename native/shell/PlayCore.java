package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.Random;

/**
 * 캐릭터 놀이터(웹 _RC.playStart — 역 팝업 · 시간표 시트의 역 이름 옆 빈 칸에서 동물 캐릭터 2~3마리가 논다) 순수 계산.
 * 안드로이드를 쓰지 않아 JVM 에서 시험한다. 순수 장식 — 판단·계산과 무관하고, 그림은 PlayView 가 그린다.
 *
 * 한 장면(8가지 배경: 낮 · 노을 · 풀밭 · 사탕 · 눈 · 바다 · 밤 · 오로라)마다 배경 색(다크/파스텔)과 행동 비중이 다르고,
 * 캐릭터마다 자기만의 놀이가 있다 — 강아지(킁킁 · 응가) · 고양이(나무 타기 · 훌쩍) · 두더지(땅속 · 솟기 · 삽질) · 올챙이(웅덩이 헤엄 · 펄쩍) · 독수리(날기 · 내려앉기).
 * 규격(칸 크기 · 바닥 높이 · 속도)은 웹 _RC.D3 와 같다(RunnerCore.spec). 시간 단위는 초, 길이 단위는 dp.
 */
public final class PlayCore {
    private PlayCore() {}

    public static final String[] SCENE_ORDER = { "day", "sunset", "meadow", "candy", "snow", "sea", "night", "aurora" };
    public static final float TARGET_H = 34f;                    // 캐릭터 키(dp)
    public static final float HOST_H = 70f, HOST_MIN_W = 90f;    // 놀이터 칸(웹 #nmPopPlay · #nmTtPlay: 높이 70 · 최소 너비 90)

    /** 장면 하나. p: 파스텔(위→아래 3색) · d: 다크 · g: 바닥색 [파스텔, 다크] · w: 행동 비중(걷기 · 콩콩 · 빙글 · 쉬기). */
    public static final class Scene {
        public final String name, deco, mark;
        public final int[] p, d, g;
        public final double wWalk, wHop, wSpin, wRest, spd, hop, chase, sp, restMul;
        Scene(String name, String[] p, String[] d, String[] g, String deco, double ww, double wh, double ws, double wr, double spd, double hop, double chase, double sp, double restMul, String mark) {
            this.name = name; this.p = rgb(p); this.d = rgb(d); this.g = rgb(g); this.deco = deco; this.mark = mark;
            this.wWalk = ww; this.wHop = wh; this.wSpin = ws; this.wRest = wr; this.spd = spd; this.hop = hop; this.chase = chase; this.sp = sp; this.restMul = restMul;
        }
        private static int[] rgb(String[] a) { int[] r = new int[a.length]; for (int i = 0; i < a.length; i++) r[i] = 0xFF000000 | (int) Long.parseLong(a[i].substring(1), 16); return r; }
    }
    private static final Scene[] SCENES = {
        new Scene("day",    new String[]{"#bfe6ff", "#e3f5ff", "#f7fcff"}, new String[]{"#14263f", "#1e3a5c", "#27507a"}, new String[]{"#bfe8c6", "#1f3d33"}, "clouds", .30, .30, .20, .20, 1.0, 1.0, .35, 1, 1, "♪"),
        new Scene("sunset", new String[]{"#ffd1b8", "#ffb7cf", "#d9c2ff"}, new String[]{"#3a2342", "#6b2f58", "#a1475f"}, new String[]{"#eeb3b8", "#4a2438"}, "sunset", .35, .10, .10, .45, .7, .8, .25, 1, 1.4, "♡"),
        new Scene("meadow", new String[]{"#d9f6e3", "#c4efd3", "#a9e3bd"}, new String[]{"#10302a", "#14403a", "#1b5246"}, new String[]{"#8fd3a4", "#0f3a2c"}, "meadow", .25, .45, .10, .20, 1.0, 1.2, .55, 1.6, .8, "♪"),
        new Scene("candy",  new String[]{"#ffe0ef", "#ffd0e8", "#e8d3ff"}, new String[]{"#35203f", "#4a2a58", "#6a3a73"}, new String[]{"#f7b8d6", "#52305f"}, "petals", .20, .30, .40, .10, 1.1, 1.0, .45, 1.2, .7, "♡"),
        new Scene("snow",   new String[]{"#e4f1ff", "#f2f8ff", "#ffffff"}, new String[]{"#1a2a44", "#243a5a", "#31507a"}, new String[]{"#dbe9f6", "#9fb4cc"}, "snow", .20, .40, .30, .10, 1.25, 1.3, .4, .7, .6, "✦"),
        new Scene("sea",    new String[]{"#c7f0ff", "#9fe0f5", "#7fd0ec"}, new String[]{"#08283f", "#0d3b57", "#12506f"}, new String[]{"#f6e4b5", "#3a4a52"}, "sea", .50, .20, .15, .15, 1.05, .9, .3, 1, 1, "♪"),
        new Scene("night",  new String[]{"#bcc8ff", "#d6cfff", "#ecd9ff"}, new String[]{"#0b1030", "#1a1650", "#2c1f6b"}, new String[]{"#c9c2f0", "#1b1a3c"}, "night", .25, .10, .05, .60, .6, .7, .2, .6, 1.7, "z"),
        new Scene("aurora", new String[]{"#d8fff3", "#d6e8ff", "#ecd8ff"}, new String[]{"#06182a", "#0a3a4a", "#2a1a5a"}, new String[]{"#cfe9ee", "#10283a"}, "aurora", .30, .30, .30, .10, .95, 1.1, .35, 1, .9, "✦")
    };
    public static Scene scene(String name) { for (Scene s : SCENES) if (s.name.equals(name)) return s; return null; }

    // 종류별 행동 가중치(웹 KM): walk · hop · spin · rest
    private static double[] km(String kind) {
        if ("cat".equals(kind)) return new double[]{1.2, .7, .4, 1.4};
        if ("mole".equals(kind)) return new double[]{1.5, .2, 0, .8};
        if ("tad".equals(kind)) return new double[]{.6, 1.8, .8, .6};
        if ("eagle".equals(kind)) return new double[]{1, 0, 0, 1};
        return new double[]{1, 1, 1, 1};
    }
    public static String kindOf(String id) {
        if ("lovel".equals(id)) return "cat";
        if ("dudung".equals(id)) return "mole";
        if ("chaeng".equals(id)) return "tad";
        if ("sul".equals(id)) return "eagle";
        if ("juksun".equals(id)) return "panda";
        if ("bbosong".equals(id)) return "hippo";
        return "dog";                                              // dolsom · ppopu
    }

    /** 이어받기용 설정(웹 playSnap) — 역 팝업 → 시간표로 넘어갈 때 같은 배경·같은 캐릭터가 같은 자리에서 이어서 논다. */
    public static final class Snap {
        public String scene = ""; public String[] ids = new String[0]; public double[] xs = new double[0]; public int[] dirs = new int[0];
        public boolean sideA; public double treeX = -1d, pondX = -1d;
    }

    public static final class Actor {
        public String id, kind, st = "walk";
        public RunnerCore.Spec D;
        public double k, w, bodyH, x, dir, tx, until, t0, fr, dirT, y, rot, ang, sq, jit, ph, spd, lastSp = -5d;
        public boolean vis = true, clip, useIntro, pooped, chase;
        public int introIdx, legs;
        public double side, ty, lx1, jx0, jx1, digAt, landUntil, groundUntil = Double.MAX_VALUE, alt, landX;
        double[] km;
    }
    public static final class Tree { public double x, th; }
    public static final class Pond { public double x, rx; }
    public static final class Poop { public double x, born; }
    public static final int P_SPLASH = 0, P_STAR = 1, P_DIRT = 2;
    public static final class Pt { public int type; public double x, y, vx, vy, age, life; }
    public static final class Decor { public double x, y, s, ph, v; }

    /** 한 장면의 상태. */
    public static final class Play {
        public final Scene sc;
        public final double W, H, gy, fy;                        // 칸 크기 · 바닥 띠 시작 · 발 닿는 곳
        public final Actor[] cs;
        public final String[] ids;
        public final boolean sideA;
        public Tree tree; public Pond pond;
        public final ArrayList<Poop> poops = new ArrayList<Poop>();
        public final ArrayList<Pt> pt = new ArrayList<Pt>();
        public final Decor[] parts;
        public double t;
        private final Random rnd;

        public Play(double wc, double hc, Snap o, Random rnd) {
            this.rnd = rnd; this.W = wc; this.H = hc; this.gy = hc - 7d; this.fy = gy + 1d;
            Scene s = o != null ? scene(o.scene) : null;
            if (s == null) s = SCENES[rnd.nextInt(SCENES.length)];
            this.sc = s;
            ArrayList<String> ids2 = new ArrayList<String>();
            if (o != null && o.ids != null && o.ids.length > 0) { for (String i : o.ids) if (RunnerCore.spec(i) != null) ids2.add(i); }
            if (ids2.isEmpty()) {
                ArrayList<String> pool = new ArrayList<String>(); for (String i : RunnerCore.ORDER) pool.add(i);
                int n = rnd.nextDouble() < 0.5 ? 2 : 3;
                while (ids2.size() < n && !pool.isEmpty()) ids2.add(pool.remove(rnd.nextInt(pool.size())));
            }
            ids = ids2.toArray(new String[0]);
            cs = new Actor[ids.length];
            for (int q = 0; q < ids.length; q++) {
                String id = ids[q];
                Actor c = new Actor(); c.id = id; c.kind = kindOf(id); c.km = km(c.kind); c.D = RunnerCore.spec(id);
                double bodyH = (c.D.base - 8d) / 256d * c.D.cell + c.D.lift * 0.6;
                c.k = Math.min(0.62, TARGET_H / bodyH); c.w = c.D.cell * c.k; c.bodyH = bodyH * c.k;
                c.dir = rnd.nextDouble() < 0.5 ? -1 : 1; c.fr = rnd.nextDouble() * 16d; c.ph = rnd.nextDouble() * 6.28d;
                c.x = rr(c.w * 0.5, Math.max(c.w * 0.6, W - c.w * 0.5));
                if (o != null && o.xs != null && q < o.xs.length && o.xs[q] >= 0d) {                // 팝업 → 시트로 넘어올 때 서 있던 자리 그대로
                    c.x = clampX(c, o.xs[q] * W); if (o.dirs != null && q < o.dirs.length && o.dirs[q] != 0) c.dir = o.dirs[q];
                }
                c.spd = (c.D.fps / 16d) * c.D.cell * c.k * ("lovel".equals(id) ? 0.9 : 1.0) * sc.spd;
                cs[q] = c;
            }
            boolean sa = (o != null && o.ids != null && o.ids.length > 0) ? o.sideA : rnd.nextDouble() < 0.5;
            this.sideA = sa;
            if (has("cat")) { tree = new Tree(); tree.x = W * (o != null && o.treeX >= 0d ? o.treeX : (sa ? rr(.22, .34) : rr(.66, .78))); tree.th = Math.min(H * 0.58, 42d); }
            if (has("tad")) { pond = new Pond(); pond.x = W * (o != null && o.pondX >= 0d ? o.pondX : (sa ? rr(.66, .78) : rr(.22, .34))); pond.rx = Math.min(26d, W * 0.14); }
            int np = npOf(sc.deco);
            parts = new Decor[np];
            for (int i = 0; i < np; i++) { Decor d = new Decor(); d.x = rnd.nextDouble(); d.y = rnd.nextDouble(); d.s = rr(0.6, 1.4); d.ph = rnd.nextDouble() * 6.28d; d.v = rr(0.5, 1.2); parts[i] = d; }
            for (Actor c : cs) {                                                                        // 시작 상태
                c.tx = target(c);
                if ("mole".equals(c.kind)) { c.digAt = 1e9; c.vis = false; go(c, "hidden", 0.5, 0d); c.tx = c.x; }
                else if ("tad".equals(c.kind) && pond != null) { c.landUntil = 1e9; c.x = pond.x; go(c, "swim", rr(1.2, 2.2), 0d); }
                else if ("eagle".equals(c.kind)) { c.alt = rr(14, 24); c.legs = 2; go(c, "fly", 0d, 0d); }
            }
        }
        private static int npOf(String d) {
            if ("snow".equals(d)) return 18; if ("petals".equals(d)) return 10; if ("night".equals(d)) return 24; if ("aurora".equals(d)) return 10;
            if ("sea".equals(d)) return 6; if ("meadow".equals(d) || "sunset".equals(d) || "clouds".equals(d)) return 3; return 0;
        }
        private boolean has(String kind) { for (Actor c : cs) if (c.kind.equals(kind)) return true; return false; }
        private double rr(double a, double b) { return a + rnd.nextDouble() * (b - a); }
        private double clampX(Actor c, double x) { return Math.max(c.w * 0.45, Math.min(W - c.w * 0.45, x)); }
        private static double ease(double u) { return u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u); }
        private void go(Actor c, String st, double dur, double t) { c.st = st; c.t0 = t; c.until = t + dur; }
        private void spawn(int type, double x, double y, int cnt) {
            for (int i = 0; i < cnt; i++) {
                double a = type == P_SPLASH ? rr(-Math.PI * .95, -Math.PI * .05) : rr(-Math.PI * .85, -Math.PI * .15), sp = type == P_SPLASH ? rr(18, 42) : rr(14, 34);
                Pt p = new Pt(); p.type = type; p.x = x + rr(-2, 2); p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.age = 0; p.life = rr(.45, .85);
                pt.add(p);
            }
            while (pt.size() > 60) pt.remove(0);
        }
        private double target(Actor c) {
            Actor other = cs[rnd.nextInt(cs.length)];
            if (other != c && other.vis && rnd.nextDouble() < sc.chase) { c.chase = true; return clampX(c, other.x + rr(-0.8, 0.8) * c.w); }     // 친구에게 다가간다
            c.chase = false; return rr(c.w * 0.45, Math.max(c.w * 0.5, W - c.w * 0.45));
        }
        private void generic(Actor c, double t) {
            double wh = sc.wHop * c.km[1], ws = sc.wSpin * c.km[2], wr = sc.wRest * c.km[3], ww = sc.wWalk * c.km[0], tot = wh + ws + wr + ww, r = rnd.nextDouble() * tot;
            c.t0 = t;
            if ((c.chase && c.km[1] > 0) || r < wh) go(c, "hop", rr(1.1, 2.2), t);
            else if (r < wh + ws) { go(c, "spin", rr(1.0, 1.8), t); c.dirT = t; }
            else if (r < wh + ws + wr) go(c, "rest", rr(0.9, 2.0) * sc.restMul, t);
            else { c.st = "walk"; c.tx = target(c); }
        }
        // 캐릭터마다 자기만의 놀이 — 도착할 때마다 '특별한 행동'을 먼저 고려하고, 아니면 공통 행동(걷기·콩콩·빙글·쉬기)
        private void decide(Actor c, double t) {
            String k = c.kind;
            if ("dog".equals(k)) {
                if (t - c.lastSp > 8 && rnd.nextDouble() < 0.26 * sc.sp) { go(c, "poop", 2.6, t); c.pooped = false; return; }
                if (rnd.nextDouble() < 0.2) { go(c, "sniff", rr(1.4, 2.4), t); return; }
            } else if ("cat".equals(k)) {
                if (tree != null && t - c.lastSp > 6 && rnd.nextDouble() < 0.4 * sc.sp) { c.side = c.x < tree.x ? 1 : -1; c.tx = clampX(c, tree.x - c.side * c.w * 0.5); go(c, "toTree", 0d, t); return; }
            } else if ("mole".equals(k)) {
                if (t >= c.digAt) { c.dir = c.dir != 0 ? c.dir : 1; go(c, "dig", 1.3, t); return; }
            } else if ("tad".equals(k)) {
                if (pond != null && t >= c.landUntil) { c.side = c.x < pond.x ? -1 : 1; c.tx = clampX(c, pond.x + c.side * pond.rx * 0.95); go(c, "toPond", 0d, t); return; }
            } else if ("eagle".equals(k)) {
                if (t >= c.groundUntil) { c.alt = rr(14, 24); c.dir = c.x < W / 2 ? 1 : -1; go(c, "takeoff", 0.9, t); return; }
            }
            generic(c, t);
        }
        private boolean moveToward(Actor c, double dt, double mul) {
            double dx = c.tx - c.x;
            if (Math.abs(dx) < 3) return true;
            c.dir = dx > 0 ? 1 : -1; c.x += c.dir * Math.min(Math.abs(dx), c.spd * mul * dt); return false;
        }

        /** dt 초만큼 흐른다(웹은 30fps 로 부른다). */
        public void tick(double dt) { t += dt; step(dt); }

        private void step(double dt) {
            final double CLIMB_ROT = -1.2, CLIMB_DX = 3;
            for (Actor c : cs) {
                RunnerCore.Spec D = c.D;
                double u = c.until > c.t0 ? (t - c.t0) / (c.until - c.t0) : 0; String st = c.st;
                c.clip = false; c.ang = 0; c.rot = 0; c.sq = 0; c.jit = 0; c.vis = true; c.useIntro = false;
                if ("walk".equals(st)) {
                    double slow = "eagle".equals(c.kind) ? 0.5 : 1;
                    if (moveToward(c, dt, slow)) decide(c, t); else c.fr += dt * D.fps * sc.spd * ("eagle".equals(c.kind) ? 0.35 : 1);
                    c.y = 0;
                } else if ("hop".equals(st)) {
                    c.fr += dt * D.fps * 0.7; c.y = -Math.abs(Math.sin((t - c.t0) * 7.5)) * Math.min(11, H * 0.18) * sc.hop;
                    if (t >= c.until) { c.y = 0; c.st = "walk"; c.tx = target(c); }
                } else if ("spin".equals(st)) {
                    c.fr += dt * D.fps * 0.45; c.y = 0;
                    if (t - c.dirT > 0.42) { c.dir = -c.dir; c.dirT = t; }
                    if (t >= c.until) { c.st = "walk"; c.tx = target(c); }
                } else if ("rest".equals(st)) {
                    c.fr += dt * D.fps * 0.22; c.y = 0;
                    if (t >= c.until) { c.st = "walk"; c.tx = target(c); }
                } else if ("sniff".equals(st)) {                                  // 강아지: 코를 땅에 대고 킁킁
                    c.x = clampX(c, c.x + c.dir * c.spd * 0.28 * dt); c.fr += dt * D.fps * 0.42; c.ang = 0.14 + Math.sin(t * 14) * 0.03; c.y = 0;
                    if (t >= c.until) { c.st = "walk"; c.tx = target(c); }
                } else if ("poop".equals(st)) {                                   // 강아지: 멈춰서 쭈그리고 응가
                    c.y = 0; c.fr = 4;
                    c.sq = (u > 0.14 && u < 0.78) ? 0.2 + Math.sin(u * 60) * 0.02 : 0;
                    c.jit = (u > 0.14 && u < 0.78) ? Math.sin(t * 50) * 0.5 : 0;
                    if (u > 0.58 && !c.pooped) { c.pooped = true; Poop pp = new Poop(); pp.x = c.x - c.dir * c.w * 0.3; pp.born = t; poops.add(pp); if (poops.size() > 3) poops.remove(0); spawn(P_STAR, c.x - c.dir * c.w * 0.3, fy - 3, 4); }
                    if (t >= c.until) { c.lastSp = t; go(c, "hop", 0.9, t); }
                } else if ("toTree".equals(st)) {                                 // 고양이: 나무 쪽으로 걸어간다
                    c.dir = c.side; if (moveToward(c, dt, 1)) { c.dir = c.side; double ty0 = tree.th * 0.55; c.ty = ty0; go(c, "climb", ty0 / 20, t); } else c.fr += dt * D.fps; c.y = 0;
                } else if ("climb".equals(st)) {                                  // 나무를 타고 오른다(몸을 세워서)
                    c.rot = CLIMB_ROT; c.x = tree.x - c.dir * CLIMB_DX; c.y = -c.ty * ease(u); c.fr += dt * D.fps * 0.9;
                    if (t >= c.until) go(c, "perch", rr(2.4, 3.8), t);
                } else if ("perch".equals(st)) {                                  // 가지 위에 앉아 쉰다
                    c.x = tree.x + c.dir * 9; c.y = -c.ty; c.fr = 3;
                    if (t >= c.until) { if (rnd.nextDouble() < 0.5) { c.lx1 = clampX(c, tree.x + c.dir * rr(24, 42)); go(c, "leap", 0.75, t); } else go(c, "down", c.ty / 22, t); }
                } else if ("down".equals(st)) {                                   // 뒷걸음으로 내려온다
                    c.rot = CLIMB_ROT; c.x = tree.x - c.dir * CLIMB_DX; c.y = -c.ty * (1 - ease(u)); c.fr -= dt * D.fps * 0.9;
                    if (t >= c.until) { c.x = tree.x - c.dir * c.w * 0.5; c.y = 0; c.lastSp = t; c.st = "walk"; c.tx = target(c); }
                } else if ("leap".equals(st)) {                                   // 훌쩍 뛰어내린다
                    double lx0 = tree.x + c.dir * 9; c.x = lx0 + (c.lx1 - lx0) * u; c.y = -c.ty * (1 - u) * (1 - u) - Math.sin(Math.PI * u) * 9; c.ang = (u - 0.35) * 0.9; c.fr = 8;
                    if (t >= c.until) { c.y = 0; c.lastSp = t; go(c, "hop", 0.8, t); }
                } else if ("hidden".equals(st)) {                                 // 두더지: 땅속에서 흙두둑만 움직인다
                    c.vis = false; c.y = 0;
                    double dxh = c.tx - c.x; if (Math.abs(dxh) > 2) c.x += (dxh > 0 ? 1 : -1) * Math.min(Math.abs(dxh), 46 * dt);
                    if (rnd.nextDouble() < dt * 6) spawn(P_DIRT, c.x, fy - 2, 1);
                    if (t >= c.until) { go(c, "emerge", 1.0, t); c.digAt = t + 1 + rr(3.6, 6); }
                } else if ("emerge".equals(st)) {                                 // 땅을 뚫고 솟는다(3D 시트의 솟아나는 장면)
                    c.useIntro = true; c.introIdx = (int) Math.min(D.intro - 1, Math.floor(u * D.intro)); c.y = 0;
                    if (t >= c.until) { c.useIntro = false; c.st = "walk"; c.tx = target(c); }
                } else if ("dig".equals(st)) {                                    // 삽질: 몸을 들썩이며 흙을 튀긴다
                    c.fr = 2; c.y = 0; c.ang = Math.sin(u * 20) * 0.13;
                    if (rnd.nextDouble() < dt * 22) spawn(P_DIRT, c.x + c.dir * c.w * 0.3, fy - 3, 1);
                    if (t >= c.until) go(c, "sink", 1.0, t);
                } else if ("sink".equals(st)) {                                   // 구멍으로 쏙 들어간다(솟는 장면을 거꾸로)
                    c.useIntro = true; c.introIdx = (int) Math.max(0, D.intro - 1 - Math.floor(u * D.intro)); c.y = 0;
                    if (t >= c.until) { c.useIntro = false; c.vis = false; c.tx = rr(c.w * 0.5, W - c.w * 0.5); go(c, "hidden", rr(1.0, 1.9), t); }
                } else if ("swim".equals(st)) {                                   // 올챙이: 웅덩이에서 헤엄
                    c.x = pond.x + Math.sin((t - c.t0) * 2.2 + c.ph) * pond.rx * 0.5; c.dir = Math.cos((t - c.t0) * 2.2 + c.ph) > 0 ? 1 : -1;
                    c.fr += dt * D.fps; c.y = c.bodyH * 0.36; c.clip = true;
                    if (t >= c.until) {
                        c.side = rnd.nextDouble() < 0.5 ? -1 : 1; double lt = pond.x + c.side * (pond.rx + rr(16, 46)); if (lt < c.w * 0.5 || lt > W - c.w * 0.5) c.side = -c.side;
                        c.jx0 = c.x; c.jx1 = clampX(c, pond.x + c.side * (pond.rx + rr(16, 46))); c.dir = c.side; go(c, "jumpOut", 0.95, t); spawn(P_SPLASH, c.x, fy, 7);
                    }
                } else if ("jumpOut".equals(st)) {                                // 물에서 펄쩍 뛰어나온다
                    c.x = c.jx0 + (c.jx1 - c.jx0) * u; c.y = -Math.sin(Math.PI * u) * 28 + c.bodyH * 0.36 * Math.max(0, 1 - u * 5); c.clip = c.y > 0.5; c.ang = c.dir * (u - 0.5) * 0.9; c.fr += dt * D.fps * 1.2;
                    if (t >= c.until) { c.y = 0; c.landUntil = t + rr(3.6, 5.6); c.st = "walk"; c.tx = target(c); }
                } else if ("toPond".equals(st)) {                                 // 웅덩이 가장자리로 걸어간다
                    if (moveToward(c, dt, 1)) { c.jx0 = c.x; c.jx1 = pond.x + rr(-0.3, 0.3) * pond.rx; c.dir = c.side > 0 ? -1 : 1; go(c, "jumpIn", 0.8, t); } else c.fr += dt * D.fps; c.y = 0;
                } else if ("jumpIn".equals(st)) {                                 // 다시 물로 풍덩
                    c.x = c.jx0 + (c.jx1 - c.jx0) * u; c.y = -Math.sin(Math.PI * u) * 22 + c.bodyH * 0.36 * Math.max(0, (u - 0.8) * 5); c.clip = c.y > 0.5; c.ang = c.dir * (u - 0.5) * 0.9; c.fr += dt * D.fps * 1.2;
                    if (t >= c.until) { spawn(P_SPLASH, c.x, fy, 7); c.landUntil = 1e9; go(c, "swim", rr(1.6, 2.6), t); }
                } else if ("fly".equals(st)) {                                    // 독수리: 하늘을 날아다닌다
                    if (c.tx == 0d || Math.abs(c.tx - c.x) < 3) {
                        if (c.legs-- <= 0) { c.landX = clampX(c, c.x); go(c, "land", 1.0, t); c.y = -c.alt; continue; }
                        c.tx = rr(c.w * 0.5, W - c.w * 0.5);
                    }
                    c.dir = c.tx > c.x ? 1 : -1; c.x += c.dir * Math.min(Math.abs(c.tx - c.x), c.spd * 1.7 * dt); c.fr += dt * D.fps; c.y = -c.alt + Math.sin(t * 3 + c.ph) * 2.2;
                } else if ("land".equals(st)) {                                   // 땅으로 내려앉는다
                    c.y = -c.alt * (1 - ease(u)); c.fr += dt * D.fps * (1 - 0.6 * u); c.ang = -0.18 * (1 - u);
                    if (t >= c.until) { c.y = 0; c.groundUntil = t + rr(3, 5.5); c.st = "walk"; c.tx = target(c); }
                } else if ("takeoff".equals(st)) {                                // 다시 날아오른다
                    c.y = -c.alt * (1 - Math.pow(1 - ease(u), 2)); c.x = clampX(c, c.x + c.dir * 18 * dt); c.fr += dt * D.fps * 1.2; c.ang = 0.12 * (1 - u);
                    if (t >= c.until) { c.legs = 1 + (int) Math.floor(rnd.nextDouble() * 2); c.tx = 0; go(c, "fly", 0d, t); }
                }
            }
            for (int i = pt.size() - 1; i >= 0; i--) { Pt p = pt.get(i); p.age += dt; p.vy += 95 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > p.life) pt.remove(i); }
            for (int i = poops.size() - 1; i >= 0; i--) if (t - poops.get(i).born > 8) poops.remove(i);
        }

        /** 그릴 프레임 번호(0~15). 두더지가 솟고 가라앉을 땐 '솟는 시트'의 번호. */
        public int frameIdx(Actor c) {
            if (c.useIntro) return c.introIdx;
            int n = c.D.n; return (((int) Math.floor(c.fr) % n) + n) % n;
        }

        /** 이어받기용 설정(웹 playSnap). */
        public Snap snap() {
            Snap s = new Snap(); s.scene = sc.name; s.ids = ids.clone(); s.xs = new double[cs.length]; s.dirs = new int[cs.length];
            for (int i = 0; i < cs.length; i++) { s.xs[i] = cs[i].x / W; s.dirs[i] = (int) cs[i].dir; }
            s.sideA = sideA; s.treeX = tree != null ? tree.x / W : -1d; s.pondX = pond != null ? pond.x / W : -1d;
            return s;
        }
    }

    /** 놀이터 칸의 위치(dp): 이름 글 오른쪽 빈 칸. 역 팝업은 이름 줄 아래에 맞춰 위로 솟고, 시간표 시트는 제목 줄 가운데에서 위로 24 솟는다. 못 놓으면 null. */
    public static float[] popupHost(float sheetW, float padX, float nameX, float nameW, float nameY, float nameH) {
        float x0 = nameX + nameW + 10f, right = sheetW - padX;
        if (right - x0 < HOST_MIN_W) return null;                             // 이름이 길어 최소 칸도 못 내면 놓지 않는다
        float rowBottom = nameY + Math.max(nameH, HOST_H - 48f);              // 웹: margin -44 0 -4 → 줄 높이 = max(이름 높이, 22)
        return new float[]{x0, rowBottom + 4f - HOST_H, right - x0, HOST_H};
    }
    public static float[] ttHost(float barY, float barH, float titleX, float titleW, float rightEdge) {
        float x0 = titleX + titleW + 10f;
        if (rightEdge - x0 < HOST_MIN_W) return null;
        float rowH = Math.max(barH, HOST_H - 24f), rowTop = barY + (barH - rowH) / 2f;   // 웹: margin -24 0 0 → 줄 높이 = max(제목 높이, 46)
        return new float[]{x0, rowTop - 24f, rightEdge - x0, HOST_H};
    }
}
