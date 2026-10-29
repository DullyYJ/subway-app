package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;

import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;

/**
 * 오프닝 화면 — 앱을 켜면 2초쯤 길동무 친구들이 나와 인사한다(2026-10-29 s299, YJ). 안드로이드 전용(그리기만).
 *
 *   무엇을 · 언제 · 어디서 하는지는 모두 OpenCore(= 엔진 대본 assets/open.json)가 정한다. 이 뷰는 받은 모습대로 하늘 · 해/달 · 땅 · 친구 · 말풍선 · 작은 효과를 그릴 뿐이다. 화면 전체는 불투명 파스텔 화이트이고 배경 그림은 친구들이 선 둥근 판 안에만 있다.
 *   그리는 동안 앱은 뒤에서 위치 · 정류장 · 탭 화면 받기를 이미 하고 있다(이 뷰는 아무것도 기다리지 않고, 아무것도 막지 않는다 — 터치를 누르면 바로 닫힌다).
 *   시트(걷기 · 자세 · 잠)는 필요한 것만 뒤 스레드에서 읽는다. 아직 못 읽었으면 그 친구만 잠시 안 보일 뿐 시간표는 그대로 흐른다.
 */
final class OpenView extends View {
    interface Done { void onDone(); }

    private final OpenCore.Script sc;
    private final OpenCore.Slot slot;
    private final OpenCore.Actor[] cast;
    private final Done done;
    private final float dp;
    private long t0 = -1L; private boolean finished;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Bitmap> sheets = new HashMap<String, Bitmap>();
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), bmp = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG), tp = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF(); private final Rect src = new Rect(); private final RectF dst = new RectF(); private final Path path = new Path();
    private Shader sky; private int skyW, skyH;

    OpenView(Context ctx, OpenCore.Script script, OpenCore.Slot s, OpenCore.Actor[] c, Done d) {
        super(ctx); sc = script; slot = s; cast = c; done = d; dp = ctx.getResources().getDisplayMetrics().density;
        setClickable(true);                                                      // 뒤 화면이 눌리지 않게 막고, 누르면 바로 닫는다
        tp.setTypeface(Typeface.DEFAULT_BOLD);
        loadSheets(ctx.getApplicationContext());
    }

    /** 대본에 나오는 시트만 뒤 스레드에서 읽는다(걷기 `<id>` · 자세 `<id>_pose` · 잠 `<id>_sleep`). */
    private void loadSheets(final Context app) {
        final HashSet<String> keys = new HashSet<String>();
        for (OpenCore.Actor a : cast) for (OpenCore.Seg g : a.tr) {
            if ("sleep".equals(g.k)) keys.add(a.id + "_sleep");
            else { keys.add(a.id); keys.add(a.id + "_pose"); }
        }
        new Thread(new Runnable() { @Override public void run() {
            for (final String k : keys) {
                Bitmap b = null;
                try {
                    BitmapFactory.Options o = new BitmapFactory.Options(); o.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    InputStream in = app.getAssets().open("chars3d/" + Chars.file(k) + ".webp");       // 뽀송은 지금 신은 신발 시트
                    try { b = BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
                } catch (Throwable ignored) { b = null; }
                if (b == null) continue;
                final Bitmap fb = b;
                main.post(new Runnable() { @Override public void run() { if (finished) fb.recycle(); else sheets.put(k, fb); } });
            }
        } }, "shell-open-art").start();
    }

    @Override public boolean onTouchEvent(MotionEvent e) { if (e.getActionMasked() == MotionEvent.ACTION_UP) finish(); return true; }

    void finish() {
        if (finished) return; finished = true;
        for (Bitmap b : sheets.values()) try { b.recycle(); } catch (Throwable ignored) { }
        sheets.clear();
        main.post(new Runnable() { @Override public void run() { if (done != null) done.onDone(); } });
    }
    boolean isFinished() { return finished; }

    @Override protected void onDetachedFromWindow() { super.onDetachedFromWindow(); finish(); }

    @Override protected void onDraw(Canvas cv) {
        if (finished) return;
        long now = SystemClock.uptimeMillis(); if (t0 < 0) t0 = now;          // 시계는 처음 그린 순간부터(켜는 준비가 길어도 2초를 다 보여 준다)
        long t = now - t0;
        if (OpenCore.done(sc, t)) { finish(); return; }
        float W = getWidth(), H = getHeight(); if (W < 8 || H < 8) { postInvalidateOnAnimation(); return; }
        // 화면 전체는 불투명 파스텔 화이트. 하늘·땅 배경은 친구들이 서 있는 둥근 판 안에만 있고, 제목은 그 판 바로 위에 있다.
        float pw = Math.min(W - 40f * dp, 420f * dp), ph = Math.min(H * 0.31f, 240f * dp), pl = (W - pw) / 2f, pt = H * 0.50f - ph / 2f;
        float gy = ph * 0.70f, charH = Math.min(pw * 0.30f, 108f * dp) * 0.70f;          // 친구는 판 가운데에 모여 선다 · 키는 처음보다 30% 작게
        // 사라질 때: 판·글·친구가 먼저 흐려지고 바탕(파스텔 화이트)이 뒤따라 앱 화면으로 녹아든다 → 켜져 있는 내내는 앱 화면이 전혀 비치지 않는다
        int bgA = (int) Math.round(255 * OpenCore.bgAlpha(sc, t)), fgA = (int) Math.round(255 * OpenCore.fgAlpha(sc, t));
        if (bgA <= 0) { finish(); return; }
        int sb = cv.saveLayerAlpha(0, 0, W, H, bgA);
        p.setShader(null); p.setStyle(Paint.Style.FILL); p.setColor(sc.bg); cv.drawRect(0, 0, W, H, p);          // 불투명 바탕
        cv.restoreToCount(sb);
        if (fgA > 0) {
            int sf = cv.saveLayerAlpha(0, 0, W, H, fgA);
            drawTitle(cv, W, pt);
            cv.save(); cv.translate(pl, pt);
            path.reset(); rf.set(0, 0, pw, ph); path.addRoundRect(rf, 22f * dp, 22f * dp, Path.Direction.CW);
            cv.save(); cv.clipPath(path);
            drawSky(cv, pw, ph, t); drawGround(cv, pw, ph, gy);
            cv.restore();
            rf.set(0, 0, pw, ph); p.setShader(null); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f * dp); p.setColor(0x1A000000); cv.drawRoundRect(rf, 22f * dp, 22f * dp, p); p.setStyle(Paint.Style.FILL);
            int i = 0;
            for (OpenCore.Actor a : cast) { drawActor(cv, a, OpenCore.at(a, t), pw, gy, charH, i++); }
            cv.restore();
            cv.restoreToCount(sf);
        }
        postInvalidateOnAnimation();
    }

    // ───────────── 하늘 · 해 · 달 · 별 · 구름 (판 안 좌표) ─────────────
    private void drawSky(Canvas cv, float W, float H, long t) {
        if (sky == null || skyW != (int) W || skyH != (int) H) { sky = new LinearGradient(0, 0, 0, H * 0.82f, new int[] { slot.sky0, slot.sky1, slot.sky2 }, new float[] { 0f, 0.55f, 1f }, Shader.TileMode.CLAMP); skyW = (int) W; skyH = (int) H; }
        p.setStyle(Paint.Style.FILL); p.setColor(0xFF000000); p.setAlpha(255);       // ★ 붓의 투명도가 셰이더에도 곱해진다 — 앞에서 쓴 옅은 색이 남아 하늘이 비치던 문제를 막는다
        p.setShader(sky); cv.drawRect(0, 0, W, H, p); p.setShader(null);
        float tt = t / 1000f;
        for (int k = 0; k < slot.stars; k++) {                                   // 별(자리는 번호로 고정, 반짝임만 시간으로)
            float sx = frac(k * 0.6180339f + 0.13f) * W, sy = frac(k * 0.4142135f + 0.07f) * H * 0.55f, tw = 0.45f + 0.55f * (float) Math.abs(Math.sin(tt * 2.1 + k * 1.7));
            p.setColor(((int) (200 * tw) << 24) | 0xFFFFFF); cv.drawCircle(sx, sy, (1.0f + (k % 3) * 0.5f) * dp, p);
        }
        if (slot.sun != null) {
            float sy = (float) OpenCore.sunY(slot, t, sc) * H, sx = (float) slot.sun[0] * W, r = (float) slot.sun[3] * W; int c = (int) (long) slot.sun[4];
            p.setColor((0x33 << 24) | (c & 0xFFFFFF)); cv.drawCircle(sx, sy, r * 1.7f, p);
            p.setColor((0x55 << 24) | (c & 0xFFFFFF)); cv.drawCircle(sx, sy, r * 1.3f, p);
            p.setColor(c); cv.drawCircle(sx, sy, r, p);
        }
        if (slot.moon != null) {
            float mx = (float) slot.moon[0] * W, my = (float) slot.moon[1] * H, r = (float) slot.moon[2] * W;
            p.setColor(0x33FFF3C4); cv.drawCircle(mx, my, r * 1.8f, p);
            p.setColor(0xFFFFF3C4); cv.drawCircle(mx, my, r, p);
            p.setColor(slot.sky0 | 0xFF000000); cv.drawCircle(mx + r * 0.42f, my - r * 0.18f, r * 0.86f, p);       // 초승달
            p.setColor(0x33FFF3C4); cv.drawCircle(mx, my, r, p);
        }
        for (int k = 0; k < slot.clouds; k++) {                                   // 구름: 천천히 흘러간다
            float cy = H * (0.14f + 0.12f * k + (k % 2) * 0.05f), cx = ((frac(k * 0.37f + 0.1f) * 1.3f * W + tt * (8f + 5f * k) * dp) % (W * 1.4f)) - W * 0.2f, s = (40f + 12f * (k % 3)) * dp;
            int a = slot.id.equals("evening") ? 0x66 : 0xB0; p.setColor((a << 24) | (slot.id.equals("evening") ? 0xFFD9C0 : 0xFFFFFF));
            cv.drawCircle(cx, cy, s * 0.32f, p); cv.drawCircle(cx + s * 0.30f, cy - s * 0.10f, s * 0.38f, p); cv.drawCircle(cx + s * 0.62f, cy, s * 0.30f, p);
            rf.set(cx - s * 0.2f, cy, cx + s * 0.85f, cy + s * 0.30f); cv.drawRoundRect(rf, s * 0.15f, s * 0.15f, p);
        }
    }
    private static float frac(float v) { return v - (float) Math.floor(v); }

    private void drawGround(Canvas cv, float W, float H, float gy) {
        p.setColor(slot.hill); rf.set(-W * 0.2f, gy - 26f * dp, W * 0.62f, gy + 60f * dp); cv.drawOval(rf, p);
        rf.set(W * 0.35f, gy - 18f * dp, W * 1.25f, gy + 60f * dp); cv.drawOval(rf, p);
        p.setColor(slot.ground); cv.drawRect(0, gy, W, H, p);
        p.setColor(0x22000000); cv.drawRect(0, gy, W, gy + 2f * dp, p);
    }

    /** 제목: 대본의 brand 글 한 줄 — 친구들이 있는 판 바로 위에, 대본의 글 색으로. */
    private void drawTitle(Canvas cv, float W, float panelTop) {
        if (sc.brand.length() == 0) return;
        tp.setTypeface(Typeface.DEFAULT_BOLD); tp.setColor(sc.ink); tp.setTextAlign(Paint.Align.CENTER); tp.setTextSize(Math.min(24f * dp, W * 0.068f));
        cv.drawText(sc.brand, W / 2f, panelTop - 22f * dp, tp);
    }

    // ───────────── 친구 ─────────────
    private void drawActor(Canvas cv, OpenCore.Actor a, OpenCore.St s, float W, float gy, float charH, int idx) {
        if (!s.on || s.alpha <= 0.01f) return;
        float x = (float) s.x * W, footBase = gy + charH * 0.10f, lift;
        float[] f = WidgetSim.cfg(a.id);
        boolean sleep = "sleep".equals(s.k);
        float footY, top;
        if (sleep) {
            float[] sl = WidgetSim.sleepCfg(a.id); Bitmap b = sheets.get(a.id + "_sleep");
            float cell = sl[0] * charH * 1.0f, left = x - sl[1] * cell, tp0 = footBase - sl[2] * cell;
            p.setColor((int) (0x33 * s.alpha) << 24); rf.set(x - cell * 0.32f, footBase - 3f * dp, x + cell * 0.32f, footBase + 4f * dp); cv.drawOval(rf, p);
            if (b != null) {
                int fr = ((int) Math.floor(s.segT * sl[3] + idx * 5f) % 16 + 16) % 16, col = fr % 4, row = fr / 4;
                src.set(col * 256, row * 256, col * 256 + 256, row * 256 + 256); dst.set(left, tp0, left + cell, tp0 + cell);
                bmp.setAlpha((int) (255 * s.alpha)); cv.drawBitmap(b, src, dst, bmp); bmp.setAlpha(255);
            }
            float ax = x - sl[1] * cell + sl[4] * cell, ay = footBase - sl[2] * cell + sl[5] * cell;       // 잠든 입가(위젯과 같은 기준점) 에서 Z 가 떠오른다
            effects(cv, s, ax - charH * 0.04f, ay - charH * 0.10f, charH, idx, a.id);
            if (s.say.length() > 0 && s.sayA > 0.02f) bubble(cv, s.say, x, tp0 + cell * 0.10f - charH * 0.30f, W, (float) s.sayA);
            return;
        }
        float sc2 = charH * f[5] / (f[1] - f[0]); lift = f[4] * charH / 58f;
        footY = footBase - lift - (float) s.hop * charH; top = footY - (f[1] - f[0]) * sc2;
        float k = Math.max(0.55f, 1f - (float) s.hop * 0.9f);
        p.setColor((int) (0x30 * s.alpha) << 24); rf.set(x - charH * 0.40f * k, footBase - charH * 0.05f, x + charH * 0.40f * k, footBase + charH * 0.07f); cv.drawOval(rf, p);
        boolean walk = "walk".equals(s.k);
        Bitmap b = sheets.get(walk ? a.id : a.id + "_pose");
        if (b == null && !walk) b = sheets.get(a.id);                              // 자세 시트를 못 읽었으면 걷기 시트의 첫 칸으로
        if (b != null) {
            int idxc = walk ? ((int) Math.floor(s.segT * f[3]) % 16 + 16) % 16 : (sheets.containsKey(a.id + "_pose") ? Math.max(0, Math.min(7, s.pose)) : 0);
            int col = idxc % 4, row = idxc / 4;
            float sz = 256f * sc2, left = x - f[2] * sc2, tp0 = footY - f[1] * sc2;
            src.set(col * 256, row * 256, col * 256 + 256, row * 256 + 256); dst.set(left, tp0, left + sz, tp0 + sz);
            cv.save(); if (s.face < 0) cv.scale(-1f, 1f, x, 0f);
            bmp.setAlpha((int) (255 * s.alpha)); cv.drawBitmap(b, src, dst, bmp); bmp.setAlpha(255); cv.restore();
        }
        effects(cv, s, x, top, charH, idx, a.id);
        if (s.say.length() > 0 && s.sayA > 0.02f) bubble(cv, s.say, x, top - 6f * dp - (s.fx.length() > 0 ? charH * 0.30f : 0f), W, (float) s.sayA);      // 떠오르는 효과가 글을 가리지 않게 효과가 있으면 한 뼘 위로
    }

    /** 말풍선: 머리 위(바닥점 x, 위 끝 y)에 둥근 상자 + 꼬리. 가장자리에서 잘리지 않게 안으로 민다. */
    private void bubble(Canvas cv, String txt, float cx, float yBottom, float W, float al) {
        tp.setTypeface(Typeface.DEFAULT_BOLD); tp.setTextSize(12.5f * dp); tp.setTextAlign(Paint.Align.CENTER);
        float tw = tp.measureText(txt), bw = tw + 22f * dp, bh = 28f * dp, l = Math.max(8f * dp, Math.min(W - bw - 8f * dp, cx - bw / 2f)), t = yBottom - 7f * dp - bh;
        p.setColor(((int) (235 * al) << 24) | 0xFFFFFF); rf.set(l, t, l + bw, t + bh); cv.drawRoundRect(rf, 14f * dp, 14f * dp, p);
        float tx = Math.max(l + 14f * dp, Math.min(l + bw - 14f * dp, cx));
        path.reset(); path.moveTo(tx - 5f * dp, t + bh - 1f); path.lineTo(tx + 5f * dp, t + bh - 1f); path.lineTo(tx, t + bh + 7f * dp); path.close(); cv.drawPath(path, p);
        tp.setColor(((int) (255 * al) << 24) | 0x2B2B3A); cv.drawText(txt, l + bw / 2f, t + bh / 2f + 4.5f * dp, tp);
        tp.setColor(sc.ink);
    }

    /** 작은 효과: 머리 위로 떠오르는 하트 · 반짝이 · 음표 · 잎 · 음식 · zzz. 시각만으로 계산한다. */
    private void effects(Canvas cv, OpenCore.St s, float x, float top, float charH, int idx, String id) {
        String fx = s.fx; if (fx.length() == 0) return;
        tp.setTextAlign(Paint.Align.CENTER);
        for (int k = 0; k < 3; k++) {
            float ph = (float) ((s.segT * 0.75 + k / 3.0 + idx * 0.23) % 1.0), a = Math.min(1f, ph / 0.2f) * Math.min(1f, (1f - ph) / 0.35f), sway = (float) Math.sin(ph * 6.3 + k) * 6f * dp;
            float fx0 = x + (k - 1) * charH * 0.26f + sway, fy0 = top + charH * 0.30f - ph * charH * 0.75f;
            if ("heart".equals(fx)) { tp.setColor(((int) (255 * a) << 24) | 0xFF5C8A); tp.setTextSize(15f * dp); cv.drawText("♥", fx0, fy0, tp); }
            else if ("spark".equals(fx)) { tp.setColor(((int) (255 * a) << 24) | 0xFFD84A); tp.setTextSize((11f + 5f * ((k + idx) % 2)) * dp); cv.drawText("✦", fx0, fy0, tp); }
            else if ("note".equals(fx)) { tp.setColor(((int) (255 * a) << 24) | 0x6C63FF); tp.setTextSize(16f * dp); cv.drawText(k % 2 == 0 ? "♪" : "♫", fx0, fy0, tp); }
            else if ("leaf".equals(fx)) { p.setColor(((int) (230 * a) << 24) | 0x4FB45A); float lx = x + charH * 0.20f + k * 5f * dp, ly = top + charH * 0.55f + ph * charH * 0.30f; rf.set(lx - 3f * dp, ly - 1.8f * dp, lx + 3f * dp, ly + 1.8f * dp); cv.save(); cv.rotate(30f * k - 20f, lx, ly); cv.drawOval(rf, p); cv.restore(); }
            else if ("food".equals(fx)) { tp.setTextSize(15f * dp); tp.setColor(((int) (255 * a) << 24) | 0xFFFFFF); cv.drawText(k == 0 ? "🍙" : k == 1 ? "🥕" : "🍖", fx0, fy0, tp); }
            else if ("zzz".equals(fx)) { tp.setColor(((int) (255 * a) << 24) | 0x8A96FF); tp.setTextSize((10f + 4f * ph + k) * dp); cv.drawText("Z", x + charH * 0.10f + ph * charH * 0.30f, top + charH * 0.10f - ph * charH * 0.55f, tp); }
        }
        tp.setColor(sc.ink);
    }
}
