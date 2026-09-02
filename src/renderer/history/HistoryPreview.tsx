import Spinner from '@atlaskit/spinner';
import { Box, Stack, Text, xcss } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

import { RendererSurface } from '../editor/RendererSurface';
import type { HistorySnapshot } from './history-queries';

export function HistoryPreview({
  noteId,
  snapshot,
  loading,
}: {
  readonly noteId: string;
  readonly snapshot?: HistorySnapshot;
  readonly loading: boolean;
}) {
  const intl = useIntl();
  if (loading)
    return (
      <Spinner label={intl.formatMessage({ id: 'history.preview.loading' })} />
    );
  if (!snapshot)
    return <Text>{intl.formatMessage({ id: 'history.preview.select' })}</Text>;
  return (
    <Box xcss={documentStyles}>
      <Stack space="space.150">
        <Text weight="semibold">
          {snapshot.title || intl.formatMessage({ id: 'history.untitled' })}
        </Text>
        <RendererSurface noteId={noteId} document={snapshot.document} />
      </Stack>
    </Box>
  );
}

const documentStyles = xcss({ minHeight: '280px' });
