package com.usm007.studysynth;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Identity checks for downloaded APKs.
 *
 * A downloaded file is only allowed to reach the package installer when its
 * SHA-256 matches the signed manifest, its package id matches this app, its
 * versionCode is newer than the installed one, and its signing certificate
 * matches both the manifest and the certificate this app was installed with.
 */
final class ApkVerifier {

    private ApkVerifier() {}

    static final class ArchiveInfo {
        String packageName;
        long versionCode;
        String versionName;
        String[] certSha256;
    }

    static String sha256Hex(File file) throws IOException {        MessageDigest digest = newDigest();
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return toHex(digest.digest());
    }

    static String sha256Hex(byte[] bytes) {
        return toHex(newDigest().digest(bytes));
    }

    /** Same as {@link #sha256Hex(File)} but returns "" instead of throwing. */
    static String sha256HexSafe(File file) {
        try {
            return sha256Hex(file);
        } catch (IOException err) {
            return "";
        }
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException err) {
            throw new IllegalStateException("SHA-256 is unavailable on this device", err);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            out.append(Character.forDigit((value >> 4) & 0xF, 16));
            out.append(Character.forDigit(value & 0xF, 16));
        }
        return out.toString();
    }

    static String normaliseDigest(String value) {
        if (value == null) return "";
        return value.replace(":", "").replace(" ", "").toLowerCase();
    }

    @SuppressWarnings("deprecation")
    static ArchiveInfo readArchive(Context context, File apkFile) {
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        PackageInfo info = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (info == null) return null;

        ArchiveInfo result = new ArchiveInfo();
        result.packageName = info.packageName;
        result.versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
        result.versionName = info.versionName;

        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            signatures = info.signingInfo.hasMultipleSigners()
                    ? info.signingInfo.getApkContentsSigners()
                    : info.signingInfo.getSigningCertificateHistory();
        } else if (info.signatures != null) {
            signatures = info.signatures;
        }
        if (signatures == null) {
            result.certSha256 = new String[0];
        } else {
            result.certSha256 = new String[signatures.length];
            for (int i = 0; i < signatures.length; i++) {
                result.certSha256[i] = sha256Hex(signatures[i].toByteArray());
            }
        }
        return result;
    }

    /** Certificate digests of the app that is currently installed. */
    @SuppressWarnings("deprecation")
    static String[] installedCertDigests(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? PackageManager.GET_SIGNING_CERTIFICATES
                    : PackageManager.GET_SIGNATURES;
            PackageInfo info = pm.getPackageInfo(context.getPackageName(), flags);
            Signature[] signatures = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
                signatures = info.signingInfo.hasMultipleSigners()
                        ? info.signingInfo.getApkContentsSigners()
                        : info.signingInfo.getSigningCertificateHistory();
            } else if (info.signatures != null) {
                signatures = info.signatures;
            }
            if (signatures == null) return new String[0];
            String[] digests = new String[signatures.length];
            for (int i = 0; i < signatures.length; i++) {
                digests[i] = sha256Hex(signatures[i].toByteArray());
            }
            return digests;
        } catch (PackageManager.NameNotFoundException err) {
            return new String[0];
        }
    }

    static long installedVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        } catch (PackageManager.NameNotFoundException err) {
            return 0;
        }
    }

    static boolean contains(String[] values, String expected) {
        String wanted = normaliseDigest(expected);
        if (wanted.isEmpty()) return false;
        for (String value : values) {
            if (wanted.equals(normaliseDigest(value))) return true;
        }
        return false;
    }
}
