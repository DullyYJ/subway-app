package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 캐릭터 시계 위젯의 '놀이터' 움직임(안드로이드와 상관없는 순수 계산 — dp 단위, 시계 상자 기준).
 *  · 평소(NORMAL): 바닥을 걷고·쉬고·콩콩 뛰다가, 시계 옆에서 뛰어올라 시계 위를 걷고·쉬고·(강아지·고양이는) 응가를 하고·시계 모서리에 매달렸다가 뛰어내린다.
 *  · 출퇴근(COMMUTE): 모두 시계 앞으로 달려와 줄을 서서 응원(cheer: 콩콩) · 위로(comfort: 가만히 + 하트) · 경고(warn: 두리번)를 한다.
 *  · 순수 그림용 상태기계다(경로·시각 계산 없음). 난수는 시드로 고정할 수 있어 시험이 같은 결과를 본다.
 */
public final class WidgetSim {
    public static final int NORMAL = 0, COMMUTE = 1;
    public static final int WALK = 0, REST = 1, HOP = 2, TO_SIDE = 3, JUMP = 4, TOP_WALK = 5, TOP_REST = 6, POOP = 7, HANG = 8, GATHER = 9, CHEER = 10, BED_WALK = 11, ENTER = 12, SLEEP = 13, EXIT = 14,
        LOOK = 15, STRETCH = 16, WIGGLE = 17, DASH = 18, SPIN = 19, BOUNCE = 20, VISIT = 21, WAITP = 22, GREET = 23, CHASE = 24, FLEE = 25;     // s305: 새 동작(같은 그림 시트·같은 프레임 주기 — 계산만 늘어 배터리는 그대로)
    public static final String[] ORDER = { "dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng", "juksun", "bbosong" };
    public static final String[] ST_NAME = { "walk", "rest", "hop", "toSide", "jump", "topWalk", "topRest", "poop", "hang", "gather", "cheer", "bedWalk", "enter", "sleep", "exit", "look", "stretch", "wiggle", "dash", "spin", "bounce", "visit", "waitp", "greet", "chase", "flee" };

    /** 시트(256px 칸 4×4)의 값: {칸 안 머리 위 끝, 발 높이, 몸 가로 중심, 초당 프레임, 띄울 높이(키 58 기준 dp), 몸 높이 비율} */
    public static float[] cfg(String id) {
        if ("dolsom".equals(id)) return new float[] { 8f, 248.5f, 120.8f, 19f, 0f, 1f };
        if ("lovel".equals(id)) return new float[] { 8f, 249.5f, 133f, 11f, 0f, 1f };
        if ("ppopu".equals(id)) return new float[] { 8f, 248.5f, 120.3f, 19f, 0f, 1f };
        if ("chaeng".equals(id)) return new float[] { 14f, 244.5f, 154.5f, 15f, 6f, 0.9f };
        if ("sul".equals(id)) return new float[] { 27f, 230.5f, 131f, 20f, 16f, 0.76f };
        if ("juksun".equals(id)) return new float[] { 24.5f, 247.5f, 118.4f, 12f, 0f, 0.9f };
        if ("bbosong".equals(id)) return new float[] { 27f, 249f, 118.5f, 12f, 0f, 0.86f };
        return new float[] { 15f, 222.5f, 128f, 13f, 0f, 1f };
    }
    /** 캐릭터 셋(6마리 중 3마리)을 무작위로 뽑는다. prev 가 있으면 그것과 다른 구성이 나온다(화면을 켤 때마다 바뀌어 보이도록). */
    public static String[] pickSet(long seed, String[] prev) {
        java.util.Random r = new java.util.Random(seed);
        String[] out = null;
        for (int k = 0; k < 24; k++) {
            java.util.List<String> pool = new java.util.ArrayList<String>(java.util.Arrays.asList(ORDER));
            java.util.Collections.shuffle(pool, r);
            out = new String[] { pool.get(0), pool.get(1), pool.get(2) };
            if (prev == null || !sameSet(out, prev)) break;
        }
        return out;
    }
    public static boolean sameSet(String[] a, String[] b) {
        if (a.length != b.length) return false;
        for (String x : a) { boolean f = false; for (String y : b) if (x.equals(y)) f = true; if (!f) return false; }
        return true;
    }
    /** 잠자리 종류(2026-10-27 개편): 개(돌솜·뽀푸) · 고양이 캣타워 · 두더지 흙집 · 독수리 매달린 나뭇가지(nest) · 올챙이 물웅덩이(pond).
     *  자는 모습은 캐릭터마다 소품과 함께 3D 로 그린 한 장(`<id>_sleep.webp`, 16프레임 반복)이다. */
    public static String houseKind(String id) {
        if ("dolsom".equals(id) || "ppopu".equals(id)) return "dog";
        if ("lovel".equals(id)) return "cat";
        if ("dudung".equals(id)) return "mole";
        if ("sul".equals(id)) return "nest";
        if ("juksun".equals(id)) return "leaf";          // 잎 방석 위에서 대나무를 끌어안고 잔다
        if ("bbosong".equals(id)) return "flower";       // 꽃 침대에서 꽃다발을 안고 잔다
        return "pond";
    }
    /** 걷는 모습은 자는 장면으로 바뀌면서 사라진다(예전엔 개집·굴만 몸이 안 보였다 — 이제 모든 종류가 장면 한 장으로 그려져 몸이 다 나오지 않는다). */
    public static boolean hides(String kind) { return true; }
    /** 잠자리 자리(캐릭터 키 대비): {가로, 세로} — 장면 그림이 실제로 차지하는 크기. 다른 잠자리와 겹치지 않게 자리를 나눌 때 쓴다. */
    public static float[] houseSize(String kind) {
        if ("dog".equals(kind)) return new float[] { 1.1f, 0.9f };
        if ("cat".equals(kind)) return new float[] { 0.95f, 1.1f };
        if ("mole".equals(kind)) return new float[] { 1.2f, 0.9f };
        if ("nest".equals(kind)) return new float[] { 1.2f, 1.1f };
        if ("leaf".equals(kind) || "flower".equals(kind)) return new float[] { 1.4f, 0.8f };
        return new float[] { 1.2f, 0.6f };
    }
    /** 자는 장면 그림 값(시트 `<id>_sleep.webp`, 256px 칸 4×4 = 16프레임 반복): {칸 한 변이 캐릭터 키의 몇 배인지, 칸 안 바닥 기준점 x(0~1), 바닥 기준점 y(0~1), 초당 프레임, zzz 가 올라오는 자리 x, y(칸 비율)}.
     *  3D 장면의 한 단위가 캐릭터 키의 k 배(고양이 .42 · 올챙이 .45 · 독수리 .41 · 비숑 .55 · 푸들 .55 · 두더지 .45)가 되도록 칸 크기를 정했다. */
    public static float[] sleepCfg(String id) { float[] r = sleepCfg0(id); r[0] *= 1.1f; return r; }
    private static float[] sleepCfg0(String id) {
        if ("lovel".equals(id)) return new float[] { 2.822f * 0.42f, 137.2f / 256f, 220.2f / 256f, 5f, 154.4f / 256f, 87.2f / 256f };
        if ("chaeng".equals(id)) return new float[] { 2.756f * 0.45f, 128.7f / 256f, 158.3f / 256f, 5f, 128.7f / 256f, 137.9f / 256f };
        if ("sul".equals(id)) return new float[] { 3.577f * 0.41f, 136.4f / 256f, 226.1f / 256f, 5f, 172.2f / 256f, 149.0f / 256f };
        if ("dolsom".equals(id)) return new float[] { 2.166f * 0.55f, 128.9f / 256f, 198.8f / 256f, 5f, 138.2f / 256f, 100.4f / 256f };
        if ("ppopu".equals(id)) return new float[] { 2.723f * 0.55f, 128.7f / 256f, 181.4f / 256f, 5f, 151.6f / 256f, 128.7f / 256f };
        if ("juksun".equals(id)) return new float[] { 5.578f * 0.25f, 132.0f / 256f, 182.7f / 256f, 5f, 63.0f / 256f, 50.4f / 256f };
        if ("bbosong".equals(id)) return new float[] { 5.496f * 0.23f, 129.4f / 256f, 184.5f / 256f, 5f, 64.1f / 256f, 46.6f / 256f };
        return new float[] { 2.740f * 0.45f, 126.5f / 256f, 189.2f / 256f, 5f, 126.5f / 256f, 143.0f / 256f };
    }
    // ───────── 깨어나 돌아다니는 시간 ─────────
    /** 깨울 수 있는 신호(화면 켜짐·잠금 해제·런처 갱신·알람)를 받으면 일어나 ROAM_LEN_MS(기본 6분, 설정 2~10분)만 돌아다니고 다시 집에 들어가 잔다.
     *  ROAM_EVERY_MIN 분마다 알람이 앱 프로세스를 되살린다(프로세스가 살아야 화면 켜짐을 들을 수 있다). 알람이 올 때마다 움직이지는 않고, 마지막 움직임이 끝난 지 WidgetCore.ROAM_ALARM_COOLDOWN_MS 가 지났을 때만 움직인다. */
    public static final int ROAM_EVERY_MIN = 3; public static final long ROAM_LEN_MS = 360000L;       // 기본 6분(설정에서 2~10분)
    public static final int ROAM_MIN_DEF = 6, ROAM_MIN_MIN = 2, ROAM_MIN_MAX = 10;
    /** 설정의 '돌아다니는 시간'(분)을 2~10분으로 맞춰 밀리초로. 이상한 값이면 기본 6분. */
    public static long roamMs(int min) { return (min < ROAM_MIN_MIN || min > ROAM_MIN_MAX ? ROAM_MIN_DEF : min) * 60000L; }
    /** ms 가 속한 칸의 시작(지역 시각의 everyMin 배수 분 0초). everyMin 은 60 의 약수여야 한다. */
    public static long roamPeriodStart(long ms, java.util.TimeZone tz, int everyMin) {
        java.util.Calendar c = java.util.Calendar.getInstance(tz); c.setTimeInMillis(ms);
        c.set(java.util.Calendar.MINUTE, c.get(java.util.Calendar.MINUTE) / everyMin * everyMin); c.set(java.util.Calendar.SECOND, 0); c.set(java.util.Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }
    public static boolean roamNow(long ms, java.util.TimeZone tz, int everyMin, long lenMs) { return ms - roamPeriodStart(ms, tz, everyMin) < lenMs; }
    /** ms 보다 뒤의 다음 칸 시작. */
    public static long roamNext(long ms, java.util.TimeZone tz, int everyMin) {
        java.util.Calendar c = java.util.Calendar.getInstance(tz); c.setTimeInMillis(roamPeriodStart(ms, tz, everyMin)); c.add(java.util.Calendar.MINUTE, everyMin);
        return c.getTimeInMillis();
    }
    public static boolean poops(String id) { return "dolsom".equals(id) || "ppopu".equals(id) || "lovel".equals(id); }

    public static final class Ch {
        public String id; public float[] cfg;
        public float x, y;            // 발 중심(dp). y 는 지금 서 있는 곳의 높이(바닥·시계 위·매달린 자리)
        public float off;             // 뛰는 중 위로 뜬 높이(dp, 양수=위)
        public int face = 1;          // +1 오른쪽 · −1 왼쪽
        public int st = REST; public float t0, until;
        public float ph;              // 걷는 동작 시계(초)
        public float tx;              // 걷는 목표 x
        public int zone;              // 0 바닥 · 1 시계 위 · 2 매달림
        public float rot, sq, sx;     // 기울기(도) · 쪼그림(0~1) · 옆으로 늘어남(0~, 기지개)
        public Ch pal; public int cnt, last = -1; public float mark;   // 짝(인사·술래잡기 상대) · 센 횟수 · 지난 동작(연속 방지) · 동작 안의 표시 시각
        public float x0, y0, x1, y1, arc; public int nextSt, nextZone; // 뛰어오르기·내리기
        public int face0 = 1; public boolean pooped; public float lastPoop = -99f, lastTop = -99f;
        public int frame = 0;         // 그릴 프레임(0~15)
        public float alpha = 1f, zz = 0f;   // 집에 들어가 안 보이는 정도(1=보임) · 머리 위 zzz 의 진하기
        public float a0, sq0, off0, mix0;    // 집에서 나올 때 시작 값
        public float mix = 0f;               // 자는 장면(소품과 함께 그린 잠든 모습)이 보이는 정도(0=깨어 있음 · 1=장면만) — 들어갈 때 서서히 바뀐다
        public House home;                   // 내 잠자리
        public float spd;             // 걷는 속도(dp/초)
        public float scale() { return 1f; }
        public float halfW(float charH) { return charH * 0.55f; }
    }
    /** 잠자리: 종류에 맞는 집이 무작위 자리에 서서히 나타났다가, 주인이 깨어 나가면 서서히 사라진다. */
    public static final class House { public final Ch owner; public final String kind; public float x, w, h, a = 0f; public boolean want = true;
        House(Ch o, String k) { owner = o; kind = k; } }
    public static final class Poop { public float x, y, born; }
    public static final class Spark { public float x, y, vx, vy, age, life; public int type; }   // 0 별 · 1 하트 · 2 먼지

    public final WidgetGeo geo;
    public final List<Ch> cs = new ArrayList<Ch>();
    public final List<Poop> poops = new ArrayList<Poop>();
    public final List<Spark> sparks = new ArrayList<Spark>();
    public float time = 0f;
    public int mode = NORMAL;
    public String mood = "cheer";
    public boolean settling = false;
    public final List<House> houses = new ArrayList<House>();
    public boolean forever = false;        // 이번 잠은 사람이 깨울 때까지(자동으로 안 깬다)
    private final Random rnd;
    public final float[] log = new float[ST_NAME.length];      // 상태별 누적 시간(시험용)

    public WidgetSim(WidgetGeo g, long seed, String[] ids) {
        geo = g; rnd = new Random(seed);
        float step = g.W / (ids.length + 1);
        for (int i = 0; i < ids.length; i++) {
            Ch c = new Ch(); c.id = ids[i]; c.cfg = cfg(c.id);
            float sc = g.charH * c.cfg[5] / (c.cfg[1] - c.cfg[0]);
            c.spd = c.cfg[3] / 16f * 256f * sc * 0.85f;
            c.x = clampX(step * (i + 1) + (rnd.nextFloat() - 0.5f) * 10f, 0); c.y = g.ground; c.zone = 0;
            c.face = rnd.nextBoolean() ? 1 : -1;
            c.st = REST; c.t0 = 0; c.until = rnd.nextFloat() * 1.5f; c.lastTop = -8f + i * 3f;
            cs.add(c);
        }
    }

    // ───────── 자리 계산 ─────────
    private float hw() { return geo.charH * 0.55f; }
    private float clampX(float x, int zone) {
        float lo = hw() * 0.85f, hi = geo.W - hw() * 0.85f;
        if (zone == 1) { lo = Math.max(lo, geo.clkL + hw() * 0.5f); hi = Math.min(hi, geo.clkR() - hw() * 0.5f); if (hi < lo) { lo = hi = geo.clkCx(); } }
        return x < lo ? lo : (x > hi ? hi : x);
    }
    private float topY() { return geo.clkT; }
    private boolean canClimb() { return geo.clkW >= hw() * 2.4f && geo.clkT - geo.charH >= -1f; }
    private int topCount() { int n = 0; for (Ch c : cs) if (c.zone == 1 || (c.st == JUMP && c.nextZone == 1) || c.zone == 2) n++; return n; }
    private float rnd(float a, float b) { return a + rnd.nextFloat() * (b - a); }

    public void setMode(int m, String mood_) {
        if (m == mode && (mood_ == null || mood_.equals(mood))) return;
        mode = m; if (mood_ != null) mood = mood_;
        for (House h : houses) h.want = false;
        for (Ch c : cs) { c.pooped = false; c.alpha = 1f; c.mix = 0f; c.zz = 0f; c.home = null; c.sq = 0f; c.sx = 0f; c.pal = null; if (mode == COMMUTE) startGather(c); else { c.st = REST; c.t0 = time; c.until = time + 0.3f; } }
    }
    /** 이제 멈출 것: 하던 동작을 마치고 바닥에서 가만히 선다(isSettled 가 true 가 되면 그림 갱신을 멈춰도 된다). */
    public void requestSettle() { settling = true; }
    public void resume() { settling = false; wakeAll(0f); }
    // ───────── 잠자리 ─────────
    /** 잘 시간: 종류별 집이 무작위 자리에 생기고 모두 자기 집으로 걸어가 들어가 잔다. 출퇴근 중엔 자지 않는다. */
    public void bed(boolean untilTapped) {
        if (mode == COMMUTE) return;
        forever = untilTapped; houses.clear(); for (Ch c0 : cs) c0.pal = null;
        float hwid = geo.charH * 1.35f, lo = hwid * 0.5f + 1f, hi = geo.W - hwid * 0.5f - 1f;
        List<Ch> order = new ArrayList<Ch>(cs); java.util.Collections.shuffle(order, rnd);
        float[] xs = new float[order.size()]; int n = 0;
        for (Ch c : order) {
            float x = -1f; boolean okp = false;
            for (int k = 0; k < 40 && !okp; k++) {
                x = rnd(lo, Math.max(lo, hi)); okp = true;
                for (int j = 0; j < n; j++) if (Math.abs(x - xs[j]) < hwid * 1.0f) okp = false;
            }
            if (!okp) { x = lo + (Math.max(lo, hi) - lo) * ((n + 0.5f) / order.size()); }   // 자리가 좁으면 칸 나눠 놓는다
            xs[n++] = x;
            House h = new House(c, houseKind(c.id)); float[] sz = houseSize(h.kind); h.x = x; h.w = geo.charH * sz[0]; h.h = geo.charH * sz[1];
            houses.add(h); c.home = h; c.tx = clampX(x, 0); c.pooped = false;
            if (c.zone != 0 || c.st == JUMP || c.st == HANG) jump(c, clampX(c.x, 0), geo.ground, 0, BED_WALK, 0.5f, 8f);
            else { c.st = BED_WALK; c.t0 = time; c.until = time + 14f; }
        }
    }
    private static boolean inBedState(int st) { return st == BED_WALK || st == ENTER || st == SLEEP || st == EXIT; }
    /** 다 잠자리에 들었다(자동으로 깨어날 시계가 시작돼도 된다). */
    public boolean allInBed() { for (Ch c : cs) if (c.st != SLEEP) return false; return !cs.isEmpty(); }
    /** 모두 깨어 일어나 집이 사라졌다. */
    public boolean allUp() { for (Ch c : cs) if (inBedState(c.st)) return false; return houses.isEmpty(); }
    /** 아직 걷거나 들고나는 중이라 부드럽게 그려야 하는가(자는 동안엔 느린 그림으로 충분). */
    public boolean busy() { for (Ch c : cs) if (c.st != SLEEP) return true; for (House h : houses) if (h.a < 0.999f && h.want) return true; return false; }
    /** 제시간에 못 들어간 것도 억지로 침대로 보낸다. */
    public void snapBed() {
        for (Ch c : cs) if (c.home != null && c.st != SLEEP) { c.x = c.home.x; c.zone = 0; c.y = geo.ground; c.rot = 0; c.st = SLEEP; c.t0 = time; c.until = forever ? 1e9f : time + rnd(20f, 60f); c.alpha = 0f; c.sq = 0f; c.off = 0f; c.mix = 1f; c.frame = 0; }
        for (House h : houses) h.a = 1f;
    }
    /** 지금 당장 모두 집에서 자고 있는 모습으로 만든다(걸어 들어가는 장면 없이): 정해진 시간이 아닐 때 화면이 켜지면 이 모습이다. 출퇴근 중엔 안 한다. */
    public void asleepNow() { if (mode == COMMUTE) return; bed(true); snapBed(); snapAsleep(); }
    /** 자는 모습으로 그려 둘 때(마지막 정지 그림): zzz·집을 완전히 보이게. */
    public void snapAsleep() { for (Ch c : cs) if (c.st == SLEEP) c.zz = 1f; for (House h : houses) if (h.want) h.a = 1f; }
    /** 모두 깨운다(사람이 위젯을 만졌다·화면이 켜졌다): 한 마리씩 시차를 두고 집에서 나온다. */
    public void wakeAll() { wakeAll(0f); }
    /** spread>0 이면 마리마다 0~spread 초 사이 무작위로 깬다(정해진 시간이 되면 제각각 일어나 나오도록). */
    public void wakeAll(float spread) {
        forever = false; int i = 0;
        for (Ch c : cs) {
            if (c.st == BED_WALK) { c.st = REST; c.t0 = time; c.until = time + 0.2f + 0.3f * i; if (c.home != null) c.home.want = false; c.home = null; }
            else if (c.st == ENTER || c.st == SLEEP) { startExit(c, spread > 0f ? rnd(0f, spread) : 0.25f * i); }
            else if (c.home != null) { if (c.st == JUMP && c.nextSt == BED_WALK) c.nextSt = REST; c.home.want = false; c.home = null; }     // 자러 가려고 시계에서 뛰어내리는 중
            i++;
        }
    }
    private void startExit(Ch c, float delay) { c.a0 = c.alpha; c.sq0 = c.sq; c.off0 = c.off; c.mix0 = c.mix; c.st = EXIT; c.t0 = time + delay; c.until = c.t0 + 0.7f; }
    public boolean isSettled() {
        for (Ch c : cs) { if (mode == COMMUTE) { if (c.st != CHEER) return false; } else if (c.zone != 0 || c.st != REST) return false; }
        return true;
    }
    /** 모든 것을 바닥의 쉬는 자세로 즉시 되돌린다(화면이 꺼질 때). */
    public void snapSettled() {
        houses.clear(); forever = false;
        for (Ch c : cs) { c.pal = null; c.sx = 0f; if (mode == COMMUTE) { c.zone = 0; c.off = 0; c.rot = 0; c.frame = 0; continue; } c.zone = 0; c.y = geo.ground; c.off = 0; c.rot = 0; c.sq = 0; c.st = REST; c.t0 = time; c.until = time + 5f; c.x = clampX(c.x, 0); c.alpha = 1f; c.mix = 0f; c.zz = 0f; c.home = null; }
        poops.clear(); sparks.clear();
    }

    private float slotX(int i) { int n = cs.size(); return geo.stageL + geo.stageW * ((i + 0.5f) / n); }
    private void startGather(Ch c) {
        int i = cs.indexOf(c);
        c.tx = clampX(slotX(i), 0);
        if (c.zone != 0 || c.st == JUMP || c.st == HANG) { jump(c, c.x, geo.stageY, 0, GATHER, 0.35f, 6f); return; }
        c.st = GATHER; c.t0 = time; c.until = time + 8f; c.y = geo.ground;
    }

    // ───────── 한 걸음 ─────────
    public void step(float dt) {
        if (!(dt > 0f)) return;
        if (dt > 0.1f) dt = 0.1f;
        time += dt;
        for (Ch c : cs) {
            log[c.st] += dt;
            stepChar(c, dt);
            float tz = c.st == SLEEP ? 1f : 0f; c.zz += Math.max(-1f, Math.min(1f, tz - c.zz)) * Math.min(1f, dt * 2f);   // zzz 가 서서히 진해졌다 옅어진다
        }
        for (int i = houses.size() - 1; i >= 0; i--) {                                // 집이 서서히 생기고, 주인이 나가면 서서히 사라진다
            House h = houses.get(i);
            h.a = h.want ? Math.min(1f, h.a + dt / 0.9f) : Math.max(0f, h.a - dt / 0.9f);
            if (!h.want && h.a <= 0f && (h.owner.home != h)) houses.remove(i);
        }
        for (int i = poops.size() - 1; i >= 0; i--) if (time - poops.get(i).born > 8f) poops.remove(i);
        for (int i = sparks.size() - 1; i >= 0; i--) {
            Spark s = sparks.get(i); s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += (s.type == 1 ? -4f : s.type == 2 ? 0f : 30f) * dt;
            if (s.age >= s.life) sparks.remove(i);
        }
        if (mode == COMMUTE && "comfort".equals(mood) && rnd.nextFloat() < dt * 1.2f) {
            Ch c = cs.get(rnd.nextInt(cs.size())); spark(c.x + c.face * hw() * 0.3f, c.y - geo.charH * 1.0f, 1);
        }
        if (mode == COMMUTE && "cheer".equals(mood) && rnd.nextFloat() < dt * 0.7f) {
            Ch c = cs.get(rnd.nextInt(cs.size())); spark(c.x, c.y - geo.charH * 1.05f, 0);
        }
    }
    private void dust(float x, float y) {                  // 먼지 한 톨(발밑에서 옅게 번지다 사라진다)
        Spark s = new Spark(); s.x = x; s.y = y; s.type = 2; s.vx = rnd(-3f, 3f); s.vy = rnd(-2f, 0f); s.life = 0.5f;
        sparks.add(s); if (sparks.size() > 24) sparks.remove(0);
    }
    private void spark(float x, float y, int type) {
        Spark s = new Spark(); s.x = x; s.y = y; s.type = type; s.vx = rnd(-8f, 8f); s.vy = type == 1 ? rnd(-16f, -9f) : rnd(-20f, -8f); s.life = type == 1 ? 1.5f : 0.8f;
        sparks.add(s); if (sparks.size() > 24) sparks.remove(0);
    }
    private boolean moveToward(Ch c, float tx, float dist) {
        float d = tx - c.x;
        if (Math.abs(d) <= dist) { c.x = tx; return true; }
        c.face = d > 0 ? 1 : -1; c.x += c.face * dist; return false;
    }
    private void go(Ch c, int st, float dur) { c.st = st; c.t0 = time; c.until = time + dur; c.sq = 0; c.pooped = false; }
    private void jump(Ch c, float x1, float y1, int zone1, int nextSt, float dur, float arc) {
        c.x0 = c.x; c.y0 = c.y; c.x1 = x1; c.y1 = y1; c.nextZone = zone1; c.nextSt = nextSt; c.arc = arc;
        c.st = JUMP; c.t0 = time; c.until = time + dur; c.zone = c.zone == 2 ? 0 : c.zone; c.rot = 0;
        if (x1 != c.x) c.face = x1 > c.x ? 1 : -1;
    }
    private float groundWalkTarget(Ch c) {
        float lo = hw() * 0.85f, hi = geo.W - hw() * 0.85f;
        float x = rnd(lo, hi);
        for (int k = 0; k < 4 && Math.abs(x - c.x) < geo.W * 0.12f; k++) x = rnd(lo, hi);
        return x;
    }

    private boolean nearTop(Ch me, float x) {
        for (Ch o : cs) { if (o == me) continue; float ox = (o.st == JUMP && o.nextZone == 1) ? o.x1 : o.x; if ((o.zone == 1 || (o.st == JUMP && o.nextZone == 1)) && Math.abs(ox - x) < hw() * 1.2f) return true; }
        return false;
    }
    private void pickGround(Ch c) {
        if (mode == COMMUTE) { startGather(c); return; }
        if (settling) { go(c, REST, 6f); return; }
        float r = rnd.nextFloat();
        boolean climbOk = canClimb() && time - c.lastTop > 7f && topCount() < 2;
        boolean poopOk = poops(c.id) && time - c.lastPoop > 12f;
        if (climbOk && r < 0.26f) {
            // 시계 옆(가까운 쪽)까지 걸어간 뒤 뛰어오른다
            boolean left = c.x < geo.clkCx();
            c.tx = clampX(left ? geo.clkL - hw() * 0.7f : geo.clkR() + hw() * 0.7f, 0);
            if (left && c.tx > geo.clkL - hw() * 0.2f) c.tx = clampX(geo.clkL - hw() * 0.2f, 0);
            go(c, TO_SIDE, 6f); return;
        }
        if (poopOk && r < 0.34f) { go(c, POOP, 2.6f); return; }
        pickExtra(c);
    }
    /**
     * 바닥에서 다음 동작 고르기(s305). 캐릭터마다 성격 가중치가 달라 같은 위젯이라도 마리마다 다른 짓을 한다.
     * 순서: 걷기 · 쉬기 · 콩콩 · 질주 · 두리번 · 기지개 · 흔들흔들 · 빙글 · 통통(높이 3번) · 인사(친구에게 가기) · 술래잡기.
     * 새 동작은 모두 같은 그림 시트(걷기 16칸)를 기울이고·늘이고·뒤집어 그린다 — 시트를 더 읽지 않고 그림 주기도 그대로라 배터리 쓰임이 같다.
     */
    static float[] mood(String id) {
        if ("dolsom".equals(id)) return new float[] { 18, 6, 8, 12, 5, 3, 5, 10, 6, 7, 12 };      // 신나는 개: 질주 · 술래잡기 · 빙글
        if ("ppopu".equals(id)) return new float[] { 20, 8, 8, 6, 6, 3, 12, 6, 5, 14, 6 };       // 붙임성: 인사 · 흔들흔들
        if ("lovel".equals(id)) return new float[] { 20, 18, 4, 4, 14, 14, 3, 2, 2, 5, 4 };       // 도도한 고양이: 쉬기 · 두리번 · 기지개
        if ("dudung".equals(id)) return new float[] { 20, 14, 3, 2, 16, 6, 12, 3, 3, 8, 3 };      // 느긋한 두더지: 두리번 · 흔들흔들
        if ("sul".equals(id)) return new float[] { 14, 10, 10, 6, 14, 8, 4, 5, 14, 6, 6 };        // 독수리: 높이 통통 · 두리번
        if ("chaeng".equals(id)) return new float[] { 14, 6, 14, 6, 5, 3, 6, 14, 14, 6, 8 };      // 올챙이: 통통 · 빙글
        if ("juksun".equals(id)) return new float[] { 20, 20, 4, 1, 8, 14, 6, 2, 2, 8, 2 };      // 느린 판다: 쉬기 · 기지개
        if ("bbosong".equals(id)) return new float[] { 18, 10, 6, 3, 6, 6, 14, 4, 4, 14, 4 };     // 다정한 하마: 인사 · 흔들흔들
        return new float[] { 20, 12, 8, 4, 8, 6, 6, 5, 5, 8, 5 };
    }
    private static final int[] EX_ST = { WALK, REST, HOP, DASH, LOOK, STRETCH, WIGGLE, SPIN, BOUNCE, VISIT, CHASE };
    /** 짝이 될 수 있는 친구: 바닥에서 한가한(걷기·쉬기·콩콩·두리번…) 다른 마리. 없으면 null. */
    private Ch findPal(Ch me) {
        List<Ch> ok = new ArrayList<Ch>();
        for (Ch o : cs) {
            if (o == me || o.pal != null || o.zone != 0 || o.home != null || o.alpha < 0.99f) continue;
            if (o.st == WALK || o.st == REST || o.st == HOP || o.st == LOOK || o.st == STRETCH || o.st == WIGGLE) ok.add(o);
        }
        return ok.isEmpty() ? null : ok.get(rnd.nextInt(ok.size()));
    }
    private void pickExtra(Ch c) {
        float[] w = mood(c.id); float tot = 0f; float[] v = new float[EX_ST.length];
        Ch pal = (mode == NORMAL && !settling) ? findPal(c) : null;
        for (int i = 0; i < v.length; i++) {
            v[i] = w[i];
            if (EX_ST[i] == c.last) v[i] *= 0.25f;                          // 같은 동작을 연달아 하지 않게
            if ((EX_ST[i] == VISIT || EX_ST[i] == CHASE) && pal == null) v[i] = 0f;
            if (EX_ST[i] == DASH && geo.W < hw() * 6f) v[i] = 0f;           // 좁은 위젯에선 달릴 자리가 없다
            tot += v[i];
        }
        float r = rnd.nextFloat() * tot; int pick = 0;
        for (int i = 0; i < v.length; i++) { if (r < v[i]) { pick = i; break; } r -= v[i]; pick = i; }
        int st = EX_ST[pick]; c.last = st;
        switch (st) {
            case WALK: c.tx = groundWalkTarget(c); go(c, WALK, 7f); return;
            case REST: go(c, REST, rnd(1.6f, 3.4f)); return;
            case HOP: go(c, HOP, rnd(0.8f, 1.4f)); return;
            case DASH: {
                float lo = hw() * 0.85f, hi = geo.W - hw() * 0.85f, x = rnd(lo, hi);
                for (int k = 0; k < 6 && Math.abs(x - c.x) < geo.W * 0.3f; k++) x = rnd(lo, hi);
                c.tx = x; go(c, DASH, 5f); c.mark = time; return; }
            case LOOK: go(c, LOOK, rnd(1.8f, 2.8f)); return;
            case STRETCH: go(c, STRETCH, rnd(1.8f, 2.4f)); return;
            case WIGGLE: go(c, WIGGLE, rnd(1.4f, 2.2f)); return;
            case SPIN: go(c, SPIN, rnd(1.2f, 1.8f)); return;
            case BOUNCE: go(c, BOUNCE, 2.4f); c.cnt = 0; return;
            case VISIT: {                                                   // 친구 곁으로 가서 인사
                c.pal = pal; pal.pal = c; float side = c.x < pal.x ? -1f : 1f;
                c.tx = clampX(pal.x + side * hw() * 1.15f, 0); go(c, VISIT, 9f);
                pal.st = WAITP; pal.t0 = time; pal.until = time + 10f; pal.off = 0f; pal.face = c.x < pal.x ? -1 : 1; return; }
            default: {                                                      // 술래잡기: c 가 술래, 친구는 도망
                c.pal = pal; pal.pal = c; c.cnt = 0; pal.cnt = 0;
                go(c, CHASE, 4.6f); go(pal, FLEE, 4.6f); pal.until = c.until; return; }
        }
    }
    /** 짝 동작이 끝났거나 깨졌다(짝이 다른 일로 빠졌다): 짝 연결을 풀고 쉰다. */
    private void freePal(Ch c, int next, float dur) { Ch o = c.pal; c.pal = null; if (o != null && o.pal == c) o.pal = null; go(c, next, dur); }
    private boolean palIn(Ch c, int a, int b, int d) { Ch o = c.pal; return o != null && o.pal == c && (o.st == a || o.st == b || o.st == d); }
    private void pickTop(Ch c) {
        if (settling || mode == COMMUTE) { dropDown(c); return; }
        float onTop = time - c.t0;
        float r = rnd.nextFloat();
        boolean poopOk = poops(c.id) && time - c.lastPoop > 10f;
        if (r < 0.28f) { c.tx = clampX(rnd(geo.clkL, geo.clkR()), 1); go(c, TOP_WALK, 6f); return; }
        if (r < 0.46f) { go(c, TOP_REST, rnd(1.8f, 3.4f)); return; }
        if (r < 0.66f && poopOk) { go(c, POOP, 2.6f); return; }
        if (r < 0.86f) {
            // 모서리에 매달린다: 자리가 넉넉한 쪽 모서리
            boolean left = rnd.nextBoolean();
            float hx = hangX(left);
            c.tx = hx; c.face = left ? 1 : -1;
            c.x0 = c.x; c.y0 = c.y; c.x1 = hx; c.y1 = geo.clkT + geo.charH; c.arc = 3f; c.nextZone = 2; c.nextSt = HANG;
            c.st = JUMP; c.t0 = time; c.until = time + 0.3f; return;
        }
        if (onTop > 4f) { dropDown(c); return; }
        go(c, TOP_REST, rnd(1.2f, 2.4f));
    }
    /** 매달리는 자리: 시계 바깥 모서리에 자리가 있으면 거기, 시계가 칸을 꽉 채워 자리가 없으면 숫자 앞(안쪽 모서리). */
    private float hangX(boolean left) {
        float outL = geo.clkL - hw() * 0.4f, outR = geo.clkR() + hw() * 0.4f;
        if (left) return outL >= hw() * 0.8f ? outL : geo.clkL + hw() * 0.45f;
        return outR <= geo.W - hw() * 0.8f ? outR : geo.clkR() - hw() * 0.45f;
    }
    private void dropDown(Ch c) {
        float side = c.x < geo.clkCx() ? geo.clkL - hw() * 0.6f : geo.clkR() + hw() * 0.6f;
        if (mode == COMMUTE) side = c.x;
        float gx = clampX(side, 0);
        jump(c, gx, geo.ground, 0, mode == COMMUTE ? GATHER : REST, 0.5f, 14f);
        c.lastTop = time;
    }

    private void stepChar(Ch c, float dt) {
        float u = (c.until > c.t0) ? Math.min(1f, (time - c.t0) / (c.until - c.t0)) : 1f;
        float sy = c.zone == 1 ? topY() : geo.ground;
        c.rot = 0; c.sq = 0; c.sx = 0f; c.alpha = 1f;
        switch (c.st) {
            case WALK:
                c.y = geo.ground; c.off = 0; c.ph += dt;
                if (moveToward(c, c.tx, c.spd * dt) || time >= c.until) pickGround(c);
                break;
            case REST:
                c.y = c.zone == 1 ? topY() : geo.ground; c.off = 0; c.frame = 0; c.ph += dt * 0.15f;
                if (time >= c.until) { if (c.zone == 1) pickTop(c); else pickGround(c); }
                break;
            case HOP: {
                c.y = geo.ground; c.ph += dt * 1.4f; c.off = Math.abs((float) Math.sin(u * Math.PI * 2f)) * geo.charH * 0.28f;
                c.x = clampX(c.x + c.face * c.spd * 0.35f * dt, 0);
                if (time >= c.until) { c.off = 0; pickGround(c); }
                break; }
            case TO_SIDE:
                c.y = geo.ground; c.off = 0; c.ph += dt;
                if (moveToward(c, c.tx, c.spd * dt)) {
                    float lx = clampX(rnd(geo.clkL, geo.clkR()), 1);
                    for (int k = 0; k < 6 && nearTop(c, lx); k++) lx = clampX(rnd(geo.clkL, geo.clkR()), 1);
                    c.face = lx > c.x ? 1 : -1;
                    jump(c, lx, topY(), 1, TOP_REST, 0.6f, geo.charH * 0.5f);
                } else if (time >= c.until) pickGround(c);
                break;
            case JUMP: {
                float e = Math.min(1f, (time - c.t0) / Math.max(0.05f, c.until - c.t0));
                float ee = e * e * (3f - 2f * e);
                c.x = c.x0 + (c.x1 - c.x0) * ee;
                c.y = c.y0 + (c.y1 - c.y0) * ee; c.off = 4f * c.arc * e * (1f - e); c.ph += dt * 1.2f;
                if (e >= 1f) {
                    c.x = c.x1; c.y = c.y1; c.off = 0; c.zone = c.nextZone;
                    if (c.zone == 1) c.t0 = time;
                    if (c.nextSt == HANG) { go(c, HANG, rnd(3f, 5f)); }
                    else if (c.nextSt == BED_WALK) { c.st = BED_WALK; c.t0 = time; c.until = time + 14f; }
                    else if (c.nextSt == GATHER) { c.st = GATHER; c.t0 = time; c.until = time + 8f; c.tx = clampX(slotX(cs.indexOf(c)), 0); }
                    else go(c, c.nextSt, c.nextSt == TOP_REST ? rnd(1.5f, 3f) : rnd(2f, 4f));
                    if (c.nextSt == TOP_REST) c.lastTop = time;
                }
                break; }
            case TOP_WALK:
                c.y = topY(); c.off = 0; c.ph += dt;
                if (moveToward(c, c.tx, c.spd * 0.8f * dt) || time >= c.until) pickTop(c);
                break;
            case TOP_REST:
                c.y = topY(); c.off = 0; c.frame = 0;
                c.rot = (float) Math.sin((time - c.t0) * 2.4f + c.x) * 3.5f;                  // 시계 위에 앉아 몸을 살랑살랑(s305)
                if (time >= c.until) pickTop(c);
                break;
            case POOP: {
                c.off = 0; c.y = c.zone == 1 ? topY() : geo.ground; c.frame = 4;
                c.sq = (u > 0.14f && u < 0.78f) ? 0.2f + (float) Math.sin(u * 60f) * 0.02f : 0f;
                if (u > 0.58f && !c.pooped) {
                    c.pooped = true; Poop p = new Poop(); p.x = c.x - c.face * hw() * 0.55f; p.y = c.y; p.born = time; poops.add(p); if (poops.size() > 3) poops.remove(0);
                    c.lastPoop = time; spark(p.x, p.y - 4f, 0);
                }
                if (time >= c.until) { if (c.zone == 1) go(c, TOP_REST, 1.2f); else go(c, HOP, 0.9f); }
                break; }
            case HANG: {
                c.y = geo.clkT + geo.charH; c.off = 0; c.frame = 5; c.zone = 2;
                c.rot = (float) Math.sin((time - c.t0) * 3.6f) * 11f * (c.face > 0 ? 1f : -1f);
                if (time >= c.until) {
                    c.zone = 2;
                    float gx = clampX(c.x + (c.face > 0 ? -hw() * 0.4f : hw() * 0.4f), 0);
                    jump(c, gx, geo.ground, 0, REST, 0.5f, 6f); c.lastTop = time;
                }
                break; }
            case GATHER: {
                c.y = geo.stageY; c.off = 0; c.ph += dt * 1.3f;
                if (moveToward(c, c.tx, c.spd * 1.6f * dt) || time >= c.until) {
                    c.face = c.x < geo.clkCx() ? 1 : -1; if (Math.abs(c.x - geo.clkCx()) < geo.clkW * 0.12f) c.face = (cs.indexOf(c) % 2 == 0) ? 1 : -1;
                    go(c, CHEER, 1e6f); c.t0 = time + cs.indexOf(c) * 0.23f; c.face0 = c.face;
                }
                break; }
            case CHEER: {
                c.y = geo.stageY; c.zone = 0; c.ph += dt * 0.9f;
                float tt = Math.max(0f, time - c.t0);
                if ("cheer".equals(mood)) { c.off = Math.abs((float) Math.sin(tt * 5.2f)) * geo.charH * 0.26f; c.frame = (int) (tt * 14f) % 16; }
                else if ("comfort".equals(mood)) { c.off = 0; c.frame = 0; c.rot = (float) Math.sin(tt * 1.8f) * 4f; }
                else { c.off = (tt % 1.6f) < 0.18f ? geo.charH * 0.12f : 0f; c.frame = 0; c.face = (((int) (tt / 1.6f)) % 2 == 0) ? c.face0 : -c.face0; }
                break; }
            case LOOK: {                                                       // 두리번: 서서 좌우를 번갈아 본다
                c.y = geo.ground; c.off = 0; c.frame = 0;
                if (c.cnt == 0) { c.cnt = 1; c.face0 = c.face; }
                int k = (int) (u * 4.6f); c.face = (k % 2 == 0) ? c.face0 : -c.face0;
                c.rot = (float) Math.sin(time * 5f) * 2.5f;
                if (time >= c.until) { c.cnt = 0; pickGround(c); }
                break; }
            case STRETCH: {                                                    // 기지개: 앞으로 쭉 기울어 늘어났다가 돌아온다
                c.y = geo.ground; c.off = 0; c.frame = 0;
                float bell = u < 0.2f ? u / 0.2f : u > 0.8f ? (1f - u) / 0.2f : 1f; bell = bell * bell * (3f - 2f * bell);
                c.rot = c.face * 9f * bell; c.sx = 0.13f * bell; c.sq = 0.05f * bell + (u > 0.3f && u < 0.7f ? (float) Math.sin(time * 18f) * 0.01f : 0f);
                if (time >= c.until) pickGround(c);
                break; }
            case WIGGLE: {                                                     // 흔들흔들: 제자리에서 몸을 좌우로 턴다(엉덩이춤)
                c.y = geo.ground; c.off = 0; c.frame = 0;
                float env = u < 0.15f ? u / 0.15f : u > 0.85f ? (1f - u) / 0.15f : 1f;
                c.rot = (float) Math.sin((time - c.t0) * 15f) * 7.5f * env; c.sx = (float) Math.sin((time - c.t0) * 15f + 1.6f) * 0.04f * env;
                if (time >= c.until) pickGround(c);
                break; }
            case DASH: {                                                       // 질주: 평소의 2.3배 속도로 달리며 뒤에 먼지
                c.y = geo.ground; c.off = Math.abs((float) Math.sin(time * 14f)) * geo.charH * 0.04f; c.ph += dt * 1.7f; c.rot = c.face * 4f;
                if (time - c.mark > 0.22f) { c.mark = time; dust(c.x - c.face * hw() * 0.5f, c.y - 2f); }
                if (moveToward(c, c.tx, c.spd * 2.3f * dt) || time >= c.until) { dust(c.x - c.face * hw() * 0.6f, c.y - 2f); go(c, REST, rnd(0.8f, 1.6f)); c.mark = 0f; }
                break; }
            case SPIN: {                                                       // 빙글: 작게 콩콩 뛰며 좌우를 휙휙 돌아본다
                c.y = geo.ground; c.ph += dt; c.off = Math.abs((float) Math.sin(u * Math.PI * 5f)) * geo.charH * 0.12f;
                if (c.cnt == 0) { c.cnt = 1; c.face0 = c.face; }
                c.face = ((int) ((time - c.t0) / 0.14f)) % 2 == 0 ? c.face0 : -c.face0; c.sq = 0.04f * (float) Math.abs(Math.sin(time * 22f));
                if (time >= c.until) { c.cnt = 0; c.face = c.face0; go(c, REST, rnd(0.5f, 1.2f)); }
                break; }
            case BOUNCE: {                                                     // 통통: 높이 세 번 뛰고, 닿을 때마다 납작해지며 먼지
                c.y = geo.ground; c.ph += dt * 1.2f;
                float v = Math.abs((float) Math.sin(u * Math.PI * 3f)); c.off = v * geo.charH * 0.6f; c.sq = (1f - v) < 0.12f ? 0.12f * (1f - (1f - v) / 0.12f) : 0f;
                int land = (int) (u * 3f + 0.0001f);
                if (land > c.cnt) { c.cnt = land; dust(c.x, c.y - 2f); }
                if (time >= c.until) { c.off = 0f; c.cnt = 0; go(c, REST, rnd(0.6f, 1.4f)); }
                break; }
            case VISIT: {                                                      // 친구 곁으로 걸어가 인사하러 간다
                c.y = geo.ground; c.off = 0; c.ph += dt;
                if (!palIn(c, WAITP, WAITP, WAITP)) { freePal(c, REST, rnd(0.4f, 1f)); break; }
                if (moveToward(c, c.tx, c.spd * 1.1f * dt)) {
                    Ch o = c.pal; c.face = c.x < o.x ? 1 : -1; o.face = -c.face;
                    go(c, GREET, 1.9f); go(o, GREET, 1.9f); c.mark = time; o.mark = time; spark((c.x + o.x) / 2f, c.y - geo.charH * 1.05f, 1);
                } else if (time >= c.until) freePal(c, REST, 0.6f);
                break; }
            case WAITP: {                                                      // 친구가 오는 걸 기다리며 그쪽을 쳐다본다
                c.y = geo.ground; c.off = 0; c.frame = 0; c.rot = (float) Math.sin(time * 4f) * 1.5f;
                if (!palIn(c, VISIT, GREET, GREET) || time >= c.until) { freePal(c, REST, 0.3f); }
                break; }
            case GREET: {                                                      // 인사: 마주 보고 번갈아 콩콩 + 하트
                c.y = geo.ground; c.ph += dt * 1.2f;
                boolean first = cs.indexOf(c) < (c.pal == null ? 0 : cs.indexOf(c.pal));
                float ph2 = (time - c.t0) * 6.5f + (first ? 0f : (float) Math.PI * 0.5f);
                c.off = Math.max(0f, (float) Math.sin(ph2)) * geo.charH * 0.2f * (u < 0.85f ? 1f : 0.4f);
                if (u > 0.5f && time - c.mark > 0.7f) { c.mark = time; if (first) spark((c.x + (c.pal != null ? c.pal.x : c.x)) / 2f, c.y - geo.charH * 1.05f, 1); }
                if (time >= c.until) { c.off = 0f; c.last = HOP; freePal(c, HOP, rnd(0.6f, 1f)); }
                break; }
            case CHASE: {                                                      // 술래: 친구를 쫓아간다 — 잡으면 술래가 바뀐다(두 번까지)
                c.y = geo.ground; c.off = Math.abs((float) Math.sin(time * 13f)) * geo.charH * 0.035f; c.ph += dt * 1.6f;
                if (!palIn(c, FLEE, FLEE, FLEE)) { freePal(c, REST, rnd(0.5f, 1.2f)); break; }
                Ch o = c.pal;
                if (time >= c.until) { c.off = 0f; c.last = HOP; Ch p2 = o; freePal(c, HOP, 1.2f); if (p2.st == FLEE || p2.st == CHASE) go(p2, HOP, 1.4f); break; }
                moveToward(c, o.x, c.spd * 1.7f * dt);
                if (Math.abs(c.x - o.x) < hw() * 0.95f) {
                    spark((c.x + o.x) / 2f, c.y - geo.charH * 1.0f, 0); dust(c.x, c.y - 2f);
                    if (c.cnt >= 2) { c.off = 0f; c.last = HOP; Ch p2 = o; freePal(c, HOP, 1.2f); if (p2.st == FLEE || p2.st == CHASE) go(p2, HOP, 1.4f); break; }
                    int n = c.cnt + 1; float un = c.until; c.st = FLEE; o.st = CHASE; c.cnt = n; o.cnt = n; c.until = un; o.until = un; o.t0 = time; c.t0 = time;
                    c.x += (c.x < o.x ? -1 : 1) * hw() * 0.3f;                 // 잡힌 쪽이 살짝 밀려 나며 곧바로 도망
                }
                break; }
            case FLEE: {                                                       // 도망: 술래 반대쪽으로 달린다(끝에 닿으면 반대로 꺾어 달린다)
                c.y = geo.ground; c.off = Math.abs((float) Math.sin(time * 13f)) * geo.charH * 0.035f; c.ph += dt * 1.6f;
                if (!palIn(c, CHASE, CHASE, CHASE)) { freePal(c, REST, rnd(0.5f, 1.2f)); break; }
                Ch o = c.pal; float away = c.x >= o.x ? 1f : -1f, lo = hw() * 0.85f, hi = geo.W - hw() * 0.85f;
                if ((away > 0f && c.x > hi - hw() * 0.4f) || (away < 0f && c.x < lo + hw() * 0.4f)) away = -away;     // 벽에 몰리면 술래 옆을 스쳐 반대로
                c.face = away > 0f ? 1 : -1; c.x = clampX(c.x + away * c.spd * 1.55f * dt, 0);
                break; }
            case BED_WALK:
                c.y = geo.ground; c.off = 0; c.ph += dt; c.alpha = 1f;
                if (c.home == null) { go(c, REST, 0.3f); break; }
                if (moveToward(c, c.tx, c.spd * dt) || time >= c.until) { c.x = c.tx; c.st = ENTER; c.t0 = time; c.until = time + 0.7f; }
                break;
            case ENTER: {
                float k = u * u * (3f - 2f * u);                                         // 걷던 모습이 사라지고 자는 장면이 나타난다(같은 자리에서 서서히 바뀐다)
                c.y = geo.ground; c.frame = 0; c.alpha = 1f - k; c.mix = k; c.sq = 0f; c.off = 0f;
                if (time >= c.until) { c.st = SLEEP; c.t0 = time; c.until = forever ? 1e9f : time + rnd(20f, 60f); }
                break; }
            case SLEEP:
                c.y = geo.ground; c.frame = 0; c.alpha = 0f; c.mix = 1f; c.sq = 0f; c.off = 0f;
                if (time >= c.until) startExit(c, 0f);
                break;
            case EXIT: {
                float e = Math.max(0f, Math.min(1f, (time - c.t0) / Math.max(0.05f, c.until - c.t0))), k = e * e * (3f - 2f * e);
                c.y = geo.ground; c.frame = 0; c.alpha = c.a0 + (1f - c.a0) * k; c.mix = c.mix0 * (1f - k); c.sq = c.sq0 * (1f - k); c.off = c.off0 * (1f - k);
                if (c.home != null && time >= c.t0) c.home.want = false;                 // 나오기 시작하면 집이 서서히 사라진다
                if (time >= c.until) { c.home = null; c.alpha = 1f; c.mix = 0f; c.sq = 0f; c.off = 0f; go(c, REST, rnd(0.3f, 1.2f)); }
                break; }
            default: break;
        }
        if (c.st == WALK || c.st == TO_SIDE || c.st == TOP_WALK || c.st == JUMP || c.st == GATHER || c.st == BED_WALK || c.st == DASH || c.st == VISIT || c.st == CHASE || c.st == FLEE) c.frame = (int) (c.ph * c.cfg[3]) % 16;
        else if (c.st == HOP || c.st == BOUNCE || c.st == SPIN || c.st == GREET) c.frame = (int) (c.ph * c.cfg[3]) % 16;
        if (c.frame < 0) c.frame = 0;
    }
}
