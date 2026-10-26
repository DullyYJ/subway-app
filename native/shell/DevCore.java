package com.dullyyj.subway;

/**
 * 개발자 도구(출시 전 삭제) — 가짜 여정(임학→아라)을 떠 있는 안내 막대에 보내 단계별 색·글을 실기기로 확인한다. 순수 자바.
 * 단계는 시간(경과 초)으로만 정해진다: 전체 시나리오 75초 = 평상시 0~15 → 추천 15~30 → 2정거장 전 30~45 → 1정거장 전 45~60 → 마무리 60~75.
 * 한 단계만 고르면 그 단계를 15초 보인다. 막대 글은 시험용 고정 글이다(제품 문구가 아니다 — 이 화면과 함께 출시 전에 지운다).
 * 화면(글·버튼 구성)은 엔진 settings.js 의 settingsPageDev 가 만든다. 여기는 기기 사실(ph · left · stopped)만 만든다.
 */
public final class DevCore {
    private DevCore() { }

    public static final int ALL_SEC = 75, ONE_SEC = 15, QUIT_AT = 15;

    /** 'dev.start.<모드>' → 모드 이름(all · plain · reco · alert2 · alert1 · quit), 아니면 null. */
    public static String mode(String v) {
        if (v == null || !v.startsWith("dev.start.")) return null;
        String m = v.substring(10);
        return ("all".equals(m) || "plain".equals(m) || "reco".equals(m) || "alert2".equals(m) || "alert1".equals(m) || "quit".equals(m)) ? m : null;
    }
    /** 모드의 전체 길이(초). */
    public static int total(String mode) { return "all".equals(mode) ? ALL_SEC : ONE_SEC; }
    /** 경과 sec 초일 때의 단계(plain · reco · alert2 · alert1 · quit)와 "끝났다"(null). 마무리 구간(60~75초)은 plain 으로 보인다. */
    public static String phaseAt(String mode, int sec) {
        if (sec < 0 || sec >= total(mode)) return null;
        if (!"all".equals(mode)) return mode;
        return sec < 15 ? "plain" : (sec < 30 ? "reco" : (sec < 45 ? "alert2" : (sec < 60 ? "alert1" : "plain")));
    }
    /** 막대에 보일 글: { 윗줄, 아랫줄, 큰 안내, 단계(0 평소 · 1 하차 직전 · 2 두 정거장 전) }. 막대가 없는 단계(추천 · 종료 예약)는 null. */
    public static String[] bar(String phase) {
        if ("plain".equals(phase)) return new String[] { "테스트 · 임학 ▸ 다음 역", "아라까지 14분", "", "0" };
        if ("alert2".equals(phase)) return new String[] { "테스트 · 두 정거장 전", "아라까지 3분", "곧 내려요 (테스트)", "2" };
        if ("alert1".equals(phase)) return new String[] { "테스트 · 한 정거장 전", "아라까지 1분", "내릴 준비를 해주세요 (테스트)", "1" };
        return null;
    }
    /** 엔진 개발자 도구 화면에 보내는 기기 사실. phase 가 null 이면 진행 중 아님. */
    public static String pageFacts(String phase, int left, boolean stopped) {
        StringBuilder b = new StringBuilder("{\"pf\":{\"nat\":true,\"nv\":true");
        if (phase != null) b.append(",\"ph\":").append(ShellCore.q(phase)).append(",\"left\":").append(Math.max(0, Math.min(600, left)));
        if (stopped) b.append(",\"stopped\":true");
        return b.append("}}").toString();
    }
    /** 개발자 도구 사실에 반응 속도 기록(PerfLog.snapshot)을 덧붙인다. 닫는 }} 앞에 "perf" 를 끼운다. */
    public static String withPerf(String facts, String perfJson) {
        if (facts == null || perfJson == null || !facts.endsWith("}}")) return facts;
        return facts.substring(0, facts.length() - 2) + ",\"perf\":" + perfJson + "}}";
    }
}
