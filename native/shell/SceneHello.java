package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 홈 '길동무 친구들' 카드를 3초 꾹 누르면(s340, YJ) 카드가 배경 그대로 세로 2배로 슬라이드로 늘어나고,
 * 나머지 친구들이 나와 시간대 인사를 한 뒤 남을 친구들만 남고 들어가며 카드가 다시 줄어든다.
 *
 * 이 파일은 그 '대본'을 다루는 순수 계산이다(안드로이드 없음 · JVM 시험 가능).
 *   - Plan: 엔진이 만든 대본(assets/open.json 의 hello · 칸의 hello)을 지금 칸에 맞춰 담은 것. 시간 · 자리 · 차례 · 인사 글은 모두 엔진이 정했다 — 앱 코드에는 글도 숫자도 없다.
 *   - ext(ms): 카드가 늘어난 정도(0~1) — 늘어날 때와 줄어들 때 부드럽게(ease in-out)
 *   - mix(ms): 평소 장면에서 늘어난 장면으로 바뀌는 정도(0~1)
 *   - seats(seed): 어느 친구가 어느 자리에 설지(무작위 · 같은 seed 면 같은 배치)
 * 친구들이 걷고 인사하는 그림은 SceneCore.startHello 가 그린다(카드의 장면 엔진 그대로).
 */
public final class SceneHello {
    private SceneHello() {}

    public static final class Plan {
        public int expand = 650, greet = 2300, step = 380, bubble = 900, leave = 5900, collapse = 6150, end = 6800;
        public double boost = 2.2;
        public double[] sx = new double[0], sz = new double[0];
        public int[] order = new int[0];
        public String[] chars = new String[0];
        public Map<String, String> say = new HashMap<String, String>();
        public boolean rest;
        public String slot = "";
    }

    /** 엔진 대본이 쓸 만한가: 자리 수 = 차례 수 = 친구 수, 모든 친구에게 인사 글이 있고, 시간이 앞뒤가 맞다. */
    public static boolean ok(Plan p) {
        if (p == null || p.chars.length < 3 || p.sx.length != p.chars.length || p.sz.length != p.sx.length || p.order.length != p.sx.length) return false;
        for (String c : p.chars) { String s = p.say.get(c); if (s == null || s.length() == 0) return false; }
        boolean[] seen = new boolean[p.order.length];
        for (int o : p.order) { if (o < 0 || o >= seen.length || seen[o]) return false; seen[o] = true; }
        return p.expand > 0 && p.collapse > p.leave && p.end > p.collapse && p.greet >= p.expand * 0.5 && p.leave > p.greet && p.step > 0 && p.bubble > 0;
    }

    static double ease(double u) { u = Math.max(0, Math.min(1, u)); return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }

    /** 카드가 늘어난 정도 0~1: 처음 expand ms 동안 늘고, collapse 부터 end 까지 줄어든다. */
    public static double ext(Plan p, double ms) {
        if (ms <= 0) return 0;
        if (ms < p.expand) return ease(ms / p.expand);
        if (ms < p.collapse) return 1;
        if (ms >= p.end) return 0;
        return 1 - ease((ms - p.collapse) / (double) (p.end - p.collapse));
    }

    /** 평소 장면 → 늘어난 장면으로 바뀌는 정도 0~1: 늘어나는 동안 앞 80% 에 걸쳐 바뀌고, 줄어들 땐 뒤 40% 에 걸쳐 되돌아간다. */
    public static double mix(Plan p, double ms) {
        if (ms <= 0) return 0;
        if (ms < p.expand) return ease(ms / (p.expand * 0.8));
        if (ms < p.collapse + (p.end - p.collapse) * 0.6) return 1;
        if (ms >= p.end) return 0;
        double a = p.collapse + (p.end - p.collapse) * 0.6;
        return 1 - ease((ms - a) / (p.end - a));
    }

    public static boolean done(Plan p, double ms) { return ms >= p.end; }

    /** 자리마다 누가 서는지(자리 번호 → 친구 id). 무작위지만 같은 seed 면 같다. */
    public static String[] seats(Plan p, long seed) {
        List<String> pool = new ArrayList<String>(); Collections.addAll(pool, p.chars);
        Collections.shuffle(pool, new Random(seed * 0x9E3779B97F4A7C15L + 0x1234567L));
        return pool.toArray(new String[0]);
    }

    /** 자리 번호 → 인사 차례(0 이 첫째). */
    public static int[] rank(Plan p) { int[] r = new int[p.order.length]; for (int i = 0; i < p.order.length; i++) r[p.order[i]] = i; return r; }
}
