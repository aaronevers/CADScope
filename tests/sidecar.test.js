// ABOUTME: Unit tests for the sidecar lookup tables and node lookup by scaffold path.
// ABOUTME: Run with: node --test tests/sidecar.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSidecarLookups, lookupNode } from '../assets/sidecar.js';

const PALETTE = { Main: { color: '#3A3A3A' }, Plate: { color: '#474747', metalness: 0.1, showInPicker: false } };

test('palette entries get their defaults filled in', () => {
  const { palette } = buildSidecarLookups({ palette: PALETTE });
  assert.deepEqual(palette.get('Main'),
    { color: '#3A3A3A', metalness: 0, opacity: 1, showInPicker: true, showInTree: true });
  assert.deepEqual(palette.get('Plate'),
    { color: '#474747', metalness: 0.1, opacity: 1, showInPicker: false, showInTree: true });
});

test('autoAssign globs become anchored patterns in rule order', () => {
  const { autoAssign } = buildSidecarLookups({
    palette: PALETTE,
    autoAssign: [{ match: 'bottom-light-mount*', category: 'Plate' }, { match: 'bottom-*', category: 'Main' }],
  });
  assert.deepEqual(autoAssign.map((r) => r.category), ['Plate', 'Main']);
  assert.ok(autoAssign[0].regex.test('bottom-light-mount001'));
  assert.ok(!autoAssign[0].regex.test('x-bottom-light-mount'));
});

test('a path key finds the node at that path only', () => {
  const lookups = buildSidecarLookups({ palette: PALETTE, nodes: { 'Assembly/Body008': { category: 'Plate' } } });
  assert.equal(lookupNode(lookups, 'Assembly/Body008').category, 'Plate');
  assert.equal(lookupNode(lookups, 'Other/Body008'), null);
});

test('a key without a slash is the path of a top-level node', () => {
  const lookups = buildSidecarLookups({ palette: PALETTE, nodes: { Assembly: { category: 'Main' } } });
  assert.equal(lookupNode(lookups, 'Assembly').category, 'Main');
  assert.equal(lookupNode(lookups, 'LumenPnP/Assembly'), null);
  assert.equal(lookupNode(lookups, 'Assembly-2'), null);
});

test('top-level node keys build without warnings', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  buildSidecarLookups({ palette: PALETTE, nodes: { Assembly: { category: 'Main' }, optional_strip_feeders: { hidden: true } } });
  assert.equal(warn.mock.callCount(), 0);
});

test('a node naming a category missing from the palette warns', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  buildSidecarLookups({ palette: PALETTE, nodes: { 'Assembly/Body008': { category: 'Steel' } } });
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /Assembly\/Body008.*Steel/);
});

test('lookups without a sidecar find nothing', () => {
  assert.equal(lookupNode(null, 'Assembly'), null);
});
