import { useState, type FocusEvent } from 'react';
import { IconButton } from '@atlaskit/button/new';
import DropdownMenu, { DropdownItem, DropdownItemGroup } from '@atlaskit/dropdown-menu';
import AddIcon from '@atlaskit/icon/core/add';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import MoreIcon from '@atlaskit/icon/core/show-more-horizontal';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';

import type { ContentEntry } from './content-controller';
import type { ContentAction } from './content-actions';
import { handleTreeKeyDown } from './tree-keyboard';

const rowStyles = xcss({
  minWidth: '0px',
  paddingInline: 'space.050',
  borderRadius: 'radius.small',
  ':hover': { backgroundColor: 'color.background.neutral.subtle.hovered' },
  ':focus': { outlineColor: 'color.border.focused', outlineStyle: 'solid', outlineWidth: 'border.width.focused' },
});

export function ContentTreeRow({
  entry,
  level,
  expanded,
  selected,
  tabIndex,
  onOpen,
  onToggle,
  onCreateNote,
  onCreateFolder,
  actions,
}: {
  readonly entry: ContentEntry;
  readonly level: number;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly tabIndex: number;
  readonly onOpen: () => void;
  readonly onToggle: (expanded: boolean) => void;
  readonly onCreateNote: () => void;
  readonly onCreateFolder: () => void;
  readonly actions: readonly ContentAction[];
}) {
  const [active, setActive] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const name = entry.kind === 'folder' ? entry.name : entry.title || 'Untitled';
  const menu = () => {
    setActive(true);
    setActionMenuOpen(true);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActive(false);
  };
  const showButtons = active || createMenuOpen || actionMenuOpen;

  return (
    <Box
      as="div"
      role="treeitem"
      aria-level={level}
      aria-selected={selected}
      aria-expanded={entry.kind === 'folder' ? expanded : undefined}
      tabIndex={tabIndex}
      xcss={rowStyles}
      onMouseEnter={() => setActive(true)}
      onFocus={() => setActive(true)}
      onBlur={onBlur}
      onClick={() => {
        onOpen();
        if (entry.kind === 'folder') onToggle(!expanded);
      }}
      onDoubleClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        menu();
      }}
      onKeyDown={(event) =>
        handleTreeKeyDown({
          event,
          kind: entry.kind,
          expanded,
          onToggle,
          onOpen,
          onMenu: menu,
        })
      }
    >
      <Inline alignBlock="center" spread="space-between" space="space.050">
        <Inline alignBlock="center" space="space.050">
          {entry.kind === 'folder' ? (
            expanded ? <ChevronDownIcon label="" /> : <ChevronRightIcon label="" />
          ) : null}
          <Text maxLines={1}>{name}</Text>
        </Inline>
        {showButtons ? (
          <Inline alignBlock="center" space="space.025">
            {entry.kind === 'folder' ? (
              <DropdownMenu<HTMLButtonElement>
                isOpen={createMenuOpen}
                onOpenChange={({ isOpen }) => setCreateMenuOpen(isOpen)}
                placement="bottom-end"
                trigger={({ triggerRef, onClick, ...props }) => (
                  <IconButton
                    {...props}
                    ref={triggerRef}
                    label={`Create in ${name}`}
                    icon={AddIcon}
                    appearance="subtle"
                    spacing="compact"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClick?.(event);
                    }}
                  />
                )}
              >
                <DropdownItemGroup>
                  <DropdownItem onClick={(event) => {
                    event.stopPropagation();
                    onCreateNote();
                  }}>New note</DropdownItem>
                  <DropdownItem onClick={(event) => {
                    event.stopPropagation();
                    onCreateFolder();
                  }}>New subfolder</DropdownItem>
                </DropdownItemGroup>
              </DropdownMenu>
            ) : null}
            <DropdownMenu<HTMLButtonElement>
              isOpen={actionMenuOpen}
              onOpenChange={({ isOpen }) => setActionMenuOpen(isOpen)}
              placement="bottom-end"
              trigger={({ triggerRef, onClick, ...props }) => (
                <IconButton
                  {...props}
                  ref={triggerRef}
                  label={`More actions for ${name}`}
                  icon={MoreIcon}
                  appearance="subtle"
                  spacing="compact"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClick?.(event);
                  }}
                />
              )}
            >
              <DropdownItemGroup>
                {actions.map((action) => (
                  <DropdownItem
                    key={action.id}
                    isDisabled={action.isDisabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      action.run();
                    }}
                  >
                    {action.label}
                  </DropdownItem>
                ))}
              </DropdownItemGroup>
            </DropdownMenu>
          </Inline>
        ) : null}
      </Inline>
    </Box>
  );
}
