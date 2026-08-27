import { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ToolbarButtonGroup,
} from '@atlaskit/editor-toolbar';
import { Box, xcss } from '@atlaskit/primitives';

import type { ToolbarExecutor } from './toolbar-actions';
import {
  ToolbarActionButton,
  ToolbarActionMenu,
} from './toolbar-groups';
import { toolbarLayoutForWidth } from './toolbar-layout';

const containerStyles = xcss({ width: '100%' });
const toolbarStyles = xcss({
  display: 'flex',
  alignItems: 'center',
  gap: 'space.050',
  minHeight: '32px',
  overflow: 'hidden',
});

const TEXT_STYLES = ['paragraph', 'heading-1', 'heading-2', 'heading-3'] as const;

export function ResponsiveEditorToolbar({
  execute,
  width,
}: {
  readonly execute: ToolbarExecutor;
  readonly width?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    if (width !== undefined || containerRef.current === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setMeasuredWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width]);
  const layout = toolbarLayoutForWidth(width ?? measuredWidth);

  return (
    <Box ref={containerRef} xcss={containerStyles}>
      <ResponsiveContainer breakpointPreset="fullpage">
        <Box as="div" role="toolbar" aria-label="Editor formatting" xcss={toolbarStyles}>
          <ToolbarButtonGroup>
            {layout.visible.map((action) => {
              if (action === 'text-style') {
                return <ToolbarActionMenu key={action} trigger={action} actions={TEXT_STYLES} execute={execute} />;
              }
              if (action === 'more-formatting') {
                return <ToolbarActionMenu key={action} trigger={action} actions={layout.moreFormatting} execute={execute} />;
              }
              if (action === 'list') {
                return <ToolbarActionMenu key={action} trigger={action} actions={layout.list} execute={execute} />;
              }
              if (action === 'insert') {
                return <ToolbarActionMenu key={action} trigger={action} actions={layout.insert} execute={execute} />;
              }
              return <ToolbarActionButton key={action} action={action} execute={execute} />;
            })}
          </ToolbarButtonGroup>
        </Box>
      </ResponsiveContainer>
    </Box>
  );
}
