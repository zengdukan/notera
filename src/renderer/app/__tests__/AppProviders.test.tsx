/** @jest-environment jsdom */

import { act, render, screen } from '@testing-library/react';
import { useColorMode } from '@atlaskit/app-provider';
import { FormattedMessage } from 'react-intl';

import { useMathEditor } from '../../atlassian-editor/math';
import { useMermaidEditor } from '../../atlassian-editor/mermaid';
import type { NoteraClient } from '../../platform/notera-client';
import { deviceSettingsKey } from '../../settings/settings-queries';
import { AppProviders, colorModeForTheme } from '../AppProviders';
import { createAppQueryClient } from '../query-client';

function EditorContextHarness() {
  const openMathEditor = useMathEditor();
  const openMermaidEditor = useMermaidEditor();

  return (
    <output aria-label="Editor contexts">
      {typeof openMathEditor}:{typeof openMermaidEditor}
    </output>
  );
}

function PreferenceHarness() {
  const colorMode = useColorMode();
  return (
    <>
      <output aria-label="Color mode">{colorMode}</output>
      <output aria-label="Localized message">
        <FormattedMessage id="app.close" />
      </output>
    </>
  );
}

function settingsClient(
  value:
    | { readonly theme: 'SYSTEM' | 'LIGHT' | 'DARK'; readonly language: 'zh-CN' | 'en' }
    | Error,
): NoteraClient {
  return {
    request: jest.fn(async (key: string) => {
      if (key !== 'settings.getDevice') return {};
      if (value instanceof Error) throw value;
      return value;
    }),
    subscribe: jest.fn(),
  } as unknown as NoteraClient;
}

describe('AppProviders', () => {
  it('provides the math and Mermaid editor contexts', () => {
    render(
      <AppProviders locale="en">
        <EditorContextHarness />
      </AppProviders>,
    );

    expect(screen.getByLabelText('Editor contexts')).toHaveTextContent(
      'function:function',
    );
  });

  it('maps stored themes to ADS color modes', () => {
    expect(colorModeForTheme('SYSTEM')).toBe('auto');
    expect(colorModeForTheme('LIGHT')).toBe('light');
    expect(colorModeForTheme('DARK')).toBe('dark');
  });

  it('applies stored device settings and reacts to successful cache updates', async () => {
    const queryClient = createAppQueryClient();
    render(
      <AppProviders
        client={settingsClient({ theme: 'DARK', language: 'zh-CN' })}
        locale="en"
        queryClient={queryClient}
      >
        <PreferenceHarness />
      </AppProviders>,
    );

    expect(await screen.findByText('关闭应用')).toBeVisible();
    expect(screen.getByLabelText('Color mode')).toHaveTextContent('dark');

    act(() => {
      queryClient.setQueryData(deviceSettingsKey(), {
        theme: 'LIGHT',
        language: 'en',
      });
    });

    expect(await screen.findByText('Close app')).toBeVisible();
    expect(screen.getByLabelText('Color mode')).toHaveTextContent('light');
  });

  it('keeps the system-derived fallback when device settings cannot load', async () => {
    render(
      <AppProviders
        client={settingsClient(new Error('unavailable'))}
        locale="en"
        queryClient={createAppQueryClient()}
      >
        <PreferenceHarness />
      </AppProviders>,
    );

    expect(await screen.findByText('Close app')).toBeVisible();
  });
});
