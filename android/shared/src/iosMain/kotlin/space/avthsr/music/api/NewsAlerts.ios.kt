@file:OptIn(ExperimentalForeignApi::class)

// News on iOS: a background app refresh checks for news (iOS decides when, at most every 15 minutes)
// and each news becomes a local notification; tapping it opens the news screen.
package space.avthsr.music.api

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.launch
import platform.BackgroundTasks.BGAppRefreshTask
import platform.BackgroundTasks.BGAppRefreshTaskRequest
import platform.BackgroundTasks.BGTaskScheduler
import platform.Foundation.NSDate
import platform.Foundation.dateWithTimeIntervalSinceNow
import platform.UserNotifications.UNMutableNotificationContent
import platform.UserNotifications.UNNotification
import platform.UserNotifications.UNNotificationPresentationOptionBanner
import platform.UserNotifications.UNNotificationPresentationOptionList
import platform.UserNotifications.UNNotificationPresentationOptionSound
import platform.UserNotifications.UNNotificationPresentationOptions
import platform.UserNotifications.UNNotificationRequest
import platform.UserNotifications.UNNotificationResponse
import platform.UserNotifications.UNNotificationSound
import platform.UserNotifications.UNUserNotificationCenter
import platform.UserNotifications.UNUserNotificationCenterDelegateProtocol
import platform.darwin.NSObject
import space.avthsr.music.App
import space.avthsr.music.Links
import space.avthsr.music.tr

actual object NewsAlerts {
  /** the BGTaskSchedulerPermittedIdentifiers entry in Info.plist */
  const val TASK = "space.avthsr.music.news"
  private var registered = false

  private val delegate = object : NSObject(), UNUserNotificationCenterDelegateProtocol {
    // shown as a banner even while the app is open, like on Android
    override fun userNotificationCenter(
      center: UNUserNotificationCenter,
      willPresentNotification: UNNotification,
      withCompletionHandler: (UNNotificationPresentationOptions) -> Unit,
    ) = withCompletionHandler(UNNotificationPresentationOptionBanner or UNNotificationPresentationOptionList or UNNotificationPresentationOptionSound)

    override fun userNotificationCenter(
      center: UNUserNotificationCenter,
      didReceiveNotificationResponse: UNNotificationResponse,
      withCompletionHandler: () -> Unit,
    ) {
      val info = didReceiveNotificationResponse.notification.request.content.userInfo
      if (info["news"] != null) Links.deepLink.value = "news"
      (info["route"] as? String)?.let { Links.deepLink.value = it }
      withCompletionHandler()
    }
  }

  /** Must run while the app is launching (iOS only accepts background task handlers then). */
  actual fun start() {
    UNUserNotificationCenter.currentNotificationCenter().delegate = delegate
    if (registered) return
    registered = BGTaskScheduler.sharedScheduler.registerForTaskWithIdentifier(TASK, usingQueue = null) { task ->
      (task as? BGAppRefreshTask)?.let { handle(it) }
    }
    schedule()
  }

  private fun schedule() {
    val req = BGAppRefreshTaskRequest(identifier = TASK)
    req.earliestBeginDate = NSDate.dateWithTimeIntervalSinceNow(15 * 60.0)
    BGTaskScheduler.sharedScheduler.submitTaskRequest(req, null)
  }

  private fun handle(task: BGAppRefreshTask) {
    schedule()
    val job = App.scope.launch {
      val ok = runCatching { News.check() }.getOrDefault(false)
      task.setTaskCompletedWithSuccess(ok)
    }
    task.expirationHandler = { job.cancel(); task.setTaskCompletedWithSuccess(false) }
  }

  actual fun show(n: NewsItem) {
    val content = UNMutableNotificationContent()
    content.setTitle(n.title)
    content.setBody(n.body.ifBlank { tr("Новое от администратора") })
    content.setSound(UNNotificationSound.defaultSound)
    content.setUserInfo(mapOf("news" to n.id))
    val req = UNNotificationRequest.requestWithIdentifier("news-${n.id}", content, null)
    UNUserNotificationCenter.currentNotificationCenter().addNotificationRequest(req, null)
  }

  actual fun notify(key: String, title: String, body: String, route: String) {
    val content = UNMutableNotificationContent()
    content.setTitle(title)
    content.setBody(body)
    content.setSound(UNNotificationSound.defaultSound)
    content.setUserInfo(mapOf("route" to route))
    val req = UNNotificationRequest.requestWithIdentifier(key, content, null)
    UNUserNotificationCenter.currentNotificationCenter().addNotificationRequest(req, null)
  }
}
