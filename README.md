# ts-huffman-coding

Generate Huffman prefix codes from a string's character frequencies, then encode and decode with them.

```js
import {
  buildFrequencyTable,
  buildHuffmanTree,
  generateCodes,
  encode,
  decode,
} from './src/index.js';

const text = 'abracadabra';
const tree = buildHuffmanTree(buildFrequencyTable(text));
const codes = generateCodes(tree);

console.log(codes.get('a')); // '0' (or '1', depending on tie-break order)

const bits = encode(text, codes);
console.log(decode(bits, tree)); // 'abracadabra'
```

## Why this exists

Text compression needs a codebook that assigns short bit strings to common symbols and long ones to rare symbols, while remaining unambiguous to decode. The standard construction is Huffman's algorithm: repeatedly merge the two lightest nodes until one tree remains, then read each symbol's codeword off the path from the root.

The trade-off here is determinism over compactness. When two nodes have equal weight, the order in which they are merged is arbitrary, and different orders produce different but equally valid codebooks. This library breaks ties by insertion order, so the same input always yields the same codes. That costs a few bits in some cases, but it means tests, caches, and reproducible builds all see the same output.

## The awkward edge

A single distinct symbol has no left/right split, so there is no natural codeword. This library assigns it the one-bit code `"0"`. That keeps `encode` and `decode` round-tripping for inputs like `"zzzz"`; without it, encoding would produce an empty string that is indistinguishable from empty input.

Symbols are Unicode code points, not UTF-16 code units. Iteration uses `for...of`, so astral characters such as emoji count as one symbol rather than two surrogates.

## API

- `buildFrequencyTable(text)` → `Map<string, number>`
- `buildHuffmanTree(frequencies)` → node or `null` for an empty table
- `generateCodes(tree)` → `Map<string, string>`
- `encode(text, codes)` → bit string
- `decode(bits, tree)` → original text

All functions throw on invalid input rather than silently producing bad output. `encode` throws if a symbol is missing from the code map; `decode` throws on invalid bits, a truncated sequence, or a non-empty input with an empty tree.
