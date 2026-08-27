import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
}

export function clearProfileQueries(
  client: QueryClient,
  profileId: string,
): void {
  client.removeQueries({ queryKey: ['profile', profileId] });
}
