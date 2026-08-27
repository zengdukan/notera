import { css } from '@emotion/react';
import { token } from '@atlaskit/tokens';

export const mathBaseStyles = css({
  boxSizing: 'border-box',
  maxWidth: '100%',
  borderRadius: token('radius.xsmall', '2px'),
  color: token('color.text', '#172b4d'),
  transition: 'background-color 120ms ease',

  '&:hover': {
    backgroundColor: token(
      'color.background.neutral.subtle.hovered',
      '#f1f2f4',
    ),
  },

  '&:focus-visible': {
    outline: `2px solid ${token('color.border.focused', '#0c66e4')}`,
    outlineOffset: token('space.025', '2px'),
  },
});

export const inlineMathStyles = css({
  display: 'inline-block',
  paddingInline: token('space.025', '2px'),
  lineHeight: 1,
  verticalAlign: 'baseline',

  '& .katex': {
    fontSize: '1em',
  },
});

export const blockMathStyles = css({
  display: 'block',
  width: '100%',
  marginBlock: token('space.150', '12px'),
  paddingBlock: token('space.150', '12px'),
  paddingInline: token('space.200', '16px'),
  overflowX: 'auto',
  textAlign: 'center',

  '& .katex-display': {
    margin: 0,
  },
});

export const invalidMathStyles = css({
  color: token('color.text.danger', '#ae2e24'),
  fontFamily: token('font.family.code'),
  whiteSpace: 'pre-wrap',
});

export const dialogFieldStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.075', '6px'),
});

export const dialogLabelStyles = css({
  color: token('color.text', '#172b4d'),
  font: token('font.body.small'),
  fontWeight: token('font.weight.semibold'),
});

export const dialogHelpStyles = css({
  color: token('color.text.subtle', '#626f86'),
  font: token('font.body.small'),
});

export const dialogErrorStyles = css({
  color: token('color.text.danger', '#ae2e24'),
  font: token('font.body.small'),
});

export const dialogPreviewSectionStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.075', '6px'),
  marginTop: token('space.200', '16px'),
});

export const dialogPreviewStyles = css({
  minHeight: '104px',
  padding: token('space.150', '12px'),
  overflowX: 'auto',
  border: `1px solid ${token('color.border', '#dcdfe4')}`,
  borderRadius: token('radius.medium', '6px'),
  backgroundColor: token('color.background.neutral.subtle', '#f7f8f9'),
});

export const dialogPreviewContentStyles = css({
  display: 'block',
  color: token('color.text', '#172b4d'),

  '& .katex-display': {
    margin: 0,
  },
});

export const dialogInlinePreviewStyles = css({
  textAlign: 'left',
});

export const dialogBlockPreviewStyles = css({
  textAlign: 'center',
});
