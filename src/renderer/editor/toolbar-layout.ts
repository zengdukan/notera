export type ToolbarActionId =
  | 'undo'
  | 'redo'
  | 'text-style'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'text-color'
  | 'more-formatting'
  | 'link'
  | 'bullet-list'
  | 'number-list'
  | 'task-list'
  | 'list'
  | 'table'
  | 'media'
  | 'emoji'
  | 'insert'
  | 'strike'
  | 'inline-code'
  | 'superscript'
  | 'subscript'
  | 'highlight-color'
  | 'align'
  | 'clear-formatting'
  | 'outdent'
  | 'indent'
  | 'date'
  | 'rule'
  | 'layout'
  | 'panel'
  | 'status'
  | 'code-block'
  | 'math'
  | 'mermaid';

export interface ToolbarLayout {
  readonly visible: readonly ToolbarActionId[];
  readonly moreFormatting: readonly ToolbarActionId[];
  readonly list: readonly ToolbarActionId[];
  readonly insert: readonly ToolbarActionId[];
}

const MORE_BASE: readonly ToolbarActionId[] = [
  'strike',
  'inline-code',
  'superscript',
  'subscript',
  'highlight-color',
  'align',
  'clear-formatting',
];
const LIST_BASE: readonly ToolbarActionId[] = ['outdent', 'indent'];
const INSERT_BASE: readonly ToolbarActionId[] = [
  'date',
  'rule',
  'layout',
  'panel',
  'status',
  'code-block',
  'math',
  'mermaid',
];

export function toolbarLayoutForWidth(rawWidth: number): ToolbarLayout {
  const width = Number.isFinite(rawWidth) ? rawWidth : 0;
  const moreFormatting: ToolbarActionId[] = [];
  const list: ToolbarActionId[] = [];
  const insert: ToolbarActionId[] = [];
  const visible: ToolbarActionId[] = ['undo', 'redo', 'text-style'];

  if (width > 410) visible.push('bold');
  else moreFormatting.push('bold');
  if (width > 476) {
    visible.push('italic', 'underline');
  } else {
    moreFormatting.push('italic', 'underline');
  }
  if (width > 768) visible.push('text-color');
  else moreFormatting.push('text-color');
  visible.push('more-formatting');
  if (width > 476) visible.push('link');
  else insert.push('link');
  if (width > 768) {
    visible.push('bullet-list', 'number-list', 'task-list');
  } else {
    list.push('bullet-list', 'number-list', 'task-list');
  }
  visible.push('list');
  if (width > 1024) {
    visible.push('table', 'media', 'emoji');
  } else {
    insert.push('table', 'media', 'emoji');
  }
  visible.push('insert');

  return Object.freeze({
    visible: Object.freeze(visible),
    moreFormatting: Object.freeze([...moreFormatting, ...MORE_BASE]),
    list: Object.freeze([...list, ...LIST_BASE]),
    insert: Object.freeze([...insert, ...INSERT_BASE]),
  });
}
