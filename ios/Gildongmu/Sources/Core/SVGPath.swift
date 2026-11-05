import SwiftUI

/// SVG path 의 d 문자열(탭 아이콘 · 스위치 아이콘)을 SwiftUI Path 로. 0~24 좌표계(머티리얼 아이콘)를 가정한다.
enum SVGPath {
    static func path(_ d: String) -> Path {
        var p = Path()
        var sc = Scanner2(d)
        var cmd: Character = " "
        var cur = CGPoint.zero, start = CGPoint.zero
        var lastC: CGPoint? = nil, lastQ: CGPoint? = nil
        while true {
            sc.skipSep()
            if sc.atEnd { break }
            if let c = sc.peekCmd() { cmd = c; sc.advance() } else if cmd == " " { break }
            let rel = cmd.isLowercase
            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y) }
            switch cmd {
            case "M", "m":
                guard let x = sc.num(), let y = sc.num() else { return p }
                cur = pt(x, y); start = cur; p.move(to: cur)
                cmd = rel ? "l" : "L"; lastC = nil; lastQ = nil
            case "L", "l":
                guard let x = sc.num(), let y = sc.num() else { return p }
                cur = pt(x, y); p.addLine(to: cur); lastC = nil; lastQ = nil
            case "H", "h":
                guard let x = sc.num() else { return p }
                cur = CGPoint(x: rel ? cur.x + x : x, y: cur.y); p.addLine(to: cur); lastC = nil; lastQ = nil
            case "V", "v":
                guard let y = sc.num() else { return p }
                cur = CGPoint(x: cur.x, y: rel ? cur.y + y : y); p.addLine(to: cur); lastC = nil; lastQ = nil
            case "C", "c":
                guard let a = sc.num(), let b = sc.num(), let c2 = sc.num(), let d2 = sc.num(), let e = sc.num(), let f = sc.num() else { return p }
                let c1 = pt(a, b), cc = pt(c2, d2), to = pt(e, f)
                p.addCurve(to: to, control1: c1, control2: cc); lastC = cc; lastQ = nil; cur = to
            case "S", "s":
                guard let c2 = sc.num(), let d2 = sc.num(), let e = sc.num(), let f = sc.num() else { return p }
                let c1 = lastC.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let cc = pt(c2, d2), to = pt(e, f)
                p.addCurve(to: to, control1: c1, control2: cc); lastC = cc; lastQ = nil; cur = to
            case "Q", "q":
                guard let a = sc.num(), let b = sc.num(), let e = sc.num(), let f = sc.num() else { return p }
                let q = pt(a, b), to = pt(e, f)
                p.addQuadCurve(to: to, control: q); lastQ = q; lastC = nil; cur = to
            case "T", "t":
                guard let e = sc.num(), let f = sc.num() else { return p }
                let q = lastQ.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let to = pt(e, f)
                p.addQuadCurve(to: to, control: q); lastQ = q; lastC = nil; cur = to
            case "A", "a":
                guard let rx = sc.num(), let ry = sc.num(), let rot = sc.num(), let fa = sc.flag(), let fs = sc.flag(), let x = sc.num(), let y = sc.num() else { return p }
                let to = pt(x, y)
                arc(&p, from: cur, rx: rx, ry: ry, rot: rot, large: fa, sweep: fs, to: to)
                cur = to; lastC = nil; lastQ = nil
            case "Z", "z":
                p.closeSubpath(); cur = start; lastC = nil; lastQ = nil
            default:
                return p
            }
        }
        return p
    }

    /// 끝점 방식 호 → 베지어 조각들(SVG 규격 부록 F.6).
    private static func arc(_ p: inout Path, from: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, rot: CGFloat, large: Bool, sweep: Bool, to: CGPoint) {
        var rx = abs(rx0), ry = abs(ry0)
        if from == to { return }
        if rx == 0 || ry == 0 { p.addLine(to: to); return }
        let phi = rot * .pi / 180, cp = cos(phi), sp = sin(phi)
        let dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2
        let x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy
        let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lam > 1 { let s = sqrt(lam); rx *= s; ry *= s }
        let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let den = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var co = den == 0 ? 0 : sqrt(max(0, num / den))
        if large == sweep { co = -co }
        let cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx
        let cx = cp * cxp - sp * cyp + (from.x + to.x) / 2, cy = sp * cxp + cp * cyp + (from.y + to.y) / 2
        func ang(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a
        }
        let th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
        var dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
        if !sweep && dth > 0 { dth -= 2 * .pi } else if sweep && dth < 0 { dth += 2 * .pi }
        let n = max(1, Int(ceil(abs(dth) / (.pi / 2) - 1e-9)))
        let step = dth / CGFloat(n)
        let t = 4.0 / 3.0 * tan(step / 4)
        var a = th1
        for _ in 0..<n {
            let a2 = a + step
            let c1x = cos(a) - t * sin(a), c1y = sin(a) + t * cos(a)
            let c2x = cos(a2) + t * sin(a2), c2y = sin(a2) - t * cos(a2)
            func m(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                let X = rx * x, Y = ry * y
                return CGPoint(x: cp * X - sp * Y + cx, y: sp * X + cp * Y + cy)
            }
            p.addCurve(to: m(cos(a2), sin(a2)), control1: m(c1x, c1y), control2: m(c2x, c2y))
            a = a2
        }
    }

    /// 숫자 · 명령 글자 읽는 작은 스캐너(1.5.5 · -3 · 1e-2 · 붙은 호 깃발 011 처리).
    private struct Scanner2 {
        let s: [Character]; var i = 0
        init(_ str: String) { s = Array(str) }
        var atEnd: Bool { i >= s.count }
        mutating func skipSep() { while i < s.count, s[i] == " " || s[i] == "," || s[i] == "\n" || s[i] == "\t" || s[i] == "\r" { i += 1 } }
        func peekCmd() -> Character? { i < s.count && s[i].isLetter && s[i] != "e" && s[i] != "E" ? s[i] : nil }
        mutating func advance() { i += 1 }
        mutating func flag() -> Bool? {
            skipSep(); guard i < s.count, s[i] == "0" || s[i] == "1" else { return nil }
            let v = s[i] == "1"; i += 1; return v
        }
        mutating func num() -> CGFloat? {
            skipSep(); guard i < s.count else { return nil }
            var j = i, seenDot = false, seenE = false
            if s[j] == "-" || s[j] == "+" { j += 1 }
            var digits = false
            while j < s.count {
                let c = s[j]
                if c.isNumber { digits = true; j += 1 }
                else if c == "." && !seenDot && !seenE { seenDot = true; j += 1 }
                else if (c == "e" || c == "E") && digits && !seenE { seenE = true; j += 1; if j < s.count, s[j] == "-" || s[j] == "+" { j += 1 } }
                else { break }
            }
            guard digits, let v = Double(String(s[i..<j])) else { return nil }
            i = j; return CGFloat(v)
        }
    }
}

/// 24×24 아이콘 한 개를 주어진 크기로 그린다.
struct SVGIcon: Shape {
    let d: String
    func path(in rect: CGRect) -> Path {
        let p = SVGPath.path(d)
        let s = min(rect.width, rect.height) / 24
        return p.applying(CGAffineTransform(scaleX: s, y: s).translatedBy(x: 0, y: 0)).offsetBy(dx: rect.minX + (rect.width - 24 * s) / 2, dy: rect.minY + (rect.height - 24 * s) / 2)
    }
}
