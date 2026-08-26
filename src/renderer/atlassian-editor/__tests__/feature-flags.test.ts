/** @jest-environment jsdom */

import { fg } from '@atlaskit/platform-feature-flags';

import { configureFeatureFlags } from '../feature-flags';

describe('editor feature flags', () => {
  it('enables the React-compatible Atlaskit migration gates', () => {
    configureFeatureFlags();

    expect(fg('nike_r19_render_unmount')).toBe(true);
    expect(fg('platform-dst-top-layer')).toBe(true);
    expect(fg('platform_editor_use_preferences_plugin')).toBe(false);
  });
});
