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
