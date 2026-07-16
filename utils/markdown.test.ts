// Run: npx tsx utils/markdown.test.ts
import { sanitizeMarkdownUrl } from './markdown';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${(e as Error).message}`);
    failed++;
  }
}

test('allows http(s) and mailto', () => {
  assert(sanitizeMarkdownUrl('https://example.com') === 'https://example.com', 'https');
  assert(sanitizeMarkdownUrl('http://example.com/a') === 'http://example.com/a', 'http');
  assert(sanitizeMarkdownUrl('mailto:a@b.com') === 'mailto:a@b.com', 'mailto');
});

test('allows relative and hash', () => {
  assert(sanitizeMarkdownUrl('/path') === '/path', 'abs path');
  assert(sanitizeMarkdownUrl('#section') === '#section', 'hash');
  assert(sanitizeMarkdownUrl('./rel') === './rel', 'dot');
  assert(sanitizeMarkdownUrl('docs/page') === 'docs/page', 'bare relative');
});

test('blocks dangerous schemes', () => {
  assert(sanitizeMarkdownUrl('javascript:alert(1)') === '', 'js');
  assert(sanitizeMarkdownUrl('data:text/html,hi') === '', 'data');
  assert(sanitizeMarkdownUrl('vbscript:msgbox') === '', 'vbs');
  assert(sanitizeMarkdownUrl('  ') === '', 'blank');
  assert(sanitizeMarkdownUrl(undefined) === '', 'undefined');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
