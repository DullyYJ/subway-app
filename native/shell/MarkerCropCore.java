package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 마커 사진 자르기 계산(순수 — 안드로이드 없음). 사진을 화면에 놓고(중심 좌표 px,py · 배율 s = 화면 픽셀/사진 픽셀),
 * 화면 가운데 고정 동그라미(중심 cx,cy · 반지름 R)에 들어온 부분이 마커가 된다. 동그라미는 늘 사진 안에 있어야 한다.
 */
final class MarkerCropCore {
    private MarkerCropCore() { }
    static final float MAX_ZOOM = 6f;

    /** 동그라미가 사진 짧은 변에 딱 맞는 가장 작은 배율. */
    static float minScale(int w, int h, float rad) { return 2f * rad / Math.max(1, Math.min(w, h)); }

    /** 배율 · 위치를 허용 범위로 맞춘다 → { s, px, py }. 동그라미가 사진 밖으로 나가지 않게. */
    static float[] clamp(int w, int h, float cx, float cy, float rad, float s, float px, float py) {
        float lo = minScale(w, h, rad), hi = lo * MAX_ZOOM;
        s = Math.max(lo, Math.min(hi, s));
        float hw = w * s / 2f, hh = h * s / 2f;
        // 사진 왼쪽 끝 = px - hw 가 동그라미 왼쪽(cx - rad) 이하, 오른쪽 끝 px + hw 가 cx + rad 이상
        px = Math.max(cx + rad - hw, Math.min(cx - rad + hw, px));
        py = Math.max(cy + rad - hh, Math.min(cy - rad + hh, py));
        return new float[] { s, px, py };
    }

    /** 처음 놓는 자리: 동그라미가 사진 가운데에 오고 짧은 변에 꽉 차게 → { s, px, py }. */
    static float[] initial(int w, int h, float cx, float cy, float rad) { return new float[] { minScale(w, h, rad), cx, cy }; }

    /** 동그라미가 가리키는 사진 안의 원 → { 중심 u, 중심 v, 반지름 r } (사진 픽셀). */
    static float[] srcCircle(int w, int h, float cx, float cy, float rad, float s, float px, float py) {
        return new float[] { w / 2f + (cx - px) / s, h / 2f + (cy - py) / s, rad / s };
    }

    /** 두 손가락 확대: 손가락 중심(fx,fy)이 가리키는 사진 점이 그대로 있게 배율을 바꾼다 → { s, px, py }(범위 맞춤 전). */
    static float[] zoomAbout(float s, float px, float py, float ns, float fx, float fy) {
        float k = ns / s;
        return new float[] { ns, fx + (px - fx) * k, fy + (py - fy) * k };
    }

    /** 마커 사진의 열쇠(워커 markerKey 와 같은 규칙): 영문·숫자·밑줄·붙임표 말고는 '_' · 34자까지. */
    static String key(String cid) {
        if (cid == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < cid.length() && b.length() < 34; i++) {
            char c = cid.charAt(i);
            b.append((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' ? c : '_');
        }
        return b.toString();
    }
}
