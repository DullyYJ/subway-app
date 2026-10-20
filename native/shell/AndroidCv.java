package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.util.ArrayList;

/**
 * SceneCv 의 안드로이드 구현 — android.graphics.Canvas / Paint / Path 로 그린다.
 *
 * 하드웨어 가속: Compose Canvas 가 넘겨 주는 nativeCanvas 는 화면 그리기(RenderNode) 기록용이라, 여기서 부르는 drawPath·drawBitmap 은 GPU 로 그려진다.
 * (미리 그려 두는 바탕 한 장만 비트맵 + 소프트웨어 Canvas 로 한 번 그려 둔다 — 이 장면 크기에서는 몇 ms 이고, 그 뒤엔 매 프레임 GPU 가 그 비트맵을 한 장 얹을 뿐이다.)
 * 프레임마다 객체를 새로 만들지 않게 Paint·Path·RectF·상태 스택을 모두 재사용한다.
 *
 * Canvas2D 와 같게 맞춘 것(웹 그림과 같은 모양이 나오게 — 이 PC 에서 java.awt 판 AwtCv 로 웹과 픽셀 비교해 확인한 약속과 같다)
 *  · arc/ellipse: 이미 그리던 경로가 있으면 현재 점에서 호의 시작점까지 직선으로 잇는다. 한 바퀴(2π 이상)는 반바퀴 두 번으로 나눠 그린다.
 *  · globalAlpha 는 색·그라데이션·그림 모두에 곱해진다.
 *  · 그라데이션은 Canvas2D 처럼 '곱해진 알파' 기준으로 섞이도록, 알파 0 인 멈춤점의 색을 이웃 멈춤점 색으로 맞춘다(안 그러면 검은 테두리가 낀다).
 */
public final class AndroidCv implements SceneCv {

    // ───────────── 그림 · 바탕 그림 · 그라데이션 ─────────────
    /** 스프라이트 시트 한 장. */
    public static final class AImg implements SceneCv.Img {
        public final Bitmap bmp;
        public AImg(Bitmap b) { bmp = b; }
        @Override public int w() { return bmp.getWidth(); }
        @Override public int h() { return bmp.getHeight(); }
    }

    /** 따로 그려 두는 바탕 그림(비트맵 + 그 위에 그리는 도화지). */
    public static final class ALayer implements SceneCv.Layer {
        final Bitmap bmp; final AndroidCv cv;
        ALayer(double w, double h, double dpr) {
            bmp = Bitmap.createBitmap(Math.max(1, (int) Math.round(w * dpr)), Math.max(1, (int) Math.round(h * dpr)), Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp); c.scale((float) dpr, (float) dpr);
            cv = new AndroidCv(c);
        }
        @Override public int w() { return bmp.getWidth(); }
        @Override public int h() { return bmp.getHeight(); }
        @Override public SceneCv cv() { return cv; }
        /** 더 안 쓸 때 메모리를 돌려준다. */
        public void recycle() { try { bmp.recycle(); } catch (RuntimeException e) { /* 이미 해제 */ } }
    }

    static final class Gr implements SceneCv.Grad {
        final boolean radial; final double x0, y0, r0, x1, y1, r1;
        final ArrayList<Double> pos = new ArrayList<>(); final ArrayList<Integer> col = new ArrayList<>();
        Shader built;
        Gr(boolean radial, double x0, double y0, double r0, double x1, double y1, double r1) { this.radial = radial; this.x0 = x0; this.y0 = y0; this.r0 = r0; this.x1 = x1; this.y1 = y1; this.r1 = r1; }
        @Override public SceneCv.Grad stop(double p, int argb) { pos.add(p); col.add(argb); built = null; return this; }
        /** 멈춤점이 하나뿐이면 단색(0xAARRGGBB), 아니면 null. */
        Integer solid() { return col.size() == 1 ? col.get(0) : col.isEmpty() ? Integer.valueOf(0) : null; }
        Shader shader() {
            if (built != null) return built;
            int n = col.size();
            float[] f = new float[n + 1]; int[] c = new int[n + 1]; int m = 0;
            double lo = 0, span = 1;
            if (radial && r0 > 0 && x0 == x1 && y0 == y1 && r1 > r0) { lo = r0 / r1; span = 1 - lo; }
            if (lo > 0) { f[0] = 0; c[0] = col.get(0); m = 1; }
            for (int i = 0; i < n; i++) {
                double p = Math.min(1, Math.max(0, pos.get(i))); p = lo + p * span;
                float fp = (float) p; if (m > 0 && fp <= f[m - 1]) fp = Math.min(1f, f[m - 1] + 0.0001f);
                f[m] = fp; c[m] = col.get(i); m++;
            }
            // 알파 0 인 멈춤점은 이웃 색을 빌린다(Canvas2D 는 곱해진 알파로 섞는다)
            for (int i = 0; i < m; i++) {
                if ((c[i] >>> 24) != 0) continue;
                int src = -1;
                for (int j = i - 1; j >= 0 && src < 0; j--) if ((c[j] >>> 24) != 0) src = c[j];
                for (int j = i + 1; j < m && src < 0; j++) if ((c[j] >>> 24) != 0) src = c[j];
                if (src >= 0) c[i] = src & 0x00FFFFFF;
            }
            int[] cc = new int[m]; float[] ff = new float[m]; System.arraycopy(c, 0, cc, 0, m); System.arraycopy(f, 0, ff, 0, m);
            if (radial) built = new RadialGradient((float) x1, (float) y1, (float) Math.max(.001, r1), cc, ff, Shader.TileMode.CLAMP);
            else {
                float ex = (float) (x1 - x0), ey = (float) (y1 - y0);
                if (ex * ex + ey * ey < 1e-9f) ey = 1e-3f;
                built = new LinearGradient((float) x0, (float) y0, (float) x0 + ex, (float) y0 + ey, cc, ff, Shader.TileMode.CLAMP);
            }
            return built;
        }
    }

    // ───────────── 상태 ─────────────
    private static final class St {
        int fill, stroke; Gr fillGrad; double lw, alpha, font; boolean round;
        void copyFrom(AndroidCv c) { fill = c.fillArgb; stroke = c.strokeArgb; fillGrad = c.fillGrad; lw = c.lw; alpha = c.alpha; font = c.fontPx; round = c.round; }
        void copyTo(AndroidCv c) { c.fillArgb = fill; c.strokeArgb = stroke; c.fillGrad = fillGrad; c.lw = lw; c.alpha = alpha; c.fontPx = font; c.round = round; }
    }

    private Canvas cv;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Path path = new Path();
    private final RectF oval = new RectF(), dstF = new RectF();
    private final Rect srcI = new Rect();
    private final Matrix mat = new Matrix();
    private final Path tmp = new Path();
    private final Paint.FontMetrics fm = new Paint.FontMetrics();
    private final ArrayList<St> stack = new ArrayList<>(); private int sp = 0;
    private int fillArgb = 0xFF000000, strokeArgb = 0xFF000000; private Gr fillGrad;
    private double lw = 1, alpha = 1, fontPx = 10; private boolean round;
    private boolean has;
    private Typeface bold;

    public AndroidCv(Canvas c) { cv = c; }
    /** 프레임마다 Compose 가 넘겨 주는 Canvas 로 바꿔 끼운다(상태는 처음 값으로). */
    public void begin(Canvas c) {
        cv = c; sp = 0; fillArgb = 0xFF000000; strokeArgb = 0xFF000000; fillGrad = null; lw = 1; alpha = 1; fontPx = 10; round = false; has = false; path.rewind();
    }
    public Canvas canvas() { return cv; }

    // ───────────── SceneCv ─────────────
    @Override public void save() {
        cv.save();
        if (sp == stack.size()) stack.add(new St());
        stack.get(sp++).copyFrom(this);
    }
    @Override public void restore() {
        if (sp == 0) return;
        stack.get(--sp).copyTo(this);
        cv.restore();
    }
    @Override public void translate(double x, double y) { cv.translate((float) x, (float) y); }
    @Override public void rotate(double r) { cv.rotate((float) Math.toDegrees(r)); }
    @Override public void scale(double sx, double sy) { cv.scale((float) sx, (float) sy); }

    @Override public void fillStyle(int argb) { fillArgb = argb; fillGrad = null; }
    @Override public void fillGrad(SceneCv.Grad g) { fillGrad = (Gr) g; }
    @Override public void strokeStyle(int argb) { strokeArgb = argb; }
    @Override public void lineWidth(double w) { lw = w; }
    @Override public void lineCapRound(boolean r) { round = r; }
    @Override public void globalAlpha(double a) { alpha = a; }

    @Override public void beginPath() { path.rewind(); has = false; }
    @Override public void moveTo(double x, double y) { path.moveTo((float) x, (float) y); has = true; }
    @Override public void lineTo(double x, double y) { if (!has) path.moveTo((float) x, (float) y); else path.lineTo((float) x, (float) y); has = true; }
    @Override public void quadTo(double a, double b, double x, double y) { if (!has) path.moveTo((float) a, (float) b); path.quadTo((float) a, (float) b, (float) x, (float) y); has = true; }
    @Override public void bezierTo(double a, double b, double c, double d, double x, double y) { if (!has) path.moveTo((float) a, (float) b); path.cubicTo((float) a, (float) b, (float) c, (float) d, (float) x, (float) y); has = true; }
    @Override public void closePath() { if (has) path.close(); }
    @Override public void rect(double x, double y, double w, double h) { path.addRect((float) x, (float) y, (float) (x + w), (float) (y + h), Path.Direction.CW); has = true; }
    @Override public void arc(double x, double y, double r, double a0, double a1) { ellipse(x, y, r, r, 0, a0, a1); }
    @Override public void ellipse(double x, double y, double rx, double ry, double rot, double a0, double a1) {
        double twoPi = Math.PI * 2, sweep = a1 - a0;
        if (sweep >= twoPi - 1e-9) sweep = twoPi; else { sweep = sweep % twoPi; if (sweep < 0) sweep += twoPi; }
        float s0 = (float) Math.toDegrees(a0), sw = (float) Math.toDegrees(sweep);
        oval.set((float) (x - rx), (float) (y - ry), (float) (x + rx), (float) (y + ry));
        Path target = path;
        if (rot != 0) {                                      // 기울어진 타원: 따로 만들어 돌린 뒤 이어 붙인다
            tmp.rewind(); target = tmp;
        }
        boolean force = rot != 0 ? true : !has;              // 그리던 경로가 있으면 현재 점에서 호 시작점까지 직선(Canvas2D)
        if (sw >= 359.999f) { target.arcTo(oval, s0, 180f, force); target.arcTo(oval, s0 + 180f, 180f, false); }
        else target.arcTo(oval, s0, sw, force);
        if (rot != 0) {
            mat.setRotate((float) Math.toDegrees(rot), (float) x, (float) y); tmp.transform(mat);
            path.addPath(tmp);
        }
        has = true;
    }

    private void applyAlpha(int argb) { paint.setShader(null); paint.setColor(argb); paint.setAlpha(Math.round(((argb >>> 24) & 255) * (float) clamp01(alpha))); }
    private static double clamp01(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    private void prepFill() {
        paint.setStyle(Paint.Style.FILL);
        Integer solid = fillGrad == null ? Integer.valueOf(fillArgb) : fillGrad.solid();
        if (solid != null) applyAlpha(solid);
        else { paint.setShader(fillGrad.shader()); paint.setColor(0xFF000000); paint.setAlpha(Math.round(255f * (float) clamp01(alpha))); }
    }
    @Override public void fill() { prepFill(); cv.drawPath(path, paint); }
    @Override public void stroke() {
        paint.setStyle(Paint.Style.STROKE); applyAlpha(strokeArgb); paint.setStrokeWidth((float) lw);
        paint.setStrokeCap(round ? Paint.Cap.ROUND : Paint.Cap.BUTT); paint.setStrokeJoin(Paint.Join.MITER); paint.setStrokeMiter(10f);
        cv.drawPath(path, paint);
    }
    @Override public void clip() { cv.clipPath(path); }
    @Override public void fillRect(double x, double y, double w, double h) { prepFill(); cv.drawRect((float) x, (float) y, (float) (x + w), (float) (y + h), paint); }

    @Override public void font(double px) { fontPx = px; }
    private void prepText() {
        if (bold == null) bold = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD);
        paint.setStyle(Paint.Style.FILL); paint.setTypeface(bold); paint.setTextSize((float) fontPx); paint.setTextAlign(Paint.Align.CENTER);
    }
    @Override public void fillTextC(String s, double x, double y) {
        prepText(); Integer solid = fillGrad == null ? Integer.valueOf(fillArgb) : fillGrad.solid();
        if (solid != null) applyAlpha(solid); else { paint.setShader(fillGrad.shader()); paint.setAlpha(Math.round(255f * (float) clamp01(alpha))); }
        paint.getFontMetrics(fm);
        cv.drawText(s, (float) x, (float) (y - (fm.ascent + fm.descent) / 2.0), paint);
        paint.setTextAlign(Paint.Align.LEFT);
    }
    @Override public double measureText(String s) { prepText(); double w = paint.measureText(s); paint.setTextAlign(Paint.Align.LEFT); return w; }

    @Override public SceneCv.Grad linear(double x0, double y0, double x1, double y1) { return new Gr(false, x0, y0, 0, x1, y1, 0); }
    @Override public SceneCv.Grad radial(double x0, double y0, double r0, double x1, double y1, double r1) { return new Gr(true, x0, y0, r0, x1, y1, r1); }

    private static Bitmap bmpOf(SceneCv.Img i) { return i instanceof ALayer ? ((ALayer) i).bmp : ((AImg) i).bmp; }
    @Override public void drawImage(SceneCv.Img img, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
        Bitmap b = bmpOf(img); if (b == null || b.isRecycled()) return;
        srcI.set((int) Math.round(sx), (int) Math.round(sy), (int) Math.round(sx + sw), (int) Math.round(sy + sh));
        dstF.set((float) dx, (float) dy, (float) (dx + dw), (float) (dy + dh));
        paint.setShader(null); paint.setStyle(Paint.Style.FILL); paint.setColor(0xFF000000); paint.setAlpha(Math.round(255f * (float) clamp01(alpha)));
        cv.drawBitmap(b, srcI, dstF, paint);
    }
    @Override public void drawImage(SceneCv.Img img, double dx, double dy, double dw, double dh) {
        Bitmap b = bmpOf(img); if (b == null || b.isRecycled()) return;
        drawImage(img, 0, 0, b.getWidth(), b.getHeight(), dx, dy, dw, dh);
    }
    @Override public SceneCv.Layer newLayer(double w, double h, double dpr) { return new ALayer(w, h, dpr); }
}
