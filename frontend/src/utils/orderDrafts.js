// Server-persisted in-progress orders — replaces the earlier localStorage-
// only version (see backend/src/db/schema.sql's order_drafts table for the
// full reasoning) so a draft follows the user across devices/browsers
// instead of being stuck in one machine's browser storage.

import client, { API_BASE_URL } from '../api/client';

export const ORDER_STEPS = ['Distributor', 'Items', 'Discount & Freight', 'Payment', 'Review'];

// Client-generated on purpose — see the schema comment on order_drafts.id.
// A UUID (not the old timestamp+random string) since this id is now a
// shared database primary key across every user, not a per-browser
// localStorage key where collision risk was a non-issue.
export function newDraftId() {
  return crypto.randomUUID();
}

// Most recently edited first — matches how a "recent work" list is
// expected to read. (Server already returns them in this order; sorting
// again here is just cheap insurance against relying on that silently.)
export async function listDrafts() {
  const res = await client.get('/order-drafts');
  return res.data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getDraft(id) {
  // No single-draft GET endpoint exists — the list is expected to stay
  // small (a handful of in-progress orders per user at most), so fetching
  // it and finding the one we want client-side avoids an extra route for
  // a case that isn't performance-sensitive.
  const drafts = await listDrafts();
  return drafts.find((d) => d.id === id) || null;
}

// Normal save path — used for the explicit "Save as Draft" button and the
// leave-blocker's "Save & Leave" action. Goes through the regular
// CSRF-protected axios client like every other mutating request in the app.
export async function saveDraft(data) {
  const res = await client.post('/order-drafts', data);
  return res.data;
}

// Tab-close save path — a normal async saveDraft() can't be trusted to
// finish before the browser actually closes the tab. navigator.sendBeacon()
// is built specifically for this moment: the browser guarantees it will
// attempt the request even as the page is being torn down, at the cost of
// being fire-and-forget (no response, no custom headers). That second cost
// is why this hits a dedicated, deliberately CSRF-exempt endpoint — see
// backend/src/middleware/csrf.js for the reasoning and the narrow blast
// radius that trade-off carries.
export function saveDraftBeacon(data) {
  if (!navigator.sendBeacon) return; // ancient-browser fallback: simply can't guarantee this save, nothing else to do about it here
  try {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    navigator.sendBeacon(`${API_BASE_URL}/api/order-drafts/beacon`, blob);
  } catch {
    // Same reasoning as above — this is a best-effort safety net, not a
    // guaranteed save, and there's nothing left to fall back to at this
    // point in the page lifecycle.
  }
}

export async function deleteDraft(id) {
  await client.delete(`/order-drafts/${id}`);
}

// Small, dependency-free relative-time label for the Drafts list — full
// precision isn't useful here ("2 hours ago" beats a timestamp), but it
// falls back to a plain date once something is more than a week old.
export function formatRelativeTime(isoString) {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '—';

  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
