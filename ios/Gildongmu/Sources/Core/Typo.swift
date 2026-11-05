import SwiftUI
import UIKit

/// 글자 · 줄 배치를 안드로이드(ScreenCore.wrap / ScreenView.base)와 똑같이 한다.
/// - 글꼴: Noto Sans KR 400 / 700 (안드로이드가 앱에 넣어 쓰는 것과 같은 파일 — ios/scripts/make_fonts.py). 파일이 없으면 시스템 글꼴로 대신한다.
/// - 줄: 줄 높이 = 글자 크기 × lh 로 줄마다 고정하고, 글자는 그 칸 가운데에 놓는다(안드로이드 base()).
/// - 줄바꿈: 띄어쓰기에서 끊고, 한 단어가 칸보다 길면 글자 단위로 끊는다(안드로이드 wrap()).
enum Typo {
    static let regularName = "NotoSansKR-Regular"
    static let boldName = "NotoSansKR-Bold"

    static func ui(_ size: CGFloat, bold: Bool) -> UIFont {
        UIFont(name: bold ? boldName : regularName, size: size) ?? UIFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
    }
    /// 글자 크기 고정(기기 글자 크기 설정을 따라 늘지 않는다 — 안드로이드도 dp 고정).
    static func font(_ size: CGFloat, bold: Bool = false) -> Font {
        if UIFont(name: bold ? boldName : regularName, size: size) != nil { return .custom(bold ? boldName : regularName, fixedSize: size) }
        return .system(size: size, weight: bold ? .bold : .regular)
    }
    static func width(_ s: String, _ size: CGFloat, _ bold: Bool) -> CGFloat {
        (s as NSString).size(withAttributes: [.font: ui(size, bold: bold)]).width
    }

    // 안드로이드 ScreenCore.fit: maxW 안에 들어가는 가장 긴 글자 수(≥1)
    private static func fit(_ s: NSString, _ maxW: CGFloat, _ size: CGFloat, _ bold: Bool) -> Int {
        var lo = 1, hi = s.length
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if width(s.substring(to: mid), size, bold) <= maxW { lo = mid } else { hi = mid - 1 }
        }
        return max(1, lo)
    }
    private static func stripEnd(_ s: String) -> String {
        var t = s
        while t.hasSuffix(" ") { t.removeLast() }
        return t
    }
    /// 한 줄에 들어가게 끝을 … 으로 줄인다.
    static func ellipsize(_ s: String, _ maxW: CGFloat, _ size: CGFloat, _ bold: Bool) -> String {
        if width(s, size, bold) <= maxW { return s }
        let ns = s as NSString
        let ew = width("\u{2026}", size, bold)
        var n = ns.length
        while n > 1 && width(ns.substring(to: n), size, bold) + ew > maxW { n -= 1 }
        return stripEnd(ns.substring(to: n)) + "\u{2026}"
    }

    /// 안드로이드 ScreenCore.wrap 과 같은 줄나누기.
    static func wrap(_ s: String, maxW: CGFloat, size: CGFloat, bold: Bool, maxLines: Int = 0) -> [String] {
        if s.isEmpty { return [] }
        var out: [String] = []
        for para in s.components(separatedBy: "\n") {
            var rest: NSString = para as NSString
            if rest.length == 0 { out.append(""); continue }
            while rest.length > 0 {
                if width(rest as String, size, bold) <= maxW { out.append(rest as String); break }
                let cut = fit(rest, maxW, size, bold)
                var br = -1
                var i = cut
                while i > 0 { if rest.character(at: i - 1) == 32 { br = i; break }; i -= 1 }
                let take = br > 0 ? br : cut
                out.append(stripEnd(rest.substring(to: take)))
                var tail = rest.substring(from: take)
                while tail.hasPrefix(" ") { tail.removeFirst() }
                rest = tail as NSString
            }
        }
        if maxLines > 0 && out.count > maxLines {
            var cut = Array(out.prefix(maxLines))
            let joined = (cut[maxLines - 1] + " " + out[maxLines...].joined(separator: " "))
            cut[maxLines - 1] = ellipsize(joined, maxW, size, bold)
            return cut
        }
        return out
    }

    /// 줄마다 원문 안 시작 위치(글자 수, UTF-16). 못 찾으면 -1.
    static func offsets(_ s: String, _ lines: [String]) -> [Int] {
        let ns = s as NSString
        var cur = 0
        var r: [Int] = []
        for ln in lines {
            if ln.isEmpty { r.append(cur); continue }
            let f = ns.range(of: ln, options: [], range: NSRange(location: cur, length: ns.length - cur))
            if f.location == NSNotFound { r.append(-1) } else { r.append(f.location); cur = f.location + f.length }
        }
        return r
    }
}

/// 굵게 칠할 구간(hl: [시작, 끝, (색)]).
struct HLRange { let a: Int; let b: Int; let c: Color? }

/// 줄 수만큼 높이를 차지하는 칸: 높이 = 줄 수 × 줄 높이. 칸 너비로 안드로이드와 같은 줄나누기를 한다.
private struct WrapLayout: Layout {
    let s: String; let size: CGFloat; let bold: Bool; let lineH: CGFloat; let maxLines: Int
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        if let w = proposal.width, w.isFinite {
            return CGSize(width: w, height: CGFloat(Typo.wrap(s, maxW: max(1, w), size: size, bold: bold, maxLines: maxLines).count) * lineH)
        }
        let paras = s.isEmpty ? [] : s.components(separatedBy: "\n")
        return CGSize(width: paras.map { Typo.width($0, size, bold) }.max() ?? 0, height: CGFloat(paras.count) * lineH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for v in subviews { v.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: bounds.height)) }
    }
}

/// 안드로이드 글 한 덩어리(text · box · 스위치 제목 …)와 같은 모양: 여러 줄 · 줄 높이 고정 · 굵은 구간(hl) · 정렬.
struct LinedText: View {
    let s: String
    let size: CGFloat
    var bold = false
    var lh: CGFloat = 1.35
    let color: Color
    var align: Alignment = .leading
    var maxLines = 0
    var hl: [HLRange] = []
    var hc: Color? = nil

    private var measureBold: Bool { bold || !hl.isEmpty }       // 굵은 구간이 있으면 줄바꿈은 굵은 폭으로 잰다(안드로이드와 같다)
    private var lineH: CGFloat { size * lh }

    var body: some View {
        WrapLayout(s: s, size: size, bold: measureBold, lineH: lineH, maxLines: maxLines) {
            GeometryReader { g in
                let ls = Typo.wrap(s, maxW: max(1, g.size.width), size: size, bold: measureBold, maxLines: maxLines)
                let offs = hl.isEmpty ? [] : Typo.offsets(s, ls)
                VStack(spacing: 0) {
                    ForEach(Array(ls.enumerated()), id: \.offset) { i, ln in
                        lineText(ln, start: i < offs.count ? offs[i] : -1)
                            .fixedSize()
                            .frame(maxWidth: .infinity, minHeight: lineH, maxHeight: lineH, alignment: align)
                    }
                }
            }
        }
    }

    private func lineText(_ ln: String, start: Int) -> Text {
        if hl.isEmpty || start < 0 { return Text(ln).font(Typo.font(size, bold: bold)).foregroundColor(color) }
        let ns = ln as NSString
        let end = start + ns.length
        var out = Text("")
        var pos = 0
        for r in hl where r.b > start && r.a < end {
            let a = max(r.a, start) - start, b = min(r.b, end) - start
            if a > pos { out = out + Text(ns.substring(with: NSRange(location: pos, length: a - pos))).font(Typo.font(size, bold: false)).foregroundColor(color) }
            out = out + Text(ns.substring(with: NSRange(location: a, length: b - a))).font(Typo.font(size, bold: true)).foregroundColor(r.c ?? hc ?? color)
            pos = b
        }
        if pos < ns.length { out = out + Text(ns.substring(from: pos)).font(Typo.font(size, bold: false)).foregroundColor(color) }
        return out
    }
}

/// 눌렸을 때 살짝 어두워지는 단추 모양(안드로이드 pressed 0x14808080).
struct PressStyle: ButtonStyle {
    var radius: CGFloat = 8
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.overlay(RoundedRectangle(cornerRadius: radius).fill(Color(.sRGB, red: 0.5, green: 0.5, blue: 0.5, opacity: configuration.isPressed ? 0.08 : 0)))
    }
}

private struct InHeadKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// 머리 노드인가(머리의 칩 줄은 가로로 밀고, 본문의 칩 줄은 줄바꿈한다 — 안드로이드와 같다).
    var inHead: Bool { get { self[InHeadKey.self] } set { self[InHeadKey.self] = newValue } }
}
