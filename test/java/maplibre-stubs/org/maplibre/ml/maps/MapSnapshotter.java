package org.maplibre.android.snapshotter;
import android.content.Context;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.maps.Style;
public class MapSnapshotter {
    public interface SnapshotReadyCallback { void onSnapshotReady(MapSnapshot snapshot); }
    public interface ErrorHandler { void onError(String error); }
    public static class Options {
        public Options(int width, int height) { }
        public Options withPixelRatio(float ratio) { return this; }
        public Options withStyleBuilder(Style.Builder b) { return this; }
        public Options withCameraPosition(CameraPosition p) { return this; }
        public Options withLogo(boolean show) { return this; }
    }
    public MapSnapshotter(Context context, Options options) { }
    public void start(SnapshotReadyCallback callback, ErrorHandler errorHandler) { }
    public void start(SnapshotReadyCallback callback) { }
    public void cancel() { }
}
