package com.unera.social;

import android.app.DownloadManager;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
    }

    @Override
    public void onStart() {
        super.onStart();
        configureSystemBars();
        setupWebViewBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureSystemBars();
        setupWebViewBridge();
    }

    /**
     * Polished edge-to-edge system bar configuration matching UNERA's Dark Navy theme (#050B18).
     * Keeps native status bar (time, battery, network) and navigation bar (gestures / 3 buttons)
     * fully visible and interactive, while ensuring their background visually integrates with
     * the dark navy palette and system icons stay clearly legible (light/white on dark).
     */
    private void configureSystemBars() {
        Window window = getWindow();
        if (window == null) return;

        try {
            int darkNavy = Color.parseColor("#050B18");

            // Set system bar colors to UNERA Dark Navy
            window.setStatusBarColor(darkNavy);
            window.setNavigationBarColor(darkNavy);

            WindowInsetsControllerCompat controller =
                new WindowInsetsControllerCompat(window, window.getDecorView());

            // Light text/icons on dark status bar (time, battery, wifi, network)
            controller.setAppearanceLightStatusBars(false);

            // Light navigation controls / gesture bar on dark navy bottom bar
            controller.setAppearanceLightNavigationBars(false);

            // Guarantee both status bar and navigation bar remain visible
            controller.show(WindowInsetsCompat.Type.systemBars());
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "System bar configuration notice: " + e.getMessage());
        }
    }

    private void setupWebViewBridge() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();

            // Inject UneraNative JavaScript interface
            webView.addJavascriptInterface(new UneraNativeInterface(), "UneraNative");

            // Flag native environment in JavaScript
            webView.evaluateJavascript(
                "if (typeof window !== 'undefined') { " +
                "  window.UNERA_IS_NATIVE_APP = true; " +
                "  if (!window.UneraNative) { window.UneraNative = {}; } " +
                "}",
                null
            );

            // Handle native file downloads seamlessly
            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                    try {
                        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                        request.setMimeType(mimeType);
                        String cookies = CookieManager.getInstance().getCookie(url);
                        request.addRequestHeader("cookie", cookies);
                        request.addRequestHeader("User-Agent", userAgent);
                        request.setDescription("Downloading file...");
                        String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                        request.setTitle(filename);
                        request.allowScanningByMediaScanner();
                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

                        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (dm != null) {
                            dm.enqueue(request);
                            Toast.makeText(getApplicationContext(), "Downloading " + filename, Toast.LENGTH_SHORT).show();
                        }
                    } catch (Exception e) {
                        Toast.makeText(getApplicationContext(), "Download failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }

    public class UneraNativeInterface {
        @JavascriptInterface
        public void postMessage(String message) {
            android.util.Log.d("UneraNative", "Native message received: " + message);
        }
    }
}
