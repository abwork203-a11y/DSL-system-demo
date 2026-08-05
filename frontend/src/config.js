// Central place for app identity/branding constants. Kept separate from
// scattered hardcoded strings so there's one place to edit if this app is
// ever white-labeled or offered to other businesses.
export const APP_NAME = 'LedgerOne';
export const APP_VERSION = '1.0.0';
export const BUSINESS_NAME = 'LedgerOne';
export const SUPPORT_EMAIL = 'abdullahhameed166@gmail.com';
export const OPERATING_COUNTRY = '[Country/State of Operation]';
export const WEBSITE_DOMAIN = '[yourapp.example.com]';
export const CURRENT_YEAR = new Date().getFullYear();

// Google OAuth Client ID for the Drive backup feature (see
// GOOGLE_DRIVE_SETUP.md). This is a *public* identifier — Google's OAuth
// design expects it to be embedded in frontend code, unlike a client secret.
// Read from a Vite env var so each deployment uses its own Google Cloud
// project rather than a value baked into the repo.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
