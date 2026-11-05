import SwiftUI

/// ShellCore.palette 와 같은 색(안드로이드와 똑같이). 역할 이름 → 색.
struct Palette {
    let c: [String: Color]
    static let dark = Palette(c: Palette.make([
        "bg": 0x121214, "card": 0x1C1C1E, "border": 0x2C2C2E, "text": 0xF2F2F7, "sub": 0x8E8E93, "gold": 0xD4AF37, "orange": 0xFF9F0A,
        "imgbg": 0x252528, "white": 0xFFFFFF, "border2": 0x3A3A3C, "card2": 0x2C2C2E, "nav": 0x1C1C1E, "gold2": 0xB8922F, "ongold": 0x121214]))
    static let light = Palette(c: Palette.make([
        "bg": 0xF0F4F8, "card": 0xFFFFFF, "border": 0xDCE8F0, "text": 0x1A2533, "sub": 0x6B8299, "gold": 0x1D9BF0, "orange": 0xF07830,
        "imgbg": 0xE8F4FF, "white": 0xFFFFFF, "border2": 0xC8DCEA, "card2": 0xE8F0F8, "nav": 0xFFFFFF, "gold2": 0x0E7DD6, "ongold": 0xFFFFFF]))

    private static func make(_ m: [String: Int]) -> [String: Color] {
        var o: [String: Color] = [:]
        for (k, v) in m { o[k] = Color(hex: v) }
        return o
    }

    /// 역할 이름(bg·card·gold …) 또는 CSS 색(#rgb · #rrggbb · #rrggbbaa · rgb()/rgba()). 못 읽으면 nil.
    func color(_ s: String?) -> Color? {
        guard let s = s, !s.isEmpty else { return nil }
        if s == "none" { return Color.clear }
        if let c = c[s] { return c }
        return Palette.css(s)
    }

    static func css(_ str: String) -> Color? {
        let s = str.trimmingCharacters(in: .whitespaces).lowercased()
        if s.hasPrefix("#") {
            var h = String(s.dropFirst())
            if h.count == 3 || h.count == 4 { h = h.map { "\($0)\($0)" }.joined() }
            guard h.count == 6 || h.count == 8, let v = UInt64(h, radix: 16) else { return nil }
            if h.count == 6 { return Color(hex: Int(v)) }
            let r = Double((v >> 24) & 255) / 255, g = Double((v >> 16) & 255) / 255, b = Double((v >> 8) & 255) / 255, a = Double(v & 255) / 255
            return Color(.sRGB, red: r, green: g, blue: b, opacity: a)
        }
        if s.hasPrefix("rgb") {
            guard let l = s.firstIndex(of: "("), let r = s.firstIndex(of: ")") else { return nil }
            let p = s[s.index(after: l)..<r].split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" }).compactMap { Double($0) }
            guard p.count >= 3 else { return nil }
            return Color(.sRGB, red: p[0] / 255, green: p[1] / 255, blue: p[2] / 255, opacity: p.count > 3 ? p[3] : 1)
        }
        return nil
    }
}

extension Color {
    init(hex: Int) { self.init(.sRGB, red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: 1) }
}
