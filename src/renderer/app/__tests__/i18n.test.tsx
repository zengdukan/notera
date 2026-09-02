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
      'history.copy.action': 'Copy as new',
      'history.copy.successDescription':
        '{title} was created in the selected folder.',
    });
    expect(messagesFor('zh-CN')).toMatchObject({
      'history.title': '历史版本',
      'history.copy.action': '复制为新笔记',
      'history.copy.successDescription': '已在所选目录中创建「{title}」。',
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
