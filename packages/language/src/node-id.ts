import type { NodeId, SourceSpan } from './ast.js';

/** Deterministic 64-bit FNV-1a, sufficient for local syntax-tree identity. */
const hashText = (text: string): string => {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(36);
};

export class NodeIdFactory {
  readonly #sourceFingerprint: string;
  readonly #issued = new Map<string, number>();

  public constructor(source: string) {
    // Hash once: hashing every growing source fragment makes a flat binary
    // expression quadratic in the number of operators.
    this.#sourceFingerprint = hashText(source);
  }

  public create(kind: string, span: SourceSpan): NodeId {
    const fingerprint = [
      this.#sourceFingerprint,
      kind,
      String(span.start.offset),
      String(span.end.offset),
    ].join('\u0000');
    const base = `${kind.toLowerCase()}:${hashText(fingerprint)}`;
    const occurrence = this.#issued.get(base) ?? 0;
    this.#issued.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}:${occurrence}`;
  }
}
