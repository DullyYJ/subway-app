import SwiftUI

/// 서버 화면 하나를 받아(POST/GET) 그린다. 받는 동안 이전 화면을 유지하고, 실패하면 이유를 보여 준다.
@MainActor
final class ScreenLoader: ObservableObject {
    @Published var screen: Screen? = nil
    @Published var error: String? = nil
    @Published var loading = false
    func load(path: String, method: String = "POST", body: String? = nil) async {
        loading = true; defer { loading = false }
        do { screen = try await Net.screen(path, method: method, body: body); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct ScreenBody: View {
    let screen: Screen
    let pal: Palette
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(screen.head) { NodeView(node: $0, pal: pal) }
                ForEach(screen.body) { NodeView(node: $0, pal: pal) }
            }.padding(.bottom, 24)
        }
        .background(pal.color(screen.bg) ?? pal.color("bg") ?? Color(.systemBackground))
    }
}

struct RemoteScreen: View {
    let path: String
    var method: String = "POST"
    var payload: String? = nil
    let pal: Palette
    @StateObject private var loader = ScreenLoader()
    @EnvironmentObject var host: Host
    private var key: String { "\(path)|\(method)|\(payload ?? "")|\(host.reloadTick)" }

    var body: some View {
        ZStack {
            if let s = loader.screen { ScreenBody(screen: s, pal: pal) }
            else { (pal.color("bg") ?? Color(.systemBackground)).ignoresSafeArea() }
            if loader.loading && loader.screen == nil { ProgressView() }
            if let e = loader.error {
                VStack { Spacer(); Text(e).font(.footnote).foregroundColor(.white).padding(10).background(Color.red.opacity(0.85)).cornerRadius(8).padding() }
            }
        }
        .task(id: key) { await loader.load(path: path, method: method, body: payload) }
    }
}
