import { insertMathFromToolbar } from './toolbar-action';

describe('Math toolbar insertion', () => {
  it('inserts a block formula at the current selection and restores focus', async () => {
    const openEditor = jest.fn().mockResolvedValue('x^2 + y^2');
    const actions = {
      focus: jest.fn(),
      replaceSelection: jest.fn().mockReturnValue(true),
    };

    await expect(insertMathFromToolbar(openEditor, actions)).resolves.toBe(
      true,
    );
    expect(openEditor).toHaveBeenCalledWith({ kind: 'block', latex: '' });
    expect(actions.replaceSelection).toHaveBeenCalledWith({
      type: 'extension',
      attrs: {
        extensionType: 'com.atlassian.editor.math',
        extensionKey: 'math:block',
        parameters: { version: 1, latex: 'x^2 + y^2' },
        layout: 'default',
      },
    });
    expect(actions.focus).toHaveBeenCalledTimes(1);
  });

  it('does not mutate the document when cancelled or not ready', async () => {
    const openEditor = jest.fn().mockResolvedValue(undefined);
    const actions = {
      focus: jest.fn(),
      replaceSelection: jest.fn(),
    };

    await expect(insertMathFromToolbar(openEditor, actions)).resolves.toBe(
      false,
    );
    await expect(insertMathFromToolbar(openEditor, null)).resolves.toBe(false);
    expect(actions.replaceSelection).not.toHaveBeenCalled();
    expect(actions.focus).not.toHaveBeenCalled();
  });
});
