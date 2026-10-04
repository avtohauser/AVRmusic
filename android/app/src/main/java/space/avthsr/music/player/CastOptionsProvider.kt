// Google Cast: the default media receiver plays the server's stream on a Chromecast, a TV or a speaker.
package space.avthsr.music.player

import android.content.Context
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider

class CastOptionsProvider : OptionsProvider {
  override fun getCastOptions(context: Context): CastOptions = CastOptions.Builder()
    .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
    .setStopReceiverApplicationWhenEndingSession(true)
    .build()

  override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}
