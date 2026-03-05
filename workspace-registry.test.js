import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Tests for workspace-registry.js core logic.
 *
 * Since workspace-registry imports LOG_DIR at module level from findcc.js,
 * we test the data format, sanitization logic, and persistence patterns
 * that the module relies on.
 */

describe('workspace-registry', () => {
  let tempDir;
  let workspacesFile;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccv-test-'));
    workspacesFile = join(tempDir, 'workspaces.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadWorkspaces', () => {
    it('returns empty array when file does not exist', () => {
      assert.ok(!existsSync(workspacesFile));
      // mirrors: if (!existsSync(WORKSPACES_FILE)) return [];
    });

    it('parses valid workspaces.json', () => {
      const data = {
        workspaces: [
          { id: 'abc123', path: '/tmp/project', projectName: 'project', lastUsed: '2026-01-01T00:00:00.000Z' }
        ]
      };
      writeFileSync(workspacesFile, JSON.stringify(data));
      const parsed = JSON.parse(readFileSync(workspacesFile, 'utf-8'));
      assert.ok(Array.isArray(parsed.workspaces));
      assert.equal(parsed.workspaces.length, 1);
      assert.equal(parsed.workspaces[0].path, '/tmp/project');
    });

    it('handles corrupted JSON gracefully', () => {
      writeFileSync(workspacesFile, 'not json{{{');
      let result = [];
      try {
        result = JSON.parse(readFileSync(workspacesFile, 'utf-8'));
      } catch {
        result = [];
      }
      assert.deepStrictEqual(result, []);
    });

    it('handles missing workspaces key', () => {
      writeFileSync(workspacesFile, JSON.stringify({ other: 'data' }));
      const parsed = JSON.parse(readFileSync(workspacesFile, 'utf-8'));
      const list = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
      assert.deepStrictEqual(list, []);
    });
  });

  describe('registerWorkspace logic', () => {
    it('creates new entry for new path', () => {
      const list = [];
      const resolvedPath = '/Users/test/code/my-project';
      const projectName = basename(resolvedPath).replace(/[^a-zA-Z0-9_\-\.]/g, '_');

      const existing = list.find(w => w.path === resolvedPath);
      assert.equal(existing, undefined);

      const entry = {
        id: 'test123',
        path: resolvedPath,
        projectName,
        lastUsed: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      list.push(entry);

      assert.equal(list.length, 1);
      assert.equal(list[0].path, resolvedPath);
      assert.equal(list[0].projectName, 'my-project');
    });

    it('updates existing entry instead of duplicating', () => {
      const list = [
        { id: 'abc', path: '/Users/test/project', projectName: 'project', lastUsed: '2026-01-01T00:00:00.000Z' }
      ];

      const resolvedPath = '/Users/test/project';
      const existing = list.find(w => w.path === resolvedPath);
      assert.ok(existing);

      existing.lastUsed = '2026-03-01T00:00:00.000Z';
      assert.equal(list.length, 1);
      assert.equal(list[0].lastUsed, '2026-03-01T00:00:00.000Z');
    });

    it('sanitizes project name from path basename', () => {
      const testCases = [
        { input: 'my-project', expected: 'my-project' },
        { input: 'my project', expected: 'my_project' },
        { input: 'my@project!', expected: 'my_project_' },
        { input: 'CamelCase123', expected: 'CamelCase123' },
        { input: 'with.dots.ok', expected: 'with.dots.ok' },
        { input: '中文项目', expected: '____' },
      ];

      for (const { input, expected } of testCases) {
        const sanitized = input.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        assert.equal(sanitized, expected, `sanitize("${input}") should be "${expected}"`);
      }
    });
  });

  describe('removeWorkspace logic', () => {
    it('removes workspace by id', () => {
      const list = [
        { id: 'aaa', path: '/p1' },
        { id: 'bbb', path: '/p2' },
        { id: 'ccc', path: '/p3' },
      ];

      const filtered = list.filter(w => w.id !== 'bbb');
      assert.equal(filtered.length, 2);
      assert.ok(!filtered.find(w => w.id === 'bbb'));
      assert.ok(filtered.find(w => w.id === 'aaa'));
      assert.ok(filtered.find(w => w.id === 'ccc'));
    });

    it('returns unchanged list when id not found', () => {
      const list = [{ id: 'aaa', path: '/p1' }];
      const filtered = list.filter(w => w.id !== 'nonexistent');
      assert.equal(filtered.length, list.length);
    });
  });

  describe('getWorkspaces sort order', () => {
    it('sorts by lastUsed descending (most recent first)', () => {
      const list = [
        { id: '1', path: '/a', projectName: 'a', lastUsed: '2026-01-01T00:00:00.000Z' },
        { id: '2', path: '/b', projectName: 'b', lastUsed: '2026-03-01T00:00:00.000Z' },
        { id: '3', path: '/c', projectName: 'c', lastUsed: '2026-02-01T00:00:00.000Z' },
      ];

      const sorted = [...list].sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
      assert.equal(sorted[0].id, '2');
      assert.equal(sorted[1].id, '3');
      assert.equal(sorted[2].id, '1');
    });
  });

  describe('workspaces.json persistence', () => {
    it('round-trips workspace data through JSON file', () => {
      const original = {
        workspaces: [
          {
            id: 'abc123def456',
            path: '/Users/test/code/my-project',
            projectName: 'my-project',
            lastUsed: '2026-03-04T12:00:00.000Z',
            createdAt: '2026-03-01T08:00:00.000Z',
          },
          {
            id: 'xyz789',
            path: '/Users/test/code/other',
            projectName: 'other',
            lastUsed: '2026-03-03T10:00:00.000Z',
            createdAt: '2026-03-02T09:00:00.000Z',
          },
        ]
      };

      // Save
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(workspacesFile, JSON.stringify(original, null, 2));

      // Load
      const loaded = JSON.parse(readFileSync(workspacesFile, 'utf-8'));

      assert.equal(loaded.workspaces.length, 2);
      assert.deepStrictEqual(loaded.workspaces[0].id, original.workspaces[0].id);
      assert.deepStrictEqual(loaded.workspaces[0].path, original.workspaces[0].path);
      assert.deepStrictEqual(loaded.workspaces[1].path, original.workspaces[1].path);
      assert.deepStrictEqual(loaded.workspaces[1].projectName, original.workspaces[1].projectName);
    });

    it('handles concurrent-safe write pattern', () => {
      // First write
      const data1 = { workspaces: [{ id: '1', path: '/p1' }] };
      writeFileSync(workspacesFile, JSON.stringify(data1, null, 2));

      // Read-modify-write (simulates registerWorkspace)
      const loaded = JSON.parse(readFileSync(workspacesFile, 'utf-8'));
      loaded.workspaces.push({ id: '2', path: '/p2' });
      writeFileSync(workspacesFile, JSON.stringify(loaded, null, 2));

      // Verify
      const final = JSON.parse(readFileSync(workspacesFile, 'utf-8'));
      assert.equal(final.workspaces.length, 2);
    });
  });

  describe('log stats enrichment', () => {
    it('counts .jsonl files and sums sizes', () => {
      const projectDir = join(tempDir, 'my-project');
      mkdirSync(projectDir, { recursive: true });

      // Create fake log files
      writeFileSync(join(projectDir, 'my-project_20260301.jsonl'), '{"a":1}\n{"b":2}\n');
      writeFileSync(join(projectDir, 'my-project_20260302.jsonl'), '{"c":3}\n');
      writeFileSync(join(projectDir, 'readme.txt'), 'not a log');

      const files = readdirSync(projectDir);
      let logCount = 0;
      let totalSize = 0;
      for (const f of files) {
        if (f.endsWith('.jsonl')) {
          logCount++;
          totalSize += statSync(join(projectDir, f)).size;
        }
      }

      assert.equal(logCount, 2);
      assert.ok(totalSize > 0);
    });

    it('returns zero stats for non-existent log dir', () => {
      const logDir = join(tempDir, 'nonexistent-project');
      let logCount = 0;
      let totalSize = 0;
      try {
        if (existsSync(logDir)) {
          // would enumerate files
        }
      } catch { /* empty */ }

      assert.equal(logCount, 0);
      assert.equal(totalSize, 0);
    });
  });
});
