package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Random;

/**
 * 네이티브 장면의 운전석 — 그림(SceneCore)·도화지(AndroidCv)·스프라이트·진동·손가락을 한데 묶는다. 안드로이드 전용(android.*).
 *
 *   엔진(워커 /scene) ──JSON──▶ 앱(JS) ──apply──▶ SceneDriver ──▶ SceneCore(그림·움직임, 순수 자바)
 *                                                      │                └─▶ SceneCv ─▶ AndroidCv ─▶ Compose Canvas 의 nativeCanvas(GPU)
 *                                                      └─▶ 진동(SceneHaptics 무늬 → VibrationEffect)
 *   이 클래스는 아무것도 '판단'하지 않는다. 엔진이 정한 장면(mode·look·cast·traits)을 SceneCore 에 넘기고, 프레임 시계(Compose)가 알려 주는 시각마다
 *   update → draw 를 부를 뿐이다. 모든 호출은 메인 스레드에서(Compose 프레임 콜백·터치·Capacitor 플러그인 모두 메인).
 *
 * 프레임 정책: 손가락이 닿았거나 잡아 끌거나 놓은 뒤 착륙 연출 중(core.interactive)이면 화면 주사율 그대로(최대 120Hz),
 *   그 밖(걷고 노는 평소)에는 60Hz 로 아껴 배터리를 지킨다.
 */
public final class SceneDriver implements SceneCore.Host {

    public interface Listener {
        /** 스프라이트 읽기가 끝났다(그릴 준비 완료). */
        void onReady();
        /** 읽기·그리기에 실패했다 → 앱은 웹 캔버스로 돌아간다. */
        void onError(String message);
        /** 캐릭터를 꾹 눌러 잡았다 → 아래 웹뷰의 손가락 동작(스크롤)을 취소해야 한다. */
        void onHeld();
        /** 주사율을 끝까지 쓸지 바뀌었다. */
        void onHot(boolean hot);
    }

    private static final String[] IDS = SceneModel.ORDER;
    private static final String DIR = "public/chars3d/";

    private final Context ctx;
    private final Listener ls;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final SceneCore core;
    private final AndroidCv acv;
    private final HashMap<String, AndroidCv.AImg> sheets = new HashMap<>();
    private AndroidCv.AImg intro;
    private volatile boolean loaded;
    private boolean loading, destroyed, errored, hotNow, haptics = true;
    private volatile boolean paused;                 // 숨어 있는 동안: 프레임 시계는 그대로 두고 움직임 계산·그리기만 쉰다(숨김/표시를 되풀이해도 Compose 를 다시 만들지 않는다)
    private volatile long frameAt = SystemClock.uptimeMillis();   // 프레임 시계가 마지막으로 불린 시각(죽었는지 확인용)
    private float density = 1f;
    private int pxW, pxH;
    private long lastNanos;
    private Vibrator vib;
    private Typeface bold;
    private final Paint tagBg = new Paint(Paint.ANTI_ALIAS_FLAG), tagTx = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint.FontMetrics fm = new Paint.FontMetrics();

    public SceneDriver(Context context, Listener listener) {
        ctx = context.getApplicationContext() != null ? context.getApplicationContext() : context; ls = listener;
        acv = new AndroidCv(new Canvas());
        final Random rnd = new Random();
        core = new SceneCore(this, acv, new SceneUtil.Rng() { @Override public double next() { return rnd.nextDouble(); } });
    }

    // ───────────── 스프라이트(webp 시트) 읽기: 백그라운드, 끝나면 메인에서 장면을 이어서 그린다 ─────────────
    public void load() {
        if (loaded || loading || destroyed) return;
        loading = true;
        new Thread(new Runnable() {
            @Override public void run() {
                final HashMap<String, Bitmap> got = new HashMap<>(); Bitmap in2 = null; String why = null;
                try {
                    for (String id : IDS) got.put(id, decode(DIR + id + ".webp"));
                    in2 = decode(DIR + "dudung_intro.webp");
                } catch (Throwable t) { why = String.valueOf(t); }
                final Bitmap introBmp = in2; final String err = why;
                ui.post(new Runnable() {
                    @Override public void run() {
                        loading = false;
                        if (destroyed) { for (Bitmap b : got.values()) if (b != null) b.recycle(); if (introBmp != null) introBmp.recycle(); return; }
                        if (err != null || introBmp == null) { fail("스프라이트를 못 읽었다: " + err); return; }
                        for (java.util.Map.Entry<String, Bitmap> e : got.entrySet()) sheets.put(e.getKey(), new AndroidCv.AImg(e.getValue()));
                        intro = new AndroidCv.AImg(introBmp);
                        loaded = true;
                        try { core.apply(core.last()); } catch (RuntimeException e) { fail("장면을 못 만들었다: " + e); return; }
                        ls.onReady();
                    }
                });
            }
        }, "scene-native-load").start();
    }
    private Bitmap decode(String path) throws java.io.IOException {
        InputStream in = ctx.getAssets().open(path);
        try {
            BitmapFactory.Options o = new BitmapFactory.Options(); o.inScaled = false; o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap b = BitmapFactory.decodeStream(in, null, o);
            if (b == null) throw new java.io.IOException(path + " 를 해석하지 못했다");
            return b;
        } finally { in.close(); }
    }
    public boolean isLoaded() { return loaded; }

    private void fail(String msg) {
        if (errored) return;
        errored = true; try { ls.onError(msg); } catch (RuntimeException e) { /* 알림 실패는 무시 */ }
    }

    // ───────────── 엔진 답 · 크기 · 테마 ─────────────
    /** 칸 크기(dp)·화면 밀도·테마. 바뀌었으면 같은 장면을 새 크기로 다시 만든다. */
    public void layout(double wDp, double hDp, float dens, boolean dark) {
        density = dens > 0 ? dens : 1f; pxW = (int) Math.round(wDp * density); pxH = (int) Math.round(hDp * density);
        try { core.layout(wDp, hDp, density, dark); } catch (RuntimeException e) { fail("배치 실패: " + e); }
    }
    /** 엔진이 보낸 /scene 답(JSON 글자 그대로). mode 가 없으면 장면이 멈춘다. */
    public boolean apply(String json) {
        try {
            SceneModel.Res r = SceneModel.parse(json);
            boolean on = core.apply(r);
            lastNanos = 0;
            return on;
        } catch (RuntimeException e) { fail("엔진 답을 못 읽었다: " + e); return false; }
    }
    public void stop() { core.stop(); lastNanos = 0; setHot(false); }
    public boolean isRunning() { return core.isRunning(); }
    public String mode() { return core.mode(); }
    public void setHaptics(boolean on) { haptics = on; }
    /** 숨는 동안 true. 풀면 다음 프레임부터 이어서 움직인다(시간 점프 없이 새로 시작). */
    public void setPaused(boolean p) { paused = p; lastNanos = 0; if (p) setHot(false); }
    public boolean isPaused() { return paused; }
    /** 프레임 시계가 마지막으로 불린 뒤 지난 ms. 크면 시계(Compose)가 죽은 것이다. */
    public long frameAgeMs() { return SystemClock.uptimeMillis() - frameAt; }
    /** 시계를 새로 만들었을 때(재생성) 나이를 0 으로 되돌린다. */
    public void touchClock() { frameAt = SystemClock.uptimeMillis(); }
    public SceneCore core() { return core; }

    // ───────────── 프레임 ─────────────
    /** Compose 프레임 시계가 부른다. 다시 그려야 하면 true. */
    public boolean frame(long nanos) {
        frameAt = SystemClock.uptimeMillis();
        if (paused || !core.isRunning() || !loaded) { lastNanos = 0; return false; }
        boolean hot = core.interactive();
        if (hot != hotNow) setHot(hot);
        if (lastNanos == 0) { lastNanos = nanos; return true; }
        double dt = (nanos - lastNanos) / 1e9;
        if (!hot && dt < 0.014) return false;                 // 평소엔 60Hz: 120Hz 화면이면 두 프레임에 한 번
        lastNanos = nanos;
        try { core.update(Math.min(dt, .1)); } catch (RuntimeException e) { fail("움직임 계산 실패: " + e); return false; }
        if (core.error != null) fail("그리기 실패: " + core.error);
        return true;
    }
    private void setHot(boolean hot) {
        if (hot == hotNow) return; hotNow = hot;
        try { ls.onHot(hot); } catch (RuntimeException e) { /* 무시 */ }
    }

    /** Compose Canvas 의 nativeCanvas 위에(픽셀 좌표, 맨 왼쪽 위가 장면 왼쪽 위) 한 프레임을 그린다. */
    public void draw(Canvas c) {
        if (!loaded) return;
        try { acv.begin(c); core.render(acv); drawTag(c, density); }
        catch (RuntimeException e) { fail("그리기 실패: " + e); }
    }

    /** 웹에서는 호스트 div 의 .cs-tag 가 하던 것: 장면 왼쪽 위의 작은 알약 글씨. 장면 위를 DOM 이 못 덮으니 직접 그린다. */
    private void drawTag(Canvas c, float d) {
        String tag = core.tag(); if (tag == null || tag.isEmpty()) return;
        if (bold == null) bold = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD);
        tagTx.setTypeface(bold); tagTx.setTextSize(10.5f * d); tagTx.setColor(0xFFFFFFFF); tagTx.setTextAlign(Paint.Align.LEFT);
        tagBg.setStyle(Paint.Style.FILL); tagBg.setColor(0x8C0C1222);                        // rgba(12,18,34,.55)
        tagTx.getFontMetrics(fm);
        float w = tagTx.measureText(tag) + 18f * d, h = (fm.descent - fm.ascent) + 6f * d, x = 8f * d, y = 7f * d, r = Math.min(10f * d, h / 2f);
        c.drawRoundRect(x, y, x + w, y + h, r, r, tagBg);
        c.drawText(tag, x + 9f * d, y + 3f * d - fm.ascent, tagTx);
    }

    /** 지금 그림을 작은 비트맵으로 찍는다(스크롤·팝업 때 웹이 정지 사진으로 깔아 둘 것). scale 은 화면 픽셀 대비 배율. */
    public Bitmap snapshot(float scale) {
        if (!loaded || pxW < 2 || pxH < 2) return null;
        int w = Math.max(1, Math.round(pxW * scale)), h = Math.max(1, Math.round(pxH * scale));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b); c.scale(scale, scale);
        AndroidCv cv = new AndroidCv(c);
        core.render(cv); drawTag(c, density);
        return b;
    }

    // ───────────── 손가락(화면 픽셀, 장면 왼쪽 위 기준) ─────────────
    public boolean touchDown(float xPx, float yPx) { return core.isRunning() && core.down(xPx / density, yPx / density); }
    public void touchMove(float xPx, float yPx) { core.move(xPx / density, yPx / density); }
    public void touchUp() { core.up(); }
    public boolean isHeld() { return core.isHeld(); }
    public boolean isPending() { return core.isPending(); }

    // ───────────── SceneCore.Host ─────────────
    @Override public SceneCv.Img sheet(String id) { return sheets.get(id); }
    @Override public SceneCv.Img intro() { return intro; }
    @Override public boolean ready() { return loaded; }
    @Override public void held() { try { ls.onHeld(); } catch (RuntimeException e) { /* 무시 */ } }
    @Override public void haptic(String name) {
        if (!haptics) return;
        SceneHaptics.Pat p = SceneHaptics.get(name); if (p == null) return;
        try {
            if (vib == null) vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (vib == null || !vib.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(p.timings, p.amps, -1));
            else vib.vibrate(p.timings, -1);
        } catch (RuntimeException e) { /* 진동 권한·기기 문제는 그림에 영향 없다 */ }
    }

    public void destroy() {
        destroyed = true; core.stop();
        for (AndroidCv.AImg i : sheets.values()) { try { i.bmp.recycle(); } catch (RuntimeException e) { /* 이미 해제 */ } }
        sheets.clear(); if (intro != null) { try { intro.bmp.recycle(); } catch (RuntimeException e) { /* 이미 해제 */ } intro = null; }
        loaded = false;
    }
}
