import Foundation

/// 서버 주소(안드로이드 ShellCore 와 같다).
enum Servers {
    static let base = "https://route-v2.phg0643.workers.dev"
    static let kids = "https://gildongmu-kids.phg0643.workers.dev"   // 키즈 서버(워커 이름이 다르면 여기만 고친다)
    static let cap = 29                                            // 앱이 그릴 수 있는 화면 규격 수준(안드로이드 ShellCore.CAP)
}

enum Net {
    struct Failure: Error, LocalizedError { let msg: String; var errorDescription: String? { msg } }

    static func request(_ method: String, _ url: String, body: String? = nil, timeout: TimeInterval = 12) async throws -> Data {
        guard let u = URL(string: url), u.scheme == "https" else { throw Failure(msg: "https 주소만 써요: \(url)") }
        var r = URLRequest(url: u, timeoutInterval: timeout)
        r.httpMethod = method
        if let b = body { r.httpBody = b.data(using: .utf8); r.setValue("application/json", forHTTPHeaderField: "content-type") }
        let (d, resp) = try await URLSession.shared.data(for: r)
        if let h = resp as? HTTPURLResponse, h.statusCode >= 400 { throw Failure(msg: "서버 \(h.statusCode)") }
        return d
    }

    static func screen(_ path: String, method: String = "POST", body: String? = nil) async throws -> Screen {
        let d = try await request(method, Servers.base + path, body: method == "POST" ? (body ?? "{\"cap\":\(Servers.cap)}") : nil)
        return try Screen.parse(d)
    }
}
