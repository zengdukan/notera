import './atlassian-editor/browser-polyfills';
import { createRoot } from 'react-dom/client';
import '@atlaskit/css-reset';

import './atlassian-editor/index.css';
import App from './App';
import { configureFeatureFlags } from './atlassian-editor/feature-flags';

configureFeatureFlags();
const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);
