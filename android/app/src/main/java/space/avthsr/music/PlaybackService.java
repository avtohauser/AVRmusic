package space.avthsr.music;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.CommandButton;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;

import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

/**
 * Plays the music. ExoPlayer runs in a media session service, so Android shows the regular media
 * player in the notification shade and on the lock screen — with a ♥ button that adds the current
 * track to the favourites — and playback continues with the screen off or the app in the background.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlaybackService extends MediaSessionService {
  static final String CMD_LIKE = "avr.like";

  private ExoPlayer player;
  private MediaSession session;
  private boolean liked;

  @Override
  public void onCreate() {
    super.onCreate();
    player = new ExoPlayer.Builder(this)
        .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build();

    Intent open = new Intent(this, MainActivity.class)
        .setAction(MainActivity.ACTION_OPEN_PLAYER)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    PendingIntent openPlayer = PendingIntent.getActivity(this, 1, open, flags);

    session = new MediaSession.Builder(this, new QueuePlayer(player))
        .setSessionActivity(openPlayer)
        .setCallback(new Callback())
        .build();

    DefaultMediaNotificationProvider notifications = new DefaultMediaNotificationProvider.Builder(this).build();
    notifications.setSmallIcon(R.drawable.ic_notification_icon);
    setMediaNotificationProvider(notifications);

    liked = Hub.liked();
    session.setCustomLayout(layout());
    Hub.attach(this);
  }

  @Override
  public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
    return session;
  }

  /** The app was swiped away: the queue lived in the page, so stop instead of playing on blindly. */
  @Override
  public void onTaskRemoved(Intent rootIntent) {
    if (player != null) { player.pause(); player.stop(); }
    stopSelf();
  }

  @Override
  public void onDestroy() {
    Hub.detach(this);
    if (session != null) { session.release(); session = null; }
    if (player != null) { player.release(); player = null; }
    super.onDestroy();
  }

  /** Shows the like state on the ♥ button of the shade player. */
  void showLiked(boolean value) {
    liked = value;
    if (session != null) session.setCustomLayout(layout());
  }

  private ImmutableList<CommandButton> layout() {
    CommandButton like = new CommandButton.Builder()
        .setDisplayName(getString(liked ? R.string.unlike : R.string.like))
        .setIconResId(liked ? R.drawable.ic_heart_filled : R.drawable.ic_heart_outline)
        .setSessionCommand(new SessionCommand(CMD_LIKE, Bundle.EMPTY))
        .build();
    return ImmutableList.of(like);
  }

  private final class Callback implements MediaSession.Callback {
    @NonNull
    @Override
    public MediaSession.ConnectionResult onConnect(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo controller) {
      MediaSession.ConnectionResult base = MediaSession.Callback.super.onConnect(s, controller);
      SessionCommands commands = base.availableSessionCommands.buildUpon()
          .add(new SessionCommand(CMD_LIKE, Bundle.EMPTY))
          .build();
      return MediaSession.ConnectionResult.accept(commands, base.availablePlayerCommands);
    }

    @NonNull
    @Override
    public ListenableFuture<SessionResult> onCustomCommand(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo controller,
                                                          @NonNull SessionCommand command, @NonNull Bundle args) {
      if (CMD_LIKE.equals(command.customAction)) {
        showLiked(!liked); // instant feedback; the page confirms (or rolls back) through Hub.setLiked
        Hub.command("like");
        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
      }
      return MediaSession.Callback.super.onCustomCommand(s, controller, command, args);
    }
  }

  /**
   * The player only ever holds the current track; the queue is in the page. Previous / next are
   * advertised anyway (so the shade shows ⏮ ⏭) and forwarded to the page.
   */
  private static final class QueuePlayer extends ForwardingPlayer {
    QueuePlayer(Player player) { super(player); }

    @NonNull
    @Override
    public Player.Commands getAvailableCommands() {
      return super.getAvailableCommands().buildUpon()
          .add(COMMAND_SEEK_TO_NEXT).add(COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
          .add(COMMAND_SEEK_TO_PREVIOUS).add(COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
          .build();
    }

    @Override
    public boolean isCommandAvailable(int command) {
      return command == COMMAND_SEEK_TO_NEXT || command == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
          || command == COMMAND_SEEK_TO_PREVIOUS || command == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM
          || super.isCommandAvailable(command);
    }

    @Override public boolean hasNextMediaItem() { return true; }
    @Override public boolean hasPreviousMediaItem() { return true; }
    @Override public void seekToNext() { Hub.command("next"); }
    @Override public void seekToNextMediaItem() { Hub.command("next"); }
    @Override public void seekToPrevious() { Hub.command("prev"); }
    @Override public void seekToPreviousMediaItem() { Hub.command("prev"); }
  }
}
