import { englishMessages } from './messages/en';
import { chineseMessages } from './messages/zh-CN';

export type AppLocale = 'zh-CN' | 'en';

export function resolveLocale(systemLocale: string): AppLocale {
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function messagesFor(locale: AppLocale): Record<string, string> {
  return locale === 'zh-CN' ? chineseMessages : englishMessages;
}
