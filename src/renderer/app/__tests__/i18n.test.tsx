import { englishMessages } from '../messages/en';
import { chineseMessages } from '../messages/zh-CN';
import { messagesFor, resolveLocale } from '../i18n';

describe('application internationalization', () => {
  it('uses Chinese only for Chinese system locales and English otherwise', () => {
    expect(resolveLocale('zh-CN')).toBe('zh-CN');
    expect(resolveLocale('zh-TW')).toBe('zh-CN');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('fr-FR')).toBe('en');
  });

  it('keeps the English and Chinese application message catalogs aligned', () => {
    expect(Object.keys(chineseMessages).sort()).toEqual(
      Object.keys(englishMessages).sort(),
    );
    expect(messagesFor('zh-CN')).toMatchObject(chineseMessages);
    expect(messagesFor('en')).toMatchObject(englishMessages);
  });

  it('defines localized media upload limits with a limit placeholder', () => {
    expect(messagesFor('en')).toMatchObject({
      'fabric.media.uploadRejectionFlagDescription':
        '{fileName} is too big to upload. Files must be less than {limit}.',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'fabric.media.uploadRejectionFlagDescription':
        '{fileName} 太大，无法上传。文件必须小于 {limit}。',
    });
  });

  it('defines localized favorites messages and action labels', () => {
    expect(messagesFor('en')).toMatchObject({
      'favorites.title': 'Favorites',
      'favorites.removeLabel': 'Remove {title} from favorites',
      'favorites.returnToContent': 'Return to content',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'favorites.title': '收藏',
      'favorites.removeLabel': '取消收藏「{title}」',
      'favorites.returnToContent': '返回内容目录',
    });
  });

  it('defines localized recent-note messages', () => {
    expect(messagesFor('en')).toMatchObject({
      'recent.sortDescription': 'Sorted by last modified time',
      'recent.listLabel': 'Recent notes',
      'recent.returnToContent': 'Return to content',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'recent.sortDescription': '按最近修改时间排序',
      'recent.listLabel': '最近浏览笔记',
      'recent.returnToContent': '返回内容目录',
    });
  });

  it('defines localized trash messages and interpolation placeholders', () => {
    expect(messagesFor('en')).toMatchObject({
      'trash.title': 'Trash',
      'trash.restoreLabel': 'Restore {title}',
      'trash.deletedDescription': '{path} · Deleted {date}',
      'trash.moveAction': 'Move to trash',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'trash.title': '回收站',
      'trash.restoreLabel': '恢复「{title}」',
      'trash.deletedDescription': '{path} · 删除于 {date}',
      'trash.moveAction': '移至回收站',
    });
  });

  it('defines localized history and copy messages', () => {
    expect(messagesFor('en')).toMatchObject({
      'history.title': 'History',
      'history.copy.action': 'Copy',
      'history.copy.successDescription':
        '{title} was created in the selected folder.',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'history.title': '历史版本',
      'history.copy.action': '复制',
      'history.copy.successDescription': '已在所选目录中创建「{title}」。',
    });
  });

  it('defines localized export messages', () => {
    expect(messagesFor('en')).toMatchObject({
      'export.action': 'Export',
      'export.format.label': 'Export format',
      'export.runningLabel': 'Export in progress',
      'export.result.completedTitle': 'Export completed',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'export.action': '导出',
      'export.format.label': '导出格式',
      'export.runningLabel': '正在导出',
      'export.result.completedTitle': '导出完成',
    });
  });

  it('defines localized sticky note header messages', () => {
    expect(messagesFor('en')).toMatchObject({
      'notes.header.pathLabel': 'Note path',
      'notes.header.titleLabel': 'Note title',
      'notes.header.save.clean': 'Saved',
      'notes.header.save.dirty': 'Unsaved changes',
      'notes.header.save.saving': 'Saving',
      'notes.header.save.failed': 'Not saved',
      'notes.header.mode.view': 'View',
      'notes.header.mode.edit': 'Edit',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'notes.header.pathLabel': '笔记路径',
      'notes.header.titleLabel': '笔记标题',
      'notes.header.save.clean': '已保存',
      'notes.header.save.dirty': '有未保存的修改',
      'notes.header.save.saving': '正在保存',
      'notes.header.save.failed': '未保存',
      'notes.header.mode.view': '预览',
      'notes.header.mode.edit': '编辑',
    });
    expect(Object.keys(englishMessages)).not.toContain('notes.header.untitled');
    expect(Object.keys(chineseMessages)).not.toContain('notes.header.untitled');
    expect(messagesFor('en')).toMatchObject({
      'recent.untitled': 'Untitled',
      'navigation.addToFavorites': 'Add to favorites',
      'navigation.removeFromFavorites': 'Remove from favorites',
      'history.create.title': 'Create version',
      'history.title': 'History',
      'export.action': 'Export',
      'navigation.move': 'Move',
      'navigation.copy': 'Copy',
      'navigation.moveToTrash': 'Move to trash',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'recent.untitled': '无标题',
      'navigation.addToFavorites': '添加收藏',
      'navigation.removeFromFavorites': '取消收藏',
      'history.create.title': '创建版本',
      'history.title': '历史版本',
      'export.action': '导出',
      'navigation.move': '移动',
      'navigation.copy': '复制',
      'navigation.moveToTrash': '移至回收站',
    });
  });

  it('includes Chinese messages required by rendered editor content', () => {
    expect(messagesFor('zh-CN')).toMatchObject({
      'fabric.editor.fieldsetLabel': '操作项列表',
      'fabric.editor.headingLink.noneSortingLabel': '无',
      'fabric.editor.headingLink.noOrderLabel': '按照 A 到 Z 进行列排序',
      'fabric.editor.tableHeader.sorting.no': '未对该列应用任何排序',
      'fabric.media.expand': '展开',
      'fabric.media.file_is_selected': '已选择文件 {name}',
      'platform.taskDecision.markTaskAsCompleted': '将任务标记为已完成',
    });
  });
});
