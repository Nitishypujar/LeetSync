import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const stylesheet = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles.css'),
  'utf8',
);

function rules(selectorPattern) {
  const matcher = new RegExp(
    `(?:^|\\})\\s*${selectorPattern}\\s*\\{([^}]*)\\}`,
    'g',
  );
  const matches = [...stylesheet.matchAll(matcher)];
  assert.ok(matches.length, `Missing CSS rule: ${selectorPattern}`);
  return matches.map((match) => match[1]);
}

function color(selectorPattern, property) {
  const matcher = new RegExp(
    `(?:^|;)\\s*${property}\\s*:\\s*(#[\\da-f]{6})`,
    'i',
  );
  let value;
  for (const ruleBody of rules(selectorPattern)) {
    const match = ruleBody.match(matcher);
    if (match) value = match[1];
  }
  assert.ok(value, `Missing ${property} color in CSS rule: ${selectorPattern}`);
  return value;
}

function luminance(hex) {
  const channels = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function assertReadable(selectorPattern, background = '#ffffff') {
  const foreground = color(selectorPattern, 'color');
  assert.ok(
    contrast(foreground, background) >= 4.5,
    `${selectorPattern}: ${foreground} on ${background} is below 4.5:1`,
  );
}

function assertBadgeReadable(selectorPattern) {
  const foreground = color(selectorPattern, 'color');
  const background = color(selectorPattern, 'background');
  assert.ok(
    contrast(foreground, background) >= 4.5,
    `${selectorPattern}: ${foreground} on ${background} is below 4.5:1`,
  );
}

test('dashboard supporting text meets WCAG AA contrast on white surfaces', () => {
  [
    '\\.subtle',
    '\\.hero-copy',
    '\\.stats article span',
    '\\.stats article small',
    '\\.check-row\\s*>\\s*span:last-child\\s*,\\s*\\.check-row\\s*>\\s*a',
    '\\.status',
    '\\.username-form small',
    '\\.history-head',
    '\\.history-row',
    '\\.problem small',
    '\\.history-row time',
    '\\.empty-state p',
    '\\.footer-actions',
    '\\.page-loading',
    '\\.extension-store-pending',
    '\\.refresh-timestamp',
    '\\.live-label',
    '\\.text-button',
  ].forEach((selector) => assertReadable(selector));
});

test('dashboard sync badges meet WCAG AA contrast on their status backgrounds', () => {
  [
    '\\.job-status',
    '\\.job-synced',
    '\\.job-failed',
    '\\.job-skipped',
    '\\.job-pending\\s*,\\s*\\.job-running',
  ].forEach(assertBadgeReadable);
});

test('supporting text on tinted dashboard surfaces remains readable', () => {
  assertReadable('\\.hero-card-top span', '#edf7ef');
  assertReadable('\\.hero-sync', '#f2f7f2');
  assertReadable('\\.hero-sync span', '#f2f7f2');
  assertReadable('\\.fix-line', '#faf8ef');
  assertReadable('\\.notice', '#f0f7f1');
  assertReadable('\\.notice-error', '#fff4f1');
});
