// 시험용: 앱이 부르는 POST /ride-eta 를 Node 에서 진짜 엔진(engine/ride-eta.js)으로 답한다.
// 앱은 시각을 계산하지 않고 엔진 응답을 그린다 → UI 시험도 엔진을 거쳐야 같은 결과가 나온다.
const path = require('path');
const { rideEta } = require(path.join(__dirname, '..', '..', 'engine', 'ride-eta.js'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function installEtaMock(page, log) {
  const calls = [];
  await page.route('**/ride-eta', async route => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const P = JSON.parse(req.postData() || '{}');
      const res = rideEta(P); calls.push({ P, res });
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(res) });
    } catch (e) { return route.fulfill({ status: 500, headers: cors, body: String(e && e.message) }); }
  });
  return calls;
}
// 요청이 하나도 진행 중이 아닐 때까지(마지막 응답이 화면에 적용될 때까지) 기다린다. 앱 쪽 시계는 가짜지만 네트워크는 실제 시간이다.
async function etaWait(page, maxMs) {
  const end = Date.now() + (maxMs || 3000);
  let quiet = 0;
  while (Date.now() < end) {
    const idle = await page.evaluate(() => !(window._etaSt && (window._etaSt.busy || window._etaSt.pending)));
    quiet = idle ? quiet + 1 : 0;
    if (quiet >= 2) return true;
    await sleep(8);
  }
  return false;
}
// 시계를 흘리거나 evaluate 로 상태를 바꾼 직후 엔진 응답이 화면에 적용되도록, clock.runFor / tick 뒤에 자동으로 기다린다.
function autoWait(page) {
  const rf = page.clock.runFor.bind(page.clock);
  page.clock.runFor = async (ms) => { const r = await rf(ms); await etaWait(page); return r; };
}
module.exports = { installEtaMock, etaWait, autoWait };
