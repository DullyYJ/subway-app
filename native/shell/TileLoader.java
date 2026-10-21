package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 지도 타일 받아 두기(안드로이드 계층). 주소는 TileMapCore.tileUrl(OpenStreetMap 표준 타일)만 쓴다.
 * 메모리(LruCache) → 디스크(앱 캐시 폴더, 7일) → 네트워크 순서로 찾고, 새로 받으면 지켜보는 쪽(listener)에 알려 다시 그리게 한다.
 * OSM 타일 이용 규칙: 앱을 알리는 User-Agent 를 보내고, 받은 타일을 다시 받지 않게 캐시하며, 한 번에 많이 받지 않는다(동시 3개).
 */
final class TileLoader {
    private static final long DISK_MAX_AGE = 7L * 24L * 3600000L, RETRY_AFTER = 8000L; private static final int MAX_TRIES = 4;
    private static TileLoader inst;

    static synchronized TileLoader get(Context c) {
        if (inst == null) inst = new TileLoader(c.getApplicationContext());
        return inst;
    }

    private final File dir;
    private final LruCache<String, Bitmap> mem = new LruCache<String, Bitmap>(96);
    private final HashSet<String> pending = new HashSet<String>();
    private final HashMap<String, Long> failedAt = new HashMap<String, Long>();
    private final HashMap<String, Integer> tries = new HashMap<String, Integer>();
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final java.util.ArrayList<Runnable> watchers = new java.util.ArrayList<Runnable>();

    private TileLoader(Context c) {
        dir = new File(c.getCacheDir(), "tiles");
        if (!dir.isDirectory()) dir.mkdirs();
    }

    void watch(Runnable r) { synchronized (watchers) { if (!watchers.contains(r)) watchers.add(r); } }
    void unwatch(Runnable r) { synchronized (watchers) { watchers.remove(r); } }
    private void notifyWatchers() {
        final Runnable[] rs;
        synchronized (watchers) { rs = watchers.toArray(new Runnable[0]); }
        main.post(new Runnable() { @Override public void run() { for (Runnable r : rs) { try { r.run(); } catch (Throwable ignored) { } } } });
    }

    /** 지금 있는 타일(없으면 null — 받기를 시작하고, 오면 watch 로 알린다). 주 스레드에서 부른다. */
    Bitmap peek(int z, int x, int y) {
        final String url = TileMapCore.tileUrl(z, x, y);
        if (url == null) return null;
        final String key = z + "_" + x + "_" + y;
        Bitmap b = mem.get(key);
        if (b != null) return b;
        synchronized (pending) {
            if (pending.contains(key)) return null;
            Long f = failedAt.get(key);
            Integer nt = tries.get(key);
            if (f != null && System.currentTimeMillis() - f < (nt != null && nt >= MAX_TRIES ? 60000L : RETRY_AFTER)) return null;          // 몇 번 안 되면 한참 뒤에야 다시(배터리 · 데이터)
            pending.add(key);
        }
        pool.execute(new Runnable() { @Override public void run() { load(key, url); } });
        return null;
    }

    private void load(String key, String url) {
        Bitmap b = null;
        try {
            File f = new File(dir, key + ".png");
            if (f.isFile() && System.currentTimeMillis() - f.lastModified() < DISK_MAX_AGE) b = BitmapFactory.decodeFile(f.getAbsolutePath());
            if (b == null) {
                byte[] data = fetch(url);
                if (data != null) {
                    b = BitmapFactory.decodeByteArray(data, 0, data.length);
                    if (b != null) { try { FileOutputStream os = new FileOutputStream(f); try { os.write(data); } finally { os.close(); } } catch (Throwable ignored) { } }
                }
            }
        } catch (Throwable ignored) { b = null; }
        boolean again = false;
        synchronized (pending) {
            pending.remove(key);
            if (b == null) {
                failedAt.put(key, System.currentTimeMillis());
                Integer n = tries.get(key); n = n == null ? 1 : n + 1; tries.put(key, n);
                again = n <= MAX_TRIES;
            } else tries.remove(key);
        }
        if (b != null) { mem.put(key, b); notifyWatchers(); }
        else if (again) main.postDelayed(new Runnable() { @Override public void run() { notifyWatchers(); } }, RETRY_AFTER + 500L);          // 받지 못한 타일은 잠시 뒤 다시 그리면서 다시 받는다(몇 번만)
    }

    private static byte[] fetch(String url) {
        if (!url.startsWith("https://tile.openstreetmap.org/")) return null;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(5000); c.setReadTimeout(8000);
            c.setRequestProperty("User-Agent", "Gildongmu/1.0 (Android; subway app)");
            if (c.getResponseCode() != 200) return null;
            InputStream is = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n, total = 0;
            while ((n = is.read(buf)) > 0) { total += n; if (total > 200000) return null; bo.write(buf, 0, n); }
            is.close();
            return bo.toByteArray();
        } catch (Throwable t) { return null; } finally { if (c != null) c.disconnect(); }
    }
}
