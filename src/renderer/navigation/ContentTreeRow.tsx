import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import AddIcon from '@atlaskit/icon/core/add';
import FolderClosedIcon from '@atlaskit/icon/core/folder-closed';
import NoteIcon from '@atlaskit/icon/core/note';
import MoreIcon from '@atlaskit/icon/core/show-more-horizontal';
import { Inline } from '@atlaskit/primitives';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import {
  ExpandableMenuItem,
  ExpandableMenuItemContent,
  ExpandableMenuItemTrigger,
} from '@atlaskit/side-nav-items/expandable-menu-item';
import { useIntl } from 'react-intl';

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
  const intl = useIntl();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [keyboardFocusWithin, setKeyboardFocusWithin] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  const visualContentRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const visualContent = visualContentRef.current;
    if (!visualContent) return undefined;
    const showForPointer = () => setPointerInside(true);
    const hideForPointer = () => {
      setPointerInside(false);
      const { activeElement } = document;
      setKeyboardFocusWithin(
        activeElement instanceof HTMLElement &&
          visualContent.contains(activeElement) &&
          activeElement.matches(':focus-visible'),
      );
    };
    const showForFocus = () => setKeyboardFocusWithin(true);
    const updateFocusAfterLeaving = (event: FocusEvent) => {
      setKeyboardFocusWithin(
        event.relatedTarget instanceof HTMLElement &&
          visualContent.contains(event.relatedTarget),
      );
    };
    visualContent.addEventListener('pointerenter', showForPointer);
    visualContent.addEventListener('pointerleave', hideForPointer);
    visualContent.addEventListener('focusin', showForFocus);
    visualContent.addEventListener('focusout', updateFocusAfterLeaving);
    return () => {
      visualContent.removeEventListener('pointerenter', showForPointer);
      visualContent.removeEventListener('pointerleave', hideForPointer);
      visualContent.removeEventListener('focusin', showForFocus);
      visualContent.removeEventListener('focusout', updateFocusAfterLeaving);
    };
  }, []);

  const showRowActions =
    pointerInside || keyboardFocusWithin || createMenuOpen || actionMenuOpen;

  const rowActions = (
    <div role="presentation" onClick={(event) => event.stopPropagation()}>
      <Inline alignBlock="center" space="space.025">
        {entry.kind === 'folder' ? (
          <DropdownMenu<HTMLButtonElement>
            shouldRenderToParent
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
              <DropdownItem onClick={onCreateNote}>{intl.formatMessage({ id: 'navigation.newNote' })}</DropdownItem>
              <DropdownItem onClick={onCreateFolder}>
                {intl.formatMessage({ id: 'navigation.newSubfolder' })}
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
            {actions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <DropdownItem
                  key={action.id}
                  elemBefore={
                    <ActionIcon
                      label=""
                      color="currentColor"
                      testId={`content-action-icon-${action.id}`}
                    />
                  }
                  isDisabled={action.isDisabled}
                  onClick={() => action.run()}
                >
                  {action.messageId
                    ? intl.formatMessage({ id: action.messageId })
                    : action.label}
                </DropdownItem>
              );
            })}
          </DropdownItemGroup>
        </DropdownMenu>
      </Inline>
    </div>
  );

  if (entry.kind === 'folder') {
    return (
      <ExpandableMenuItem isExpanded={expanded} onExpansionToggle={onToggle}>
        <ExpandableMenuItemTrigger
          ref={itemRef}
          visualContentRef={visualContentRef}
          elemBefore={
            <FolderClosedIcon
              label=""
              color="currentColor"
              spacing="spacious"
              testId="content-tree-folder-icon"
            />
          }
          isSelected={selected}
          actionsOnHover={showRowActions ? rowActions : undefined}
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
      visualContentRef={visualContentRef}
      elemBefore={
        <NoteIcon
          label=""
          color="currentColor"
          spacing="spacious"
          testId="content-tree-note-icon"
        />
      }
      isSelected={selected}
      actionsOnHover={showRowActions ? rowActions : undefined}
      onClick={onOpen}
    >
      {name}
    </ButtonMenuItem>
  );
}