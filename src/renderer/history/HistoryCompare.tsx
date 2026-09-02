import { Box, Stack, Text, xcss } from '@atlaskit/primitives';
import { media } from '@atlaskit/primitives/responsive';
import { useIntl } from 'react-intl';

import { RendererSurface } from '../editor/RendererSurface';
import type { RequestData } from '../platform/notera-client';

export function HistoryCompare({
  noteId,
  comparison,
}: {
  readonly noteId: string;
  readonly comparison: RequestData<'history.compare'>;
}) {
  const intl = useIntl();
  return (
    <Box
      as="section"
      aria-label={intl.formatMessage({ id: 'history.compare.region' })}
      xcss={compareStyles}
    >
      <Box
        as="article"
        aria-label={intl.formatMessage({ id: 'history.compare.current' })}
        xcss={[comparePanelStyles, currentPanelStyles]}
      >
        <Stack space="space.100">
          <Text weight="semibold">
            {intl.formatMessage({ id: 'history.compare.current' })}
          </Text>
          <Text>
            {comparison.left.title ||
              intl.formatMessage({ id: 'history.untitled' })}
          </Text>
          <RendererSurface
            noteId={noteId}
            document={comparison.left.document}
          />
        </Stack>
      </Box>
      <Box
        as="article"
        aria-label={intl.formatMessage({ id: 'history.compare.selected' })}
        xcss={[comparePanelStyles, selectedPanelStyles]}
      >
        <Stack space="space.100">
          <Text weight="semibold">
            {intl.formatMessage({ id: 'history.compare.selected' })}
          </Text>
          <Text>
            {comparison.right.title ||
              intl.formatMessage({ id: 'history.untitled' })}
          </Text>
          <RendererSurface
            noteId={noteId}
            document={comparison.right.document}
          />
        </Stack>
      </Box>
    </Box>
  );
}

const compareStyles = xcss({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  minHeight: '0',
  flexGrow: 1,
  [media.above.sm]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
});
const comparePanelStyles = xcss({
  minWidth: '0',
  overflow: 'auto',
  paddingBlock: 'space.200',
  [media.above.sm]: {
    paddingBlock: 'space.0',
    paddingInline: 'space.300',
  },
});
const currentPanelStyles = xcss({
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width',
  [media.above.sm]: {
    borderBlockEndWidth: '0',
    borderInlineEndColor: 'color.border',
    borderInlineEndStyle: 'solid',
    borderInlineEndWidth: 'border.width',
    paddingInlineStart: 'space.0',
  },
});
const selectedPanelStyles = xcss({
  [media.above.sm]: { paddingInlineEnd: 'space.0' },
});
