// Motion, by the Material 3 Expressive guide: everything moves on springs. Spatial springs (position,
// size, shape) may overshoot a little; effects springs (colour, opacity) never do. Screens change with
// the standard transition patterns — fade through between the tabs, a shared X axis going deeper and
// back — and covers flow from the card that was tapped into the page it opens (container transform).
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MotionScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.navigation.NavBackStackEntry

object Motion {
  /** For the app's hero moments: covers, buttons, the player. */
  val expressive = MotionScheme.expressive()
  /** For whole screens, which must not bounce past the edges. */
  val standard = MotionScheme.standard()

  /** The tabs of the navigation island: switching between them is a fade through, not a journey. */
  val tabs = setOf("home", "search", "library")

  private fun isTabSwitch(s: AnimatedContentTransitionScope<NavBackStackEntry>) =
    s.initialState.destination.route in tabs && s.targetState.destination.route in tabs

  /** Fade through: the old screen fades out quickly, the new one fades in while growing from 92 %. */
  private fun fadeThroughIn(): EnterTransition =
    fadeIn(standard.defaultEffectsSpec()) + scaleIn(standard.defaultSpatialSpec(), initialScale = 0.92f)

  private fun fadeThroughOut(): ExitTransition = fadeOut(standard.fastEffectsSpec())

  /** Shared X axis: deeper pages come in from the right, a sixth of the width, and fade. */
  private fun axisIn(forward: Boolean): EnterTransition =
    slideInHorizontally(standard.defaultSpatialSpec()) { w -> if (forward) w / 6 else -w / 6 } + fadeIn(standard.defaultEffectsSpec())

  private fun axisOut(forward: Boolean): ExitTransition =
    slideOutHorizontally(standard.defaultSpatialSpec()) { w -> if (forward) -w / 6 else w / 6 } + fadeOut(standard.fastEffectsSpec())

  val enter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = { if (isTabSwitch(this)) fadeThroughIn() else axisIn(true) }
  val exit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = { if (isTabSwitch(this)) fadeThroughOut() else axisOut(true) }
  val popEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = { if (isTabSwitch(this)) fadeThroughIn() else axisIn(false) }
  val popExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = { if (isTabSwitch(this)) fadeThroughOut() else axisOut(false) }

  /** Covers fly between places on the expressive spatial spring. */
  val coverBounds = BoundsTransform { _, _ -> expressive.defaultSpatialSpec() }
}

/** The shared-transition layout around the screens and the player. */
val LocalShared = staticCompositionLocalOf<SharedTransitionScope?> { null }

/** The visibility animation of the screen (or the player) a composable is in. */
val LocalAnimScope = compositionLocalOf<AnimatedVisibilityScope?> { null }

/**
 * Which card was tapped last. A cover can be on a screen several times (an album in two shelves), but
 * only the tapped card hands its cover over to the page it opens, and gets it back on the way back.
 */
object SharedCover {
  var token by mutableStateOf<String?>(null)
    private set
  var key by mutableStateOf<String?>(null)
    private set

  fun tap(token: String, key: String) {
    this.token = token
    this.key = key
  }
}

/**
 * Marks a cover as the same thing as the cover with [key] elsewhere, so it flows between them.
 * A card passes its [token] and joins only when it was the one tapped; a page header passes none.
 */
@Composable
fun Modifier.sharedCover(key: String?, token: String? = null): Modifier {
  val shared = LocalShared.current ?: return this
  val anim = LocalAnimScope.current ?: return this
  if (key == null) return this
  if (token != null && (SharedCover.token != token || SharedCover.key != key)) return this
  return with(shared) { this@sharedCover.sharedElement(rememberSharedContentState(key), anim, Motion.coverBounds) }
}
