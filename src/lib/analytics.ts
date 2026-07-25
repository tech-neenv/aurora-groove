import posthog from 'posthog-js';

// PostHog analytics — only initialised when the env key is present, so the app
// runs fine locally / in CI without it (mirrors `supabase.ts`). When enabled it
// autocaptures clicks, form submits and SPA pageviews, and records sessions
// (toggle recording on in PostHog → Project settings).
const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export const analyticsEnabled: boolean = !!key;

if (analyticsEnabled) {
  posthog.init(key!, {
    api_host: host,
    // '2025-05-24' turns on autocapture + history-based pageviews + pageleave
    // (session duration), which is exactly what we want for a react-router SPA.
    defaults: '2025-05-24',
    // Anonymous events still captured; a person profile is only created once we
    // call posthog.identify() (e.g. after Neenv sign-in) — keeps billing lean.
    person_profiles: 'identified_only',
  });
}

export { posthog };
