import {
  initialNavigationState,
  navigationReducer,
  resolveCreationFolderId,
} from '../navigation-reducer';

describe('navigation reducer', () => {
  it('clamps mouse and keyboard width changes and toggles collapse', () => {
    expect(
      navigationReducer(initialNavigationState, { type: 'resize', width: 50 })
        .width,
    ).toBe(240);
    expect(
      navigationReducer(initialNavigationState, { type: 'resize', width: 900 })
        .width,
    ).toBe(480);
    const resized = navigationReducer(initialNavigationState, {
      type: 'resize-by',
      delta: 24,
    });
    expect(resized.width).toBe(initialNavigationState.width + 24);
    expect(
      navigationReducer(resized, { type: 'toggle-collapse' }).collapsed,
    ).toBe(true);
  });

  it('resolves global creation context for root, folder, and note selections', () => {
    const root = 'root';
    expect(resolveCreationFolderId(root, undefined)).toBe(root);
    expect(
      resolveCreationFolderId(root, { kind: 'folder', id: 'folder' }),
    ).toBe('folder');
    expect(
      resolveCreationFolderId(root, {
        kind: 'note',
        id: 'note',
        folderId: 'parent',
      }),
    ).toBe('parent');
  });
});
