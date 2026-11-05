import XCTest
@testable import Gildongmu

final class ParseTests: XCTestCase {
    func testScreenParse() throws {
        let json = #"{"ok":true,"v":1,"screen":"x","head":[],"body":[{"t":"text","s":"안녕","pad":[1,2,3,4],"bold":true},{"t":"spacer","h":8},{"t":"mystery"}]}"#
        let s = try Screen.parse(json.data(using: .utf8)!)
        XCTAssertEqual(s.body.count, 3)
        XCTAssertEqual(s.body[0].str("s"), "안녕")
        XCTAssertTrue(s.body[0].bool("bold"))
        XCTAssertEqual(s.body[0].pad.t, 2)
    }
    func testOkFalse() {
        XCTAssertThrowsError(try Screen.parse(#"{"ok":false,"err":"cap"}"#.data(using: .utf8)!))
    }
    func testCssColors() {
        XCTAssertNotNil(Palette.css("#1d9bf0")); XCTAssertNotNil(Palette.css("rgba(0,0,0,.5)")); XCTAssertNil(Palette.css("nope"))
        XCTAssertNotNil(Palette.light.color("gold")); XCTAssertNotNil(Palette.dark.color("ongold"))
    }
    func testSvgPaths() {
        // 머티리얼 '홈' 아이콘 · 호(arc)가 들어간 동그라미
        XCTAssertFalse(SVGPath.path("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z").isEmpty)
        XCTAssertFalse(SVGPath.path("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z").isEmpty)
        XCTAssertFalse(SVGPath.path("M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0").isEmpty)
        XCTAssertFalse(SVGPath.path("M1.5.5l-.5 1").isEmpty)
    }
    func testActionSet() { let a = Action.set("k", true); XCTAssertEqual(a.a, "set"); XCTAssertEqual(a.on, true) }
}
