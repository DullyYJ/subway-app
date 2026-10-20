package com.dullyyj.subway;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 내 위치·도착 예정을 친구에게 공유(2026-10-15, YJ: "카톡으로 내 위치와 도착시간을 알려주고 싶어").
 *  · shareImage({png: base64, text, pkg}) — 앱이 그린 그림(png)과 글을 안드로이드 공유(ACTION_SEND) 목록으로 보낸다.
 *    pkg(기본 카카오톡)가 깔려 있으면 공유 목록 맨 앞에 올려 준다(바로 열지는 않는다 — 바로 열면 카카오톡이 검은 화면에서 멈췄다).
 *  · 그림은 앱 캐시(cache/gdmshare)에 쓰고 FileProvider(권한 이름 <패키지>.gdmshare)로 넘긴다 — 저장소 권한이 필요 없다.
 *  · 어떤 글·그림을 보낼지는 앱(JS)이 정하고, 여기서는 넘기기만 한다. 누구에게 보낼지는 사용자가 카카오톡에서 고른다(앱은 아무에게도 자동으로 보내지 않는다).
 */
@CapacitorPlugin(name = "GdmShare")
public class GdmSharePlugin extends Plugin {
    static final String DIR = "gdmshare";

    @PluginMethod public void shareImage(PluginCall call) {
        String b64 = call.getString("png", "");
        String text = call.getString("text", "");
        String pkg = call.getString("pkg", "com.kakao.talk");
        Context c = getActivity() != null ? getActivity() : getContext();
        if (c == null || b64 == null || b64.length() == 0) { call.reject("그림이 없어요"); return; }
        try {
            int comma = b64.indexOf(',');
            if (b64.startsWith("data:") && comma > 0) b64 = b64.substring(comma + 1);
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            if (bytes.length < 100) { call.reject("그림이 비었어요"); return; }
            File dir = new File(c.getCacheDir(), DIR);
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File o : old) { try { o.delete(); } catch (Exception ignored) { } }       // 지난 그림은 지운다
            File f = new File(dir, "gildongmu_" + System.currentTimeMillis() + ".png");
            FileOutputStream os = new FileOutputStream(f);
            try { os.write(bytes); } finally { os.close(); }
            Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".gdmshare", f);
            Intent it = new Intent(Intent.ACTION_SEND);
            it.setType("image/png");
            it.putExtra(Intent.EXTRA_STREAM, uri);
            it.setClipData(ClipData.newRawUri("route", uri));                                  // 받는 앱이 그림을 읽을 권한을 확실히 받게(없으면 카카오톡이 무한 로딩에 빠질 수 있다)
            if (text != null && text.length() > 0) it.putExtra(Intent.EXTRA_TEXT, text);
            it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // 예전엔 카카오톡을 바로 열었더니(setPackage + 새 작업) 카카오톡 화면이 검게 멈춘 채 로딩만 돌았다(2026-10-15 YJ 실기기).
            // → 안드로이드 표준 공유 목록(chooser)으로 연다. 그림 읽기 권한은 고른 앱에 시스템이 직접 준다. 카카오톡이 깔려 있으면 목록 맨 앞에 올려 준다.
            Intent ch = Intent.createChooser(it, "내 위치 공유");
            if (pkg != null && pkg.length() > 0) {
                Intent k = new Intent(it); k.setPackage(pkg);
                ch.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { k });
            }
            ch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (!(c instanceof Activity)) ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);          // 화면(Activity)에서 열 때는 새 작업으로 띄우지 않는다
            c.startActivity(ch);
            boolean direct = false;
            JSObject o = new JSObject(); o.put("ok", true); o.put("direct", direct); call.resolve(o);
        } catch (Exception e) {
            call.reject("공유를 열지 못했어요: " + e.getClass().getSimpleName());
        }
    }
}
