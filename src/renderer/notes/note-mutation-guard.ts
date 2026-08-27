export interface NoteMutationGuard {
  flushBefore(operation: 'move' | 'copy' | 'trash'): Promise<'ready' | 'blocked'>;
}

export const readyNoteMutationGuard: NoteMutationGuard = Object.freeze({
  flushBefore: async () => 'ready' as const,
});
