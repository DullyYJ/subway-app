package com.dullyyj.subway;

import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.awt.geom.AffineTransform;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.lang.reflect.Field;

/** 화면 JSON → ScreenCore 레이아웃 숫자 덤프(웹 요소 덤프와 눈으로 비교하려는 개발 도구; 앱에는 들어가지 않는다). 사용: LayoutDump <json> [폭dp] [보이는 높이dp] */
public class LayoutDump {
    static Font reg, bold;
    static final FontRenderContext FRC = new FontRenderContext(new AffineTransform(), true, true);
    static float w(String s, float size, boolean b) {
        Font f = (b ? bold : reg).deriveFont(size);
        return (float) f.getStringBounds(s, FRC).getWidth();
    }
    public static void main(String[] a) throws Exception {
        System.setProperty("java.awt.headless", "true");
        reg = new Font("Noto Sans CJK KR", Font.PLAIN, 12); bold = new Font("Noto Sans CJK KR", Font.BOLD, 12);
        String json = new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8);
        float width = a.length > 1 ? Float.parseFloat(a[1]) : 411f;
        ScreenCore.Measurer M = new ScreenCore.Measurer() { public float width(String s, float size, boolean b) { return w(s, size, b); } };
        long t0 = System.nanoTime();
        ScreenCore.Screen sc = ScreenCore.load(json);
        long t1 = System.nanoTime();
        float viewH = a.length > 2 ? Float.parseFloat(a[2]) : 0f;
        ScreenCore.Layout L = ScreenCore.layout(sc, width, M, null, viewH);
        long t2 = System.nanoTime();
        System.out.println("# load " + (t1 - t0) / 1000 + "us layout " + (t2 - t1) / 1000 + "us headH=" + L.headH + " bodyH=" + L.bodyH + " footH=" + L.footH);
        dump("head", L.head); dump("body", L.body); dump("foot", L.foot);
    }
    static void dump(String sec, ScreenCore.Item[] items) throws Exception {
        for (ScreenCore.Item it : items) {
            String txt = "";
            if (it.lines != null && it.lines.length > 0) txt = it.lines[0];
            else if (it.label != null && it.label.length() > 0) txt = it.label;
            else if (it.badge != null) txt = it.badge;
            if (txt.length() > 24) txt = txt.substring(0, 24);
            System.out.println(sec + " | k" + it.kind + " | " + txt.replace('\n', ' ') + " | x" + r(it.x) + " y" + r(it.y) + " w" + r(it.w) + " h" + r(it.h) + " | sz" + r(it.size));
        }
    }
    static String r(float f) { return String.valueOf(Math.round(f)); }
}
