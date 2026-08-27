import { QueryClient } from '@tanstack/react-query';
import { clearProfileQueries, createAppQueryClient } from '../query-client';
import { noteKey } from '../query-keys';

describe('application query client', () => {
  it('clears only the locked profile query domain', () => {
    const client = createAppQueryClient();
    client.setQueryData(noteKey('profile-a', 'note-a'), { title: 'secret-a' });
    client.setQueryData(noteKey('profile-b', 'note-b'), { title: 'secret-b' });
    client.setQueryData(['device', 'settings'], { theme: 'SYSTEM' });

    clearProfileQueries(client, 'profile-a');

    expect(client.getQueryData(noteKey('profile-a', 'note-a'))).toBeUndefined();
    expect(client.getQueryData(noteKey('profile-b', 'note-b'))).toEqual({
      title: 'secret-b',
    });
    expect(client.getQueryData(['device', 'settings'])).toEqual({
      theme: 'SYSTEM',
    });
  });

  it('uses deterministic renderer-safe query defaults', () => {
    const client = createAppQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
    expect(client.getDefaultOptions().queries).toMatchObject({
      retry: false,
      refetchOnWindowFocus: false,
    });
  });
});
