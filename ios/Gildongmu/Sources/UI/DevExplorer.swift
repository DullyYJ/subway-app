import SwiftUI

/// 개발용: 서버 화면 주소와 요청 내용을 골라 그려 본다. 안드로이드와 같은 화면이 같은 모양으로 그려지는지 맥에서 바로 비교하는 용도.
struct DevExplorer: View {
    let pal: Palette
    let title: String
    @State var path: String
    @State private var method = "GET"
    @State private var bodyText = "{\"cap\":\(Servers.cap)}"
    @State private var go = 0
    @State private var show = false
    init(pal: Palette, title: String, start: String) { self.pal = pal; self.title = title; _path = State(initialValue: start) }

    private let presets: [(String, String, String, String)] = [
        ("설정", "GET", "/screen/settings?cap=8", ""),
        ("탭 막대", "POST", "/screen/tabs", "{\"cap\":\(Servers.cap),\"f\":{\"tab\":\"home\"}}"),
        ("칩(노선/모드)", "POST", "/screen/cchips", "{\"cap\":\(Servers.cap),\"f\":{\"mode\":\"chat\"}}"),
        ("응원 문구", "GET", "/screen/hdr?tz=540&now=\(Int(Date().timeIntervalSince1970 * 1000))", ""),
    ]

    var body: some View {
        VStack(spacing: 0) {
            DisclosureGroup(title, isExpanded: $show) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack { ForEach(presets, id: \.0) { p in Button(p.0) { path = p.2; method = p.1; bodyText = p.3; go += 1 }.buttonStyle(.bordered) } }
                }
                TextField("/screen/…", text: $path).textFieldStyle(.roundedBorder).autocapitalization(.none).disableAutocorrection(true)
                Picker("", selection: $method) { Text("GET").tag("GET"); Text("POST").tag("POST") }.pickerStyle(.segmented)
                if method == "POST" { TextEditor(text: $bodyText).font(.system(size: 12, design: .monospaced)).frame(height: 60).border(Color.gray.opacity(0.4)) }
                Button("불러오기") { go += 1 }.buttonStyle(.borderedProminent)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            Divider()
            RemoteScreen(path: path, method: method, payload: method == "POST" ? bodyText : nil, pal: pal).id(go)
        }
    }
}
