package com.usm007.studysynth;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.IOException;

/**
 * Local APK update plugin.
 *
 * JavaScript asks for a download and then for the Android installer to open.
 * The installer is always a system dialog: this plugin cannot install silently
 * and never pretends it did. Verification happens here, on the native side,
 * before the file is exposed to the installer.
 */
@CapacitorPlugin(name = "ApkUpdate")
public class ApkUpdatePlugin extends Plugin {

    private static final String PREFS = "studysynth_apk_update";
    private static final String KEY_STATUS = "status";
    private static final String KEY_VERSION_CODE = "versionCode";
    private static final String KEY_ERROR = "error";
    private static final String KEY_RECEIVED = "received";
    private static final String KEY_TOTAL = "total";

    private volatile ApkDownloader downloader;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            return getContext().getCacheDir();
        }
        return dir;
    }

    private File apkFile(long versionCode) {
        return new File(updatesDir(), "studysynth-" + versionCode + ".apk");
    }

    private void setState(String status, long versionCode, String error) {
        prefs().edit()
                .putString(KEY_STATUS, status)
                .putLong(KEY_VERSION_CODE, versionCode)
                .putString(KEY_ERROR, error == null ? "" : error)
                .apply();
    }

    private void setProgress(long received, long total) {
        prefs().edit()
                .putLong(KEY_RECEIVED, received)
                .putLong(KEY_TOTAL, total)
                .apply();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        SharedPreferences prefs = prefs();
        String status = prefs.getString(KEY_STATUS, "idle");
        long versionCode = prefs.getLong(KEY_VERSION_CODE, 0);
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("versionCode", versionCode);
        result.put("error", prefs.getString(KEY_ERROR, ""));
        result.put("received", prefs.getLong(KEY_RECEIVED, 0));
        result.put("total", prefs.getLong(KEY_TOTAL, 0));
        if (versionCode > 0) {
            File file = apkFile(versionCode);
            result.put("file", file.exists() ? file.getAbsolutePath() : "");
            result.put("size", file.exists() ? file.length() : 0);
            if ("downloaded".equals(status) && !file.exists()) {
                result.put("status", "idle");
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String sha256 = call.getString("sha256");
        final Long size = call.getLong("size", 0L);
        final Long versionCode = call.getLong("versionCode", 0L);
        final String certSha256 = call.getString("certSha256");
        final String packageId = call.getString("packageId");

        if (url == null || !url.startsWith("https://")) {
            call.reject("The update URL must use HTTPS.", "INSECURE_URL");
            return;
        }
        if (sha256 == null || !sha256.matches("(?i)[0-9a-f]{64}")) {
            call.reject("The manifest did not provide a valid SHA-256.", "BAD_CHECKSUM");
            return;
        }
        if (versionCode == null || versionCode <= 0) {
            call.reject("The manifest did not provide a version code.", "BAD_VERSION");
            return;
        }
        if (certSha256 == null || certSha256.isEmpty()) {
            call.reject("The manifest did not provide a signing certificate.", "BAD_CERT");
            return;
        }
        long installed = ApkVerifier.installedVersionCode(getContext());
        if (versionCode <= installed) {
            call.reject("This update is not newer than the installed app.", "NOT_NEWER");
            return;
        }
        if (packageId != null && !packageId.isEmpty() && !packageId.equals(getContext().getPackageName())) {
            call.reject("The update belongs to a different application.", "WRONG_PACKAGE");
            return;
        }

        final File target = apkFile(versionCode);
        if (target.exists() && target.length() == size && sha256.equalsIgnoreCase(ApkVerifier.sha256HexSafe(target))) {
            setState("downloaded", versionCode, "");
            call.resolve(statePayload("downloaded", versionCode, ""));
            return;
        }

        setState("downloading", versionCode, "");
        setProgress(0, size);
        notifyListeners("downloadProgress", progressPayload(0, size, 0));

        if (downloader != null) {
            downloader.cancel();
        }
        final ApkDownloader active = new ApkDownloader(target, (received, total, percent) -> {
            setProgress(received, total);
            notifyListeners("downloadProgress", progressPayload(received, total, percent));
        });
        downloader = active;

        try {
            active.download(url, size, sha256);

            ApkVerifier.ArchiveInfo info = ApkVerifier.readArchive(getContext(), target);
            if (info == null) {
                throw new IOException("The downloaded file is not a readable APK.");
            }
            if (!getContext().getPackageName().equals(info.packageName)) {
                throw new IOException("The downloaded APK belongs to a different package.");
            }
            if (info.versionCode != versionCode) {
                throw new IOException("The downloaded APK has an unexpected version code.");
            }
            if (!ApkVerifier.contains(info.certSha256, certSha256)) {
                throw new IOException("The downloaded APK is signed with a different certificate.");
            }
            String[] installedCerts = ApkVerifier.installedCertDigests(getContext());
            if (installedCerts.length > 0 && !ApkVerifier.contains(info.certSha256, installedCerts[0])) {
                throw new IOException("The downloaded APK would break the installed app's signature.");
            }

            setState("downloaded", versionCode, "");
            setProgress(target.length(), target.length());
            call.resolve(statePayload("downloaded", versionCode, ""));
        } catch (Exception err) {
            String message = err.getMessage() == null ? "The update could not be downloaded." : err.getMessage();
            if (active.isCancelled()) {
                setState("idle", 0, "");
                call.reject("Download cancelled.", "CANCELLED");
                return;
            }
            setState("error", versionCode, message);
            if (target.exists()) {
                // Never leave an unverified file where install() could find it.
                //noinspection ResultOfMethodCallIgnored
                target.delete();
            }
            call.reject(message, "DOWNLOAD_FAILED");
        } finally {
            if (downloader == active) downloader = null;
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        SharedPreferences prefs = prefs();
        String status = prefs.getString(KEY_STATUS, "idle");
        long versionCode = prefs.getLong(KEY_VERSION_CODE, 0);
        if (!"downloaded".equals(status) || versionCode <= 0) {
            call.reject("No downloaded update is ready to install.", "NOT_DOWNLOADED");
            return;
        }
        File file = apkFile(versionCode);
        if (!file.exists()) {
            setState("idle", 0, "");
            call.reject("The downloaded update is missing. Download it again.", "FILE_MISSING");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Android needs permission to install this update.", "INSTALL_PERMISSION");
            return;
        }

        try {
            Context context = getContext();
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            result.put("versionCode", versionCode);
            call.resolve(result);
        } catch (Exception err) {
            call.reject("The Android installer could not be opened: " + err.getMessage(), "INSTALL_FAILED");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        ApkDownloader active = downloader;
        if (active != null) active.cancel();
        setState("idle", 0, "");
        JSObject result = new JSObject();
        result.put("cancelled", active != null);
        call.resolve(result);
    }

    @PluginMethod
    public void getInstallPermissionStatus(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        result.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject result = new JSObject();
            result.put("opened", false);
            call.resolve(result);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception err) {
            call.reject("The Android settings screen could not be opened.", "SETTINGS_FAILED");
        }
    }

    private JSObject statePayload(String status, long versionCode, String error) {
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("versionCode", versionCode);
        result.put("error", error == null ? "" : error);
        File file = apkFile(versionCode);
        result.put("file", file.exists() ? file.getAbsolutePath() : "");
        result.put("size", file.exists() ? file.length() : 0);
        return result;
    }

    private JSObject progressPayload(long received, long total, int percent) {
        JSObject result = new JSObject();
        result.put("received", received);
        result.put("total", total);
        if (percent >= 0) result.put("percent", percent);
        return result;
    }
}
