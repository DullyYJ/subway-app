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
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
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
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * 캐릭터 시계 위젯 본체 (2026-10-15 YJ: 가로형·세로형 × 블랙·화이트, 시계 주변을 캐릭터가 돌아다니고, 출퇴근 시각이 되면 시계 앞에서 응원·위로 + [출근하기]/[퇴근하기]).
 *
 *  ■ 배터리 — 평소엔 아무것도 돌지 않는다.
 *    · 시계 글자는 시스템 TextClock(분이 바뀌어도 우리가 깨어 있을 필요 없음).
 *    · 캐릭터 그림은 화면이 켜져 있는 동안만 갈아 끼운다. 동물들은 평소엔 캐릭터마다 소품과 함께 그린 자는 장면(고양이 캣타워 · 올챙이 물웅덩이 · 독수리 나뭇가지에 매달림 · 강아지 방석 · 두더지 흙집, 무작위 자리, `<id>_sleep.webp` 16프레임)에서 zzz 하며 자고 있고(잠든 뒤 30초만 숨 쉬는 모습을 움직이고 그 뒤는 멈춘 그림 한 장),
 *      깨울 수 있는 신호(화면 켜짐·잠금 해제·런처의 위젯 갱신·크기 변경·알람)를 받으면 마리마다 무작위로(0~3초) 일어나 나와 설정한 시간(기본 6분, 설정에서 2~10분) 돌아다니다가 다시 집으로 들어가 잔다.
 *      ROAM_EVERY_MIN(3분)마다 정확 알람(조용한 내부 타이머, 폰 알림 아님)이 앱 프로세스를 되살린다 — 앱 프로세스가 죽어 있으면 화면 켜짐을 들을 수 없으므로, 알람이 프로세스를 되살려 수신기를 다시 달아 둔다(알람마다 움직이진 않고, 마지막 움직임이 끝난 지 10분이 지났을 때만 움직인다).
 *      화면을 켤 때마다 캐릭터 셋은 바뀐다. 위젯 본체를 누르면 앱이 열려 커뮤니티 탭으로 간다(동물을 깨우는 용도가 아님). 출퇴근 장면은 자지 않고 BURST_MS(45초) 뒤 줄 선 자세로 멈춘다. 화면이 꺼지면 즉시 멈춘다.
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
    public static final String EXTRA_GO = "gdm_widget_go", EXTRA_TAB = "gdm_widget_tab";
    static final long BURST_MS = 45000L, FRAME_MS = 100L;                       // 출퇴근 장면: 켜진 뒤 45초
    static final long BED_MS = 20000L, SLEEP_FRAME_MS = 200L, SLEEP_SHOW_MS = 30000L;   // 집에 들어가는 데 최대 20초 · 모두 잠든 뒤 숨 쉬는 모습을 보여 주는 동안 그림 갱신 간격 · 그 시간(지나면 멈춘 그림 한 장으로 끝)
    static final float ROAM_SPREAD = 3f;                                     // 깨우면 마리마다 0~3초 사이 무작위로 집에서 나온다
    static final long ROAM_ALARM_COOLDOWN_MS = 600000L;                      // 알람은 프로세스만 되살린다: 마지막 움직임이 끝난 지 10분이 안 됐으면 알람으로는 또 움직이지 않는다
    static long lastRoamEnd;                                                 // 마지막 움직임이 끝난 시각(uptime)
    static boolean awakeHold;                                                // 화면이 켜지는 순간: 곧장 깨어난 모습으로 시작(집에서 자는 모습을 잠깐 보이지 않게)
    // s272: 출퇴근 장면의 요일·시각·기다리는 시간(90분)·떠 있는 시간(3분)·버튼 이름·기본 문구는 엔진이 정한 목록(WidgetSceneCore ← /commute-alarm op:'wscene')을 따른다.
    static final String ENGINE = ShellCore.BASE;

    // ───────── 저장값 ─────────
    static SharedPreferences sp(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    public static final class Cfg {
        public boolean on, mOn = true, eOn = true; public String morn = "07:30", eve = "18:30"; public boolean[] days = new boolean[7];
        public double mLat, mLng, eLat, eLng; public boolean hasM, hasE; public int roamMin = WidgetSim.ROAM_MIN_DEF;
    }
    public static Cfg cfg(Context c) {
        Cfg f = new Cfg();
        try {
            JSONObject j = new JSONObject(sp(c).getString("cfg", "{}"));
            f.on = j.optBoolean("on", false); f.mOn = j.optBoolean("mOn", true); f.eOn = j.optBoolean("eOn", true); f.morn = j.optString("morn", "07:30"); f.eve = j.optString("eve", "18:30");
            JSONArray d = j.optJSONArray("days");
            if (d == null || d.length() == 0) { for (int i = 0; i < 7; i++) f.days[i] = true; }
            else for (int i = 0; i < d.length(); i++) { int v = d.optInt(i, -1); if (v >= 0 && v < 7) f.days[v] = true; }
            f.roamMin = (int) (WidgetSim.roamMs(j.optInt("roam", WidgetSim.ROAM_MIN_DEF)) / 60000L);
            if (j.has("mLat") && j.has("mLng")) { f.mLat = j.optDouble("mLat"); f.mLng = j.optDouble("mLng"); f.hasM = true; }
            if (j.has("eLat") && j.has("eLng")) { f.eLat = j.optDouble("eLat"); f.eLng = j.optDouble("eLng"); f.hasE = true; }
        } catch (Exception ignored) { }
        return f;
    }
    public static void setConfigJson(Context c, String json) {
        sp(c).edit().putString("cfg", json == null ? "{}" : json).apply();
        ensurePlan(c, true);                                    // 설정이 바뀌었다 — 엔진에서 새 장면 목록을 받는다(올 때까지 옛 목록은 안 쓴다)
        scheduleNext(c); evalScene(c); refreshAll(c, true); wake(c, "cfg");
    }
    /** 지금 저장된 설정과 같은 글인가(같으면 다시 그리지 않으려고). */
    public static boolean sameConfig(Context c, String json) { return (json == null ? "{}" : json).equals(sp(c).getString("cfg", "")); }
    /** 홈 화면에 위젯을 바로 추가해 달라고 런처에 요청한다(type = hb|hw|vb|vw). 런처가 지원하지 않으면 false. */
    public static boolean pin(Context c, String type) {
        Class<?> k = "hw".equals(type) ? GdmWidgetHW.class : "vb".equals(type) ? GdmWidgetVB.class : "vw".equals(type) ? GdmWidgetVW.class : GdmWidgetHB.class;
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                AppWidgetManager m = AppWidgetManager.getInstance(c.getApplicationContext());
                if (m.isRequestPinAppWidgetSupported()) return m.requestPinAppWidget(new ComponentName(c.getApplicationContext(), k), null, null);
            }
        } catch (Exception ignored) { }
        return false;
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
    // ───────── 장면 목록(엔진이 정한 14일치) ─────────
    static String cfgSig(Cfg f) { return WidgetSceneCore.sig(f.on, f.mOn, f.eOn, f.morn, f.eve, f.days); }
    /** 지금 설정으로 받아 둔 목록(설정이 바뀌었거나 못 받았으면 null). */
    static WidgetSceneCore.Plan plan(Context c) {
        SharedPreferences p = sp(c);
        if (!cfgSig(cfg(c)).equals(p.getString("wsSig", ""))) return null;
        return WidgetSceneCore.parse(p.getString("wsPlan", ""));
    }
    static final long PLAN_REFRESH_MS = 12L * 3600000L, PLAN_RETRY_MS = 5L * 60000L;
    static volatile boolean planBusy; static volatile long planTryAt;
    /** 목록이 없거나 12시간 넘었으면 엔진에서 새로 받는다(뒤 스레드 · 실패하면 5분 뒤에나 다시). 받으면 장면을 다시 판단하고 알람을 건다. */
    static void ensurePlan(final Context c, boolean force) {
        final Cfg f = cfg(c);
        if (!f.on || planBusy) return;
        long now = System.currentTimeMillis();
        SharedPreferences p = sp(c);
        boolean have = cfgSig(f).equals(p.getString("wsSig", "")) && p.getString("wsPlan", "").length() > 0;
        if (!force && have && now - p.getLong("wsAt", 0L) < PLAN_REFRESH_MS) return;
        if (!force && now - planTryAt < PLAN_RETRY_MS) return;
        planBusy = true; planTryAt = now;
        final String body = WidgetSceneCore.reqBody(now, f.on, f.mOn, f.eOn, f.morn, f.eve, f.days), sig = cfgSig(f);
        new Thread(new Runnable() { @Override public void run() {
            boolean got = false;
            try {
                NetPost.Res r = NetPost.post(ENGINE + "/commute-alarm", body, 8000);
                if (r != null && r.status == 200 && r.body != null && WidgetSceneCore.parse(r.body) != null) {
                    sp(c).edit().putString("wsPlan", r.body).putString("wsSig", sig).putLong("wsAt", System.currentTimeMillis()).apply();
                    got = true;
                }
            } catch (Throwable ignored) { }
            planBusy = false;
            if (!cfgSig(cfg(c)).equals(sig)) { ensurePlan(c, true); return; }          // 받는 사이 설정이 또 바뀌었다 — 한 번 더
            if (got) handler().post(new Runnable() { @Override public void run() { evalScene(c); scheduleNext(c); refreshAll(c, true); wake(c, "plan"); } });
        } }, "gdm-widget-plan").start();
    }

    /** 엔진이 정한 목록에서 지금 보여야 할 출퇴근 장면이 있으면 시작하고, 끝난 장면은 치운다. 알람·위젯 갱신·화면 켜짐·탭 때 부른다. */
    public static boolean evalScene(Context c) {
        Cfg f = cfg(c); boolean started = false;
        ensurePlan(c, false);
        WidgetSceneCore.Plan p = plan(c);
        Scene cur = scene(c); long now = System.currentTimeMillis();
        if (cur.kind.length() > 0 && now >= cur.until) { sp(c).edit().putString("lastDone", cur.key).apply(); clearScene(c); cur = scene(c); }   // 안 눌렀어도 끝난 장면은 다시 안 띄운다
        if (!f.on) { if (cur.kind.length() > 0) clearScene(c); return false; }
        if (cur.kind.length() > 0 && (p == null || p.find(cur.key) == null)) { clearScene(c); cur = scene(c); }      // 설정을 바꿔 옛 시각의 장면은 목록에 없다 — 치운다(새 시각에 다시 뜬다)
        if (p == null) return false;
        WidgetSceneCore.Entry best = p.pick(now, sp(c).getString("lastDone", ""));
        if (best != null && !(cur.kind.equals(best.k) && cur.key.equals(best.key))) { startScene(c, p, best); started = true; }
        return started;
    }
    static void startScene(final Context c, WidgetSceneCore.Plan p, WidgetSceneCore.Entry e) {
        SharedPreferences.Editor ed = sp(c).edit();
        ed.putString("scKind", e.k).putString("scKey", e.key).putLong("scUntil", e.until).putLong("scShown", 0L).putBoolean("scFetched", false).putString("scMood", "cheer");
        ed.putString("scBtn", p.btnOf(e.k));
        ed.putString("scSay1", p.sayOf(e.k, 0)).putString("scSay2", p.sayOf(e.k, 1));     // 엔진 응답(/widget-say) 전·실패 때의 기본 문구 — 이것도 엔진 목록 값
        ed.apply();
        fetchSay(c, e.k, e.key);
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
                if (NetPost.iid != null && NetPost.iid.length() > 0) h.setRequestProperty("X-Gdm-Id", NetPost.iid);
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
        Scene cs = scene(c);
        String key = (cs.kind.equals(kind) && cs.key.length() > 0) ? cs.key : "";
        if (key.length() == 0) {                                                       // 장면 기록이 없으면 지금 그 종류로 열려 있는 목록 칸의 키
            WidgetSceneCore.Plan p = plan(c); long now = System.currentTimeMillis();
            if (p != null) for (WidgetSceneCore.Entry e : p.list) if (e.k.equals(kind) && now >= e.at && now < e.until) key = e.key;
        }
        if (key.length() > 0) sp(c).edit().putString("lastDone", key).apply();
        clearScene(c); refreshAll(c, true); scheduleNext(c);
    }

    /** 화면이 켜져 처음 장면이 보이는 순간부터 3분을 센다(그 전엔 기다린다). 3분이 지나면 알람이 장면을 치우고 시계로 돌려 놓는다. */
    static void armScene(Context c) {
        Scene cur = scene(c); if (cur.kind.length() == 0) return;
        SharedPreferences p = sp(c);
        if (p.getLong("scShown", 0L) != 0L) return;
        long now = System.currentTimeMillis(); WidgetSceneCore.Plan pl = plan(c);
        p.edit().putLong("scShown", now).putLong("scUntil", pl == null ? cur.until : Math.min(cur.until, now + pl.showMs)).apply();
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
        next = Math.min(next, WidgetSim.roamNext(now, java.util.TimeZone.getDefault(), WidgetSim.ROAM_EVERY_MIN) + 500L);   // 정시 기준 ROAM_EVERY_MIN 분마다: 앱을 깨워 동물을 내보낸다(조용한 타이머, 알림 아님)
        if (f.on) { WidgetSceneCore.Plan pl = plan(a); if (pl != null) next = Math.min(next, pl.nextAt(now)); }       // 엔진이 정한 목록의 다음 시작 시각
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
        float digitW, digitH, padL, padT, padTm; boolean measured; int measuredFor = -1;
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
        n.chars = pickChars(id, null);
        n.sim = new WidgetSim(n.geo, System.nanoTime() ^ id, n.chars);
        int bw = Math.max(40, Math.round(w * n.S)), bh = Math.max(40, Math.round(h * n.S));
        n.bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888); n.cv = new Canvas(n.bmp); n.surf = new AndSurface(n.cv, n.S, n.geo);
        INST.put(id, n);
        return n;
    }
    static String[] pickChars(int id, String[] prev) { return WidgetSim.pickSet(System.nanoTime() ^ (id * 7919L), prev); }
    /** 화면이 켜질 때마다 위젯의 캐릭터 셋을 새로 뽑아 갈아 끼운다(그림 판은 다음 그리기 때 새로 읽는다). */
    static void reshuffle(Context c) {
        for (Inst n : INST.values()) {
            n.chars = pickChars(n.id, n.chars);
            n.sim = new WidgetSim(n.geo, System.nanoTime() ^ n.id, n.chars);
        }
        freeSheets();
    }
    /** 출퇴근 장면이면 말풍선·버튼 자리만큼만 시계를 줄이고, 아니면 원래대로(바뀌었을 때만 글꼴을 다시 잰다). say 는 말풍선에 들어갈 글. */
    static void applyCommute(Inst n, boolean commute, String say) {
        WidgetGeo g = n.geo;
        int lines = g.bubLines;
        if (commute) {
            // 글자 크기는 줄 수에 따라 다시 정해지고(가로형), 줄 수는 글자 크기에 따라 달라지므로 몇 번 맞춰 본다
            g.setCommute(true, lines);
            int prev = -1;
            for (int i = 0; i < 4; i++) {
                int l = bubbleLines(n, say);
                if (l == g.bubLines) break;
                if (l == prev) { g.setCommute(true, Math.max(l, g.bubLines)); break; }        // 줄 수 ↔ 글자 크기가 서로 오가면 큰 쪽으로 잡아 넘치지 않게
                prev = g.bubLines; g.setCommute(true, l);
            }
        } else g.setCommute(false);
        if (n.measuredFor != g.bubLines * 2 + (g.commute ? 1 : 0)) { measureClock(n); n.measuredFor = g.bubLines * 2 + (g.commute ? 1 : 0); }
    }
    /** 말풍선 글이 상자 안에서 몇 줄이 되는지 실제 글꼴로 잰다(줄바꿈은 띄어쓰기에서, 한 낱말이 넘치면 글자 단위로). */
    static int bubbleLines(Inst n, String say) {
        WidgetGeo g = n.geo;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        p.setTextSize(g.bubTs * n.den);
        float maxW = Math.max(10f, (g.bubW - 2f * g.bubPad) * n.den);
        return wrapLines(say == null ? "" : say, maxW, p);
    }
    static int wrapLines(String say, float maxW, Paint p) {
        int total = 0;
        for (String para : say.split("\\n", -1)) {
            String[] words = para.trim().split(" +");
            float cur = 0f; int lines = 1; float sp = p.measureText(" ");
            for (String w : words) {
                float ww = p.measureText(w);
                if (cur == 0f) { cur = ww; }
                else if (cur + sp + ww <= maxW) { cur += sp + ww; }
                else { lines++; cur = ww; }
                while (cur > maxW) { lines++; cur -= maxW; }                      // 한 낱말이 한 줄보다 길면 글자 단위로 넘어간다
            }
            total += lines;
        }
        return Math.max(1, total);
    }
    static String sayText(Scene s) { return s.say2.length() > 0 ? s.say1 + "\n" + s.say2 : s.say1; }
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
            InputStream in = app.getAssets().open("chars3d/" + id + ".webp");
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
        @Override public void polyGrad(float[] xy, float y0, float y1, int c0, int c1) {
            p.setStyle(Paint.Style.FILL); p.setColor(0xFFFFFFFF); path.reset(); path.moveTo(xy[0], xy[1]);
            for (int i = 2; i + 1 < xy.length; i += 2) path.lineTo(xy[i], xy[i + 1]);
            path.close();
            p.setShader(new LinearGradient(0f, y0, 0f, Math.max(y1, y0 + 0.5f), c0, c1, Shader.TileMode.CLAMP));
            cv.drawPath(path, p); p.setShader(null);
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
            rv.setViewPadding(cmt, px(n, g.bubL), 0, px(n, g.W - (g.bubL + g.bubW)), px(n, g.H - (g.btnT + g.btnH)));     // 위쪽은 비워 둬 아래(버튼)에서부터 쌓는다
            rv.setTextViewText(bub, sayText(s));
            rv.setTextViewTextSize(bub, TypedValue.COMPLEX_UNIT_DIP, g.bubTs);            // 시계 > 말풍선 글자 > 버튼 글자
            rv.setTextViewTextSize(btn, TypedValue.COMPLEX_UNIT_DIP, g.btnTs);
            int bpv = px(n, Math.max(0f, (g.btnH - g.btnTs * WidgetGeo.LINE_K) / 2f));
            rv.setViewPadding(btn, 0, bpv, 0, bpv);           // 버튼 폭은 말풍선과 같다(match_parent — 둘 다 같은 좌우 여백 안에 있다)
            rv.setViewPadding(bub, px(n, g.bubPad), px(n, g.bubPad), px(n, g.bubPad), px(n, g.bubPad));
            rv.setTextViewText(btn, s.btn);          // 버튼 이름은 엔진 목록(btn) 값 — 장면을 시작할 때 저장해 둔다
            rv.setOnClickPendingIntent(btn, goIntent(c, s.kind));
            rv.setOnClickPendingIntent(bub, communityIntent(c));
        }
        rv.setOnClickPendingIntent(root, communityIntent(c));
        rv.setImageViewBitmap(ov, n.bmp);
        return rv;
    }
    static PendingIntent pokeIntent(Context c, int id) {
        Intent it = new Intent(c, GdmWidgetReceiver.class).setAction(ACTION_POKE).putExtra("id", id);
        return PendingIntent.getBroadcast(c.getApplicationContext(), 7800 + (id & 0xff), it, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }
    /** 위젯을 누르면 앱이 열리며 커뮤니티 탭으로 간다. */
    static PendingIntent communityIntent(Context c) {
        Intent it = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (it == null) it = new Intent();
        it.putExtra(EXTRA_TAB, "community").setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c.getApplicationContext(), 7703, it, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
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
                applyCommute(n, commute, commute ? sayText(s) : "");
                if (commute) n.sim.setMode(WidgetSim.COMMUTE, s.mood); else n.sim.setMode(WidgetSim.NORMAL, null);
                if (!running) settleFrame(n);
                render(n);
                m.updateAppWidget(id, views(a, n, true));
            } catch (Exception ignored) { }
        }
    }

    /** 멈춰 있을 때 보여 줄 모습: 집에서 자는 모습(zzz). 출퇴근 중이면 줄 선 자세, 화면이 막 켜지는 순간이면 깨어난 모습. */
    static void settleFrame(Inst n) {
        if (n.sim.mode == WidgetSim.COMMUTE || awakeHold) { n.sim.snapSettled(); return; }
        if (!n.sim.allInBed()) n.sim.asleepNow();
        n.sim.snapAsleep();
    }

    // ───────── 애니메이션(화면이 켜져 있는 동안 잠깐) ─────────
    static boolean running; static long burstUntil, last, bedUntil, sleepShowUntil; static int phase; static boolean bedding; static boolean rcvOn;   // phase 0 놀기(출퇴근 장면 포함) · 1 잠자리로 가는 중
    static boolean screenOn(Context c) {
        try { PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE); return pm == null || pm.isInteractive(); } catch (Exception e) { return true; }
    }
    static final BroadcastReceiver SCREEN = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent it) {
            String a = it == null ? null : it.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(a)) stop(c, true);
            else if (Intent.ACTION_SCREEN_ON.equals(a)) { awakeHold = true; try { reshuffle(c); evalScene(c); refreshAll(c, true); wake(c, "screen"); } finally { awakeHold = false; } }          // 켤 때마다 캐릭터가 바뀐다
            else if (Intent.ACTION_USER_PRESENT.equals(a)) { if (evalScene(c)) refreshAll(c, true); wake(c, "screen"); }                                            // 잠금 해제 때는 다시 안 바꾼다(켜짐 직후 이어서 옴)
        }
    };
    static void ensureReceiver(Context c) {
        if (rcvOn) return;
        try {
            IntentFilter f = new IntentFilter(); f.addAction(Intent.ACTION_SCREEN_ON); f.addAction(Intent.ACTION_SCREEN_OFF); f.addAction(Intent.ACTION_USER_PRESENT);
            c.getApplicationContext().registerReceiver(SCREEN, f); rcvOn = true;
        } catch (Exception ignored) { }
    }
    /** 깨울 수 있는 신호가 왔다: 집에서 자던 동물들이 일어나 설정한 시간 돌아다닌다(이미 돌아다니는 중이면 그대로 — 시간을 늘리지 않는다). 화면이 꺼져 있으면 하지 않는다. */
    public static void wake(Context c, String why) {
        Context a = c.getApplicationContext(); app = a;
        ensureReceiver(a);
        if (ids(a).length == 0 || !screenOn(a)) return;
        if (!"cfg".equals(why)) armScene(a);                 // 앱을 만지는 중(설정 전달)에는 위젯이 안 보이니 세지 않는다
        if ("cfg".equals(why) && !anyCommute()) return;      // 앱 안에서 설정을 바꾸는 중에는 동물을 깨우지 않는다
        long now = SystemClock.uptimeMillis();
        boolean commute = anyCommute();
        if ("alarm".equals(why) && !commute && !running && lastRoamEnd != 0L && now - lastRoamEnd < ROAM_ALARM_COOLDOWN_MS) return;   // 이번 알람은 프로세스를 되살리고 수신기를 다시 다는 것으로 끝
        if (running) {
            if (phase == 1 && bedding && !commute) { phase = 0; bedding = false; burstUntil = now + roamMs(a); for (Inst n : INST.values()) n.sim.wakeAll(0f); }   // 자러 가는 중에 신호가 오면 다시 일어난다
            else if (commute) { phase = 0; bedding = false; burstUntil = now + BURST_MS; for (Inst n : INST.values()) n.sim.wakeAll(0f); }
            return;
        }
        burstUntil = now + (commute ? BURST_MS : roamMs(a)); phase = 0; bedding = false; sleepShowUntil = 0L;
        for (Inst n : INST.values()) n.sim.wakeAll(commute ? 0f : ROAM_SPREAD);
        running = true; last = SystemClock.uptimeMillis();
        handler().post(TICK);
    }
    /** 길동무 앱 화면이 닫혀(홈·다른 앱으로 나감) 위젯이 보일 수 있게 됐다: 앱과 위젯은 한 프로세스라 바로 깨운다(설정한 시간 돌아다니고 잔다). */
    public static void onAppLeft(Context c) {
        try { if (evalScene(c)) refreshAll(c, true); wake(c, "app"); } catch (Exception ignored) { }
    }
    /** 설정한 '돌아다니는 시간'(기본 6분). */
    static long roamMs(Context c) { return cfg(c).roamMin * 60000L; }
    static boolean anyCommute() { for (Inst n : INST.values()) if (n.sim.mode == WidgetSim.COMMUTE) return true; return false; }
    static final Runnable TICK = new Runnable() { @Override public void run() {
        if (!running || app == null) return;
        long t0 = SystemClock.uptimeMillis();
        if (!screenOn(app)) { stop(app, true); return; }
        float dt = Math.min(0.1f, (t0 - last) / 1000f); last = t0;
        boolean commute = anyCommute();
        if (commute && phase == 1 && bedding) { phase = 0; bedding = false; burstUntil = t0 + BURST_MS; }   // 자러 가는 중에 출퇴근 시간이 되면 깨어 줄을 선다
        if (phase == 0 && t0 >= burstUntil) {
            phase = 1; bedUntil = t0 + BED_MS; bedding = !commute; sleepShowUntil = 0L;
            if (!commute) { for (Inst n : INST.values()) n.sim.bed(true); }                      // 설정한 시간이 지났다: 집이 생기고 들어가 잔다(다음 신호가 올 때까지)
        }
        boolean settling = phase == 1 && commute, allDone = true, allBed = true;
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
                if (!n.sim.allInBed()) allBed = false;
            } catch (Exception ignored) { }
        }
        if (phase == 1 && commute) {
            if (allDone || t0 >= burstUntil + 5000L) { stop(app, true); return; }            // 출퇴근 장면: 줄 선 자세로 멈춘다(자지 않는다)
        } else if (phase == 1) {
            if (allBed) {                                                                     // 모두 잠들었다: 잠깐(30초) 숨 쉬고 물결치는 모습을 보여 준 뒤 멈춘 그림 한 장으로 끝낸다
                if (sleepShowUntil == 0L) sleepShowUntil = t0 + SLEEP_SHOW_MS;
                if (t0 >= sleepShowUntil) { sleepShowUntil = 0L; endAsleep(app); return; }
            } else if (t0 >= bedUntil) { sleepShowUntil = 0L; endAsleep(app); return; }       // 시간이 다 됐다: 억지로 재워 멈춘다
        }
        long spent = SystemClock.uptimeMillis() - t0;
        handler().postDelayed(this, Math.max(10L, (phase == 1 && allBed && !commute ? SLEEP_FRAME_MS : FRAME_MS) - spent));
    } };
    /** 모두 집에서 자는 모습(zzz)으로 한 번 그려 놓고 끝낸다. 다음 신호(화면 켜짐·알람 등)가 깨운다. */
    static void endAsleep(Context c) {
        running = false; lastRoamEnd = SystemClock.uptimeMillis(); handler().removeCallbacks(TICK);
        AppWidgetManager m = AppWidgetManager.getInstance(c.getApplicationContext());
        for (int id : ids(c)) {
            try { Inst n = cached(c, id); if (!n.sim.allInBed()) n.sim.asleepNow(); n.sim.snapBed(); n.sim.snapAsleep(); render(n); m.partiallyUpdateAppWidget(id, views(c, n, false)); } catch (Exception ignored) { }
        }
        freeSheets();
    }
    /** 멈춘다: 모두 바닥에서 쉬는 자세(출퇴근 중엔 줄 선 자세)로 한 번 그려 놓고 끝. */
    static void stop(Context c, boolean finalFrame) {
        running = false; lastRoamEnd = SystemClock.uptimeMillis(); handler().removeCallbacks(TICK);
        if (finalFrame) {
            AppWidgetManager m = AppWidgetManager.getInstance(c.getApplicationContext());
            for (int id : ids(c)) {
                try { Inst n = cached(c, id); settleFrame(n); render(n); m.partiallyUpdateAppWidget(id, views(c, n, false)); } catch (Exception ignored) { }
            }
        }
        freeSheets();
    }

    // ───────── 앱이 열렸을 때 ─────────
    static volatile String pendingGo = "", pendingTab = "";
    public static void captureLaunch(Intent it) {
        try { if (it != null && it.hasExtra(EXTRA_GO)) { String g = it.getStringExtra(EXTRA_GO); pendingGo = g == null ? "" : g; it.removeExtra(EXTRA_GO); } } catch (Exception ignored) { }
        try { if (it != null && it.hasExtra(EXTRA_TAB)) { String g = it.getStringExtra(EXTRA_TAB); pendingTab = g == null ? "" : g; it.removeExtra(EXTRA_TAB); } } catch (Exception ignored) { }
    }
    /** 위젯을 눌러 앱이 열렸으면 가야 할 탭 이름(한 번만). */
    public static String takeTab() { String t = pendingTab; pendingTab = ""; return t; }
    public static String takeLaunch(Context c) {
        String g = pendingGo; pendingGo = "";
        if (g.length() > 0) markDone(c, g);
        return g;
    }
}
