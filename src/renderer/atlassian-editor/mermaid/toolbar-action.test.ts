import { insertMermaidFromToolbar } from './toolbar-action';

describe('Mermaid toolbar insertion', () => {
  it('inserts the ADF at the current selection and restores focus', async () => {
    const openEditor = jest.fn().mockResolvedValue('flowchart LR\nA --> B');
    const actions = {
      focus: jest.fn(),
      replaceSelection: jest.fn().mockReturnValue(true),
    };

    await expect(insertMermaidFromToolbar(openEditor, actions)).resolves.toBe(
      true,
    );
    expect(openEditor).toHaveBeenCalledWith({ source: '' });
    expect(actions.replaceSelection).toHaveBeenCalledWith({
      type: 'extension',
      attrs: {
        extensionType: 'com.atlassian.editor.mermaid',
        extensionKey: 'mermaid:block',
        parameters: {
          version: 1,
          source: 'flowchart LR\nA --> B',
        },
        layout: 'default',
      },
    });
    expect(actions.focus).toHaveBeenCalledTimes(1);
  });

  it('does not mutate the document when cancelled or not ready', async () => {
    const cancelledEditor = jest.fn().mockResolvedValue(undefined);
    const actions = {
      focus: jest.fn(),
      replaceSelection: jest.fn(),
    };

    await expect(
      insertMermaidFromToolbar(cancelledEditor, actions),
    ).resolves.toBe(false);
    await expect(insertMermaidFromToolbar(cancelledEditor, null)).resolves.toBe(
      false,
    );
    expect(actions.replaceSelection).not.toHaveBeenCalled();
    expect(actions.focus).not.toHaveBeenCalled();
  });
});
