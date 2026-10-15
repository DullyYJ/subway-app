// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package androidx.core.content;
import android.content.Context; import android.net.Uri; import java.io.File;
public class FileProvider { public static Uri getUriForFile(Context c, String authority, File f) { return null; } }
