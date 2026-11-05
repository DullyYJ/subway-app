import Foundation

/// 서버(엔진)가 내려 주는 화면 JSON 한 줄(노드). 안드로이드 ScreenCore 와 같은 규칙 — 모르는 종류는 건너뛴다.
struct Node: Identifiable {
    let id: String
    let d: [String: Any]
    init(d: [String: Any], id: String = UUID().uuidString) { self.d = d; self.id = id }
    var t: String { d["t"] as? String ?? "" }
    func str(_ k: String) -> String? { d[k] as? String }
    func num(_ k: String, _ def: Double = 0) -> Double {
        if let n = d[k] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { return n.doubleValue }
        return def
    }
    func bool(_ k: String, _ def: Bool = false) -> Bool {
        if let n = d[k] as? NSNumber { return n.boolValue }
        return def
    }
    /// 자식 노드들. id 는 부모 id + 자리라서 다시 그려도 같다(스위치 상태가 안 풀린다).
    func nodes(_ k: String) -> [Node] { (d[k] as? [[String: Any]] ?? []).enumerated().map { Node(d: $1, id: "\(id)/\(k)\($0)") } }
    var kids: [Node] { nodes("kids") }
    var items: [[String: Any]] { d["items"] as? [[String: Any]] ?? [] }
    /// pad:[왼,위,오른,아래] (dp)
    var pad: (l: Double, t: Double, r: Double, b: Double) {
        let a = (d["pad"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? []
        return a.count == 4 ? (a[0], a[1], a[2], a[3]) : (0, 0, 0, 0)
    }
    var act: Action? { Action(d["act"] as? [String: Any]) }
}

/// 눌렸을 때 앱이 할 일. a: cat | open | refresh | search | set | call | web | sel | tog
struct Action {
    let a: String
    let v: String?
    let url: String?
    let key: String?
    let on: Bool?
    static func set(_ key: String, _ on: Bool) -> Action { Action(a: "set", v: nil, url: nil, key: key, on: on) }
    private init(a: String, v: String?, url: String?, key: String?, on: Bool?) { self.a = a; self.v = v; self.url = url; self.key = key; self.on = on }
    init?(_ m: [String: Any]?) {
        guard let m = m, let a = m["a"] as? String else { return nil }
        self.a = a; v = m["v"] as? String; url = m["url"] as? String; key = m["key"] as? String; on = (m["on"] as? NSNumber)?.boolValue
    }
}

/// screen JSON 전체: { ok, v, screen, rev, head:[…], body:[…], foot:[…], bg, cover, anchor }
struct Screen {
    let name: String
    let head: [Node]
    let body: [Node]
    let foot: [Node]
    let bg: String
    let raw: [String: Any]

    enum ParseError: Error, LocalizedError {
        case notJSON, notOk(String), tooBig
        var errorDescription: String? {
            switch self {
            case .notJSON: return "화면 JSON 을 읽지 못했어요"
            case .notOk(let m): return "서버가 화면을 주지 않았어요: \(m)"
            case .tooBig: return "화면이 너무 커요"
            }
        }
    }

    static func parse(_ data: Data) throws -> Screen {
        if data.count > 3_000_000 { throw ParseError.tooBig }
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ParseError.notJSON }
        if (o["ok"] as? Bool) == false { throw ParseError.notOk(o["err"] as? String ?? o["msg"] as? String ?? "ok=false") }
        func list(_ k: String) -> [Node] { (o[k] as? [[String: Any]] ?? []).enumerated().map { Node(d: $1, id: "\(k)\($0)") } }
        return Screen(name: o["screen"] as? String ?? "", head: list("head"), body: list("body"), foot: list("foot"), bg: o["bg"] as? String ?? "bg", raw: o)
    }
}
