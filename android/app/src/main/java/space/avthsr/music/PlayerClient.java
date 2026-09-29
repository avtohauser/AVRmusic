package space.avthsr.music;

import android.content.ComponentName;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The page's side of the player: a MediaController connected to {@link PlaybackService}.
 * Mirrors what an HTML audio element would report (playing, pause, waiting, canplay, timeupdate,
 * ended, error) back to the page, which keeps the queue and decides what plays next.
 */
final class PlayerClient implements Player.Listener {
  interface Sink { void emit(String type, JSONObject data); }

  private final Context context;
  private final Sink sink;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final List<Runnable> pending = new ArrayList<>();
  private ListenableFuture<MediaController> future;
  private MediaController controller;

  private final Runnable ticker = new Runnable() {
    @Override public void run() {
      tick();
      if (controller != null && controller.isPlaying()) handler.postDelayed(this, 500);
    }
  };

  PlayerClient(Context context, Sink sink) {
    this.context = context.getApplicationContext();
    this.sink = sink;
  }

  void connect() {
    if (future != null) return;
    SessionToken token = new SessionToken(context, new ComponentName(context, PlaybackService.class));
    future = new MediaController.Builder(context, token).buildAsync();
    final ListenableFuture<MediaController> f = future;
    f.addListener(() -> {
      if (future != f) return;
      try {
        controller = f.get();
        controller.addListener(this);
        List<Runnable> todo = new ArrayList<>(pending);
        pending.clear();
        for (Runnable r : todo) r.run();
      } catch (Exception e) {
        future = null;
        pending.clear();
        sink.emit("error", obj("message", "player unavailable: " + e.getMessage()));
      }
    }, ContextCompat.getMainExecutor(context));
  }

  void release() {
    handler.removeCallbacks(ticker);
    if (controller != null) controller.removeListener(this);
    if (future != null) MediaController.releaseFuture(future);
    future = null;
    controller = null;
    pending.clear();
  }

  /** Runs on the main thread once the controller is connected. */
  private void run(Runnable r) {
    Hub.post(() -> {
      if (controller != null) r.run();
      else { pending.add(r); connect(); }
    });
  }

  void load(JSONObject t) {
    run(() -> {
      String artwork = t.optString("artwork", "");
      MediaMetadata meta = new MediaMetadata.Builder()
          .setTitle(t.optString("title", ""))
          .setArtist(t.optString("artist", ""))
          .setAlbumTitle(t.optString("album", ""))
          .setArtworkUri(artwork.isEmpty() ? null : Uri.parse(artwork))
          .build();
      MediaItem item = new MediaItem.Builder()
          .setMediaId(t.optString("id", "track"))
          .setUri(t.optString("url"))
          .setMediaMetadata(meta)
          .build();
      long startMs = Math.round(t.optDouble("position", 0) * 1000);
      controller.setMediaItem(item, Math.max(0, startMs));
      controller.prepare();
    });
  }

  void play() {
    run(() -> {
      int state = controller.getPlaybackState();
      if (state == Player.STATE_ENDED) controller.seekTo(0);
      if (state == Player.STATE_IDLE && controller.getMediaItemCount() > 0) controller.prepare();
      controller.play();
    });
  }

  void pause() { run(() -> controller.pause()); }

  void seek(double seconds) { run(() -> { controller.seekTo(Math.max(0, Math.round(seconds * 1000))); tick(); }); }

  void setVolume(float v) { run(() -> controller.setVolume(Math.max(0f, Math.min(1f, v)))); }

  void setRate(float r) { run(() -> controller.setPlaybackParameters(new PlaybackParameters(Math.max(0.25f, Math.min(3f, r))))); }

  void stop() { run(() -> { controller.stop(); controller.clearMediaItems(); }); }

  /* ---------- player → page ---------- */

  private void tick() {
    if (controller == null) return;
    JSONObject o = new JSONObject();
    try {
      o.put("t", Math.max(0, controller.getCurrentPosition()) / 1000.0);
      o.put("d", duration());
      o.put("b", Math.max(0, controller.getBufferedPosition()) / 1000.0);
    } catch (JSONException ignored) { }
    sink.emit("time", o);
  }

  private double duration() {
    long d = controller == null ? C.TIME_UNSET : controller.getDuration();
    return d == C.TIME_UNSET || d < 0 ? 0 : d / 1000.0;
  }

  @Override
  public void onIsPlayingChanged(boolean isPlaying) {
    handler.removeCallbacks(ticker);
    if (isPlaying) { sink.emit("playing", null); handler.post(ticker); }
    else tick();
  }

  /** A pause the listener asked for (shade button, headset, unplugged headphones, another app took the audio). */
  @Override
  public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
    if (!playWhenReady) sink.emit("pause", null);
  }

  @Override
  public void onPlaybackStateChanged(int state) {
    if (state == Player.STATE_BUFFERING) sink.emit("waiting", null);
    else if (state == Player.STATE_READY) { sink.emit("canplay", obj("d", duration())); tick(); }
    else if (state == Player.STATE_ENDED) { tick(); sink.emit("ended", null); }
  }

  @Override
  public void onPositionDiscontinuity(@NonNull Player.PositionInfo oldPosition, @NonNull Player.PositionInfo newPosition, int reason) {
    tick();
  }

  @Override
  public void onPlayerError(@NonNull PlaybackException error) {
    sink.emit("error", obj("message", error.getErrorCodeName() + ": " + error.getMessage()));
  }

  private static JSONObject obj(String key, Object value) {
    JSONObject o = new JSONObject();
    try { o.put(key, value); } catch (JSONException ignored) { }
    return o;
  }
}
