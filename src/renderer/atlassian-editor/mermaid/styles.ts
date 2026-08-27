import { css } from '@emotion/react';
import { token } from '@atlaskit/tokens';

export const mermaidBlockStyles = css({
  boxSizing: 'border-box',
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  minHeight: '96px',
  marginBlock: token('space.150', '12px'),
  paddingBlock: token('space.200', '16px'),
  paddingInline: token('space.200', '16px'),
  overflowX: 'auto',
  borderRadius: token('radius.xsmall', '2px'),
  color: token('color.text', '#172b4d'),
  textAlign: 'center',
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

  '& svg': {
    display: 'block',
    width: 'auto',
    maxWidth: '100%',
    height: 'auto',
    marginInline: 'auto',
  },
});

export const mermaidStatusStyles = css({
  display: 'flex',
  minHeight: '64px',
  alignItems: 'center',
  justifyContent: 'center',
  color: token('color.text.subtle', '#626f86'),
  font: token('font.body.small'),
});

export const mermaidErrorStyles = css({
  color: token('color.text.danger', '#ae2e24'),
  textAlign: 'left',

  '& pre': {
    maxHeight: '240px',
    marginBlock: token('space.100', '8px'),
    padding: token('space.100', '8px'),
    overflow: 'auto',
    borderRadius: token('radius.small', '4px'),
    backgroundColor: token('color.background.neutral.subtle', '#f7f8f9'),
    color: token('color.text', '#172b4d'),
    fontFamily: token('font.family.code'),
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
  },
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
  whiteSpace: 'pre-wrap',
});

export const dialogPreviewSectionStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.075', '6px'),
  marginTop: token('space.200', '16px'),
});

export const dialogPreviewStyles = css({
  display: 'flex',
  minHeight: '280px',
  padding: token('space.150', '12px'),
  overflow: 'auto',
  border: `1px solid ${token('color.border', '#dcdfe4')}`,
  borderRadius: token('radius.medium', '6px'),
  backgroundColor: token('color.background.neutral.subtle', '#f7f8f9'),
});

export const dialogPreviewContentStyles = css({
  display: 'flex',
  flex: '1 1 auto',
  width: '100%',
  minHeight: '232px',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
  color: token('color.text', '#172b4d'),

  '& svg': {
    display: 'block',
    width: 'auto',
    maxWidth: '100%',
    height: 'auto',
    margin: 'auto',
  },
});

export const toolbarButtonContainerStyles = css({
  marginRight: token('space.100', '8px'),
});
