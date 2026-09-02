import type { AppearanceTypes } from '@atlaskit/flag';

export interface GlobalFeedback {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly appearance: AppearanceTypes;
}
