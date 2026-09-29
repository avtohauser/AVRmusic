package space.avthsr.music;

import android.os.Handler;
import android.os.Looper;

/**
 * Tiny main-thread message hub between the player service and the page.
 * The queue lives in the page, so buttons pressed in the notification shade (next, previous, like)
 * are handed to it as commands; the like state flows the other way.
 */
final class Hub {
  interface Listener { void onCommand(String name); }

  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static Listener listener;
  private static PlaybackService service;
  private static boolean liked;

  private Hub() {}

  static void post(Runnable r) {
    if (Looper.myLooper() == Looper.getMainLooper()) r.run(); else MAIN.post(r);
  }

  static void setListener(Listener l) { listener = l; }

  /** A button in the shade / on the lock screen / on a headset asks the page to do something. */
  static void command(String name) {
    post(() -> { if (listener != null) listener.onCommand(name); });
  }

  static void attach(PlaybackService s) { service = s; if (s != null) s.showLiked(liked); }

  static void detach(PlaybackService s) { if (service == s) service = null; }

  static boolean liked() { return liked; }

  /** The page tells whether the current track is in the favourites. */
  static void setLiked(boolean value) {
    post(() -> {
      liked = value;
      if (service != null) service.showLiked(value);
    });
  }
}
