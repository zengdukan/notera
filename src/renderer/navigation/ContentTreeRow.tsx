import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import AddIcon from '@atlaskit/icon/core/add';
import MoreIcon from '@atlaskit/icon/core/show-more-horizontal';
import { Inline } from '@atlaskit/primitives';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import {
  ExpandableMenuItem,
  ExpandableMenuItemContent,
  ExpandableMenuItemTrigger,
} from '@atlaskit/side-nav-items/expandable-menu-item';

import type { ContentEntry } from './content-controller';
import type { ContentAction } from './content-actions';

export function ContentTreeRow({
  entry,
  expanded,
  selected,
  onOpen,
  onToggle,
  onCreateNote,
  onCreateFolder,
  actions,
  children,
}: {
  readonly entry: ContentEntry;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly onOpen: () => void;
  readonly onToggle: (expanded: boolean) => void;
  readonly onCreateNote: () => void;
  readonly onCreateFolder: () => void;
  readonly actions: readonly ContentAction[];
  readonly children?: ReactNode;
}) {
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  const name = entry.kind === 'folder' ? entry.name : entry.title || 'Untitled';

  useEffect(() => {
    const item = itemRef.current;
    if (!item) return undefined;
    const openContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setActionMenuOpen(true);
    };
    const openKeyboardMenu = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key !== 'F10') return;
      event.preventDefault();
      setActionMenuOpen(true);
    };
    item.addEventListener('contextmenu', openContextMenu);
    item.addEventListener('keydown', openKeyboardMenu);
    return () => {
      item.removeEventListener('contextmenu', openContextMenu);
      item.removeEventListener('keydown', openKeyboardMenu);
    };
  }, []);

  const rowActions = (
    <Inline alignBlock="center" space="space.025">
      {entry.kind === 'folder' ? (
        <DropdownMenu<HTMLButtonElement>
          shouldRenderToParent
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
            <DropdownItem
              onClick={(event) => {
                event.stopPropagation();
                onCreateNote();
              }}
            >
              New note
            </DropdownItem>
            <DropdownItem
              onClick={(event) => {
                event.stopPropagation();
                onCreateFolder();
              }}
            >
              New subfolder
            </DropdownItem>
          </DropdownItemGroup>
        </DropdownMenu>
      ) : null}
      <DropdownMenu<HTMLButtonElement>
        shouldRenderToParent
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
  );

  if (entry.kind === 'folder') {
    return (
      <ExpandableMenuItem isExpanded={expanded} onExpansionToggle={onToggle}>
        <ExpandableMenuItemTrigger
          ref={itemRef}
          isSelected={selected}
          actionsOnHover={rowActions}
          onClick={onOpen}
        >
          {name}
        </ExpandableMenuItemTrigger>
        <ExpandableMenuItemContent>{children}</ExpandableMenuItemContent>
      </ExpandableMenuItem>
    );
  }

  return (
    <ButtonMenuItem
      ref={itemRef}
      isSelected={selected}
      actionsOnHover={rowActions}
      onClick={onOpen}
    >
      {name}
    </ButtonMenuItem>
  );
}
