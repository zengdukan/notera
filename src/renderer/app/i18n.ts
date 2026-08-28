import {
  en as editorCommonEnglishMessages,
  zh as editorCommonChineseMessages,
} from '@atlaskit/editor-common/i18n';
import {
  en as editorCoreEnglishMessages,
  zh as editorCoreChineseMessages,
} from '@atlaskit/editor-core/i18n';
import rendererEnglishMessages from '@atlaskit/afm-i18n-platform-editor-renderer/i18n/en';
import rendererChineseMessages from '@atlaskit/afm-i18n-platform-editor-renderer/i18n/zh';
import taskDecisionEnglishMessages from '@atlaskit/afm-i18n-platform-elements-task-decision/i18n/en';
import taskDecisionChineseMessages from '@atlaskit/afm-i18n-platform-elements-task-decision/i18n/zh';
import mediaUiEnglishMessages from '@atlaskit/afm-i18n-platform-media-media-ui/i18n/en';
import mediaUiChineseMessages from '@atlaskit/afm-i18n-platform-media-media-ui/i18n/zh';

import { englishMessages } from './messages/en';
import { chineseMessages } from './messages/zh-CN';

export type AppLocale = 'zh-CN' | 'en';

const messages = Object.freeze({
  en: Object.freeze({
    ...editorCommonEnglishMessages,
    ...editorCoreEnglishMessages,
    ...rendererEnglishMessages,
    ...taskDecisionEnglishMessages,
    ...mediaUiEnglishMessages,
    ...englishMessages,
  }),
  'zh-CN': Object.freeze({
    ...editorCommonChineseMessages,
    ...editorCoreChineseMessages,
    ...rendererChineseMessages,
    ...taskDecisionChineseMessages,
    ...mediaUiChineseMessages,
    ...chineseMessages,
  }),
});

export function resolveLocale(systemLocale: string): AppLocale {
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function messagesFor(locale: AppLocale): Record<string, string> {
  return messages[locale];
}
