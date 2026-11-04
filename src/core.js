/**
 * Huffman coding: variable-length prefix codes derived from symbol frequencies.
 *
 * Design notes:
 * - Frequencies are counted with a Map so that any string keys work, including
 *   characters outside the BMP when iterating with `for...of` (code points).
 * - The tree is represented as plain objects. Leaves carry a `symbol`; internal
 *   nodes do not. This makes serialization and debugging straightforward.
 * - Ties in the priority queue are broken by insertion order to keep the output
 *   deterministic. Without a stable tie-break, two runs over the same input could
 *   produce different (but equally valid) codebooks, which makes tests flaky.
 * - The resulting code is a prefix code: no codeword is a prefix of another.
 *   The decoder walks the tree bit by bit, which is O(n) in the encoded length.
 */

/**
 * Build a frequency table mapping each symbol to its count.
 *
 * Symbols are Unicode code points, not UTF-16 code units, so astral characters
 * such as emoji are counted as a single symbol. This matches what a user typing
 * text would expect and avoids splitting surrogate pairs.
 *
 * @param {string} text
 * @returns {Map<string, number>}
 */
export function buildFrequencyTable(text) {
  if (typeof text !== 'string') {
    throw new TypeError('buildFrequencyTable expects a string');
  }
  const table = new Map();
  for (const ch of text) {
    table.set(ch, (table.get(ch) ?? 0) + 1);
  }
  return table;
}

/**
 * A node in the Huffman tree.
 * @typedef {{ symbol?: string, weight: number, left?: Node, right?: Node }} Node
 */

/**
 * Minimal binary min-heap keyed on `weight`. We keep insertion order via a
 * monotonically increasing sequence number so that equal weights pop in the
 * order they were pushed. That determinism is the whole reason this class
 * exists instead of sorting an array repeatedly.
 */
class MinHeap {
  constructor() {
    /** @type {Array<{ weight: number, seq: number, node: Node }>} */
    this.items = [];
    this.seq = 0;
  }

  get size() {
    return this.items.length;
  }

  /**
   * @param {Node} node
   */
  push(node) {
    const entry = { weight: node.weight, seq: this.seq++, node };
    this.items.push(entry);
    this._bubbleUp(this.items.length - 1);
  }

  /**
   * @returns {Node}
   */
  pop() {
    if (this.items.length === 0) {
      throw new Error('pop from empty heap');
    }
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._sinkDown(0);
    }
    return top.node;
  }

  _less(a, b) {
    if (a.weight !== b.weight) return a.weight < b.weight;
    return a.seq < b.seq;
  }

  _bubbleUp(i) {
    const items = this.items;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(items[i], items[parent])) {
        [items[i], items[parent]] = [items[parent], items[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  _sinkDown(i) {
    const items = this.items;
    const n = items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this._less(items[left], items[smallest])) smallest = left;
      if (right < n && this._less(items[right], items[smallest])) smallest = right;
      if (smallest === i) break;
      [items[i], items[smallest]] = [items[smallest], items[i]];
      i = smallest;
    }
  }
}

/**
 * Build a Huffman tree from a frequency table.
 *
 * Returns `null` for an empty table. For a single distinct symbol the tree is a
 * bare leaf; `generateCodes` handles that case by assigning the one-bit code
 * "0", because a zero-bit code cannot be decoded unambiguously.
 *
 * @param {Map<string, number>} frequencies
 * @returns {Node | null}
 */
export function buildHuffmanTree(frequencies) {
  if (!(frequencies instanceof Map)) {
    throw new TypeError('buildHuffmanTree expects a Map');
  }
  if (frequencies.size === 0) {
    return null;
  }
  const heap = new MinHeap();
  for (const [symbol, weight] of frequencies) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`frequency for ${JSON.stringify(symbol)} must be a positive finite number`);
    }
    heap.push({ symbol, weight });
  }
  while (heap.size > 1) {
    const left = heap.pop();
    const right = heap.pop();
    heap.push({ weight: left.weight + right.weight, left, right });
  }
  return heap.pop();
}

/**
 * Walk the tree and assign a bit string to each symbol.
 *
 * @param {Node | null} tree
 * @returns {Map<string, string>}
 */
export function generateCodes(tree) {
  /** @type {Map<string, string>} */
  const codes = new Map();
  if (tree === null) {
    return codes;
  }
  if (tree.symbol !== undefined) {
    // A lone symbol still needs a code, otherwise encoding would produce an
    // empty string and decoding could not tell it apart from empty input.
    codes.set(tree.symbol, '0');
    return codes;
  }
  /**
   * @param {Node} node
   * @param {string} prefix
   */
  const walk = (node, prefix) => {
    if (node.symbol !== undefined) {
      codes.set(node.symbol, prefix);
      return;
    }
    if (node.left) walk(node.left, prefix + '0');
    if (node.right) walk(node.right, prefix + '1');
  };
  walk(tree, '');
  return codes;
}

/**
 * Encode a string using the supplied code map.
 *
 * Throws when a symbol has no code, rather than silently dropping it: a silent
 * drop would corrupt the round trip and be hard to notice.
 *
 * @param {string} text
 * @param {Map<string, string>} codes
 * @returns {string} a string of '0' and '1' characters
 */
export function encode(text, codes) {
  if (typeof text !== 'string') {
    throw new TypeError('encode expects a string');
  }
  if (!(codes instanceof Map)) {
    throw new TypeError('encode expects a Map of codes');
  }
  let out = '';
  for (const ch of text) {
    const code = codes.get(ch);
    if (code === undefined) {
      throw new Error(`no code for symbol ${JSON.stringify(ch)}`);
    }
    out += code;
  }
  return out;
}

/**
 * Decode a bit string using the supplied tree.
 *
 * @param {string} bits
 * @param {Node | null} tree
 * @returns {string}
 */
export function decode(bits, tree) {
  if (typeof bits !== 'string') {
    throw new TypeError('decode expects a string of bits');
  }
  if (tree === null) {
    if (bits.length === 0) return '';
    throw new Error('cannot decode non-empty bits with an empty tree');
  }
  if (tree.symbol !== undefined) {
    // Single-symbol tree: every bit must be the assigned '0'.
    for (const bit of bits) {
      if (bit !== '0') {
        throw new Error(`invalid bit ${JSON.stringify(bit)} for single-symbol tree`);
      }
    }
    return tree.symbol.repeat(bits.length);
  }
  let out = '';
  let node = tree;
  for (const bit of bits) {
    if (bit === '0') {
      if (!node.left) throw new Error('invalid bit sequence: no left child');
      node = node.left;
    } else if (bit === '1') {
      if (!node.right) throw new Error('invalid bit sequence: no right child');
      node = node.right;
    } else {
      throw new Error(`invalid bit character ${JSON.stringify(bit)}`);
    }
    if (node.symbol !== undefined) {
      out += node.symbol;
      node = tree;
    }
  }
  if (node !== tree) {
    throw new Error('truncated bit sequence: ended mid-codeword');
  }
  return out;
}
