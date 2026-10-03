@file:OptIn(ExperimentalForeignApi::class)

// Canvas video on iOS: a muted AVQueuePlayer looping the clip in an AVPlayerLayer, cropped to fill.
package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.viewinterop.UIKitInteropProperties
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import platform.AVFoundation.*
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSURL
import platform.QuartzCore.CATransaction
import platform.UIKit.UIColor
import platform.UIKit.UIView

private class VideoView(player: AVQueuePlayer) : UIView(frame = CGRectMake(0.0, 0.0, 0.0, 0.0)) {
  private val videoLayer = AVPlayerLayer.playerLayerWithPlayer(player)

  init {
    videoLayer.videoGravity = AVLayerVideoGravityResizeAspectFill
    layer.addSublayer(videoLayer)
    backgroundColor = UIColor.clearColor
    userInteractionEnabled = false
  }

  override fun layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    videoLayer.frame = bounds
    CATransaction.commit()
  }
}

private class Loop(url: String) {
  val player = AVQueuePlayer()
  private val looper: AVPlayerLooper

  init {
    player.muted = true
    val item = AVPlayerItem(uRL = NSURL(string = url))
    looper = AVPlayerLooper.playerLooperWithPlayer(player, templateItem = item)
  }

  fun release() {
    player.pause()
    looper.disableLooping()
    player.removeAllItems()
  }
}

@Composable
actual fun CanvasVideo(url: String, playing: Boolean, modifier: Modifier) {
  val loop = remember(url) { Loop(url) }
  DisposableEffect(loop) { onDispose { loop.release() } }
  LaunchedEffect(loop, playing) { if (playing) loop.player.play() else loop.player.pause() }
  UIKitView(
    factory = { VideoView(loop.player) },
    modifier = modifier.clipToBounds(),
    properties = UIKitInteropProperties(isInteractive = false, isNativeAccessibilityEnabled = false),
  )
}
