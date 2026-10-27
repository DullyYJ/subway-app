package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

/**
 * 쿠팡 추천 '최근에 보여 준 상품' 기억 (s262, YJ: 요일·날씨·시간에 따라 주기적으로 바뀌어야 해).
 * 엔진은 상태가 없어서 어제 무엇을 추천했는지 모른다 → 앱이 최근 상품 이름을 들고 있다가 요청에 shopRecent 로 실어 보내고,
 * 엔진(rtxPickShopItem)이 그 이름들을 뺀 나머지에서 고른다(전부 최근이면 다시 허용). 여기는 기억·전달만 하고 고르는 판단은 엔진이 한다.
 * 순수 자바(안드로이드 없음) — 기기 저장은 RecoNotify 가 한다. 저장 모양: 줄마다 "시각\t이름" · 최대 20개 · 5일이 지나면 잊는다.
 */
final class ShopRecent {
    private ShopRecent() { }
    static final int MAX = 20;
    static final long TTL_MS = 5L * 86400000L;
    static final String KEY = "shop_recent";

    private static String clean(String n) { return n == null ? "" : n.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ').trim(); }

    /** 저장본에 이름 하나를 맨 앞에 더한 새 저장본. 같은 이름은 하나만 · 오래된 것·넘치는 것은 버린다. */
    static String add(String stored, String name, long now) {
        String nm = clean(name);
        if (nm.length() == 0) return stored == null ? "" : stored;
        StringBuilder b = new StringBuilder().append(now).append('\t').append(nm);
        int n = 1;
        if (stored != null) for (String ln : stored.split("\n")) {
            int t = ln.indexOf('\t'); if (t <= 0) continue;
            long ts; try { ts = Long.parseLong(ln.substring(0, t)); } catch (NumberFormatException e) { continue; }
            String x = ln.substring(t + 1);
            if (x.equals(nm) || now - ts > TTL_MS || ts > now + 86400000L) continue;
            if (n >= MAX) break;
            b.append('\n').append(ln); n++;
        }
        return b.toString();
    }

    /** 저장본 → 지금 유효한 이름들(최근 순). */
    static java.util.List<String> names(String stored, long now) {
        java.util.ArrayList<String> out = new java.util.ArrayList<String>();
        if (stored == null) return out;
        for (String ln : stored.split("\n")) {
            int t = ln.indexOf('\t'); if (t <= 0) continue;
            long ts; try { ts = Long.parseLong(ln.substring(0, t)); } catch (NumberFormatException e) { continue; }
            if (now - ts > TTL_MS || ts > now + 86400000L) continue;
            out.add(ln.substring(t + 1));
            if (out.size() >= MAX) break;
        }
        return out;
    }

    /** 요청 본문(JSON 객체 글)에 "shopRecent":[…] 를 덧붙인다. 이미 있거나 기억이 없거나 본문이 객체가 아니면 그대로. */
    static String inject(String body, java.util.List<String> names) {
        if (body == null || names == null || names.isEmpty() || body.contains("\"shopRecent\"")) return body;
        int e = body.lastIndexOf('}');
        if (e < 0 || !body.trim().startsWith("{")) return body;
        StringBuilder a = new StringBuilder("\"shopRecent\":[");
        for (int i = 0; i < names.size(); i++) { if (i > 0) a.append(','); a.append(ShellCore.q(names.get(i))); }
        a.append(']');
        String head = body.substring(0, e).trim();
        return head + (head.endsWith("{") ? "" : ",") + a + body.substring(e);
    }

    /** /reco-text 응답에서 쿠팡 추천 상품 이름(shopItem.n) — 없으면 "". */
    @SuppressWarnings("unchecked")
    static String itemName(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof java.util.Map)) return "";
            java.util.Map<String, Object> m = (java.util.Map<String, Object>) o;
            if (!(m.get("shopItem") instanceof java.util.Map)) return "";
            return clean(BoardCore.s(((java.util.Map<String, Object>) m.get("shopItem")).get("n"), 120));
        } catch (Throwable e) { return ""; }
    }
}
