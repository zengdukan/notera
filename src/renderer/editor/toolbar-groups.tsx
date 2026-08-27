import {
  BoldIcon,
  EmojiIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  MoreItemsIcon,
  PlusIcon,
  RedoIcon,
  TableIcon,
  TaskIcon,
  TextColorIcon,
  TextIcon,
  UnderlineIcon,
  UndoIcon,
  ToolbarButton,
  ToolbarDropdownItem,
  ToolbarDropdownItemSection,
  ToolbarDropdownMenu,
} from '@atlaskit/editor-toolbar';

import type { ToolbarActionId } from './toolbar-layout';
import {
  toolbarActionLabel,
  type EditorToolbarActionId,
  type ToolbarExecutor,
} from './toolbar-actions';

function icon(action: EditorToolbarActionId) {
  switch (action) {
    case 'undo': return <UndoIcon label="" />;
    case 'redo': return <RedoIcon label="" />;
    case 'bold': return <BoldIcon label="" />;
    case 'italic': return <ItalicIcon label="" />;
    case 'underline': return <UnderlineIcon label="" />;
    case 'text-color': return <TextColorIcon label="" />;
    case 'link': return <LinkIcon label="" />;
    case 'bullet-list': return <ListBulletedIcon label="" />;
    case 'number-list': return <ListNumberedIcon label="" />;
    case 'task-list': return <TaskIcon label="" />;
    case 'table': return <TableIcon label="" />;
    case 'media': return <ImageIcon label="" />;
    case 'emoji': return <EmojiIcon label="" />;
    case 'insert': return <PlusIcon label="" />;
    case 'text-style': return <TextIcon label="" />;
    default: return <MoreItemsIcon label="" />;
  }
}

export function ToolbarActionButton({
  action,
  execute,
}: {
  readonly action: ToolbarActionId;
  readonly execute: ToolbarExecutor;
}) {
  return (
    <ToolbarButton
      iconBefore={icon(action)}
      label={toolbarActionLabel(action)}
      onClick={() => execute(action)}
    />
  );
}

export function ToolbarActionMenu({
  trigger,
  actions,
  execute,
}: {
  readonly trigger: 'text-style' | 'more-formatting' | 'list' | 'insert';
  readonly actions: readonly EditorToolbarActionId[];
  readonly execute: ToolbarExecutor;
}) {
  return (
    <ToolbarDropdownMenu
      iconBefore={icon(trigger)}
      label={toolbarActionLabel(trigger)}
      shouldRenderToParent
    >
      <ToolbarDropdownItemSection>
        {actions.map((action) => (
          <ToolbarDropdownItem
            key={action}
            role="menuitem"
            onClick={() => execute(action)}
          >
            {toolbarActionLabel(action)}
          </ToolbarDropdownItem>
        ))}
      </ToolbarDropdownItemSection>
    </ToolbarDropdownMenu>
  );
}
