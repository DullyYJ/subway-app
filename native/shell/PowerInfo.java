package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.ActivityManager;
import android.app.usage.UsageStatsManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * 절전 사실 읽기 + 기기 설정 화면 열기 (2026-10-21 s103). 글·판정은 엔진(settings 의 sam 화면)이 하고, 여기는 "지금 기기가 이렇다"만 읽는다.
 * 읽지 못한 값은 sok=false 로 둔다(엔진이 "읽지 못했어요"로 보여 준다).
 */
final class PowerInfo {
    /** 갤럭시(삼성) 기기인가 — 설정 첫 화면에 '자동 절전 제외' 줄을 보일지 정하는 사실. */
    final boolean sam;
    /** 이 앱 배터리가 '제한됨'인가. */
    final boolean w;
    /** 배터리 최적화에서 제외돼 있는가. */
    final boolean ig;
    /** 기기가 보는 앱 등급(엔진 표 0 알 수 없음 · 1 활성 · 2 작업 집합 · 3 자주 · 4 드물게 · 5 제한). 못 읽으면 -1. */
    final int bk;
    final boolean sok;

    private PowerInfo(boolean sam, boolean w, boolean ig, int bk, boolean sok) { this.sam = sam; this.w = w; this.ig = ig; this.bk = bk; this.sok = sok; }

    static boolean isSamsung() { return Build.MANUFACTURER != null && "samsung".equalsIgnoreCase(Build.MANUFACTURER.trim()); }

    static PowerInfo read(Context c) {
        boolean w = false, ig = false, ok = false; int bk = -1;
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm != null && Build.VERSION.SDK_INT >= 23) { ig = pm.isIgnoringBatteryOptimizations(c.getPackageName()); ok = true; }
        } catch (Throwable t) { /* 못 읽음 */ }
        try {
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null && Build.VERSION.SDK_INT >= 28) w = am.isBackgroundRestricted();
        } catch (Throwable t) { /* 못 읽음 */ }
        try {
            if (Build.VERSION.SDK_INT >= 28) {
                UsageStatsManager um = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
                if (um != null) bk = bucket(um.getAppStandbyBucket());
            }
        } catch (Throwable t) { /* 못 읽음 */ }
        return new PowerInfo(isSamsung(), w, ig, bk, ok);
    }

    /** 안드로이드 대기 등급 숫자 → 엔진 표 번호. */
    static int bucket(int b) {
        if (b <= 10) return 1;
        if (b <= 20) return 2;
        if (b <= 30) return 3;
        if (b <= 40) return 4;
        return 5;
    }

    /** 엔진 sam 화면용 기기 사실(JSON 조각). */
    String pageFacts() {
        return "{\"pf\":{\"w\":" + w + ",\"ig\":" + ig + ",\"sok\":" + sok + (bk >= 0 ? ",\"bk\":" + bk : "") + "}}";
    }

    /** 삼성 '자동 절전 제외' 목록 화면 → 안 열리면 앱 정보 화면. */
    static void openSamsung(Context c) {
        String[][] cn = { { "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.usage.CheckableAppListActivity" },
                          { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
                          { "com.samsung.android.sm_cn", "com.samsung.android.sm.ui.battery.BatteryActivity" } };
        for (String[] p : cn) {
            try { Intent i = new Intent(); i.setComponent(new ComponentName(p[0], p[1])); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); return; }
            catch (ActivityNotFoundException e) { /* 다음 후보 */ } catch (SecurityException e) { /* 다음 후보 */ }
        }
        openAppInfo(c);
    }

    /** 배터리 최적화 제외 요청 → 안 되면 배터리 최적화 목록 → 앱 정보. */
    static void requestIgnore(Context c) {
        if (Build.VERSION.SDK_INT >= 23) {
            try { Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName())); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); return; }
            catch (Throwable t) { /* 다음 */ }
            try { Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); return; }
            catch (Throwable t) { /* 다음 */ }
        }
        openAppInfo(c);
    }

    static void openAppInfo(Context c) {
        try { Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName())); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); }
        catch (Throwable t) { /* 기기가 못 열면 안내 글만 남는다 */ }
    }
}
