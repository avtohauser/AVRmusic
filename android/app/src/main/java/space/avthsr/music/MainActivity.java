package space.avthsr.music;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * AVRmusic: the site in a full-screen WebView. No status or navigation bar (they slide in with a swipe
 * from the edge and hide again), content runs under the camera cutout, and music plays in
 * {@link PlaybackService} so the notification-shade player has a Like button.
 */
public class MainActivity extends ComponentActivity {
  static final String ACTION_OPEN_PLAYER = "space.avthsr.music.OPEN_PLAYER";

  private WebView web;
  private PlayerClient player;
  private String origin;
  private String host;
  private volatile boolean ownSite = true;
  private boolean pageReady;
  private String pendingScript;
  private ValueCallback<Uri[]> fileCallback;
  private ActivityResultLauncher<Intent> filePicker;
  /** CSS px: top, right, bottom, left, and the top inset for a bar whose middle may sit around a centred camera hole */
  private volatile String insets = "{\"t\":0,\"r\":0,\"b\":0,\"l\":0,\"tBar\":0}";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    origin = getString(R.string.site_url);
    host = Uri.parse(origin).getHost();

    edgeToEdge();
    web = new WebView(this);
    web.setBackgroundColor(ContextCompat.getColor(this, R.color.backgroundColor));
    setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    hideSystemBars();
    ViewCompat.setOnApplyWindowInsetsListener(web, (v, wi) -> { applyInsets(wi); return WindowInsetsCompat.CONSUMED; });

    player = new PlayerClient(this, this::emit);
    Hub.setListener(name -> emit("command", obj("name", name)));

    filePicker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
      if (fileCallback == null) return;
      Uri[] picked = null;
      Intent data = result.getData();
      if (result.getResultCode() == RESULT_OK && data != null) {
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
          picked = new Uri[clip.getItemCount()];
          for (int i = 0; i < picked.length; i++) picked[i] = clip.getItemAt(i).getUri();
        } else if (data.getData() != null) picked = new Uri[] { data.getData() };
      }
      fileCallback.onReceiveValue(picked);
      fileCallback = null;
    });

    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() { back(); }
    });

    setUpWebView();
    web.loadUrl(startUrl(getIntent()));
  }

  /* ---------- full screen ---------- */

  private void edgeToEdge() {
    Window w = getWindow();
    WindowCompat.setDecorFitsSystemWindows(w, false);
    w.setStatusBarColor(Color.TRANSPARENT);
    w.setNavigationBarColor(Color.TRANSPARENT);
    if (Build.VERSION.SDK_INT >= 29) { w.setStatusBarContrastEnforced(false); w.setNavigationBarContrastEnforced(false); }
    if (Build.VERSION.SDK_INT >= 28) {
      WindowManager.LayoutParams lp = w.getAttributes();
      lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
          ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
          : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      w.setAttributes(lp);
    }
  }

  private void hideSystemBars() {
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    c.setAppearanceLightStatusBars(false);
    c.setAppearanceLightNavigationBars(false);
    c.hide(WindowInsetsCompat.Type.systemBars());
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars(); // dialogs, the keyboard or the shade may have brought the bars back
  }

  /**
   * The page gets the areas it must keep clear as CSS variables: the camera cutout, and the bars only
   * if a device refuses to hide them. The keyboard shrinks the WebView instead.
   */
  private void applyInsets(WindowInsetsCompat wi) {
    Insets cut = wi.getInsets(WindowInsetsCompat.Type.displayCutout());
    Insets bars = wi.getInsets(WindowInsetsCompat.Type.systemBars());
    Insets ime = wi.getInsets(WindowInsetsCompat.Type.ime());
    float d = getResources().getDisplayMetrics().density;
    int top = Math.max(cut.top, bars.top), bottom = Math.max(cut.bottom, bars.bottom);
    int left = Math.max(cut.left, bars.left), right = Math.max(cut.right, bars.right);
    boolean keyboard = ime.bottom > bottom;
    web.setPadding(0, 0, 0, keyboard ? ime.bottom : 0);

    // A punch hole in the middle of the top edge leaves the corners free: a bar with its buttons at the
    // sides can go all the way up.
    int topBar = top;
    DisplayCutoutCompat dc = wi.getDisplayCutout();
    if (dc != null && bars.top == 0 && cut.top > 0) {
      int width = web.getWidth() > 0 ? web.getWidth() : getResources().getDisplayMetrics().widthPixels;
      boolean centred = !dc.getBoundingRects().isEmpty();
      for (Rect r : dc.getBoundingRects()) {
        if (r.top > 0) continue; // not on the top edge
        if (r.left < width * 0.30f || r.right > width * 0.70f) centred = false;
      }
      if (centred) topBar = 0;
    }

    JSONObject o = new JSONObject();
    try {
      o.put("t", Math.round(top / d));
      o.put("r", Math.round(right / d));
      o.put("b", keyboard ? 0 : Math.round(bottom / d));
      o.put("l", Math.round(left / d));
      o.put("tBar", Math.round(topBar / d));
    } catch (JSONException ignored) { }
    insets = o.toString();
    emit("insets", o);
  }

  String insetsJson() { return insets; }

  boolean showsOwnSite() { return ownSite; }

  /* ---------- the page ---------- */

  @SuppressLint("SetJavaScriptEnabled")
  private void setUpWebView() {
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(true);
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    s.setDisplayZoomControls(false);
    s.setTextZoom(100);
    s.setSupportMultipleWindows(false);
    s.setUserAgentString(s.getUserAgentString() + " AVRmusicApp/" + BuildConfig.VERSION_NAME);
    if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.setVerticalScrollBarEnabled(false);
    web.setHorizontalScrollBarEnabled(false);
    web.addJavascriptInterface(new NativeBridge(this, player), "AVRNative");

    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return request.isForMainFrame() && openOutside(request.getUrl());
      }

      @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        ownSite = isOwn(url);
        pageReady = false;
      }

      @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) { ownSite = isOwn(url); }

      @Override public void onPageFinished(WebView view, String url) {
        ownSite = isOwn(url);
        pageReady = true;
        emitRaw("insets", insets);
        if (pendingScript != null) { String js = pendingScript; pendingScript = null; web.evaluateJavascript(js, null); }
      }

      @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) showOffline(); // no network and nothing cached yet
      }
    });

    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        Intent intent;
        try { intent = params.createIntent(); } catch (Exception e) { intent = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { filePicker.launch(intent); return true; }
        catch (ActivityNotFoundException e) { fileCallback = null; callback.onReceiveValue(null); return false; }
      }
    });

    web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> download(url, userAgent, contentDisposition, mimeType));
  }

  private boolean isOwn(String url) {
    if (url == null) return false;
    Uri u = Uri.parse(url);
    return "https".equals(u.getScheme()) && host.equalsIgnoreCase(u.getHost());
  }

  /** Other sites (and mailto:, tel: …) open in their apps / the browser. */
  private boolean openOutside(Uri u) {
    if (isOwn(u.toString())) return false;
    try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); }
    catch (ActivityNotFoundException ignored) { }
    return true;
  }

  private void showOffline() {
    String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
        + "<body style='margin:0;height:100vh;display:grid;place-items:center;background:#141218;color:#E6E0E9;font:16px sans-serif;text-align:center'>"
        + "<div><div style='font-size:48px'>✦</div><p>" + getString(R.string.offline_title) + "</p>"
        + "<a href='" + origin + "/' style='display:inline-block;margin-top:8px;padding:12px 24px;border-radius:24px;background:#D0BCFF;color:#381E72;text-decoration:none;font-weight:600'>"
        + getString(R.string.offline_retry) + "</a></div></body>";
    web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
  }

  private void download(String url, String userAgent, String contentDisposition, String mimeType) {
    Uri u = Uri.parse(url);
    if (!"https".equals(u.getScheme()) && !"http".equals(u.getScheme())) return; // blob:/data: stay in the page
    String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
    try {
      DownloadManager.Request req = new DownloadManager.Request(u)
          .setTitle(name)
          .setMimeType(mimeType)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "AVRmusic/" + name);
      String cookies = CookieManager.getInstance().getCookie(url);
      if (cookies != null) req.addRequestHeader("Cookie", cookies);
      req.addRequestHeader("User-Agent", userAgent);
      ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
      Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
    } catch (Exception e) {
      openOutside(u); // no storage permission on an old Android: let the browser save it
    }
  }

  /** Back: the page closes what is open (player, sheet, dialog) or goes back; on the first screen the app goes to the background. */
  private void back() {
    if (!pageReady || !ownSite) { if (web.canGoBack()) web.goBack(); else moveTaskToBack(true); return; }
    web.evaluateJavascript("(function(){try{return !!(window.__avrBack&&window.__avrBack())}catch(e){return false}})()", handled -> {
      if ("true".equals(handled)) return;
      if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);
    });
  }

  /* ---------- links, shortcuts, the shade player ---------- */

  private String startUrl(Intent intent) {
    Uri data = intent == null ? null : intent.getData();
    if (data != null && isOwn(data.toString())) return data.toString();
    if (intent != null && ACTION_OPEN_PLAYER.equals(intent.getAction())) pendingScript = "window.__avrOpenPlayer&&window.__avrOpenPlayer()";
    return origin + "/";
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    String js = null;
    if (ACTION_OPEN_PLAYER.equals(intent.getAction())) js = "window.__avrOpenPlayer&&window.__avrOpenPlayer()";
    else if (intent.getData() != null && isOwn(intent.getData().toString())) {
      Uri u = intent.getData();
      String path = (u.getEncodedPath() == null ? "/" : u.getEncodedPath()) + (u.getEncodedQuery() == null ? "" : "?" + u.getEncodedQuery());
      js = "window.__avrNavigate?window.__avrNavigate(" + JSONObject.quote(path) + "):location.assign(" + JSONObject.quote(u.toString()) + ")";
    }
    if (js == null) return;
    if (pageReady && ownSite) web.evaluateJavascript(js, null);
    else pendingScript = js;
  }

  /* ---------- app → page ---------- */

  void emit(String type, JSONObject data) { emitRaw(type, data == null ? "null" : data.toString()); }

  private void emitRaw(String type, String json) {
    Hub.post(() -> {
      if (web == null) return;
      web.evaluateJavascript("window.__avrNative&&window.__avrNative(" + JSONObject.quote(type) + "," + json + ")", null);
    });
  }

  private static JSONObject obj(String key, Object value) {
    JSONObject o = new JSONObject();
    try { o.put(key, value); } catch (JSONException ignored) { }
    return o;
  }

  /* ---------- lifecycle: music keeps playing in the service ---------- */

  @Override
  protected void onStart() {
    super.onStart();
    if (web != null) web.onResume();
    hideSystemBars();
  }

  @Override
  protected void onStop() {
    if (web != null) web.onPause(); // stops drawing; scripts keep running so the queue advances in the background
    super.onStop();
  }

  @Override
  protected void onDestroy() {
    Hub.setListener(null);
    if (player != null) player.release();
    if (web != null) {
      web.removeJavascriptInterface("AVRNative");
      web.destroy();
      web = null;
    }
    super.onDestroy();
  }
}
