import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

function withCheckout(run) {
  const dir = mkdtempSync(join(tmpdir(), 'lexforge-deploy-guard-'));
  try {
    cpSync(join(root, 'api'), join(dir, 'api'), { recursive: true });
    mkdirSync(join(dir, 'services'));
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(join(root, 'services/courtDataGateway.ts'), join(dir, 'services/courtDataGateway.ts'));
    copyFileSync(join(root, 'scripts/check-function-count.sh'), join(dir, 'scripts/check-function-count.sh'));
    copyFileSync(join(root, 'package.json'), join(dir, 'package.json'));
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function guard(dir) {
  try {
    return { code: 0, output: execFileSync('bash', ['scripts/check-function-count.sh'], { cwd: dir, encoding: 'utf8', timeout: 30000 }) };
  } catch (e) {
    return { code: e.status, output: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

test('fresh checkout passes even if source mtime is later than identical generated JS', () => withCheckout(dir => {
  const source = join(dir, 'services/courtDataGateway.ts');
  const generated = join(dir, 'api/_lib/courtDataGateway.js');
  const future = new Date(Date.now() + 60000);
  utimesSync(source, future, future);
  const result = guard(dir);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /gateway .*parity/);
}));

test('source logic drift fails even if the checked-in JS has a later timestamp', () => withCheckout(dir => {
  const source = join(dir, 'services/courtDataGateway.ts');
  const generated = join(dir, 'api/_lib/courtDataGateway.js');
  const text = readFileSync(source, 'utf8');
  assert.match(text, /name: 'API Setu'/);
  writeFileSync(source, text.replace("name: 'API Setu'", "name: 'API Setu Modified'"));
  const past = new Date(Date.now() - 60000);
  utimesSync(source, past, past);
  const future = new Date(Date.now() + 60000);
  utimesSync(generated, future, future);
  const result = guard(dir);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /drift|mismatch/i);
}));
