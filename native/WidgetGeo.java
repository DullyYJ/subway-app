package com.dullyyj.subway;

/**
 * 캐릭터 시계 위젯의 자리 잡기(안드로이드와 상관없는 순수 계산 — dp 단위).
 *  · 시계 숫자 상자(clk*), 글자 크기(textDp), 캐릭터 키(charH), 바닥(ground), 출퇴근 때의 말풍선·버튼 자리를 위젯 크기에서 정한다.
 *  · 시계 글자는 시스템 TextClock 이 그리고(분이 바뀌어도 앱이 깨어 있을 필요가 없다), 캐릭터는 이 상자를 기준으로 올라가고 매달린다.
 *  · 경로·시각 계산이 아니라 그림 배치일 뿐이다.
 */
public final class WidgetGeo {
    public final boolean vertical;
    public final float W, H;
    /** 시계 숫자가 실제로 차지하는 상자(dp). 위젯 왼쪽 위 기준. */
    public float clkL, clkT, clkW, clkH;
    /** 시계 글자 크기(dp 단위로 지정 — 글꼴 크기 설정과 상관없이 같게). 세로형은 시·분 두 줄이라 한 줄 크기. */
    public float textDp;
    /** 세로형에서 '시' 줄과 '분' 줄 사이 간격 포함, 각 줄 숫자 상자 높이. */
    public float lineH;
    public float charH, ground, stageY;
    /** 출퇴근 때 캐릭터가 줄 서는 가로 범위(시계가 줄어도 캐릭터 셋이 겹치지 않을 만큼). 평소에는 시계 폭과 같다. */
    public float stageL, stageW;
    /** 출퇴근 장면: 말풍선·버튼 */
    public float bubL, bubT, bubW, bubH, btnL, btnT, btnW, btnH;
    /** 출퇴근 장면 글자 크기(dp): 시계 > 말풍선 > 버튼 순으로 작아진다. 말풍선 줄 수는 실제 글꼴로 잰 쪽(WidgetCore)이 넣어 준다. */
    public float bubTs, btnTs;
    public int bubLines = 2;
    /** 말풍선 안쪽 여백(dp) — 낮은 가로 위젯에서는 좁힌다. */
    public float bubPad = 8f;
    /** 날짜 글자 자리(왼쪽 위) */
    public float dateL, dateT, dateSp;

    public static final float DIGIT_W = 0.56f, COLON_W = 0.26f, DIGIT_H = 0.72f;

    /** 말풍선 글줄 높이 배수·안쪽 여백, 말풍선과 버튼 사이·버튼과 아래 가장자리 사이(dp), 버튼 높이/글자 배수, 버튼 글자/말풍선 글자 비율. */
    public static final float LINE_K = 1.3f, GAP = 6f, MARGIN_B = 8f, BTN_K = 2.5f, BTN_RATIO = 0.88f;
    public static final float BTN_MIN_H = 30f;
    public boolean commute;
    private WidgetGeo(boolean v, float w, float h) { vertical = v; W = w; H = h; }

    private static float clamp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    public static WidgetGeo of(boolean vertical, float W, float H) {
        WidgetGeo g = new WidgetGeo(vertical, Math.max(60f, W), Math.max(60f, H));
        g.build();
        return g;
    }

    /** 출퇴근 장면이면 시계를 줄여 다시 배치한다(글꼴 실측은 호출한 쪽이 measured 로 다시 넣는다). */
    public void setCommute(boolean c) { setCommute(c, bubLines); }
    /** 출퇴근 장면 여부와 말풍선 글 줄 수가 바뀌었을 때만 다시 배치한다. */
    public void setCommute(boolean c, int lines) {
        lines = Math.max(1, Math.min(6, lines));
        if (c == commute && lines == bubLines) return;
        commute = c; bubLines = lines; build();
    }
    /** 말풍선 상자 높이(글 줄 수 × 글자 크기 × 줄 간격 + 위아래 여백). */
    public float bubbleHeight() { return bubLines * bubTs * LINE_K + 2f * bubPad; }
    public static float buttonHeight(float btnTs) { return Math.max(BTN_MIN_H, btnTs * BTN_K); }
    private static float btnHeightFor(boolean vertical, float btnTs) { return vertical ? buttonHeight(btnTs) : Math.max(24f, btnTs * BTN_K); }
    /** 출퇴근 장면 글자 크기를 정한다 — 상자 폭에 비례해 말풍선 글자를 키우고, 높이가 모자라면(가로형) 줄인다. 시계(T)보다는 늘 작다. */
    private void sizeText(float boxW, float T) {
        float ts = vertical ? clamp(boxW / 12.5f, 13f, 18f) : clamp(H * 0.11f, 12f, 18f);   // 가로형은 폭이 좁아 높이에 맞춘다
        if (!vertical) {
            bubPad = clamp(H * 0.07f, 4f, 8f);
            float avail = H - 4f - 6f;
            while (ts > 8f && bubLines * ts * LINE_K + 2f * bubPad + GAP + btnHeightFor(false, ts * BTN_RATIO) > avail) ts -= 0.5f;
        }
        ts = Math.min(ts, Math.max(8f, T - 1f));
        bubTs = ts; btnTs = ts * BTN_RATIO;
    }

    /**
     * 위젯 칸에 시계가 꽉 차게(배경은 투명이라 시계 크기가 곧 위젯의 모습) — 캐릭터가 시계 위에 오를 머리 공간만 남기고 가운데에 크게 둔다.
     * 출퇴근 장면에서는 말풍선(글 줄 수만큼)과 버튼이 들어갈 자리만큼만 시계를 줄인다(시계 > 말풍선 글자 > 버튼 글자).
     */
    private void build() {
        ground = H - 4f;
        float headroom;
        float T;
        if (!vertical) {
            charH = clamp(H * 0.30f, 22f, 40f);
            headroom = charH + 4f;
            float tH = (H - headroom - 8f) / DIGIT_H, tW = (W - 16f) / (4 * DIGIT_W + COLON_W);
            T = clamp(Math.min(tH, tW), 16f, 120f);
            if (commute) {
                T = Math.max(14f, Math.min(T, (W - 136f) / (4 * DIGIT_W + COLON_W)));         // 옆에 말풍선·버튼 칸이 들어갈 만큼만 줄인다
                float sw = Math.max((4 * DIGIT_W + COLON_W) * T, STAGE_PER_CHAR * charH * 3f);
                sizeText(Math.max(60f, W - 8f - sw - 12f - 8f), T);
            }
            textDp = T;
            clkW = (4 * DIGIT_W + COLON_W) * T; clkH = DIGIT_H * T; lineH = clkH;
        } else {
            charH = clamp(Math.min(W * 0.36f, H * 0.14f), 22f, 40f);
            headroom = charH + 4f;
            float tH = (H - headroom - 8f) / (DIGIT_H * 2f + 0.30f), tW = (W - 12f) / (2 * DIGIT_W);
            T = clamp(Math.min(tH, tW), 16f, 120f);
            if (commute) {
                sizeText(W - 16f, T);
                // 시계 아래에 필요한 자리(캐릭터 줄 + 말풍선 + 버튼)만 빼고 남는 만큼 — 자리가 넉넉하면 시계는 줄이지 않는다
                float below = 0.25f * charH + 8f + bubbleHeight() + GAP + btnHeightFor(true, btnTs) + MARGIN_B;
                float fit = (H - headroom - below) / (DIGIT_H * 2f + 0.30f);
                T = Math.max(14f, Math.min(T, fit));
                bubTs = Math.min(bubTs, Math.max(8f, T - 1f)); btnTs = bubTs * BTN_RATIO;
            }
            textDp = T;
            lineH = DIGIT_H * T;
            clkW = 2 * DIGIT_W * T; clkH = lineH * 2f + T * 0.30f;
        }
        derive();
    }

    /** 실제 글꼴로 잰 시계 숫자 상자(dp)를 받아 나머지 자리를 다시 계산한다(글꼴마다 숫자 폭·높이가 조금 다르다). 세로형의 lineH 는 한 줄 숫자 높이. */
    public void measured(float digitsW, float digitsH, float oneLineH) {
        if (digitsW > 4f && digitsH > 4f) {
            if (!vertical) { clkW = digitsW; clkH = digitsH; lineH = digitsH; }
            else { lineH = oneLineH > 2f ? oneLineH : digitsH; clkW = digitsW; clkH = lineH * 2f + textDp * 0.30f; }
        }
        derive();
    }

    /** 시계 상자·캐릭터 키에서 시계 자리, 말풍선·버튼, 줄 서는 높이를 정한다. */
    public void derive() {
        float headroom = charH + 4f;
        stageW = clkW;
        if (commute) stageW = Math.max(clkW, STAGE_PER_CHAR * charH * 3f);
        btnH = commute ? btnHeightFor(vertical, btnTs) : BTN_MIN_H;
        if (!vertical) {
            if (!commute) {
                stageL = (W - clkW) / 2f;
                clkL = stageL;
                clkT = clamp(H - 8f - clkH, headroom, H);               // 머리 공간을 남기고 아래쪽에 크게
            } else {
                stageL = 8f;
                clkL = stageL + (stageW - clkW) / 2f;
                clkT = Math.max(headroom, clamp(H * 0.30f, 16f, H - clkH - 40f));
            }
            dateL = stageL; dateSp = 11f; dateT = 3f;
            float rl = stageL + stageW + 12f, rr = W - 8f;
            bubL = rl; bubW = Math.max(60f, rr - rl);
            btnW = bubW; btnL = bubL;                                  // 버튼 폭 = 말풍선 폭
            btnT = H - btnH - (commute ? 6f : MARGIN_B);
            bubH = commute ? bubbleHeight() : 26f;
            bubT = Math.max(2f, btnT - GAP - bubH);
        } else {
            stageL = (W - stageW) / 2f;
            clkL = (W - clkW) / 2f;
            if (!commute) clkT = clamp(H - 8f - clkH, headroom, H);
            else clkT = headroom;
            dateL = 0; dateSp = 11f; dateT = 3f;
            btnW = W - 16f; btnL = 8f;
            btnT = H - btnH - MARGIN_B;
            bubL = 8f; bubW = W - 16f;
            bubH = commute ? bubbleHeight() : 30f;
            bubT = btnT - GAP - bubH;
        }
        stageY = Math.min(ground, clkT + clkH + charH * 0.25f);
    }
    /** 캐릭터 한 마리가 줄 설 때 차지하는 폭(캐릭터 키의 배수) */
    public static final float STAGE_PER_CHAR = 0.82f;

    public float clkR() { return clkL + clkW; }
    public float clkB() { return clkT + clkH; }
    public float clkCx() { return clkL + clkW / 2f; }
}
