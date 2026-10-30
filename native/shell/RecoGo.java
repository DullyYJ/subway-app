package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/**
 * 오버레이 추천 줄의 [맛집 보기]/[쿠팡 보기]: 쿠팡 상품이면 엔진이 고른 상품 주소를, 가게면 카카오맵에서 도착지 근처 그 이름을 찾아 연다(카카오맵이 없으면 웹).
 * 어떤 가게·상품인지와 버튼 이름은 엔진 값이고, 여기는 주소를 열기만 한다.
 */
final class RecoGo {
    private RecoGo() { }

    /** 열 주소 두 개 [앱 주소(비면 없음), 웹 주소]. 순수 계산 — 시험이 쓴다. */
    static String[] urls(String shopUrl, String name, double[] loc) {
        if (shopUrl != null && shopUrl.startsWith("https://")) return new String[] { "", shopUrl };
        String q = Uri.encode(name == null ? "" : name);
        return new String[] { "kakaomap://search?q=" + q + (loc != null && loc.length == 2 ? "&p=" + loc[0] + "," + loc[1] : ""), "https://map.kakao.com/link/search/" + q };
    }

    static void open(Context c, RideCore.RecoAd ad, double[] loc, OvCore.Row r) {
        String q = RideCore.recoQuery(ad);
        if (q.length() == 0 && (ad == null || ad.url == null || ad.url.length() == 0)) {
            try { c.startActivity(new Intent(c, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)); } catch (Throwable ignored) { }
            return;
        }
        String[] u = urls(ad == null ? "" : ad.url, q, loc);
        try {
            if (u[0].length() > 0) {
                try { c.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u[0])).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; }
                catch (ActivityNotFoundException ignored) { /* 카카오맵이 없으면 웹으로 */ }
            }
            c.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u[1])).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Throwable t) {
            try { c.startActivity(new Intent(c, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)); } catch (Throwable ignored) { }
        }
    }
}
