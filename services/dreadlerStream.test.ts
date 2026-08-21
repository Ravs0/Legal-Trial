import {
  createDreadlerStreamBuffer,
  isDreadlerStreamResponse,
  parseDreadlerStreamLine,
} from './dreadlerStream';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Frame vocabulary
{
  assert(parseDreadlerStreamLine('{"t":"start"}')?.type === 'start', 'start frame parses');
  assert(parseDreadlerStreamLine('{"t":"d","v":"Thy "}')?.type === 'delta', 'delta frame parses');
  assert(
    (parseDreadlerStreamLine('{"t":"d","v":"Thy "} ') as { text?: string })?.text === 'Thy ',
    'delta keeps exact text including trailing space',
  );
  const final = parseDreadlerStreamLine('{"t":"f","character_response":"x","state_data":{"score":60}}');
  assert(final?.type === 'final' && (final.payload as { character_response?: string }).character_response === 'x', 'final frame carries flattened payload');
  assert(parseDreadlerStreamLine('{"t":"e","error":"boom"}')?.type === 'error', 'error frame parses');
}

// Junk tolerance: a malformed frame must never throw mid-stream.
{
  assert(parseDreadlerStreamLine('') === null, 'blank line ignored');
  assert(parseDreadlerStreamLine('   ') === null, 'whitespace line ignored');
  assert(parseDreadlerStreamLine('{not json') === null, 'malformed JSON ignored');
  assert(parseDreadlerStreamLine('"just a string"') === null, 'non-object JSON ignored');
  assert(parseDreadlerStreamLine('[1,2]') === null, 'array JSON ignored');
  assert(parseDreadlerStreamLine('{"t":"d"}') === null, 'delta without text rejected');
  assert(parseDreadlerStreamLine('{"t":"d","v":""}') === null, 'empty delta rejected');
  assert(parseDreadlerStreamLine('{"t":"wat"}') === null, 'unknown tag rejected');
}

// Incremental buffering across chunk boundaries.
{
  const buf = createDreadlerStreamBuffer();
  assert(buf.push('{"t":"start"}\n{"t":"d","v').length === 1, 'complete line yields one frame');
  assert(buf.push('":"Hel"}\n{"t":"d","v":"lo"}\n').length === 2, 'split line completes on next chunk');
  const tail = buf.flush();
  assert(tail.length === 0, 'no trailing frame when buffer empty');

  const buf2 = createDreadlerStreamBuffer();
  buf2.push('{"t":"start"}\n{"t":"d","v":"a"}\n{"t":"d","v":"b"}');
  const flushed = buf2.flush();
  assert(flushed.length === 1 && flushed[0].type === 'delta', 'flush emits trailing frame without newline');
}

// Full sequence in order.
{
  const buf = createDreadlerStreamBuffer();
  const wire = [
    '{"t":"start"}',
    '{"t":"d","v":"State thy claim. "}',
    '{"t":"d","v":"The record is open."}',
    '{"t":"e","error":"x"}', // junk frames flow through tagged, caller filters
    '{"t":"f","character_response":"done"}',
  ].join('\n') + '\n';
  const frames = buf.push(wire).map((f) => f.type);
  assert(
    JSON.stringify(frames) === JSON.stringify(['start', 'delta', 'delta', 'error', 'final']),
    `frame order preserved, got ${JSON.stringify(frames)}`,
  );
}

// Content-type gate.
{
  assert(
    isDreadlerStreamResponse({ headers: { get: () => 'application/x-ndjson' } } as unknown as Response),
    'ndjson content type detected',
  );
  assert(
    !isDreadlerStreamResponse({ headers: { get: () => 'application/json' } } as unknown as Response),
    'json fallback detected',
  );
}

console.log('dreadlerStream tests passed');
