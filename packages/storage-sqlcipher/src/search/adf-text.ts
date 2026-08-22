import type { AdfDocument, JsonValue } from '@notera/domain';

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'tableCell',
  'tableHeader',
  'codeBlock',
]);

type TextFrame =
  | Readonly<{ kind: 'NODE'; value: JsonValue }>
  | Readonly<{ kind: 'SEPARATOR' }>;

function appendSeparator(parts: string[]): void {
  if (parts.length > 0 && parts.at(-1) !== '\n') {
    parts.push('\n');
  }
}

export function extractAdfText(document: AdfDocument): string {
  const parts: string[] = [];
  const stack: TextFrame[] = [
    { kind: 'NODE', value: document as unknown as JsonValue },
  ];
  while (stack.length > 0) {
    const frame = stack.pop() as TextFrame;
    if (frame.kind === 'SEPARATOR') {
      appendSeparator(parts);
      continue;
    }
    const value = frame.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const node = value as Readonly<Record<string, JsonValue>>;
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
      continue;
    }
    if (node.type === 'hardBreak') {
      appendSeparator(parts);
      continue;
    }
    if (typeof node.type === 'string' && BLOCK_TYPES.has(node.type)) {
      stack.push({ kind: 'SEPARATOR' });
    }
    if (Array.isArray(node.content)) {
      for (let index = node.content.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: 'NODE', value: node.content[index] });
      }
    }
  }
  return parts.join('').replace(/\n{2,}/g, '\n').replace(/^\n|\n$/g, '');
}
