import {
  asAttachmentId,
  type AdfDocument,
  type AttachmentId,
} from '@notera/domain';

import type { MarkdownResult, PlannedAsset } from './types';

type JsonRecord = Readonly<Record<string, unknown>>;

interface RenderState {
  readonly assetsById: ReadonlyMap<AttachmentId, PlannedAsset>;
  lossyNodeCount: number;
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function children(node: JsonRecord): readonly unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function attrs(node: JsonRecord): JsonRecord {
  return record(node.attrs) ?? {};
}

function escapeInline(value: string): string {
  return value.replace(/([\\`*_[\]<>|])/gu, '\\$1');
}

function renderText(node: JsonRecord): string {
  let value = escapeInline(typeof node.text === 'string' ? node.text : '');
  const marks = Array.isArray(node.marks) ? node.marks : [];
  marks.forEach((candidate) => {
    const mark = record(candidate);
    if (mark === undefined) return;
    if (mark.type === 'code') value = `\`${value}\``;
    if (mark.type === 'strong') value = `**${value}**`;
    if (mark.type === 'em') value = `*${value}*`;
    if (mark.type === 'strike') value = `~~${value}~~`;
    if (mark.type === 'link') {
      const { href } = attrs(mark);
      if (typeof href === 'string' && /^https?:\/\//iu.test(href)) {
        value = `[${value}](${href.replace(/[()\s]/gu, (item) => encodeURIComponent(item))})`;
      }
    }
  });
  return value;
}

function renderChildren(node: JsonRecord, state: RenderState): string {
  return children(node)
    .map((child) => renderNode(child, state))
    .join('');
}

function extension(node: JsonRecord, state: RenderState): string {
  const properties = attrs(node);
  const key = properties.extensionKey;
  const parameters = record(properties.parameters) ?? {};
  if (key === 'math:inline' && typeof parameters.latex === 'string') {
    return `$${parameters.latex}$`;
  }
  if (key === 'math:block' && typeof parameters.latex === 'string') {
    return `$$\n${parameters.latex}\n$$\n\n`;
  }
  if (key === 'mermaid:block' && typeof parameters.source === 'string') {
    return `\`\`\`mermaid\n${parameters.source}\n\`\`\`\n\n`;
  }
  state.lossyNodeCount += 1;
  return `[不支持的内容：${String(node.type)}]\n\n`;
}

function media(node: JsonRecord, state: RenderState): string {
  const properties = attrs(node);
  try {
    const id = asAttachmentId(properties.id);
    const asset = state.assetsById.get(id);
    if (asset === undefined) throw new Error('missing');
    const alt =
      typeof properties.alt === 'string' && properties.alt.length > 0
        ? escapeInline(properties.alt)
        : escapeInline(asset.fileName);
    return asset.mimeType.startsWith('image/')
      ? `![${alt}](${asset.relativePath})\n\n`
      : `[${escapeInline(asset.fileName)}](${asset.relativePath})\n\n`;
  } catch {
    state.lossyNodeCount += 1;
    return '[不支持的内容：media]\n\n';
  }
}

function list(node: JsonRecord, state: RenderState, ordered: boolean): string {
  const start = Number(attrs(node).order) || 1;
  return `${children(node)
    .map((item, index) => {
      const itemNode = record(item);
      const value = itemNode ? renderChildren(itemNode, state).trim() : '';
      const marker = ordered ? `${start + index}.` : '-';
      return `${marker} ${value.replace(/\n/gu, '\n  ')}`;
    })
    .join('\n')}\n\n`;
}

function table(node: JsonRecord, state: RenderState): string {
  const rows = children(node).map((row) => {
    const rowNode = record(row);
    return rowNode === undefined
      ? []
      : children(rowNode).map((cell) => {
          const cellNode = record(cell);
          if (cellNode === undefined) return '';
          const properties = attrs(cellNode);
          if (
            (typeof properties.colspan === 'number' &&
              properties.colspan > 1) ||
            (typeof properties.rowspan === 'number' && properties.rowspan > 1)
          ) {
            state.lossyNodeCount += 1;
          }
          return renderChildren(cellNode, state)
            .trim()
            .replace(/\|/gu, '\\|')
            .replace(/\n+/gu, '<br>');
        });
  });
  if (rows.length === 0) return '';
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const line = (row: readonly string[]) =>
    `| ${Array.from({ length: columns }, (_, index) => row[index] ?? '').join(' | ')} |`;
  return `${line(rows[0])}\n${line(Array(columns).fill('---'))}\n${rows
    .slice(1)
    .map(line)
    .join('\n')}\n\n`;
}

function renderNode(value: unknown, state: RenderState): string {
  const node = record(value);
  if (node === undefined || typeof node.type !== 'string') return '';
  switch (node.type) {
    case 'doc':
      return renderChildren(node, state);
    case 'text':
      return renderText(node);
    case 'paragraph':
      return `${renderChildren(node, state)}\n\n`;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(attrs(node).level) || 1));
      return `${'#'.repeat(level)} ${renderChildren(node, state)}\n\n`;
    }
    case 'hardBreak':
      return '  \n';
    case 'rule':
      return '---\n\n';
    case 'bulletList':
      return list(node, state, false);
    case 'orderedList':
      return list(node, state, true);
    case 'listItem':
      return renderChildren(node, state);
    case 'taskList':
      return `${children(node)
        .map((item) => renderNode(item, state))
        .join('')}\n`;
    case 'taskItem':
      return `- [${attrs(node).state === 'DONE' ? 'x' : ' '}] ${renderChildren(node, state).trim()}\n`;
    case 'blockquote':
      return `${renderChildren(node, state)
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}\n\n`;
    case 'codeBlock':
      return `\`\`\`${typeof attrs(node).language === 'string' ? attrs(node).language : ''}\n${children(
        node,
      )
        .map((child) => (record(child)?.text as string | undefined) ?? '')
        .join('')}\n\`\`\`\n\n`;
    case 'table':
      return table(node, state);
    case 'mediaSingle':
    case 'mediaGroup':
      return renderChildren(node, state);
    case 'media':
      return media(node, state);
    case 'inlineExtension':
    case 'extension':
    case 'bodiedExtension':
      return extension(node, state);
    case 'panel':
    case 'expand':
      return renderChildren(node, state);
    default:
      state.lossyNodeCount += 1;
      return `[不支持的内容：${node.type}]\n\n`;
  }
}

export function renderMarkdown(input: {
  readonly document: AdfDocument;
  readonly assetsById: ReadonlyMap<AttachmentId, PlannedAsset>;
}): MarkdownResult {
  const state: RenderState = {
    assetsById: input.assetsById,
    lossyNodeCount: 0,
  };
  const markdown = `${renderNode(input.document, state).trimEnd()}\n`;
  return Object.freeze({
    bytes: new TextEncoder().encode(markdown),
    lossyNodeCount: state.lossyNodeCount,
  });
}
