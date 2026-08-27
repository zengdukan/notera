type Listener = () => void;

export interface ProfileLockSignal {
  emit(): void;
  subscribe(listener: Listener): () => void;
}

export function createProfileLockSignal(): ProfileLockSignal {
  const listeners = new Set<Listener>();
  return Object.freeze({
    emit() {
      [...listeners].forEach((listener) => listener());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
