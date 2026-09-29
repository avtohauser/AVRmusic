package space.avthsr.music;

import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;

/**
 * window.AVRNative — what the page can ask of the app. Calls arrive on a WebView binder thread and
 * are only honoured while the WebView shows our own site.
 */
final class NativeBridge {
  private static final int KEEP_LOCAL_FILES = 60;

  private final MainActivity activity;
  private final PlayerClient player;
  private final File localDir;

  NativeBridge(MainActivity activity, PlayerClient player) {
    this.activity = activity;
    this.player = player;
    this.localDir = new File(activity.getFilesDir(), "offline");
  }

  private boolean ok() { return activity.showsOwnSite(); }

  @JavascriptInterface public int version() { return 1; }

  @JavascriptInterface public String appVersion() { return BuildConfig.VERSION_NAME; }

  /** {url, id, title, artist, album, artwork, position} */
  @JavascriptInterface public void load(String json) {
    if (!ok()) return;
    try { player.load(new JSONObject(json)); } catch (Exception ignored) { }
  }

  @JavascriptInterface public void play() { if (ok()) player.play(); }

  @JavascriptInterface public void pause() { if (ok()) player.pause(); }

  @JavascriptInterface public void seek(double seconds) { if (ok()) player.seek(seconds); }

  @JavascriptInterface public void setVolume(double volume) { if (ok()) player.setVolume((float) volume); }

  @JavascriptInterface public void setRate(double rate) { if (ok()) player.setRate((float) rate); }

  @JavascriptInterface public void stop() { if (ok()) player.stop(); }

  /** Whether the current track is in the favourites (the ♥ in the shade player). */
  @JavascriptInterface public void setLiked(boolean liked) { if (ok()) Hub.setLiked(liked); }

  /** Safe areas in CSS px: {"t","r","b","l","tBar"}. */
  @JavascriptInterface public String insets() { return activity.insetsJson(); }

  /** Leave the app (back on the start screen). */
  @JavascriptInterface public void exit() { activity.runOnUiThread(() -> activity.moveTaskToBack(true)); }

  /* ---------- offline tracks: the page's downloaded copy is handed over once, then played from a file ---------- */

  private File local(String id) {
    String safe = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
    return safe.isEmpty() ? null : new File(localDir, safe);
  }

  @JavascriptInterface public String localUrl(String id) {
    if (!ok()) return "";
    File f = local(id);
    if (f == null || !f.isFile() || f.length() == 0) return "";
    //noinspection ResultOfMethodCallIgnored
    f.setLastModified(System.currentTimeMillis());
    return Uri.fromFile(f).toString();
  }

  /** Appends a base64 chunk of the file (first = start a new file); returns false on failure. */
  @JavascriptInterface public boolean putLocal(String id, String base64, boolean first) {
    if (!ok()) return false;
    File f = local(id);
    if (f == null) return false;
    try {
      if (first) { //noinspection ResultOfMethodCallIgnored
        localDir.mkdirs(); prune(); }
      byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
      try (FileOutputStream out = new FileOutputStream(f, !first)) { out.write(bytes); }
      return true;
    } catch (IOException | IllegalArgumentException e) {
      //noinspection ResultOfMethodCallIgnored
      f.delete();
      return false;
    }
  }

  @JavascriptInterface public void dropLocal(String id) {
    if (!ok()) return;
    File f = local(id);
    //noinspection ResultOfMethodCallIgnored
    if (f != null) f.delete();
  }

  /** Keeps the most recently played copies only; the page hands a file over again when needed. */
  private void prune() {
    File[] files = localDir.listFiles();
    if (files == null || files.length < KEEP_LOCAL_FILES) return;
    Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
    for (int i = 0; i <= files.length - KEEP_LOCAL_FILES; i++) {
      //noinspection ResultOfMethodCallIgnored
      files[i].delete();
    }
  }
}
