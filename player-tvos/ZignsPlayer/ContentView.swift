import SwiftUI

struct ContentView: View {
    var body: some View {
        PlayerWebView(url: PlayerConfiguration.playerURL())
            .ignoresSafeArea()
            .background(Color.black)
    }
}
