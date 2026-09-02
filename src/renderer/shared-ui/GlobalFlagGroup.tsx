import Flag, { AutoDismissFlag, FlagGroup } from '@atlaskit/flag';

import type { GlobalFeedback } from './feedback';

export function GlobalFlagGroup({
  flags,
  onDismissed,
  label,
}: {
  readonly flags: readonly GlobalFeedback[];
  readonly onDismissed: (id: string) => void;
  readonly label: string;
}) {
  return (
    <FlagGroup label={label} onDismissed={(id) => onDismissed(String(id))}>
      {flags.map((flag) => {
        const FlagComponent = flag.autoDismiss ? AutoDismissFlag : Flag;
        return (
          <FlagComponent
            appearance={flag.appearance}
            description={flag.description}
            id={flag.id}
            key={flag.id}
            title={flag.title}
          />
        );
      })}
    </FlagGroup>
  );
}
