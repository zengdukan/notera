import type { ReactNode } from 'react';

import type { ContentEntry } from './content-controller';
import type { ContentAction } from './content-actions';
import { ContentTreeRow } from './ContentTreeRow';

export interface ContentTreeNode {
  readonly entry: ContentEntry;
  readonly children?: readonly ContentTreeNode[];
}

export function ContentTree({
  nodes,
  expandedIds,
  selected,
  onOpen,
  onToggle,
  onCreateNote,
  onCreateFolder,
  getActions,
}: {
  readonly nodes: readonly ContentTreeNode[];
  readonly expandedIds: ReadonlySet<string>;
  readonly selected?: { readonly kind: 'folder' | 'note'; readonly id: string };
  readonly onOpen: (entry: ContentEntry) => void;
  readonly onToggle: (folderId: string, expanded: boolean) => void;
  readonly onCreateNote: (
    folder: Extract<ContentEntry, { kind: 'folder' }>,
  ) => void;
  readonly onCreateFolder: (
    folder: Extract<ContentEntry, { kind: 'folder' }>,
  ) => void;
  readonly getActions: (entry: ContentEntry) => readonly ContentAction[];
}) {
  let first = true;
  const rows = (values: readonly ContentTreeNode[], level: number): ReactNode =>
    values.map((node) => {
      const expanded =
        node.entry.kind === 'folder' && expandedIds.has(node.entry.id);
      const tabIndex =
        selected?.id === node.entry.id || (selected === undefined && first)
          ? 0
          : -1;
      first = false;
      return (
        <div key={`${node.entry.kind}:${node.entry.id}`} role="none">
          <ContentTreeRow
            entry={node.entry}
            level={level}
            expanded={expanded}
            selected={
              selected?.kind === node.entry.kind &&
              selected.id === node.entry.id
            }
            tabIndex={tabIndex}
            onOpen={() => onOpen(node.entry)}
            onToggle={(next) => {
              if (node.entry.kind === 'folder') onToggle(node.entry.id, next);
            }}
            onCreateNote={() => {
              if (node.entry.kind === 'folder') onCreateNote(node.entry);
            }}
            onCreateFolder={() => {
              if (node.entry.kind === 'folder') onCreateFolder(node.entry);
            }}
            actions={getActions(node.entry)}
          />
          {expanded && node.children ? (
            <div role="group">{rows(node.children, level + 1)}</div>
          ) : null}
        </div>
      );
    });

  return (
    <div role="tree" aria-label="Content">
      {rows(nodes, 1)}
    </div>
  );
}
