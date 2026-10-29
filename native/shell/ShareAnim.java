package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.Random;

/**
 * 내 위치 공유 GIF 의 움직임 계획(순수 자바): 길동무 친구 한 마리(무작위)가 카드의 노선선 위를 두 점 사이로 오가고,
 * 내 위치 마커는 숨 쉬듯 깜박인다. 프레임 수는 마커 깜박임 주기의 배수라 반복할 때 끊김이 없다.
 *  · 글과 값(역·시각)은 엔진이 정한 것을 그리기만 하고, 여기는 '장식 움직임'만 계획한다(경로·시각 계산 없음).
 *  · 걷는 시트(16프레임)는 걸음이 미끄러지지 않게 간 거리에 맞춰 넘긴다(WidgetSim.spd 와 같은 보폭).
 */
final class ShareAnim {
    /** 한 바퀴 프레임 수 · 한 프레임 시간(1/100초) · 마커 깜박임 한 번의 프레임 수. */
    static final int N = 98, DELAY_CS = 7, PULSE = 14, PAUSE = 6;

    final String id;
    final float[] cfg;                // WidgetSim.cfg(id)
    final float charH;                // 카드 좌표(360 폭 기준)에서 친구의 키
    final float[] x = new float[N];   // 발 중심 x(카드 좌표)
    final int[] face = new int[N];    // +1 오른쪽 · -1 왼쪽
    final int[] sheet = new int[N];   // 걷는 시트 칸(0~15)
    final float[] pulse = new float[N];   // 마커 깜박임 위상 0~1

    /** seed: 같은 값이면 같은 계획. lo/hi: 친구가 오갈 수 있는 x 범위. */
    ShareAnim(long seed, float lo, float hi, float charH) {
        long z = seed * 0x9E3779B97F4A7C15L; z ^= (z >>> 31); z *= 0xBF58476D1CE4E5B9L; z ^= (z >>> 29);   // 이어지는 씨앗도 골고루 흩는다(Random 은 이어지는 씨앗의 첫 값이 비슷하다)
        Random r = new Random(z);
        id = WidgetSim.ORDER[r.nextInt(WidgetSim.ORDER.length)];
        cfg = WidgetSim.cfg(id); this.charH = charH;
        float span = Math.max(20f, hi - lo), d = Math.min(span, 80f + r.nextFloat() * 60f);
        float a = lo + r.nextFloat() * Math.max(0f, span - d), b = a + d;
        if (r.nextBoolean()) { float t = a; a = b; b = t; }                        // 어느 쪽에서 출발할지도 무작위
        int leg = (N - 2 * PAUSE) / 2;                                              // 편도 걷는 프레임 수
        float sc = charH * cfg[5] / (cfg[1] - cfg[0]), stride = 256f * sc * 0.85f / 16f;   // 시트 한 칸이 나아가는 거리
        float ph = 0f, px = a; int fc = b >= a ? 1 : -1;
        for (int i = 0; i < N; i++) {
            pulse[i] = (i % PULSE) / (float) PULSE;
            int t = i;
            float tx; int f; boolean walking;
            if (t < PAUSE) { tx = a; f = fc; walking = false; }
            else if (t < PAUSE + leg) { tx = a + (b - a) * ((t - PAUSE + 1) / (float) leg); f = fc; walking = true; }
            else if (t < 2 * PAUSE + leg) { tx = b; f = -fc; walking = false; }
            else { tx = b + (a - b) * ((t - 2 * PAUSE - leg + 1) / (float) leg); f = -fc; walking = true; }
            if (walking) ph += Math.abs(tx - px) / stride; else ph = 0f;
            px = tx; x[i] = tx; face[i] = f; sheet[i] = walking ? ((int) ph % 16 + 16) % 16 : 0;
        }
    }
}
