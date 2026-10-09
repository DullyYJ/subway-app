// 엔진 Worker 에 들어가는 모양 그대로(next-train-data.js + next-train.js + next-train-worker.js 이어 붙임)로 불러온다.
// patch_nexttrain.js 가 Worker 에 넣는 것과 같은 방식으로 'use strict'·module.exports 줄을 빼고 이어 붙인다.
const fs = require('fs'), path = require('path');
module.exports = function ntLoad() {
  const dir = path.join(__dirname, '..', '..', 'engine');
  const body = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\s*['"]use strict['"];?\s*$/mg, '').replace(/^\s*if \(typeof module !== 'undefined' && module\.exports\)[^\n]*\n?/mg, '').replace(/^\s*module\.exports\s*=[^\n]*\n?/mg, '');
  const code = body('next-train-data.js') + '\n' + body('next-train.js') + '\n' + body('next-train-worker.js') +
    '\nreturn { ntCreate: ntCreate, ntDayInfo: ntDayInfo, NT_INCHEON_TT: NT_INCHEON_TT, NT_STNORDER: NT_STNORDER, NT_HOLIDAYS: NT_HOLIDAYS, ntEnsure: ntEnsure, ntAttachPath: ntAttachPath, ntAttachAll: ntAttachAll, ntAnswer: ntAnswer, handleNextTrain: handleNextTrain, handleRideEtaNT: handleRideEtaNT, _ntReset: function () { _NT = null; _NT_AT = 0; _NT_P = null; _NT_FAIL_AT = 0; } };';
  return new Function(code)();
};
