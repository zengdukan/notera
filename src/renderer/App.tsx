import { useMemo, useState } from 'react';
import * as editorCommonMessages from '@atlaskit/editor-common/i18n';
import * as editorCoreMessages from '@atlaskit/editor-core/i18n';
import languages from '@atlaskit/editor-core/i18n-languages';
import { IntlProvider } from 'react-intl';
import { Editor } from './atlassian-editor/editor';
import LanguagePicker from './atlassian-editor/LanguagePicker';
import { MathEditorProvider } from './atlassian-editor/math';
import { MermaidEditorProvider } from './atlassian-editor/mermaid';

const customEditorMessages = {
  'fabric.editor.taskPlaceholder': 'Type your action.',
};

type Locale = keyof typeof languages;
type Messages = Record<string, string>;

function getMessages(locale: Locale): Messages {
  const commonMessages = editorCommonMessages as Partial<
    Record<Locale, Messages>
  >;
  const coreMessages = editorCoreMessages as Partial<Record<Locale, Messages>>;

  return {
    ...commonMessages[locale],
    ...coreMessages[locale],
    ...customEditorMessages,
  };
}

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const messages = useMemo(() => getMessages(locale), [locale]);
  const intlLocale = locale.replace('_', '-');

  const languagePicker = (
    <LanguagePicker
      key="language-picker"
      languages={languages}
      locale={locale}
      onChange={setLocale}
    />
  );

  return (
    <IntlProvider locale={intlLocale} messages={messages}>
      <MathEditorProvider>
        <MermaidEditorProvider>
          <Editor languagePicker={languagePicker} />
        </MermaidEditorProvider>
      </MathEditorProvider>
    </IntlProvider>
  );
}
