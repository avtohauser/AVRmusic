package space.avthsr.music.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import java.io.File

/** A queue entry for a track: its saved file when it is kept offline, the server stream otherwise. */
fun mediaItemOf(t: Track): MediaItem = MediaItem.Builder()
  .setMediaId(t.id)
  .setUri(Offline.file(t.id)?.let { Uri.fromFile(File(it)) } ?: Uri.parse(Api.streamUrl(t.id)))
  .setMediaMetadata(
    MediaMetadata.Builder()
      .setTitle(t.title)
      .setArtist(t.artists)
      .setAlbumTitle(t.album?.title)
      .setArtworkUri(Offline.cover(t.id)?.let { Uri.fromFile(File(it)) } ?: Api.img(t.coverUrl)?.let { Uri.parse(it) })
      .build()
  )
  .build()

/** Saved files are read directly; everything else goes through the stream cache. */
@OptIn(UnstableApi::class)
class LocalFirstDataSourceFactory(private val local: DataSource.Factory, private val remote: DataSource.Factory) : DataSource.Factory {
  override fun createDataSource(): DataSource = Split(local.createDataSource(), remote.createDataSource())

  private class Split(private val local: DataSource, private val remote: DataSource) : DataSource {
    private var current: DataSource? = null
    override fun addTransferListener(transferListener: TransferListener) {
      local.addTransferListener(transferListener)
      remote.addTransferListener(transferListener)
    }
    override fun open(dataSpec: DataSpec): Long {
      val s = if (dataSpec.uri.scheme == "file") local else remote
      current = s
      return s.open(dataSpec)
    }
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = current?.read(buffer, offset, length) ?: C.RESULT_END_OF_INPUT
    override fun getUri(): Uri? = current?.uri
    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()
    override fun close() {
      try { current?.close() } finally { current = null }
    }
  }
}

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
