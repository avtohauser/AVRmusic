// What avrtube's app and server exchange: one shape whether the NewPipe engine runs on the phone (Android)
// or on the server (iPhone).
package space.avthsr.tube.model

import kotlinx.serialization.Serializable

/** A video, a channel or a playlist in a list (search results, related videos, a channel's uploads). */
@Serializable
data class TubeItem(
  /** "video", "channel" or "playlist" */
  val kind: String,
  val id: String,
  val url: String,
  val title: String,
  val author: String? = null,
  val authorUrl: String? = null,
  val authorAvatar: String? = null,
  val thumbnail: String? = null,
  /** seconds; -1 when unknown (a live stream, a channel) */
  val durationSec: Long = -1,
  val views: Long = -1,
  /** as the site says it ("2 дня назад") */
  val published: String? = null,
  val subscribers: Long = -1,
  /** a playlist's videos */
  val count: Long = -1,
  val live: Boolean = false,
  val shorts: Boolean = false,
)

/** A page of a list; [next] continues it (an opaque token). */
@Serializable
data class TubePage(val items: List<TubeItem> = emptyList(), val next: String? = null)

/** One way to play a video: "muxed" (picture and sound), "video" (picture only) or "audio". */
@Serializable
data class TubeStream(
  val url: String,
  val kind: String,
  val mime: String? = null,
  /** "720p", "1080p60"… for video */
  val quality: String? = null,
  val height: Int = 0,
  val bitrate: Int = 0,
  val itag: Int = 0,
  val codec: String? = null,
  /** a dubbed or original audio track's name */
  val track: String? = null,
)

@Serializable
data class TubeChapter(val title: String, val startSec: Int)

@Serializable
data class TubeVideo(
  val id: String,
  val url: String,
  val title: String,
  val description: String = "",
  val author: String? = null,
  val authorUrl: String? = null,
  val authorAvatar: String? = null,
  val subscribers: Long = -1,
  val views: Long = -1,
  val likes: Long = -1,
  val published: String? = null,
  val durationSec: Long = -1,
  val thumbnail: String? = null,
  val live: Boolean = false,
  /** HLS playlist (what the iPhone's player wants), when YouTube gives one */
  val hls: String? = null,
  /** DASH manifest */
  val dash: String? = null,
  val streams: List<TubeStream> = emptyList(),
  val related: List<TubeItem> = emptyList(),
  val chapters: List<TubeChapter> = emptyList(),
)

@Serializable
data class TubeChannel(
  val id: String,
  val url: String,
  val title: String,
  val avatar: String? = null,
  val banner: String? = null,
  val subscribers: Long = -1,
  val description: String? = null,
  val videos: TubePage = TubePage(),
)

@Serializable
data class TubePlaylist(
  val id: String,
  val url: String,
  val title: String,
  val author: String? = null,
  val thumbnail: String? = null,
  val count: Long = -1,
  val videos: TubePage = TubePage(),
)

@Serializable
data class TubeComment(
  val author: String,
  val authorAvatar: String? = null,
  val text: String,
  val likes: Long = -1,
  val published: String? = null,
  val pinned: Boolean = false,
  val replies: Int = 0,
)

@Serializable
data class TubeComments(val items: List<TubeComment> = emptyList(), val next: String? = null, val disabled: Boolean = false)
