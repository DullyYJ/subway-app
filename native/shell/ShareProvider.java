package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/** 공유 그림을 다른 앱(카카오톡 등)이 읽게 해 주는 파일 제공자(androidx 없이). 앱 캐시의 gdmshare 폴더 파일만, 이름이 모양에 맞을 때만 연다. */
public class ShareProvider extends ContentProvider {
    static final String DIR = "gdmshare";
    static String authority(android.content.Context c) { return c.getPackageName() + ".gdmshare"; }
    static Uri uriFor(android.content.Context c, File f) { return Uri.parse("content://" + authority(c) + "/" + f.getName()); }

    private File fileOf(Uri uri) throws FileNotFoundException {
        String n = uri.getLastPathSegment();
        if (n == null || !n.matches("gildongmu_\\d{1,16}\\.png")) throw new FileNotFoundException("name");
        File f = new File(new File(getContext().getCacheDir(), DIR), n);
        if (!f.isFile()) throw new FileNotFoundException("none");
        return f;
    }
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException { return ParcelFileDescriptor.open(fileOf(uri), ParcelFileDescriptor.MODE_READ_ONLY); }
    @Override public String getType(Uri uri) { return "image/png"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File f = fileOf(uri);
            MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
            c.addRow(new Object[] { f.getName(), f.length() });
            return c;
        } catch (FileNotFoundException e) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
