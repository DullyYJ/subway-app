package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 마커 사진 자르기 화면: 고른 사진 위에 동그라미를 겹쳐 두고, 사진을 끌어 옮기고 두 손가락으로 확대·축소해 보일 부분을 맞춘다.
 * [적용] 을 누르면 동그라미 안쪽만 둥근 그림(MarkerPhoto.OUT 한 변)으로 잘라 돌려준다. 계산은 MarkerCropCore.
 */
final class MarkerCropDialog {
    private MarkerCropDialog() { }

    interface Done { void ok(Bitmap circle); }

    static void show(final Activity a, final Bitmap src, final float dpr, final Done done) {
        if (a.isFinishing() || a.isDestroyed() || src == null) return;
        final Dialog d = new Dialog(a, android.R.style.Theme_Material_NoActionBar);
        final CropView cv = new CropView(a, src, dpr);
        FrameLayout root = new FrameLayout(a);
        root.setBackgroundColor(0xFF000000);
        root.addView(cv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        TextView tip = new TextView(a);
        tip.setText("보이게 할 부분을 동그라미에 맞춰 주세요\n끌어서 옮기고, 두 손가락으로 크기를 바꿔요");
        tip.setTextColor(0xFFFFFFFF); tip.setTextSize(14f); tip.setGravity(Gravity.CENTER); tip.setLineSpacing(0f, 1.25f);
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        tp.topMargin = Math.round(40f * dpr); tp.leftMargin = tp.rightMargin = Math.round(20f * dpr);
        root.addView(tip, tp);
        LinearLayout row = new LinearLayout(a);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(button(a, "취소", false, dpr, new View.OnClickListener() { @Override public void onClick(View v) { d.dismiss(); } }), new LinearLayout.LayoutParams(0, Math.round(50f * dpr), 1f));
        View gap = new View(a);
        row.addView(gap, new LinearLayout.LayoutParams(Math.round(12f * dpr), 1));
        row.addView(button(a, "적용", true, dpr, new View.OnClickListener() { @Override public void onClick(View v) {
            Bitmap out = cv.result();
            d.dismiss();
            if (out != null && done != null) done.ok(out);
        } }), new LinearLayout.LayoutParams(0, Math.round(50f * dpr), 1f));
        FrameLayout.LayoutParams rp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        rp.leftMargin = rp.rightMargin = Math.round(20f * dpr); rp.bottomMargin = Math.round(28f * dpr);
        root.addView(row, rp);
        d.setContentView(root);
        d.setCancelable(true);
        try { d.getWindow().setBackgroundDrawable(new ColorDrawable(0xFF000000)); d.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT); } catch (Throwable ignored) { }
        try { d.show(); } catch (Throwable ignored) { }
    }

    private static TextView button(Context c, String s, boolean gold, float dpr, View.OnClickListener l) {
        TextView t = new TextView(c);
        t.setText(s); t.setTextSize(16f); t.setGravity(Gravity.CENTER); t.setTypeface(null, android.graphics.Typeface.BOLD);
        t.setTextColor(gold ? 0xFF121214 : 0xFFFFFFFF);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(12f * dpr);
        g.setColor(gold ? 0xFFD4AF37 : 0xFF2C2C2E);
        t.setBackground(g);
        t.setOnClickListener(l);
        return t;
    }

    /** 사진 + 동그라미. 끌기 · 두 손가락 확대 · 가장자리는 MarkerCropCore.clamp 로 막는다. */
    private static final class CropView extends View {
        private final Bitmap src;
        private final float dpr;
        private final Paint pImg = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint pDim = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint pRing = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path dim = new Path();
        private final Matrix mx = new Matrix();
        private final ScaleGestureDetector sg;
        private float cx, cy, rad, s, px, py;
        private boolean ready;
        private float lastX, lastY;
        private int lastN;

        CropView(Context c, Bitmap b, float dpr) {
            super(c);
            this.src = b; this.dpr = dpr;
            pDim.setColor(0xB3000000); pDim.setStyle(Paint.Style.FILL);
            pRing.setColor(0xFFFFFFFF); pRing.setStyle(Paint.Style.STROKE); pRing.setStrokeWidth(2f * dpr);
            sg = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScale(ScaleGestureDetector d) {
                    if (!ready) return true;
                    float[] z = MarkerCropCore.zoomAbout(s, px, py, s * d.getScaleFactor(), d.getFocusX(), d.getFocusY());
                    apply(MarkerCropCore.clamp(src.getWidth(), src.getHeight(), cx, cy, rad, z[0], z[1], z[2]));
                    return true;
                }
            });
        }

        private void apply(float[] v) { s = v[0]; px = v[1]; py = v[2]; invalidate(); }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            if (w <= 0 || h <= 0) return;
            cx = w / 2f; cy = h / 2f; rad = Math.min(w, h) * 0.38f;
            float[] v = ready ? MarkerCropCore.clamp(src.getWidth(), src.getHeight(), cx, cy, rad, s, px, py) : MarkerCropCore.initial(src.getWidth(), src.getHeight(), cx, cy, rad);
            ready = true;
            apply(v);
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            if (!ready) return true;
            sg.onTouchEvent(e);
            int n = e.getPointerCount();
            float mxp = 0f, myp = 0f;
            for (int i = 0; i < n; i++) { mxp += e.getX(i); myp += e.getY(i); }
            mxp /= n; myp /= n;
            int act = e.getActionMasked();
            if (act == MotionEvent.ACTION_DOWN || act == MotionEvent.ACTION_POINTER_DOWN || act == MotionEvent.ACTION_POINTER_UP) { lastX = mxp; lastY = myp; lastN = n; return true; }
            if (act == MotionEvent.ACTION_MOVE && n == lastN && !sg.isInProgress()) {
                apply(MarkerCropCore.clamp(src.getWidth(), src.getHeight(), cx, cy, rad, s, px + (mxp - lastX), py + (myp - lastY)));
            } else if (act == MotionEvent.ACTION_MOVE && sg.isInProgress()) {
                apply(MarkerCropCore.clamp(src.getWidth(), src.getHeight(), cx, cy, rad, s, px + (mxp - lastX), py + (myp - lastY)));
            }
            lastX = mxp; lastY = myp; lastN = n;
            return true;
        }

        @Override protected void onDraw(Canvas cv) {
            if (!ready) return;
            mx.reset();
            mx.postTranslate(-src.getWidth() / 2f, -src.getHeight() / 2f);
            mx.postScale(s, s);
            mx.postTranslate(px, py);
            cv.drawBitmap(src, mx, pImg);
            dim.rewind();
            dim.setFillType(Path.FillType.EVEN_ODD);
            dim.addRect(0f, 0f, getWidth(), getHeight(), Path.Direction.CW);
            dim.addCircle(cx, cy, rad, Path.Direction.CW);
            cv.drawPath(dim, pDim);
            cv.drawCircle(cx, cy, rad, pRing);
        }

        /** 동그라미 안쪽만 둥글게 잘라 MarkerPhoto.OUT 한 변의 그림으로. */
        Bitmap result() {
            try {
                float[] c = MarkerCropCore.srcCircle(src.getWidth(), src.getHeight(), cx, cy, rad, s, px, py);
                int out = MarkerPhoto.OUT;
                Bitmap b = Bitmap.createBitmap(out, out, Bitmap.Config.ARGB_8888);
                Canvas cc = new Canvas(b);
                BitmapShader sh = new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
                Matrix m = new Matrix();
                float k = out / (2f * c[2]);
                m.postTranslate(-c[0], -c[1]);
                m.postScale(k, k);
                m.postTranslate(out / 2f, out / 2f);
                sh.setLocalMatrix(m);
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
                p.setShader(sh);
                cc.drawCircle(out / 2f, out / 2f, out / 2f, p);
                return b;
            } catch (Throwable t) { return null; }
        }
    }
}
