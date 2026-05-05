import Foundation

enum PlayerConfiguration {
    static let baseURL = URL(string: "https://app.zigns.io/display.html")!

    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
    }

    static func playerURL(reset: Bool = false) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        var items = components.queryItems ?? []
        items.removeAll { $0.name == "nativePlatform" || $0.name == "nativeVersion" || $0.name == "reset" }
        items.append(URLQueryItem(name: "nativePlatform", value: "tvos"))
        items.append(URLQueryItem(name: "nativeVersion", value: appVersion))
        if reset {
            items.append(URLQueryItem(name: "reset", value: "1"))
        }
        components.queryItems = items
        return components.url!
    }
}
