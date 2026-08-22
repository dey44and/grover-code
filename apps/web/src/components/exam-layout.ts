import { TokenKind, type Program, type Statement, type Token } from '@grover/language';

type BlockKind = 'if' | 'while' | 'repeat' | 'for';

export interface StructuralBlock {
  readonly closeLine: number;
  readonly elseLine?: number;
  readonly id: string;
  readonly kind: BlockKind;
  readonly openLine: number;
  readonly parentId?: string;
}

export interface ExamLayoutLine {
  readonly blockId?: string;
  readonly code: string;
  readonly depth: number;
  readonly end: number;
  readonly index: number;
  readonly kind: 'blank' | 'close' | 'open' | 'statement';
  readonly repeatClose: boolean;
  readonly start: number;
}

export interface ExamLayout {
  readonly blocks: readonly StructuralBlock[];
  readonly boundaries: ReadonlySet<number>;
  readonly lines: readonly ExamLayoutLine[];
}

const blockKind = (statement: Statement): BlockKind | undefined => {
  switch (statement.kind) {
    case 'IfStatement':
      return 'if';
    case 'WhileStatement':
      return 'while';
    case 'RepeatUntilStatement':
      return 'repeat';
    case 'ForStatement':
      return 'for';
    default:
      return undefined;
  }
};

const childStatements = (statement: Statement): readonly Statement[] => {
  switch (statement.kind) {
    case 'IfStatement':
      return [...statement.thenBranch, ...statement.elseBranch];
    case 'WhileStatement':
    case 'RepeatUntilStatement':
    case 'ForStatement':
      return statement.body;
    default:
      return [];
  }
};

const findElseLine = (statement: Statement, tokens: readonly Token[]): number | undefined => {
  if (statement.kind !== 'IfStatement') return undefined;
  const lowerBound =
    statement.thenBranch.at(-1)?.span.end.offset ?? statement.condition.span.end.offset;
  const upperBound = statement.elseBranch[0]?.span.start.offset ?? statement.span.end.offset;
  const token = tokens.find(
    (candidate) =>
      candidate.kind === TokenKind.Altfel &&
      candidate.span.start.offset >= lowerBound &&
      candidate.span.end.offset <= upperBound,
  );
  return token === undefined ? undefined : token.span.start.line - 1;
};

const collectStructure = (
  statements: readonly Statement[],
  tokens: readonly Token[],
  blocks: StructuralBlock[],
  boundaries: Set<number>,
  parentId?: string,
): void => {
  for (const statement of statements) {
    boundaries.add(statement.span.start.line - 1);
    boundaries.add(statement.span.end.line);

    const kind = blockKind(statement);
    if (kind === undefined) continue;
    const alternativeLine = findElseLine(statement, tokens);
    const block: StructuralBlock = {
      closeLine: statement.span.end.line - 1,
      id: statement.id,
      kind,
      openLine: statement.span.start.line - 1,
      ...(parentId === undefined ? {} : { parentId }),
      ...(alternativeLine === undefined ? {} : { elseLine: alternativeLine }),
    };
    blocks.push(block);
    boundaries.add(block.openLine + 1);
    boundaries.add(block.closeLine);
    collectStructure(childStatements(statement), tokens, blocks, boundaries, block.id);
  }
};

const ancestorDepth = (
  block: StructuralBlock,
  blocksById: ReadonlyMap<string, StructuralBlock>,
): number => {
  let depth = 0;
  let parentId = block.parentId;
  while (parentId !== undefined) {
    const parent = blocksById.get(parentId);
    if (parent === undefined) break;
    depth += 1;
    parentId = parent.parentId;
  }
  return depth;
};

/** Builds the paper-style projection from parser-owned semantic block spans. */
export const buildExamLayout = (
  source: string,
  program: Program,
  tokens: readonly Token[],
): ExamLayout => {
  const blocks: StructuralBlock[] = [];
  const boundaries = new Set<number>([0]);
  collectStructure(program.body, tokens, blocks, boundaries);

  const rawLines = source.split('\n');
  boundaries.add(rawLines.length);
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const lines: ExamLayoutLine[] = [];
  let offset = 0;

  rawLines.forEach((raw, index) => {
    const start = offset;
    const end = offset + raw.length;
    offset = end + 1;
    const opening = blocks
      .filter((block) => block.openLine === index)
      .sort((left, right) => ancestorDepth(left, blocksById) - ancestorDepth(right, blocksById))
      .at(-1);
    const closing = blocks
      .filter((block) => block.closeLine === index && block.openLine !== index)
      .sort((left, right) => ancestorDepth(right, blocksById) - ancestorDepth(left, blocksById))
      .at(-1);
    const selected = closing ?? opening;
    const kind = closing === undefined ? (opening === undefined ? 'statement' : 'open') : 'close';
    const depth =
      selected === undefined
        ? blocks.filter((block) => block.openLine < index && block.closeLine > index).length
        : ancestorDepth(selected, blocksById);
    const repeatClose = closing?.kind === 'repeat';
    const trimmed = raw.trim();

    lines.push({
      ...(selected === undefined ? {} : { blockId: selected.id }),
      code: closing === undefined || repeatClose ? trimmed : '',
      depth,
      end,
      index,
      kind: trimmed.length === 0 && selected === undefined ? 'blank' : kind,
      repeatClose,
      start,
    });
  });

  return { blocks, boundaries, lines };
};

export const validBoundaries = (
  selected: StructuralBlock,
  blocks: readonly StructuralBlock[],
  lineCount: number,
  statementBoundaries: ReadonlySet<number>,
): readonly number[] => {
  const parent =
    selected.parentId === undefined
      ? undefined
      : blocks.find((block) => block.id === selected.parentId);
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const ancestorIds = new Set<string>();
  let ancestorId = selected.parentId;
  while (ancestorId !== undefined) {
    ancestorIds.add(ancestorId);
    ancestorId = blocksById.get(ancestorId)?.parentId;
  }
  const minimum = Math.max(selected.openLine + 1, (selected.elseLine ?? selected.openLine) + 1);
  const maximum = parent?.closeLine ?? lineCount;
  const nestedBlocks = blocks.filter(
    (block) => block.id !== selected.id && !ancestorIds.has(block.id),
  );

  const candidates: number[] = [];
  for (const boundary of [...statementBoundaries].sort((left, right) => left - right)) {
    if (boundary < minimum || boundary > maximum) continue;
    const cutsBlock = nestedBlocks.some(
      (block) => boundary > block.openLine && boundary <= block.closeLine,
    );
    if (!cutsBlock) candidates.push(boundary);
  }
  return candidates;
};

export const moveCloserLine = (
  source: string,
  closeLine: number,
  targetBoundary: number,
): string => {
  const lines = source.split('\n');
  const [closer] = lines.splice(closeLine, 1);
  if (closer === undefined) return source;
  const adjustedTarget = targetBoundary > closeLine ? targetBoundary - 1 : targetBoundary;
  lines.splice(Math.max(0, Math.min(adjustedTarget, lines.length)), 0, closer);
  return lines.join('\n');
};
