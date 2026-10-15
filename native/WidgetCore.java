package com.dullyyj.subway;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.TypedValue;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * 캐릭터 시계 위젯 본체 (2026-10-15 YJ: 가로형·세로형 × 블랙·화이트, 시계 주변을 캐릭터가 돌아다니고, 출퇴근 시각이 되면 시계 앞에서 응원·위로 + [출근하기]/[퇴근하기]).
 *
 *  ■ 배터리 — 평소엔 아무것도 돌지 않는다.
 *    · 시계 글자는 시스템 TextClock(분이 바뀌어도 우리가 깨어 있을 필요 없음).
 *    · 캐릭터 그림은 '화면이 켜졌을 때(켜짐·잠금해제·위젯 탭·런처 갱신) 잠깐(BURST_MS)'만 FRAME_MS 간격으로 갈아 끼우고, 끝나면 바닥에서 쉬는 자세로 멈춘다. 화면이 꺼지면 즉시 멈춘다.
 *    · 출퇴근 시각은 정확 알람(AlarmManager) 한 번 — 계속 시간을 확인하는 루프는 없다.
 *  ■ 계산은 엔진이 한다 — 응원·위로 말은 엔진(/widget-say)이 요일·공휴일·날씨·공지를 보고 고른다. 여기선 받아서 말풍선에 그린다.
 *    (엔진에 닿지 않으면 짧은 기본 문구를 쓴다 — 그림 위에 얹는 글일 뿐이다.) 출퇴근 경로 탐색도 앱을 열어 엔진에 묻는다.
 *  ■ 움직임·배치는 WidgetSim/WidgetGeo/WidgetArt(안드로이드와 무관한 순수 코드, 이 PC에서 시험)이고 여기는 그걸 비트맵·RemoteViews 로 옮기는 접착제다.
 */
public final class WidgetCore {
    private WidgetCore() { }

    public static final String PREFS = "gdm_widget";
    public static final String ACTION_POKE = "com.dullyyj.subway.WIDGET_POKE";
    public static final String ACTION_TICK = "com.dullyyj.subway.WIDGET_TICK";
    public static final String EXTRA_GO = "gdm_widget_go";
    static final long BURST_MS = 45000L, FRAME_MS = 100L;
    /** 출퇴근 버튼은 '처음 보인 때'부터 3분만 떠 있고, 안 누르면 다시 시계로 돌아간다. 보이기 전(화면이 꺼져 있던 동안)에는 시작 시각 +90분까지 기다린다. */
    static final long SHOW_MS = 3L * 60000L, WAIT_MS = 90L * 60000L;
    static final String ENGINE = "https://route-v2.phg0643.workers.dev";

    // ───────── 저장값 ─────────
    static SharedPreferences sp(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    public static final class Cfg {
        public boolean on, mOn = true, eOn = true; public String morn = "07:30", eve = "18:30"; public boolean[] days = new boolean[7];
        public double mLat, mLng, eLat, eLng; public boolean hasM, hasE;
    }
    public static Cfg cfg(Context c) {
        Cfg f = new Cfg();
        try {
            JSONObject j = new JSONObject(sp(c).getString("cfg", "{}"));
            f.on = j.optBoolean("on", false); f.mOn = j.optBoolean("mOn", true); f.eOn = j.optBoolean("eOn", true); f.morn = j.optString("morn", "07:30"); f.eve = j.optString("eve", "18:30");
            JSONArray d = j.optJSONArray("days");
            if (d == null || d.length() == 0) { for (int i = 0; i < 7; i++) f.days[i] = true; }
            else for (int i = 0; i < d.length(); i++) { int v = d.optInt(i, -1); if (v >= 0 && v < 7) f.days[v] = true; }
            if (j.has("mLat") && j.has("mLng")) { f.mLat = j.optDouble("mLat"); f.mLng = j.optDouble("mLng"); f.hasM = true; }
            if (j.has("eLat") && j.has("eLng")) { f.eLat = j.optDouble("eLat"); f.eLng = j.optDouble("eLng"); f.hasE = true; }
        } catch (Exception ignored) { }
        return f;
    }
    public static void setConfigJson(Context c, String json) {
        sp(c).edit().putString("cfg", json == null ? "{}" : json).apply();
        scheduleNext(c); evalScene(c); refreshAll(c, true); wake(c, "cfg");
    }
    static int hm(String s, int def) {
        try { String[] p = s.split(":"); return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim()); } catch (Exception e) { return def; }
    }
    static String ymd(Calendar cal) { return cal.get(Calendar.YEAR) * 10000 + (cal.get(Calendar.MONTH) + 1) * 100 + cal.get(Calendar.DAY_OF_MONTH) + ""; }
    static long startMs(Calendar base, int minutes) {
        Calendar c = (Calendar) base.clone(); c.set(Calendar.HOUR_OF_DAY, minutes / 60); c.set(Calendar.MINUTE, minutes % 60); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    // ───────── 출퇴근 장면 ─────────
    public static final class Scene { public String kind = "", key = "", say1 = "", say2 = "", mood = "cheer", btn = ""; public long until; public boolean fetched; }
    public static Scene scene(Context c) {
        SharedPreferences p = sp(c); Scene s = new Scene();
        s.kind = p.getString("scKind", ""); s.key = p.getString("scKey", ""); s.say1 = p.getString("scSay1", ""); s.say2 = p.getString("scSay2", "");
        s.mood = p.getString("scMood", "cheer"); s.btn = p.getString("scBtn", ""); s.until = p.getLong("scUntil", 0L); s.fetched = p.getBoolean("scFetched", false);
        return s;
    }
    static void clearScene(Context c) {
        sp(c).edit().remove("scKind").remove("scKey").remove("scSay1").remove("scSay2").remove("scMood").remove("scBtn").remove("scUntil").remove("scFetched").remove("scShown").apply();
    }
    /** 오늘 지금 보여야 할 출퇴근 장면이 있으면 시작하고, 끝난 장면은 치운다. 알람·위젯 갱신·화면 켜짐·탭 때 부른다. */
    public static void evalScene(Context c) {
        Cfg f = cfg(c);
        Scene cur = scene(c); long now = System.currentTimeMillis();
        if (cur.kind.length() > 0 && now >= cur.until) { sp(c).edit().putString("lastDone", cur.key).apply(); clearScene(c); cur = scene(c); }   // 안 눌렀어도 끝난 장면은 다시 안 띄운다
        if (!f.on || (cur.kind.equals("morn") && !f.mOn) || (cur.kind.equals("eve") && !f.eOn)) { if (cur.kind.length() > 0) clearScene(c); if (!f.on) return; cur = scene(c); }
        Calendar cal = Calendar.getInstance();
        if (!f.days[cal.get(Calendar.DAY_OF_WEEK) - 1]) { if (cur.kind.length() > 0 && !cur.key.startsWith(ymd(cal))) clearScene(c); return; }
        String lastDone = sp(c).getString("lastDone", "");
        String best = null; long bestStart = 0;
        for (int k = 0; k < 2; k++) {
            String kind = k == 0 ? "morn" : "eve";
            if (k == 0 ? !f.mOn : !f.eOn) continue;          // 장소가 없는 쪽은 장면을 만들지 않는다(눌러도 갈 곳이 없다)
            long st = startMs(cal, hm(k == 0 ? f.morn : f.eve, k == 0 ? 450 : 1110));
            String key = ymd(cal) + kind;
            if (now >= st && now < st + WAIT_MS && !key.equals(lastDone) && st >= bestStart) { best = kind; bestStart = st; }
        }
        if (best != null && !(cur.kind.equals(best) && cur.key.equals(ymd(cal) + best))) startScene(c, best, bestStart);
    }
    static void startScene(final Context c, final String kind, long startAt) {
        Calendar cal = Calendar.getInstance();
        final String key = ymd(cal) + kind;
        long until = startAt + WAIT_MS;
        SharedPreferences.Editor e = sp(c).edit();
        e.putString("scKind", kind).putString("scKey", key).putLong("scUntil", until).putLong("scShown", 0L).putBoolean("scFetched", false).putString("scMood", "cheer");
        e.putString("scBtn", "morn".equals(kind) ? "출근하기" : "퇴근하기");
        e.putString("scSay1", "morn".equals(kind) ? "오늘도 화이팅!" : "오늘도 수고 많았어요").putString("scSay2", "");     // 엔진 응답 전·실패 때의 기본 문구
        e.apply();
        fetchSay(c, kind, key);
    }
    static void fetchSay(final Context c, final String kind, final String key) {
        final Cfg f = cfg(c);
        new Thread(new Runnable() { @Override public void run() {
            HttpURLConnection h = null;
            try {
                StringBuilder u = new StringBuilder(ENGINE + "/widget-say?kind=" + kind + "&baseMs=" + System.currentTimeMillis());
                boolean m = "morn".equals(kind);
                if (m ? f.hasM : f.hasE) u.append("&lat=").append(m ? f.mLat : f.eLat).append("&lng=").append(m ? f.mLng : f.eLng);
                h = (HttpURLConnection) new URL(u.toString()).openConnection();
                h.setConnectTimeout(4000); h.setReadTimeout(5000);
                InputStream in = h.getInputStream();
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] b = new byte[2048]; int n;
                while ((n = in.read(b)) > 0 && bo.size() < 65536) bo.write(b, 0, n);
                in.close();
                final JSONObject j = new JSONObject(new String(bo.toByteArray(), "UTF-8"));
                if (!j.optBoolean("ok", false)) return;
                JSONArray say = j.optJSONArray("say");
                final String s1 = say != null && say.length() > 0 ? say.optString(0, "") : "", s2 = say != null && say.length() > 1 ? say.optString(1, "") : "";
                final String mood = j.optString("mood", "cheer"), btn = j.optString("btn", ""); final int valid = j.optInt("validMin", 90);
                if (s1.length() == 0) return;
                handler().post(new Runnable() { @Override public void run() {
                    Scene cur = scene(c);
                    if (!cur.key.equals(key)) return;                                      // 그새 끝났거나 다른 장면
                    SharedPreferences.Editor e = sp(c).edit();
                    e.putString("scSay1", s1).putString("scSay2", s2).putString("scMood", mood).putBoolean("scFetched", true);
                    if (btn.length() > 0) e.putString("scBtn", btn);
                    e.apply();
                    refreshAll(c, true); wake(c, "say");
                } });
            } catch (Exception ignored) {
            } finally { if (h != null) h.disconnect(); }
        } }, "gdm-widget-say").start();
    }
    /** 앱이 위젯 버튼으로 열렸다 — 그 장면은 끝낸 것으로 친다(다시 안 뜸). */
    public static void markDone(Context c, String kind) {
        Calendar cal = Calendar.getInstance();
        sp(c).edit().putString("lastDone", ymd(cal) + kind).apply();
        clearScene(c); refreshAll(c, true); scheduleNext(c);
    }

    /** 화면이 켜져 처음 장면이 보이는 순간부터 3분을 센다(그 전엔 기다린다). 3분이 지나면 알람이 장면을 치우고 시계로 돌려 놓는다. */
    static void armScene(Context c) {
        Scene cur = scene(c); if (cur.kind.length() == 0) return;
        SharedPreferences p = sp(c);
        if (p.getLong("scShown", 0L) != 0L) return;
        long now = System.currentTimeMillis();
        p.edit().putLong("scShown", now).putLong("scUntil", Math.min(cur.until, now + SHOW_MS)).apply();
        scheduleNext(c);
    }

    // ───────── 알람 ─────────
    /** 다음에 깨어날 때: 오늘·내일(선택 요일)의 출근/퇴근 시각, 진행 중인 장면의 끝. 정확 알람 하나만 걸어 둔다. */
    public static void scheduleNext(Context c) {
        Context a = c.getApplicationContext();
        AlarmManager am = (AlarmManager) a.getSystemService(Context.ALARM_SERVICE);
        Intent it = new Intent(a, GdmWidgetReceiver.class).setAction(ACTION_TICK);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(a, 7700, it, fl);
        if (am == null) return;
        am.cancel(pi);
        if (ids(a).length == 0) return;                          // 위젯이 하나도 없으면 알람도 없다
        Cfg f = cfg(a); long now = System.currentTimeMillis(), next = Long.MAX_VALUE;
        Scene s = scene(a); if (s.kind.length() > 0 && s.until > now) next = Math.min(next, s.until + 1000L);
        if (f.on) {
            Calendar cal = Calendar.getInstance();
            for (int d = 0; d < 8; d++) {
                Calendar day = (Calendar) cal.clone(); day.add(Calendar.DAY_OF_YEAR, d);
                if (!f.days[day.get(Calendar.DAY_OF_WEEK) - 1]) continue;
                long m = startMs(day, hm(f.morn, 450)), e = startMs(day, hm(f.eve, 1110));
                if (f.mOn && m > now + 1000L) next = Math.min(next, m);
                if (f.eOn && e > now + 1000L) next = Math.min(next, e);
            }
        }
        if (next == Long.MAX_VALUE) return;
        try {
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (Build.VERSION.SDK_INT >= 23) { if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); }
            else am.set(AlarmManager.RTC_WAKEUP, next, pi);
        } catch (Exception ex) {
            try { am.set(AlarmManager.RTC_WAKEUP, next, pi); } catch (Exception ignored) { }
        }
    }

    // ───────── 위젯 목록·크기 ─────────
    static final Class<?>[] PROVIDERS = { GdmWidgetHB.class, GdmWidgetHW.class, GdmWidgetVB.class, GdmWidgetVW.class };
    static int[] ids(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c.getApplicationContext());
        int[] all = new int[0];
        for (Class<?> k : PROVIDERS) {
            int[] x = m.getAppWidgetIds(new ComponentName(c.getApplicationContext(), k));
            int[] y = new int[all.length + x.length]; System.arraycopy(all, 0, y, 0, all.length); System.arraycopy(x, 0, y, all.length, x.length); all = y;
        }
        return all;
    }
    static boolean isVertical(String cls) { return cls.endsWith("VB") || cls.endsWith("VW"); }
    static boolean isDark(String cls) { return cls.endsWith("HB") || cls.endsWith("VB"); }

    // ───────── 인스턴스(위젯 하나) ─────────
    static final class Inst {
        int id; boolean vertical, dark; float wDp, hDp, den, S; WidgetGeo geo; WidgetSim sim; Bitmap bmp; Canvas cv; AndSurface surf; String[] chars; String cmode = "";
        float digitW, digitH, padL, padT, padTm; boolean measured;
    }
    static final Map<Integer, Inst> INST = new HashMap<Integer, Inst>();
    static Context app; static Handler hdl;
    static Handler handler() { if (hdl == null) hdl = new Handler(Looper.getMainLooper()); return hdl; }

    static Inst cached(Context c, int id) { Inst n = INST.get(id); return n != null ? n : inst(c, id); }
    static Inst inst(Context c, int id) {
        Context a = c.getApplicationContext(); app = a;
        AppWidgetManager m = AppWidgetManager.getInstance(a);
        String cls = "";
        try { android.appwidget.AppWidgetProviderInfo pi = m.getAppWidgetInfo(id); if (pi != null && pi.provider != null) cls = pi.provider.getClassName(); } catch (Exception ignored) { }
        boolean v = isVertical(cls), dark = isDark(cls);
        float den = a.getResources().getDisplayMetrics().density;
        float w = v ? 110f : 250f, h = v ? 250f : 110f;
        try {
            Bundle o = m.getAppWidgetOptions(id);
            boolean port = a.getResources().getConfiguration().orientation != Configuration.ORIENTATION_LANDSCAPE;
            float ww = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0), wm = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
            float hh = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0), hM = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            float cw = port ? ww : wm, ch = port ? hM : hh;
            if (cw > 40f) w = cw; if (ch > 40f) h = ch;
        } catch (Exception ignored) { }
        Inst in = INST.get(id);
        if (in != null && Math.abs(in.wDp - w) < 1f && Math.abs(in.hDp - h) < 1f && in.vertical == v && in.dark == dark) return in;
        Inst n = new Inst(); n.id = id; n.vertical = v; n.dark = dark; n.wDp = w; n.hDp = h; n.den = den;
        n.S = Math.min(den, 1.6f);
        n.geo = WidgetGeo.of(v, w, h);
        measureClock(n);
        n.chars = pickChars(id);
        n.sim = new WidgetSim(n.geo, System.nanoTime() ^ id, n.chars);
        int bw = Math.max(40, Math.round(w * n.S)), bh = Math.max(40, Math.round(h * n.S));
        n.bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888); n.cv = new Canvas(n.bmp); n.surf = new AndSurface(n.cv, n.S, n.geo);
        INST.put(id, n);
        return n;
    }
    /** 하루 동안은 같은 캐릭터 셋(위젯마다 다름), 다음 날 다시 뽑는다. */
    static String[] pickChars(int id) {
        Calendar cal = Calendar.getInstance();
        Random r = new Random(cal.get(Calendar.YEAR) * 1000L + cal.get(Calendar.DAY_OF_YEAR) + id * 7919L);
        java.util.List<String> pool = new java.util.ArrayList<String>(java.util.Arrays.asList(WidgetSim.ORDER));
        java.util.Collections.shuffle(pool, r);
        return new String[] { pool.get(0), pool.get(1), pool.get(2) };
    }
    /** 실제 글꼴로 시계 숫자 상자를 재서 배치를 맞춘다(기기 글꼴이 달라도 캐릭터가 시계에 정확히 걸리게). */
    /** 출퇴근 장면이면 시계를 줄이고, 아니면 원래대로(바뀌었을 때만 글꼴을 다시 잰다). */
    static void applyCommute(Inst n, boolean commute) {
        if (n.geo.commute == commute) return;
        n.geo.setCommute(commute);
        measureClock(n);
    }
    static void measureClock(Inst n) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        p.setTextSize(n.geo.textDp * n.den);
        Paint.FontMetrics fm = p.getFontMetrics();
        Rect b0 = new Rect(); p.getTextBounds("0", 0, 1, b0);
        float digH = -b0.top;
        if (!n.vertical) {
            Rect b = new Rect(); String t = "00:00"; p.getTextBounds(t, 0, t.length(), b);
            n.geo.measured(b.width() / n.den, digH / n.den, digH / n.den);
            n.padL = n.geo.clkL * n.den - b.left; n.digitW = b.width(); n.digitH = digH;
            n.padT = n.geo.clkT * n.den - (-fm.ascent - digH);
        } else {
            Rect b = new Rect(); p.getTextBounds("00", 0, 2, b);
            n.geo.measured(b.width() / n.den, digH / n.den * 2f + n.geo.textDp * 0.30f, digH / n.den);
            n.padL = n.geo.clkL * n.den - b.left; n.digitW = b.width(); n.digitH = digH;
            n.padT = n.geo.clkT * n.den - (-fm.ascent - digH);
            n.padTm = (n.geo.clkT + n.geo.lineH + n.geo.textDp * 0.30f) * n.den - (-fm.ascent - digH);
        }
        n.measured = true;
    }

    // ───────── 그리기(Canvas) ─────────
    static final Map<String, Bitmap> SHEETS = new HashMap<String, Bitmap>();
    static Bitmap sheet(String id, int cellPx) {
        String key = id + "@" + cellPx;
        Bitmap b = SHEETS.get(key);
        if (b != null) return b;
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            int ss = 1; while (256 / (ss * 2) >= cellPx && ss < 8) ss *= 2;           // 칸이 목표 크기보다 작아지지 않는 만큼만 줄여 읽는다
            o.inSampleSize = ss; o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            InputStream in = app.getAssets().open("public/chars3d/" + id + ".webp");
            Bitmap raw;
            try { raw = BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
            if (raw == null) return null;
            int side = cellPx * 4;
            if (raw.getWidth() != side) { Bitmap sc = Bitmap.createScaledBitmap(raw, side, side, true); if (sc != raw) raw.recycle(); raw = sc; }
            SHEETS.put(key, raw);
            return raw;
        } catch (Exception e) { return null; }
    }
    static void freeSheets() { for (Bitmap b : SHEETS.values()) { try { b.recycle(); } catch (Exception ignored) { } } SHEETS.clear(); }

    static final class AndSurface implements WidgetArt.Surface {
        final Canvas cv; final float S; final WidgetGeo geo; final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG); final Path path = new Path();
        final Rect src = new Rect(); final RectF dst = new RectF(); final RectF ov = new RectF();
        AndSurface(Canvas c, float s, WidgetGeo g) { cv = c; S = s; geo = g; }
        void begin() { cv.drawColor(0, PorterDuff.Mode.CLEAR); cv.setMatrix(null); cv.scale(S, S); }
        @Override public void save() { cv.save(); }
        @Override public void restore() { cv.restore(); }
        @Override public void translate(float x, float y) { cv.translate(x, y); }
        @Override public void rotate(float deg) { cv.rotate(deg); }
        @Override public void scale(float sx, float sy) { cv.scale(sx, sy); }
        @Override public void cell(String id, int frame, float l, float t, float r, float b, float alpha) {
            int cellPx = Math.max(8, Math.round((r - l) * S));
            Bitmap sh = sheet(id, cellPx);
            if (sh == null) return;
            int sx = (frame % 4) * cellPx, sy = (frame / 4) * cellPx;
            src.set(sx, sy, sx + cellPx, sy + cellPx); dst.set(l, t, r, b);
            p.setStyle(Paint.Style.FILL); p.setAlpha((int) (alpha * 255f));
            cv.drawBitmap(sh, src, dst, p); p.setAlpha(255);
        }
        @Override public void ellipse(float cx, float cy, float rx, float ry, int argb) { p.setStyle(Paint.Style.FILL); p.setColor(argb); ov.set(cx - rx, cy - ry, cx + rx, cy + ry); cv.drawOval(ov, p); }
        @Override public void circle(float cx, float cy, float r, int argb) { p.setStyle(Paint.Style.FILL); p.setColor(argb); cv.drawCircle(cx, cy, r, p); }
        @Override public void poly(float[] xy, int argb) {
            p.setStyle(Paint.Style.FILL); p.setColor(argb); path.reset(); path.moveTo(xy[0], xy[1]);
            for (int i = 2; i + 1 < xy.length; i += 2) path.lineTo(xy[i], xy[i + 1]);
            path.close(); cv.drawPath(path, p);
        }
    }

    static void render(Inst n) {
        n.surf.begin();
        WidgetArt.draw(n.sim, n.surf, n.dark);
    }

    // ───────── RemoteViews ─────────
    static int rid(Context c, String name, String type) { return c.getResources().getIdentifier(name, type, c.getPackageName()); }
    static int px(Inst n, float dp) { return Math.round(dp * n.den); }

    static RemoteViews views(Context c, Inst n, boolean full) {
        String lay = "gdm_widget_" + (n.vertical ? "v" : "h") + "_" + (n.dark ? "dark" : "light");
        RemoteViews rv = new RemoteViews(c.getPackageName(), rid(c, lay, "layout"));
        int ov = rid(c, "gw_overlay", "id");
        if (!full) { rv.setImageViewBitmap(ov, n.bmp); return rv; }
        int clock = rid(c, "gw_clock", "id"), clockM = rid(c, "gw_clock_m", "id"), date = rid(c, "gw_date", "id"), cmt = rid(c, "gw_cmt", "id"), bub = rid(c, "gw_bubble", "id"), btn = rid(c, "gw_btn", "id"), root = rid(c, "gw_root", "id");
        WidgetGeo g = n.geo;
        rv.setTextViewTextSize(clock, TypedValue.COMPLEX_UNIT_DIP, g.textDp);
        rv.setViewPadding(clock, Math.round(n.padL), Math.round(Math.max(0f, n.padT)), 0, 0);
        if (n.vertical) { rv.setTextViewTextSize(clockM, TypedValue.COMPLEX_UNIT_DIP, g.textDp); rv.setViewPadding(clockM, Math.round(n.padL), Math.round(Math.max(0f, n.padTm)), 0, 0); }
        rv.setViewVisibility(date, android.view.View.GONE);        // 배경이 투명하고 위젯이 시계 크기라 날짜는 뺐다
        Scene s = scene(c);
        boolean commute = s.kind.length() > 0 && System.currentTimeMillis() < s.until;
        rv.setViewVisibility(cmt, commute ? android.view.View.VISIBLE : android.view.View.GONE);
        if (commute) {
            rv.setViewPadding(cmt, px(n, g.bubL), px(n, g.bubT), px(n, g.W - (g.bubL + g.bubW)), px(n, g.H - (g.btnT + g.btnH)));
            String say = s.say2.length() > 0 ? s.say1 + "\n" + s.say2 : s.say1;
            rv.setTextViewText(bub, say);
            float bs = Math.max(11f, Math.min(15f, g.bubW / 13f));
            rv.setTextViewTextSize(bub, TypedValue.COMPLEX_UNIT_DIP, bs);
            rv.setTextViewText(btn, s.btn.length() > 0 ? s.btn : ("morn".equals(s.kind) ? "출근하기" : "퇴근하기"));
            rv.setOnClickPendingIntent(btn, goIntent(c, s.kind));
            rv.setOnClickPendingIntent(bub, pokeIntent(c, n.id));
        }
        rv.setOnClickPendingIntent(root, pokeIntent(c, n.id));
        rv.setImageViewBitmap(ov, n.bmp);
        return rv;
    }
    static PendingIntent pokeIntent(Context c, int id) {
        Intent it = new Intent(c, GdmWidgetReceiver.class).setAction(ACTION_POKE).putExtra("id", id);
        return PendingIntent.getBroadcast(c.getApplicationContext(), 7800 + (id & 0xff), it, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }
    static PendingIntent goIntent(Context c, String kind) {
        Intent it = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (it == null) it = new Intent();
        it.putExtra(EXTRA_GO, kind).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c.getApplicationContext(), "morn".equals(kind) ? 7701 : 7702, it, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }

    /** 모든 위젯을 처음부터 다시 그려 올린다(설정·장면·크기가 바뀌었을 때). */
    public static void refreshAll(Context c, boolean resetMode) {
        Context a = c.getApplicationContext(); app = a;
        AppWidgetManager m = AppWidgetManager.getInstance(a);
        Scene s = scene(a);
        boolean commute = s.kind.length() > 0 && System.currentTimeMillis() < s.until;
        for (int id : ids(a)) {
            try {
                Inst n = inst(a, id);
                applyCommute(n, commute);
                if (commute) n.sim.setMode(WidgetSim.COMMUTE, s.mood); else n.sim.setMode(WidgetSim.NORMAL, null);
                if (!running) { n.sim.snapSettled(); }
                render(n);
                m.updateAppWidget(id, views(a, n, true));
            } catch (Exception ignored) { }
        }
    }

    // ───────── 애니메이션(화면이 켜져 있는 동안 잠깐) ─────────
    static boolean running; static long burstUntil, last; static boolean rcvOn;
    static boolean screenOn(Context c) {
        try { PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE); return pm == null || pm.isInteractive(); } catch (Exception e) { return true; }
    }
    static final BroadcastReceiver SCREEN = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent it) {
            String a = it == null ? null : it.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(a)) stop(c, true);
            else if (Intent.ACTION_SCREEN_ON.equals(a) || Intent.ACTION_USER_PRESENT.equals(a)) { evalScene(c); wake(c, "screen"); }
        }
    };
    static void ensureReceiver(Context c) {
        if (rcvOn) return;
        try {
            IntentFilter f = new IntentFilter(); f.addAction(Intent.ACTION_SCREEN_ON); f.addAction(Intent.ACTION_SCREEN_OFF); f.addAction(Intent.ACTION_USER_PRESENT);
            c.getApplicationContext().registerReceiver(SCREEN, f); rcvOn = true;
        } catch (Exception ignored) { }
    }
    /** 캐릭터를 움직이기 시작한다(이미 움직이는 중이면 시간만 늘린다). 화면이 꺼져 있으면 하지 않는다. */
    public static void wake(Context c, String why) {
        Context a = c.getApplicationContext(); app = a;
        ensureReceiver(a);
        if (ids(a).length == 0 || !screenOn(a)) return;
        if (!"cfg".equals(why)) armScene(a);                 // 앱을 만지는 중(설정 전달)에는 위젯이 안 보이니 세지 않는다
        burstUntil = SystemClock.uptimeMillis() + BURST_MS;
        for (Inst n : INST.values()) n.sim.resume();
        if (running) return;
        running = true; last = SystemClock.uptimeMillis();
        handler().post(TICK);
    }
    static final Runnable TICK = new Runnable() { @Override public void run() {
        if (!running || app == null) return;
        long t0 = SystemClock.uptimeMillis();
        if (!screenOn(app)) { stop(app, true); return; }
        float dt = Math.min(0.1f, (t0 - last) / 1000f); last = t0;
        boolean settling = t0 >= burstUntil, allDone = true;
        AppWidgetManager m = AppWidgetManager.getInstance(app);
        int[] ids = ids(app);
        if (ids.length == 0) { stop(app, false); return; }
        for (int id : ids) {
            try {
                Inst n = cached(app, id);
                if (settling) n.sim.requestSettle();
                n.sim.step(dt);
                render(n);
                m.partiallyUpdateAppWidget(id, views(app, n, false));
                if (!n.sim.isSettled()) allDone = false;
            } catch (Exception ignored) { }
        }
        if (settling && (allDone || t0 >= burstUntil + 5000L)) { stop(app, true); return; }
        long spent = SystemClock.uptimeMillis() - t0;
        handler().postDelayed(this, Math.max(10L, FRAME_MS - spent));
    } };
    /** 멈춘다: 모두 바닥에서 쉬는 자세(출퇴근 중엔 줄 선 자세)로 한 번 그려 놓고 끝. */
    static void stop(Context c, boolean finalFrame) {
        running = false; handler().removeCallbacks(TICK);
        if (finalFrame) {
            AppWidgetManager m = AppWidgetManager.getInstance(c.getApplicationContext());
            for (int id : ids(c)) {
                try { Inst n = cached(c, id); n.sim.snapSettled(); render(n); m.partiallyUpdateAppWidget(id, views(c, n, false)); } catch (Exception ignored) { }
            }
        }
        freeSheets();
    }

    // ───────── 앱이 열렸을 때 ─────────
    static volatile String pendingGo = "";
    public static void captureLaunch(Intent it) {
        try { if (it != null && it.hasExtra(EXTRA_GO)) { String g = it.getStringExtra(EXTRA_GO); pendingGo = g == null ? "" : g; it.removeExtra(EXTRA_GO); } } catch (Exception ignored) { }
    }
    public static String takeLaunch(Context c) {
        String g = pendingGo; pendingGo = "";
        if (g.length() > 0) markDone(c, g);
        return g;
    }
}
