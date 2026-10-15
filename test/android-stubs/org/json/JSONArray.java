// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package org.json;
public class JSONArray { public int length() { return 0; } public int optInt(int i, int d) { return d; } public String optString(int i, String d) { return d; } }
