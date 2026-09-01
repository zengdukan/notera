import { useMemo } from 'react';

import { AppProviders } from './app/AppProviders';
import { AppShell } from './app/AppShell';
import { resolveLocale } from './app/i18n';
import { createNoteraClient } from './platform/notera-client';

export default function App() {
  const client = useMemo(() => createNoteraClient(window.notera), []);
  const locale = resolveLocale(navigator.language);

  return (
    <AppProviders client={client} locale={locale}>
      <AppShell client={client} />
    </AppProviders>
  );
}
