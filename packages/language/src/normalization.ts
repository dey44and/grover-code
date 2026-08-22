/** Removes Romanian (and other combining) diacritics without changing punctuation. */
export const foldDiacritics = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}+/gu, '');

/** Canonical comparison form used for case-insensitive Romanian keywords. */
export const normalizeWord = (word: string): string =>
  foldDiacritics(word).toLowerCase().normalize('NFC');

const operatorAliases: Readonly<Record<string, string>> = {
  '←': '<-',
  '⟵': '<-',
  ':=': '<-',
  '≠': '!=',
  '<>': '!=',
  '≤': '<=',
  '≥': '>=',
  '×': '*',
  '÷': '/',
};

/** Returns the canonical ASCII spelling of a supported operator. */
export const normalizeOperator = (operator: string): string =>
  operatorAliases[operator] ?? operator;
