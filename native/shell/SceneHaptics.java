package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.HashMap;

/**
 * 장면 진동 무늬표(순수 자바 — android.* 없음, JVM 에서 시험한다).
 *
 * SceneCore 는 '무슨 일이 일어났는지'만 이름으로 알린다(grab·release·land_cotton …). 어떤 느낌으로 울릴지는 여기서만 정한다.
 * 안드로이드 쪽(SceneDriver)은 이 표의 [쉬는 ms, 울리는 ms, 쉬는 ms, 울리는 ms …]와 세기(0~255)를 VibrationEffect.createWaveform 에 그대로 넘긴다.
 *  · 첫 칸은 늘 '쉬는' 칸(0). 세기 배열은 시간 배열과 같은 길이이고, 쉬는 칸의 세기는 0.
 *  · 세기 조절이 없는 폰은 세기 0 이 아니면 그냥 켜진다 → 길이로도 느낌이 나게 짧고 또렷하게 만들었다.
 *
 * 캐릭터별 착륙 느낌(웹의 landK: dolsom=cotton, ppopu=pose, dudung=dig, lovel=flip, sul=fly, chaeng=puddle)
 *   cotton(하얀강아지) 폭신하게 눌렸다 퍼지는 부드러운 두 번 · pose(갈색강아지) 또렷한 '착' 한 번과 여운 ·
 *   dig(두더지) 땅을 파는 빠른 세 번 · flip(고양이) 공중회전의 윙— 하는 올라가는 떨림 뒤 착지 · fly(독수리) 날갯짓 두 번과 가벼운 착지 ·
 *   puddle(올챙이) 첨벙! 센 한 번 뒤 번지는 잔물결.
 */
public final class SceneHaptics {
    private SceneHaptics() {}

    /** 한 무늬. timings[i] ms 동안 amps[i] 세기. */
    public static final class Pat {
        public final long[] timings; public final int[] amps;
        Pat(long[] t, int[] a) { timings = t; amps = a; }
        public long total() { long s = 0; for (long v : timings) s += v; return s; }
    }

    private static final HashMap<String, Pat> TABLE = new HashMap<>();
    private static void p(String name, long[] t, int[] a) { TABLE.put(name, new Pat(t, a)); }
    static {
        // 손가락 동작
        p("grab",         new long[]{0, 14},                    new int[]{0, 110});                    // 꾹 눌러 집었다: 짧고 또렷
        p("release",      new long[]{0, 10},                    new int[]{0, 70});                     // 놓았다: 더 가볍게
        // 착륙(캐릭터마다 다르게)
        p("land",         new long[]{0, 22},                    new int[]{0, 170});
        p("land_cotton",  new long[]{0, 18, 34, 36},            new int[]{0, 95, 0, 45});              // 폭신
        p("land_pose",    new long[]{0, 12, 52, 10},            new int[]{0, 200, 0, 110});            // 착!
        p("land_dig",     new long[]{0, 20, 36, 20, 36, 26},    new int[]{0, 200, 0, 170, 0, 225});    // 파파팍
        p("land_flip",    new long[]{0, 10, 14, 14, 14, 18, 16, 30}, new int[]{0, 50, 0, 85, 0, 120, 0, 235}); // 윙— 착
        p("land_fly",     new long[]{0, 20, 70, 20, 60, 14},    new int[]{0, 110, 0, 90, 0, 60});     // 펄럭 펄럭 사뿐
        p("land_puddle",  new long[]{0, 30, 44, 18, 44, 12},    new int[]{0, 235, 0, 120, 0, 60});    // 첨벙 + 잔물결
        p("land_tumble",  new long[]{0, 12, 20, 14, 20, 30},    new int[]{0, 70, 0, 110, 0, 210});     // 데구르르 쿵
        p("land_hose",    new long[]{0, 16, 30, 16, 30, 40},    new int[]{0, 120, 0, 90, 0, 60});      // 촤악 사뿐
        p("squirt",       new long[]{0, 18, 22, 18, 22, 18},    new int[]{0, 90, 0, 120, 0, 90});      // 쏴아
        // 연출
        p("flap",         new long[]{0, 16, 60, 16},            new int[]{0, 100, 0, 80});
        p("hearts",       new long[]{0, 22, 70, 30},            new int[]{0, 130, 0, 100});            // 두근두근
        p("thud",         new long[]{0, 34},                    new int[]{0, 230});
        p("angry",        new long[]{0, 28, 40, 28, 40, 40},    new int[]{0, 210, 0, 230, 0, 255});
        p("splash",       new long[]{0, 26, 38, 16, 38, 10},    new int[]{0, 220, 0, 110, 0, 50});
        p("grin",         new long[]{0, 10, 50, 10},            new int[]{0, 90, 0, 140});
    }

    /** 이름의 무늬. 모르는 이름이면 null(울리지 않는다). */
    public static Pat get(String name) { return name == null ? null : TABLE.get(name); }
    public static java.util.Set<String> names() { return TABLE.keySet(); }

    /** 무늬가 올바른 모양인가(시험용): 길이가 같고, 첫 칸이 쉼이며, 쉬는 칸은 세기 0, 우는 칸은 1~255. */
    public static String check(String name) {
        Pat q = get(name); if (q == null) return name + ": 무늬 없음";
        if (q.timings.length != q.amps.length) return name + ": 시간·세기 길이가 다르다";
        if (q.timings.length < 2 || q.timings[0] != 0 || q.amps[0] != 0) return name + ": 첫 칸이 쉼(0)이 아니다";
        for (int i = 0; i < q.timings.length; i++) {
            if (q.timings[i] < 0) return name + ": 음수 시간";
            boolean on = i % 2 == 1;
            if (on && (q.amps[i] < 1 || q.amps[i] > 255)) return name + ": 세기 범위 밖 [" + i + "]=" + q.amps[i];
            if (!on && q.amps[i] != 0) return name + ": 쉬는 칸에 세기가 있다 [" + i + "]";
            if (on && q.timings[i] < 4) return name + ": 너무 짧아 느껴지지 않는다 [" + i + "]";
        }
        if (q.total() > 400) return name + ": 너무 길다(" + q.total() + "ms) — 장면 진동은 짧아야 한다";
        return null;
    }
}
