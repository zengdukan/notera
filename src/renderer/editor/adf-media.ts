import type { AdfDocument } from '../../shared/ipc/adf';

export function collectAdfMediaIds(document: AdfDocument): readonly string[] {
  const ids = new Set<string>();
  const stack: unknown[] = [document];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (value === null || typeof value !== 'object') continue;
    const node = value as Record<string, unknown>;
    if (node.type === 'media' && node.attrs !== null && typeof node.attrs === 'object') {
      const id = (node.attrs as Record<string, unknown>).id;
      if (typeof id === 'string') ids.add(id);
    }
    stack.push(...Object.values(node));
  }
  return Object.freeze([...ids]);
}
