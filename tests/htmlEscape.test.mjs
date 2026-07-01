import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../js/htmlEscape.js';

test('escapeHtml neutralizes all five HTML-significant characters', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapeHtml renders a script-tag payload inert', () => {
  const payload = '<script>alert(1)</script>';
  const escaped = escapeHtml(payload);
  assert.equal(escaped.includes('<script>'), false);
  assert.equal(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapeHtml renders an img-onerror payload inert', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const escaped = escapeHtml(payload);
  assert.equal(escaped.includes('<img'), false);
});

test('escapeHtml coerces non-string values safely', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(null), 'null');
  assert.equal(escapeHtml(undefined), 'undefined');
});

test('escapeHtml leaves ordinary text unchanged', () => {
  assert.equal(escapeHtml('sugar node depleted'), 'sugar node depleted');
});
