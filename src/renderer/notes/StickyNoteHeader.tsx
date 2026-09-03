import Breadcrumbs, { BreadcrumbsItem } from '@atlaskit/breadcrumbs';
import Button from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import Heading from '@atlaskit/heading';
import AddIcon from '@atlaskit/icon/core/add';
import ArrowRightIcon from '@atlaskit/icon/core/arrow-right';
import ClockIcon from '@atlaskit/icon/core/clock';
import CopyIcon from '@atlaskit/icon/core/copy';
import DeleteIcon from '@atlaskit/icon/core/delete';
import DownloadIcon from '@atlaskit/icon/core/download';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';
import Textfield from '@atlaskit/textfield';
import { useIntl } from 'react-intl';

import type { SaveState } from './document-session';

export type NoteMoreAction =
  | 'create-version'
  | 'history'
  | 'export'
  | 'move'
  | 'copy'
  | 'trash';

const headerStyles = xcss({
  flexShrink: '0',
  position: 'sticky',
  top: 'space.0',
  zIndex: 'navigation',
  backgroundColor: 'elevation.surface',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width',
  paddingBlock: 'space.100',
  paddingInline: 'space.200',
});
const identityStyles = xcss({ minWidth: '0', flexGrow: 1 });
const titleStyles = xcss({ minWidth: '160px', maxWidth: '560px', flexGrow: 1 });

const saveLabel: Readonly<Record<SaveState, string>> = Object.freeze({
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving',
  failed: 'Not saved',
});

const MORE_ACTIONS: readonly {
  readonly id: NoteMoreAction;
  readonly label: string;
  readonly messageId?: string;
  readonly icon: typeof AddIcon;
}[] = Object.freeze([
  {
    id: 'create-version',
    label: 'Create version',
    messageId: 'history.create.title',
    icon: AddIcon,
  },
  {
    id: 'history',
    label: 'History',
    messageId: 'history.title',
    icon: ClockIcon,
  },
  {
    id: 'export',
    label: 'Export',
    messageId: 'export.action',
    icon: DownloadIcon,
  },
  { id: 'move', label: 'Move', icon: ArrowRightIcon },
  { id: 'copy', label: 'Copy', icon: CopyIcon },
  { id: 'trash', label: 'Move to trash', icon: DeleteIcon },
]);

export function StickyNoteHeader({
  mode,
  title,
  path,
  saveState,
  isFavorite,
  autoFocusTitle = false,
  onTitleChange,
  onToggleFavorite,
  onEdit,
  onPreview,
  onRetry,
  onMore,
}: {
  readonly mode: 'preview' | 'edit';
  readonly title: string;
  readonly path: readonly { readonly id: string; readonly name: string }[];
  readonly saveState: SaveState;
  readonly isFavorite: boolean;
  readonly autoFocusTitle?: boolean;
  readonly onTitleChange: (title: string) => void;
  readonly onToggleFavorite: () => void;
  readonly onEdit: () => void;
  readonly onPreview: () => void;
  readonly onRetry?: () => void;
  readonly onMore: (action: NoteMoreAction) => void;
}) {
  const intl = useIntl();
  const displayTitle = title || 'Untitled';
  return (
    <Box xcss={headerStyles}>
      <Inline
        alignBlock="center"
        space="space.100"
        spread="space-between"
        shouldWrap={false}
      >
        <Inline
          alignBlock="center"
          space="space.100"
          shouldWrap={false}
          xcss={identityStyles}
        >
          <Breadcrumbs label="Note path" maxItems={3} size="small">
            {path.map((item) => (
              <BreadcrumbsItem key={item.id} text={item.name} />
            ))}
          </Breadcrumbs>
          <Box xcss={titleStyles}>
            {mode === 'edit' ? (
              <Textfield
                aria-label="Note title"
                autoFocus={autoFocusTitle}
                appearance="none"
                value={title}
                placeholder="Untitled"
                onChange={(event) => onTitleChange(event.currentTarget.value)}
              />
            ) : (
              <Heading size="medium">{displayTitle}</Heading>
            )}
          </Box>
        </Inline>
        <Inline alignBlock="center" space="space.050" shouldWrap={false}>
          <Text as="span">
            <span aria-live="polite" role="status">
              {saveLabel[saveState]}
            </span>
          </Text>
          {saveState === 'failed' && onRetry ? (
            <Button appearance="subtle" onClick={onRetry}>
              Retry save
            </Button>
          ) : null}
          <Button appearance="subtle" onClick={onToggleFavorite}>
            {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          </Button>
          <Button
            appearance="primary"
            onClick={mode === 'edit' ? onPreview : onEdit}
          >
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </Button>
          <DropdownMenu<HTMLButtonElement>
            trigger={({ triggerRef, ...props }) => (
              <Button {...props} ref={triggerRef} appearance="subtle">
                More
              </Button>
            )}
          >
            <DropdownItemGroup>
              {MORE_ACTIONS.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <DropdownItem
                    key={action.id}
                    elemBefore={
                      <ActionIcon
                        label=""
                        color="currentColor"
                        testId={`note-more-action-icon-${action.id}`}
                      />
                    }
                    onClick={() => onMore(action.id)}
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
      </Inline>
    </Box>
  );
}
