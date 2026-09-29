package space.avthsr.music;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.WindowManager;

import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.trusted.TrustedWebActivityDisplayMode;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

/**
 * Opens the site edge to edge: status and navigation bars are hidden (a swipe from the edge shows
 * them for a moment) and the page is drawn under the display cutout too, so there are no bars or
 * letterbox strips around the app. The web UI keeps its controls clear of the cutout with
 * env(safe-area-inset-*).
 *
 * The TWA runs inside a browser. By default the helper library picks the user's default browser,
 * but not every browser that can host a TWA implements the fullscreen display mode, which leaves
 * the system bars on screen. Chrome does, so it is preferred whenever it is installed.
 */
public class MainActivity extends LauncherActivity {
    /** Browsers that implement TWA display modes, in order of preference. */
    private static final String[] PREFERRED_PROVIDERS = {
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
    };

    @Override
    protected TrustedWebActivityDisplayMode getDisplayMode() {
        int cutout = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                : 0;
        return new TrustedWebActivityDisplayMode.ImmersiveMode(/* isSticky= */ true, cutout);
    }

    @Override
    protected TwaLauncher createTwaLauncher() {
        String provider = preferredProvider();
        return provider != null ? new TwaLauncher(this, provider) : super.createTwaLauncher();
    }

    private String preferredProvider() {
        PackageManager pm = getPackageManager();
        for (String pkg : PREFERRED_PROVIDERS) {
            try {
                ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
                if (!info.enabled) continue;
                Intent service = new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION).setPackage(pkg);
                if (pm.resolveService(service, 0) != null) return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {
                // not installed
            }
        }
        return null;
    }
}
