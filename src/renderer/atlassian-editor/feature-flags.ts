import { setBooleanFeatureFlagResolver } from '@atlaskit/platform-feature-flags';

export function configureFeatureFlags() {
  setBooleanFeatureFlagResolver(
    (featureFlagKey) => featureFlagKey === 'nike_r19_render_unmount',
  );
}
