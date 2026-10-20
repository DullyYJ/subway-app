package com.dullyyj.subway;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 열차가 서 있나 / 달리나를 알아내기 위한 재료를 1초마다 JS 로 보낸다.
 *
 *  폰을 손에 들고 있어도 쓸 수 있도록 '진동 세기' 하나에 기대지 않는다.
 *   - rms : 선형가속도(중력 제외) 전체 세기. 손떨림에 취약 — 보조.
 *   - vz  : 위아래 성분 세기(레일 진동).
 *   - wx, wy, hm : '세계 좌표(수평)' 가속도의 1초 평균 벡터와 크기.
 *       열차가 출발·제동할 때는 같은 방향으로 5~10초 이어지는 수평 가속(약 0.8~1.3 m/s²)이 생긴다.
 *       손떨림은 방향이 계속 바뀌어 1초 평균을 내면 거의 상쇄된다. 폰을 돌려 잡아도(세계 좌표) 방향이 변하지 않는다.
 *   센서: LINEAR_ACCELERATION + GAME_ROTATION_VECTOR(없으면 ROTATION_VECTOR). 둘 중 하나라도 없으면
 *   ACCELEROMETER 로 rms 만 보낸다(hm = -1).
 *  정차/주행/펄스 판정은 JS(index.html)에서 한다 — 임계값을 앱 업데이트만으로 고칠 수 있게. 권한 불필요.
 */
@CapacitorPlugin(name = "Motion")
public class MotionPlugin extends Plugin implements SensorEventListener {

    private SensorManager sm;
    private Sensor lin, rot, acc;
    private HandlerThread thread;
    private Handler handler;
    private boolean running = false;
    private boolean fused = false;

    private final float[] R = new float[9];
    private final float[] rv = new float[5];
    private boolean haveR = false;
    private final float[] g = new float[3];
    private boolean gInit = false;

    private double sumSq = 0, sumVz2 = 0, sumWx = 0, sumWy = 0;
    private int n = 0;
    private long winStartMs = 0;

    @PluginMethod
    public void start(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            if (running) { ret.put("ok", true); ret.put("already", true); ret.put("fused", fused); call.resolve(ret); return; }
            Context ctx = getContext();
            sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
            if (sm == null) { ret.put("ok", false); ret.put("reason", "no-sensor-manager"); call.resolve(ret); return; }
            lin = sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
            rot = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
            if (rot == null) rot = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            fused = (lin != null && rot != null);
            if (!fused && acc == null) { ret.put("ok", false); ret.put("reason", "no-accelerometer"); call.resolve(ret); return; }
            thread = new HandlerThread("MotionSensor");
            thread.start();
            handler = new Handler(thread.getLooper());
            haveR = false; gInit = false; sumSq = sumVz2 = sumWx = sumWy = 0; n = 0;
            winStartMs = SystemClock.elapsedRealtime();
            boolean ok;
            if (fused) {
                // 25Hz — 배터리 부담이 작고 구분에는 충분하다
                ok = sm.registerListener(this, rot, 40000, handler);
                ok = sm.registerListener(this, lin, 40000, handler) && ok;
            } else {
                ok = sm.registerListener(this, acc, 40000, handler);
            }
            running = ok;
            ret.put("ok", ok);
            ret.put("fused", fused);
            call.resolve(ret);
        } catch (Throwable t) {
            try { ret.put("ok", false); ret.put("reason", String.valueOf(t.getMessage())); call.resolve(ret); } catch (Throwable ignored) { }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private void stopInternal() {
        try { if (sm != null) sm.unregisterListener(this); } catch (Throwable ignored) { }
        try { if (thread != null) thread.quitSafely(); } catch (Throwable ignored) { }
        thread = null; handler = null; running = false;
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        super.handleOnDestroy();
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        try {
            int type = e.sensor.getType();
            float lx, ly, lz;
            double wx = 0, wy = 0, wz = 0;
            boolean haveW = false;
            if (fused) {
                if (type == Sensor.TYPE_GAME_ROTATION_VECTOR || type == Sensor.TYPE_ROTATION_VECTOR) {
                    int len = Math.min(e.values.length, 5);
                    System.arraycopy(e.values, 0, rv, 0, len);
                    SensorManager.getRotationMatrixFromVector(R, rv);
                    haveR = true;
                    return;
                }
                if (type != Sensor.TYPE_LINEAR_ACCELERATION || !haveR) return;
                lx = e.values[0]; ly = e.values[1]; lz = e.values[2];
                // 기기 → 세계(동·북·위) 좌표
                wx = R[0] * lx + R[1] * ly + R[2] * lz;
                wy = R[3] * lx + R[4] * ly + R[5] * lz;
                wz = R[6] * lx + R[7] * ly + R[8] * lz;
                haveW = true;
            } else {
                float x = e.values[0], y = e.values[1], z = e.values[2];
                if (!gInit) { g[0] = x; g[1] = y; g[2] = z; gInit = true; return; }
                final float a = 0.95f;
                g[0] = a * g[0] + (1 - a) * x; g[1] = a * g[1] + (1 - a) * y; g[2] = a * g[2] + (1 - a) * z;
                lx = x - g[0]; ly = y - g[1]; lz = z - g[2];
            }
            sumSq += lx * lx + ly * ly + lz * lz;
            if (haveW) { sumVz2 += wz * wz; sumWx += wx; sumWy += wy; }
            n++;
            long now = SystemClock.elapsedRealtime();
            if (now - winStartMs >= 1000 && n > 0) {
                JSObject o = new JSObject();
                o.put("rms", round4(Math.sqrt(sumSq / n)));
                if (fused) {
                    double mx = sumWx / n, my = sumWy / n;
                    o.put("vz", round4(Math.sqrt(sumVz2 / n)));
                    o.put("wx", round4(mx));
                    o.put("wy", round4(my));
                    o.put("hm", round4(Math.sqrt(mx * mx + my * my)));
                } else {
                    o.put("hm", -1);
                }
                o.put("n", n);
                o.put("t", System.currentTimeMillis());
                notifyListeners("motion", o);
                sumSq = sumVz2 = sumWx = sumWy = 0; n = 0; winStartMs = now;
            }
        } catch (Throwable ignored) { }
    }

    private static double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
