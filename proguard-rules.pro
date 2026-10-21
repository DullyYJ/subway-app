# 앱 코드는 줄이지도 이름을 바꾸지도 않는다(위젯·서비스·리소스 이름 찾기·오류 기록의 줄 번호를 그대로 쓴다).
-keep class com.dullyyj.subway.** { *; }
-keepattributes SourceFile,LineNumberTable,Signature,*Annotation*
# 라이브러리: 지도(MapLibre) · 위치(Play 서비스)는 자기 규칙을 함께 들고 온다. 없는 선택 부품 경고만 무시한다.
-dontwarn org.maplibre.**
-dontwarn com.google.android.gms.**
-dontwarn okhttp3.**
-dontwarn okio.**
