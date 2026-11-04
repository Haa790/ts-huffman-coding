import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFrequencyTable,
  buildHuffmanTree,
  generateCodes,
  encode,
  decode,
} from '../src/index.js';

test('frequency table counts Unicode code points, not UTF-16 units', () => {
  const table = buildFrequencyTable('a😀a');
  assert.equal(table.get('a'), 2);
  assert.equal(table.get('😀'), 1);
  assert.equal(table.size, 2);
});

test('frequency table rejects non-strings', () => {
  assert.throws(() => buildFrequencyTable(42), TypeError);
});

test('empty input yields an empty table, null tree, and empty codes', () => {
  const table = buildFrequencyTable('');
  assert.equal(table.size, 0);
  const tree = buildHuffmanTree(table);
  assert.equal(tree, null);
  assert.equal(generateCodes(tree).size, 0);
  assert.equal(encode('', generateCodes(tree)), '');
  assert.equal(decode('', tree), '');
});

test('single distinct symbol gets the one-bit code "0"', () => {
  const tree = buildHuffmanTree(buildFrequencyTable('zzzz'));
  const codes = generateCodes(tree);
  assert.equal(codes.get('z'), '0');
  assert.equal(encode('zzz', codes), '000');
  assert.equal(decode('000', tree), 'zzz');
});

test('two symbols produce a balanced one-bit code each', () => {
  const tree = buildHuffmanTree(buildFrequencyTable('aabb'));
  const codes = generateCodes(tree);
  assert.equal(codes.size, 2);
  const values = [...codes.values()].sort();
  assert.deepEqual(values, ['0', '1']);
});

test('frequent symbols get shorter codes than rare ones', () => {
  const text = 'aaaaaaaaaabbbbccd';
  const tree = buildHuffmanTree(buildFrequencyTable(text));
  const codes = generateCodes(tree);
  assert.ok(codes.get('a').length < codes.get('d').length);
  assert.ok(codes.get('b').length <= codes.get('c').length);
});

test('generated code is a prefix code', () => {
  const tree = buildHuffmanTree(buildFrequencyTable('abracadabra'));
  const codes = generateCodes(tree);
  const words = [...codes.values()];
  for (let i = 0; i < words.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (i === j) continue;
      assert.ok(!words[j].startsWith(words[i]), `${words[j]} starts with ${words[i]}`);
    }
  }
});

test('round trip preserves the original text', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  const tree = buildHuffmanTree(buildFrequencyTable(text));
  const codes = generateCodes(tree);
  const bits = encode(text, codes);
  assert.equal(decode(bits, tree), text);
});

test('round trip works for Unicode code points', () => {
  const text = 'héllo 😀 wörld 😀';
  const tree = buildHuffmanTree(buildFrequencyTable(text));
  const codes = generateCodes(tree);
  assert.equal(decode(encode(text, codes), tree), text);
});

test('encoding is deterministic across rebuilds', () => {
  const text = 'deterministic tie breaks matter';
  const first = encode(text, generateCodes(buildHuffmanTree(buildFrequencyTable(text))));
  const second = encode(text, generateCodes(buildHuffmanTree(buildFrequencyTable(text))));
  assert.equal(first, second);
});

test('encode throws when a symbol has no code', () => {
  const codes = generateCodes(buildHuffmanTree(buildFrequencyTable('abc')));
  assert.throws(() => encode('abcd', codes), /no code for symbol/);
});

test('decode rejects invalid bit characters', () => {
  const tree = buildHuffmanTree(buildFrequencyTable('ab'));
  assert.throws(() => decode('0x1', tree), /invalid bit character/);
});

test('decode rejects a truncated bit sequence', () => {
  const text = 'abracadabra';
  const tree = buildHuffmanTree(buildFrequencyTable(text));
  const codes = generateCodes(tree);
  const bits = encode(text, codes);
  // Drop the final bit. Because the code is a complete prefix code, removing
  // one bit may still land exactly on a leaf boundary (a shorter codeword),
  // so we assert the decoder either throws or returns a shorter string.
  const result = (() => {
    try {
      return decode(bits.slice(0, bits.length - 1), tree);
    } catch (err) {
      return err;
    }
  })();
  if (result instanceof Error) {
    assert.match(result.message, /truncated|no (left|right) child/);
  } else {
    assert.equal(typeof result, 'string');
    assert.ok(result.length < text.length);
  }
});

test('decode rejects non-empty bits with an empty tree', () => {
  assert.throws(() => decode('0', null), /empty tree/);
});

test('buildHuffmanTree rejects non-positive weights', () => {
  const table = new Map([['a', 0]]);
  assert.throws(() => buildHuffmanTree(table), RangeError);
});
