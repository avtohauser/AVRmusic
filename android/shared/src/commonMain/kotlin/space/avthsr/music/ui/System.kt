// Pieces of the system the screens use: the back gesture over the open player and the one-time
// question about notifications.
package space.avthsr.music.ui

import androidx.compose.runtime.Composable

/** A (predictive) back while the player is open: [onProgress] follows the gesture, [onBack] closes it. */
@Composable
expect fun PlayerBackHandler(enabled: Boolean, onProgress: (Float) -> Unit, onBack: () -> Unit, onCancel: () -> Unit)

/** Asks for notifications once (news from the admin), where the system wants a yes. */
@Composable
expect fun AskNotificationsOnce()
