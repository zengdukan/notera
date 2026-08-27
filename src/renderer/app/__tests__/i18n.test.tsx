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
    expect(messagesFor('zh-CN')).toBe(chineseMessages);
    expect(messagesFor('en')).toBe(englishMessages);
  });
});
