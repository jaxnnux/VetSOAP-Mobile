import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
      // Minimize PHI retention in memory: garbage-collect cached data
      // 60 seconds after the last observer unmounts
      gcTime: 60000,
    },
  },
});
