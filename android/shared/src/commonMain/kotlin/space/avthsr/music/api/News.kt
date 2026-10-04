// News from the admin: kept here for the screens (what is unread), checked in the background every
// 15 minutes and shown as a notification, like a message from the app.
package space.avthsr.music.api

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import space.avthsr.music.Platform
import space.avthsr.music.isoUtc

suspend fun Api.news(after: String? = null): List<NewsItem> = get("/api/news" + (after?.let { "?after=${enc(it)}" } ?: ""))

suspend fun Api.postNews(title: String, body: String): NewsItem =
  json.decodeFromString(NewsItem.serializer(), call("POST", "/api/admin/news", buildJsonObject { put("title", title.trim()); put("body", body.trim()) }.toString()))

suspend fun Api.deleteNews(id: String) { call("DELETE", "/api/admin/news/${enc(id)}") }

object News {
  val items = MutableStateFlow<List<NewsItem>>(emptyList())
  /** the newest news the listener has seen in the app (an ISO time) */
  val seen = MutableStateFlow("")

  fun init() {
    seen.value = Api.prefs.getString("news.seen", "") ?: ""
    NewsAlerts.start()
  }

  fun unread(list: List<NewsItem>, seen: String) = list.filter { it.createdAt > seen }

  suspend fun refresh() {
    if (Api.session.value == null) return
    runCatching { Api.news() }.onSuccess { items.value = it }
  }

  /** Everything up to the newest news counts as read (and needs no notification any more). */
  fun markRead() {
    val newest = items.value.firstOrNull()?.createdAt ?: return
    if (newest <= seen.value) return
    seen.value = newest
    val e = Api.prefs.edit().putString("news.seen", newest)
    if (newest > (Api.prefs.getString("news.notified", "") ?: "")) e.putString("news.notified", newest)
    e.apply()
  }

  /** The admin's own news needs no notification on this phone. */
  fun published(n: NewsItem) {
    items.value = listOf(n) + items.value.filter { it.id != n.id }
    Api.prefs.edit().putString("news.notified", n.createdAt).apply()
    markRead()
  }

  fun nowIso(): String = isoUtc(Platform.nowMs())

  /**
   * The background check (every 15 minutes with a network): news since the last notified one become
   * notifications. False means "try again later".
   */
  suspend fun check(): Boolean {
    val news = checkNews()
    // things friends sent come with the same background check
    val shares = Inbox.check()
    return news && shares
  }

  private suspend fun checkNews(): Boolean {
    if (Api.session.value == null) return true
    val p = Api.prefs
    val since = p.getString("news.notified", null)
    if (since == null) {
      // the first run only sets the mark: what was there before installing is not news
      p.edit().putString("news.notified", nowIso()).apply()
      return true
    }
    val fresh = runCatching { Api.news(since) }.getOrElse { return false }
    if (fresh.isEmpty()) return true
    fresh.asReversed().forEach { NewsAlerts.show(it) }
    p.edit().putString("news.notified", fresh.first().createdAt).apply()
    items.value = (fresh + items.value).distinctBy { it.id }
    return true
  }
}

/** The system's side of news: a periodic background check and a notification per news. */
expect object NewsAlerts {
  fun start()
  fun show(n: NewsItem)
  /** Any other notification (a friend sent a track …); a tap opens [route]. */
  fun notify(key: String, title: String, body: String, route: String)
}
