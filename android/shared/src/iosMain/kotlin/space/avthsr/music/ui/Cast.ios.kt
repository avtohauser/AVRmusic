@file:OptIn(ExperimentalForeignApi::class)

// The player's cast button on iOS: the system's AirPlay picker (HomePod, Apple TV, AirPlay speakers).
package space.avthsr.music.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import platform.AVKit.AVRoutePickerView
import platform.UIKit.UIColor

private fun Color.ui() = UIColor(red = red.toDouble(), green = green.toDouble(), blue = blue.toDouble(), alpha = alpha.toDouble())

@Composable
actual fun CastButton(tint: Color) {
  val accent = MaterialTheme.colorScheme.primary
  UIKitView(
    factory = {
      AVRoutePickerView().apply {
        prioritizesVideoDevices = false
        backgroundColor = UIColor.clearColor
      }
    },
    modifier = Modifier.size(48.dp),
    update = { v ->
      v.tintColor = tint.ui()
      v.activeTintColor = accent.ui()
    },
  )
}
