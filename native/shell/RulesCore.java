package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.List;
import java.util.Map;

/**
 * 앱 규칙(욕설 거르기 · 탄 노선 기록) 쪽 껍데기. 판정과 계산은 전부 엔진(POST /rules)이 한다.
 * 여기는 요청 본문을 만들고, 답에서 문구와 새 저장값을 꺼내 저장소에 그대로 넣는 일만 한다. 순수 자바(안드로이드 몰라도 시험 가능).
 */
public final class RulesCore {
    private RulesCore() { }

    /** 글·댓글·채팅을 올려도 되는지 묻는 요청. */
    public static String checkBody(ShellCore.Store st, String kind, String cat, long now, String... texts) {
        StringBuilder b = new StringBuilder("{\"op\":\"check\",\"kind\":").append(ShellCore.q(kind)).append(",\"cat\":").append(ShellCore.q(cat == null ? "" : cat));
        b.append(",\"texts\":[");
        for (int i = 0; i < texts.length; i++) { if (i > 0) b.append(','); b.append(ShellCore.q(texts[i] == null ? "" : texts[i])); }
        return b.append("]}").toString();
    }

    /** 탄 노선 기록 요청. my 는 저장된 기록(JSON 배열), sec 는 이번 경로의 노선 이름들. */
    public static String mylinesBody(String myJson, List<String> sec, long now) {
        StringBuilder b = new StringBuilder("{\"op\":\"mylines\",\"now\":").append(now).append(",\"my\":").append(myJson == null || !myJson.startsWith("[") ? "[]" : myJson).append(",\"sec\":[");
        for (int i = 0; sec != null && i < sec.size(); i++) { if (i > 0) b.append(','); b.append(ShellCore.q(sec.get(i))); }
        return b.append("]}").toString();
    }

    /** 검사 결과: 올려도 되면 "", 안 되면 사용자에게 보일 문구. 엔진 답이 없거나 깨졌으면 막지 않는다(서버도 한 번 더 거른다). */
    @SuppressWarnings("unchecked")
    public static String checkError(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return "";
            Map<String, Object> m = (Map<String, Object>) o;
            if (Boolean.FALSE.equals(m.get("ok"))) { Object s = m.get("msg"); return s instanceof String && ((String) s).length() > 0 ? (String) s : "등록할 수 없어요"; }
        } catch (Exception e) { /* 판정 불가 → 통과 */ }
        return "";
    }

    /** 탄 노선 기록 답을 저장소(ChatCore.K_MY)에 반영한다. */
    @SuppressWarnings("unchecked")
    public static boolean applyMyLines(ShellCore.Store st, String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return false;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get("my") instanceof List)) return false;
            st.put(ChatCore.K_MY, toJson(m.get("my")));
            return true;
        } catch (Exception e) { return false; }
    }

    /** 파싱된 값(Map · List · 문자열 · 숫자 · 불리언)을 다시 JSON 으로. 엔진이 준 값을 그대로 보관하기 위한 것. */
    @SuppressWarnings("unchecked")
    static String toJson(Object v) {
        if (v == null) return "null";
        if (v instanceof String) return ShellCore.q((String) v);
        if (v instanceof Boolean) return v.toString();
        if (v instanceof Number) { double d = ((Number) v).doubleValue(); return d == Math.rint(d) && Math.abs(d) < 1e15 ? Long.toString((long) d) : Double.toString(d); }
        if (v instanceof List) {
            StringBuilder b = new StringBuilder("[");
            boolean f = true; for (Object x : (List<Object>) v) { if (!f) b.append(','); f = false; b.append(toJson(x)); }
            return b.append(']').toString();
        }
        if (v instanceof Map) {
            StringBuilder b = new StringBuilder("{");
            boolean f = true; for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) { if (!f) b.append(','); f = false; b.append(ShellCore.q(e.getKey())).append(':').append(toJson(e.getValue())); }
            return b.append('}').toString();
        }
        return "null";
    }
}
