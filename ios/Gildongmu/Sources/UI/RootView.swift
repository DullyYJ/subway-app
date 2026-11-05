import SwiftUI

struct RootView: View {
    @StateObject private var host = Host()
    @Environment(\.colorScheme) private var scheme
    private var pal: Palette { scheme == .dark ? .dark : .light }

    var body: some View {
        VStack(spacing: 0) {
            // 맨 위 흐르는 응원 문구(서버 /screen/hdr)
            RemoteScreenInline(path: "/screen/hdr?tz=\(TimeZone.current.secondsFromGMT() / 60)&now=\(Int(Date().timeIntervalSince1970 * 1000))", method: "GET", pal: pal)
                .frame(height: 30)
            // 본문: 켜진 탭
            ZStack(alignment: .bottom) {
                TabContent(tab: host.tab, pal: pal)
                if let t = host.toast {
                    Text(t).font(Typo.font(12)).foregroundColor(.white).padding(10).background(Color.black.opacity(0.8)).cornerRadius(10).padding(.bottom, 12)
                }
            }
            // 아래 탭 막대(서버 /screen/tabs)
            RemoteScreenInline(path: "/screen/tabs", payload: "{\"cap\":\(Servers.cap),\"f\":{\"tab\":\"\(host.tab)\"}}", pal: pal)
                .frame(height: 56)
        }
        .background(pal.color("bg") ?? Color(.systemBackground))
        .environmentObject(host)
    }
}

/// 머리글 · 탭 막대처럼 스크롤 없이 노드만 쌓는 작은 서버 화면.
struct RemoteScreenInline: View {
    let path: String
    var method: String = "POST"
    var payload: String? = nil
    let pal: Palette
    @StateObject private var loader = ScreenLoader()
    private var key: String { "\(path)|\(payload ?? "")" }
    var body: some View {
        Group {
            if let s = loader.screen { VStack(spacing: 0) { ForEach(s.body) { NodeView(node: $0, pal: pal) } } }
            else { Color.clear }
        }
        .task(id: key) { await loader.load(path: path, method: method, body: payload) }
    }
}

/// 켜진 탭의 본문. 1단계: 설정과 개발용 화면 탐색기만 실제로 연결(홈·노선도·커뮤니티·쇼핑·맛집은 다음 단계).
struct TabContent: View {
    let tab: String
    let pal: Palette
    var body: some View {
        switch tab {
        case "home": DevExplorer(pal: pal, title: "홈 (다음 단계에서 연결)", start: "/screen/settings?cap=8")
        default: DevExplorer(pal: pal, title: tab + " (다음 단계에서 연결)", start: "/screen/settings?cap=8")
        }
    }
}
