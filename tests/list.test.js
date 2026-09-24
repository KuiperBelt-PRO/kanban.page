const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const { flattenListRows } = require('../kuiper-list.js');

test('isBoardTopLevelTask excludes subtasks', () => {
  assert.equal(C.isBoardTopLevelTask({ issueType: 'task', parentId: null }), true);
  assert.equal(C.isBoardTopLevelTask({ issueType: 'subtask', parentId: 'p1' }), false);
  assert.equal(C.isBoardTopLevelTask({ issueType: 'task', parentId: 'p1' }), false);
});

test('flattenListRows nests subtasks under parent', () => {
  const all = [
    { id: 'A', parentId: null, order: 1 },
    { id: 'B', parentId: 'A', order: 2 },
    { id: 'C', parentId: 'A', order: 1 },
    { id: 'D', parentId: null, order: 0 },
  ];
  const rows = flattenListRows([all[0], all[3]], all);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].task.id, 'A');
  assert.equal(rows[0].isSubtask, false);
  assert.equal(rows[1].task.id, 'C');
  assert.equal(rows[1].isSubtask, true);
  assert.equal(rows[2].task.id, 'B');
  assert.equal(rows[3].task.id, 'D');
});

test('flattenListRows skips archived subtasks', () => {
  const all = [
    { id: 'A', parentId: null, order: 0 },
    { id: 'B', parentId: 'A', order: 0, archivedAt: 1 },
  ];
  const rows = flattenListRows([all[0]], all);
  assert.equal(rows.length, 1);
});

test('flattenListRows hides children when parent collapsed', () => {
  const all = [
    { id: 'A', parentId: null, order: 0 },
    { id: 'B', parentId: 'A', order: 0 },
  ];
  const rows = flattenListRows([all[0]], all, new Set(['A']));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].childCount, 1);
});
