package com.usm007.studysynth;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Let the web app close overlays and step back before the app exits.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                    "window.__studysynthBack ? window.__studysynthBack() : false",
                    value -> {
                        if (!"true".equals(value)) finish();
                    }
                );
            }
        });
    }
}
