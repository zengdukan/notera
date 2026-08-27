export interface ActivityReporter {
  start(): void;
  stop(): void;
}

type ActivityEvent = 'pointerdown' | 'keydown' | 'scroll' | 'focus';

export function createActivityReporter(input: {
  readonly target: {
    addEventListener(name: ActivityEvent, listener: () => void): void;
    removeEventListener(name: ActivityEvent, listener: () => void): void;
  };
  readonly touch: () => void;
  readonly now: () => number;
}): ActivityReporter {
  const events: readonly ActivityEvent[] = [
    'pointerdown',
    'keydown',
    'scroll',
    'focus',
  ];
  let lastReportedAt: number | undefined;
  let started = false;
  const report = () => {
    const current = input.now();
    if (lastReportedAt !== undefined && current - lastReportedAt < 10_000) {
      return;
    }
    lastReportedAt = current;
    input.touch();
  };

  return Object.freeze({
    start(): void {
      if (started) return;
      started = true;
      events.forEach((event) => input.target.addEventListener(event, report));
    },
    stop(): void {
      if (!started) return;
      started = false;
      events.forEach((event) => input.target.removeEventListener(event, report));
    },
  });
}
