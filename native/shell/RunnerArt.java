package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.InputStream;
import java.lang.ref.SoftReference;
import java.util.HashMap;
import java.util.Map;

/**
 * 뛰어가는 캐릭터 시트(assets/chars3d/<id>.webp · 두덩은 dudung_intro.webp 가 하나 더, 256px 칸 4×4)를 뒤 스레드에서 읽어 쥔다(2026-10-22 s133).
 * 메모리가 모자라면 시스템이 버릴 수 있게 SoftReference 로 쥔다(버려지면 다시 읽는다). get() 은 주 스레드에서 불러도 막히지 않는다(없으면 null).
 */
final class RunnerArt {
    private RunnerArt() {}

    interface Ready { void onSheet(); }
    private static final Map<String, SoftReference<Bitmap>> M = new HashMap<String, SoftReference<Bitmap>>();
    private static final java.util.HashSet<String> LOADING = new java.util.HashSet<String>();

    static synchronized Bitmap get(String key) {
        SoftReference<Bitmap> r = M.get(key);
        Bitmap b = r == null ? null : r.get();
        return b != null && !b.isRecycled() ? b : null;
    }
    static boolean has(String key) { return get(key) != null; }

    /** 처음 보일 캐릭터(first)를 맨 먼저, 이어서 나머지를 뒤 스레드에서 읽는다. 하나 읽을 때마다 주 스레드에서 cb 를 부른다. */
    static void warm(final Context ctx, final String first, final android.os.Handler main, final Ready cb) {
        final Context app = ctx.getApplicationContext();
        final java.util.ArrayList<String> keys = new java.util.ArrayList<String>();
        if (first != null) keys.add(first);
        for (String s : RunnerCore.ORDER) if (!keys.contains(s)) keys.add(s);
        keys.add("dudung_intro");
        for (String k : keys) {
            synchronized (RunnerArt.class) { if (has(k) || LOADING.contains(k)) continue; LOADING.add(k); }
            final String key = k;
            new Thread(new Runnable() { @Override public void run() {
                Bitmap b = null;
                try {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    InputStream in = app.getAssets().open("chars3d/" + Chars.file(key) + ".webp");       // 뽀송은 지금 신은 신발 시트
                    try { b = BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
                } catch (Throwable ignored) { b = null; }
                synchronized (RunnerArt.class) { LOADING.remove(key); if (b != null) M.put(key, new SoftReference<Bitmap>(b)); }
                if (b != null && cb != null && main != null) main.post(new Runnable() { @Override public void run() { cb.onSheet(); } });
            } }, "shell-runner-art").start();
        }
    }
    static synchronized void release() { M.clear(); }
}
