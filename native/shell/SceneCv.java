package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 장면(혼잡도 카드의 3D 캐릭터 장면)을 그리는 도화지 — 웹의 Canvas2D 와 거의 같은 모양의 인터페이스.
 *  · 안드로이드: AndroidCv(android.graphics.Canvas + Paint + Path) — Compose Canvas 의 nativeCanvas 위에 그린다
 *  · 이 PC 시험: java.awt(Graphics2D) — 그림이 어떻게 나오는지 JVM 에서 PNG 로 뽑아 웹 그림과 눈으로 비교할 수 있다.
 *  좌표·길이는 모두 '장면 좌표(design px)'. 맨 밑 변환(밀도·확대)은 만든 쪽이 이미 걸어 둔다. android.* 를 쓰지 않는다.
 *  색은 0xAARRGGBB 정수 — 웹의 '#rgb' / 'rgba(r,g,b,a)' 글자는 SceneUtil.css(..) 로 바꿔 쓴다.
 */
public interface SceneCv {
    /** 색 그라데이션(Canvas2D 의 CanvasGradient). */
    interface Grad { Grad stop(double pos, int argb); }
    /** 그림(스프라이트 시트 · 미리 그린 배경 한 장). 크기는 픽셀. */
    interface Img { int w(); int h(); }
    /** 따로 그려 두는 바탕 그림. cv() 는 장면 좌표(w×h)가 dpr 배 촘촘한 픽셀에 대응하는 도화지. */
    interface Layer extends Img { SceneCv cv(); }

    void save();
    void restore();
    void translate(double x, double y);
    void rotate(double rad);
    void scale(double sx, double sy);

    void fillStyle(int argb);
    void fillGrad(Grad g);
    void strokeStyle(int argb);
    void lineWidth(double w);
    void lineCapRound(boolean round);
    /** 이후 그리는 모든 것에 곱해지는 투명도(0~1). */
    void globalAlpha(double a);

    default void fillStyle(String css) { fillStyle(SceneUtil.css(css)); }
    default void strokeStyle(String css) { strokeStyle(SceneUtil.css(css)); }

    void beginPath();
    void moveTo(double x, double y);
    void lineTo(double x, double y);
    void quadTo(double cx, double cy, double x, double y);
    void bezierTo(double c1x, double c1y, double c2x, double c2y, double x, double y);
    void closePath();
    void rect(double x, double y, double w, double h);
    /** 시계 방향(화면 y 아래로) a0→a1. Canvas2D arc(…, anticlockwise=false) 와 같다. 새 부분 경로로 시작한다. */
    void arc(double cx, double cy, double r, double a0, double a1);
    /** Canvas2D ellipse(…) 와 같다(새 부분 경로). rot 는 타원 회전(라디안). */
    void ellipse(double cx, double cy, double rx, double ry, double rot, double a0, double a1);
    void fill();
    void stroke();
    void clip();
    void fillRect(double x, double y, double w, double h);

    /** 굵은 글자 크기(장면 px) — 'bold 10px sans-serif' */
    void font(double px);
    /** 가운데 맞춤 · 세로 가운데 기준으로 현재 fillStyle 색 글자를 쓴다. */
    void fillTextC(String s, double x, double y);
    double measureText(String s);

    Grad linear(double x0, double y0, double x1, double y1);
    Grad radial(double x0, double y0, double r0, double x1, double y1, double r1);

    /** 그림의 (sx,sy,sw,sh) 부분을 (dx,dy,dw,dh) 에 그린다. */
    void drawImage(Img img, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh);
    void drawImage(Img img, double dx, double dy, double dw, double dh);

    /** 같은 도구로 그릴 수 있는 새 바탕 그림. dpr 만큼 촘촘하게 만든다. */
    Layer newLayer(double w, double h, double dpr);
}
