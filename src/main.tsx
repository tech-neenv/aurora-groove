import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import './styles/reset.css';
import { PostHogProvider } from 'posthog-js/react';
import App from './App';
import { posthog, analyticsEnabled } from './lib/analytics';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {analyticsEnabled ? (
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
