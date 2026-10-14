package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.ActivityManager;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 배터리 최적화 제외 플러그인.
 *
 * 2026-09-26 신설 이유
 * ────────────────────
 * AndroidManifest 에는 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 권한이 이미
 * 선언돼 있었다(스토어 출시 준비 때 build-apk.yml PERMS 목록에 추가됨).
 * 하지만 이 권한은 "선언"만으로는 아무 효과가 없다 — 시스템이 실제로 이
 * 앱을 배터리 최적화 예외 목록에 넣어주려면, 앱이 직접
 * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 인텐트를 띄워 사용자가
 * 시스템 다이얼로그에서 "허용"을 눌러야 한다. 지금까지 이 호출이 코드
 * 어디에도 없어서, 삼성·샤오미 등 배터리 관리가 공격적인 제조사 기기에서는
 * 앱을 며칠 안 열면 PiP·상주 알림·예약 알림이 백그라운드에서 죽을 위험이
 * 있었다(권한은 선언돼 있었지만 실제로는 한 번도 적용된 적이 없는 상태).
 *
 * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 자체가 일부 제조사 커스텀
 * 롬에는 없을 수 있어(구글 정책상 있어야 하지만 실제로 빠진 기기가 보고됨),
 * 인텐트 실행이 실패하면 앱 상세 설정 화면으로라도 보내서 사용자가 직접
 * "배터리 사용량 제한 없음"을 찾아 끌 수 있게 한다.
 */
@CapacitorPlugin(name = "Power")
public class PowerPlugin extends Plugin {

    @PluginMethod
    public void isIgnoringOptimizations(PluginCall call) {
        call.resolve(new JSObject().put("ignoring", isIgnoring()));
    }

    @PluginMethod
    public void requestIgnoreOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            // M(23) 이전은 배터리 최적화 개념 자체가 없다 — 할 일 없음.
            call.resolve(new JSObject().put("ok", true).put("already", true));
            return;
        }
        if (isIgnoring()) {
            call.resolve(new JSObject().put("ok", true).put("already", true));
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve(new JSObject().put("ok", true).put("already", false));
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(fallback);
                call.resolve(new JSObject().put("ok", true).put("fallback", true));
            } catch (Exception e2) {
                call.reject("배터리 최적화 설정 화면을 열 수 없습니다: " + e2.getMessage());
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ★ 2026-10-14 (YJ: "이앱은 대부분 갤럭시에서 구동될거야"): 삼성 One UI 의 '자동 절전' 대응.
    //   삼성은 일반 안드로이드의 '배터리 최적화 제외'와 별개로 Sleeping(약 3일 미사용)·Deep sleeping(장기 미사용) 목록을 두고,
    //   Sleeping 이면 Job·Alarm·**포그라운드 서비스까지** 제한한다. 사용자가 '자동으로 절전하지 않는 앱(Never sleeping)'에
    //   넣어 줘야 한다 (삼성 개발자 문서: developer.samsung.com/mobile/app-management.html).
    //   · 앱이 그 목록에 들어 있는지는 읽을 방법이 없다 → 상태를 추측해 보여 주지 않고, 설정 화면을 열어 주기만 한다.
    //   · 계산은 하지 않는다: 기기 제조사와 설정 화면 이동만 담당(그림·안내만).
    // ─────────────────────────────────────────────────────────────

    /** 제조사·모델·삼성 여부. 앱은 이 값으로 갤럭시 전용 안내를 띄울지 정한다. */
    @PluginMethod
    public void deviceInfo(PluginCall call) {
        JSObject o = new JSObject();
        String mf = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        o.put("manufacturer", mf);
        o.put("model", Build.MODEL == null ? "" : Build.MODEL);
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("samsung", "samsung".equalsIgnoreCase(mf));
        call.resolve(o);
    }

    /**
     * 백그라운드 제한 상태(읽을 수 있는 것만).
     * bgRestricted: 사용자가 앱 배터리를 '제한됨'으로 둔 경우 true (API 28+).
     * standbyBucket: 1 ACTIVE · 2 WORKING_SET · 3 FREQUENT · 4 RARE · 5 RESTRICTED (API 28+, 못 읽으면 0).
     * ※ 삼성 Sleeping/Never sleeping 목록 소속은 읽을 수 없다.
     */
    @PluginMethod
    public void backgroundStatus(PluginCall call) {
        JSObject o = new JSObject();
        boolean restricted = false;
        int bucket = 0;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
                if (am != null) restricted = am.isBackgroundRestricted();
                UsageStatsManager um = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
                if (um != null) {
                    int b = um.getAppStandbyBucket();
                    if (b <= 10) bucket = 1;
                    else if (b <= 20) bucket = 2;
                    else if (b <= 30) bucket = 3;
                    else if (b <= 40) bucket = 4;
                    else bucket = 5;
                }
            }
        } catch (Throwable t) { /* 못 읽으면 기본값 */ }
        o.put("bgRestricted", restricted);
        o.put("standbyBucket", bucket);
        o.put("ignoring", isIgnoring());
        call.resolve(o);
    }

    /**
     * 삼성 '자동으로 절전하지 않는 앱' 목록 화면을 연다 (activity_type 2 = Never sleeping).
     * 열 수 없으면(구버전 One UI·비삼성) 앱 정보 화면으로 보낸다. target 으로 어디가 열렸는지 알려 준다.
     */
    @PluginMethod
    public void openAutoSleepSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        try {
            Intent i = new Intent("com.samsung.android.sm.ACTION_OPEN_CHECKABLE_LISTACTIVITY");
            i.setPackage("com.samsung.android.lool");
            i.putExtra("activity_type", 2);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve(new JSObject().put("ok", true).put("target", "samsung_never_sleeping"));
            return;
        } catch (Throwable t1) { /* 아래로 */ }
        try {
            Intent f = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            f.setData(Uri.parse("package:" + pkg));
            f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(f);
            call.resolve(new JSObject().put("ok", true).put("target", "app_details"));
        } catch (Throwable t2) {
            call.reject("절전 설정 화면을 열 수 없습니다: " + t2.getMessage());
        }
    }

    private boolean isIgnoring() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception e) {
            return false;
        }
    }
}
