import type { ToolbarActionId } from './toolbar-layout';

export type EditorToolbarActionId =
  | ToolbarActionId
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3';

export type ToolbarExecutor = (action: EditorToolbarActionId) => void;

const LABELS: Readonly<Record<EditorToolbarActionId, string>> = Object.freeze({
  undo: 'Undo',
  redo: 'Redo',
  'text-style': 'Text style',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  'text-color': 'Text color',
  'more-formatting': 'More formatting',
  link: 'Link',
  'bullet-list': 'Bulleted list',
  'number-list': 'Numbered list',
  'task-list': 'Task list',
  list: 'Lists',
  table: 'Table',
  media: 'Media',
  emoji: 'Emoji',
  insert: 'Insert',
  strike: 'Strikethrough',
  'inline-code': 'Inline code',
  superscript: 'Superscript',
  subscript: 'Subscript',
  'highlight-color': 'Highlight color',
  align: 'Alignment',
  'clear-formatting': 'Clear formatting',
  outdent: 'Decrease indent',
  indent: 'Increase indent',
  date: 'Date',
  rule: 'Divider',
  layout: 'Layout',
  panel: 'Panel',
  status: 'Status',
  'code-block': 'Code block',
  math: 'Math formula',
  mermaid: 'Mermaid diagram',
  paragraph: 'Normal text',
  'heading-1': 'Heading 1',
  'heading-2': 'Heading 2',
  'heading-3': 'Heading 3',
});

export const toolbarActionLabel = (action: EditorToolbarActionId): string => LABELS[action];
