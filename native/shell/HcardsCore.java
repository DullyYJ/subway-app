package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.Random;

/**
 * 홈 카드 묶음(AI 승무원 · 혼잡도 · 실시간 대화)의 순수 자바 상태기 — 2026-10-20 (s93).
 * 카드 글·색·막대·줄 수는 모두 엔진(/screen/hcards)이 정한다. 여기는 이 기기가 쥔 사실(위치·다음 갱신 시각·새로고침 눌림·받아 둔 대화)을 요청으로 옮기고 눌림의 뜻만 정한다.
 */
public final class HcardsCore {
    public static final int R_NONE = 0, R_AI = 1, R_TALK_OPEN = 2, R_TALK_SEND = 3;
    public static final long AI_EVERY_MS = 5 * 60 * 1000L;

    public double[] fix = null;                       // 마지막으로 안 기기 위치(위도, 경도)
    public long fixAt = 0;
    public long aiNextAt = 0;                         // 다음 자동 갱신 시각(기기 시계 ms). 0 이면 아직 정하지 않음
    public double aiRnd = 0.5;                        // 마무리 문구를 고를 난수(새로고침마다 바뀐다)
    public boolean aiBusy = false;
    public int rev = 0;                               // 요청에 실리는 값이 바뀔 때마다 오른다
    public String sendText = "";
    private final Random rnd = new Random();

    public void setFix(double la, double lo, long now) { fix = new double[] { la, lo }; fixAt = now; rev++; }
    /** 자동 갱신 시각이 없거나 지났으면 새로 정한다. 정했으면 true. */
    public boolean ensureNext(long now) {
        if (aiNextAt > now) return false;
        aiNextAt = now + AI_EVERY_MS; aiRnd = rnd.nextDouble(); rev++;
        return true;
    }
    public void refreshAi(long now) { aiNextAt = now + AI_EVERY_MS; aiRnd = rnd.nextDouble(); rev++; }

    /** 엔진 POST /screen/hcards 본문. resultFacts 는 HomeCore.resultFacts() 값(경로가 없으면 "null"), talks 는 ChatCore.recentTalksJson() 값. */
    public String request(int cap, String theme, HomeCore.Env env, String resultFacts, String talks) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"now\":").append(env.nowMs).append(",\"tz\":").append(-env.tzoMin);
        b.append(",\"th\":").append(ShellCore.q("dark".equals(theme) ? "dark" : "pastel")).append(",\"hol\":").append(env.hol);
        b.append(",\"gps\":").append(fix == null ? "null" : "[" + fix[0] + "," + fix[1] + "]");
        b.append(",\"r\":").append(resultFacts == null || resultFacts.length() == 0 ? "null" : resultFacts);
        b.append(",\"ai\":{\"nextAt\":").append(aiNextAt).append(",\"busy\":").append(aiBusy).append(",\"rnd\":").append(aiRnd).append('}');
        b.append(",\"tk\":{\"m\":").append(talks == null || talks.length() == 0 ? "[]" : talks).append(",\"fold\":0,\"tzo\":").append(env.tzoMin).append("}}}");
        return b.toString();
    }
    /** 같은 카드면 엔진에 다시 묻지 않으려고 쓰는 열쇠(분 단위 시각 포함). */
    public String key(int resRev, String tab, long now, int talkN, String lastTalk) {
        return resRev + ":" + tab + ":" + (now / 60000) + ":" + rev + ":" + talkN + ":" + (lastTalk == null ? "" : lastTalk) + ":" + aiNextAt;
    }
    /** 눌림. tk.send 는 입력된 글(fields['talk.in'])을 받는다. */
    public int act(String v, String input) {
        if ("ai.refresh".equals(v)) return R_AI;
        if ("tk.open".equals(v)) return R_TALK_OPEN;
        if ("tk.send".equals(v)) {
            String t = input == null ? "" : input.trim();
            if (t.length() == 0) return R_NONE;
            sendText = t.length() > 100 ? t.substring(0, 100) : t;
            return R_TALK_SEND;
        }
        return R_NONE;
    }
}
