package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionBadge
import platform.UserNotifications.UNAuthorizationOptionSound
import platform.UserNotifications.UNUserNotificationCenter
import space.avthsr.music.api.Api

/** iOS has no system back over the player: it closes with its own button and swipe. */
@Composable
actual fun PlayerBackHandler(enabled: Boolean, onProgress: (Float) -> Unit, onBack: () -> Unit, onCancel: () -> Unit) = Unit

@Composable
actual fun AskNotificationsOnce() {
  LaunchedEffect(Unit) {
    if (!Api.prefs.getBoolean("notify.asked", false)) {
      Api.prefs.edit().putBoolean("notify.asked", true).apply()
      UNUserNotificationCenter.currentNotificationCenter()
        .requestAuthorizationWithOptions(UNAuthorizationOptionAlert or UNAuthorizationOptionSound or UNAuthorizationOptionBadge) { _, _ -> }
    }
  }
}
