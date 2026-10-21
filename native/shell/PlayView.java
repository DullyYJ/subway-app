package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;

import java.util.Random;

/**
 * 캐릭터 놀이터 그림(웹 _RC.playStart 의 canvas — 역 팝업 · 시간표 시트의 이름 옆 빈 칸). 계산은 모두 PlayCore 가 하고 여기는 그리기만 한다.
 * ① 캐릭터 16프레임은 '그릴 크기'로 한 번만 줄여 작은 아틀라스에 담는다(뒤 스레드 · 시트는 RunnerArt) → 프레임마다는 1:1 복사만 한다.
 * ② 배경(하늘 · 장식 · 바닥 · 나무 · 웅덩이)은 한 겹으로 그리고 가장자리(좌우 20% · 위 50%)를 투명하게 지운다(DST_IN) → 시트 바탕과 자연스럽게 섞인다.
 * ③ 30fps 로 그린다. 그리는 동안 새 객체를 만들지 않는다. 창이 안 보이거나 떼어지면 즉시 멈춘다.
 * 순수 장식 — 판단 · 계산과 무관하고, 만져지지 않는다(아래 화면의 단추 누르기를 막지 않는다).
 */
public final class PlayView extends View {
    private static final float PI2 = (float) (Math.PI * 2d), DEG = (float) (180d / Math.PI);

    private final float dpr;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private PlayCore.Play play;
    private PlayCore.Snap pendSnap;
    private boolean dark, reduce, running;
    private float wDp, hDp;
    private double acc; private long last;
    private int gen;                                      // 새 놀이터로 바뀌면 옛 아틀라스 빌드는 버린다

    // 아틀라스(캐릭터마다 · 두더지는 솟는 장면 하나 더)
    private static final class Atlas { Bitmap bmp; int fp; }
    private Atlas[] atl = new Atlas[0], atlIn = new Atlas[0];
    private int[] order = new int[0];                     // k 오름차순 그리는 순서
    private boolean building;

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), tp = new Paint(Paint.ANTI_ALIAS_FLAG), bmpPaint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG), maskPaint = new Paint();
    private final RectF rf = new RectF();
    private final Rect src = new Rect();
    private final Path path = new Path(), grass = new Path();
    private LinearGradient sky, mkL, mkR, mkT;
    private boolean skyDark;

    public PlayView(Context c, float dpr) {
        super(c);
        this.dpr = dpr;
        setClickable(false); setFocusable(false);
        setWillNotDraw(false);
        tp.setTypeface(Typeface.DEFAULT_BOLD); tp.setTextAlign(Paint.Align.CENTER);
        maskPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        setVisibility(GONE);
    }

    /** 이 칸에서 놀이를 시작한다(칸 위치는 부른 쪽이 FrameLayout 여백으로 정한다). 이미 같은 칸이면 그대로 둔다. snap 이 있으면 그 장면에서 이어 논다. */
    public void begin(int wPx, int hPx, boolean dark, boolean reduce, PlayCore.Snap snap) {
        if (wPx <= 0 || hPx <= 0) return;
        float w = wPx / dpr, h = hPx / dpr;
        if (play != null && Math.abs(w - wDp) < 0.5f && Math.abs(h - hDp) < 0.5f && this.dark == dark) return;
        this.dark = dark; this.reduce = reduce;
        wDp = w; hDp = h;
        gen++;
        play = new PlayCore.Play(w, h, snap, rnd);
        acc = 0d; last = 0L;
        buildStatic();
        order = sortByK(play);
        atl = new Atlas[play.cs.length]; atlIn = new Atlas[play.cs.length]; building = false;
        setVisibility(VISIBLE);
        warmSheets();
        running = true;
        invalidate();
    }
    public PlayCore.Snap snap() { return play == null ? null : play.snap(); }
    public boolean active() { return play != null; }
    /** 멈추고 치운다(시트가 닫히거나 칸을 못 놓을 때). */
    public void end() { running = false; gen++; play = null; atl = new Atlas[0]; atlIn = new Atlas[0]; setVisibility(GONE); }

    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); if (play != null) { running = true; last = 0L; invalidate(); } }
    @Override protected void onDetachedFromWindow() { running = false; super.onDetachedFromWindow(); }
    @Override protected void onWindowVisibilityChanged(int v) { super.onWindowVisibilityChanged(v); if (v == VISIBLE) { if (play != null) { running = true; last = 0L; invalidate(); } } else running = false; }

    private static int[] sortByK(PlayCore.Play pl) {
        int n = pl.cs.length; int[] o = new int[n];
        for (int i = 0; i < n; i++) o[i] = i;
        for (int i = 1; i < n; i++) { int v = o[i], j = i - 1; while (j >= 0 && pl.cs[o[j]].k > pl.cs[v].k) { o[j + 1] = o[j]; j--; } o[j + 1] = v; }
        return o;
    }

    // ── 한 번만 만드는 것: 하늘 그라데이션 · 가장자리 지우개 · 풀잎 ──
    private void buildStatic() {
        PlayCore.Scene sc = play.sc; int[] cl = dark ? sc.d : sc.p;
        float W = (float) play.W, H = (float) play.H;
        sky = new LinearGradient(0f, 0f, 0f, H, new int[] { cl[0], cl[1], cl[2] }, new float[] { 0f, 0.55f, 1f }, Shader.TileMode.CLAMP);
        int[] a = { 0x00FFFFFF, 0x28FFFFFF, 0x80FFFFFF, 0xD7FFFFFF, 0xFFFFFFFF };            // smoothstep 근사(0, .16, .5, .84, 1)
        float[] pos = { 0f, 0.25f, 0.5f, 0.75f, 1f };
        mkL = new LinearGradient(0f, 0f, W * 0.2f, 0f, a, pos, Shader.TileMode.CLAMP);
        mkR = new LinearGradient(W, 0f, W * 0.8f, 0f, a, pos, Shader.TileMode.CLAMP);
        mkT = new LinearGradient(0f, 0f, 0f, H * 0.5f, a, pos, Shader.TileMode.CLAMP);
        float gy = (float) play.gy;
        grass.reset();
        if ("meadow".equals(sc.deco)) for (float gx = 5f; gx < W; gx += 13f) { grass.moveTo(gx - 2f, gy); grass.lineTo(gx, gy - 4f); grass.lineTo(gx + 2f, gy); grass.close(); }
    }

    // ── 시트 읽기 · 아틀라스(뒤 스레드) ──
    private void warmSheets() {
        if (play == null) return;
        RunnerArt.warm(getContext(), play.cs.length > 0 ? play.cs[0].id : null, main, new RunnerArt.Ready() { @Override public void onSheet() { tryBuild(); } });
        tryBuild();
    }
    private void tryBuild() {
        final PlayCore.Play pl = play;
        if (pl == null || building) return;
        for (PlayCore.Actor c : pl.cs) {
            if (!RunnerArt.has(c.id)) return;
            if ("mole".equals(c.kind) && !RunnerArt.has("dudung_intro")) return;
        }
        building = true;
        final int g = gen;
        final float d = dpr;
        new Thread(new Runnable() { @Override public void run() {
            final int n = pl.cs.length;
            final Atlas[] a = new Atlas[n], b = new Atlas[n];
            try {
                for (int i = 0; i < n; i++) {
                    PlayCore.Actor c = pl.cs[i];
                    a[i] = mkAtlas(RunnerArt.get(c.id), c, d);
                    if ("mole".equals(c.kind)) b[i] = mkAtlas(RunnerArt.get("dudung_intro"), c, d);
                }
            } catch (Throwable ignored) { }
            main.post(new Runnable() { @Override public void run() {
                if (g != gen || play != pl) return;
                building = false;
                boolean ok = true; for (int i = 0; i < n; i++) if (a[i] == null) ok = false;
                if (!ok) return;                                       // 시트가 그새 버려졌다 — 다음 읽기 알림에 다시 만든다
                atl = a; atlIn = b; invalidate();
            } });
        } }, "shell-play-atlas").start();
    }
    /** 256px 칸 16장을 그릴 크기(fp)로 줄여 담는다. 반씩 줄여 가며 자르면 가장자리가 깨지지 않는다(웹의 'high' 보간과 같은 결과). */
    private static Atlas mkAtlas(Bitmap sheet, PlayCore.Actor c, float dpr) {
        if (sheet == null || sheet.isRecycled()) return null;
        double sc0 = c.D.cell / 256d * c.k;
        int fp = Math.max(8, (int) Math.round(256d * sc0 * dpr));
        Atlas at = new Atlas(); at.fp = fp;
        at.bmp = Bitmap.createBitmap(fp * 4, fp * 4, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(at.bmp);
        Paint pp = new Paint(Paint.FILTER_BITMAP_FLAG);
        for (int i = 0; i < 16; i++) {
            Bitmap cell = Bitmap.createBitmap(sheet, (i % 4) * 256, (i / 4) * 256, 256, 256);
            int w = 256;
            while (w / 2 >= fp * 1.5f) { Bitmap h = Bitmap.createScaledBitmap(cell, w / 2, w / 2, true); if (h != cell) cell.recycle(); cell = h; w /= 2; }
            Bitmap f = w == fp ? cell : Bitmap.createScaledBitmap(cell, fp, fp, true);
            cv.drawBitmap(f, (i % 4) * fp, (i / 4) * fp, pp);
            if (f != cell) f.recycle();
            cell.recycle();
        }
        return at;
    }

    // ───────────── 그리기 ─────────────
    private static int ca(int rgb, float a) { return ((int) (Math.max(0f, Math.min(1f, a)) * 255f + 0.5f) << 24) | (rgb & 0xFFFFFF); }

    @Override protected void onDraw(Canvas cv) {
        final PlayCore.Play pl = play;
        if (pl == null) return;
        long now = SystemClock.uptimeMillis();
        if (!reduce && running) {
            if (last == 0L) last = now;
            acc += Math.min(0.05d, (now - last) / 1000d); last = now;
            if (acc >= 0.030d) { pl.tick(acc); acc = 0d; }
        }
        cv.save();
        cv.scale(dpr, dpr);
        drawWorld(cv, pl);
        drawActors(cv, pl);
        cv.restore();
        if (running && !reduce) postInvalidateDelayed(26L);
    }

    private void drawWorld(Canvas cv, PlayCore.Play pl) {
        final float W = (float) pl.W, H = (float) pl.H, gy = (float) pl.gy, FY = (float) pl.fy, t = (float) pl.t;
        final PlayCore.Scene sc = pl.sc;
        int layer = cv.saveLayer(0f, 0f, W, H, null);
        p.setShader(sky); p.setStyle(Paint.Style.FILL); p.setColor(0xFF000000); cv.drawRect(0f, 0f, W, H, p); p.setShader(null);
        deco(cv, pl, t);
        p.setColor(dark ? sc.g[1] : sc.g[0]); cv.drawRect(0f, gy - 1f, W, H, p);                         // 바닥 띠
        if ("meadow".equals(sc.deco)) { p.setColor(dark ? 0xFF1F6A4C : 0xFF6CC28A); cv.drawPath(grass, p); }
        if ("snow".equals(sc.deco)) { p.setColor(dark ? 0xFFC4D4E8 : 0xFFFFFFFF); cv.drawRect(0f, gy - 2f, W, gy, p); }
        if (pl.pond != null) drawPond(cv, pl, t);
        if (pl.tree != null) drawTree(cv, pl);
        for (int i = 0; i < pl.poops.size(); i++) drawPoop(cv, pl.poops.get(i), t, FY);
        for (PlayCore.Actor c : pl.cs) if ("mole".equals(c.kind) && "hidden".equals(c.st)) {                 // 땅속 두더지: 움직이는 흙두둑
            float wob = (float) Math.sin(t * 9d) * 0.6f, x = (float) c.x;
            p.setColor(dark ? 0xFF6B4A33 : 0xFF8A5F3D); rf.set(x - 8f, FY - (3.4f + wob * 0.3f), x + 8f, FY + (3.4f + wob * 0.3f)); cv.drawArc(rf, 180f, 180f, true, p);
            p.setColor(dark ? 0xFF7D5A40 : 0xFFA2744C); rf.set(x - 5f, FY - 0.6f - 1.4f, x + 1f, FY - 0.6f + 1.4f); cv.drawArc(rf, 180f, 180f, true, p);
        }
        // 가장자리 지우기: 좌우 20% · 위 50% 가 투명하게(곱)
        p.setXfermode(maskPaint.getXfermode()); p.setColor(0xFFFFFFFF);
        p.setShader(mkL); cv.drawRect(0f, 0f, W * 0.2f, H, p);
        p.setShader(mkR); cv.drawRect(W * 0.8f, 0f, W, H, p);
        p.setShader(mkT); cv.drawRect(0f, 0f, W, H * 0.5f, p);
        p.setShader(null); p.setXfermode(null);
        cv.restoreToCount(layer);
    }

    private void cloud(Canvas cv, float x, float y, float r, float a) {
        p.setColor(ca(0xFFFFFF, a)); path.reset();
        rf.set(x - r * 1.5f, y - r * 0.62f, x + r * 1.5f, y + r * 0.62f); path.addOval(rf, Path.Direction.CW);
        rf.set(x - r * 0.7f - r * 0.8f, y + r * 0.1f - r * 0.5f, x - r * 0.7f + r * 0.8f, y + r * 0.1f + r * 0.5f); path.addOval(rf, Path.Direction.CW);
        rf.set(x + r * 0.75f - r * 0.85f, y + r * 0.12f - r * 0.5f, x + r * 0.75f + r * 0.85f, y + r * 0.12f + r * 0.5f); path.addOval(rf, Path.Direction.CW);
        cv.drawPath(path, p);
    }
    private void deco(Canvas cv, PlayCore.Play pl, float t) {
        final String d = pl.sc.deco; final float W = (float) pl.W, H = (float) pl.H, gy = (float) pl.gy;
        final PlayCore.Decor[] parts = pl.parts;
        p.setStyle(Paint.Style.FILL);
        if ("clouds".equals(d)) {
            if (!dark) { p.setColor(0xE6FFE28C); cv.drawCircle(W * 0.8f, 28f, 7f, p); p.setColor(0x4DFFE28C); cv.drawCircle(W * 0.8f, 28f, 12f, p); }
            else { p.setColor(0xD9FFF4C8); cv.drawCircle(W * 0.8f, 28f, 6f, p); p.setColor(0xE60E203C); cv.drawCircle(W * 0.8f + 2.5f, 26.5f, 5.4f, p); }
            for (PlayCore.Decor q : parts) { float x = (float) (((q.x * (W + 60f) + t * 5d * q.v) % (W + 60f)) - 30d); cloud(cv, x, 20f + (float) q.y * (H * 0.3f), 6f + (float) q.s * 3f, dark ? 0.16f : 0.9f); }
        } else if ("sunset".equals(d)) {
            p.setColor(dark ? 0x80FFAA78 : 0xF2FFEEBE); rf.set(W * 0.78f - H * 0.3f, gy - H * 0.3f, W * 0.78f + H * 0.3f, gy + H * 0.3f); cv.drawArc(rf, 180f, 180f, true, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.2f); p.setStrokeCap(Paint.Cap.BUTT); p.setColor(dark ? 0xB3FFE6D2 : 0x8C78506E);
            for (PlayCore.Decor q : parts) {
                float x = (float) (((q.x * (W + 40f) + t * 14d * q.v) % (W + 40f)) - 20d), y = 24f + (float) q.y * 14f + (float) Math.sin(t * 2d + q.ph) * 2f, f = (float) Math.sin(t * 7d + q.ph) * 2.2f;
                path.reset(); path.moveTo(x - 4f, y + f); path.quadTo(x - 1.5f, y - 2f, x, y); path.quadTo(x + 1.5f, y - 2f, x + 4f, y + f); cv.drawPath(path, p);
            }
            p.setStyle(Paint.Style.FILL);
        } else if ("meadow".equals(d)) {
            for (int i = 0; i < parts.length; i++) {
                PlayCore.Decor q = parts[i];
                float x = (float) (((q.x * W + Math.sin(t * 0.8d * q.v + q.ph) * 26d) + W) % W), y = 22f + (float) q.y * H * 0.4f + (float) Math.sin(t * 2.2d + q.ph) * 4f, wing = (float) Math.abs(Math.sin(t * 9d + q.ph)) * 3f + 0.8f;
                p.setColor((i & 1) != 0 ? (dark ? 0xFFFFD27A : 0xFFFF9BB8) : (dark ? 0xFF9FD8FF : 0xFFFFC46B));
                cv.save(); cv.rotate(-0.5f * DEG, x - 2f, y); rf.set(x - 2f - wing, y - 2.2f, x - 2f + wing, y + 2.2f); cv.drawOval(rf, p); cv.restore();
                cv.save(); cv.rotate(0.5f * DEG, x + 2f, y); rf.set(x + 2f - wing, y - 2.2f, x + 2f + wing, y + 2.2f); cv.drawOval(rf, p); cv.restore();
            }
        } else if ("petals".equals(d)) {
            p.setColor(dark ? 0xBFFFAAD2 : 0xCCFF8CBE);
            for (PlayCore.Decor q : parts) {
                float y = (float) (((q.y * H + t * 9d * q.v) % (H + 8f)) - 4d), x = (float) ((q.x * W + Math.sin(t * 1.3d + q.ph) * 8d + W) % W);
                cv.save(); cv.translate(x, y); cv.rotate((float) (t * q.v + q.ph) * DEG); rf.set(-3.4f * (float) q.s, -1.8f * (float) q.s, 3.4f * (float) q.s, 1.8f * (float) q.s); cv.drawOval(rf, p); cv.restore();
            }
        } else if ("snow".equals(d)) {
            p.setColor(dark ? 0xD9FFFFFF : 0xE696B9E1);
            for (PlayCore.Decor q : parts) { float y = (float) (((q.y * H + t * 13d * q.v) % (H + 4f)) - 2d), x = (float) ((q.x * W + Math.sin(t + q.ph) * 5d + W) % W); cv.drawCircle(x, y, 1.2f * (float) q.s, p); }
        } else if ("sea".equals(d)) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.4f);
            for (int i = 0; i < 3; i++) {
                p.setColor(dark ? ca(0xA0DCFF, 0.28f - i * 0.07f) : ca(0xFFFFFF, 0.8f - i * 0.2f)); path.reset();
                for (float x = 0f; x <= W; x += 4f) { float y = H * (0.46f + i * 0.13f) + (float) Math.sin(x / 11f + t * (1.6f + i * 0.4f) + i) * 2.2f; if (x == 0f) path.moveTo(x, y); else path.lineTo(x, y); }
                cv.drawPath(path, p);
            }
            p.setStyle(Paint.Style.FILL); p.setColor(dark ? 0x80B4E6FF : 0xBFFFFFFF);
            for (PlayCore.Decor q : parts) { float y = H - (float) ((q.y * H + t * 8d * q.v) % H), x = (float) q.x * W + (float) Math.sin(t * 2d + q.ph) * 2f; cv.drawCircle(x, y, 1f + (float) q.s * 0.7f, p); }
        } else if ("night".equals(d)) {
            for (PlayCore.Decor q : parts) { float tw = 0.45f + 0.55f * (float) Math.abs(Math.sin(t * q.v * 1.6d + q.ph)); p.setColor(ca(dark ? 0xFFFFEB : 0xFFFFFF, dark ? tw : tw * 0.95f)); cv.drawCircle((float) q.x * W, 3f + (float) q.y * (H * 0.62f), 0.7f + (float) q.s * 0.45f, p); }
            float mx = W * 0.8f; p.setColor(dark ? 0xFFFFF3C4 : 0xFFFFFBE6); cv.drawCircle(mx, 28f, 7f, p); p.setColor(dark ? 0xFF1A1650 : 0xFFD6CFFF); cv.drawCircle(mx + 3f, 26f, 6.2f, p);
            float sp = (t % 9f) / 1.4f;
            if (sp < 1f) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.3f); p.setColor(ca(0xFFFFFF, 1f - sp)); cv.drawLine(W * 0.2f + sp * W * 0.4f, 4f + sp * 14f, W * 0.2f + sp * W * 0.4f - 10f, 4f + sp * 14f - 5f, p); p.setStyle(Paint.Style.FILL); }
        } else if ("aurora".equals(d)) {
            for (int i = 0; i < 3; i++) {
                int col = dark ? (i == 0 ? 0x4750FFBE : i == 1 ? 0x427AA0FF : 0x38DC78FF) : (i == 0 ? 0x4D5ADCB4 : i == 1 ? 0x478AAAFF : 0x40E68CFF);
                p.setColor(col); path.reset(); path.moveTo(0f, 0f);
                for (float x = 0f; x <= W; x += 6f) path.lineTo(x, H * (0.22f + i * 0.1f) + (float) Math.sin(x / 26f + t * (0.7f + i * 0.3f) + i * 2f) * 5f);
                path.lineTo(W, 0f); path.close(); cv.drawPath(path, p);
            }
            for (PlayCore.Decor q : parts) { float tw2 = 0.4f + 0.6f * (float) Math.abs(Math.sin(t * q.v + q.ph)); p.setColor(ca(0xFFFFFF, dark ? tw2 : tw2 * 0.9f)); cv.drawCircle((float) q.x * W, 4f + (float) q.y * H * 0.5f, 0.8f, p); }
        }
    }

    private void drawTree(Canvas cv, PlayCore.Play pl) {
        final String d = pl.sc.deco; final float x = (float) pl.tree.x, th = (float) pl.tree.th, ty = th * 0.55f, FY = (float) pl.fy;
        int trunk = dark ? 0xFF6B4F3A : 0xFF9A7352, can;
        if ("snow".equals(d)) can = dark ? 0xFF9BB4D0 : 0xFFE6F1FF;
        else if ("petals".equals(d) || "sunset".equals(d)) can = dark ? 0xFFA85A86 : 0xFFFFB3D1;
        else if ("night".equals(d) || "aurora".equals(d)) can = dark ? 0xFF2B3F7A : 0xFF8DA0E8;
        else if ("sea".equals(d)) can = dark ? 0xFF2F8A62 : 0xFF5FC98A;
        else can = dark ? 0xFF2F7A55 : 0xFF7FD68F;
        p.setStyle(Paint.Style.FILL); p.setColor(trunk); cv.drawRect(x - 2.2f, FY - th, x + 2.2f, FY + 1f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.4f); p.setStrokeCap(Paint.Cap.ROUND);
        cv.drawLine(x, FY - ty + 3f, x - 11f, FY - ty - 3f, p); cv.drawLine(x, FY - ty + 3f, x + 11f, FY - ty - 3f, p);               // 쉬어 가는 가지
        if ("sea".equals(d)) {
            p.setColor(can); p.setStrokeWidth(3f);
            for (int f = -2; f <= 2; f++) { path.reset(); path.moveTo(x, FY - th); path.quadTo(x + f * 8f, FY - th - 9f + Math.abs(f) * 1.5f, x + f * 12f, FY - th + 3f + Math.abs(f) * 2f); cv.drawPath(path, p); }
            p.setStyle(Paint.Style.FILL);
        } else {
            p.setStyle(Paint.Style.FILL); p.setColor(can);
            cv.drawCircle(x, FY - th - 4f, 11f, p); cv.drawCircle(x - 9f, FY - th + 3f, 8f, p); cv.drawCircle(x + 9f, FY - th + 3f, 8f, p);
        }
        p.setStrokeCap(Paint.Cap.BUTT); p.setStyle(Paint.Style.FILL);
    }
    private void drawPond(Canvas cv, PlayCore.Play pl, float t) {
        final float x = (float) pl.pond.x, rx = (float) pl.pond.rx, FY = (float) pl.fy;
        p.setStyle(Paint.Style.FILL); p.setColor(dark ? 0xFF245F8C : 0xFF6FC2EE); rf.set(x - rx, FY + 1.2f - 4.4f, x + rx, FY + 1.2f + 4.4f); cv.drawOval(rf, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f);
        for (int i = 0; i < 2; i++) {
            float ph = (t * 0.5f + i * 0.5f) % 1f, cx = x + (i != 0 ? rx * 0.3f : -rx * 0.35f), ex = rx * 0.3f * ph + 2f, ey = 1.6f * ph + 0.4f;
            p.setColor(ca(dark ? 0xAADCFF : 0xFFFFFF, (dark ? 0.55f : 0.85f) * (1f - ph))); rf.set(cx - ex, FY + 1.2f - ey, cx + ex, FY + 1.2f + ey); cv.drawOval(rf, p);
        }
        p.setStyle(Paint.Style.FILL);
    }
    private void drawPoop(Canvas cv, PlayCore.Poop o, float t, float FY) {
        float age = t - (float) o.born, al = age > 6.4f ? Math.max(0f, (8f - age) / 1.6f) : 1f, s0 = age < 0.2f ? age / 0.2f : 1f;
        cv.save(); cv.translate((float) o.x, FY); cv.scale(s0, s0);
        p.setStyle(Paint.Style.FILL);
        p.setColor(ca(0x7D4F26, al)); rf.set(-4.4f, -1.4f - 2.4f, 4.4f, -1.4f + 2.4f); cv.drawOval(rf, p);
        p.setColor(ca(0x8F5D2D, al)); rf.set(0.2f - 3.3f, -3.6f - 2f, 0.2f + 3.3f, -3.6f + 2f); cv.drawOval(rf, p);
        p.setColor(ca(0xA56D37, al)); path.reset(); path.moveTo(-1.6f, -4.8f); path.quadTo(0.4f, -9f, 1.6f, -5.2f); path.close(); cv.drawPath(path, p);
        p.setColor(ca(0xFFFFFF, 0.45f * al)); cv.save(); cv.rotate(-0.4f * DEG, -1.4f, -3.9f); rf.set(-1.4f - 0.9f, -3.9f - 0.5f, -1.4f + 0.9f, -3.9f + 0.5f); cv.drawOval(rf, p); cv.restore();
        if (age < 3f) {                                                                                      // 모락모락 김
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(0.9f); p.setColor(ca(dark ? 0xDCE6C8 : 0x78825A, (dark ? 0.55f : 0.5f) * al * (1f - age / 3f) * 0.8f));
            for (int q = -1; q <= 1; q += 2) { path.reset(); path.moveTo(q * 2f, -9f); path.quadTo(q * 2f + 2f, -12f + (float) Math.sin(t * 5f + q), q * 2f - 1f, -15f); cv.drawPath(path, p); }
            p.setStyle(Paint.Style.FILL);
        }
        cv.restore();
    }

    private void drawActors(Canvas cv, PlayCore.Play pl) {
        final float W = (float) pl.W, FY = (float) pl.fy, t = (float) pl.t;
        for (int oi = 0; oi < order.length; oi++) {
            final int ci = order[oi]; final PlayCore.Actor c = pl.cs[ci];
            if (!c.vis) continue;
            Atlas at = c.useIntro && ci < atlIn.length && atlIn[ci] != null ? atlIn[ci] : (ci < atl.length ? atl[ci] : null);
            if (at == null) continue;
            final RunnerCore.Spec D = c.D;
            final float sc = (float) (D.cell / 256d * c.k), lift = "eagle".equals(c.kind) ? 0f : (float) (D.lift * c.k * 0.6d), high = Math.max(0f, (float) -c.y);
            final int idx = pl.frameIdx(c);
            if (!c.clip) {                                                                                  // 그림자(높이 뜨면 작고 옅게)
                p.setStyle(Paint.Style.FILL); p.setColor(ca(0x000000, (float) D.sh * 0.5f * Math.max(0.2f, 1f - high / 40f)));
                float rx = (float) c.w * 0.2f * Math.max(0.45f, 1f - high / 60f);
                rf.set((float) c.x - rx, FY + 1f - 2.6f, (float) c.x + rx, FY + 1f + 2.6f); cv.drawOval(rf, p);
            }
            cv.save();
            if (c.clip) cv.clipRect(0f, 0f, W, FY + 1.5f);
            cv.translate((float) (c.x + c.jit), FY + 1f + (float) c.y - lift);
            cv.scale(c.dir < 0d ? -1f : 1f, 1f);
            if (c.rot != 0d) cv.rotate((float) c.rot * DEG); else if (c.ang != 0d) cv.rotate((float) c.ang * DEG);
            if (c.sq != 0d) cv.scale(1f + (float) c.sq * 0.35f, 1f - (float) c.sq);
            final int fp = at.fp;
            src.set((idx % 4) * fp, (idx / 4) * fp, (idx % 4) * fp + fp, (idx / 4) * fp + fp);
            final float l = -(float) D.ox * sc, tp0 = -(float) D.base * sc;
            rf.set(l, tp0, l + 256f * sc, tp0 + 256f * sc);
            cv.drawBitmap(at.bmp, src, rf, bmpPaint);
            cv.restore();
            if ("rest".equals(c.st) || "perch".equals(c.st)) {                                              // 쉬는 중: 머리 위로 표시가 떠오른다
                float ph = (float) (((t - c.t0) * 0.9d) % 1d);
                tp.setColor(ca(dark ? 0xFFF6D8 : 0x6B6FA8, 1f - ph)); tp.setTextSize(8f + ph * 3f);
                cv.drawText(pl.sc.mark, (float) c.x + (float) c.w * 0.22f, FY + (float) c.y - (float) c.bodyH * 0.95f - ph * 9f, tp);
            }
        }
        if (pl.pond != null) {                                                                              // 물 앞면(잠긴 느낌)
            p.setStyle(Paint.Style.FILL); p.setColor(dark ? 0x80245F8C : 0x806FC2EE);
            float x = (float) pl.pond.x, rx = (float) pl.pond.rx * 0.97f; rf.set(x - rx, FY + 2.6f - 3f, x + rx, FY + 2.6f + 3f); cv.drawArc(rf, 0f, 180f, true, p);
        }
        for (int i = 0; i < pl.pt.size(); i++) {                                                            // 물보라 · 별 · 흙
            PlayCore.Pt q = pl.pt.get(i);
            float a = 1f - (float) (q.age / q.life);
            p.setStyle(Paint.Style.FILL);
            int rgb = q.type == PlayCore.P_SPLASH ? (dark ? 0x9BD4FF : 0x4FB0EA) : q.type == PlayCore.P_STAR ? 0xFFE58A : (dark ? 0x8A6240 : 0x7A5230);
            p.setColor(ca(rgb, a)); cv.drawCircle((float) q.x, (float) q.y, q.type == PlayCore.P_STAR ? 1.5f : 1.3f, p);
        }
    }
}
