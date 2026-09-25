package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

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
