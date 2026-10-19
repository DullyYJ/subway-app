// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package org.json;
public class JSONObject { public JSONObject() {} public JSONObject(String s) throws JSONException {} public boolean optBoolean(String k, boolean d) { return d; } public String optString(String k, String d) { return d; } public int optInt(String k, int d) { return d; }
  public double optDouble(String k) { return 0; } public double optDouble(String k, double d) { return d; } public boolean has(String k) { return false; } public JSONArray optJSONArray(String k) { return null; }   // 실제 org.json 처럼 put 은 JSONException 을 던진다(JSObject 가 덮어쓰는 형만 던지지 않는다) — 이걸 빼면 CI 에서만 컴파일 오류가 난다
  public JSONObject put(String k, boolean v) throws JSONException { return this; } public JSONObject put(String k, double v) throws JSONException { return this; }
  public JSONObject put(String k, int v) throws JSONException { return this; } public JSONObject put(String k, long v) throws JSONException { return this; } public JSONObject put(String k, Object v) throws JSONException { return this; } }
