// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package org.json;
public class JSONObject { public JSONObject(String s) throws JSONException {} public boolean optBoolean(String k, boolean d) { return d; } public String optString(String k, String d) { return d; } public int optInt(String k, int d) { return d; }
  public double optDouble(String k) { return 0; } public boolean has(String k) { return false; } public JSONArray optJSONArray(String k) { return null; } }
