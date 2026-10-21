package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 경로 탐색 로딩의 "뛰어가는 캐릭터"(웹 _RC · #transitLoading — 2026-10-13/22 s133) 순수 계산. 안드로이드를 쓰지 않아 JVM 에서 시험한다.
 * 순수 장식 — 판단·계산과 무관. 글(제목 · 안내)은 엔진이 정하고(node runner), 여기는 시간으로부터 "어느 캐릭터의 몇 번째 프레임을 어디에 그릴까"만 계산한다.
 * 규격(칸 크기 · 바닥 높이 · 속도 · 가로지르는 시간)은 웹 _RC.D3 와 같은 값이고, SceneModel.D3 와 겹치는 값(fps · cell · base · ox · lift · intro)은 시험이 같은지 확인한다.
 */
public final class RunnerCore {
    private RunnerCore() {}

    public static final String[] ORDER = { "dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng" };
    public static final float TRACK_W = 236f, TRACK_H = 98f, WHEEL_TRACK_W = 150f, WHEEL_TRACK_H = 26f;

    public static final class Spec {
        public final int n, fps, intro, introFps;
        public final double cell, base, ox, T, sh, lift, x0;
        Spec(int fps, double cell, double base, double ox, double T, double sh, double lift, int intro, int introFps, double x0) {
            this.n = 16; this.fps = fps; this.cell = cell; this.base = base; this.ox = ox; this.T = T; this.sh = sh; this.lift = lift; this.intro = intro; this.introFps = introFps; this.x0 = x0;
        }
    }
    public static Spec spec(String id) {
        switch (id == null ? "" : id) {
            case "dolsom": return new Spec(19, 86, 248.5, 120.8, 2.7, 0.34, 0, 0, 0, 0);       // 뛴다
            case "lovel":  return new Spec(11, 88, 250, 117.9, 3.4, 0.34, 0, 0, 0, 0);         // 걷는다
            case "ppopu":  return new Spec(19, 88, 248.5, 120.3, 2.3, 0.34, 0, 0, 0, 0);       // 뛴다
            case "chaeng": return new Spec(15, 88, 244.5, 154.5, 3.2, 0.2, 12, 0, 0, 0);       // 헤엄친다
            case "sul":    return new Spec(20, 104, 230.5, 131, 2.6, 0.2, 0, 0, 0, 0);         // 난다
            case "dudung": return new Spec(13, 106, 222.5, 128, 3.5, 0.34, 0, 14, 14, 0.16);   // 땅에서 솟아 걷는다
            default: return null;
        }
    }

    /** 방금 나온 것(prev)이 아닌 캐릭터 하나. r 은 0 이상 1 미만의 무작위 값(시험이 고정할 수 있게 밖에서 받는다). */
    public static String pick(String prev, double r) {
        int cnt = 0; String[] a = new String[ORDER.length];
        for (String s : ORDER) if (!s.equals(prev)) a[cnt++] = s;
        int i = (int) Math.floor(Math.max(0d, Math.min(0.999999d, r)) * cnt);
        return a[Math.min(cnt - 1, i)];
    }

    /** 한 프레임. done = 화면을 다 가로질렀다(다음 캐릭터로). */
    public static final class Frame {
        public String id = ""; public boolean intro, done; public int idx; public float x, shadowX; public double u;
    }
    /** tMs = 이 캐릭터가 나온 지 지난 시간(ms), wc = 달리는 칸 너비. */
    public static Frame at(String id, long tMs, float wc) {
        Spec d = spec(id); Frame f = new Frame(); f.id = id;
        if (d == null) { f.done = true; return f; }
        double t = Math.max(0L, tMs) / 1000d, ti = d.intro > 0 ? (double) d.intro / d.introFps : 0d;
        f.intro = t < ti;
        double tw = Math.max(0d, t - ti); f.u = tw / d.T; f.done = f.u >= 1d;
        if (d.intro > 0) { double x0 = wc * d.x0; f.x = (float) (f.intro ? x0 : x0 + f.u * (wc + d.cell * 0.5 - x0)); }      // 두덩: 제자리에서 솟은 뒤 걸어 나간다
        else f.x = (float) (-d.cell * 0.45 + f.u * (wc + d.cell * 0.9));
        f.idx = f.intro ? Math.min(d.intro - 1, (int) Math.floor(t * d.introFps)) : (int) (Math.floor(tw * d.fps) % d.n);
        f.shadowX = f.x;
        return f;
    }

    // ── 바퀴(시트를 못 읽는 동안의 대신) ──
    /** 웹 rtlRoll: 1.3초 동안 -24 → 트랙 끝으로(직선), 1080도 회전. */
    public static float wheelPhase(long tMs) { return (float) ((Math.max(0L, tMs) % 1300L) / 1300d); }
    public static float wheelX(long tMs, float trackW) { return -24f + wheelPhase(tMs) * (trackW + 24f); }
    public static float wheelRot(long tMs) { return wheelPhase(tMs) * 1080f; }

    // ── 말줄임표 점 3개(웹 rtlDot 1.4초 · 점마다 0.2초씩 늦게: 0→1(40%)→0(80%)) ──
    public static float dotAlpha(long tMs, int i) {
        long t = tMs - 200L * i;
        if (t < 0L) return 0f;
        double p = (t % 1400L) / 1400d;
        if (p < 0.4) return (float) (p / 0.4);
        if (p < 0.8) return (float) (1d - (p - 0.4) / 0.4);
        return 0f;
    }
}
