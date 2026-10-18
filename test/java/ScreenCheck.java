package com.dullyyj.subway;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStreamReader;

/** 엔진이 만든 화면 JSON(한 줄에 하나)을 앱 검증기(ScreenCore.load)와 배치(layout)에 넣어 본다. 사용: java ScreenCheck <줄 단위 JSON 파일>  → 줄마다 "OK 노드수 건너뜀 본문높이" 또는 "FAIL 사유" */
public class ScreenCheck {
    public static void main(String[] a) throws Exception {
        ScreenCore.Measurer m = new ScreenCore.Measurer() {
            public float width(String s, float size, boolean bold) {
                float w = 0; for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); w += (c == ' ' ? 0.3f : (c < 128 ? 0.5f : 1f)) * size * (bold ? 1.05f : 1f); }
                return w;
            }
        };
        BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(a[0]), "UTF-8"));
        String line; int n = 0, bad = 0;
        while ((line = r.readLine()) != null) {
            if (line.length() == 0) continue;
            n++;
            try {
                ScreenCore.Screen s = ScreenCore.load(line);
                float h1 = ScreenCore.layout(s, 360f, m).bodyH, h2 = ScreenCore.layout(s, 280f, m).bodyH;
                System.out.println("OK " + s.nodes + " " + s.skipped + " " + Math.round(h1) + " " + Math.round(h2));
            } catch (ScreenCore.ParseError e) { bad++; System.out.println("FAIL " + e.getMessage()); }
        }
        System.exit(bad == 0 ? 0 : 1);
    }
}
