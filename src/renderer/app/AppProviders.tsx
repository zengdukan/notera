import { type ReactNode, useState } from 'react';
import AppProvider from '@atlaskit/app-provider';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';

import { type AppLocale, messagesFor } from './i18n';
import { createAppQueryClient } from './query-client';
import { SessionProvider } from './session';
import { configureFeatureFlags } from '../atlassian-editor/feature-flags';

configureFeatureFlags();

export function AppProviders({
  children,
  locale,
  queryClient,
}: {
  readonly children: ReactNode;
  readonly locale: AppLocale;
  readonly queryClient?: QueryClient;
}) {
  const [defaultClient] = useState(createAppQueryClient);
  return (
    <AppProvider defaultColorMode="auto">
      <IntlProvider locale={locale} messages={messagesFor(locale)}>
        <QueryClientProvider client={queryClient ?? defaultClient}>
          <SessionProvider>{children}</SessionProvider>
        </QueryClientProvider>
      </IntlProvider>
    </AppProvider>
  );
}
