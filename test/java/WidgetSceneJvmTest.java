package com.dullyyj.subway;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * 위젯 출퇴근 장면 목록(WidgetSceneCore) 읽기 시험 — 목록은 엔진(cmWidgetScenes)이 낸 응답을 파일로 받고,
 * 기대값은 node 쪽이 예전 위젯 규칙으로 따로 구해 넘긴다.   java WidgetSceneJvmTest <응답파일> <지금ms:기대키|-> …
 */
public class WidgetSceneJvmTest {
    static int fails = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (!c) fails++; }

    public static void main(String[] a) throws Exception {
        String json = new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8);
        WidgetSceneCore.Plan p = WidgetSceneCore.parse(json);
        ok(p != null && p.list.size() > 0, "엔진 응답을 읽는다");
        ok(p.validMs == 5400000L && p.showMs == 180000L, "기다리는 시간 90분 · 떠 있는 시간 3분은 응답 값");
        ok("출근하기".equals(p.btnOf("morn")) && "퇴근하기".equals(p.btnOf("eve")) && p.sayOf("morn", 0).length() > 0 && p.sayOf("eve", 0).length() > 0, "버튼 이름 · 기본 문구는 응답 값");
        for (int i = 1; i < a.length; i++) {
            String[] kv = a[i].split(":", 2);
            long now = Long.parseLong(kv[0]);
            WidgetSceneCore.Entry e = p.pick(now, "");
            ok((e == null ? "-" : e.key).equals(kv[1]), "지금 " + now + " → " + kv[1] + " (실제 " + (e == null ? "-" : e.key) + ")");
        }
        WidgetSceneCore.Entry first = p.list.get(0);
        ok(p.pick(first.at, first.key) == null || !p.pick(first.at, first.key).key.equals(first.key), "이미 끝낸 키는 다시 고르지 않는다");
        ok(p.find(first.key) == first && p.find("없는키") == null && p.find("") == null, "키로 칸 찾기");
        ok(p.nextAt(first.at - 5000L) == first.at && p.nextAt(first.at - 500L) != first.at, "다음 시작 시각(1초 뒤부터)");
        ok(WidgetSceneCore.parse("망가짐") == null && WidgetSceneCore.parse("{\"ok\":false}") == null && WidgetSceneCore.parse("{\"ok\":true,\"list\":[],\"validMs\":0,\"showMs\":1}") == null, "깨진 응답은 null");
        boolean[] d = { false, true, true, true, true, true, false };
        String body = WidgetSceneCore.reqBody(5L, true, true, false, "07:30", "18:30", d);
        ok(body.equals("{\"op\":\"wscene\",\"nowMs\":5,\"on\":true,\"mOn\":true,\"eOn\":false,\"morn\":\"07:30\",\"eve\":\"18:30\",\"days\":[1,2,3,4,5]}"), "요청 본문 " + body);
        ok(!WidgetSceneCore.sig(true, true, true, "07:30", "18:30", d).equals(WidgetSceneCore.sig(true, true, true, "07:31", "18:30", d)), "설정이 바뀌면 서명이 다르다");
        System.out.println(fails == 0 ? "ALL OK" : fails + " FAIL");
        if (fails != 0) System.exit(1);
    }
}
