import { type ReactNode, useEffect, useState } from 'react';
import AppProvider, { useSetColorMode } from '@atlaskit/app-provider';
import { FlagsProvider } from '@atlaskit/flag';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';

import { MathEditorProvider } from '../atlassian-editor/math';
import { MermaidEditorProvider } from '../atlassian-editor/mermaid';
import type { NoteraClient } from '../platform/notera-client';
import {
  type ThemePreference,
  useDeviceSettings,
} from '../settings/settings-queries';
import { type AppLocale, messagesFor } from './i18n';
import { createAppQueryClient } from './query-client';
import { SessionProvider } from './session';
import { configureFeatureFlags } from '../atlassian-editor/feature-flags';

configureFeatureFlags();

export function colorModeForTheme(
  theme: ThemePreference,
): 'auto' | 'light' | 'dark' {
  if (theme === 'LIGHT') return 'light';
  if (theme === 'DARK') return 'dark';
  return 'auto';
}

function ColorModeSync({ theme }: { readonly theme: ThemePreference }) {
  const setColorMode = useSetColorMode();

  useEffect(
    () => setColorMode(colorModeForTheme(theme)),
    [setColorMode, theme],
  );
  return null;
}

function ApplicationProviders({
  children,
  locale,
}: {
  readonly children: ReactNode;
  readonly locale: AppLocale;
}) {
  return (
    <IntlProvider locale={locale} messages={messagesFor(locale)}>
      <FlagsProvider>
        <SessionProvider>
          <MathEditorProvider>
            <MermaidEditorProvider>{children}</MermaidEditorProvider>
          </MathEditorProvider>
        </SessionProvider>
      </FlagsProvider>
    </IntlProvider>
  );
}

function RuntimePreferenceProviders({
  children,
  client,
  fallbackLocale,
}: {
  readonly children: ReactNode;
  readonly client: NoteraClient;
  readonly fallbackLocale: AppLocale;
}) {
  const settings = useDeviceSettings(client).data ?? {
    theme: 'SYSTEM' as const,
    language: fallbackLocale,
  };

  return (
    <>
      <ColorModeSync theme={settings.theme} />
      <ApplicationProviders locale={settings.language}>
        {children}
      </ApplicationProviders>
    </>
  );
}

export function AppProviders({
  children,
  client,
  locale,
  queryClient,
}: {
  readonly children: ReactNode;
  readonly client?: NoteraClient;
  readonly locale: AppLocale;
  readonly queryClient?: QueryClient;
}) {
  const [defaultClient] = useState(createAppQueryClient);
  return (
    <AppProvider defaultColorMode="auto">
      <QueryClientProvider client={queryClient ?? defaultClient}>
        {client === undefined ? (
          <ApplicationProviders locale={locale}>
            {children}
          </ApplicationProviders>
        ) : (
          <RuntimePreferenceProviders client={client} fallbackLocale={locale}>
            {children}
          </RuntimePreferenceProviders>
        )}
      </QueryClientProvider>
    </AppProvider>
  );
}
