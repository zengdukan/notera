import { toolbarLayoutForWidth } from '../toolbar-layout';

const core = ['undo', 'redo', 'text-style'];

describe('responsive editor toolbar layout', () => {
  it.each([
    [1200, [...core, 'bold', 'italic', 'underline', 'text-color', 'more-formatting', 'link', 'bullet-list', 'number-list', 'task-list', 'list', 'table', 'media', 'emoji', 'insert']],
    [1024, [...core, 'bold', 'italic', 'underline', 'text-color', 'more-formatting', 'link', 'bullet-list', 'number-list', 'task-list', 'list', 'insert']],
    [768, [...core, 'bold', 'italic', 'underline', 'more-formatting', 'link', 'list', 'insert']],
    [476, [...core, 'bold', 'more-formatting', 'list', 'insert']],
    [410, [...core, 'more-formatting', 'list', 'insert']],
  ])('uses the Fullpage action order at %dpx', (width, visible) => {
    expect(toolbarLayoutForWidth(width).visible).toEqual(visible);
  });

  it.each([1200, 1024, 768, 476, 410])(
    'places every action exactly once at %dpx',
    (width) => {
      const layout = toolbarLayoutForWidth(width);
      const actions = [
        ...layout.visible.filter((id) => !['more-formatting', 'list', 'insert', 'text-style'].includes(id)),
        ...layout.moreFormatting,
        ...layout.list,
        ...layout.insert,
      ];
      expect(new Set(actions).size).toBe(actions.length);
      expect(layout.insert).not.toContain('mention');
      expect(layout.insert).not.toContain('rovo');
      expect(layout.insert).not.toContain('pin');
    },
  );

  it('moves actions into their specified menus at each breakpoint', () => {
    expect(toolbarLayoutForWidth(1024).insert).toEqual(expect.arrayContaining(['table', 'media', 'emoji']));
    expect(toolbarLayoutForWidth(768).list).toEqual(expect.arrayContaining(['bullet-list', 'number-list', 'task-list']));
    expect(toolbarLayoutForWidth(768).moreFormatting).toContain('text-color');
    expect(toolbarLayoutForWidth(476).insert).toContain('link');
    expect(toolbarLayoutForWidth(476).moreFormatting).toEqual(expect.arrayContaining(['italic', 'underline']));
    expect(toolbarLayoutForWidth(410).moreFormatting).toContain('bold');
  });
});
