package com.usm007.studysynth;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Resumable HTTPS downloader for release APKs.
 *
 * Resumes a partial file with a Range request when the server supports it and
 * always re-checks size and SHA-256 before the file is handed to the verifier.
 * A checksum mismatch deletes the partial file and retries once from zero,
 * because a truncated resume must never be treated as a valid download.
 */
final class ApkDownloader {

    interface Listener {
        void onProgress(long received, long total, int percent);
    }

    private final File target;
    private final Listener listener;
    private volatile boolean cancelled;
    private volatile HttpURLConnection connection;

    ApkDownloader(File target, Listener listener) {
        this.target = target;
        this.listener = listener;
    }

    void cancel() {
        cancelled = true;
        HttpURLConnection current = connection;
        if (current != null) {
            try {
                current.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    boolean isCancelled() {
        return cancelled;
    }

    /**
     * @return true when the file exists, matches {@code expectedSize} (when > 0)
     *         and matches {@code expectedSha256}.
     */
    boolean download(String url, long expectedSize, String expectedSha256) throws IOException {
        if (!url.startsWith("https://")) {
            throw new IOException("Refusing a non-HTTPS update URL.");
        }
        File part = new File(target.getParentFile(), target.getName() + ".part");
        IOException lastError = null;

        for (int attempt = 0; attempt < 2; attempt++) {
            if (cancelled) throw new IOException("Download cancelled.");
            try {
                transfer(url, part, expectedSize);
                if (expectedSize > 0 && part.length() != expectedSize) {
                    throw new IOException("Downloaded size does not match the manifest.");
                }
                String actual = ApkVerifier.sha256Hex(part);
                if (!actual.equalsIgnoreCase(expectedSha256)) {
                    throw new IOException("Downloaded file failed its SHA-256 check.");
                }
                if (target.exists() && !target.delete()) {
                    throw new IOException("Could not replace the previous download.");
                }
                if (!part.renameTo(target)) {
                    throw new IOException("Could not finalise the downloaded file.");
                }
                return true;
            } catch (IOException err) {
                lastError = err;
                // A stale or corrupt partial file must not poison the retry.
                if (part.exists() && !part.delete()) {
                    throw new IOException("Could not clear the failed download.");
                }
                if (cancelled) break;
            }
        }
        throw lastError != null ? lastError : new IOException("Download failed.");
    }

    private void transfer(String url, File part, long expectedSize) throws IOException {
        long existing = part.exists() ? part.length() : 0;
        if (expectedSize > 0 && existing > expectedSize) {
            if (!part.delete()) throw new IOException("Could not reset an oversized download.");
            existing = 0;
        }
        if (expectedSize > 0 && existing == expectedSize) {
            return; // already complete; the caller re-verifies the checksum
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        connection = conn;
        try {
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "StudySynth-Android");
            if (existing > 0) {
                conn.setRequestProperty("Range", "bytes=" + existing + "-");
            }

            int code = conn.getResponseCode();
            boolean append;
            if (code == HttpURLConnection.HTTP_PARTIAL) {
                append = true;
            } else if (code == HttpURLConnection.HTTP_OK) {
                append = false;
                existing = 0;
            } else {
                throw new IOException("Update server responded with HTTP " + code + ".");
            }

            long total = expectedSize > 0
                    ? expectedSize
                    : conn.getContentLengthLong() + existing;

            long written = existing;
            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(part, append)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                long lastReport = 0;
                while ((read = in.read(buffer)) != -1) {
                    if (cancelled) throw new IOException("Download cancelled.");
                    out.write(buffer, 0, read);
                    written += read;
                    long now = System.currentTimeMillis();
                    if (now - lastReport > 200) {
                        lastReport = now;
                        int percent = total > 0 ? (int) Math.min(100, (written * 100) / total) : -1;
                        listener.onProgress(written, total, percent);
                    }
                }
                out.flush();
            }
            int percent = total > 0 ? 100 : -1;
            listener.onProgress(written, total, percent);
        } finally {
            connection = null;
            conn.disconnect();
        }
    }
}
