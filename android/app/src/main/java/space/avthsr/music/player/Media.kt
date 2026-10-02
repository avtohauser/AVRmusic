package space.avthsr.music.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import java.io.File

/** A queue entry for a track: streamed from the server, with the metadata the shade player shows. */
fun mediaItemOf(t: Track): MediaItem = MediaItem.Builder()
  .setMediaId(t.id)
  .setUri(Api.streamUrl(t.id))
  .setMediaMetadata(
    MediaMetadata.Builder()
      .setTitle(t.title)
      .setArtist(t.artists)
      .setAlbumTitle(t.album?.title)
      .setArtworkUri(Api.img(t.coverUrl)?.let { Uri.parse(it) })
      .build()
  )
  .build()

/** Tracks heard recently stay on the phone (up to 1 GB): replays and rewinds cost no traffic. */
@OptIn(UnstableApi::class)
object MediaCache {
  private var cache: SimpleCache? = null

  @Synchronized
  fun get(context: Context): SimpleCache = cache ?: SimpleCache(
    File(context.cacheDir, "media"),
    LeastRecentlyUsedCacheEvictor(1L shl 30),
    StandaloneDatabaseProvider(context),
  ).also { cache = it }
}
