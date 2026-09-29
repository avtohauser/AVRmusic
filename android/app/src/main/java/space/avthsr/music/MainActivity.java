package space.avthsr.music;

import android.os.Build;
import android.view.WindowManager;

import androidx.browser.trusted.TrustedWebActivityDisplayMode;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens the site edge to edge: status and navigation bars are hidden (a swipe from the edge shows
 * them for a moment) and the page is drawn under the display cutout too, so there are no bars or
 * letterbox strips around the app. The web UI keeps its controls clear of the cutout with
 * env(safe-area-inset-*).
 */
public class MainActivity extends LauncherActivity {
    @Override
    protected TrustedWebActivityDisplayMode getDisplayMode() {
        int cutout = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                : 0;
        return new TrustedWebActivityDisplayMode.ImmersiveMode(/* isSticky= */ true, cutout);
    }
}
