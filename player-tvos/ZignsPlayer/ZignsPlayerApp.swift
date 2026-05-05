import SwiftUI
import UIKit

@main
struct ZignsPlayerApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    UIApplication.shared.isIdleTimerDisabled = true
                }
                .onDisappear {
                    UIApplication.shared.isIdleTimerDisabled = false
                }
                .onChange(of: scenePhase) { phase in
                    UIApplication.shared.isIdleTimerDisabled = (phase == .active)
                }
        }
    }
}
