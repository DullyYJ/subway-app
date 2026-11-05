import SwiftUI

/// 서버가 준 노드 하나를 SwiftUI 로 그린다. 계산은 서버, 앱은 그림만(안드로이드 ScreenView 와 같은 원칙).
/// 글꼴 · 글자 크기 · 줄 높이 · 여백 · 모서리 · 테두리는 안드로이드 ScreenCore 배치 값(기본값 포함)과 똑같이 맞춘다 — 값의 출처: native/shell/ScreenCore.java (node() 기본값 · stack() 배치) · ScreenView.java (draw*).
/// 1단계에서 그리는 종류: text · spacer · divider · button · box · panel · row · toggle · navrow · chips · bar · tabbar · marq · place · news · sug · select · field.
/// 모르는 종류는 건너뛴다(앞으로 늘려도 옛 앱이 안 깨진다).
struct NodeView: View {
    let node: Node
    let pal: Palette
    @EnvironmentObject var host: Host
    @Environment(\.inHead) private var inHead

    var body: some View {
        let p = node.pad
        // 머리의 칩 줄은 가로로 밀리므로 좌우 여백을 줄 안쪽에 둔다(왼쪽 여백 아래로도 밀려 나간다 — 안드로이드와 같다)
        let slideChips = node.t == "chips" && inHead
        content
            .padding(EdgeInsets(top: p.t, leading: slideChips ? 0 : p.l, bottom: p.b, trailing: slideChips ? 0 : p.r))
    }

    private func col(_ k: String, _ def: String) -> Color { pal.color(node.str(k)) ?? pal.color(def) ?? .primary }
    private func colv(_ k: String, _ def: Color) -> Color { pal.color(node.str(k)) ?? def }
    private func tap(_ a: Action?) { if let a = a { host.handle(a) } }
    private func f(_ k: String, _ def: Double) -> CGFloat { CGFloat(node.num(k, def)) }

    @ViewBuilder private var content: some View {
        switch node.t {
        case "text": textNode
        case "spacer": Color.clear.frame(height: f("h", 8))
        case "divider": Rectangle().fill(pal.color(node.str("bg") == "border2" ? "border2" : "border") ?? .gray).frame(height: 1)
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
        case "select": SelectNode(node: node, pal: pal)
        case "field": FieldNode(node: node, pal: pal)
        default: EmptyView()
        }
    }

    /// hl = [[시작, 끝(, 색)] …] — 굵게 칠할 구간(안드로이드와 같다).
    private var hlRanges: [HLRange] {
        (node.d["hl"] as? [[Any]] ?? []).compactMap { r in
            guard r.count >= 2, let a = (r[0] as? NSNumber)?.intValue, let b = (r[1] as? NSNumber)?.intValue, a < b else { return nil }
            return HLRange(a: a, b: b, c: r.count > 2 ? pal.color(r[2] as? String) : nil)
        }
    }

    // 글: 기본 12 · 줄 높이 1.35 · 가볍게(굵게는 bold) — 글 줄은 안드로이드 wrap 과 같게 나눈다
    private var textNode: some View {
        let al = node.str("align")
        let c = pal.color(node.str("cc")) ?? col("color", "text")
        return LinedText(s: node.str("s") ?? "", size: f("size", 12), bold: node.bool("bold"), lh: f("lh", 1.35), color: c,
                         align: al == "center" ? .center : al == "right" ? .trailing : .leading,
                         maxLines: Int(node.num("lines", 0)), hl: hlRanges)
            .opacity(node.d["alpha"] != nil ? node.num("alpha", 1) : 1)
    }

    // 넓은 단추: 높이 40 · 모서리 12 · 글 12 · 테두리 1(안쪽) · 글색 기본은 sub · 굵기는 bold 일 때만
    private var buttonNode: some View {
        let r = f("r", 12), left = node.str("al") == "left"
        return Button { tap(node.act) } label: {
            Text(node.str("s") ?? "")
                .font(Typo.font(f("size", 12), bold: node.bool("bold")))
                .foregroundColor(col("tc", "sub"))
                .lineLimit(1).truncationMode(.tail)
                .padding(.horizontal, left ? 11 : 8)
                .frame(maxWidth: .infinity, alignment: left ? .leading : .center)
                .frame(height: f("h", 40))
                .background(RoundedRectangle(cornerRadius: r).fill(col("fill", "card")))
                .overlay(RoundedRectangle(cornerRadius: r).strokeBorder(col("line", "border"), lineWidth: 1))
        }.buttonStyle(PressStyle(radius: r))
    }

    // 안내 상자: 안쪽 여백 기본 12·8·12·8 · 모서리 10 · 글 12 · 바탕/테두리는 정해 줄 때만
    private var boxNode: some View {
        let ip = (node.d["ip"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }
        let ipv: [Double] = (ip?.count == 4 ? ip! : [12, 8, 12, 8])
        let r = f("r", 10)
        let tc = pal.color(node.str("tc")) ?? col("color", "text")
        return LinedText(s: node.str("s") ?? "", size: f("size", 12), bold: false, lh: f("lh", 1.35), color: tc, hl: hlRanges, hc: pal.color(node.str("hc")))
            .padding(EdgeInsets(top: 1 + CGFloat(ipv[1]), leading: 1 + CGFloat(ipv[0]), bottom: 1 + CGFloat(ipv[3]), trailing: 1 + CGFloat(ipv[2])))
            .background(RoundedRectangle(cornerRadius: r).fill(pal.color(node.str("fill")) ?? .clear))
            .overlay(RoundedRectangle(cornerRadius: r).strokeBorder(pal.color(node.str("line")) ?? .clear, lineWidth: 1))
    }

    // 카드(안에 노드를 쌓는다): 안쪽 여백 기본 16 · 모서리 14 · 테두리 1(안쪽 — 높이에 포함)
    private var panelNode: some View {
        let ip = (node.d["ip"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }
        let ipv: [Double] = (ip?.count == 4 ? ip! : [16, 16, 16, 16])
        let r = f("r", 14), lb = f("lb", 0)
        let shape = RoundedRectangle(cornerRadius: r)
        return VStack(alignment: .leading, spacing: 0) { ForEach(node.kids) { NodeView(node: $0, pal: pal) } }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(EdgeInsets(top: 1 + CGFloat(ipv[1]), leading: 1 + CGFloat(ipv[0]), bottom: 1 + CGFloat(ipv[3]), trailing: 1 + CGFloat(ipv[2])))
            .background(shape.fill(col("fill", "card")))
            .overlay(shape.strokeBorder(col("line", "border"), lineWidth: 1))
            .overlay(alignment: .leading) { if lb > 0 { Rectangle().fill(col("lc", "gold")).frame(width: lb) } }
            .clipShape(shape)
    }

    // 가로 줄: 같은 폭 칸으로 나란히(간격 기본 8)
    private var rowNode: some View {
        HStack(alignment: .top, spacing: f("gap", 8)) { ForEach(node.kids) { NodeView(node: $0, pal: pal).frame(maxWidth: .infinity, alignment: .topLeading) } }
    }

    // 오른쪽에 › 가 있는 줄: 글 13 · 위아래 11 · 작은 글 11 · › 13(오른쪽 14칸)
    private var navRow: some View {
        let vp = f("vp", 11), vb = node.num("vb", -1) >= 0 ? f("vb", 11) : vp
        return VStack(spacing: 0) {
            if node.bool("top") { Rectangle().fill(pal.color("border") ?? .gray).frame(height: 1) }
            Button { tap(node.act) } label: {
                HStack(spacing: 0) {
                    Text(node.str("title") ?? "").font(Typo.font(f("size", 13))).foregroundColor(col("tc", "text")).lineLimit(1).truncationMode(.tail)
                    Spacer(minLength: 2)
                    if let s = node.str("sub"), !s.isEmpty {
                        Text(s).font(Typo.font(11)).foregroundColor(col("sc", "sub")).lineLimit(1).padding(.trailing, 8)
                    } else { Color.clear.frame(width: 8, height: 1) }
                    Text("\u{203A}").font(Typo.font(13)).foregroundColor(col("sc", "sub")).frame(width: 14, alignment: .trailing)
                }
                .frame(height: f("size", 13) * 1.3)
                .padding(.top, vp).padding(.bottom, vb)
                .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(PressStyle())
        }
    }

    // 칩 줄: 높이 30 · 간격 6 · 글 12 굵게 · 좌우 12. 머리는 가로로 밀고, 본문은 줄바꿈한다.
    private var chipsNode: some View {
        let gap = f("gap", 6)
        let p = node.pad
        let chips = ForEach(Array(node.items.enumerated()), id: \.offset) { _, it in ChipView(node: node, item: it, pal: pal) }
        return Group {
            if inHead {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: gap) { chips }.padding(.leading, CGFloat(p.l)).padding(.trailing, CGFloat(p.r))
                }
            } else {
                FlowLayout(gap: gap) { chips }
            }
        }
    }

    // 머리줄: 제목 18 굵게 + 금색 작은 글 13 굵게(한 줄에 들어가면 옆에, 아니면 아래) + 오른쪽 알약 단추 12
    private var barNode: some View {
        let title = node.str("title") ?? "", sub = node.str("sub") ?? "", btn = node.str("btn") ?? ""
        let tt = Text(title).font(Typo.font(18, bold: true)).foregroundColor(col("tc", "text")).lineLimit(1).truncationMode(.tail).frame(height: 18 * 1.4)
        let ss = Text(sub).font(Typo.font(13, bold: true)).foregroundColor(pal.color("gold") ?? .yellow).lineLimit(1).truncationMode(.tail).frame(height: 13 * 1.4)
        return HStack(alignment: .center, spacing: 8) {
            Group {
                if sub.isEmpty { tt }
                else {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) { tt.fixedSize(); ss.fixedSize() }
                        VStack(alignment: .leading, spacing: 0) { tt; ss }
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
            if !btn.isEmpty {
                Button { tap(node.act) } label: {
                    Text(btn).font(Typo.font(12)).foregroundColor(pal.color("sub") ?? .gray)
                        .padding(.horizontal, 15).frame(height: 12 * 1.4 + 14)
                        .background(Capsule().fill(pal.color("card") ?? .white))
                        .overlay(Capsule().strokeBorder(pal.color("border") ?? .gray, lineWidth: 1))
                }.buttonStyle(PressStyle(radius: 16))
            }
        }
    }

    // 장소 · 뉴스 · 한 줄 목록(자동완성): 안드로이드 PLACE_/NEWS_/SUG_ 상수의 글 크기 · 여백 · 줄 높이 (모양은 다음 단계에서 카드째 똑같이)
    private var listLine: some View {
        let title = node.str("name") ?? node.str("title") ?? ""
        let sub = node.str("sub") ?? ""
        let place = node.t == "place", news = node.t == "news"
        let ts: CGFloat = place ? 15 : 14, ss: CGFloat = place ? 12 : 11
        let pad = place ? EdgeInsets(top: 14, leading: 14, bottom: 14, trailing: 14) : news ? EdgeInsets(top: 13, leading: 4, bottom: 13, trailing: 4) : EdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 14)
        return Button { tap(node.act) } label: {
            VStack(alignment: .leading, spacing: 2) {
                LinedText(s: title, size: ts, bold: place || node.t == "sug", lh: 1.45, color: pal.color("text") ?? .primary, maxLines: news ? 4 : 2)
                if !sub.isEmpty { LinedText(s: sub, size: ss, bold: false, lh: 1.4, color: pal.color("sub") ?? .gray, maxLines: 2) }
            }
            .padding(pad)
            .frame(maxWidth: .infinity, minHeight: node.t == "sug" ? 44 : 0, alignment: .leading)
            .contentShape(Rectangle())
        }.buttonStyle(PressStyle())
    }
}

// 칩 줄 바꿈(본문)
struct FlowLayout: Layout {
    var gap: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > w + 0.5 { x = 0; y += rowH + gap; rowH = 0 }
            x += s.width + gap; rowH = max(rowH, s.height); maxX = max(maxX, x - gap)
        }
        return CGSize(width: w.isFinite ? w : maxX, height: y + rowH)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > b.width + 0.5 { x = 0; y += rowH + gap; rowH = 0 }
            v.place(at: CGPoint(x: b.minX + x, y: b.minY + y), anchor: .topLeading, proposal: .unspecified)
            x += s.width + gap; rowH = max(rowH, s.height)
        }
    }
}

// 칩 하나(안드로이드 drawChip): 켜짐 = 칩색 바탕 · 꺼짐 = 회색 테두리(엔진이 모양을 정하면 그대로)
struct ChipView: View {
    let node: Node; let item: [String: Any]; let pal: Palette
    @EnvironmentObject var host: Host
    var body: some View {
        let on = (item["on"] as? Bool) ?? false
        let plain = (item["pl"] as? Bool) ?? false
        let fs = CGFloat(node.num("fs", 12)), px = CGFloat(node.num("px", 12)), h = CGFloat(node.num("h", 30))
        let onRole = (item["c"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? node.str("onc").flatMap { $0.isEmpty ? nil : $0 } ?? "orange"
        let onFill = pal.color(onRole) ?? pal.color("orange") ?? .orange
        let ofl = pal.color(node.str("offf")), offb = pal.color(node.str("offb")), offt = pal.color(node.str("offt"))
        let oc = pal.color(item["oc"] as? String), ob = pal.color(item["ob"] as? String)
        let web = ofl != nil || offb != nil || offt != nil || oc != nil || ob != nil
        let tinted = onRole != "orange"                                  // 맛집 칩: 꺼진 칩도 카드색 바탕
        let bw = CGFloat((item["bw"] as? NSNumber)?.doubleValue ?? 0) > 0 ? CGFloat((item["bw"] as? NSNumber)?.doubleValue ?? 1) : 1
        let plainOn = on && plain
        let subC: Color = pal.color("sub") ?? .gray
        let textC: Color = pal.color("text") ?? .primary
        var fg: Color = textC
        var fill: Color = .clear
        var border: Color = Color(.sRGB, red: 0.549, green: 0.549, blue: 0.549, opacity: 0.45)   // 꺼진 칩 기본 테두리(안드로이드 0x738C8C8C)
        if plainOn { fg = onFill; border = .clear }
        else if on { fg = pal.color(node.str("onfg")) ?? pal.color("white") ?? .white; fill = onFill; border = onFill }
        else if web { fg = oc ?? offt ?? subC; fill = ofl ?? .clear; border = ob ?? oc ?? offb ?? .clear }
        else if tinted { fg = subC; fill = pal.color("card") ?? .clear }
        let label = item["label"] as? String ?? ""
        return Button { if let a = Action(item["act"] as? [String: Any]) { host.handle(a) } } label: {
            HStack(spacing: 6) {
                Text(label)
                if let b = item["badge"] as? String, !b.isEmpty { Text(b).opacity(0.7) }
            }
            .font(Typo.font(fs, bold: true)).foregroundColor(fg).lineLimit(1)
            .padding(.horizontal, px).frame(height: h)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(border, lineWidth: bw))
            .overlay(alignment: .bottom) { if plainOn { Rectangle().fill(onFill).frame(width: Typo.width(label, fs, true), height: 2).padding(.bottom, max(2, (h - fs * 1.4) / 2 - 1)) } }
        }.buttonStyle(PressStyle(radius: h / 2))
    }
}

// 스위치 줄: 44×25(big 46×26) · 글 13.5 굵게 + 작은 글 11 · 위아래 9 · 누르면 앱이 먼저 뒤집고 {a:'set',key,on} 을 알린다.
struct ToggleRow: View {
    let node: Node; let pal: Palette
    @EnvironmentObject var host: Host
    @State private var on: Bool
    init(node: Node, pal: Palette) { self.node = node; self.pal = pal; _on = State(initialValue: node.bool("on")) }
    var body: some View {
        let big = node.bool("big")
        let sw: CGFloat = big ? 46 : 44, sh: CGFloat = big ? 26 : 25
        let vp = CGFloat(node.num("vp", 9))
        let sub = node.str("sub") ?? ""
        let onC = pal.color(node.str("onc")) ?? Palette.css("#30d158") ?? .green
        return VStack(spacing: 0) {
            if node.bool("top") { Rectangle().fill(pal.color("border") ?? .gray).frame(height: 1) }
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    LinedText(s: node.str("title") ?? "", size: CGFloat(node.num("size", 13.5)), bold: node.bool("bold", true), lh: 1.3, color: pal.color(node.str("tc")) ?? pal.color("text") ?? .primary)
                    if !sub.isEmpty { LinedText(s: sub, size: CGFloat(node.num("ssize", 11)), bold: false, lh: 1.4, color: pal.color(node.str("sc")) ?? pal.color("sub") ?? .gray) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                ZStack(alignment: on ? .trailing : .leading) {
                    Capsule().fill(on ? onC : (pal.color("border2") ?? .gray))
                    Circle().fill(Color.white).frame(width: sh - 6, height: sh - 6)
                        .shadow(color: Color.black.opacity(0.2), radius: 0.5, x: 0, y: 1).padding(3)
                }.frame(width: sw, height: sh)
            }
            .padding(.vertical, vp)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeOut(duration: 0.12)) { on.toggle() }
                host.handle(Action.set(node.str("key") ?? "", on))
            }
        }
    }
}

// 미리보기 칸이 있는 고르기 카드(테마 등): 높이 = 4 + 28 + max(52, 글, 22) · 모서리 12 · 테두리 2(안쪽) · 제목 14 굵게 · 작은 글 11
struct SelectNode: View {
    let node: Node; let pal: Palette
    @EnvironmentObject var host: Host
    var body: some View {
        let on = node.bool("on")
        let sub = node.str("sub") ?? ""
        let prev = (node.d["prev"] as? [String] ?? []).map { pal.color($0) ?? Color.clear }
        let gold = pal.color(node.str("onl")) ?? pal.color("gold") ?? .yellow
        let shape = RoundedRectangle(cornerRadius: 12)
        return Button { if let a = node.act { host.handle(a) } } label: {
            HStack(spacing: 14) {
                Group {
                    if prev.count == 5 { SelectPreview(c: prev) } else { Color.clear.frame(width: 52, height: 52) }
                }
                VStack(alignment: .leading, spacing: 2) {
                    LinedText(s: node.str("title") ?? "", size: 14, bold: true, lh: 1.3, color: pal.color(node.str("tc")) ?? pal.color("text") ?? .primary)
                    if !sub.isEmpty { LinedText(s: sub, size: 11, bold: false, lh: 1.4, color: pal.color(node.str("sc")) ?? pal.color("sub") ?? .gray) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                ZStack {
                    if on {
                        Circle().fill(pal.color(node.str("chk")) ?? gold)
                        CheckMark().stroke(pal.color(node.str("ckf")) ?? Color(hex: 0x121214), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    }
                }.frame(width: 22, height: 22)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 84)
            .background(shape.fill(pal.color(node.str("fill")) ?? pal.color("card") ?? .white))
            .overlay(shape.strokeBorder(on ? gold : (pal.color(node.str("line")) ?? pal.color("border") ?? .gray), lineWidth: 2))
        }.buttonStyle(PressStyle(radius: 12))
    }
}

private struct CheckMark: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + 6.5 - 0, y: r.minY + 11.5)); p.addLine(to: CGPoint(x: r.minX + 9.8, y: r.minY + 14.8)); p.addLine(to: CGPoint(x: r.minX + 15.5, y: r.minY + 7.8))
        return p
    }
}

private struct SelectPreview: View {
    let c: [Color]
    var body: some View {
        let w: CGFloat = 52, h: CGFloat = 52, cut = h * 0.55
        let bw = (w - 8 - 6) / 3, by = cut + (h - cut) / 2 - 2
        return ZStack(alignment: .topLeading) {
            c[0].frame(width: w, height: cut)
            c[1].frame(width: w, height: h - cut).offset(y: cut)
            c[2].frame(width: w, height: 1).offset(y: cut)
            ForEach(0..<3, id: \.self) { k in
                RoundedRectangle(cornerRadius: 2).fill(c[k == 0 ? 3 : 4]).frame(width: bw, height: 4).offset(x: 4 + CGFloat(k) * (bw + 3), y: by)
            }
        }
        .frame(width: w, height: h, alignment: .topLeading)
        .clipShape(RoundedRectangle(cornerRadius: 9.5))
        .overlay(RoundedRectangle(cornerRadius: 9.5).strokeBorder(c[2], lineWidth: 1))
    }
}

// 글자 입력칸: 높이 44 · 글 14 · 모서리 9 · 바탕 bg · 테두리 border2(편집 중 금색 1.5) · 왼쪽 글 시작 13
struct FieldNode: View {
    let node: Node; let pal: Palette
    @State private var text: String
    @FocusState private var focused: Bool
    init(node: Node, pal: Palette) { self.node = node; self.pal = pal; _text = State(initialValue: node.str("value") ?? "") }
    var body: some View {
        let r = CGFloat(node.num("r", 9))
        let sc = pal.color(node.str("sc")) ?? pal.color("sub") ?? .gray
        let shape = RoundedRectangle(cornerRadius: r)
        return TextField("", text: $text, prompt: Text(node.str("hint") ?? "").foregroundColor(sc.opacity(0.8)))
            .font(Typo.font(CGFloat(node.num("size", 14))))
            .foregroundColor(pal.color(node.str("tc")) ?? pal.color("text") ?? .primary)
            .focused($focused)
            .padding(.horizontal, 13).frame(height: CGFloat(node.num("h", 44)))
            .background(shape.fill(pal.color(node.str("fill")) ?? pal.color("bg") ?? .white))
            .overlay(shape.strokeBorder(focused ? (pal.color("gold") ?? .yellow) : (pal.color(node.str("line")) ?? pal.color("border2") ?? .gray), lineWidth: focused ? 1.5 : 1))
            .onChange(of: text) { v in UserDefaults.standard.set(v, forKey: "field." + (node.str("key") ?? "")) }
    }
}

// 아래 탭 막대: 높이 56 · 아이콘 20 · 아이콘과 글 사이 4 · 글 10(켜지면 굵게, 줄 높이 14) · 위 테두리 1
struct TabBarNode: View {
    let node: Node; let pal: Palette
    @EnvironmentObject var host: Host
    var body: some View {
        let onC = pal.color(node.str("onc")) ?? pal.color("gold") ?? .yellow
        let offC = pal.color(node.str("sc")) ?? pal.color("sub") ?? .gray
        return HStack(spacing: 0) {
            ForEach(Array(node.items.enumerated()), id: \.offset) { _, it in
                let on = (it["on"] as? Bool) ?? false
                let c = on ? onC : offC
                Button { if let a = Action(it["act"] as? [String: Any]) { host.handle(a) } } label: {
                    VStack(spacing: 4) {
                        SVGIcon(d: it["icon"] as? String ?? "").fill(c).frame(width: 20, height: 20)
                            .overlay {
                                if let b = it["badge"] as? String, !b.isEmpty {
                                    ZStack {
                                        Circle().fill(Color(hex: 0xFF3B30)).frame(width: 14, height: 14)
                                        Text(b).font(Typo.font(9, bold: true)).foregroundColor(.white)
                                    }.offset(x: 10, y: -8)
                                }
                            }
                        Text(it["label"] as? String ?? "").font(Typo.font(10, bold: on)).foregroundColor(c).frame(height: 14)
                    }
                    .frame(maxWidth: .infinity).frame(height: CGFloat(node.num("h", 56))).contentShape(Rectangle())
                }.buttonStyle(PressStyle(radius: 0))
            }
        }
        .background(pal.color(node.str("fill")) ?? pal.color("nav") ?? Color(.systemBackground))
        .overlay(Rectangle().fill(pal.color(node.str("line")) ?? pal.color("border") ?? .gray).frame(height: 1), alignment: .top)
    }
}

// 맨 위 흐르는 감성 문구: 글 13.5 굵게 · 금색 · 높이 26(1단계: 문구를 한 줄씩 바꿔 보여 준다 — 흐르는 움직임과 무지개 색은 다음 단계)
struct MarqueeNode: View {
    let node: Node; let pal: Palette
    @State private var i = 0
    private var msgs: [String] { (node.d["msgs"] as? [String]) ?? (node.str("value")?.components(separatedBy: "\n") ?? []) }
    var body: some View {
        Text(msgs.isEmpty ? "" : msgs[i % msgs.count])
            .font(Typo.font(13.5, bold: true)).foregroundColor(pal.color("gold") ?? .yellow)
            .lineLimit(1).frame(maxWidth: .infinity, minHeight: CGFloat(node.num("h", 26)))
            .id(i).transition(.opacity)
            .onReceive(Timer.publish(every: 7, on: .main, in: .common).autoconnect()) { _ in withAnimation { i += 1 } }
    }
}
