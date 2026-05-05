import SwiftUI
import WebKit

struct PlayerWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.customUserAgent = "ZignsTvOSPlayer/\(PlayerConfiguration.appVersion)"

        if #available(tvOS 16.4, *) {
            webView.isInspectable = true
        }

        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url == nil {
            webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            scheduleReload(webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            scheduleReload(webView)
        }

        private func scheduleReload(_ webView: WKWebView) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                if webView.url == nil {
                    webView.load(URLRequest(url: PlayerConfiguration.playerURL(), timeoutInterval: 30))
                } else {
                    webView.reload()
                }
            }
        }
    }
}
