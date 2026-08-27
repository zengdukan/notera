import type { KeyboardEvent } from 'react';

export function focusAdjacentTreeItem(
  current: HTMLElement,
  direction: 1 | -1,
): void {
  const tree = current.closest('[role="tree"]');
  const items = tree === null
    ? []
    : Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'));
  const index = items.indexOf(current);
  items[index + direction]?.focus();
}

export function handleTreeKeyDown(input: {
  readonly event: KeyboardEvent<HTMLElement>;
  readonly kind: 'folder' | 'note';
  readonly expanded: boolean;
  readonly onToggle: (expanded: boolean) => void;
  readonly onOpen: () => void;
  readonly onMenu: () => void;
}): void {
  const { event } = input;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    focusAdjacentTreeItem(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'ArrowRight' && input.kind === 'folder') {
    event.preventDefault();
    if (!input.expanded) input.onToggle(true);
  } else if (event.key === 'ArrowLeft' && input.kind === 'folder') {
    event.preventDefault();
    if (input.expanded) input.onToggle(false);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    input.onOpen();
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    input.onMenu();
  }
}
