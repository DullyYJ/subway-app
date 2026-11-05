import SwiftUI

/// 서버가 준 노드 하나를 SwiftUI 로 그린다. 계산은 서버, 앱은 그림만(안드로이드 ScreenView 와 같은 원칙).
/// 1단계에서 그리는 종류: text · spacer · divider · button · box · panel · row · toggle · navrow · chips · bar · tabbar · marq · place · news · sug · select · field.
/// 모르는 종류는 건너뛴다(앞으로 늘려도 옛 앱이 안 깨진다).
struct NodeView: View {
    let node: Node
    let pal: Palette
    @EnvironmentObject var host: Host

    var body: some View {
        let p = node.pad
        content
            .padding(EdgeInsets(top: p.t, leading: p.l, bottom: p.b, trailing: p.r))
    }

    private func col(_ k: String, _ def: String) -> Color { pal.color(node.str(k)) ?? pal.color(def) ?? .primary }
    private func tap(_ a: Action?) { if let a = a { host.handle(a) } }

    @ViewBuilder private var content: some View {
        switch node.t {
        case "text": textNode
        case "spacer": Color.clear.frame(height: node.num("h", 8))
        case "divider": Rectangle().fill(pal.color("border") ?? .gray).frame(height: 1)
        case "button": buttonNode
        case "box": boxNode
        case "panel": panelNode
        case "row": rowNode
        case "toggle": ToggleRow(node: node, pal: pal)
        case "navrow": navRow
        case "chips": chipsNode
        case "bar": barNode
        case "tabbar": TabBarNode(node: node, pal: pal)
        case "marq": MarqueeNode(node: node, pal: pal)
        case "place", "news", "sug": listLine
        case "select": selectNode
        case "field": FieldNode(node: node, pal: pal)
        default: EmptyView()
        }
    }

    // 글
    private var textNode: some View {
        let size = node.num("size", 14)
        let al = node.str("align")
        return Text(node.str("s") ?? "")
            .font(.system(size: size, weight: node.bool("bold") ? .bold : .regular))
            .foregroundColor(col("color", "text").opacity(node.d["alpha"] != nil ? node.num("alpha", 1) : 1))
            .lineSpacing(max(0, node.num("lh", size * 1.35) - size * 1.2))
            .multilineTextAlignment(al == "center" ? .center : al == "right" ? .trailing : .leading)
            .frame(maxWidth: .infinity, alignment: al == "center" ? .center : al == "right" ? .trailing : .leading)
    }

    // 넓은 단추
    private var buttonNode: some View {
        let fill = col("fill", "card"), line = pal.color(node.str("line")) ?? .clear
        let r = node.num("r", 12)
        let left = node.str("al") == "left"
        return Button { tap(node.act) } label: {
            Text(node.str("s") ?? "")
                .font(.system(size: node.num("size", 14), weight: node.bool("bold", true) ? .bold : .regular))
                .foregroundColor(pal.color(node.str("tc")) ?? pal.color("text") ?? .primary)
                .frame(maxWidth: .infinity, minHeight: node.num("h", 44), alignment: left ? .leading : .center)
                .padding(.horizontal, left ? 14 : 0)
                .background(RoundedRectangle(cornerRadius: r).fill(fill))
                .overlay(RoundedRectangle(cornerRadius: r).stroke(line, lineWidth: 1))
        }.buttonStyle(.plain)
    }

    // 안내 상자
    private var boxNode: some View {
        let ip = (node.d["ip"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [12, 10, 12, 10]
        let r = node.num("r", 12), size = node.num("size", 13)
        return styledText(node.str("s") ?? "", hl: node.d["hl"] as? [[Any]], size: size)
            .foregroundColor(col("color", "text"))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(EdgeInsets(top: ip.count == 4 ? ip[1] : 10, leading: ip.count == 4 ? ip[0] : 12, bottom: ip.count == 4 ? ip[3] : 10, trailing: ip.count == 4 ? ip[2] : 12))
            .background(RoundedRectangle(cornerRadius: r).fill(col("fill", "card")))
            .overlay(RoundedRectangle(cornerRadius: r).stroke(col("line", "border"), lineWidth: 1))
    }

    /// 굵은 글자 구간(hl = [[시작,끝]…], 글자 단위)을 굵게.
    private func styledText(_ s: String, hl: [[Any]]?, size: Double) -> Text {
        guard let hl = hl, !hl.isEmpty else { return Text(s).font(.system(size: size)) }
        let chars = Array(s); var out = Text("")
        var idx = 0
        let ranges = hl.compactMap { r -> (Int, Int)? in
            guard r.count == 2, let a = (r[0] as? NSNumber)?.intValue, let b = (r[1] as? NSNumber)?.intValue, a >= 0, b <= chars.count, a < b else { return nil }
            return (a, b)
        }.sorted { $0.0 < $1.0 }
        for (a, b) in ranges where a >= idx {
            if a > idx { out = out + Text(String(chars[idx..<a])).font(.system(size: size)) }
            out = out + Text(String(chars[a..<b])).font(.system(size: size, weight: .bold)); idx = b
        }
        if idx < chars.count { out = out + Text(String(chars[idx...])).font(.system(size: size)) }
        return out
    }

    // 카드(안에 노드를 쌓는다)
    private var panelNode: some View {
        let ip = (node.d["ip"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [0, 0, 0, 0]
        let r = node.num("r", 14)
        return VStack(spacing: 0) { ForEach(node.kids) { NodeView(node: $0, pal: pal) } }
            .padding(EdgeInsets(top: ip.count == 4 ? ip[1] : 0, leading: ip.count == 4 ? ip[0] : 0, bottom: ip.count == 4 ? ip[3] : 0, trailing: ip.count == 4 ? ip[2] : 0))
            .background(RoundedRectangle(cornerRadius: r).fill(col("fill", "card")))
            .overlay(RoundedRectangle(cornerRadius: r).stroke(col("line", "border"), lineWidth: 1))
    }

    // 가로 줄(예: 구독 단추 줄)
    private var rowNode: some View {
        HStack(spacing: node.num("gap", 8)) { ForEach(node.kids) { NodeView(node: $0, pal: pal).frame(maxWidth: .infinity) } }
    }

    // 오른쪽에 › 가 있는 줄
    private var navRow: some View {
        Button { tap(node.act) } label: {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(node.str("title") ?? "").font(.system(size: node.num("size", 15), weight: node.bool("bold") ? .bold : .regular)).foregroundColor(col("tc", "text"))
                }
                Spacer(minLength: 8)
                if let s = node.str("sub"), !s.isEmpty { Text(s).font(.system(size: node.num("ssize", 12))).foregroundColor(col("sc", "sub")).multilineTextAlignment(.trailing) }
                if node.act != nil { Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundColor(pal.color("sub") ?? .gray) }
            }
            .padding(.vertical, 12).padding(.horizontal, 14)
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }

    // 가로로 미는 칩 줄
    private var chipsNode: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: node.num("gap", 8)) {
                ForEach(Array(node.items.enumerated()), id: \.offset) { _, it in
                    let on = (it["on"] as? Bool) ?? false
                    Button { tap(Action(it["act"] as? [String: Any])) } label: {
                        HStack(spacing: 4) {
                            Text(it["label"] as? String ?? "").font(.system(size: 13, weight: on ? .bold : .regular))
                            if let b = it["badge"] as? String, !b.isEmpty { Text(b).font(.system(size: 10, weight: .bold)) }
                        }
                        .foregroundColor(on ? (pal.color("ongold") ?? .white) : (pal.color("text") ?? .primary))
                        .padding(.horizontal, 12).frame(height: node.num("h", 32))
                        .background(Capsule().fill(on ? (pal.color("gold") ?? .yellow) : (pal.color("card2") ?? .gray.opacity(0.2))))
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    // 머리줄: 제목 + 금색 작은 글 + 오른쪽 알약 단추
    private var barNode: some View {
        HStack(spacing: 8) {
            Text(node.str("title") ?? "").font(.system(size: 15, weight: .bold)).foregroundColor(pal.color("text") ?? .primary)
            if let s = node.str("sub"), !s.isEmpty { Text(s).font(.system(size: 11)).foregroundColor(pal.color("gold") ?? .yellow) }
            Spacer()
            if let b = node.str("btn"), !b.isEmpty {
                Button { tap(node.act) } label: {
                    Text(b).font(.system(size: 12, weight: .bold)).padding(.horizontal, 12).padding(.vertical, 6)
                        .foregroundColor(pal.color("ongold") ?? .white).background(Capsule().fill(pal.color("gold") ?? .yellow))
                }.buttonStyle(.plain)
            }
        }.padding(.vertical, 4)
    }

    // 장소 · 뉴스 · 한 줄 목록(1단계는 제목 + 작은 글만; 다음 단계에서 모양을 안드로이드와 똑같이)
    private var listLine: some View {
        let title = node.str("name") ?? node.str("title") ?? ""
        let sub = node.str("sub") ?? ""
        return Button { tap(node.act) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 14, weight: .semibold)).foregroundColor(pal.color("text") ?? .primary)
                if !sub.isEmpty { Text(sub).font(.system(size: 12)).foregroundColor(pal.color("sub") ?? .gray) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
        }.buttonStyle(.plain)
    }

    // 미리보기 칸이 있는 고르기 카드(테마 등)
    private var selectNode: some View {
        let on = node.bool("on")
        return Button { tap(node.act) } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(node.str("title") ?? "").font(.system(size: 14, weight: .bold)).foregroundColor(col("tc", "text"))
                    if let s = node.str("sub") { Text(s).font(.system(size: 11)).foregroundColor(col("sc", "sub")) }
                }
                Spacer()
                if on { Image(systemName: "checkmark.circle.fill").foregroundColor(pal.color("gold") ?? .yellow) }
            }
            .padding(12).frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(col("fill", "card")))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(on ? (pal.color("gold") ?? .yellow) : col("line", "border"), lineWidth: on ? 2 : 1))
        }.buttonStyle(.plain)
    }
}

// 스위치 줄: 누르면 앱이 먼저 뒤집고 {a:'set',key,on} 을 알린다.
struct ToggleRow: View {
    let node: Node; let pal: Palette
    @EnvironmentObject var host: Host
    @State private var on: Bool
    init(node: Node, pal: Palette) { self.node = node; self.pal = pal; _on = State(initialValue: node.bool("on")) }
    var body: some View {
        Toggle(isOn: Binding(get: { on }, set: { v in on = v; host.handle(Action.set(node.str("key") ?? "", v)) })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(node.str("title") ?? "").font(.system(size: node.num("size", 15), weight: node.bool("bold") ? .bold : .regular)).foregroundColor(pal.color("text") ?? .primary)
                if let s = node.str("sub"), !s.isEmpty { Text(s).font(.system(size: node.num("ssize", 11))).foregroundColor(pal.color("sub") ?? .gray) }
            }
        }
        .tint(pal.color("gold") ?? .yellow)
        .padding(.vertical, 8).padding(.horizontal, 14)
    }
}

// 글자 입력칸(1단계: 입력만 받고 값은 기기에 저장)
struct FieldNode: View {
    let node: Node; let pal: Palette
    @State private var text: String
    init(node: Node, pal: Palette) { self.node = node; self.pal = pal; _text = State(initialValue: node.str("value") ?? "") }
    var body: some View {
        TextField(node.str("hint") ?? "", text: $text)
            .font(.system(size: node.num("size", 14)))
            .padding(.horizontal, 12).frame(height: node.num("h", 44))
            .background(RoundedRectangle(cornerRadius: node.num("r", 10)).fill(pal.color(node.str("fill")) ?? pal.color("card") ?? .white))
            .overlay(RoundedRectangle(cornerRadius: node.num("r", 10)).stroke(pal.color(node.str("line")) ?? pal.color("border") ?? .gray, lineWidth: 1))
            .onChange(of: text) { v in UserDefaults.standard.set(v, forKey: "field." + (node.str("key") ?? "")) }
    }
}

// 아래 탭 막대
struct TabBarNode: View {
    let node: Node; let pal: Palette
    @EnvironmentObject var host: Host
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(node.items.enumerated()), id: \.offset) { _, it in
                let on = (it["on"] as? Bool) ?? false
                let c = on ? (pal.color("onc") ?? pal.color("gold") ?? .yellow) : (pal.color("sub") ?? .gray)
                Button { if let a = Action(it["act"] as? [String: Any]) { host.handle(a) } } label: {
                    VStack(spacing: 3) {
                        ZStack(alignment: .topTrailing) {
                            SVGIcon(d: it["icon"] as? String ?? "").fill(c).frame(width: 24, height: 24)
                            if let b = it["badge"] as? String, !b.isEmpty {
                                Text(b).font(.system(size: 9, weight: .bold)).foregroundColor(.white).padding(.horizontal, 4)
                                    .background(Capsule().fill(Color.red)).offset(x: 8, y: -4)
                            }
                        }
                        Text(it["label"] as? String ?? "").font(.system(size: 10, weight: on ? .bold : .regular)).foregroundColor(c)
                    }.frame(maxWidth: .infinity).frame(height: node.num("h", 56)).contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
        }
        .background(pal.color("nav") ?? Color(.systemBackground))
        .overlay(Rectangle().fill(pal.color("border") ?? .gray).frame(height: 1), alignment: .top)
    }
}

// 맨 위 흐르는 감성 문구(1단계: 문구를 한 줄씩 바꿔 보여 준다 — 흐르는 움직임은 다음 단계)
struct MarqueeNode: View {
    let node: Node; let pal: Palette
    @State private var i = 0
    private var msgs: [String] { (node.d["msgs"] as? [String]) ?? [] }
    var body: some View {
        Text(msgs.isEmpty ? "" : msgs[i % msgs.count])
            .font(.system(size: 13, weight: .medium)).foregroundColor(pal.color("gold") ?? .yellow)
            .lineLimit(1).frame(maxWidth: .infinity, minHeight: node.num("h", 26))
            .id(i).transition(.opacity)
            .onReceive(Timer.publish(every: 7, on: .main, in: .common).autoconnect()) { _ in withAnimation { i += 1 } }
    }
}
