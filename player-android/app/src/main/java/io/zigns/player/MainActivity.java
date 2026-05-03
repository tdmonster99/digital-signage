package io.zigns.player;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String TAG = "ZignsPlayer";
    private static final String DISPLAY_URL = "https://app.zigns.io/display.html";
    private static final long LOAD_TIMEOUT_MS = 90_000L;
    private static final long WATCHDOG_INTERVAL_MS = 30_000L;
    private static final long BASE_RELOAD_DELAY_MS = 15_000L;
    private static final long MAX_RELOAD_DELAY_MS = 120_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private FrameLayout root;
    private WebView webView;
    private TextView statusView;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private PowerManager.WakeLock wakeLock;
    private boolean destroyed;
    private boolean pageLoading;
    private boolean reloadWhenOnline;
    private int loadFailures;
    private long pageLoadStartedAt;

    private final Runnable watchdogRunnable = new Runnable() {
        @Override
        public void run() {
            if (destroyed) return;
            if (pageLoading && System.currentTimeMillis() - pageLoadStartedAt > LOAD_TIMEOUT_MS) {
                pageLoading = false;
                loadFailures++;
                scheduleReload("Player load timed out.");
            }
            handler.postDelayed(this, WATCHDOG_INTERVAL_MS);
        }
    };

    private final Runnable reloadRunnable = new Runnable() {
        @Override
        public void run() {
            if (destroyed || webView == null) return;
            if (!hasNetwork()) {
                reloadWhenOnline = true;
                showStatus("Waiting for network...");
                return;
            }
            loadPlayer(false);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        statusView = new TextView(this);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(14);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(24, 12, 24, 12);
        statusView.setBackgroundColor(Color.argb(190, 7, 11, 22));
        statusView.setVisibility(View.GONE);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        root.addView(statusView, statusParams);

        createWebView();
        registerNetworkWatcher();
        enterImmersiveMode();
        loadPlayer(false);
        handler.postDelayed(watchdogRunnable, WATCHDOG_INTERVAL_MS);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        acquireWakeLock();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        releaseWakeLock();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        handler.removeCallbacksAndMessages(null);
        unregisterNetworkWatcher();
        destroyWebView();
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_UP
                && (event.getKeyCode() == KeyEvent.KEYCODE_MENU
                || event.getKeyCode() == KeyEvent.KEYCODE_SETTINGS)) {
            showMaintenanceMenu();
            return true;
        }
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        destroyWebView();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setKeepScreenOn(true);
        webView.setLongClickable(true);
        webView.setOnLongClickListener(v -> {
            showMaintenanceMenu();
            return true;
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        String userAgent = settings.getUserAgentString();
        settings.setUserAgentString(userAgent + " ZignsAndroidPlayer/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.setWebViewClient(new PlayerWebViewClient());
        webView.setWebChromeClient(new PlayerChromeClient());

        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        );
        root.addView(webView, 0, webParams);
    }

    private void destroyWebView() {
        if (webView == null) return;
        try {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            root.removeView(webView);
            webView.destroy();
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not destroy WebView cleanly", e);
        } finally {
            webView = null;
        }
    }

    private void loadPlayer(boolean resetPairing) {
        if (webView == null) createWebView();
        pageLoading = true;
        pageLoadStartedAt = System.currentTimeMillis();
        reloadWhenOnline = false;
        showStatus("Loading Zigns...");
        webView.loadUrl(buildPlayerUrl(resetPairing));
    }

    private String buildPlayerUrl(boolean resetPairing) {
        Uri.Builder builder = Uri.parse(DISPLAY_URL).buildUpon()
                .appendQueryParameter("nativePlatform", "android")
                .appendQueryParameter("nativeVersion", BuildConfig.VERSION_NAME);
        if (resetPairing) {
            builder.appendQueryParameter("reset", "1");
        }
        return builder.build().toString();
    }

    private void scheduleReload(String message) {
        showStatus(message + " Retrying...");
        handler.removeCallbacks(reloadRunnable);
        long delay = Math.min(MAX_RELOAD_DELAY_MS, BASE_RELOAD_DELAY_MS * Math.max(1, loadFailures));
        handler.postDelayed(reloadRunnable, delay);
    }

    private void showStatus(String message) {
        statusView.setText(message);
        statusView.setVisibility(View.VISIBLE);
    }

    private void hideStatusSoon() {
        handler.postDelayed(() -> {
            if (!pageLoading && statusView != null) statusView.setVisibility(View.GONE);
        }, 2500L);
    }

    private void showMaintenanceMenu() {
        enterImmersiveMode();
        String[] actions = {"Reload player", "Reset pairing", "Cancel"};
        new AlertDialog.Builder(this)
                .setTitle("Zigns Player")
                .setItems(actions, (dialog, which) -> {
                    if (which == 0) {
                        loadFailures = 0;
                        loadPlayer(false);
                    } else if (which == 1) {
                        resetPairing();
                    }
                })
                .show();
    }

    private void resetPairing() {
        WebStorage.getInstance().deleteAllData();
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();
        if (webView != null) {
            webView.clearCache(true);
            webView.clearHistory();
        }
        loadFailures = 0;
        loadPlayer(true);
    }

    @SuppressLint("WakelockTimeout")
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) return;
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ZignsPlayer:Playback");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void registerNetworkWatcher() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                handler.post(() -> {
                    if (reloadWhenOnline || loadFailures > 0) {
                        loadFailures = 0;
                        loadPlayer(false);
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                handler.post(() -> showStatus("Network unavailable. Waiting..."));
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                connectivityManager.registerDefaultNetworkCallback(networkCallback);
            } else {
                NetworkRequest request = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                connectivityManager.registerNetworkCallback(request, networkCallback);
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "Network callback registration failed", e);
        }
    }

    private void unregisterNetworkWatcher() {
        if (connectivityManager == null || networkCallback == null) return;
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback);
        } catch (RuntimeException e) {
            Log.w(TAG, "Network callback unregister failed", e);
        }
        networkCallback = null;
    }

    private boolean hasNetwork() {
        if (connectivityManager == null) return true;
        Network network = connectivityManager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void enterImmersiveMode() {
        View decor = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = decor.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    private class PlayerWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            pageLoading = true;
            pageLoadStartedAt = System.currentTimeMillis();
            showStatus("Loading Zigns...");
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pageLoading = false;
            loadFailures = 0;
            hideStatusSoon();
            enterImmersiveMode();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request != null && request.isForMainFrame()) {
                pageLoading = false;
                loadFailures++;
                String message = error == null ? "Player load failed." : error.getDescription().toString();
                scheduleReload(message);
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (request != null && request.isForMainFrame()) {
                pageLoading = false;
                loadFailures++;
                int code = errorResponse == null ? 0 : errorResponse.getStatusCode();
                scheduleReload("Player returned HTTP " + code + ".");
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            showStatus("Player renderer restarted.");
            createWebView();
            loadPlayer(false);
            return true;
        }
    }

    private static class PlayerChromeClient extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            if (consoleMessage != null) {
                Log.d(TAG, consoleMessage.message());
            }
            return true;
        }
    }
}
