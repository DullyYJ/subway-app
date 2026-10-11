package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.animation.ValueAnimator;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.drawable.Drawable;
import android.view.animation.LinearInterpolator;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextPaint;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.VelocityTracker;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 다른 앱 위에 표시(오버레이) 플러그인 — "다른 앱을 보면서도 내 위치를 알 수 있게".
 *
 * 2026-10-01 신설 (YJ: "오버레이 방식 구현 — 앱이 백그라운드로 돌면 알아서 위에 떠야 해")
 * ──────────────────────────────────────────────────────────────────
 * · 이 플러그인은 '그리기'만 한다. 무엇을 보여줄지(현재 ▸ 다음 역, 남은 시간 문구)는 웹이 정해서
 *   update() 로 문자열을 넘겨 주고, 여기서는 받은 글자를 그대로 찍는다.
 * · 앱 화면이 사라지면(액티비티 onStop) 자동으로 뜨고, 앱으로 돌아오면(onStart) 자동으로 사라진다.
 *   PiP(작은 창)·알림 권한 창 같은 '앱이 아직 보이는 상태'에서는 onStop 이 오지 않으므로 겹치지 않는다.
 * · 권한: 설정 > 다른 앱 위에 표시(SYSTEM_ALERT_WINDOW). 사용자가 설정 화면에서 직접 켜야 한다
 *   (구글 플레이 정책도 이 권한은 시스템 설정 화면으로 보내 승인받도록 안내한다).
 * · 안전장치: 웹이 3분 넘게 갱신을 안 보내면(앱이 죽었거나 안내가 끝났는데 신호를 놓침) 스스로 숨겨
 *   낡은 시각이 계속 떠 있는 일이 없게 한다.
 * · 광고·홍보 문구는 절대 이 창에 넣지 않는다(플레이 정책: 앱 밖 화면에 광고 금지).
 */
@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    private static final long STALE_MS = 3 * 60 * 1000L;
    private static final long CHECK_MS = 30 * 1000L;
    private static final String PREF = "overlay_pos";

    private final Handler main = new Handler(Looper.getMainLooper());

    private volatile boolean wanted = false;       // 웹: 안내 중이고 오버레이를 쓰기로 함
    private volatile boolean appVisible = true;    // 액티비티가 화면에 보이는가
    private volatile long lastUpdateAt = 0L;
    private String line1 = "", line2 = "", line3 = "";
    // ★ 2026-10-11 (YJ: "오버레이도 앱의 경로 화면으로 — 현위치 글씨만 검은색, 나머지는 회색. 정류장명은 한 줄, 길면 적당히 잘라"):
    //   앱 경로 화면(타임라인)의 칸을 웹이 그대로 읽어 보내 주면(이름·노선 라벨·시각·점/선 색) 여기서는 같은 모양으로 그리기만 한다.
    private static class Cell {
        String n = "", t = "", g = "";          // 정류장명 · 시각 · 노선 라벨(931번, ↔ 인천2호선)
        boolean pill = false;                   // 라벨이 색 배지(환승·출발·도착)인가
        int gc = 0xFF8E8E93;                    // 라벨 색(배지면 배경색)
        boolean hasL = false, hasR = false;     // 왼쪽·오른쪽 선이 있는가
        int lc = 0xFF8E8E93, rc = 0xFF8E8E93;   // 선 색
        int dc = 0xFF0A84FF;                    // 점 색
        int dk = 1;                             // 점 모양: 0 없음 · 1 속이 빈 동그라미 · 2 꽉 찬 점 · 3 작은 점(도보)
    }
    // ★ 2026-10-11 (YJ: "오버레이에도 탑승 버튼을 앱처럼 — 2분 전 자동으로 나오고, 쓸어 올리면 나오고 쓸어 내리면 숨고"):
    //   언제 보일지(board 올림 · wait 대기 알약 · undo 되돌리기 · hidden 숨김)와 문구·색은 앱의 탑승 시트 상태(_rs)를 웹이 그대로 넘겨 준다.
    //   여기서는 그리기와 손짓(쓸어 올림·내림·탑승 누름)을 웹에 알리는 일만 한다.
    private String rsSt = "hidden", rsK = "", rsCh = "", rsNm = "", rsUm = "", rsBt = "탑승";
    private boolean rsHasCbg = false;
    private int rsCbg = 0xFF0A84FF, rsCfg = 0xFF0A84FF;
    private float rsBar = -1f;                  // 출발 뒤 남은 비율(0~1), 없으면 -1
    private BoardView boardView;
    // ★ 2026-10-11 (YJ: "추천은 오버레이 하단에 · 추천아이템 연결 버튼 · 끄는 확인 버튼"): 도착 3분 전부터 맨 아래에 두 줄 추천 + [보기] [확인]. 문구·시각·갈 곳은 웹이 정한다.
    private boolean rcOn = false;
    private String rcA = "", rcB = "", rcGo = "보기";
    private RecoView recoView;
    private Cell[] strip = new Cell[0];
    private int stripCur = 0;                   // 현위치 칸 번호(strip 안에서)
    // ★ 2026-10-11 (YJ: "오버레이 좌우 스크롤 가능하게 · 마커도 깜박이게"): 웹이 현위치 앞뒤 칸을 넉넉히(최대 50칸) 보내고,
    //   화면에는 다섯 칸만 보인다. 손가락으로 좌우로 밀면 넘겨 볼 수 있고, 손을 뗀 지 10초 뒤 현위치로 돌아온다.
    private int stripBase = 0;                  // strip[0] 이 경로 전체에서 몇 번째 칸인지(칸이 앞에서 잘려 나가도 스크롤 위치를 지키려고)
    private float scrollPos = 0f;               // 화면 맨 왼쪽 칸의 경로 전체 기준 위치(칸 단위, 소수)
    private boolean userScrolling = false;
    private float pulse = 0f;                   // 현위치 점 깜박임 0~1
    private ValueAnimator pulseAnim;
    private ValueAnimator flingAnim;            // 손가락을 떼도 관성으로 미끄러지는 스크롤
    private int thBg = Color.WHITE, thFg = Color.parseColor("#111114"), thSub = Color.parseColor("#8E8E93");
    private GradientDrawable cardBg;
    private boolean moving = false;             // ★ 2026-10-06: 열차가 현재 역을 떠나 다음 역으로 가는 중(웹이 판단해 넘겨 준다) — 화살표가 깜박인다
    private long lastVibeAt = 0L;               // 마지막으로 진동한 경고의 시각(웹이 단계가 바뀐 때 찍어 보냄) — 같은 경고에 두 번 울리지 않는다
    private int alertLevel = 0;                 // 하차 임박: 0 없음 · 2 두 정거장 전(무지개 테두리가 천천히) · 1 한 정거장 전(빠르게)
    private RainbowBorder border;
    private ValueAnimator borderAnim;
    private int borderMode = 0;

    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private TextView t1, t2, t3;
    private boolean attached = false;

    // ★ 2026-10-11: 현재역과 다음역 사이 선이 이동 중이면 깜박인다(예전 화살표 -->를 대신한다. 무엇을 보여줄지·이동 중인지는 웹이 정하고, 여기서는 그리기·깜박임만 한다).
    private StripView stripView;
    private LinearLayout infoRow;               // ★ 남은시간 줄 + 오른쪽 '대기' 알약
    private WaitChip waitChip;
    private int rowWpx = 0;
    private static final long BLINK_MS = 550L;
    private boolean blinkOn = false, blinking = false;
    private final Runnable blinker = new Runnable() {
        @Override public void run() {
            if (!attached || !moving || stripView == null) { blinking = false; return; }
            blinkOn = !blinkOn;
            stripView.setLit(blinkOn);
            main.postDelayed(this, BLINK_MS);
        }
    };

    /**
     * 앱 경로 화면(타임라인)과 같은 모양으로 다섯 칸을 그리는 뷰: 정류장명 · 노선 라벨 · 점과 선 · 시각.
     * 현위치 칸만 글씨가 검정(테마의 글자색)이고 나머지는 회색. 정류장명은 한 줄이며 칸보다 길면 끝을 '…' 로 자른다.
     */
    private class StripView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private boolean lit = true;
        StripView(Context c) {
            super(c);
            tp.setTextAlign(Paint.Align.CENTER);
        }
        void setLit(boolean on) { lit = on; invalidate(); }
        int wantH() { return dp(54); }   // ★ 2026-10-11 (YJ: 노선 라벨을 시각 왼쪽으로 옮겨 줄 하나를 줄여줘): 64dp → 54dp
        // 높이는 우리가 정한 값으로 고정한다(부모가 wrap_content 라도 화면 전체를 덮지 않게).
        @Override protected void onMeasure(int wSpec, int hSpec) {
            setMeasuredDimension(MeasureSpec.getSize(wSpec), wantH());
        }
        private void text(Canvas cv, String s, float cx, float y, float maxW, float sp, int color, boolean bold) {
            if (s == null || s.length() == 0) return;
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), cx, y, tp);
        }
        @Override protected void onDraw(Canvas cv) {
            int n = strip.length;
            if (n == 0) return;
            int cols = 5;
            float cw = getWidth() / (float) cols;
            float yName = dp(2) + dp(11.5f);
            float yAx = dp(28);
            float yTime = dp(49);
            float lw = dp(3);
            for (int i = 0; i < n; i++) {
                Cell c = strip[i];
                float cx = (stripBase + i - scrollPos + 0.5f) * cw;
                if (cx + cw / 2f < 0f || cx - cw / 2f > getWidth()) continue;      // 화면 밖 칸은 그리지 않는다
                boolean here = (i == stripCur);
                int ink = here ? thFg : thSub;
                // 정류장명(한 줄)
                text(cv, c.n, cx, yName, cw - dp(3), here ? 11.5f : 10.5f, ink, true);
                // 선
                p.setStyle(Paint.Style.FILL);
                boolean blinkSeg = moving && !lit && ((i == stripCur && c.hasR) || (i == stripCur + 1 && c.hasL));
                int al = blinkSeg ? 70 : 255;
                if (c.hasL) {
                    p.setColor((c.lc & 0x00FFFFFF) | (al << 24));
                    cv.drawRect(cx - cw / 2f, yAx - lw / 2f, cx, yAx + lw / 2f, p);
                }
                boolean blinkR = moving && !lit && (i == stripCur && c.hasR);
                if (c.hasR) {
                    p.setColor((c.rc & 0x00FFFFFF) | ((blinkR ? 70 : 255) << 24));
                    cv.drawRect(cx, yAx - lw / 2f, cx + cw / 2f, yAx + lw / 2f, p);
                }
                // 점
                if (here) {
                    // ★ 2026-10-11 (YJ): 대기 중(정차)엔 노란(주황) 점, 움직이는 중엔 앱 화면처럼 파란 점
                    int hc = moving ? 0x000A84FF : 0x00F0A500;
                    int ha = Math.round(0x70 * (1f - 0.6f * pulse));
                    p.setColor((ha << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(9) + dp(4) * pulse, p);   // 현위치 둘레 테두리(깜박이며 커졌다 작아짐)
                    int da = Math.round(255 * (1f - 0.55f * pulse));
                    p.setColor((da << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(7), p);           // 앱 현위치 점(대기 주황 · 이동 파랑, 깜박임)
                } else if (c.dk == 2) {
                    p.setColor(c.dc);
                    cv.drawCircle(cx, yAx, dp(7), p);
                } else if (c.dk == 1) {
                    p.setColor(c.dc);
                    cv.drawCircle(cx, yAx, dp(6), p);
                    p.setColor(thBg);
                    cv.drawCircle(cx, yAx, dp(3), p);
                } else if (c.dk == 3) {
                    p.setColor(c.dc);
                    cv.drawCircle(cx, yAx, dp(3), p);
                }
                // 시각 — 노선 라벨(75번 · 환승 · 출발 · 도착)은 시각 왼쪽에 붙여 한 줄로
                if (c.g.length() > 0) {
                    float maxRow = cw - dp(3);
                    float sc = getResources().getDisplayMetrics().scaledDensity;
                    tp.setTypeface(Typeface.DEFAULT_BOLD);
                    tp.setTextSize(9.5f * sc);
                    float tmW = c.t.length() > 0 ? tp.measureText(c.t) : 0f;
                    float gap = c.t.length() > 0 ? dp(3) : 0f;
                    float pad = c.pill ? dp(8) : 0f;
                    tp.setTextSize((c.pill ? 7f : 8f) * sc);
                    CharSequence e = TextUtils.ellipsize(c.g, tp, Math.max(dp(10), maxRow - tmW - gap - pad), TextUtils.TruncateAt.END);
                    float gW = tp.measureText(e, 0, e.length()) + pad;
                    float x0 = cx - (gW + gap + tmW) / 2f;
                    if (c.pill) {
                        rf.set(x0, yTime - dp(8.5f), x0 + gW, yTime + dp(2.5f));
                        p.setStyle(Paint.Style.FILL);
                        p.setColor(c.gc);
                        cv.drawRoundRect(rf, dp(4), dp(4), p);
                        tp.setColor(Color.WHITE);
                        tp.setTextAlign(Paint.Align.CENTER);
                        cv.drawText(e, 0, e.length(), x0 + gW / 2f, yTime, tp);
                    } else {
                        tp.setColor(c.gc);
                        tp.setTextAlign(Paint.Align.LEFT);
                        cv.drawText(e, 0, e.length(), x0, yTime, tp);
                    }
                    if (c.t.length() > 0) {
                        tp.setTextSize(9.5f * sc);
                        tp.setTypeface(Typeface.DEFAULT_BOLD);
                        tp.setColor(ink);
                        tp.setTextAlign(Paint.Align.LEFT);
                        cv.drawText(c.t, x0 + gW + gap, yTime, tp);
                    }
                    tp.setTextAlign(Paint.Align.CENTER);
                } else {
                    text(cv, c.t, cx, yTime, cw - dp(3), 9.5f, ink, true);
                }
            }
        }
    }


    /**
     * 오버레이 맨 아래 줄: 앱의 탑승 시트와 같은 상태를 그린다.
     *  hidden — 얇은 손잡이(쓸어 올리면 열림) · wait — '대기' 알약 · board — 탑승 안내 + [탑승] 버튼 · undo — '탑승으로 기록했어요' + [되돌리기]
     * 높이는 상태에 맞게 부드럽게 늘고 준다.
     */
    private class BoardView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private final RectF btn = new RectF();
        private float h = -1f;
        private String shown = "";
        private ValueAnimator anim;
        BoardView(Context c) { super(c); }
        int targetH(String st) {
            if ("board".equals(st) || "undo".equals(st)) return dp(42);
            if ("wait".equals(st)) return 0;     // ★ 대기 알약은 남은시간 줄 오른쪽으로 옮겼다(줄 하나 절약)
            return dp(9);
        }
        void setState(String st) {
            if (st == null) st = "hidden";
            boolean first = h < 0f;
            if (!st.equals(shown) || first) {
                shown = st;
                final float to = targetH(st);
                if (anim != null) { anim.cancel(); anim = null; }
                if (first) { h = to; requestLayout(); }
                else {
                    final float from = h;
                    anim = ValueAnimator.ofFloat(0f, 1f);
                    anim.setDuration(240L);
                    anim.setInterpolator(new DecelerateInterpolator(1.8f));
                    anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                        @Override public void onAnimationUpdate(ValueAnimator an) {
                            h = from + (to - from) * (Float) an.getAnimatedValue();
                            requestLayout();
                        }
                    });
                    anim.start();
                }
            }
            invalidate();
        }
        void cancelAnim() { try { if (anim != null) anim.cancel(); } catch (Exception ignored) { } anim = null; }
        @Override protected void onMeasure(int wSpec, int hSpec) {
            setMeasuredDimension(MeasureSpec.getSize(wSpec), Math.round(Math.max(0f, h < 0f ? targetH("hidden") : h)));
        }
        /** 보이는 버튼(탑승 · 되돌리기)을 눌렀나 — 손가락 오차를 감안해 사방 8dp 넓게. */
        boolean hitBtn(float x, float y) {
            if (!("board".equals(shown) || "undo".equals(shown)) || btn.isEmpty()) return false;
            float m = dp(8);
            return x >= btn.left - m && x <= btn.right + m && y >= btn.top - m && y <= btn.bottom + m;
        }
        private float txt(Canvas cv, String s, float x, float y, float maxW, float sp, int color, boolean bold, Paint.Align al) {
            if (s == null || s.length() == 0) return 0f;
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            tp.setTextAlign(al);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), x, y, tp);
            return tp.measureText(e, 0, e.length());
        }
        private float mw(String s, float sp, boolean bold) {
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            return tp.measureText(s == null ? "" : s);
        }
        @Override protected void onDraw(Canvas cv) {
            float w = getWidth();
            btn.setEmpty();
            if ("wait".equals(shown)) {
                return;
            } else if ("board".equals(shown) || "undo".equals(shown)) {
                boolean undo = "undo".equals(shown);
                float padL = dp(4), bw = dp(undo ? 84 : Math.max(70f, Math.min(104f, mw(rsBt, 14.5f, true) / getResources().getDisplayMetrics().density + 26f))), bh = dp(30);
                float bt = dp(5);
                btn.set(w - padL - bw, bt, w - padL, bt + bh);
                if (undo) {
                    p.setColor((0x33 << 24) | (thSub & 0x00FFFFFF));
                    cv.drawRoundRect(btn, bh / 2f, bh / 2f, p);
                    txt(cv, "되돌리기", btn.centerX(), btn.centerY() + dp(4.6f), bw - dp(8), 13f, thFg, true, Paint.Align.CENTER);
                    txt(cv, rsUm.length() > 0 ? rsUm : "탑승으로 기록했어요", padL, btn.centerY() + dp(4.6f), btn.left - padL - dp(8), 13f, thFg, true, Paint.Align.LEFT);
                    return;
                }
                p.setColor(0xFF0A84FF);
                cv.drawRoundRect(btn, bh / 2f, bh / 2f, p);
                txt(cv, rsBt, btn.centerX(), btn.centerY() + dp(5f), bw - dp(8), 14.5f, 0xFFFFFFFF, true, Paint.Align.CENTER);
                float maxL = btn.left - padL - dp(8);
                txt(cv, rsK, padL, dp(4) + dp(11), maxL, 11f, thSub, true, Paint.Align.LEFT);
                float cy0 = dp(4) + dp(16), ch = dp(17);
                float cw = Math.min(maxL * 0.55f, mw(rsCh, 10f, true) + dp(12));
                rf.set(padL, cy0, padL + cw, cy0 + ch);
                if (rsHasCbg) p.setColor(rsCbg); else p.setColor((0x29 << 24) | (rsCfg & 0x00FFFFFF));
                cv.drawRoundRect(rf, dp(5), dp(5), p);
                txt(cv, rsCh, padL + cw / 2f, cy0 + ch / 2f + dp(3.6f), cw - dp(6), 10f, rsCfg, true, Paint.Align.CENTER);
                String nm = rsNm;
                txt(cv, nm, padL + cw + dp(7), cy0 + ch / 2f + dp(4.4f), maxL - cw - dp(7), 13f, thFg, true, Paint.Align.LEFT);
                if (rsBar >= 0f) {
                    float by = dp(40), bx0 = padL, bx1 = w - padL;
                    rf.set(bx0, by, bx1, by + dp(2));
                    p.setColor((0x33 << 24) | (thSub & 0x00FFFFFF));
                    cv.drawRoundRect(rf, dp(1), dp(1), p);
                    rf.set(bx0, by, bx0 + (bx1 - bx0) * Math.max(0f, Math.min(1f, rsBar)), by + dp(2));
                    p.setColor(0xFF0A84FF);
                    cv.drawRoundRect(rf, dp(1), dp(1), p);
                }
            } else {
                // 손잡이: 위로 쓸어 올리면 탑승 안내가 나온다
                float gw = dp(28), gh = dp(3.5f);
                rf.set((w - gw) / 2f, dp(3), (w + gw) / 2f, dp(3) + gh);
                p.setColor((0x59 << 24) | (thSub & 0x00FFFFFF));
                cv.drawRoundRect(rf, gh / 2f, gh / 2f, p);
            }
        }
    }

    /** 맨 아래 추천 줄: 왼쪽 두 줄 문구, 오른쪽 [보기](추천 아이템·맛집으로) [확인](이 추천 끄기). */
    private class RecoView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private final RectF go = new RectF(), ok = new RectF();
        RecoView(Context c) { super(c); }
        @Override protected void onMeasure(int wSpec, int hSpec) {
            setMeasuredDimension(MeasureSpec.getSize(wSpec), dp(44));
        }
        /** 1 = [보기], 2 = [확인], 0 = 버튼 밖(손가락 오차를 감안해 사방 6dp 넓게). */
        int hit(float x, float y) {
            float m = dp(6);
            if (!go.isEmpty() && x >= go.left - m && x <= go.right + m && y >= go.top - m && y <= go.bottom + m) return 1;
            if (!ok.isEmpty() && x >= ok.left - m && x <= ok.right + m && y >= ok.top - m && y <= ok.bottom + m) return 2;
            return 0;
        }
        private float txt(Canvas cv, String s, float x, float y, float maxW, float sp, int color, boolean bold, Paint.Align al) {
            if (s == null || s.length() == 0) return 0f;
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            tp.setTextAlign(al);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), x, y, tp);
            return tp.measureText(e, 0, e.length());
        }
        private float mw(String s, float sp) {
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            return tp.measureText(s == null ? "" : s);
        }
        @Override protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight();
            go.setEmpty(); ok.setEmpty();
            if (!rcOn) return;
            p.setStyle(Paint.Style.FILL);
            rf.set(0, dp(4), w, h - dp(2));
            p.setColor((0x1A << 24) | (thSub & 0x00FFFFFF));
            cv.drawRoundRect(rf, dp(10), dp(10), p);
            float bh = dp(28), by = (h - bh) / 2f + dp(1), gap = dp(6), edge = dp(8);
            float okW = Math.max(dp(48), mw("확인", 12f) + dp(20));
            float goW = Math.max(dp(56), mw(rcGo, 12f) + dp(22));
            ok.set(w - edge - okW, by, w - edge, by + bh);
            go.set(ok.left - gap - goW, by, ok.left - gap, by + bh);
            p.setColor(0xFF0A84FF);
            cv.drawRoundRect(go, bh / 2f, bh / 2f, p);
            txt(cv, rcGo, go.centerX(), go.centerY() + dp(4.2f), goW - dp(8), 12f, 0xFFFFFFFF, true, Paint.Align.CENTER);
            p.setColor((0x33 << 24) | (thSub & 0x00FFFFFF));
            cv.drawRoundRect(ok, bh / 2f, bh / 2f, p);
            txt(cv, "확인", ok.centerX(), ok.centerY() + dp(4.2f), okW - dp(8), 12f, thFg, true, Paint.Align.CENTER);
            float tx = edge + dp(2), maxW = go.left - tx - dp(8);
            if (rcB.length() > 0) {
                txt(cv, rcA, tx, dp(4) + dp(17), maxW, 12f, thFg, true, Paint.Align.LEFT);
                txt(cv, rcB, tx, dp(4) + dp(32), maxW, 11f, thSub, false, Paint.Align.LEFT);
            } else {
                txt(cv, rcA, tx, h / 2f + dp(4.5f), maxW, 12f, thFg, true, Paint.Align.LEFT);
            }
        }
    }

    /** 남은시간 줄 오른쪽에 붙는 '● 대기 · 75번' 알약(앱 탑승 시트의 대기 상태와 같은 뜻). */
    private class WaitChip extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private String s = "";
        private float tw = 0f;
        WaitChip(Context c) { super(c); }
        void setLabel(String label, int maxW) {
            String t = "대기 · " + (label == null ? "" : label);
            tp.setTextSize(10f * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            CharSequence e = TextUtils.ellipsize(t, tp, Math.max(dp(24), maxW - dp(24)), TextUtils.TruncateAt.END);
            String ns = e.toString();
            if (!ns.equals(s)) { s = ns; tw = tp.measureText(s); requestLayout(); }
            invalidate();
        }
        int wantW() { return Math.round(tw + dp(24)); }
        @Override protected void onMeasure(int wSpec, int hSpec) { setMeasuredDimension(wantW(), dp(16)); }
        @Override protected void onDraw(Canvas cv) {
            float ph = getHeight();
            rf.set(0, 0, getWidth(), ph);
            p.setStyle(Paint.Style.FILL);
            p.setColor((0x2A << 24) | (thSub & 0x00FFFFFF));
            cv.drawRoundRect(rf, ph / 2f, ph / 2f, p);
            p.setColor(0xFFF0A500);
            cv.drawCircle(dp(9), ph / 2f, dp(3), p);
            tp.setTextSize(10f * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            tp.setColor(thFg);
            tp.setTextAlign(Paint.Align.LEFT);
            cv.drawText(s, dp(16), ph / 2f + dp(3.6f), tp);
        }
    }

    /** 웹에 손짓을 알린다(웹이 앱 탑승 시트와 똑같이 처리하고 새 상태를 다시 보내 준다). */
    private void act(String a) {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                try { getBridge().getWebView().resumeTimers(); } catch (Exception ignored) { }
                getBridge().getWebView().evaluateJavascript(
                        "try{window._ovlAct&&window._ovlAct('" + a + "');}catch(e){}", null);
            }
        } catch (Exception ignored) { }
    }

    // ── JS 에서 부르는 메서드 ─────────────────────────────────────

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(new JSObject()
                .put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                .put("granted", canDraw())
                .put("shown", attached));
    }

    /** 시스템 '다른 앱 위에 표시' 설정 화면을 연다(사용자가 직접 켠다). */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (canDraw()) {
            call.resolve(new JSObject().put("ok", true).put("granted", true));
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve(new JSObject().put("ok", true).put("granted", false));
        } catch (Exception e) {
            // 일부 기기는 앱별 화면이 없다 → 전체 목록 화면이라도 연다
            try {
                Intent i2 = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
                call.resolve(new JSObject().put("ok", true).put("granted", false).put("fallback", true));
            } catch (Exception e2) {
                call.resolve(new JSObject().put("ok", false).put("error", String.valueOf(e2.getMessage())));
            }
        }
    }

    /**
     * 웹이 주기적으로 부른다. active=false 면 숨긴다.
     * cells/cur: 윗줄 — 앱 경로 화면의 칸(이름 n · 시각 t · 라벨 g/gp/gc · 선 lc/rc · 점 dc/dk)과 현위치 칸 번호(현위치 글씨만 검정, 나머지는 회색).
     * theme: 앱 테마의 카드 바탕·글자·보조 글자 색(bg/fg/sub).
     * line2: 가운데 줄(목적지·남은 시간·도착), line3: 선택(추천 알림 제목 등)
     */
    @PluginMethod
    public void update(PluginCall call) {
        wanted = call.getBoolean("active", false);
        line1 = nz(call.getString("line1"));
        try {
            JSArray arr = call.getArray("cells");
            int n = arr == null ? 0 : Math.min(arr.length(), 150);    // ★ 2026-10-12: 긴 경로가 중간에 끊기지 않게 60 → 150
            Cell[] cs = new Cell[n];
            for (int i = 0; i < n; i++) {
                JSONObject o = arr.getJSONObject(i);
                Cell c = new Cell();
                c.n = o.optString("n", ""); c.t = o.optString("t", ""); c.g = o.optString("g", "");
                c.pill = o.optBoolean("gp", false);
                c.gc = col(o.optString("gc", ""), 0xFF8E8E93);
                String l = o.optString("lc", ""), r = o.optString("rc", "");
                c.hasL = l.length() > 0; c.hasR = r.length() > 0;
                c.lc = col(l, 0xFF8E8E93); c.rc = col(r, 0xFF8E8E93);
                c.dc = col(o.optString("dc", ""), 0xFF0A84FF);
                c.dk = o.optInt("dk", 1);
                cs[i] = c;
            }
            strip = cs;
        } catch (Exception e) { strip = new Cell[0]; }
        stripCur = Math.max(0, Math.min(call.getInt("cur", 0), Math.max(0, strip.length - 1)));
        stripBase = Math.max(0, call.getInt("base", 0));
        try {
            JSObject th = call.getObject("theme");
            if (th != null) {
                thBg = col(th.optString("bg", ""), Color.WHITE);
                thFg = col(th.optString("fg", ""), Color.parseColor("#111114"));
                thSub = col(th.optString("sub", ""), Color.parseColor("#8E8E93"));
            }
        } catch (Exception ignored) { }
        try {
            JSObject rs = call.getObject("rs");
            if (rs != null) {
                rsSt = rs.optString("st", "hidden");
                rsK = rs.optString("k", ""); rsCh = rs.optString("ch", ""); rsNm = rs.optString("nm", ""); rsUm = rs.optString("um", ""); rsBt = rs.optString("bt", "탑승"); if (rsBt.length() == 0) rsBt = "탑승";
                String cb = rs.optString("cbg", "");
                rsHasCbg = cb.length() > 0; rsCbg = col(cb, 0xFF0A84FF);
                rsCfg = col(rs.optString("cfg", ""), 0xFF0A84FF);
                rsBar = (float) rs.optDouble("bar", -1);
            } else { rsSt = "hidden"; }
        } catch (Exception e) { rsSt = "hidden"; }
        try {
            JSObject rc = call.getObject("reco");
            if (rc != null && rc.optBoolean("on", false)) {
                rcOn = true; rcA = rc.optString("a", ""); rcB = rc.optString("b", ""); rcGo = rc.optString("go", "보기");
                if (rcGo.length() == 0) rcGo = "보기";
                if (rcA.length() == 0) rcOn = false;
            } else { rcOn = false; }
        } catch (Exception e) { rcOn = false; }
        moving = call.getBoolean("moving", false);
        Integer al = call.getInt("alert", 0);
        alertLevel = al == null ? 0 : Math.max(0, Math.min(2, al));
        // ★ 2026-10-12 (YJ: "환승 1정거장 전·목적지 2·1정거장 전 — 엣지 하이라이트와 진동"): 테두리와 같은 순간에 진동한다.
        //   판단은 웹이 한다(alertAt = 단계가 켜지거나 바뀐 시각, alertVibe = 설정에서 진동이 허용됐는지). 여기선 새 경고일 때 한 번만 울린다.
        try {
            long alertAt = call.getData().optLong("alertAt", 0L);
            boolean alertVibe = call.getBoolean("alertVibe", false);
            if (alertLevel > 0 && alertVibe && alertAt > 0L && alertAt != lastVibeAt
                    && System.currentTimeMillis() - alertAt < 20000L) {
                lastVibeAt = alertAt;
                vibrateAlert(alertLevel);
            }
        } catch (Exception ignored) { }
        line2 = nz(call.getString("line2"));
        line3 = nz(call.getString("line3"));
        lastUpdateAt = System.currentTimeMillis();
        refresh();
        call.resolve(new JSObject().put("ok", true).put("shown", attached));
    }

    /**
     * ★ 2026-10-01 (YJ: "하차 전 추천 알림이 안 온다"): 앱이 가려지면 웹뷰 타이머가 멈춰 '하차 10분 전' 감시도 같이 멈춘다.
     * 확정한 여정이 진행되는 동안(오버레이를 쓰든 안 쓰든) 네이티브가 5초마다 웹을 깨우도록 웹이 켜고 끈다.
     * 웹이 60초마다 다시 켜 주지 않으면(10분) 스스로 멈춘다.
     */
    @PluginMethod
    public void keepAlive(PluginCall call) {
        journeyOn = call.getBoolean("on", false);
        if (journeyOn) journeyAt = System.currentTimeMillis();
        main.post(new Runnable() { @Override public void run() { if (journeyOn) startTicker(); } });
        call.resolve(new JSObject().put("ok", true));
    }

    // ── 앱이 화면에서 사라지면 뜨고, 돌아오면 사라진다 ─────────────

    @Override
    protected void handleOnStop() {
        appVisible = false;
        refresh();
    }

    @Override
    protected void handleOnStart() {
        appVisible = true;
        refresh();
    }

    @Override
    protected void handleOnDestroy() {
        wanted = false;
        journeyOn = false;
        main.removeCallbacks(ticker);
        ticking = false;
        appVisible = true;
        main.post(new Runnable() { @Override public void run() { detach(); } });
    }

    // ── 내부 ───────────────────────────────────────────────────

    private static String nz(String s) { return s == null ? "" : s; }

    /** '#rrggbb' 문자열을 색으로(잘못된 값이면 기본값). */
    private static int col(String s, int def) {
        try {
            if (s == null || s.length() == 0) return def;
            return Color.parseColor(s);
        } catch (Exception e) { return def; }
    }

    private boolean canDraw() {
        try {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && Settings.canDrawOverlays(getContext());
        } catch (Exception e) {
            return false;
        }
    }

    private void refresh() {
        main.post(new Runnable() {
            @Override public void run() {
                try {
                    boolean stale = (System.currentTimeMillis() - lastUpdateAt) > STALE_MS;
                    boolean show = wanted && !appVisible && !stale && canDraw()
                            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            && (strip.length > 0 || line1.length() > 0);
                    if (show) { rebuildIfResized(); attachOrUpdate(); scheduleCheck(); startTicker(); }
                    else detach();
                } catch (Exception ignored) { }
            }
        });
    }

    private final Runnable checker = new Runnable() {
        @Override public void run() {
            if (attached) refresh();
        }
    };

    private void scheduleCheck() {
        main.removeCallbacks(checker);
        main.postDelayed(checker, CHECK_MS);
    }

    // ★ 2026-10-01 (YJ: "역을 이동해도 오버레이가 실시간으로 안 바뀌고 앱에 갔다 와야 바뀐다"):
    //   앱이 가려지면 웹뷰가 '숨겨진 페이지'가 되어 JS 타이머가 1초~1분 간격으로 늦춰지거나 멈춘다.
    //   → 오버레이가 떠 있는 동안은 네이티브가 5초마다 웹에 '한 번 돌아라' 하고 직접 깨운다.
    //   (스크립트 직접 실행은 타이머 제한을 받지 않는다. 무엇을 계산할지는 웹이 정하고, 여기서는 깨우기만 한다.)
    private static final long TICK_MS = 5 * 1000L;
    private static final long JOURNEY_STALE_MS = 10 * 60 * 1000L;   // 웹이 10분 넘게 '안내 중'이라고 말해 주지 않으면 스스로 멈춘다
    private boolean ticking = false;
    private volatile boolean journeyOn = false;    // 웹: 확정한 여정이 진행 중 (오버레이 사용 여부와 무관)
    private volatile long journeyAt = 0L;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            boolean journey = journeyOn && (System.currentTimeMillis() - journeyAt) < JOURNEY_STALE_MS;
            if (!attached && !journey) { ticking = false; return; }
            try { if (attached) rebuildIfResized(); } catch (Exception ignored0) { }
            try {
                // 앱이 보이는 동안은 웹이 스스로 돌고 있으니 깨울 필요가 없다. 가려진 동안만 깨운다.
                if (!appVisible && getBridge() != null && getBridge().getWebView() != null) {
                    // ★ 2026-10-02 (YJ: "앱을 켤 때마다 위치가 바뀌어 있고 오버레이는 실시간으로 안 바뀐다"): 앱이 가려지면 웹뷰의 타이머·렌더가
                    //   멈춘 상태일 수 있다 → 깨우기 직전에 웹뷰 타이머를 다시 살린다(시스템 전체 설정이 아니라 이 웹뷰의 JS 타이머 일시정지 해제).
                    try { getBridge().getWebView().resumeTimers(); } catch (Exception ignored2) { }
                    getBridge().getWebView().evaluateJavascript(
                            "try{window._ovlNativeTick&&window._ovlNativeTick();}catch(e){}", null);
                }
            } catch (Exception ignored) { }
            main.postDelayed(this, TICK_MS);
        }
    };

    private void startTicker() {
        if (ticking) return;
        ticking = true;
        main.postDelayed(ticker, TICK_MS);
    }

    // ★ 2026-10-02 (YJ: 갤럭시 폴드 — "폰을 펴고 접을 때 화면에 안 맞춰져"): 오버레이는 만들 때의 화면 폭으로 굳어 있었다.
    //   접었다 펴면 화면 폭·밀도가 바뀌는데 창은 옛 폭 그대로라 좁은 화면에선 잘리고 넓은 화면에선 작게 남았다.
    //   → 폭·밀도는 '지금 실제 화면'(앱 컨텍스트의 기본 디스플레이)에서 읽고, 바뀌면 다시 만든다(rebuildIfResized).
    private DisplayMetrics realMetrics() {
        DisplayMetrics dm = new DisplayMetrics();
        try {
            WindowManager w = (WindowManager) getContext().getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
            w.getDefaultDisplay().getRealMetrics(dm);
            if (dm.widthPixels > 0 && dm.density > 0) return dm;
        } catch (Exception ignored) { }
        return getContext().getResources().getDisplayMetrics();
    }

    private String builtKey = "";

    private String sizeKey() {
        DisplayMetrics dm = realMetrics();
        return dm.widthPixels + "x" + dm.heightPixels + "@" + dm.density;
    }

    /** 화면 폭·밀도가 바뀌었으면(폴드 펴기/접기) 오버레이를 새 크기로 다시 만든다. 메인 스레드에서만 부른다. */
    private void rebuildIfResized() {
        if (root == null || sizeKey().equals(builtKey)) return;
        boolean was = attached;
        if (attached && wm != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
            attached = false;
        }
        stopBlink();
        root = null; border = null; borderAnim = null; borderMode = 0; stripView = null; boardView = null; recoView = null; cardBg = null;
        if (was) attachOrUpdate();
    }

    private int dp(float v) {
        return Math.round(v * realMetrics().density);
    }

    private TextView makeText(float sp, int color, boolean bold) {
        TextView t = new TextView(getContext());
        t.setTextColor(color);
        t.setTextSize(sp);
        // ★ 2026-10-01: 한 줄 + '…' 로 자르면 아래 줄이 잘려 보였다(YJ 제보) → 잘라 내지 않고 필요하면 두 줄로 줄바꿈
        t.setMaxLines(2);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setIncludeFontPadding(false);
        return t;
    }

    private void build() {
        Context ctx = getContext();
        wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics dm = realMetrics();
        builtKey = sizeKey();
        // ★ 2026-10-01 (YJ: "역간 거리가 너무 멀어서 역이 하나만 보여 — 좌우 2개씩 보이게"): 실기기에서 다섯 칸이 화면보다 넓게
        //   퍼져 바깥 두 칸이 잘렸다(가중치(weight) 폭 + WRAP_CONTENT 창 조합). → 창 폭과 모든 칸 폭을 '정확한 픽셀'로 직접 정한다.
        //   이렇게 하면 어떤 기기에서도 창 = 화면의 94%, 다섯 칸 합 = 창 안쪽 폭으로 고정된다.
        // ★ 2026-10-02: 펼친 폴드(가로 700dp 안팎)에선 96% 폭이 지나치게 넓다 → 최대 560dp 로 제한한다.
        // ★ 2026-10-03 (YJ: "오버레이 좌우폭을 화면 좌우에 맞춰줘"): 화면 폭 그대로(가장자리까지).
        int maxW = dm.widthPixels;
        final int padH = dp(8);
        final int rowW = maxW - 2 * padH;

        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(padH, dp(5), padH, dp(2));
        // ★ 2026-10-11: 앱 경로 화면 카드와 같은 모양 — 테마의 카드 바탕 + 얇은 테두리(순수 검정 바탕은 그만)
        cardBg = new GradientDrawable();
        cardBg.setColor(thBg);
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(Math.max(1, dp(1)), 0x33808080);
        root.setBackground(cardBg);

        t1 = makeText(15, thFg, false);            // (예비 — 앱 칸을 못 받았을 때만 쓴다)
        t2 = makeText(12, thSub, true);            // 남은시간 · 도착 (회색)
        t3 = makeText(13, thSub, false);           // 추천 알림 제목
        t3.setMaxWidth(rowW);

        // 남은시간 줄은 맨 아래 전체 폭에 한 줄(길면 글자가 스스로 줄어든다)
        t2.setMaxWidth(rowW);
        t2.setMaxLines(1);
        t2.setHorizontallyScrolling(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            t2.setAutoSizeTextTypeUniformWithConfiguration(10, 12, 1, TypedValue.COMPLEX_UNIT_SP);
        }
        View gap = new View(ctx);
        stripView = new StripView(ctx);
        root.addView(t3);                            // 추천 알림 제목은 위(남은시간 줄이 늘 맨 아래)
        root.addView(stripView, new LinearLayout.LayoutParams(rowW, stripView.wantH()));
        root.addView(gap, new LinearLayout.LayoutParams(1, dp(1)));
        rowWpx = rowW;
        infoRow = new LinearLayout(ctx);
        infoRow.setOrientation(LinearLayout.HORIZONTAL);
        infoRow.setGravity(Gravity.CENTER);
        infoRow.addView(t2, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        waitChip = new WaitChip(ctx);
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wlp.leftMargin = dp(6);
        waitChip.setVisibility(View.GONE);
        infoRow.addView(waitChip, wlp);
        root.addView(infoRow, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));
        boardView = new BoardView(ctx);
        root.addView(boardView, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));   // ★ 탑승 안내 줄
        recoView = new RecoView(ctx);
        recoView.setVisibility(View.GONE);
        root.addView(recoView, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));    // ★ 추천 줄(맨 아래, 도착 3분 전부터)

        lp = new WindowManager.LayoutParams(
                maxW,
                WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        SharedPreferences sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        // ★ 2026-10-02: 저장된 위치가 지금 화면 밖이면(폴드를 접어 폭이 줄었을 때) 안쪽으로 당겨 놓는다
        int xLimit = Math.max(0, (dm.widthPixels - maxW) / 2);
        lp.x = Math.max(-xLimit, Math.min(xLimit, sp.getInt("x", 0)));
        lp.y = Math.max(0, Math.min(sp.getInt("y", dp(36)), Math.max(0, dm.heightPixels - dp(120))));   // 상태바 바로 아래

        final int slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        root.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy; int sx, sy; boolean dragged, scrolling, inStrip, inBottom, swiping, armed; float startPos; float bx, by, lastX, lastY; VelocityTracker vt;
            // ★ 2026-10-11 (YJ: "아래로 슬라이딩하면 오버레이가 같이 내려가고 클릭하면 앱이 열린다 — 개선방안?"):
            //   세로로 쓸기는 이제 어디서 시작하든 탑승 줄을 여닫는 데만 쓴다(아래로 쓸면 열림 · 위로 쓸면 닫힘). 창 이동은 '꾹 눌러서'(0.45초, 진동) 잡은 뒤에만 한다.
            //   그래서 쓸다가 창이 같이 끌려 내려가거나, 쓸기가 탭으로 읽혀 앱이 열리는 일이 없다.
            final Runnable arm = new Runnable() {
                @Override public void run() {
                    if (dragged || scrolling || swiping) return;
                    armed = true;
                    dx = lastX; dy = lastY; sx = lp.x; sy = lp.y;          // 지금 손가락 위치를 창 이동의 기준점으로
                    try { root.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS); } catch (Exception ignored) { }
                }
            };
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX(); dy = e.getRawY(); lastX = dx; lastY = dy; sx = lp.x; sy = lp.y; dragged = false; scrolling = false; swiping = false; armed = false;
                        bx = e.getX(); by = e.getY();
                        // 맨 아래 영역(남은시간 줄 + 탑승 줄): [탑승]·알약 누름 판정에 쓴다
                        inBottom = boardView != null && e.getY() >= (infoRow != null && infoRow.getVisibility() == View.VISIBLE ? infoRow.getTop() : boardView.getTop());
                        // 점·선 줄에서 시작한 좌우 움직임은 칸을 넘겨 보는 스크롤
                        inStrip = stripView != null && e.getY() >= stripView.getTop() && e.getY() <= stripView.getBottom();
                        startPos = scrollPos;
                        stopFling();                                  // 미끄러지던 중에 다시 대면 멈춘다
                        main.removeCallbacks(arm);
                        main.postDelayed(arm, 450L);
                        try { if (vt != null) vt.recycle(); vt = VelocityTracker.obtain(); vt.addMovement(e); } catch (Exception ignored) { vt = null; }
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        lastX = e.getRawX(); lastY = e.getRawY();
                        float mx = lastX - dx, my = lastY - dy;
                        try { if (vt != null) vt.addMovement(e); } catch (Exception ignored) { }
                        if (!dragged && !scrolling && !swiping && (Math.abs(mx) > slop || Math.abs(my) > slop)) {
                            if (armed) {
                                dragged = true;                                         // 꾹 누른 뒤 움직이면 창 이동
                            } else {
                                main.removeCallbacks(arm);
                                if (inStrip && strip.length > 5 && Math.abs(mx) > Math.abs(my)) {
                                    scrolling = true;
                                    userScrolling = true;
                                    main.removeCallbacks(recenter);
                                } else if (Math.abs(my) > Math.abs(mx)) {
                                    swiping = true;                                     // 세로 쓸기: 탑승 줄 열기·닫기
                                } else {
                                    swiping = true; startPosIgnore = true;               // 가로로 쓸었지만 칸 줄이 아님: 아무 일 없음(탭으로도 안 읽음)
                                }
                            }
                        }
                        if (scrolling && stripView != null && stripView.getWidth() > 0) {
                            scrollPos = clampPos(startPos - mx / (stripView.getWidth() / 5f));
                            stripView.invalidate();
                        } else if (dragged) {
                            lp.x = sx + Math.round(mx);
                            lp.y = Math.max(0, sy + Math.round(my));
                            try { wm.updateViewLayout(root, lp); } catch (Exception ignored) { }
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        main.removeCallbacks(arm);
                        if (scrolling) {
                            // ★ 2026-10-11 (YJ: "앱처럼 슬라이딩되어 미끄러지게"): 떼는 순간의 속도로 관성 스크롤
                            try {
                                if (vt != null && e.getAction() == MotionEvent.ACTION_UP && stripView != null && stripView.getWidth() > 0) {
                                    vt.addMovement(e);
                                    vt.computeCurrentVelocity(1000);
                                    float cw = stripView.getWidth() / 5f;
                                    startFling(-vt.getXVelocity() / cw);          // 초당 몇 칸
                                }
                            } catch (Exception ignored) { }
                            main.postDelayed(recenter, 10000L);      // 손을 뗀 지 10초 뒤 현위치로 돌아온다
                        }
                        else if (swiping) {
                            // 앱 시트와 같은 동작을 오버레이 어디서든: 아래로 쓸면 탑승 안내 열기, 위로 쓸면 닫기(대기 알약)
                            if (e.getAction() == MotionEvent.ACTION_UP && !startPosIgnore) {
                                float myy = e.getRawY() - dy;
                                if (myy > dp(22)) { if (!"board".equals(rsSt)) act("open"); }
                                else if (myy < -dp(22) && "board".equals(rsSt)) act("close");
                            }
                            startPosIgnore = false;
                        }
                        else if (dragged) savePos();
                        else if (armed) { /* 꾹 눌렀다가 그냥 뗌: 아무 일 없음 */ }
                        else if (e.getAction() == MotionEvent.ACTION_UP) {
                            int rh = (recoView != null && recoView.getVisibility() == View.VISIBLE && by >= recoView.getTop()) ? recoView.hit(bx - recoView.getLeft(), by - recoView.getTop()) : -1;
                            if (rh == 1) { act("recoGo"); openApp(); }                    // [보기] — 추천 아이템·맛집으로(앱을 앞으로)
                            else if (rh == 2) act("recoOk");                               // [확인] — 이 추천 끄기
                            else if (rh == 0) openApp();                                   // 추천 줄의 글자 부분: 앱으로
                            else if (inBottom && boardView != null && boardView.hitBtn(bx - boardView.getLeft(), by - boardView.getTop())) {
                                act("undo".equals(rsSt) ? "undo" : "press");          // [탑승] / [되돌리기]
                            } else if (inBottom && ("wait".equals(rsSt) || "hidden".equals(rsSt))) {
                                act(("wait".equals(rsSt)) ? "pill" : "open");           // 알약·손잡이를 누르면 탑승 줄이 열린다(앱은 안 열림)
                            } else openApp();                                             // 그 밖은 탭하면 앱으로 돌아간다
                        }
                        armed = false;
                        try { if (vt != null) { vt.recycle(); vt = null; } } catch (Exception ignored) { }
                        return true;
                    default:
                        return false;
                }
            }
            boolean startPosIgnore = false;
        });
    }

    /**
     * ★ 2026-10-02 (YJ: "2정거장 전엔 오버레이 모서리가 얇은 무지개빛으로 천천히 돌고, 1정거장 전엔 빨리 돌면서 곧 내려야 한다는 표시"):
     * 오버레이 테두리에 무지개색 SweepGradient 를 돌려 그린다. 판단(몇 정거장 남았나)은 웹이 하고, 여기선 alert 값(0/2/1)대로 그리기만 한다.
     */
    private static class RainbowBorder extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();
        private final Matrix matrix = new Matrix();
        private SweepGradient shader;
        private float angle = 0f, radius, stroke;
        private boolean visible = false;
        private final int[] colors = {
                0xFFFF3B30, 0xFFFF9500, 0xFFFFD60A, 0xFF34C759, 0xFF00C7BE, 0xFF0A84FF, 0xFFAF52DE, 0xFFFF2D92, 0xFFFF3B30 };

        RainbowBorder(float radiusPx, float strokePx) {
            radius = radiusPx; stroke = strokePx;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(strokePx);
        }
        void setAngle(float a) { angle = a; invalidateSelf(); }
        void setShown(boolean v) { visible = v; invalidateSelf(); }
        @Override protected void onBoundsChange(android.graphics.Rect b) {
            rect.set(b);
            rect.inset(stroke / 2f, stroke / 2f);
            shader = new SweepGradient(b.exactCenterX(), b.exactCenterY(), colors, null);
            paint.setShader(shader);
        }
        @Override public void draw(Canvas c) {
            if (!visible || shader == null) return;
            matrix.setRotate(angle, getBounds().exactCenterX(), getBounds().exactCenterY());
            shader.setLocalMatrix(matrix);
            c.drawRoundRect(rect, radius, radius, paint);
        }
        @Override public void setAlpha(int a) { paint.setAlpha(a); }
        @Override public void setColorFilter(ColorFilter f) { paint.setColorFilter(f); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }

    /** 경고 진동. 2단계(두 정거장 전)=두 번, 1단계(한 정거장 전·환승)=세 번. */
    private void vibrateAlert(int level) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            long[] pat = (level == 1) ? new long[]{0, 300, 100, 300, 100, 300} : new long[]{0, 400, 150, 400};
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createWaveform(pat, -1));
            else v.vibrate(pat, -1);
        } catch (Exception ignored) { }
    }

    /** alert 값에 맞춰 테두리를 켜고(2=6초에 한 바퀴, 1=1.1초에 한 바퀴) 끈다. 메인 스레드에서 부른다. */
    private void applyAlert() {
        if (root == null) return;
        if (border == null) {
            border = new RainbowBorder(dp(14), dp(2.5f));            // 얇은 테두리
            root.setForeground(border);
        }
        int mode = alertLevel;
        if (mode == borderMode && (mode == 0 || (borderAnim != null && borderAnim.isRunning()))) return;
        borderMode = mode;
        if (borderAnim != null) { borderAnim.cancel(); borderAnim = null; }
        if (mode == 0) { border.setShown(false); return; }
        border.setShown(true);
        borderAnim = ValueAnimator.ofFloat(0f, 360f);
        borderAnim.setInterpolator(new LinearInterpolator());
        borderAnim.setDuration(mode == 1 ? 1100L : 6000L);
        borderAnim.setRepeatCount(ValueAnimator.INFINITE);
        borderAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator a) { border.setAngle((Float) a.getAnimatedValue()); }
        });
        borderAnim.start();
    }

    private void stopAlert() {
        try { if (borderAnim != null) borderAnim.cancel(); } catch (Exception ignored) { }
        borderAnim = null; borderMode = 0;
        if (border != null) border.setShown(false);
    }

    private void savePos() {
        try {
            getContext().getSharedPreferences(PREF, Context.MODE_PRIVATE)
                    .edit().putInt("x", lp.x).putInt("y", lp.y).apply();
        } catch (Exception ignored) { }
    }

    private void openApp() {
        try {
            Intent i = getContext().getPackageManager()
                    .getLaunchIntentForPackage(getContext().getPackageName());
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                getContext().startActivity(i);
            }
        } catch (Exception ignored) { }
    }

    private void attachOrUpdate() {
        if (root == null) build();
        // 앱 경로 화면의 칸이 오면 그대로 그린다. 못 받으면(옛 웹) 한 줄 문구만 가운데에 보여 준다.
        if (strip.length == 0 && line1.length() > 0) {
            Cell c = new Cell();
            c.n = line1; c.dk = 0;
            strip = new Cell[] { c };
            stripCur = 0;
        }
        try {
            if (cardBg != null) cardBg.setColor(thBg);
            if (!userScrolling) scrollPos = followPos(); else scrollPos = clampPos(scrollPos);
            t2.setTextColor(thSub);
            t3.setTextColor(thSub);
            if (boardView != null) boardView.setState(rsSt);
            if (recoView != null) { recoView.setVisibility(rcOn ? View.VISIBLE : View.GONE); recoView.invalidate(); }
            if (waitChip != null && infoRow != null) {
                boolean wt = "wait".equals(rsSt);
                if (wt) {
                    waitChip.setLabel(rsCh, Math.round(rowWpx * 0.42f));
                    t2.setMaxWidth(Math.max(dp(80), rowWpx - waitChip.wantW() - dp(6)));
                } else {
                    t2.setMaxWidth(rowWpx);
                }
                waitChip.setVisibility(wt ? View.VISIBLE : View.GONE);
                waitChip.invalidate();
            }
            if (stripView != null) {
                stripView.invalidate();
                if (moving && strip.length > 1) startBlink();
                else { stopBlink(); stripView.setLit(true); }       // 정차 중: 선은 그대로
            }
        } catch (Exception ignored) { }
        t2.setText(line2);
        t2.setVisibility(line2.length() > 0 ? View.VISIBLE : View.GONE);
        if (infoRow != null) infoRow.setVisibility((line2.length() > 0 || (waitChip != null && waitChip.getVisibility() == View.VISIBLE)) ? View.VISIBLE : View.GONE);
        t3.setText(line3);
        t3.setVisibility(line3.length() > 0 ? View.VISIBLE : View.GONE);
        try { applyAlert(); } catch (Exception ignored) { }
        if (!attached) {
            try {
                wm.addView(root, lp);
                attached = true;
            } catch (Exception e) {
                attached = false;
            }
        }
        if (attached) startPulse();
    }

    /** 현위치가 둘째 칸에 오도록 한 스크롤 위치(보낸 칸 범위 안으로 제한, 다섯 칸보다 적으면 가운데). */
    private float followPos() {
        int n = strip.length;
        if (n <= 5) return stripBase - (5 - n) / 2f;
        float lo = stripBase, hi = stripBase + n - 5;
        return Math.max(lo, Math.min(hi, stripBase + stripCur - 1));
    }

    private float clampPos(float v) {
        int n = strip.length;
        if (n <= 5) return stripBase - (5 - n) / 2f;
        return Math.max(stripBase, Math.min(stripBase + n - 5, v));
    }

    /** 손가락을 뗀 뒤 관성으로 미끄러지는 스크롤(속도 = 초당 칸 수). 천천히 감속하며 끝에서 멈춘다. */
    private void startFling(float cellsPerSec) {
        stopFling();
        if (stripView == null || !attached) return;
        float dist = cellsPerSec * 0.38f;                       // 떼는 속도에 비례해 더 미끄러진다
        if (Math.abs(dist) < 0.25f) return;
        final float from = scrollPos, to = clampPos(from + dist);
        if (Math.abs(to - from) < 0.05f) return;
        long dur = (long) Math.max(320, Math.min(1200, 320 + Math.abs(to - from) * 150));
        flingAnim = ValueAnimator.ofFloat(0f, 1f);
        flingAnim.setDuration(dur);
        flingAnim.setInterpolator(new DecelerateInterpolator(2.2f));
        flingAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator an) {
                scrollPos = from + (to - from) * (Float) an.getAnimatedValue();
                if (stripView != null) stripView.invalidate();
            }
        });
        flingAnim.start();
    }

    private void stopFling() {
        try { if (flingAnim != null) flingAnim.cancel(); } catch (Exception ignored) { }
        flingAnim = null;
    }

    private final Runnable recenter = new Runnable() {
        @Override public void run() {
            stopFling();
            userScrolling = false;
            if (stripView == null || !attached) return;
            final float from = scrollPos, to = followPos();
            ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
            a.setDuration(380L);
            a.setInterpolator(new DecelerateInterpolator(1.6f));
            a.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                @Override public void onAnimationUpdate(ValueAnimator an) {
                    if (userScrolling) { an.cancel(); return; }
                    scrollPos = from + (to - from) * (Float) an.getAnimatedValue();
                    if (stripView != null) stripView.invalidate();
                }
            });
            a.start();
        }
    };

    /** 현위치 점을 깜박이게 한다(보이는 동안만 돈다). */
    private void startPulse() {
        if (pulseAnim != null && pulseAnim.isRunning()) return;
        pulseAnim = ValueAnimator.ofFloat(0f, 1f);
        pulseAnim.setDuration(650L);
        pulseAnim.setRepeatCount(ValueAnimator.INFINITE);
        pulseAnim.setRepeatMode(ValueAnimator.REVERSE);
        pulseAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator an) {
                pulse = (Float) an.getAnimatedValue();
                if (stripView != null) stripView.invalidate();
            }
        });
        pulseAnim.start();
    }

    private void stopPulse() {
        try { if (pulseAnim != null) pulseAnim.cancel(); } catch (Exception ignored) { }
        pulseAnim = null; pulse = 0f;
    }

    private void startBlink() {
        if (blinking) return;
        blinking = true; blinkOn = true;
        if (stripView != null) stripView.setLit(true);
        main.postDelayed(blinker, BLINK_MS);
    }

    private void stopBlink() {
        main.removeCallbacks(blinker);
        blinking = false; blinkOn = false;
    }

    private void detach() {
        stopBlink();
        stopPulse();
        stopFling();
        try { if (boardView != null) boardView.cancelAnim(); } catch (Exception ignored) { }
        main.removeCallbacks(recenter);
        userScrolling = false;
        stopAlert();                                   // 보이지 않는 동안 애니메이션을 돌리지 않는다(배터리)
        main.removeCallbacks(checker);
        if (!journeyOn) { main.removeCallbacks(ticker); ticking = false; }   // 여정이 진행 중이면 오버레이를 내려도 깨우기는 계속한다
        if (attached && wm != null && root != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
        }
        attached = false;
    }
}
