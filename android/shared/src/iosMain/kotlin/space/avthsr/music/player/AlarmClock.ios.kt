// The alarm on iOS: a notification rings at the set time; a tap opens the app and starts the music
// (Alarm starts it by itself when the app is alive at that moment).
package space.avthsr.music.player

import platform.UserNotifications.UNMutableNotificationContent
import platform.UserNotifications.UNNotificationRequest
import platform.UserNotifications.UNNotificationSound
import platform.UserNotifications.UNTimeIntervalNotificationTrigger
import platform.UserNotifications.UNUserNotificationCenter
import space.avthsr.music.Platform
import space.avthsr.music.tr

actual object AlarmClock {
  private const val ID = "alarm"

  actual fun schedule(atMs: Long) {
    cancel()
    val seconds = ((atMs - Platform.nowMs()) / 1000.0).coerceAtLeast(1.0)
    val content = UNMutableNotificationContent()
    content.setTitle(tr("Будильник"))
    content.setBody(tr("Доброе утро! Нажмите, чтобы включить музыку"))
    content.setSound(UNNotificationSound.defaultSound)
    content.setUserInfo(mapOf("route" to "play:alarm"))
    val trigger = UNTimeIntervalNotificationTrigger.triggerWithTimeInterval(seconds, repeats = false)
    UNUserNotificationCenter.currentNotificationCenter().addNotificationRequest(UNNotificationRequest.requestWithIdentifier(ID, content, trigger), null)
  }

  actual fun cancel() {
    UNUserNotificationCenter.currentNotificationCenter().removePendingNotificationRequestsWithIdentifiers(listOf(ID))
  }
}
