package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 노선도 화면 위치·배율(카메라) 계산. android.* 를 쓰지 않아 JVM 에서 시험할 수 있다.
 *
 * 화면 좌표 = SVG 좌표 * scale + (tx, ty)   (단위: 화면 픽셀, scale = 화면px / SVG단위)
 * 앱의 웹 노선도(_pzFit / _metroCommitZoom)와 같은 규칙:
 *   · 최소 배율 = 화면 높이에 노선도 전체 높이가 꼭 맞는 배율, 최대 = CSS 20배(기기 픽셀로는 20 * density)
 *   · 열자마자 최소 배율, 서울역 부근(1280,1090)이 화면 가운데
 *   · 지도 밖으로는 밀리지 않는다(가로·세로 모두)
 */
public final class MetroCamera {
    public static final float FOCUS_X = 1280f, FOCUS_Y = 1090f;

    public final float svgW, svgH;
    public float viewW = 0f, viewH = 0f;
    public float scale = 1f, tx = 0f, ty = 0f;
    public float minScale = 0.05f, maxScale = 20f;

    public MetroCamera(float svgW, float svgH) {
        this.svgW = svgW;
        this.svgH = svgH;
    }

    /** 보이는 영역 크기가 바뀔 때. 위쪽-왼쪽 기준을 유지하고 범위 안으로 되돌린다. */
    public void setView(float w, float h, float maxScale) {
        viewW = w;
        viewH = h;
        this.maxScale = maxScale;
        minScale = h > 1f ? h / svgH : 0.05f;
        if (minScale > maxScale) minScale = maxScale;
        scale = clampScale(scale);
        clamp();
    }

    public float clampScale(float s) {
        if (!(s > 0f)) s = minScale;
        return Math.max(minScale, Math.min(maxScale, s));
    }

    /** 처음 상태: 최소 배율 + 서울역 부근이 화면 가운데 */
    public void fit() {
        scale = minScale;
        tx = viewW / 2f - FOCUS_X * scale;
        ty = viewH / 2f - FOCUS_Y * scale;
        clamp();
    }

    /** 지도 밖으로 못 나가게. 화면이 지도보다 크면 가운데에 둔다. */
    public void clamp() {
        float cw = svgW * scale, ch = svgH * scale;
        if (cw <= viewW) tx = (viewW - cw) / 2f;
        else tx = Math.max(viewW - cw, Math.min(0f, tx));
        if (ch <= viewH) ty = (viewH - ch) / 2f;
        else ty = Math.max(viewH - ch, Math.min(0f, ty));
    }

    /** 밀어서 움직일 수 있는 범위(스크롤 위치 = -t). 화면이 지도보다 크면 min=max */
    public float minScrollX() { return 0f; }
    public float maxScrollX() { return Math.max(0f, svgW * scale - viewW); }
    public float minScrollY() { return 0f; }
    public float maxScrollY() { return Math.max(0f, svgH * scale - viewH); }

    public void panBy(float dx, float dy) {
        tx += dx;
        ty += dy;
        clamp();
    }

    /** 밀었는데 지도가 가로로 더 못 가서 남은(잘려 나간) 양. 0 이면 그만큼 다 움직였다. 부호는 손가락이 간 쪽. */
    public float panByLeftoverX(float dx, float dy) {
        float before = tx;
        panBy(dx, dy);
        float left = dx - (tx - before);
        return Math.abs(left) < 0.01f ? 0f : left;
    }

    /**
     * 지도 가장자리에서 더 밀어 다른 탭(버스)으로 넘길지. over = 가장자리에서 더 밀린 가로 양(px, 부호 = 손가락이 간 쪽),
     * overY = 그 사이 세로로 움직인 양(px, 절댓값 합), thr = 문턱(px). 넘기면 손가락이 간 쪽(-1 왼쪽 · +1 오른쪽), 아니면 0.
     */
    public static int edgeSwipe(float over, float overY, float thr) {
        float a = Math.abs(over);
        if (!(a >= thr) || a < 1.5f * Math.abs(overY)) return 0;
        return over < 0f ? -1 : 1;
    }

    /** 화면 한 점(fx,fy) 아래의 지도 위치를 그대로 둔 채 배율만 바꾼다. */
    public void zoomAbout(float fx, float fy, float newScale) {
        float ns = clampScale(newScale);
        float k = ns / scale;
        tx = fx - (fx - tx) * k;
        ty = fy - (fy - ty) * k;
        scale = ns;
        clamp();
    }

    /** 지도 위 (x,y) 를 화면 (sx,sy) 에 오게 한다. */
    public void place(float x, float y, float sx, float sy) {
        tx = sx - x * scale;
        ty = sy - y * scale;
        clamp();
    }

    public float svgX(float px) { return (px - tx) / scale; }
    public float svgY(float py) { return (py - ty) / scale; }
    public float screenX(float x) { return x * scale + tx; }
    public float screenY(float y) { return y * scale + ty; }

    /** 지도 위 점이 화면(여백 margin 안쪽) 안에 보이는지 */
    public boolean isVisible(float x, float y, float margin) {
        float sx = screenX(x), sy = screenY(y);
        return sx >= margin && sx <= viewW - margin && sy >= margin && sy <= viewH - margin;
    }
}
