import Breadcrumbs, { BreadcrumbsItem } from '@atlaskit/breadcrumbs';
import { IconButton } from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import Heading from '@atlaskit/heading';
import AddIcon from '@atlaskit/icon/core/add';
import ArrowRightIcon from '@atlaskit/icon/core/arrow-right';
import CheckMarkIcon from '@atlaskit/icon/core/check-mark';
import ClockIcon from '@atlaskit/icon/core/clock';
import CloudArrowUpIcon from '@atlaskit/icon/core/cloud-arrow-up';
import CopyIcon from '@atlaskit/icon/core/copy';
import DeleteIcon from '@atlaskit/icon/core/delete';
import DownloadIcon from '@atlaskit/icon/core/download';
import EditIcon from '@atlaskit/icon/core/edit';
import EyeOpenIcon from '@atlaskit/icon/core/eye-open';
import RefreshIcon from '@atlaskit/icon/core/refresh';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import StarStarredIcon from '@atlaskit/icon/core/star-starred';
import StarUnstarredIcon from '@atlaskit/icon/core/star-unstarred';
import StatusErrorIcon from '@atlaskit/icon/core/status-error';
import StatusWarningIcon from '@atlaskit/icon/core/status-warning';
import { Box, Inline, xcss } from '@atlaskit/primitives';
import Textfield from '@atlaskit/textfield';
import { token } from '@atlaskit/tokens';
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
const titleStyles = xcss({ minWidth: '160px', maxWidth: '560px', flexGrow: 1 });

const saveStatus = Object.freeze({
  clean: {
    icon: CheckMarkIcon,
    color: token('color.icon.success'),
    messageId: 'notes.header.save.clean',
  },
  dirty: {
    icon: StatusWarningIcon,
    color: token('color.icon.warning'),
    messageId: 'notes.header.save.dirty',
  },
  saving: {
    icon: CloudArrowUpIcon,
    color: token('color.icon.information'),
    messageId: 'notes.header.save.saving',
  },
  failed: {
    icon: StatusErrorIcon,
    color: token('color.icon.danger'),
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
    messageId: 'notes.header.menu.createVersion',
    icon: AddIcon,
  },
  {
    id: 'history',
    messageId: 'notes.header.menu.history',
    icon: ClockIcon,
  },
  {
    id: 'export',
    messageId: 'notes.header.menu.export',
    icon: DownloadIcon,
  },
  { id: 'move', messageId: 'notes.header.menu.move', icon: ArrowRightIcon },
  { id: 'copy', messageId: 'notes.header.menu.copy', icon: CopyIcon },
  { id: 'trash', messageId: 'notes.header.menu.trash', icon: DeleteIcon },
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
  const displayTitle =
    title || intl.formatMessage({ id: 'notes.header.untitled' });
  const save = saveStatus[saveState];
  const saveLabel = intl.formatMessage({ id: save.messageId });
  const SaveIcon = save.icon;
  const favoriteLabel = intl.formatMessage({
    id: isFavorite
      ? 'notes.header.favorite.remove'
      : 'notes.header.favorite.add',
  });
  const modeLabel = intl.formatMessage({
    id: mode === 'edit' ? 'notes.header.mode.view' : 'notes.header.mode.edit',
  });
  const ModeIcon = mode === 'edit' ? EyeOpenIcon : EditIcon;
  const FavoriteIcon = isFavorite ? StarStarredIcon : StarUnstarredIcon;
  const moreLabel = intl.formatMessage({ id: 'notes.header.more' });

  return (
    <Box as="header" xcss={headerStyles}>
      <Inline alignBlock="center" space="space.100" shouldWrap={false}>
        <Inline
          alignBlock="center"
          space="space.100"
          shouldWrap={false}
          grow="fill"
        >
          <Breadcrumbs
            label={intl.formatMessage({ id: 'notes.header.pathLabel' })}
            maxItems={3}
          >
            {path.map((item) => (
              <BreadcrumbsItem key={item.id} text={item.name} />
            ))}
          </Breadcrumbs>
          <Box xcss={titleStyles}>
            {mode === 'edit' ? (
              <Textfield
                aria-label={intl.formatMessage({
                  id: 'notes.header.titleLabel',
                })}
                autoFocus={autoFocusTitle}
                appearance="none"
                value={title}
                onChange={(event) => onTitleChange(event.currentTarget.value)}
              />
            ) : (
              <Heading size="medium">{displayTitle}</Heading>
            )}
          </Box>
          <Tooltip content={saveLabel}>
            <Box
              as="span"
              role="status"
              aria-live="polite"
              aria-label={saveLabel}
              testId="note-save-status"
            >
              <SaveIcon
                label=""
                color={save.color}
                testId={`note-save-status-icon-${saveState}`}
              />
            </Box>
          </Tooltip>
        </Inline>
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
      </Inline>
    </Box>
  );
}
