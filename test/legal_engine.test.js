'use strict';
const assert = require('assert');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../engine/settings.js', 'utf8');
const i = src.indexOf('var SETTINGS_POL_UPDATED'), j = src.indexOf('\n};', src.indexOf('var SETTINGS_POL = {')) + 3;
const ctx = {}; new Function('ctx', src.slice(i, j).replace(/var SETTINGS_POL_UPDATED/, 'ctx.U').replace(/var SETTINGS_POL = /, 'ctx.P = ') .replace("ctx.U = '", "ctx.U = '"))(ctx);
const { legalHtml } = require('../engine/legal.js');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ok  ', n); } catch (e) { fail++; console.log('  FAIL', n, e.message); } }
t('개인정보처리방침: 제목 · 앱 이름 · 위치 · 문의처', () => {
  const h = legalHtml('privacy', ctx.P, ctx.U);
  assert.ok(/<title>개인정보처리방침 · 길동무<\/title>/.test(h) && h.includes('com.dullyyj.subway') && h.includes('위치정보') && h.includes('phg0643@gmail.com') && h.includes(ctx.U));
});
t('앱 안 글과 같은 문단 수 · 굵은 글씨 · 줄바꿈', () => {
  const h = legalHtml('privacy', ctx.P, ctx.U);
  assert.strictEqual((h.match(/<p[ >]/g) || []).length, ctx.P.polp.paras.length + 1);
  assert.ok(h.includes('<b>1. 수집하는 항목</b>') && h.includes('<br>'));
});
t('terms · open 문서 · 알 수 없는 값은 방침으로', () => {
  assert.ok(legalHtml('terms', ctx.P, ctx.U).includes('위치기반서비스 이용약관'));
  assert.ok(legalHtml('open', ctx.P, ctx.U).includes('쿠팡 파트너스'));
  assert.ok(legalHtml('zzz', ctx.P, ctx.U).includes('<title>개인정보처리방침'));
});
t('HTML 이스케이프', () => {
  const h = legalHtml('privacy', { polp: { title: 'a<b', paras: [{ small: 0, parts: [['<script>x</script>', 0]] }] } }, '2026');
  assert.ok(!h.includes('<script>') && h.includes('&lt;script&gt;'));
});
console.log(pass + ' pass, ' + fail + ' fail'); if (fail) process.exit(1);
