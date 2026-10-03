// The iOS app: a thin shell around the shared Compose app (android/shared), full screen like on Android.
import SwiftUI
import UIKit
import Shared

@main
struct AVRmusicApp: SwiftUI.App {
  init() {
    MainViewControllerKt.start()
  }

  var body: some Scene {
    WindowGroup {
      ComposeView()
        .ignoresSafeArea()
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .onOpenURL { url in MainViewControllerKt.openLink(url: url.absoluteString) }
    }
  }
}

struct ComposeView: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> UIViewController {
    MainViewControllerKt.MainViewController()
  }

  func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
