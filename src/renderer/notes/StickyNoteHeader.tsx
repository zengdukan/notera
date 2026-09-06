import Breadcrumbs, { BreadcrumbsItem } from '@atlaskit/breadcrumbs';
import { IconButton } from '@atlaskit/button/new';
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
import EditIcon from '@atlaskit/icon/core/edit';
import EyeOpenIcon from '@atlaskit/icon/core/eye-open';
import InlineEditableTextfield from '@atlaskit/inline-edit/inline-editable-textfield';
import RefreshIcon from '@atlaskit/icon/core/refresh';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import StarStarredIcon from '@atlaskit/icon/core/star-starred';
import StarUnstarredIcon from '@atlaskit/icon/core/star-unstarred';
import PageHeader from '@atlaskit/page-header';
import { Box, Inline, xcss } from '@atlaskit/primitives';
import Tooltip from '@atlaskit/tooltip';
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
  zIndex: 'navigation',
  backgroundColor: 'elevation.surface',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width',
  paddingBlock: 'space.0',
  paddingInline: 'space.200',
});
const pageHeaderStyles = xcss({
  marginBlockStart: 'space.negative.300',
  marginBlockEnd: 'space.negative.200',
});
const editTitleStyles = xcss({
  marginBlockStart: 'space.negative.100',
});

const saveDotStyles = xcss({
  width: '8px',
  height: '8px',
  borderRadius: 'radius.full',
});

function NoteHeaderTitle({
  mode,
  title,
  displayTitle,
  autoFocusTitle,
  onTitleChange,
}: {
  readonly mode: 'preview' | 'edit';
  readonly title: string;
  readonly displayTitle: string;
  readonly autoFocusTitle: boolean;
  readonly onTitleChange: (title: string) => void;
}) {
  return (
    <Box xcss={mode === 'edit' ? editTitleStyles : ''}>
      {mode === 'edit' ? (
        <InlineEditableTextfield
          defaultValue={title}
          aria-label="Note title"
          onConfirm={(value) => onTitleChange(value)}
          placeholder={displayTitle}
          hideActionButtons
          startWithEditViewOpen={autoFocusTitle}
          testId="note-title-inline-edit"
        />
      ) : (
        <Heading size="medium" as="h1">
          {displayTitle}
        </Heading>
      )}
    </Box>
  );
}

const saveStatus = Object.freeze({
  clean: {
    messageId: 'notes.header.save.clean',
  },
  dirty: {
    messageId: 'notes.header.save.dirty',
  },
  saving: {
    messageId: 'notes.header.save.saving',
  },
  failed: {
    messageId: 'notes.header.save.failed',
  },
} as const);

const MORE_ACTIONS: readonly {
  readonly id: NoteMoreAction;
  readonly messageId: string;
  readonly icon: typeof AddIcon;
}[] = Object.freeze([
  {
    id: 'create-version',
    messageId: 'history.create.title',
    icon: AddIcon,
  },
  {
    id: 'history',
    messageId: 'history.title',
    icon: ClockIcon,
  },
  {
    id: 'export',
    messageId: 'export.action',
    icon: DownloadIcon,
  },
  { id: 'move', messageId: 'navigation.move', icon: ArrowRightIcon },
  { id: 'copy', messageId: 'navigation.copy', icon: CopyIcon },
  { id: 'trash', messageId: 'navigation.moveToTrash', icon: DeleteIcon },
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
  const displayTitle = title || intl.formatMessage({ id: 'recent.untitled' });
  const save = saveStatus[saveState];
  const saveLabel = intl.formatMessage({ id: save.messageId });
  const favoriteLabel = intl.formatMessage({
    id: isFavorite
      ? 'navigation.removeFromFavorites'
      : 'navigation.addToFavorites',
  });
  const modeLabel = intl.formatMessage({
    id: mode === 'edit' ? 'notes.header.mode.view' : 'notes.header.mode.edit',
  });
  const ModeIcon = mode === 'edit' ? EyeOpenIcon : EditIcon;
  const FavoriteIcon = isFavorite ? StarStarredIcon : StarUnstarredIcon;
  const moreLabel = intl.formatMessage({ id: 'notes.header.more' });

  return (
    <Box as="header" xcss={headerStyles} testId="sticky-note-header">
      <Box xcss={pageHeaderStyles}>
        <PageHeader
          disableTitleStyles
          actions={
            <Inline alignBlock="center" space="space.050" shouldWrap={false}>
              {saveState === 'failed' && onRetry ? (
                <IconButton
                  appearance="subtle"
                  icon={RefreshIcon}
                  label={intl.formatMessage({ id: 'notes.header.retry' })}
                  onClick={onRetry}
                />
              ) : null}
              <IconButton
                appearance="subtle"
                icon={FavoriteIcon}
                label={favoriteLabel}
                onClick={onToggleFavorite}
              />
              <IconButton
                appearance={mode === 'edit' ? 'primary' : 'subtle'}
                icon={ModeIcon}
                label={modeLabel}
                onClick={mode === 'edit' ? onPreview : onEdit}
              />
              <DropdownMenu<HTMLButtonElement>
                shouldRenderToParent
                trigger={({ triggerRef, ...props }) => (
                  <IconButton
                    {...props}
                    ref={triggerRef}
                    appearance="subtle"
                    icon={ShowMoreHorizontalIcon}
                    label={moreLabel}
                  />
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
                        {intl.formatMessage({ id: action.messageId })}
                      </DropdownItem>
                    );
                  })}
                </DropdownItemGroup>
              </DropdownMenu>
            </Inline>
          }
        >
          <Inline
            alignBlock="center"
            space="space.100"
            shouldWrap={false}
            grow="fill"
            testId="sticky-note-header-title-row"
          >
            <Breadcrumbs maxItems={3}>
              {path.map((item) => (
                <BreadcrumbsItem key={item.id} text={item.name} />
              ))}
            </Breadcrumbs>
            <NoteHeaderTitle
              mode={mode}
              title={title}
              displayTitle={displayTitle}
              autoFocusTitle={autoFocusTitle}
              onTitleChange={onTitleChange}
            />
            {mode === 'edit' ? (
              <Tooltip content={saveLabel}>
                <Box
                  as="span"
                  role="status"
                  aria-live="polite"
                  aria-label={saveLabel}
                  testId="note-save-status"
                >
                  <Box
                    xcss={saveDotStyles}
                    backgroundColor={
                      saveState === 'clean'
                        ? 'color.background.success.bold'
                        : 'color.background.danger.bold'
                    }
                    testId={`note-save-status-icon-${saveState}`}
                  />
                </Box>
              </Tooltip>
            ) : null}
          </Inline>
        </PageHeader>
      </Box>
    </Box>
  );
}