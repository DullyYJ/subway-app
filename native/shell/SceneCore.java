package com.dullyyj.subway;

import static com.dullyyj.subway.SceneUtil.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 혼잡도 카드의 3D 캐릭터 장면 — 안드로이드 네이티브판 핵심(웹 index.html 의 _CS 를 그대로 옮긴 것).
 *
 * ★ 원칙: "계산은 엔진이, 그림은 앱이". 어떤 장면(mode)인지·누가 주인공인지·누가 등장하는지·어떤 동작을 어떤 순서로 하는지·
 *   놓았을 때 어떤 연출인지는 모두 엔진(/scene)이 준 SceneModel.Res 값이다. 이 코드는 받은 이름대로 몸을 기울이고 소품·반짝이를 그릴 뿐
 *   무엇을 할지 고르지 않는다(엔진이 안 준 값에 대한 앱 쪽 대체 판단도 없다).
 *
 * android.* 를 쓰지 않는다 — 그래야 이 PC(JVM)에서 시험할 수 있다. 그리는 도구는 SceneCv, 시트·햅틱은 Host 로 받는다.
 */
public final class SceneCore {
    /** 바깥 세계와의 접점(안드로이드: 시트 비트맵·진동 / 시험: 가짜) */
    public interface Host {
        SceneCv.Img sheet(String id);
        SceneCv.Img intro();
        boolean ready();
        /** 진동 이름: grab, release, land_cotton, land_pose, land_dig, land_flip, land_fly, land_puddle, land_tumble, land_hose, squirt, land, hearts, thud, angry, splash, flap */
        void haptic(String name);
        /** 길게 눌러 캐릭터를 잡았다(→ 아래 웹뷰의 손가락 동작을 취소해야 한다) */
        void held();
    }

    // ═══ 상수·표 ═══
    static final double TH = 44;                                       // 캐릭터 키(px, 가장 가까운 줄 기준)
    static final double LONGPRESS = .38;                               // 꾹 누름(초)
    static final double SLOP_DP = 10;                                  // 이만큼 움직이면 길게 누르기 취소(= 화면 스크롤)
    static final String[] BUS_COLORS = {"#2f6fd6", "#2fa862", "#d6453a", "#e3a21a"};
    static final String[] CAR_COLORS = {"#e0556c", "#f0b83a", "#5aa9e6", "#8e7bd6", "#e9eef5", "#4cbf9a"};
    static final String[] BUS_NOS = {"146", "3300", "9401", "N61", "472", "6411"};

    // ═══ 그릇들 ═══
    static final double BOX_W = 1.3, BOX_H = .38;          // 러블 상자(폭·높이, 캐릭터 키 대비)
    static final class Prop { String k; boolean abs, front; double x, y, dx, dy, r, s; }
    static final class Stk { String k; double t0, dur; }
    static final class Ball { double x, y, vx, vy; }
    /** 죽순이가 떨어뜨린 대나무(공중에서 구르다 땅에 눕는다 — 주인이 찾으러 와서 집어 든다) */
    static final class Bam { double x, y, z, vx, vy, rot, vr, t0; boolean landed, taken; int bounces; Actor owner; }
    static final class Feather { double x, y, vy, ph; boolean land, got; }
    static final class Chip { double dx, dy, r; int col; }
    static final class Gfx {
        String k; double x, z, life, t0, r, bump; boolean front, snow; Chip[] cs; Actor own;      // own: 거울을 보는 주인(얼굴이 거울에 비친다)
    }
    static final class Pt { String type, txt = ""; double x, y, vx, vy, age, life, g = 90, r, rot; int col; boolean hasCol; }
    static final class Traffic { int lane; boolean bus; double L, x, v, rot; int dir; int color; String no; }
    static final class Ripple { double x, y, t0; }
    static final class Seq { double ph, t0, busX, busV, door, L, t1, t2, t3; boolean busOn; int color; }
    static final class Ride { double scroll, rot, speed, vPrev, acc, cyc, bump, nextBump, bellT = -9; boolean stopped; }
    static final class Drag { Actor a; double fx, fy, px, py; }
    static final class Pend { Actor a; double t0, sxdp, sydp; }
    interface Arrive { void f(Actor o); }

    /** 동작 한 번의 상태(웹의 a.act 객체) */
    static final class AS {
        String n; double t0, dur; int d0;
        Ball b; Feather f; Gfx g, b1, b2, m; Actor tgt; List<Actor> tg;
        double mx, hx, tx, px, x0, x1 = Double.NaN, bx, s0 = Double.NaN, s1 = Double.NaN, fx, lx, alt0, z0, tz; int dir0; boolean snow;
        final HashMap<String, Double> ev = new HashMap<>();
        final HashMap<String, Boolean> on = new HashMap<>();
    }
    interface Init { void f(Actor a, double t, AS A); }
    interface Step { void f(Actor a, double u, double dt, AS A); }
    interface End { void f(Actor a, AS A); }
    static final class Act { double dur; Init init; Step step; End end; }

    static final class Actor {
        String id, kind; SceneModel.Spec D; double k, w, x, z; int dir = 1; String st = "walk";
        double tx, tz, t0, until, fr, y, ang, sq, hop; boolean vis = true, intro; int ii;
        double alt, life, born; boolean leaving, hero, nograb, chase, held, pinned, dead, hidden, umb, lastBounce;
        double ph, bubUntil, sx = 1, sy = 1, ox, pvx, pvy, cut = Double.NaN, spd; int pose = -1;     // pose: 자세 시트(<id>_pose) 칸 0 앉기·1 잠·2 웃음·3 덜덜·4 헥헥·5 찡그림, -1 이면 걷기 시트
        String bub = ""; List<Prop> pr; Stk stk; int ai; AS act; Arrive onArrive;
        Integer lastCyc; double dirT; String afterEmerge, prevSt, landK = "";
        double pinX = Double.NaN, altSave, altStart, fy0, vy, airT, lookUntil, boost;
        int cell = -1; String sk, chain;     // cell: 전용 동작 시트(<id>_act 4×4) 칸, -1 이면 안 씀 · sk: 걷기 시트 대신 쓸 시트 열쇠(대나무 없는 죽순이 juksun_nb) · chain: 지금 동작이 끝나면 이어서 할 동작
    }

    // ═══ 상태 ═══
    final Host host; final SceneCv factory; final SceneUtil.Rng R;
    boolean laid, running; double PW, PH, dens = 1, k = 1, W, H, dpr = 1; boolean dark = true, reduce;
    /** 0 보다 크면 칸 높이와 상관없이 이 배율로 그린다(카드 확장 인사: 키가 2배로 커지지 않고 같은 그림이 세로로 넓어진다). */
    public double forceK = 0;
    SceneArt.Geom g; double t, fade; long frames;
    /** TV 전원 전환(2026-10-16, YJ: "경로 탐색·취소·애니메이션이 바뀔 때 TV 처럼 화면이 꺼졌다 켜지게"): 장면이 바뀌는 순간부터 지난 초(없으면 -1). */
    double tv = -1;
    static final double TV_OFF = .30, TV_HOLD = .08, TV_ON = .42, TV_T = TV_OFF + TV_HOLD + TV_ON;
    String mode; SceneModel.Res res, LAST; SceneArt.Pal L; SceneArt.Bg bg; SceneCv.Layer prev;
    List<Actor> actors = new ArrayList<>(); List<Traffic> traffic = new ArrayList<>(); List<Pt> pt = new ArrayList<>(); List<Gfx> gfx = new ArrayList<>(); List<Ripple> ripples = new ArrayList<>(); List<Bam> bams = new ArrayList<>();
    Actor hero; Seq seq; Ride ride; double nextCar, spawnAt, waitNext, bellAt; int castI;
    double stopX, entX; boolean inside; String sta = "", vk = ""; String venue = "bus"; int baseDir = -1; int busColor; String busNo; String bgKey = "";
    SceneTrain.St tr;
    double dtLast; Drag DRAG; Pend PEND; boolean rideBell;
    P wxP;
    // 장소가 바뀔 때(s246): 캐릭터가 모두 한쪽으로 걸어 나가는 동안 옛 배경은 반대쪽으로 밀려 나가고 새 배경이 이어 붙어 들어온다. 어느 쪽인지(look.pdir)는 엔진이 정했다.
    List<Traffic> oldTraffic = new ArrayList<>(); double pan = -1, panDur = 2.6; int panDir = 1; SceneArt.Bg panBg; SceneArt.Pal panL; P panWx; String bgTail = "";
    // 날씨·시간대·계절만 바뀔 때는 옛 장면 한 장이 새 장면 위에서 서서히 사라진다
    double xf = -1; static final double XF_T = 1.1, PAN_MIN = 2.4, PAN_MAX = 4.6;
    final Map<String, Act> ACT = new HashMap<>();
    String error;

    static final class P { List<double[]> rain = new ArrayList<>(), snow = new ArrayList<>(), clouds = new ArrayList<>(), stars = new ArrayList<>(), birds = new ArrayList<>(), wind = new ArrayList<>(); }

    public SceneCore(Host host, SceneCv layerFactory, SceneUtil.Rng rng) {
        this.host = host; this.factory = layerFactory; this.R = rng;
        SceneActs.register(this);
    }

    // ═══ 작은 도구 ═══
    double rnd(double a, double b) { return a + R.next() * (b - a); }
    double rnd() { return R.next(); }
    <T> T pickOf(T[] a) { return a[(int) Math.floor(R.next() * a.length)]; }
    static double lerp(double a, double b, double u) { return a + (b - a) * u; }
    double zy(double z) { return g.nearTop + 4 + z * (g.floor - g.nearTop - 4); }       // 깊이(0~1) → 화면 y (원근: 멀수록 위·작게)
    static double zs(double z) { return .74 + .34 * clamp(z, -.2, 1.1); }
    double HH(Actor a) { return TH * zs(a.z) * (a.hero ? 1.12 : 1); }
    double liftOf(Actor a) { return (a.D.lift + a.alt) * zs(a.z) * (a.kind.equals("eagle") ? 1 : zs(a.z)); }
    double feetY(Actor a) { return zy(a.z); }
    void standF(Actor a) { a.fr = SceneModel.stand(a.id); }
    void pr(Actor a, Prop p) { if (a.pr == null) a.pr = new ArrayList<>(); a.pr.add(p); }
    Prop prop(String k) { Prop p = new Prop(); p.k = k; return p; }
    Prop prop(String k, double dx, double dy) { Prop p = prop(k); p.dx = dx; p.dy = dy; p.front = true; return p; }
    Prop propAbs(String k, double x, double y) { Prop p = prop(k); p.abs = true; p.x = x; p.y = y; p.front = true; return p; }
    void say(Actor a, String txt, double sec) { a.bub = txt; a.bubUntil = t + sec; }
    void stk(Actor a, String k, double sec) { Stk s = new Stk(); s.k = k; s.t0 = t; s.dur = sec; a.stk = s; }
    boolean every(AS A, String key, double gap) { Double v = A.ev.get(key); if (v == null || t - v >= gap) { A.ev.put(key, t); return true; } return false; }
    boolean once(AS A, String key) { if (A.on.containsKey(key)) return false; A.on.put(key, true); return true; }
    void haptic(String n) { try { host.haptic(n); } catch (RuntimeException e) { /* 진동 실패는 그림에 영향 없다 */ } }

    // 입자 옵션
    static final class PO {
        double a0 = Double.NaN, a1, s0 = 10, s1 = 26, jx = 3, jy, delay, l0 = .5, l1 = .9, g = Double.NaN, r;
        PO a(double a0, double a1) { this.a0 = a0; this.a1 = a1; return this; }
        PO s(double s0, double s1) { this.s0 = s0; this.s1 = s1; return this; }
        PO l(double l0, double l1) { this.l0 = l0; this.l1 = l1; return this; }
        PO g(double g) { this.g = g; return this; }
        PO jx(double v) { jx = v; return this; }
        PO jy(double v) { jy = v; return this; }
        PO r(double v) { r = v; return this; }
        PO delay(double v) { delay = v; return this; }
    }
    static PO po() { return new PO(); }
    void ptx(String type, double x, double y, int n, PO o) {
        for (int i = 0; i < n; i++) {
            double ang = !Double.isNaN(o.a0) ? rnd(o.a0, o.a1) : rnd(-PI * .85, -PI * .15), sp = rnd(o.s0, o.s1);
            Pt p = new Pt(); p.type = type; p.x = x + rnd(-o.jx, o.jx); p.y = y + rnd(-o.jy, o.jy); p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
            p.age = -o.delay; p.life = rnd(o.l0, o.l1); p.g = !Double.isNaN(o.g) ? o.g : 90; p.r = o.r; p.rot = rnd(0, 6.28);
            pt.add(p);
        }
        if (pt.size() > 120) pt.subList(0, pt.size() - 120).clear();
    }
    void addPart(String type, double x, double y, int n) {
        for (int i = 0; i < n; i++) {
            boolean sp2 = type.equals("splash"); double ang = sp2 ? rnd(-PI * .9, -PI * .1) : rnd(-PI * .85, -PI * .15), sp = sp2 ? rnd(16, 38) : rnd(10, 26);
            Pt p = new Pt(); p.type = type; p.x = x + rnd(-3, 3); p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.age = 0; p.life = rnd(.4, .8);
            pt.add(p);
        }
        if (pt.size() > 50) pt.subList(0, pt.size() - 50).clear();
    }
    void landFx(Actor a) {
        String wk = L.wk; double y = zy(a.z); if (L.night && wk.equals("clear")) return;
        addPart(wk.equals("rain") ? "splash" : wk.equals("snow") ? "puff" : "dust", a.x, y - 1, wk.equals("rain") ? 5 : 3);
    }
    Gfx addGfx(Gfx o) { o.t0 = t; R.next(); /* 웹의 o.sd = Math.random() — 난수열을 웹과 같게 맞춘다 */ gfx.add(o); if (gfx.size() > 12) gfx.remove(0); return o; }
    Gfx gfx(String k, double x, double z, double life) { Gfx o = new Gfx(); o.k = k; o.x = x; o.z = z; o.life = life; return o; }

    // ═══ 이동 도구 ═══
    double[] inRange(Actor a) {
        double lo = a.w * .55, hi = W - a.w * .55;
        if (a.hero && "wait".equals(mode)) {
            if (a.pinned && !Double.isNaN(a.pinX)) return new double[]{clamp(a.pinX - 34, lo, hi), clamp(a.pinX + 34, lo, hi)};
            if (inside) return new double[]{clamp(W * .22, lo, hi), clamp(W * .72, lo, hi)};
            return venue.equals("sub") ? new double[]{entX - 40, entX + 30} : new double[]{W * .36, W * .62};
        }
        return new double[]{lo, hi};
    }
    boolean moveX(Actor a, double tx, double v, double dt) {
        double dx = tx - a.x; if (Math.abs(dx) < 2) return true;
        a.dir = dx > 0 ? 1 : -1; a.x += a.dir * Math.min(Math.abs(dx), v * dt); a.fr += dt * a.D.fps * (a.kind.equals("eagle") ? .5 : 1); return false;
    }
    double aheadX(Actor a, double d) {
        double[] r = inRange(a); double x = a.x + a.dir * d;
        if (x < r[0] || x > r[1]) { a.dir = -a.dir; x = a.x + a.dir * d; }
        return clamp(x, r[0], r[1]);
    }
    double[] behindAng(Actor a) { double base = a.dir > 0 ? -PI * .68 : -PI * .32; return new double[]{base - .3, base + .3}; }

    Actor mkActor(String id, double x, double z, int dir) {
        SceneModel.Spec D = SceneModel.D3.get(id); Actor a = new Actor();
        double bodyH = (D.base - 8) / 256 * D.cell + D.lift * .6, kk = Math.min(.8, TH / bodyH);
        a.id = id; a.kind = SceneModel.kind(id); a.D = D; a.k = kk; a.w = D.cell * kk; a.x = x; a.z = z; a.dir = dir == 0 ? 1 : dir; a.tx = x; a.tz = z;
        a.fr = R.next() * 16; a.alt = a.kind.equals("eagle") ? rnd(14, 24) : 0; a.life = rnd(15, 26); a.born = running ? t : 0; a.ph = R.next() * 6;
        a.spd = ((double) D.fps / 16) * D.cell * kk * (id.equals("lovel") ? .9 : 1) * .85;
        return a;
    }
    Object[] pickTarget(Actor a, List<Actor> friends) {
        Actor o = friends != null && !friends.isEmpty() && R.next() < .42 ? friends.get((int) Math.floor(R.next() * friends.size())) : null;
        if (o != null && o != a) { a.chase = true; return new Object[]{clamp(o.x + rnd(-.8, .8) * a.w, a.w * .5, W - a.w * .5), clamp(o.z + rnd(-.12, .12), 0, 1)}; }
        a.chase = false; return new Object[]{rnd(a.w * .55, W - a.w * .55), rnd(.05, .98)};
    }

    // ═══ 이름대로 시작 · 끝나면 다음(동작 대본은 엔진 traits) ═══
    String nextName(Actor a) {
        SceneModel.Traits T = res != null ? res.traits.get(a.id) : null;
        return T != null && !T.acts.isEmpty() ? T.acts.get((a.ai++) % T.acts.size()) : "walk";
    }
    void nextAct(Actor a) { startAct(a, nextName(a)); }
    void startAct(Actor a, String name) {
        if (name.equals("hop")) { a.st = "hop"; a.t0 = t; a.until = t + rnd(1.1, 2); a.lastCyc = null; return; }
        if (name.equals("spin")) { a.st = "spin"; a.t0 = t; a.until = t + rnd(1, 1.7); a.dirT = t; return; }
        if (name.equals("rest")) { a.st = "rest"; a.t0 = t; a.until = t + rnd(1.2, 2.6) * (L.night ? 1.6 : 1); if (L.night) { a.bub = "z"; a.bubUntil = a.until; } return; }
        Act d = ACT.get(name);
        if (name.equals("walk") || d == null) {
            double tx, tz;
            if (a.hero && "wait".equals(mode)) {
                double[] r = inRange(a); tx = clamp(a.x + rnd(-14, 14), r[0], r[1]); tz = a.pinned ? clamp(a.z + rnd(-.04, .04), -.1, 1) : clamp(a.z + rnd(-.06, .06), .55, .85);
                a.onArrive = o -> { o.st = "stand"; o.dir = baseDir; waitNext = t + rnd(1.2, 2.4); };
            } else {
                List<Actor> fr = new ArrayList<>(); for (Actor o : actors) if (o != a && !o.leaving && o.vis) fr.add(o);
                Object[] tg = pickTarget(a, fr); tx = (Double) tg[0]; tz = (Double) tg[1];
            }
            a.tx = tx; a.tz = tz; a.st = "walk"; return;
        }
        a.st = "act"; AS A = new AS(); A.n = name; A.t0 = t; A.dur = d.dur; A.d0 = a.dir; a.act = A; if (d.init != null) d.init.f(a, t, A);
    }
    void endAct(Actor a) {
        a.pr = null; a.cut = Double.NaN; a.sx = a.sy = 1; a.ox = 0; a.pvx = a.pvy = 0; a.ang = 0; a.act = null; a.stk = null; if (a.pinned) a.pinX = a.x;
        if (hello != null && !hello.free.contains(a.id)) { helloSettle(a); return; }                  // s340: 카드 확장 인사 중에는 어떤 동작이든 끝나면 자리에 서서 인사를 기다린다
        if (a.hero && ("wait".equals(mode) || "alight".equals(mode))) { a.st = "stand"; waitNext = t + rnd(1.0, 2.2); if ("wait".equals(mode) && a.lookUntil == 0) a.dir = baseDir; }
        else nextAct(a);
    }
    void actStep(Actor a, double dt) {
        AS A = a.act; Act d = A != null ? ACT.get(A.n) : null; if (d == null) { endAct(a); return; }
        double u = A.dur > 0 ? (t - A.t0) / A.dur : 1;
        if (u >= 1) {
            if (d.end != null) d.end.f(a, A);
            if (a.chain != null && a.st.equals("act")) { String cn = a.chain; a.chain = null; startAct(a, cn); return; }          // 착지 연출 → 이어지는 동작(죽순 찾기·물대포 쏘기)
            if (a.st.equals("act")) endAct(a); return;
        }
        d.step.f(a, u, dt, A);
        if (a.hero && "wait".equals(mode)) { double[] r = inRange(a); a.x = clamp(a.x, r[0], r[1]); }
    }
    void stepActor(Actor a, double dt) {
        SceneModel.Spec D = a.D; double u = a.until > a.t0 ? (t - a.t0) / (a.until - a.t0) : 0; String st = a.st;
        if (!a.bub.isEmpty() && t > a.bubUntil && !st.equals("rest")) a.bub = "";
        if (st.equals("fall")) { fallStep(a, dt); return; }
        a.ang = 0; a.vis = true; a.y = 0; a.sq = 0; a.intro = false; a.sx = 1; a.sy = 1; a.ox = 0; a.pvx = 0; a.pvy = 0; a.cut = Double.NaN; a.pr = null; a.nograb = false; a.pose = -1; a.cell = -1; a.sk = null;
        if (a.kind.equals("eagle") && !a.hero) a.alt = 16 + Math.sin(t * 1.7 + a.x * .03) * 5;
        if (st.equals("emerge")) {
            a.intro = true; a.ii = (int) Math.min(D.intro - 1, Math.floor(u * D.intro));
            if (t >= a.until) { a.intro = false; if (a.afterEmerge != null) { String af = a.afterEmerge; a.afterEmerge = null; startAct(a, af); } else endAct(a); }
            return;
        }
        if (st.equals("pan")) {                                    // 장소 이동 중: 땅이 흐르는 만큼 제자리에서 걸으며 서서히 모여 선다
            a.dir = panDir; a.fr += dt * D.fps * (a.kind.equals("eagle") ? .5 : 1) * Math.max(1, a.boost);
            double dx2 = a.tx - a.x; a.x += clamp(dx2, -1, 1) * Math.min(Math.abs(dx2), 14 * dt);
        } else if (st.equals("walk")) {
            double dx = a.tx - a.x, dz = a.tz - a.z;
            if (Math.abs(dx) < 3 && Math.abs(dz) < .03) {
                if (a.leaving) { a.dead = true; return; }
                if (a.onArrive != null) { Arrive f = a.onArrive; a.onArrive = null; f.f(a); return; }
                endAct(a);
            } else {
                if (Math.abs(dx) >= 3) { a.dir = dx > 0 ? 1 : -1; a.x += a.dir * Math.min(Math.abs(dx), a.spd * (a.leaving ? 1.25 : 1) * (a.boost > 1 ? a.boost : 1) * dt); }
                a.z += (dz > 0 ? 1 : dz < 0 ? -1 : 0) * Math.min(Math.abs(dz), .28 * dt);
                a.fr += dt * D.fps * (a.kind.equals("eagle") ? .5 : 1);
            }
        } else if (st.equals("hop")) {
            a.fr += dt * D.fps * .7; double ph = Math.abs(Math.sin((t - a.t0) * 7.2)); a.y = -ph * 9 * zs(a.z) * (a.kind.equals("tad") ? 1.2 : 1);
            int cyc = (int) Math.floor((t - a.t0) * 7.2 / PI);
            if (a.lastCyc == null || cyc != a.lastCyc) { if (a.lastCyc != null && ph < .3) landFx(a); a.lastCyc = cyc; }
            if (t >= a.until) { a.lastCyc = null; endAct(a); }
        } else if (st.equals("spin")) {
            a.fr += dt * D.fps * .4; if (t - a.dirT > .4) { a.dir = -a.dir; a.dirT = t; } if (t >= a.until) endAct(a);
        } else if (st.equals("rest")) {
            a.fr = SceneModel.stand(a.id); a.y = -Math.abs(Math.sin((t - a.t0) * 2.2)) * .8; a.pose = L.night ? 1 : 0; if (a.kind.equals("eagle")) a.alt = 0;   // 밤엔 눈 감고 자고, 낮엔 앉아 쉰다
            if (a.pose == 1) a.y = Math.sin((t - a.t0) * 1.6) * .5; if (t >= a.until) { a.bub = ""; endAct(a); }
        } else if (st.equals("act")) {
            actStep(a, dt);
        } else if (st.equals("stand")) {                // 서 있기(대기·하차 장면의 대표 캐릭터)
            a.fr = SceneModel.stand(a.id); a.y = -Math.abs(Math.sin(t * 2.0 + a.ph)) * .9;
        }
        if (a.pose >= 0 && a.kind.equals("eagle") && a.pose != 2 && a.pose != 4) a.alt = 0;        // 독수리는 앉기·잠·덜덜·찡그림 자세에선 땅(횃대)에 내려앉는다
        a.z = clamp(a.z, -.2, 1.05); a.x = clamp(a.x, -a.w * 1.2, W + a.w * 1.2);
        if (a.kind.equals("tad")) a.y -= 2 + Math.sin(t * 2.4 + a.x) * 1.6;
    }

    // ═══ 찻길 차량 ═══
    double laneGy(int l) { return l == 0 ? g.roadY0 + (g.nearTop - g.roadY0) * .4 : g.nearTop - 3; }
    double laneL(int l, boolean bus) { return l == 0 ? (bus ? 66 : 36) : (bus ? 100 : 50); }
    Traffic spawnTraffic() {
        boolean allowNear = !("alight".equals(mode) && seq != null && seq.busOn);
        int lane = allowNear && R.next() < .55 ? 1 : 0; boolean bus = R.next() < ("wait".equals(mode) ? .5 : .32);
        Traffic v = new Traffic(); v.lane = lane; v.bus = bus; v.L = laneL(lane, bus); v.dir = lane == 1 ? 1 : -1; v.x = v.dir > 0 ? -v.L * .6 : W + v.L * .6;
        v.v = lane == 1 ? rnd(46, 66) : rnd(28, 44); v.color = css(bus ? pickOf(BUS_COLORS) : pickOf(CAR_COLORS)); v.no = pickOf(BUS_NOS);
        traffic.add(v); return v;
    }
    /** 찻길이 있는 장소인가(거리만 — 공원·강변·바닷가 등엔 차가 지나가지 않는다). 장소는 엔진이 정한다(look.place). */
    boolean streetPlace() { return L == null || L.place == null || "street".equals(L.place); }
    void stepTraffic(double dt) {
        if (!"ride".equals(mode) && !inside && pan < 0 && streetPlace() && t >= nextCar && traffic.size() < 3) {
            Traffic v = spawnTraffic(); nextCar = t + rnd(4.5, 9);
            if ("wait".equals(mode) && venue.equals("bus") && v.bus && v.lane == 1 && hero != null) { hero.bub = "!"; hero.bubUntil = t + 1.3; hero.dir = -1; hero.lookUntil = t + 1.6; }
        }
        for (int i = traffic.size() - 1; i >= 0; i--) { Traffic v2 = traffic.get(i); v2.x += v2.dir * v2.v * dt; v2.rot += v2.dir * v2.v * dt * .1; if (v2.x < -v2.L || v2.x > W + v2.L) traffic.remove(i); }
    }

    // ═══ 장면 준비 ═══
    void dragReset() {
        PEND = null;
        if (DRAG != null) { try { if (actors.contains(DRAG.a)) { DRAG.a.held = false; dropEnd(DRAG.a); } } catch (RuntimeException e) { /* 무시 */ } DRAG = null; }
    }
    /** 장면의 '자리' 열쇠(정류장 · 역 입구 · 역 안 승강장). 같은 mode(wait)여도 버스 → 지하철처럼 자리가 바뀌면 장면을 다시 만든다. */
    static String venueKey(SceneModel.Res r) { return (r.venue == null ? "" : r.venue) + (r.inside ? "/in" : ""); }
    void setup(String m) {
        dragReset(); mode = m; actors = new ArrayList<>(); traffic = new ArrayList<>(); pt = new ArrayList<>(); gfx = new ArrayList<>(); bams = new ArrayList<>(); hero = null; seq = null; nextCar = t + rnd(1.2, 3); spawnAt = t + .2; castI = 0; ripples = new ArrayList<>(); rideBell = false;
        stopX = Math.round(W * .3); entX = Math.round(W * .36); venue = "sub".equals(res.venue) ? "sub" : "bus"; baseDir = venue.equals("sub") ? 1 : -1;
        inside = false; sta = ""; vk = venueKey(res);
        if (m.equals("train")) { venue = "sub"; SceneTrain.setup(this); return; }                  // 지하철 객실(혼잡도 카드의 두 번째 쪽): 친구·자리·승하차는 엔진(res.train)이 정한 값
        tr = null;
        String heroId = res.hero != null && SceneModel.D3.containsKey(res.hero) ? res.hero : null;       // 대표 캐릭터는 엔진이 정한다. 없으면 앱이 대신 고르지 않고 캐릭터 없이 배경만 그린다
        if (heroId == null && !m.equals("idle")) { m = "idle"; mode = "idle"; }
        inside = m.equals("wait") && venue.equals("sub") && res.inside; sta = inside ? res.sta : "";           // 지하철 대기 = 역 안 승강장(실내: 날씨 효과 없음)
        if (m.equals("wait")) {
            Actor h = mkActor(heroId, inside ? W * .5 : venue.equals("sub") ? entX + 6 : W * .48, venue.equals("sub") ? .62 : .66, baseDir); h.hero = true; h.k *= 1.12; h.w *= 1.12; h.spd *= 1.1; h.st = "stand"; h.ph = R.next() * 6; h.umb = !inside && (L.wk.equals("rain") || L.wk.equals("snow")); h.life = 1e9; hero = h; actors.add(h); waitNext = t + rnd(1.5, 3);
            if (venue.equals("bus")) { Traffic v = new Traffic(); v.lane = 1; v.bus = true; v.L = laneL(1, true); v.dir = 1; v.x = -40; v.v = 52; v.color = css(pickOf(BUS_COLORS)); v.no = lineNo(pickOf(BUS_NOS)); traffic.add(v); }          // 기다리는 버스는 엔진이 알려 준 내 버스 번호(res.line) — 지나가는 다른 차만 장식 번호(s293)
        } else if (m.equals("alight")) {
            Actor h2 = mkActor(heroId, 0, -.12, -1); h2.hero = true; h2.k *= 1.1; h2.w *= 1.1; h2.vis = false; h2.life = 1e9; h2.umb = L.wk.equals("rain") || L.wk.equals("snow"); h2.st = "hidden"; hero = h2; actors.add(h2);
            seq = new Seq(); seq.ph = 0; seq.t0 = t; seq.busOn = !venue.equals("sub"); seq.busX = W * .66; seq.L = 120; seq.color = busColor;
        } else if (m.equals("ride")) {
            Actor h3 = mkActor(heroId, W * .46, 1, 1); h3.hero = true; h3.st = "stand"; h3.ph = R.next() * 6; hero = h3;
            ride = new Ride(); ride.cyc = rnd(0, 20); ride.nextBump = t + rnd(1.5, 3.5);
        }
    }
    void idleManage() {
        if (pan >= 0) return;                                      // 장소 이동 중에는 친구들이 함께 걷는다(내보내거나 새로 부르지 않는다)
        int want = W < 260 ? 2 : 3, alive = 0;
        for (Actor o : actors) {
            if (!o.hero && !o.leaving && !o.held && !o.st.equals("fall") && t - o.born > o.life) { o.leaving = true; o.st = "walk"; o.tx = o.x < W / 2 ? -o.w * 1.1 : W + o.w * 1.1; o.tz = o.z; o.onArrive = null; }
            if (!o.leaving) alive++;
        }
        for (int i = actors.size() - 1; i >= 0; i--) if (actors.get(i).dead) actors.remove(i);
        if (alive < want && t >= spawnAt && !("alight".equals(mode) && seq != null && (seq.busOn || seq.ph < 3))) {
            List<String> cast = res.cast; String id = null; int tries = 0;     // 등장 순서도 엔진이 정한다(없으면 아무도 안 나온다)
            while (tries++ < cast.size()) {
                String cand = cast.get((castI++) % cast.size()); boolean dup = false;
                for (Actor o : actors) if (o.id.equals(cand) && !o.leaving) dup = true;
                if (!dup && SceneModel.D3.containsKey(cand)) { id = cand; break; }
            }
            if (id != null) {
                boolean left = R.next() < .5; Actor a2 = mkActor(id, 0, rnd(.1, .95), left ? 1 : -1); SceneModel.Spec D = a2.D;
                if (id.equals("dudung") && D.intro > 0 && host.intro() != null && R.next() < .75) { a2.x = rnd(a2.w, W - a2.w); a2.st = "emerge"; a2.t0 = t; a2.until = t + (double) D.intro / D.introFps; }
                else {
                    a2.x = left ? -a2.w * .9 : W + a2.w * .9;
                    List<Actor> fr = new ArrayList<>(); for (Actor o : actors) if (!o.leaving) fr.add(o);
                    Object[] tg = pickTarget(a2, fr); a2.tx = (Double) tg[0]; a2.tz = (Double) tg[1];
                    if (hero != null && "alight".equals(mode) && seq != null && seq.ph >= 3) {
                        a2.tx = clamp(hero.x + rnd(-1, 1) * 28, a2.w * .5, W - a2.w * .5); a2.tz = clamp(hero.z + rnd(-.12, .12), 0, 1); a2.chase = true;
                        a2.onArrive = o -> { o.st = "hop"; o.t0 = t; o.until = t + 1.4; };
                    }
                }
                a2.born = t; actors.add(a2); spawnAt = t + rnd(.9, 2.4);
            }
        }
    }
    void waitManage() {
        Actor h = hero; if (h == null) return;
        if (!h.bub.isEmpty() && t > h.bubUntil) h.bub = "";
        if (h.lookUntil != 0 && t > h.lookUntil) { h.lookUntil = 0; h.dir = baseDir; }
        if (h.st.equals("walk") && h.onArrive == null) h.st = "stand";
        if (t < waitNext || !h.st.equals("stand") || h.lookUntil != 0) return;
        waitNext = t + 9;                                                  // 동작이 끝나면(endAct) 다시 정한다
        nextAct(h);                                                        // 무엇을 할지는 엔진 대본(traits)대로
    }
    void alightManage(double dt) {
        Seq q = seq; Actor h = hero; if (q == null || h == null) return;
        double doorX = q.busX + q.L * .25;
        if (venue.equals("sub") && q.ph < 3) {                  // 지하철: 역 입구 계단으로 올라와 걸어 나온다
            if (q.ph == 0 && t - q.t0 > .9) {
                q.ph = 1; h.vis = true; h.x = entX; h.z = .02; h.dir = -1; h.tx = entX - 36; h.tz = .62; h.st = "walk";
                h.onArrive = o -> { q.ph = 3; q.t3 = t; spawnAt = t + .3; o.st = "stand"; o.dir = 1; };
            }
            return;
        }
        if (q.ph == 0) {
            q.door = clamp((t - q.t0) / .7, 0, 1);
            if (t - q.t0 > .9) {
                q.ph = 1; h.vis = true; h.x = doorX; h.z = -.1; h.dir = -1; h.tx = q.busX - q.L * .45; h.tz = .6; h.st = "walk";
                h.onArrive = o -> { q.ph = 2; q.t1 = t; o.st = "stand"; o.dir = -1; };
            }
        } else if (q.ph == 1) { if (!h.st.equals("walk") && !h.st.equals("stand")) h.st = "walk"; q.door = 1; }
        else if (q.ph == 2) { q.door = clamp(1 - (t - q.t1) / .6, 0, 1); if (t - q.t1 > 1.0) { q.ph = 2.5; q.t2 = t; } }
        else if (q.ph == 2.5) {
            q.busV = Math.min(95, q.busV + 60 * dt); q.busX += q.busV * dt;
            if (q.busX - q.L / 2 > W) { q.busOn = false; q.ph = 3; q.t3 = t; spawnAt = t + .3; h.st = "stand"; h.dir = 1; }
        } else if (q.ph == 3) { if (h.st.equals("stand") && t - q.t3 > 1.6 && t >= waitNext) { waitNext = t + 9; nextAct(h); } }
        if (!h.bub.isEmpty() && t > h.bubUntil) h.bub = "";
    }

    // ═══ 캐릭터 잡아서 옮기기 ═══
    //   꾹(약 .4초) 누르면 캐릭터가 손에 들려 올라오고, 손가락을 따라 다니다가 놓은 자리에 내려앉는다. 길게 누르기 전에 손가락이 움직이면 평소처럼 화면이 스크롤된다.
    //   손가락 위치 → 그림 자리 변환과 내려앉는 모양만 그린다(판단·계산은 없다). 입력 좌표는 dp(웹의 css px).
    Actor hitActor(double x, double y) {
        Actor best = null;
        for (Actor a : actors) {
            if (!a.vis || a.hidden || a.st.equals("hidden") || a.st.equals("fall") || a.dead || a.nograb || a.intro) continue;
            double zz = zs(a.z), h = TH * zz * (a.hero ? 1.1 : 1), feet = zy(a.z) + a.y - a.alt * zz, hw = Math.max(15, h * .52);
            if (Math.abs(x - a.x) <= hw + 6 && y >= feet - h - 8 && y <= feet + 8 && (best == null || a.z > best.z)) best = a;
        }
        return best;
    }
    /** 손가락이 캐릭터 위에 닿았다. 캐릭터가 있으면 true(길게 누르기 대기 시작) */
    public boolean down(double xdp, double ydp) {
        if (!running || "ride".equals(mode) || "train".equals(mode) || DRAG != null || tv >= 0) return false;      // TV 전환 중에는 집지 못한다
        Actor a = hitActor(xdp / k, ydp / k); if (a == null) return false;
        Pend p = new Pend(); p.a = a; p.t0 = t; p.sxdp = xdp; p.sydp = ydp; PEND = p; return true;
    }
    public void move(double xdp, double ydp) {
        if (PEND != null) { if (Math.hypot(xdp - PEND.sxdp, ydp - PEND.sydp) > SLOP_DP) PEND = null; return; }
        if (DRAG != null && running) { DRAG.fx = xdp / k; DRAG.fy = ydp / k; }
    }
    public void up() { PEND = null; if (DRAG != null) release(); }
    public void cancel() { up(); }
    public boolean isHeld() { return DRAG != null; }
    double hotUntil;
    /** 손가락이 닿았거나 · 잡혀 있거나 · 놓은 뒤 떨어지고 착륙 연출 중이면 true — 안드로이드가 이때만 화면 주사율을 끝까지(120Hz) 쓰고, 평소엔 60Hz 로 아낀다. */
    public boolean interactive() {
        if (!running) return false;
        if (DRAG != null || PEND != null || t < hotUntil || tv >= 0) return true;          // TV 전환도 끝까지 부드럽게(주사율 그대로)
        for (Actor a : actors) if (a.st.equals("held") || a.st.equals("fall")) return true;
        return false;
    }
    public boolean isPending() { return PEND != null; }
    void grab() {
        Pend P = PEND; PEND = null; if (P == null || P.a == null || P.a.dead || !actors.contains(P.a) || "ride".equals(mode)) return;
        Actor a = P.a; double zc = zy(a.z);
        DRAG = new Drag(); DRAG.a = a; DRAG.fx = a.x; DRAG.fy = zc; DRAG.px = a.x; DRAG.py = zc;
        a.prevSt = a.st; a.act = null; a.pr = null; a.cut = Double.NaN; a.stk = null; a.cell = -1; a.sk = null; a.chain = null; dropBams(a); a.sx = a.sy = 1; a.ox = 0; a.pvx = a.pvy = 0; a.afterEmerge = null; a.held = true; a.st = "held"; a.altSave = Math.min(a.alt, 24); a.alt = 0; a.bub = ""; a.vis = true; a.vy = 0;
        haptic("grab"); try { host.held(); } catch (RuntimeException e) { /* 무시 */ }
        addPart("puff", a.x, zy(a.z) - 2, 3);
    }
    void heldStep(Actor a, double dt) {
        Drag d = DRAG; if (d == null || d.a != a) { a.held = false; return; }
        double kk = Math.min(1, (dt <= 0 ? .033 : dt) * 16), ox = d.px;
        d.px += (d.fx - d.px) * kk; d.py += (d.fy - d.py) * kk;
        double vx = d.fx - d.px, zc = clamp((d.py - (g.nearTop + 4)) / (g.floor - g.nearTop - 4), -.2, 1.05), gy = zy(zc);
        a.x = clamp(d.px, 6, W - 6); a.z = zc;
        a.y = Math.min(-8, (d.py - 26) - gy);                                  // 손가락 위로 떠 있다(손가락이 캐릭터를 가리지 않게)
        a.ang = clamp(-vx * .018, -.4, .4) + Math.sin(t * 5.2) * .06;          // 손가락이 앞서 가면 몸이 뒤로 흔들린다
        if (Math.abs(d.px - ox) > .4) a.dir = d.px > ox ? 1 : -1;
        a.fr = SceneModel.stand(a.id); a.sq = 0; a.intro = false;
    }
    void release() {
        Drag d = DRAG; DRAG = null; if (d == null) return;
        releaseActor(d.a);
    }
    String landOf(Actor a) { SceneModel.Traits T = res != null ? res.traits.get(a.id) : null; return T != null ? T.land : ""; }
    void releaseActor(Actor a) {
        double h = HH(a), H0y = Math.max(0, -a.y), gg = 560;
        a.held = false; a.pinned = true; a.pinX = a.x; a.lastBounce = false; a.landK = landOf(a); a.t0 = t; a.fy0 = a.y; a.vy = 0; a.sx = a.sy = 1;
        haptic("release"); hotUntil = t + 3.2;
        if (a.landK.equals("fly")) { a.altStart = H0y; a.y = 0; a.alt = H0y; startAct(a, "flyaway"); haptic("flap"); return; }      // 떨어지다가 날개를 펴 날아간다
        boolean flipLike = a.landK.equals("flip") || a.landK.equals("tumble");
        if (flipLike && H0y < 40) a.vy = -190;                                                                                     // 낮게 놓아도 한 바퀴 돌 시간을 번다
        if (a.landK.equals("cotton") || a.landK.equals("hose")) gg = 150;
        if (flipLike) gg = 400;
        a.airT = (Math.abs(Math.min(0, a.vy)) + Math.sqrt(a.vy * a.vy + 2 * gg * H0y)) / gg;
        if (a.landK.equals("cotton") || a.landK.equals("hose")) a.airT = Math.max(.5, Math.min(1.3, H0y / 60 + .3));
        if (a.landK.equals("tumble")) {                                                                                            // 죽순이: 잡고 있던 대나무를 공중에 놓친다(주인은 앞구르기)
            Bam b = new Bam(); b.owner = a; b.t0 = t; b.z = a.z; b.x = a.x + a.dir * h * .3; b.y = zy(a.z) + a.y - h * .75; b.vx = a.dir * rnd(22, 46); b.vy = -rnd(40, 95); b.vr = a.dir * rnd(5, 9);
            bams.add(b); if (bams.size() > 4) bams.remove(0);
        }
        a.st = "fall";
        if (a.landK.equals("puddle")) { Gfx pg = gfx("puddle", a.x, a.z, 9); pg.r = 15; addGfx(pg); }          // 놓은 자리에 웅덩이가 생긴다
    }
    void fallStep(Actor a, double dt) {                                          // 놓으면 떨어진다 — 어떻게 내려앉는지는 엔진의 land 값
        if (dt <= 0) dt = .033; String kk = a.landK; double tf = t - a.t0, h = HH(a), gg = 560;
        a.vis = true; a.sx = a.sy = 1; a.ox = 0; a.pvx = 0; a.pvy = 0; a.pr = null; a.cut = Double.NaN; a.ang *= .8;
        if (kk.equals("cotton")) { gg = 150; a.vy = Math.min(a.vy, 70); a.sx = a.sy = 1 + .34 * ease(tf / .45); a.ang = 0; }
        else if (kk.equals("flip")) { gg = 400; a.pvy = -h * .5; a.ang = PI2 * ease(clamp(tf / Math.max(.25, a.airT != 0 ? a.airT : .5), 0, 1)); }
        else if (kk.equals("tumble")) {                                                       // 죽순이: 버둥 → 몸을 말아 앞으로 한 바퀴 → 웅크려 착지
            gg = 400; a.pvy = -h * .5; double p = clamp(tf / Math.max(.25, a.airT != 0 ? a.airT : .5), 0, 1); a.ang = PI2 * ease(clamp((p - .14) / .72, 0, 1));
            a.cell = p < .14 ? 1 : p < .86 ? 0 : 2; a.sk = "juksun_nb"; a.pose = -1;
        }
        else if (kk.equals("hose")) {                                                         // 베비히포: 입에서 땅으로 물대포를 쏘아 물 쿠션으로 사뿐히 내려앉는다
            gg = 150; a.vy = Math.min(a.vy, 85); a.ang = 0; a.cell = 1; a.pose = -1;
            double mx = a.x + a.dir * h * .3, my = zy(a.z) + a.y - h * .55; pr(a, jetProp(mx, my, mx + a.dir * 2, zy(a.z)));
            if (every2("hosefx", .07)) ptx("splash", mx + a.dir * 2, zy(a.z) - 1, 1, po().a(-PI * .95, -PI * .05).s(16, 40).g(170).l(.3, .6).jx(5));
        }
        else if (kk.equals("pose")) a.ang = -.35 * ease(tf / .15);
        a.vy += gg * dt; a.y += a.vy * dt;
        if (a.y >= 0) {
            a.y = 0; landFx(a);
            if (kk.isEmpty() && a.vy > 130 && !a.lastBounce) { a.vy = -a.vy * .3; a.lastBounce = true; a.sq = 1; return; }
            touchdown(a); return;
        }
        if (a.y < -300) a.y = -300;
    }
    void settle(Actor a) {
        a.y = 0; a.ang = 0; a.sq = 0; a.vy = 0; a.alt = a.altSave != 0 ? a.altSave : a.alt;
        a.leaving = false; a.born = t; a.life = Math.max(a.life, 14); a.dead = false; a.sx = a.sy = 1; a.pvx = a.pvy = 0; a.pinX = a.x;
    }
    void touchdown(Actor a) {
        String kk = a.landK; settle(a);
        haptic(kk.isEmpty() ? "land" : "land_" + kk);
        if (!kk.isEmpty() && ACT.containsKey("L_" + kk)) startAct(a, "L_" + kk); else dropEnd(a);
    }
    void dropEnd(Actor a) {
        settle(a);
        if ("walk".equals(a.prevSt) && a.onArrive != null) a.st = "walk";                  // 걸어가던 길(승하차 장면의 대표 캐릭터)은 놓은 자리에서 이어서
        else if (a.hero) { a.st = "stand"; waitNext = t + .35; }
        else nextAct(a);                                                                   // 놓자마자 바로 움직인다(엔진 대본의 다음 동작)
    }

    // ═══ 전용 동작 도구: 물줄기 소품 · 떨어진 대나무 · 놀라 달아나기 ═══
    final HashMap<String, Double> evg = new HashMap<>();
    boolean every2(String key, double gap) { Double v = evg.get(key); if (v == null || t - v >= gap || v > t) { evg.put(key, t); return true; } return false; }
    /** (x,y)에서 (x2,y2)까지 뻗는 물줄기(소품). 입에서 땅으로, 또는 입에서 친구에게. */
    Prop jetProp(double x, double y, double x2, double y2) { Prop p = propAbs("jet", x, y); p.s = x2; p.r = y2; return p; }
    void dropBams(Actor a) { for (int i = bams.size() - 1; i >= 0; i--) if (bams.get(i).owner == a) bams.remove(i); }
    Bam bamOf(Actor a) { for (Bam b : bams) if (b.owner == a && !b.taken) return b; return null; }
    void stepBams(double dt) {
        for (int i = bams.size() - 1; i >= 0; i--) {
            Bam b = bams.get(i);
            if (b.owner != null && (b.owner.dead || !actors.contains(b.owner))) { bams.remove(i); continue; }
            if (b.taken || t - b.t0 > 40) { bams.remove(i); continue; }
            if (b.landed) continue;
            b.vy += 560 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
            double gy = zy(b.z) - 1.5;
            if (b.y >= gy) {
                b.y = gy;
                if (b.bounces < 2 && b.vy > 40) { b.vy = -b.vy * .38; b.vx *= .55; b.vr *= .4; b.bounces++; addPart("dust", b.x, gy, 2); }
                else { b.landed = true; b.vx = 0; b.vy = 0; b.vr = 0; b.rot = Math.round(b.rot / PI) * PI + .06; }
            }
            b.x = clamp(b.x, 10, W - 10);
        }
    }
    /** 대나무 한 그루(x,y 가운데, rot 기울기, len 길이). */
    void drawBamboo(SceneCv c, double x, double y, double rot, double len, double zz) {
        double w = 3.4 * zz;
        c.save(); c.translate(x, y); c.rotate(rot); c.lineCapRound(true);
        c.strokeStyle("#3f8f3a"); c.lineWidth(w + 1.2); c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
        c.strokeStyle("#86d466"); c.lineWidth(w); c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
        c.strokeStyle("#3f8f3a"); c.lineWidth(1); c.beginPath();
        for (int i = 1; i < 4; i++) { double nx = -len / 2 + len * i / 4; c.moveTo(nx, -w * .6); c.lineTo(nx, w * .6); }
        c.stroke();
        c.fillStyle("#5fb04a"); c.beginPath(); c.ellipse(len / 2 - 1, -w * .9, 4 * zz, 1.6 * zz, -.5, 0, PI2); c.fill(); c.beginPath(); c.ellipse(len / 2 - 3, w * .9, 3.4 * zz, 1.4 * zz, .5, 0, PI2); c.fill();
        c.restore();
    }
    void drawBams(SceneCv c, boolean air) {
        for (Bam b : bams) {
            if (b.landed == air || b.taken) continue;
            double zz = zs(b.z), len = TH * zz * .9;
            if (b.landed) { c.fillStyle("rgba(0,0,0,.18)"); c.beginPath(); c.ellipse(b.x, b.y + 1.5, len * .46, 2.4 * zz, 0, 0, PI2); c.fill(); }
            drawBamboo(c, b.x, b.y - (b.landed ? 2.2 * zz : 0), b.rot, len, zz);
        }
    }
    /** 물대포를 맞은 친구가 깜짝 놀라 달아난다(src 는 쏜 친구). 못 움직이는 상태(잡힘·낙하·착지 연출·퇴장·역 대기 대표)는 건드리지 않는다. */
    void startle(Actor src, Actor o) {
        if (o == null || o == src || o.dead || o.hidden || o.leaving || o.hero || o.held || o.nograb || o.onArrive != null || !o.vis) return;
        String s = o.st; if (s.equals("fall") || s.equals("held") || s.equals("emerge") || s.equals("pan") || s.equals("hidden")) return;
        if (s.equals("act") && o.act != null && (o.act.n.startsWith("L_") || o.act.n.equals("flee") || o.act.n.equals("flyaway"))) return;
        o.chain = null; o.pr = null; o.cut = Double.NaN; o.alt = o.kind.equals("eagle") ? o.alt : 0;
        startAct(o, "flee"); if (o.act != null) o.act.fx = src.x;
    }

    // ═══ 버스 안(타고 가는 중) ═══
    void rideStep(double dt) {
        Ride Rd = ride; Actor h = hero;
        Rd.cyc = (Rd.cyc + dt) % 22;
        double c = Rd.cyc, v = c < 4 ? ease(c / 4) : c < 16 ? 1 + Math.sin(c * .9) * .04 : c < 19 ? 1 - ease((c - 16) / 3) : 0;    // 출발 → 달림 → 정차 → 잠깐 섰다가
        Rd.acc = (v - Rd.vPrev) / Math.max(dt, .001); Rd.vPrev = v; Rd.speed = v; Rd.scroll += v * dt * 70; Rd.rot += v * dt * 9;
        if (t > Rd.nextBump) { Rd.bump = t; Rd.nextBump = t + rnd(2.5, 5); }
        Rd.stopped = v < .02;
        if (res.nearEnd) { if (t >= bellAt) { bellAt = t + 3.2; h.bub = "띵동!"; h.bubUntil = t + 1.5; Rd.bellT = t; } }
        if (!h.bub.isEmpty() && t > h.bubUntil) h.bub = "";
    }

    // ═══ 그리기 ═══
    void drawPt(SceneCv c, Pt p, double al) {
        String kk = p.type; double r = p.r != 0 ? p.r : 1;
        c.globalAlpha(clamp(al, 0, 1));
        if (kk.equals("heart")) { c.fillStyle("#ff6b9a"); SceneArt.heartP(c, p.x, p.y, 3.4 * r); }
        else if (kk.equals("star")) { c.fillStyle("#ffd54f"); SceneArt.star4(c, p.x, p.y, 3.4 * r, p.rot + p.age * 4); }
        else if (kk.equals("spark")) { c.fillStyle("#fffbe0"); SceneArt.star4(c, p.x, p.y, 2.6 * r, p.rot); }
        else if (kk.equals("leaf")) { c.fillStyle(p.hasCol ? p.col : css("#d9772b")); c.save(); c.translate(p.x, p.y); c.rotate(p.rot + p.age * 5); c.beginPath(); c.ellipse(0, 0, 2.6, 1.4, 0, 0, PI2); c.fill(); c.restore(); }
        else if (kk.equals("drop")) { c.fillStyle("rgba(130,190,250,.95)"); c.beginPath(); c.arc(p.x, p.y, 2.1, 0, PI2); c.fill(); c.fillStyle("rgba(255,255,255,.8)"); c.beginPath(); c.arc(p.x - .6, p.y - .6, .7, 0, PI2); c.fill(); }
        else if (kk.equals("dirt")) { c.fillStyle("#7d5a37"); c.beginPath(); c.arc(p.x, p.y, 1.7, 0, PI2); c.fill(); }
        else if (kk.equals("bub")) { c.strokeStyle("rgba(255,255,255,.95)"); c.fillStyle("rgba(190,225,255,.35)"); c.lineWidth(.9); c.beginPath(); c.arc(p.x, p.y, 2.2 * r, 0, PI2); c.fill(); c.stroke(); }
        else if (kk.equals("feather")) { c.fillStyle("#f2ece0"); c.strokeStyle("#8a6a46"); c.lineWidth(.6); c.save(); c.translate(p.x, p.y); c.rotate(Math.sin(p.age * 6 + p.rot) * .9); c.beginPath(); c.ellipse(0, 0, 4.2, 1.5, 0, 0, PI2); c.fill(); c.stroke(); c.restore(); }
        else if (kk.equals("note") || kk.equals("zzz")) { c.fillStyle(kk.equals("note") ? "#ff7aa5" : "#8aa0c8"); c.font(Math.round(7 + 3 * r)); c.fillTextC(!p.txt.isEmpty() ? p.txt : (kk.equals("note") ? "♪" : "z"), p.x, p.y); }
        else if (kk.equals("sweat")) { double sr = p.r != 0 ? p.r : 1; c.fillStyle("rgba(150,210,255,.95)"); c.beginPath(); c.moveTo(p.x, p.y - 3 * sr); c.quadTo(p.x + 2.4 * sr, p.y + .6 * sr, p.x, p.y + 2.2 * sr); c.quadTo(p.x - 2.4 * sr, p.y + .6 * sr, p.x, p.y - 3 * sr); c.fill(); }
        else if (kk.equals("flake")) { c.fillStyle("#ffffff"); c.beginPath(); c.arc(p.x, p.y, 1.5, 0, PI2); c.fill(); c.strokeStyle("rgba(190,215,245,.8)"); c.lineWidth(.5); c.stroke(); }
        else if (kk.equals("breath")) { double bu = clamp(p.age / p.life, 0, 1), br = (2.2 + bu * 4.2) * (p.r != 0 ? p.r : 1); c.globalAlpha(clamp(.7 * (1 - bu), 0, 1)); c.fillStyle(L.night ? "#e6f0ff" : "#ffffff"); c.beginPath(); c.arc(p.x, p.y, br, 0, PI2); c.fill(); c.beginPath(); c.arc(p.x + br * .8 * (p.vx >= 0 ? 1 : -1), p.y - br * .3, br * .7, 0, PI2); c.fill(); }
        else if (kk.equals("ring")) { double ru = clamp(p.age / p.life, 0, 1); c.strokeStyle("rgba(235,248,255,.9)"); c.lineWidth(1); c.beginPath(); c.ellipse(p.x, p.y, 3 + ru * 13, (3 + ru * 13) * .34, 0, 0, PI2); c.stroke(); }
        c.globalAlpha(1);
    }
    // 소품(몸에 붙어 따라다니는 것): dx 는 바라보는 쪽으로 +, dy 는 발 기준 위로 −. abs 이면 화면 좌표 그대로.
    void drawProps(SceneCv c, Actor a, boolean front) {
        if (a.pr == null) return;
        double zz = zs(a.z), y0 = zy(a.z) + a.y - liftOf(a), h = HH(a), T = t; int i;
        for (Prop p : a.pr) {
            if (p.front != front) continue;
            double X = p.abs ? p.x : a.x + a.ox + a.dir * p.dx, Y = p.abs ? p.y : y0 + p.dy; String k = p.k; double an;
            c.save();
            if (k.equals("stars")) {
                c.fillStyle("#ffd54f"); for (i = 0; i < 3; i++) { an = T * 5 + i * 2.1; SceneArt.star4(c, X + Math.cos(an) * h * .3, Y + Math.sin(an) * h * .08, 3.2 * zz, an); }
            } else if (k.equals("ball")) {
                c.fillStyle("#ff7aa5"); c.beginPath(); c.arc(X, Y, p.r != 0 ? p.r : 4.4 * zz, 0, PI2); c.fill(); c.fillStyle("rgba(255,255,255,.7)"); c.beginPath(); c.arc(X - 1.3 * zz, Y - 1.4 * zz, 1.3 * zz, 0, PI2); c.fill();
            } else if (k.equals("glasses")) {
                double gw = 3.5 * zz * (p.s != 0 ? p.s : 1); c.fillStyle("#12151c"); c.strokeStyle("#2a2f3d"); c.lineWidth(.8);
                c.beginPath(); c.ellipse(X - gw * .85 * a.dir, Y, gw, gw * .75, 0, 0, PI2); c.fill(); c.beginPath(); c.ellipse(X + gw * .85 * a.dir, Y, gw, gw * .75, 0, 0, PI2); c.fill();
                c.beginPath(); c.moveTo(X - gw * .1, Y - gw * .1); c.lineTo(X + gw * .1, Y - gw * .1); c.stroke(); c.fillStyle("rgba(255,255,255,.55)"); c.beginPath(); c.arc(X - gw * 1.1 * a.dir, Y - gw * .3, gw * .22, 0, PI2); c.fill();
            } else if (k.equals("binoc")) {
                double bw = 3.6 * zz; c.fillStyle("#2b303b"); c.strokeStyle("#11141b"); c.lineWidth(.8);
                c.beginPath(); c.arc(X - bw * .85 * a.dir, Y, bw, 0, PI2); c.fill(); c.stroke(); c.beginPath(); c.arc(X + bw * .85 * a.dir, Y, bw, 0, PI2); c.fill(); c.stroke();
                c.fillRect(X - bw * .5, Y - bw * .3, bw, bw * .6); c.fillStyle("rgba(140,200,255,.8)"); c.beginPath(); c.arc(X - bw * 1.0 * a.dir, Y, bw * .55, 0, PI2); c.fill(); c.beginPath(); c.arc(X + bw * .7 * a.dir, Y, bw * .55, 0, PI2); c.fill();
            } else if (k.equals("bone")) {
                double bl = h * .27; c.save(); c.translate(X, Y); c.rotate(-.18 * a.dir); c.fillStyle("#fff6df"); c.strokeStyle("#c9b48a"); c.lineWidth(.8);
                c.fillRect(-bl, -2.1 * zz, bl * 2, 4.2 * zz); c.beginPath(); c.rect(-bl, -2.1 * zz, bl * 2, 4.2 * zz); c.stroke();
                double[][] q = {{-bl, -1}, {-bl, 1}, {bl, -1}, {bl, 1}};
                for (double[] qq : q) { c.beginPath(); c.arc(qq[0], qq[1] * 2.6 * zz, 2.8 * zz, 0, PI2); c.fill(); c.stroke(); }
                c.fillRect(-bl - 1, -2.4 * zz, 2, 4.8 * zz); c.fillRect(bl - 1, -2.4 * zz, 2, 4.8 * zz); c.restore();
            } else if (k.equals("lens")) {
                double lr = p.r != 0 ? p.r : 7 * zz; c.strokeStyle("#6b4a2c"); c.lineWidth(2.2); c.beginPath(); c.moveTo(X + lr * .7, Y - lr * .7); c.lineTo(X + lr * 1.9, Y - lr * 1.9); c.stroke();
                c.fillStyle("rgba(210,235,255,.55)"); c.beginPath(); c.arc(X, Y, lr, 0, PI2); c.fill(); c.strokeStyle("#9aa7b8"); c.lineWidth(1.4); c.stroke();
                c.fillStyle("#222"); for (i = 0; i < 2; i++) { c.beginPath(); c.arc(X + Math.sin(T * 2.4 + i * 3) * lr * .5, Y + Math.cos(T * 1.7 + i * 2) * lr * .35, 1 * zz + .2, 0, PI2); c.fill(); }
                c.fillStyle("rgba(255,255,255,.7)"); c.beginPath(); c.arc(X - lr * .4, Y - lr * .4, lr * .18, 0, PI2); c.fill();
            } else if (k.equals("feathr")) {
                c.fillStyle("#f2ece0"); c.strokeStyle("#8a6a46"); c.lineWidth(.7); c.save(); c.translate(X, Y); c.rotate(-.5 * a.dir); c.beginPath(); c.ellipse(0, 0, 5 * zz, 1.8 * zz, 0, 0, PI2); c.fill(); c.stroke(); c.restore();
            } else if (k.equals("feathg")) {
                c.fillStyle("#f2ece0"); c.strokeStyle("#8a6a46"); c.lineWidth(.7); c.save(); c.translate(X, Y); c.rotate(Math.sin(T * 5) * .5); c.beginPath(); c.ellipse(0, 0, 4.6, 1.6, 0, 0, PI2); c.fill(); c.stroke(); c.restore();
            } else if (k.equals("dew")) {
                double dr = p.r != 0 ? p.r : 4 * zz; c.fillStyle("rgba(150,215,255,.9)"); c.strokeStyle("rgba(255,255,255,.9)"); c.lineWidth(.9); c.beginPath(); c.arc(X, Y, dr, 0, PI2); c.fill(); c.stroke();
                c.fillStyle("rgba(255,255,255,.9)"); c.beginPath(); c.arc(X - dr * .35, Y - dr * .35, dr * .32, 0, PI2); c.fill();
            } else if (k.equals("fan")) {
                double fr = 5.2 * zz; c.translate(X, Y); c.rotate(p.r - .6 * a.dir); c.fillStyle("#f2c94c"); c.strokeStyle("#9c6b17"); c.lineWidth(.8);
                c.beginPath(); c.arc(0, -fr * 1.1, fr, 0, PI2); c.fill(); c.stroke(); c.strokeStyle("#9c6b17"); c.beginPath(); c.moveTo(0, -fr * .1); c.lineTo(0, fr * .9); c.stroke();
                c.strokeStyle("rgba(156,107,23,.55)"); c.lineWidth(.6); c.beginPath(); c.moveTo(-fr * .6, -fr * 1.1); c.lineTo(fr * .6, -fr * 1.1); c.moveTo(0, -fr * 1.9); c.lineTo(0, -fr * .3); c.stroke();
            } else if (k.equals("jet")) {
                double X2 = p.s, Y2 = p.r, dx = X2 - X, dy = Y2 - Y; c.lineCapRound(true);
                c.strokeStyle("rgba(110,185,255,.5)"); c.lineWidth(5.2 * zz); c.beginPath(); c.moveTo(X, Y); c.lineTo(X2, Y2); c.stroke();
                c.strokeStyle("rgba(214,238,255,.95)"); c.lineWidth(2.4 * zz); c.beginPath(); c.moveTo(X, Y); c.lineTo(X2, Y2); c.stroke();
                c.fillStyle("#ffffff"); for (i = 0; i < 5; i++) { double u2 = (T * 3.2 + i / 5.0) % 1; c.beginPath(); c.arc(X + dx * u2, Y + dy * u2, 1.5 * zz, 0, PI2); c.fill(); }
                c.fillStyle("rgba(190,225,255,.7)"); c.beginPath(); c.ellipse(X2, Y2, 5.5 * zz, 2.4 * zz, 0, 0, PI2); c.fill();
            } else if (k.equals("disc")) {
                double dr = 6 * zz; c.save(); c.translate(X, Y); c.rotate(Math.sin(T * 9) * .25); c.fillStyle("#ff8a3d"); c.strokeStyle("#b3501a"); c.lineWidth(.8);
                c.beginPath(); c.ellipse(0, 0, dr, dr * .38, 0, 0, PI2); c.fill(); c.stroke(); c.fillStyle("#ffd6b0"); c.beginPath(); c.ellipse(0, -dr * .06, dr * .55, dr * .2, 0, 0, PI2); c.fill(); c.restore();
            } else if (k.equals("yarn")) {
                double yr = 5 * zz; c.fillStyle("#ff6f91"); c.strokeStyle("#c23b62"); c.lineWidth(.8); c.beginPath(); c.arc(X, Y - yr * .6, yr, 0, PI2); c.fill(); c.stroke();
                c.save(); c.translate(X, Y - yr * .6); c.rotate(p.r); c.beginPath(); c.arc(0, 0, yr * .62, .3, 2.7); c.moveTo(yr * .9, 0); c.arc(0, 0, yr * .9, 3.6, 5.6); c.stroke(); c.restore();
            } else if (k.equals("cuke")) {
                double cl = 8 * zz; c.save(); c.translate(X, Y - cl * .22); c.rotate(-.12); c.fillStyle("#4fa83d"); c.strokeStyle("#2e6b25"); c.lineWidth(.8);
                c.beginPath(); c.ellipse(0, 0, cl, cl * .34, 0, 0, PI2); c.fill(); c.stroke(); c.fillStyle("#9be07e"); for (i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * cl * .32, -cl * .08, .9 * zz, 0, PI2); c.fill(); } c.restore();
            } else if (k.equals("lantern")) {
                double lr = 3.4 * zz; double gl = L != null && L.night ? 1 : .6;
                c.fillStyle("rgba(255,215,120," + (.12 * gl) + ")"); c.beginPath(); c.arc(X, Y, lr * 7, 0, PI2); c.fill(); c.fillStyle("rgba(255,215,120," + (.2 * gl) + ")"); c.beginPath(); c.arc(X, Y, lr * 4, 0, PI2); c.fill();
                c.strokeStyle("#5a4a30"); c.lineWidth(1); c.beginPath(); c.moveTo(X - lr * .6, Y - lr * 1.5); c.lineTo(X, Y - lr * 2.3); c.lineTo(X + lr * .6, Y - lr * 1.5); c.stroke();
                c.fillStyle("#ffd54f"); c.strokeStyle("#8a6a1a"); c.beginPath(); c.rect(X - lr * .8, Y - lr * 1.5, lr * 1.6, lr * 2.6); c.fill(); c.stroke(); c.fillStyle("rgba(255,255,255,.7)"); c.beginPath(); c.arc(X, Y - lr * .1, lr * .45, 0, PI2); c.fill();
            } else if (k.equals("gem")) {
                double gr = 5 * zz; c.fillStyle("#5fd4f0"); c.strokeStyle("#1d7f99"); c.lineWidth(.9);
                c.beginPath(); c.moveTo(X, Y - gr); c.lineTo(X + gr, Y - gr * .25); c.lineTo(X, Y + gr * .9); c.lineTo(X - gr, Y - gr * .25); c.closePath(); c.fill(); c.stroke();
                c.fillStyle("rgba(255,255,255,.75)"); c.beginPath(); c.moveTo(X - gr * .35, Y - gr * .55); c.lineTo(X, Y - gr * .9); c.lineTo(X + gr * .2, Y - gr * .45); c.closePath(); c.fill();
            } else if (k.equals("bamboo")) {
                drawBamboo(c, X, Y, p.r, h * .95, zz);
            } else if (k.equals("moundhat")) {
                double mr = p.r != 0 ? p.r : h * .2; c.fillStyle("#8a6a45"); c.beginPath(); c.moveTo(X - mr, Y); c.quadTo(X - mr * .7, Y - mr * 1.1, X, Y - mr * 1.05); c.quadTo(X + mr * .7, Y - mr * 1.1, X + mr, Y); c.closePath(); c.fill();
                c.fillStyle("rgba(0,0,0,.18)"); c.beginPath(); c.arc(X - mr * .3, Y - mr * .5, mr * .2, 0, PI2); c.arc(X + mr * .35, Y - mr * .35, mr * .15, 0, PI2); c.fill();
            }
            c.restore();
        }
    }
    // 말풍선 대신 쓰는 얼굴 스티커(씨익 웃음 · 화남)
    void drawSticker(SceneCv c, double x, double y, String k, double u) {
        double s = u < .12 ? ease(u / .12) * 1.18 : u > .86 ? 1 - ease((u - .86) / .14) : 1 + Math.sin(t * 8) * .03;
        boolean angry = k.equals("angry");
        c.save(); c.translate(x, y); c.scale(s, s);
        c.fillStyle(angry ? "#ff6a57" : "#ffd54f"); c.strokeStyle(angry ? "#9c2a1d" : "#8a6410"); c.lineWidth(1);
        c.beginPath(); c.arc(0, 0, 9, 0, PI2); c.fill(); c.stroke();
        c.fillStyle("#3a2a14"); c.strokeStyle("#3a2a14"); c.lineCapRound(true);
        if (k.equals("smirk")) {
            c.beginPath(); c.ellipse(-3.2, -1.6, 1.1, 1.5, 0, 0, PI2); c.ellipse(3.2, -1.6, 1.1, 1.5, 0, 0, PI2); c.fill();
            c.lineWidth(1.5); c.beginPath(); c.moveTo(-4.4, 3.2); c.quadTo(0, 5.4, 5.2, 1.2); c.stroke();
            c.lineWidth(1); c.beginPath(); c.moveTo(.8, -5); c.lineTo(5.4, -5.8); c.stroke();
        } else {
            c.lineWidth(1.6); c.beginPath(); c.moveTo(-6, -5.4); c.lineTo(-1.4, -2.8); c.moveTo(6, -5.4); c.lineTo(1.4, -2.8); c.stroke();
            c.beginPath(); c.ellipse(-3.2, -.6, 1.1, 1.3, 0, 0, PI2); c.ellipse(3.2, -.6, 1.1, 1.3, 0, 0, PI2); c.fill();
            c.lineWidth(1.5); c.beginPath(); c.moveTo(-3.6, 5.2); c.quadTo(0, 2.4, 3.6, 5.2); c.stroke();
            c.strokeStyle("#d32f2f"); c.lineWidth(1.5); c.beginPath(); c.moveTo(5.5, -9.5); c.quadTo(8, -9, 8.5, -6.5); c.moveTo(10, -10.5); c.quadTo(7.4, -8.5, 7.8, -12); c.stroke();
        }
        c.restore();
    }
    // 땅 위에 남는 그림(웅덩이·구멍·흙더미·깃발·거울 = 뒤쪽 / 상자·낙엽더미·풀 = 캐릭터 앞쪽)
    void drawGfx(SceneCv c, boolean front) {
        double T = t; int i;
        for (i = gfx.size() - 1; i >= 0; i--) { Gfx gg = gfx.get(i); if (T - gg.t0 > gg.life) gfx.remove(i); }
        for (Gfx gg : new ArrayList<>(gfx)) {
            if (gg.front != front) continue;
            double age = T - gg.t0, zz = zs(gg.z), y = zy(gg.z), x = gg.x, al = clamp(Math.min(age / .2, (gg.life - age) / .45), 0, 1), pop = ease(age / .25), hh = TH * zz; String k = gg.k;
            c.save(); c.globalAlpha(al);
            if (k.equals("puddle")) {
                double rx = (gg.r != 0 ? gg.r : 15) * zz * pop * (gg.life - age < .9 ? clamp((gg.life - age) / .9, .2, 1) : 1), ry = rx * .34;
                c.fillStyle("rgba(98,160,222,.92)"); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, PI2); c.fill();
                c.fillStyle("rgba(190,225,255,.7)"); c.beginPath(); c.ellipse(x - rx * .2, y - ry * .2, rx * .55, ry * .5, 0, 0, PI2); c.fill();
                c.strokeStyle("rgba(255,255,255,.85)"); c.lineWidth(.9);
                for (i = 0; i < 2; i++) { double ru = ((age * .7 + i * .5) % 1); c.globalAlpha(al * (1 - ru)); c.beginPath(); c.ellipse(x, y, rx * (.3 + ru * .7), ry * (.3 + ru * .7), 0, 0, PI2); c.stroke(); }
            } else if (k.equals("hole")) {
                double hr = 9 * zz * pop; c.fillStyle("#7d5a37"); c.beginPath(); c.ellipse(x, y, hr * 1.25, hr * .48, 0, 0, PI2); c.fill(); c.fillStyle("#2c1f12"); c.beginPath(); c.ellipse(x, y + .3, hr, hr * .36, 0, 0, PI2); c.fill();
            } else if (k.equals("mound")) {
                double mr = (gg.r != 0 ? gg.r : 10) * zz * pop; c.fillStyle("#8a6a45"); c.beginPath(); c.moveTo(x - mr, y); c.quadTo(x - mr * .6, y - mr * .95, x, y - mr * .95); c.quadTo(x + mr * .6, y - mr * .95, x + mr, y); c.closePath(); c.fill();
                c.fillStyle("rgba(0,0,0,.16)"); c.beginPath(); c.ellipse(x + mr * .2, y - mr * .25, mr * .45, mr * .18, 0, 0, PI2); c.fill();
            } else if (k.equals("flag")) {
                double drop = age < .35 ? (1 - ease(age / .35)) * hh * 1.2 : 0, fh = hh * 1.05, wv = Math.sin(T * 6) * 2.2 * zz;
                c.strokeStyle("#d7dbe3"); c.lineWidth(1.8 * zz + .4); c.beginPath(); c.moveTo(x, y - drop); c.lineTo(x, y - drop - fh); c.stroke();
                c.fillStyle("#2f6fd6"); c.beginPath(); c.moveTo(x, y - drop - fh); c.quadTo(x + hh * .3, y - drop - fh - wv, x + hh * .56, y - drop - fh + wv * .4); c.lineTo(x + hh * .56, y - drop - fh + hh * .3 + wv * .4); c.quadTo(x + hh * .3, y - drop - fh + hh * .3 - wv, x, y - drop - fh + hh * .3); c.closePath(); c.fill();
                c.fillStyle("#fff"); c.font(Math.round(hh * .22)); c.fillTextC("길", x + hh * .28, y - drop - fh + hh * .15);
            } else if (k.equals("mirror")) {
                double mw = hh * .6, mh = hh * 1.2; c.fillStyle("#8a6a4a"); rr(c, x - mw / 2 - 2, y - mh - 2, mw + 4, mh + 2, 5); c.fill();
                SceneCv.Grad mg = c.linear(x - mw / 2, y - mh, x + mw / 2, y).stop(0, css("#e6f3ff")).stop(1, css("#b9d6ee")); c.fillGrad(mg); rr(c, x - mw / 2, y - mh, mw, mh - 1, 4); c.fill();
                if (gg.own != null) drawReflect(c, gg.own, x, y - mh, mw, mh - 1, hh, al);                        // 거울 보며 짖는 친구의 얼굴이 거울에 살짝 비친다(YJ 10-29)
                c.fillStyle("rgba(255,255,255,.65)"); c.beginPath(); c.moveTo(x - mw * .3, y - mh + 2); c.lineTo(x - mw * .05, y - mh + 2); c.lineTo(x - mw * .35, y - mh * .45); c.lineTo(x - mw * .45, y - mh * .45); c.closePath(); c.fill();
            } else if (k.equals("boxb")) {
                double bw = hh * BOX_W, bh = hh * BOX_H; c.fillStyle("#7a5530"); c.beginPath(); c.ellipse(x, y - bh, bw * .5, bw * .17, 0, 0, PI2); c.fill();
                c.fillStyle("#b98a52"); c.fillRect(x - bw * .5, y - bh - 1, bw, 2);
            } else if (k.equals("boxf")) {
                double bw2 = hh * BOX_W, bh2 = hh * BOX_H; c.fillStyle("#c99a62"); c.strokeStyle("#8f6a3c"); c.lineWidth(1); c.fillRect(x - bw2 * .5, y - bh2, bw2, bh2); c.beginPath(); c.rect(x - bw2 * .5, y - bh2, bw2, bh2); c.stroke();
                c.fillStyle("#e9d6a9"); c.fillRect(x - bw2 * .09, y - bh2, bw2 * .18, bh2); c.fillStyle("rgba(0,0,0,.1)"); c.fillRect(x - bw2 * .5, y - 3, bw2, 3);
                c.fillStyle("#b98a52"); c.beginPath(); c.moveTo(x - bw2 * .5, y - bh2); c.lineTo(x - bw2 * .62, y - bh2 - bh2 * .14); c.lineTo(x - bw2 * .5, y - bh2 - 2); c.closePath(); c.fill();
                c.beginPath(); c.moveTo(x + bw2 * .5, y - bh2); c.lineTo(x + bw2 * .62, y - bh2 - bh2 * .14); c.lineTo(x + bw2 * .5, y - bh2 - 2); c.closePath(); c.fill();
            } else if (k.equals("pile")) {
                double pw = hh * 1.15, bump = 1 + (gg.bump != 0 && T - gg.bump < .35 ? Math.sin((T - gg.bump) * 24) * .08 * (1 - (T - gg.bump) / .35) : 0);
                if (gg.cs == null) {
                    String[] leafc = {"#d9772b", "#c4452d", "#e8b23a", "#9c5a2a", "#cf6a2a"}; gg.cs = new Chip[54];
                    for (i = 0; i < 54; i++) { Chip q = new Chip(); q.dx = (R.next() - .5) * 1.9; q.dy = R.next() * R.next(); q.r = .1 + R.next() * .08; q.col = gg.snow ? (R.next() < .5 ? css("#ffffff") : css("#e3eefa")) : css(pickOf(leafc)); gg.cs[i] = q; }
                }
                for (Chip q : gg.cs) { double cx = x + q.dx * pw * .5, cy = y - 2 - q.dy * hh * .6 * (1 - q.dx * q.dx * .85) * bump; c.fillStyle(q.col); c.beginPath(); c.arc(cx, cy, q.r * hh * .95 * pop + .8, 0, PI2); c.fill(); }
            } else if (k.equals("grass")) {
                for (i = 0; i < 9; i++) {
                    double gx = x + (i - 4) * hh * .1, gh = hh * (.55 + ((i * 37) % 7) / 20.0), sw = Math.sin(T * 2 + i) * 1.8; c.fillStyle(i % 2 != 0 ? "#4e9a3a" : "#66b34a");
                    c.beginPath(); c.moveTo(gx - 2.2 * zz, y); c.quadTo(gx - 1 + sw * .4, y - gh * .6, gx + sw, y - gh * pop); c.quadTo(gx + 1 + sw * .4, y - gh * .6, gx + 2.2 * zz, y); c.closePath(); c.fill();
                }
            }
            c.restore();
        }
    }
    /** 거울 속 얼굴: 친구가 지금 그리는 그림(칸)에서 머리만 오려(자른 칸 = 한 칸의 오른쪽 위) 좌우로 뒤집어 유리 안에 옅게 그린다 — 얼굴만 살짝. 유리 사각형 (x 가운데, gTop 위, gw 폭, gh 높이). */
    void drawReflect(SceneCv c, Actor a, double x, double gTop, double gw, double gh, double hh, double al) {
        if (a.D == null || !a.vis) return;
        SceneCv.Img sheet = a.sk != null && host.sheet(a.sk) != null ? host.sheet(a.sk) : host.sheet(a.id); if (sheet == null) return;
        int idx = (int) Math.floorMod((long) Math.floor(a.fr), 16L);
        double sx = (idx % 4) * 256 + 112, sy = Math.floor(idx / 4) * 256 + 56, cw = 118, d = Math.min(gw * .9, gh * .62);      // 머리 칸(원본 기준 오른쪽 위)
        c.save(); rr(c, x - gw / 2, gTop, gw, gh, 4); c.clip();
        c.globalAlpha(al * .5);
        c.translate(x, gTop + gh * .1 + d * .5); if (a.dir > 0) c.scale(-1, 1);       // 보는 쪽이 오른쪽이면 거울에서는 반대
        c.drawImage(sheet, sx, sy, cw, cw, -d * .5, -d * .5, d, d);
        c.restore();
        c.fillStyle("rgba(225,240,255,.2)"); rr(c, x - gw / 2, gTop, gw, gh, 4); c.fill();             // 유리 한 겹(얼굴이 옅게 비치도록)
    }
    void drawActor(SceneCv c, Actor a) {
        if (!a.vis) return;
        SceneModel.Spec D = a.D; SceneCv.Img sheet = a.intro ? host.intro() : a.sk != null && host.sheet(a.sk) != null ? host.sheet(a.sk) : host.sheet(a.id); if (sheet == null) return;
        SceneCv.Img psh = !a.intro && a.pose >= 0 ? host.sheet(a.id + "_pose") : null;          // 자세 시트가 없으면(옛 설치·읽기 실패) 걷기 시트로 그린다
        SceneCv.Img ash = !a.intro && a.cell >= 0 ? host.sheet(a.id + "_act") : null;           // 전용 동작 시트(쮸르·베비히포) — 없으면 자세·걷기 시트로 대신
        double zz = zs(a.z), s = a.k * zz * (a.held ? 1.12 : 1), sc = D.cell / 256 * s, y = zy(a.z);
        int idx = a.intro ? a.ii : (int) Math.floorMod((long) Math.floor(a.fr), 16L);
        if (ash != null) { sheet = ash; idx = Math.max(0, Math.min(15, a.cell)); }
        else if (psh != null) { sheet = psh; idx = Math.max(0, Math.min(7, a.pose)); }
        double lift = (D.lift + a.alt) * zz * (a.kind.equals("eagle") ? 1 : s / a.k);
        double shA = (L.night ? .22 : .34) * (a.kind.equals("eagle") ? .7 : 1) * (L.wk.equals("rain") || L.wk.equals("overcast") ? .7 : 1);
        boolean sunk = !Double.isNaN(a.cut) && a.y > TH * zz * .9;
        if (!sunk) {
            c.fillStyle(rgba(0, 0, 0, shA * (a.alt != 0 ? clamp(1 - a.alt / 60, .5, 1) : 1)));
            c.beginPath(); c.ellipse(a.x + a.ox, y + 1, D.cell * s * .2 * ((a.sq != 0 || a.sy < .9) ? 1.15 : 1) * Math.abs(a.sx != 0 ? a.sx : 1), 3.2 * zz, 0, 0, PI2); c.fill();
        }
        double sx = (idx % 4) * 256, sy = Math.floor(idx / 4) * 256, dx = -D.ox * sc, dy = -D.base * sc - lift + a.y;
        c.save();
        if (!Double.isNaN(a.cut)) { c.beginPath(); c.rect(a.x - D.cell * s, y - D.cell * s * 2.4, D.cell * s * 2, D.cell * s * 2.4 - a.cut); c.clip(); }
        c.translate(a.x + a.ox, y); if (a.dir < 0) c.scale(-1, 1); if (a.sx != 1 || a.sy != 1) c.scale(a.sx, a.sy);
        if (a.ang != 0) { double px = a.pvx, py = a.pvy; c.translate(px, py); c.rotate(a.ang); c.translate(-px, -py); }
        c.drawImage(sheet, sx, sy, 256, 256, dx, dy, D.cell * s, D.cell * s);
        c.restore();
        if (a.umb) SceneArt.drawUmbrella(c, a.x + a.dir * 2, y - TH * zz * .98 + a.y, zz, a.id);
        drawProps(c, a, true);
    }
    SceneArt.Pal pal() { return L; }
    void drawSkyFx(SceneCv c, double tt) {
        SceneArt.Pal Lk = L; int i; double[] q; String wk = Lk.wk;
        if ((Lk.night || Lk.slot.equals("dawn")) && !wk.equals("overcast") && !wk.equals("rain") && !wk.equals("snow")) {
            double sa = Lk.night ? 1 : .5;
            for (i = 0; i < wxP.stars.size(); i++) {
                q = wxP.stars.get(i);
                c.fillStyle(rgba(255, 255, 255, (.35 + .45 * Math.sin(tt * 2 + q[2])) * sa * (wk.equals("cloudy") || wk.equals("fog") ? .5 : 1))); c.beginPath(); c.arc(q[0] * W, q[1] * g.hy, q[3], 0, PI2); c.fill();
            }
            if (Lk.night && wk.equals("clear")) {
                double ph = (tt % 14) / 14; if (ph < .1) { double u = ph / .1; c.strokeStyle(rgba(255, 255, 255, .8 * (1 - u))); c.lineWidth(1.3); c.beginPath(); c.moveTo(W * (.2 + u * .18), 8 + u * 22); c.lineTo(W * (.2 + u * .18) - 14, 8 + u * 22 - 6); c.stroke(); }
            }
        }
        double dk = Lk.night ? .75 : Lk.lit ? .35 : 0;
        int cc = wk.equals("overcast") || wk.equals("rain") ? mix("#aeb6c2", "#2a3140", clamp(dk + .1, 0, .9)) : wk.equals("snow") ? mix("#e3e9f2", "#3a4256", dk) : wk.equals("fog") ? mix("#dfe4ea", "#444c5e", dk)
                : mix(css("#ffffff"), css(Lk.slot.equals("evening") ? "#ff9f80" : Lk.slot.equals("dawn") ? "#c9a0c0" : "#1c2440"), Lk.night ? .85 : Lk.lit ? .35 : 0);
        for (i = 0; i < wxP.clouds.size(); i++) {
            q = wxP.clouds.get(i); double x = ((q[0] * (W + 90) + tt * 4 * q[3] * SceneFx.cloudSpeed(Lk)) % (W + 90)) - 45, y = 8 + q[1] * g.hy;
            SceneArt.cloud(c, x, y, 8 * q[2] * (wk.equals("overcast") || wk.equals("rain") ? 1.3 : 1), cc);
        }
        if (wk.equals("clear") && (Lk.slot.equals("morning") || Lk.slot.equals("noon") || Lk.slot.equals("afternoon"))) {
            c.strokeStyle("rgba(40,50,70,.55)"); c.lineWidth(1.1);
            for (i = 0; i < wxP.birds.size(); i++) {
                q = wxP.birds.get(i); double x = ((q[0] * (W + 40) + tt * 14 * q[2]) % (W + 40)) - 20, y = 14 + q[1] * g.hy + Math.sin(tt * 1.5 + q[3]) * 3, f = Math.sin(tt * 9 + q[3]) * 2.2;
                c.beginPath(); c.moveTo(x - 4, y + f); c.quadTo(x - 1.5, y - 2, x, y); c.quadTo(x + 1.5, y - 2, x + 4, y + f); c.stroke();
            }
        }
    }
    void drawWxFront(SceneCv c, double tt) {
        SceneArt.Pal Lk = L; int i; double[] q;
        if (Lk.wk.equals("rain")) {
            c.strokeStyle(Lk.night ? "rgba(170,200,255,.5)" : "rgba(110,140,190,.6)"); c.lineWidth(1); c.beginPath();
            for (i = 0; i < wxP.rain.size(); i++) {
                q = wxP.rain.get(i); double y = ((q[1] * (H + 20) + tt * 210 * q[2]) % (H + 20)) - 10, x = (q[0] * (W + 30) - y * (.22 + .12 * Lk.wind) + W + 30) % (W + 30) - 5;
                c.moveTo(x, y); c.lineTo(x - 1.6 - 1.4 * Lk.wind, y - q[3]);
            }
            c.stroke();
            for (i = 0; i < ripples.size(); i++) {
                Ripple rp = ripples.get(i); double u = (tt - rp.t0) / .8; if (u >= 1) continue;
                c.strokeStyle(rgba(220, 235, 255, .55 * (1 - u))); c.lineWidth(.9); c.beginPath(); c.ellipse(rp.x, rp.y, 2 + u * 8, (2 + u * 8) * .28, 0, 0, PI2); c.stroke();
            }
        } else if (Lk.wk.equals("snow")) {
            c.fillStyle(Lk.night ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.95)");
            for (i = 0; i < wxP.snow.size(); i++) {
                q = wxP.snow.get(i); double y = ((q[1] * (H + 8) + tt * 22 * q[2]) % (H + 8)) - 4, x = (q[0] * W + Math.sin(tt * .9 + q[4]) * 8 + W) % W;
                c.globalAlpha(.55 + .4 * q[2]); c.beginPath(); c.arc(x, y, q[3], 0, PI2); c.fill();
            }
            c.globalAlpha(1);
        } else if (Lk.wk.equals("fog")) {
            for (i = 0; i < 3; i++) {
                double fy = g.hy - 10 + i * 22, off = Math.sin(tt * .25 + i * 2) * 14;
                SceneCv.Grad fg = c.linear(0, fy - 16, 0, fy + 16).stop(0, rgba(225, 230, 236, 0)).stop(.5, rgba(225, 230, 236, Lk.night ? .16 : .42)).stop(1, rgba(225, 230, 236, 0));
                c.fillGrad(fg); c.fillRect(off - 20, fy - 16, W + 40, 32);
            }
        }
    }
    void drawParts(SceneCv c, double dt) {
        for (int i = pt.size() - 1; i >= 0; i--) {
            Pt p = pt.get(i); p.age += dt; p.vy += p.g * dt; if (p.age < 0) continue; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.age > p.life) {
                if (p.type.equals("bub")) { Pt r2 = new Pt(); r2.type = "ring"; r2.x = p.x; r2.y = p.y; r2.age = 0; r2.life = .3; r2.g = 0; r2.r = 1; pt.add(r2); }
                pt.remove(i); continue;
            }
            double al = 1 - p.age / p.life;
            if (p.type.equals("splash") || p.type.equals("puff") || p.type.equals("dust")) {
                c.fillStyle(p.type.equals("splash") ? rgba(160, 200, 245, al) : p.type.equals("puff") ? rgba(255, 255, 255, al) : rgba(200, 185, 160, al * .8));
                c.beginPath(); c.arc(p.x, p.y, p.type.equals("puff") ? 1.8 : 1.3, 0, PI2); c.fill();
            } else drawPt(c, p, p.type.equals("ring") ? 1 : al * 1.4);
        }
    }
    void drawTraffic(SceneCv c, int lane) {
        for (Traffic v : traffic) {
            if (v.lane != lane) continue;
            SceneArt.VehOpt o = new SceneArt.VehOpt(); o.color = v.color; o.rot = v.rot; o.no = v.no; o.dir = v.dir; o.night = L.night || L.lit && !L.slot.equals("dawn");
            if (v.bus) SceneArt.drawBus(c, v.x, laneGy(lane), v.L, o); else SceneArt.drawCar(c, v.x, laneGy(lane), v.L, o);
        }
    }
    void drawStreet(SceneCv c, double dt) {
        int tw = bg.tw;
        if (inside) {                                           // 역 안 승강장: 실내라서 하늘·날씨·바람 효과 없이 승강장만 그린다
            ScenePlatform.back(this, c);
        } else if (pan >= 0 && panBg != null) {                      // 장소 이동 중: 캐릭터와 함께 옛 배경이 새 배경으로 겹쳐 이어진다
            drawPanBack(c);
        } else {
            c.drawImage(bg.sky, 0, 0, W, H); drawSkyFx(c, t);
            c.drawImage(bg.far, 0, 0, tw, H); SceneFx.drawMid(this, c, bg.mid, tw); c.drawImage(bg.gnd, 0, 0, W, H);
            SceneFx.ambient(this, c, t);
        }
        drawTrafficPan(c, 0); drawTraffic(c, 0);
        Seq q = seq;
        if (q != null && q.busOn) { SceneArt.VehOpt o = new SceneArt.VehOpt(); o.color = q.color; o.door = q.door; o.door2 = 0; o.dir = 1; o.rot = q.busX * .12; o.no = busLabel(); o.night = L.night; SceneArt.drawBus(c, q.busX, g.nearTop - 3, q.L, o); }
        drawTrafficPan(c, 1); drawTraffic(c, 1);
        if (!inside && ("wait".equals(mode) || "alight".equals(mode))) { if (venue.equals("sub")) SceneArt.drawEntrance(c, g, entX, L, res.line); else SceneArt.drawStop(c, g, stopX, L); }
        drawGfx(c, false); drawBams(c, false);
        List<Actor> arr = new ArrayList<>(); for (Actor a : actors) if (a.vis) arr.add(a);
        Collections.sort(arr, new Comparator<Actor>() { public int compare(Actor a, Actor b) { return Double.compare(a.held ? 9 : a.z, b.held ? 9 : b.z); } });
        for (Actor a : arr) drawActor(c, a);
        drawGfx(c, true); drawBams(c, true);
        for (Actor a : arr) if (a.stk != null) {
            double su = (t - a.stk.t0) / a.stk.dur;
            if (su >= 1) a.stk = null; else drawSticker(c, a.x + a.dir * a.w * .12, zy(a.z) - TH * zs(a.z) * 1.12 - 12 - (!a.bub.isEmpty() ? 16 : 0) + Math.min(0, a.y), a.stk.k, su);
        }
        for (Actor a : arr) if (!a.bub.isEmpty()) { double y = zy(a.z) - TH * zs(a.z) - 6 + a.y, x = a.x + a.dir * a.w * .2; SceneArt.drawBubble(c, x, y, a.bub); }
        drawParts(c, dt);
        if (inside) return;                                      // 실내: 비·눈·안개·바람·햇빛·더위·추위 효과는 그리지 않는다
        if (pan >= 0 && panBg != null) drawPanFront(c); else drawWxFront(c, t);
        SceneFx.cold(this, c); SceneFx.sun(this, c, t); SceneFx.heat(this, c, t); SceneFx.wind(this, c, t);
    }
    void drawRide(SceneCv c) {
        Ride Rd = ride; Actor h = hero; SceneModel.Spec D = h.D; SceneArt.Pal Lk = L; int i, col = busColor;
        double roofY = 7, floorY = H - 37, bodyBot = H - 22, wy0 = 22, wy1 = 76;
        // 길(아래)
        c.fillStyle(mix("#6c7078", "#0d1018", clamp(1 - Lk.lum, 0, .9) * .75)); c.fillRect(0, H - 14, W, 14);
        c.fillStyle("rgba(255,255,255,.55)"); double dOff = (Rd.scroll * 1.6) % 30; for (double dx = -dOff; dx < W; dx += 30) c.fillRect(dx, H - 6, 15, 1.8);
        // 차체(안쪽 벽)
        SceneCv.Grad wall = c.linear(0, roofY, 0, floorY).stop(0, css(Lk.night ? "#4a4f68" : "#e8edf3")).stop(1, css(Lk.night ? "#2f3348" : "#cfd7e1"));
        c.fillStyle(shade(col, -.2)); rr(c, 4, roofY - 3, W - 8, bodyBot - roofY + 5, 10); c.fill();
        c.fillGrad(wall); rr(c, 8, roofY, W - 16, floorY - roofY, 7); c.fill();
        // 창밖(하늘·도시·가로수) — 창 모양으로 잘라서 보여준다
        double[][] wins = new double[5][]; double pw = (W - 28) / 5;
        for (i = 0; i < 5; i++) wins[i] = new double[]{14 + i * pw + 2, wy0, pw - 4, wy1 - wy0};
        c.save(); c.beginPath(); for (double[] r : wins) c.rect(r[0], r[1], r[2], r[3]); c.clip();
        c.drawImage(bg.sky, 0, 0, W, H);
        drawSkyFx(c, t);
        int tw = bg.tw; double fo = (Rd.scroll * .35) % tw, mo = (Rd.scroll * .9) % tw;
        c.drawImage(bg.far, -fo, 0, tw, H); c.drawImage(bg.far, tw - fo, 0, tw, H);
        c.drawImage(bg.mid, -mo, 0, tw, H); c.drawImage(bg.mid, tw - mo, 0, tw, H);
        c.fillStyle(mix("#8d8678", "#14182a", clamp(1 - Lk.lum, 0, .9) * .7)); c.fillRect(0, g.hy + 3, W, 40);          // 건너편 인도
        double lp = (Rd.scroll * 1.1) % 90;
        for (double lx = -lp + 20; lx < W; lx += 90) {
            c.fillStyle("#39404f"); c.fillRect(lx, g.hy - 18, 2, 24);
            if (Lk.lit) { SceneCv.Grad lg = c.radial(lx + 1, g.hy - 19, 0, lx + 1, g.hy - 19, 16).stop(0, rgba(255, 224, 140, .8)).stop(1, rgba(255, 224, 140, 0)); c.fillGrad(lg); c.fillRect(lx - 16, g.hy - 36, 34, 34); }
            c.fillStyle(Lk.lit ? "#fff0b0" : "#9aa3b2"); c.beginPath(); c.arc(lx + 1, g.hy - 19, 2.2, 0, PI2); c.fill();
        }
        if (Lk.night) { c.fillStyle("rgba(6,10,30,.22)"); c.fillRect(0, 0, W, H); }
        drawWxFront(c, t);
        // 창 유리 반사
        c.fillStyle("rgba(255,255,255,.1)");
        for (double[] r : wins) { c.beginPath(); c.moveTo(r[0] + 6, r[1]); c.lineTo(r[0] + 16, r[1]); c.lineTo(r[0] + 4, r[1] + r[3]); c.lineTo(r[0] - 6, r[1] + r[3]); c.closePath(); c.fill(); }
        c.restore();
        // 창틀
        c.strokeStyle(shade(col, -.25)); c.lineWidth(2.4); for (double[] r : wins) { rr(c, r[0], r[1], r[2], r[3], 3); c.stroke(); }
        // 천장 손잡이 봉 + 손잡이
        c.fillStyle("#c9ced8"); c.fillRect(12, 14, W - 24, 2.4); c.fillStyle("rgba(0,0,0,.18)"); c.fillRect(12, 16.4, W - 24, 1);
        double sway = Math.sin(t * 2.1 + Rd.scroll * .01) * .05 - Rd.acc * .06 + (t - Rd.bump < .4 ? Math.sin((t - Rd.bump) * 30) * .05 * (1 - (t - Rd.bump) / .4) : 0);
        double[] hs = {W * .28, W * .46, W * .64, W * .82};
        for (int k2 = 0; k2 < 4; k2++) {
            c.save(); c.translate(hs[k2], 16); c.rotate(sway * (k2 % 2 != 0 ? 1 : .85)); c.strokeStyle("#4b5263"); c.lineWidth(1.5); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 24); c.stroke();
            c.strokeStyle("#ffb347"); c.lineWidth(2.2); c.beginPath(); c.arc(0, 29, 5, 0, PI2); c.stroke(); c.restore();
        }
        // 좌석(창 아래 벽 쪽)
        int sc2 = shade(col, .1);
        for (i = 0; i < 4; i++) {
            double sx1 = 22 + i * (W - 40) / 4 + 6;
            c.fillStyle(shade(sc2, -.12)); rr(c, sx1, floorY - 46, 30, 30, 6); c.fill(); c.fillStyle(sc2); rr(c, sx1 + 2, floorY - 44, 26, 12, 5); c.fill();
            c.fillStyle(shade(sc2, -.2)); rr(c, sx1 - 3, floorY - 18, 36, 14, 5); c.fill(); c.fillStyle(sc2); rr(c, sx1 - 1, floorY - 18, 32, 8, 4); c.fill();
        }
        // 하차벨 기둥
        double bx = W * .9; c.fillStyle("#c9ced8"); c.fillRect(bx - 1.2, 18, 2.4, floorY - 18);
        boolean bellOn = res.nearEnd && (t - Rd.bellT < 1.6 ? (Math.floor(t * 4) % 2 == 0) : true);
        c.fillStyle(bellOn ? "#ff5a4d" : "#7a2b28"); c.beginPath(); c.arc(bx, 54, 4.2, 0, PI2); c.fill();
        if (bellOn) { SceneCv.Grad bg2 = c.radial(bx, 54, 0, bx, 54, 14).stop(0, rgba(255, 90, 70, .55)).stop(1, rgba(255, 90, 70, 0)); c.fillGrad(bg2); c.fillRect(bx - 14, 40, 28, 28); }
        // 바닥
        SceneCv.Grad fl = c.linear(0, floorY - 2, 0, bodyBot).stop(0, css(Lk.night ? "#3a3a48" : "#8a8f9b")).stop(1, css(Lk.night ? "#22222c" : "#5e626d")); c.fillGrad(fl); c.fillRect(8, floorY - 1, W - 16, bodyBot - floorY + 1);
        // 대표 캐릭터(서 있다) — 가속·제동에 몸이 쏠리고 길 요철에 통통
        double kk = Math.min(.9, 52 / ((D.base - 8) / 256 * D.cell + D.lift * .6)), sc = D.cell / 256 * kk; int idx = SceneModel.stand(h.id); SceneCv.Img sheet = host.sheet(h.id);
        double lean = clamp(-Rd.acc * .05, -.12, .12) + Math.sin(t * 1.8) * .012, bob = Math.sin(t * 17) * .5 * Rd.speed - (t - Rd.bump < .25 ? Math.sin((t - Rd.bump) / .25 * PI) * 2.6 : 0);
        double hx = h.x + Math.sin(t * .9) * 1.5, hy = floorY - 1;
        c.fillStyle("rgba(0,0,0,.28)"); c.beginPath(); c.ellipse(hx, hy + 1, D.cell * kk * .2, 3, 0, 0, PI2); c.fill();
        if (sheet != null) { c.save(); c.translate(hx, hy); c.rotate(lean); c.drawImage(sheet, (idx % 4) * 256, Math.floor(idx / 4) * 256, 256, 256, -D.ox * sc, -D.base * sc - D.lift * .6 * kk + bob, D.cell * kk, D.cell * kk); c.restore(); }
        if (!h.bub.isEmpty()) SceneArt.drawBubble(c, hx + 6, hy - 52 * 1.02, h.bub);
        // 아래 차체(띠 + 바퀴)
        SceneCv.Grad bg3 = c.linear(0, floorY + 8, 0, bodyBot).stop(0, col).stop(1, shade(col, -.3)); c.fillGrad(bg3); rr(c, 4, floorY + 6, W - 8, bodyBot - floorY - 3, 6); c.fill();
        c.fillStyle("rgba(255,255,255,.85)"); c.fillRect(6, floorY + 12, W - 12, 3);
        for (double f : new double[]{.2, .76}) { double wx = W * f, wyc = H - 17; c.fillStyle("#10131a"); c.beginPath(); c.arc(wx, wyc, 14.5, PI, 0); c.fill(); c.fillRect(wx - 14.5, wyc - .5, 29, 1); SceneArt.drawWheel(c, wx, wyc, 11.5, Rd.rot); }
        // 앞쪽 행선 표지판
        c.fillStyle("#10131a"); rr(c, W - 44, 8, 34, 11, 3); c.fill(); c.fillStyle("#ffb347"); c.font(8); c.fillTextC(busLabel(), W - 27, 13.6);
        if (Lk.night) { SceneCv.Grad gl = c.linear(0, roofY, 0, floorY).stop(0, rgba(255, 225, 150, .18)).stop(1, rgba(255, 225, 150, 0)); c.fillGrad(gl); c.fillRect(8, roofY, W - 16, floorY - roofY); }
    }

    // ═══ 실행 · 엔진 값 받기 ═══
    P mkWxParts(String wk) {
        P p = new P(); int i; int nC;
        switch (wk) { case "cloudy": nC = 5; break; case "overcast": nC = 7; break; case "rain": nC = 7; break; case "snow": nC = 6; break; case "fog": nC = 4; break; default: nC = 2; }
        for (i = 0; i < nC; i++) p.clouds.add(new double[]{R.next(), rnd(.04, .3), rnd(.8, 1.5), rnd(.5, 1.2)});
        if (wk.equals("rain")) for (i = 0; i < 70; i++) p.rain.add(new double[]{R.next(), R.next(), rnd(.8, 1.3), rnd(5, 9)});
        if (wk.equals("snow")) for (i = 0; i < 64; i++) p.snow.add(new double[]{R.next(), R.next(), rnd(.45, 1), rnd(.9, 2.2), R.next() * 6.28});
        for (i = 0; i < 40; i++) p.stars.add(new double[]{R.next(), R.next() * .45, R.next() * 6.28, rnd(.5, 1.3)});
        for (i = 0; i < 3; i++) p.birds.add(new double[]{R.next(), rnd(.1, .3), rnd(.6, 1.1), R.next() * 6.28});
        if (L.wind > 0) for (i = 0; i < 30; i++) p.wind.add(new double[]{R.next(), R.next(), rnd(.6, 1.2), R.next(), R.next() * 6.28});          // 바람이 있을 때만(난수열 그대로 유지)
        return p;
    }
    /** 내 버스 번호(엔진 res.line — 고른 번호가 반영된다). 버스 장면이 아니거나 비어 있으면 fallback. 지나가는 다른 차의 번호만 장식으로 아무 번호나 뽑는다(s293: 77 을 타는데 472 가 보이던 것). */
    String lineNo(String fallback) { return res != null && "bus".equals(res.venue) && res.line != null && res.line.length() > 0 ? res.line : fallback; }
    String busLabel() { return lineNo(busNo == null ? "" : busNo); }
    void resetBG() {
        bg = SceneArt.buildBG(factory, L, g, dpr, L.season, dark);
        bgKey = L.slot + "|" + L.wk + "|" + L.season + "|" + L.place + "|w" + L.wind + "|" + dark + "|" + W + "|" + H; wxP = mkWxParts(L.wk); bgTail = dark + "|" + W + "|" + H;
    }
    void boot(boolean keepBus) {
        int bc = css(pickOf(BUS_COLORS)); String bn = pickOf(BUS_NOS); if (!keepBus || busNo == null) { busColor = bc; busNo = bn; }
        double kk = forceK > 0 ? forceK : PH < 150 ? Math.max(.55, PH / 150) : clamp(Math.min(PH / 190, PW / 200), 1, 2);       // 150px 보다 낮으면 같은 그림을 줄여 그린다
        k = kk; W = PW / kk; H = PH / kk; dpr = dens * kk; g = SceneArt.geom(W, H);
        fade = 0; tv = -1; xf = -1; pan = -1; panBg = null; panL = null; panWx = null; oldTraffic = new ArrayList<>(); frames = 0; error = null; prev = null; running = true;
    }
    /** 칸 크기(dp)·화면 밀도·테마를 알려 준다. 바뀌었으면 같은 장면을 새 크기로 다시 만든다. */
    public void layout(double pwDp, double phDp, double density, boolean isDark) {
        if (pwDp < 8 || phDp < 8) return;
        boolean first = !laid;
        if (laid && running && Math.abs(pwDp - PW) <= 2 && Math.abs(phDp - PH) <= 2 && isDark == dark && Math.abs(density - dens) < .01) return;
        laid = true; PW = pwDp; PH = phDp; dens = density; dark = isDark;
        if (running && res != null) {
            String m = mode; SceneModel.Res keep = res; boot(true); res = keep; L = SceneArt.paint(res.look); resetBG(); setup(m);
        } else if (LAST != null) apply(LAST);
    }
    /** 엔진 답을 받아 그린다. 그릴 게 없으면(mode 없음) 장면을 멈추고 false. */
    public boolean apply(SceneModel.Res r) {
        LAST = r;
        if (r == null || r.mode == null) { stop(); return false; }
        if (!laid || !host.ready()) return false;
        if (!running) { boot(false); res = r; L = SceneArt.paint(r.look); resetBG(); setup(r.mode); }
        else {
            boolean modeChanged = !mode.equals(r.mode) || !vk.equals(venueKey(r)); res = r;
            SceneArt.Pal L1 = L, L2 = SceneArt.paint(r.look);
            boolean keyCh = !(L2.slot + "|" + L2.wk + "|" + L2.season + "|" + L2.place + "|w" + L2.wind + "|" + dark + "|" + W + "|" + H).equals(bgKey);
            if (keyCh && !modeChanged && "idle".equals(mode) && !reduce && bg != null && pan < 0 && tv < 0 && (dark + "|" + W + "|" + H).equals(bgTail)) {
                if (!L2.place.equals(L1.place)) startPan(L1, L2);                                   // 장소가 바뀐다 → 걸어 나가며 배경이 이어 바뀐다
                else { snapshotFade(); L = L2; resetBG(); }                                           // 날씨·시간대만 바뀐다 → 서서히 바뀐다
            } else { L = L2; if (keyCh) resetBG(); }
            if (modeChanged) { snapshot(); setup(r.mode); }
            else if ("train".equals(mode)) SceneTrain.refresh(this);
            if ("wait".equals(mode) || "alight".equals(mode)) { boolean um = !inside && (L.wk.equals("rain") || L.wk.equals("snow")); if (hero != null) hero.umb = um; }
        }
        return true;
    }
    static double easeIO(double u) { u = clamp(u, 0, 1); return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
    /** 날씨·시간대가 바뀔 때: 옛 장면 한 장을 찍어 두고 새 장면 위에서 서서히 지운다. */
    void snapshotFade() {
        try { prev = factory.newLayer(W, H, dpr); paintAll(prev.cv(), 0); xf = 0; } catch (RuntimeException e) { prev = null; xf = -1; }
    }
    /** 장소가 바뀐다: 캐릭터들은 엔진이 정한 쪽(look.pdir)으로 함께 걸어가고(제자리 걸음 + 느슨하게 모여서), 배경은 반대쪽으로 흘러 옛 배경이 새 배경으로 겹쳐 이어진다 — 걸어서 새 장소로 들어가는 느낌. 발걸음은 땅이 흐르는 속도에 맞춘다. */
    void startPan(SceneArt.Pal oldL, SceneArt.Pal newL) {
        dragReset();
        panBg = bg; panL = oldL; panWx = wxP; L = newL; resetBG();
        oldTraffic = traffic; traffic = new ArrayList<>();                                  // 옛 거리의 차는 옛 배경과 함께 흘러 나간다(새 장소로 넘어오지 않는다)
        panDir = newL.pdir < 0 ? -1 : 1;
        List<Actor> in = new ArrayList<>(); double sp = 0;
        for (Actor a : actors) if (!a.dead && !a.hero && !a.leaving) { in.add(a); sp += Math.max(10, a.spd); }
        sp = in.isEmpty() ? 36 : sp / in.size();
        panDur = clamp((W - panF()) / (sp * 1.5), PAN_MIN, PAN_MAX);
        Collections.sort(in, new Comparator<Actor>() { public int compare(Actor p, Actor q) { return Double.compare(p.x, q.x); } });
        for (int i = 0; i < in.size(); i++) {                                                  // 모여서 함께 걷는다: 왼쪽부터 순서대로 칸을 나눠 서서히 제자리로
            Actor a = in.get(i);
            a.held = false; a.leaving = false; a.st = "pan"; a.act = null; a.onArrive = null; a.bub = ""; a.stk = null; a.vis = true; a.hidden = false; a.intro = false; a.y = 0; a.cut = Double.NaN;
            double want = in.size() == 1 ? W * .5 : W * (.2 + .6 * i / (in.size() - 1));
            a.tx = clamp(want, a.w * .6, W - a.w * .6); a.tz = a.z; a.dir = panDir;
            a.boost = clamp(((W - panF()) / panDur) / Math.max(10, a.spd), 1, 2.4);            // 발걸음이 땅 흐르는 속도와 맞는다
        }
        spawnAt = t + 1e9; pan = 0;
    }
    double panF() { return Math.min(64, W * .2); }                                             // 두 배경이 겹쳐 섞이는 폭
    void panStep(double dt) {
        pan += dt;
        for (Traffic v : oldTraffic) { v.x += v.dir * v.v * dt; v.rot += v.dir * v.v * dt * .1; }
        if (pan >= panDur) {
            pan = -1; panBg = null; panL = null; panWx = null; oldTraffic = new ArrayList<>(); spawnAt = t + rnd(.9, 2.0);
            for (Actor a : actors) if ("pan".equals(a.st)) { a.st = "walk"; a.boost = 0; a.tx = a.x; a.tz = a.z; }     // 새 장소에서 평소처럼 이어서 논다
        }
    }
    /** 한 겹 묶음(하늘·먼 건물·가로수·땅)을 ox 만큼 옮겨, 화면 가로 [cx0,cx1] 안에만 alpha 로 그린다. fx 가 참이면 하늘 효과·장소 소품도 함께. */
    void drawBgSet(SceneCv c, SceneArt.Bg b, SceneArt.Pal pal, P wp, double ox, double cx0, double cx1, double alpha, boolean fx) {
        if (cx1 - cx0 < .5 || alpha <= 0) return;
        SceneArt.Bg sb = bg; SceneArt.Pal sl = L; P sw = wxP;
        bg = b; L = pal; wxP = wp;
        try {
            c.save(); c.beginPath(); c.rect(cx0, 0, cx1 - cx0, H); c.clip(); c.translate(ox, 0);
            if (alpha < 1) c.globalAlpha(alpha);
            int tw = b.tw;
            c.drawImage(b.sky, 0, 0, W, H); if (fx) drawSkyFx(c, t);
            c.drawImage(b.far, 0, 0, tw, H); if (fx) SceneFx.drawMid(this, c, b.mid, tw); else c.drawImage(b.mid, 0, 0, tw, H); c.drawImage(b.gnd, 0, 0, W, H);
            if (fx) SceneFx.ambient(this, c, t);
            c.globalAlpha(1); c.restore();
        } finally { bg = sb; L = sl; wxP = sw; }
    }
    /** 이동 중 배경: 옛 배경(전체) 위에 새 배경이 옆에서 겹쳐 들어온다(맞닿는 F 폭은 점점 진하게 섞인다). */
    void drawPanBack(SceneCv c) {
        double s = easeIO(pan / panDur), F = panF(), d = panDir, ox0 = panOldX(), ox1 = panNewX(), kk = 2 * s - 1;
        drawBgSet(c, panBg, panL, panWx, ox0, 0, W, 1, true);
        int N = 10;
        for (int i = 0; i < N; i++) {
            double xm = (i + .5) / N, al = clamp(xm + kk, 0, 1), a0 = i * F / N, a1 = (i + 1) * F / N;
            if (al <= 0) continue;
            if (d > 0) drawBgSet(c, bg, L, wxP, ox1, ox1 + a0, ox1 + a1, al, false);
            else drawBgSet(c, bg, L, wxP, ox1, ox1 + W - a1, ox1 + W - a0, al, false);
        }
        if (d > 0) drawBgSet(c, bg, L, wxP, ox1, ox1 + F, ox1 + W, 1, true); else drawBgSet(c, bg, L, wxP, ox1, ox1, ox1 + W - F, 1, true);
    }
    void drawPanFront(SceneCv c) {
        double F = panF(), d = panDir, ox0 = panOldX(), ox1 = panNewX();
        double nA = d > 0 ? ox1 + F : ox1, nB = d > 0 ? ox1 + W : ox1 + W - F;
        panFrontSeg(c, ox0, panL, panWx, Math.max(0, d > 0 ? ox0 : ox1 + W - F), Math.min(W, d > 0 ? ox1 + F : ox0 + W));
        panFrontSeg(c, ox1, L, wxP, Math.max(0, nA), Math.min(W, nB));
    }
    void panFrontSeg(SceneCv c, double ox, SceneArt.Pal pal, P wp, double x0, double x1) {
        if (x1 - x0 < .5) return;
        SceneArt.Pal sl = L; P sw = wxP; L = pal; wxP = wp;
        try { c.save(); c.beginPath(); c.rect(x0, 0, x1 - x0, H); c.clip(); c.translate(ox, 0); drawWxFront(c, t); c.restore(); }
        finally { L = sl; wxP = sw; }
    }
    double panOldX() { return -panDir * (W - panF()) * easeIO(pan / panDur); }
    double panNewX() { return panOldX() + panDir * (W - panF()); }
    void drawTrafficPan(SceneCv c, int lane) {
        if (pan < 0 || oldTraffic.isEmpty()) return;
        List<Traffic> keep = traffic; traffic = oldTraffic;
        try { c.save(); c.translate(panOldX(), 0); drawTraffic(c, lane); c.restore(); } finally { traffic = keep; }
    }

    /** 장면이 바뀔 때 옛 장면을 한 장 찍어 두고 서서히 사라지게 한다 */
    void snapshot() {
        xf = -1; if (reduce) { prev = null; tv = -1; return; }                                  // 움직임 줄이기: 전환 연출 없이 바로 바뀐다
        try { prev = factory.newLayer(W, H, dpr); SceneCv pc = prev.cv(); paintAll(pc, 0); tv = 0; } catch (RuntimeException e) { prev = null; tv = -1; }
    }
    public void stop() { dragReset(); hotUntil = 0; running = false; actors = new ArrayList<>(); prev = null; fade = 0; tv = -1; xf = -1; pan = -1; panBg = null; panL = null; panWx = null; oldTraffic = new ArrayList<>(); }
    public boolean isRunning() { return running; }
    public SceneModel.Res last() { return LAST; }
    public String tag() { return running && res != null && res.tag != null ? res.tag : ""; }
    public double scaleDevice() { return dpr; }
    public double fade() { return fade; }
    /** TV 전환이 진행 중이면 시작 뒤 지난 초, 아니면 -1. */
    public double tv() { return tv; }
    public SceneCv.Layer prevLayer() { return prev; }
    public double designW() { return W; }
    public double designH() { return H; }
    public String mode() { return mode; }
    /** 지하철 객실 쪽에 탑승 엔진의 위치 글(pos: segs 시각표)과 지금 시각(ms)을 알려 준다. 시각표를 읽어 달림/섬을 고르는 건 SceneTrain, 시각표 자체는 엔진이 만든다. */
    public void trainPos(String posJson) { SceneTrain.feedPos(this, posJson); }
    public void trainClock(long nowMs) { SceneTrain.feedClock(this, nowMs); }

    public void update(double dt) {
        if (!running) return;
        if (reduce) dt = 0;
        dt = Math.min(.1, Math.max(0, dt)); dtLast = dt; t += dt; frames++;
        if (tv >= 0) { tv += dt; if (tv >= TV_T) { tv = -1; prev = null; } }
        if (xf >= 0) { xf += dt; if (xf >= XF_T) { xf = -1; if (tv < 0) prev = null; } }
        if (pan >= 0) panStep(dt);
        // 꾹 누르기: 정해진 시간이 지나면 잡힌다
        if (PEND != null && t - PEND.t0 >= LONGPRESS) grab();
        try {
            if ("train".equals(mode)) SceneTrain.step(this, dt);
            else if (!"ride".equals(mode)) {
                stepTraffic(dt);
                if (L.wk.equals("rain") && R.next() < dt * 14) { Ripple rp = new Ripple(); rp.x = rnd(4, W - 4); rp.y = rnd(g.nearTop + 6, g.floor); rp.t0 = t; ripples.add(rp); if (ripples.size() > 14) ripples.remove(0); }
                if ("wait".equals(mode)) waitManage(); else if ("alight".equals(mode)) alightManage(dt);
                if (hello != null) helloManage();
                else if ("idle".equals(mode) || "alight".equals(mode)) idleManage();
                for (int i = 0; i < actors.size(); i++) {
                    Actor a = actors.get(i); if (a.hidden) continue;
                    if (a.held) { heldStep(a, dt); continue; }
                    if (a.st.equals("hidden")) continue;
                    stepActor(a, dt);
                    if (L.cold && a.vis && !a.st.equals("fall") && R.next() < dt * .3) {                    // 추운 날: 걷는 중에도 가끔 입김이 난다(그림만 — 추운지는 엔진 look.cold)
                        double hh = HH(a); double[] hd = SceneActs.headOf(a, hh);
                        ptx("breath", a.x + a.dir * (hd[0] + hh * .1), feetY(a) - liftOf(a) + hd[1] + hh * .1, 1, po().a(a.dir > 0 ? -.5 : PI + .5, a.dir > 0 ? -.2 : PI + .2).s(8, 14).g(-6).l(.9, 1.3).r(1));
                    }
                }
                if (DRAG != null && !actors.contains(DRAG.a)) dragReset();
                stepBams(dt);
            } else rideStep(dt);
        } catch (RuntimeException e) { if (error == null) error = String.valueOf(e); }
    }
    void paintAll(SceneCv c, double dt) {
        if ("train".equals(mode)) SceneTrain.draw(this, c); else if ("ride".equals(mode)) drawRide(c); else drawStreet(c, dt);
        if (dark) { c.fillStyle("rgba(8,12,28,.10)"); c.fillRect(0, 0, W, H); }
    }
    // ═══ TV 전원 전환 ═══
    //   꺼짐(0.30초): 옛 장면이 위아래로 납작해져 하얀 선이 되고, 선이 좌우로 줄어 점이 된다.
    //   암전(0.08초): 점이 깜빡이며 사라진다.   켜짐(0.42초): 점→가로선이 번지고, 선이 위아래로 열리며 새 장면이 하얗게 번쩍이다 제 밝기로 돌아온다.
    //   언제 바뀌는지는 엔진(/scene 의 mode)이 정한다 — 여기서는 받은 장면을 그릴 뿐이다. 웹 _CS 의 tvDraw 와 같은 수식(웹이 예비 화면이 될 때 똑같이 보이게).
    static double eIn(double x) { x = clamp(x, 0, 1); return x * x; }
    static double eOut(double x) { x = clamp(x, 0, 1); double u = 1 - x; return 1 - u * u * u; }
    static final int TV_BLACK = 0xFF04060C;
    void tvDraw(SceneCv c) {
        double cx = W / 2, cy = H / 2;
        c.fillStyle(TV_BLACK); c.fillRect(0, 0, W, H);
        if (tv < TV_OFF) {
            double a = tv / TV_OFF, sx = 1, sy = 1;
            if (a < .72) sy = 1 - .985 * eIn(a / .72); else { sy = .015; sx = 1 - eIn((a - .72) / .28); }
            if (prev != null) { c.save(); c.translate(cx, cy); c.scale(Math.max(sx, .001), Math.max(sy, .001)); c.drawImage(prev, -W / 2, -H / 2, W, H); c.restore(); }
            double rw = Math.max(sx * W, 2.5), rh = Math.max(sy * H, 2);
            c.globalAlpha(clamp(.12 + .88 * a * a, 0, 1)); c.fillStyle(0xFFFFFFFF); c.fillRect(cx - rw / 2, cy - rh / 2, rw, rh); c.globalAlpha(1);
        } else if (tv < TV_OFF + TV_HOLD) {
            double k = 1 - (tv - TV_OFF) / TV_HOLD;
            c.globalAlpha(clamp(k, 0, 1)); c.fillStyle(0xFFFFFFFF); c.fillRect(cx - 1.25, cy - 1, 2.5, 2); c.globalAlpha(1);
        } else {
            double b = (tv - TV_OFF - TV_HOLD) / TV_ON;
            if (b < .22) {
                double rw = Math.max(W * eOut(b / .22), 2.5);
                c.fillStyle(0xFFFFFFFF); c.fillRect(cx - rw / 2, cy - 1, rw, 2);
            } else {
                double p = (b - .22) / .78, rh = Math.max(H * eOut(p), 2);
                c.save(); SceneUtil.rr(c, 0, cy - rh / 2, W, rh, 0); c.clip();
                paintAll(c, dtLast); dtLast = 0;
                c.globalAlpha(clamp(.9 * (1 - p) * (1 - p), 0, 1)); c.fillStyle(0xFFFFFFFF); c.fillRect(0, cy - rh / 2, W, rh); c.globalAlpha(1);
                c.restore();
                c.globalAlpha(clamp(.9 * (1 - p), 0, 1)); c.fillStyle(0xFFFFFFFF); c.fillRect(0, cy - rh / 2 - 1, W, 2); c.fillRect(0, cy + rh / 2 - 1, W, 2); c.globalAlpha(1);
            }
        }
    }
    /** 한 프레임을 그린다. c 의 바닥 변환은 '화면 픽셀' 그대로(여기서 장면 좌표로 확대한다). */
    static final int HOST_BG = 0xFF9FD0FF; static final double HOST_RADIUS = 11;
    public void render(SceneCv c) {
        if (!running || bg == null) return;
        c.save(); c.scale(dpr, dpr);
        // 웹에서는 호스트 div(.cong-scene)의 CSS 가 하던 일: 연파랑 바탕(#9fd0ff)과 둥근 모서리(12px − 테두리 1px). 네이티브는 캔버스가 직접 한다.
        SceneUtil.rr(c, 0, 0, W, H, HOST_RADIUS); c.clip();
        if (tv >= 0) {
            try { tvDraw(c); } catch (RuntimeException e) { if (error == null) error = String.valueOf(e); }
        } else {
            c.fillStyle(HOST_BG); c.fillRect(0, 0, W, H);
            try { paintAll(c, dtLast); dtLast = 0; } catch (RuntimeException e) { if (error == null) error = String.valueOf(e); }
            if (xf >= 0 && prev != null) { try { c.globalAlpha(clamp(1 - xf / XF_T, 0, 1)); c.drawImage(prev, 0, 0, W, H); c.globalAlpha(1); } catch (RuntimeException e) { c.globalAlpha(1); } }
        }
        c.restore();
    }


    // ═══ 카드 확장 인사(s340, YJ: "3초 꾹 누르면 카드가 2배로 늘어나고 나머지 친구들이 나와 인사한 뒤 남을 친구만 남고 들어간다") ═══
    //   이 SceneCore 는 '늘어난 카드' 전용 두 번째 장면이다(카드의 평소 장면은 그대로 돈다). 시간 · 자리 · 차례 · 인사 글은 엔진 대본(SceneHello.Plan)이 정하고,
    //   누가 남는지는 평소 카드에 지금 나와 있는 친구(folks)가 정한다. 손님 친구는 자기 걸음(걷기 · 달리기 · 날기)으로 양쪽 가장자리에서 들어오고 두덩은 땅에서 솟는다.
    /** 평소 카드에 지금 나와 있는 친구 한 마리(자리는 칸 폭 · 깊이의 비율). */
    public static final class Folk { public String id = ""; public double fx, z; public int dir = 1; }
    static final class HelloRun {
        SceneHello.Plan p; double t0; String[] idAt; int[] rank; boolean leaving;
        final Map<String, Integer> seat = new HashMap<>(); final Map<String, Double> arrive = new HashMap<>(), sayAt = new HashMap<>();
        final java.util.Set<String> said = new java.util.HashSet<>(), guests = new java.util.HashSet<>(), free = new java.util.HashSet<>();
        final List<Actor> queue = new ArrayList<>(); final List<Double> queueAt = new ArrayList<>();
    }
    HelloRun hello;
    public boolean helloActive() { return hello != null; }
    /** 확장 인사가 시작된 뒤 지난 ms(없으면 -1). */
    public double helloMs() { return hello == null ? -1 : (t - hello.t0) * 1000; }
    /** 확장 인사를 일찍 끝낸다: 손님은 바로 나가고 카드는 줄어든다. */
    public void helloSkip() { if (hello != null && helloMs() < hello.p.leave) hello.t0 = t - hello.p.leave / 1000.0; }
    public void helloStop() { hello = null; }
    /** 지금 카드에 나와 있는(나가는 중이 아닌) 친구들. */
    public List<Folk> folks() {
        List<Folk> out = new ArrayList<>();
        for (Actor a : actors) if (!a.dead && !a.hero && !a.leaving && !a.hidden && W > 0) { Folk f = new Folk(); f.id = a.id; f.fx = clamp(a.x / W, 0, 1); f.z = clamp(a.z, 0, 1); f.dir = a.dir; out.add(f); }
        return out;
    }
    /** 확장 인사를 시작한다. 평소 장면(idle)이 아니거나 대본이 틀리면 false. orig: 평소 카드에 나와 있던 친구들(그대로 남는다). */
    public boolean startHello(SceneHello.Plan p, long seed, List<Folk> orig) {
        if (!running || !"idle".equals(mode) || pan >= 0 || !SceneHello.ok(p) || W <= 0) return false;
        HelloRun h = new HelloRun(); h.p = p; h.t0 = t; h.idAt = SceneHello.seats(p, seed); h.rank = SceneHello.rank(p);
        actors = new ArrayList<>(); pt = new ArrayList<>(); gfx = new ArrayList<>(); bams = new ArrayList<>(); dragReset();
        int gi = 0;
        for (int i = 0; i < h.idAt.length; i++) {
            String id = h.idAt[i]; if (!SceneModel.D3.containsKey(id)) continue;
            double sx = clamp(p.sx[i], .05, .95) * W, sz = clamp(p.sz[i], 0, 1); Folk f = null;
            if (orig != null) for (Folk o : orig) if (o.id.equals(id)) { f = o; break; }
            Actor a;
            if (f != null) { a = mkActor(id, f.fx * W, f.z, f.dir); a.st = "walk"; }
            else {
                boolean left = sx < W * .5; a = mkActor(id, 0, sz, left ? 1 : -1); h.guests.add(id);
                if (id.equals("dudung") && a.D.intro > 0 && host.intro() != null) { a.x = sx; a.st = "emerge"; }
                else { a.x = left ? -a.w * .9 : W + a.w * .9; a.st = "walk"; }
            }
            a.tx = sx; a.tz = sz; a.life = 1e9; a.born = t; a.boost = p.boost; h.seat.put(id, i);
            if (f == null) { h.queue.add(a); h.queueAt.add(id.equals("dudung") ? 700.0 : 200.0 + (gi++) * 140.0); } else actors.add(a);
        }
        hello = h; return true;
    }
    void helloSettle(Actor a) {                                          // 자리에 닿았다/동작이 끝났다 → 서서 인사를 기다린다(잠자는 칸은 앉아 쉰다)
        HelloRun h = hello; a.dir = a.x < W * .5 ? 1 : -1; a.tx = a.x; a.tz = a.z; a.afterEmerge = null; a.onArrive = null;
        if (!h.arrive.containsKey(a.id)) h.arrive.put(a.id, t);
        if (h.p.rest) { a.st = "rest"; a.t0 = t; a.until = t + 1e6; } else a.st = "stand";
    }
    void helloManage() {
        HelloRun h = hello; SceneHello.Plan p = h.p; double ms = (t - h.t0) * 1000;
        for (int i = h.queue.size() - 1; i >= 0; i--) if (ms >= h.queueAt.get(i)) {                                   // 손님 입장(차례로 · 두덩은 땅에서 솟는다)
            Actor a = h.queue.remove(i); h.queueAt.remove(i);
            if (a.st.equals("emerge")) { a.t0 = t; a.until = t + (double) a.D.intro / a.D.introFps; }
            actors.add(a);
        }
        for (int i = actors.size() - 1; i >= 0; i--) if (actors.get(i).dead) actors.remove(i);
        for (Actor a : actors) {
            Integer si = h.seat.get(a.id); if (si == null || a.leaving) continue;
            Double ar = h.arrive.get(a.id);
            if (ar != null && !h.said.contains(a.id) && ms >= Math.max(p.greet + h.rank[si] * (double) p.step, (ar - h.t0) * 1000 + 200)) {       // 자리에 선 친구만, 자기 차례에 한 번 인사
                h.said.add(a.id); h.sayAt.put(a.id, ms); String txt = p.say.get(a.id); if (txt != null) say(a, txt, p.bubble / 1000.0);
                if (!p.rest && a.st.equals("stand")) { a.st = "hop"; a.t0 = t; a.until = t + .7; a.lastCyc = null; }
            }
            Double sa = h.sayAt.get(a.id); if (sa != null && ms >= sa + p.bubble && !a.bub.isEmpty()) a.bub = "";           // 앉아 쉬는 칸은 말풍선을 스스로 안 지우므로 여기서
        }
        if (!h.leaving && ms >= p.leave) {                                                                              // 손님은 양쪽으로 걸어 나가고, 남을 친구는 다시 평소처럼
            h.leaving = true;
            for (Actor a : actors) {
                a.bub = "";
                if (h.guests.contains(a.id)) { a.leaving = true; a.st = "walk"; a.tx = a.x < W / 2 ? -a.w * 1.1 : W + a.w * 1.1; a.tz = a.z; a.onArrive = null; a.act = null; a.boost = p.boost; }
                else { h.free.add(a.id); a.boost = 0; a.life = rnd(15, 26); a.born = t; startAct(a, nextName(a)); }
            }
        }
    }

    // ═══ 시험용 ═══
    public boolean debugPlay(String id, String name, boolean solo) {
        if (!running) return false;
        Actor a = null; for (Actor o : actors) if (o.id.equals(id) && !o.leaving) a = o;
        if (a == null) { a = mkActor(id, W * .5, .62, 1); a.born = t; actors.add(a); }
        a.life = 1e9; a.leaving = false;
        if (solo) { actors = new ArrayList<>(); actors.add(a); spawnAt = t + 1e9; gfx = new ArrayList<>(); pt = new ArrayList<>(); a.x = W * .5; a.z = .62; }
        startAct(a, name); return true;
    }
    public boolean debugDrop(String id, double hgt, boolean solo) {
        if (!running) return false;
        Actor a = null; for (Actor o : actors) if (o.id.equals(id) && !o.leaving) a = o;
        if (a == null) { a = mkActor(id, W * .5, .62, 1); a.born = t; actors.add(a); }
        a.life = 1e9;
        if (solo) { actors = new ArrayList<>(); actors.add(a); spawnAt = t + 1e9; gfx = new ArrayList<>(); pt = new ArrayList<>(); a.x = W * .5; a.z = .62; }
        a.altSave = a.alt; a.alt = 0; a.act = null; a.y = -(hgt != 0 ? hgt : 60); a.prevSt = "walk"; releaseActor(a); return true;
    }
    public void debugTick(double sec) { int n = (int) Math.round(sec * 30); for (int i = 0; i < n; i++) update(1.0 / 30); }
    public String debugHit(double xdp, double ydp) { Actor a = running ? hitActor(xdp / k, ydp / k) : null; return a != null ? a.id : null; }
    /** 시험용 상태 요약: id|st|act|land|x|z|vis ; … */
    public String debugInfo() {
        StringBuilder b = new StringBuilder(); b.append(mode).append('#').append(frames).append('#').append(error == null ? "" : error).append('#');
        for (Actor a : actors) b.append(a.id).append('|').append(a.st).append('|').append(a.act != null ? a.act.n : "").append('|').append(a.landK).append('|').append(Math.round(a.x)).append('|').append(Math.round(a.z * 100) / 100.0).append('|').append(a.vis ? 1 : 0).append('|').append(a.held ? 1 : 0).append(';');
        return b.toString();
    }
    public double debugActorX(String id) { for (Actor a : actors) if (a.id.equals(id)) return a.x; return Double.NaN; }
    public double debugActorFeetDp(String id) { for (Actor a : actors) if (a.id.equals(id)) return (zy(a.z) + a.y) * k; return Double.NaN; }
}
