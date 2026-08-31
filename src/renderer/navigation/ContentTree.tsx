import type { ReactNode } from 'react';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';

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
  const rows = (values: readonly ContentTreeNode[]): ReactNode =>
    values.map((node) => {
      const expanded =
        node.entry.kind === 'folder' && expandedIds.has(node.entry.id);
      return (
        <ContentTreeRow
          key={`${node.entry.kind}:${node.entry.id}`}
          entry={node.entry}
          expanded={expanded}
          selected={
            selected?.kind === node.entry.kind && selected.id === node.entry.id
          }
          onOpen={() => {
            if (node.entry.kind === 'note') onOpen(node.entry);
          }}
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
        >
          {expanded && node.children ? rows(node.children) : null}
        </ContentTreeRow>
      );
    });

  return <MenuList>{rows(nodes)}</MenuList>;
}
