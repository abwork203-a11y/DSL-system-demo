// Local, per-browser storage for in-progress orders. There is currently no
// server-side draft concept — the orders API doesn't accept incomplete
// orders and has no `draft` status — so this is a client-side convenience,
// not a synced record. It won't follow the user to another browser or
// device, and clearing site data clears it too.

const STORAGE_KEY = 'ledgerone.orderDrafts';

export const ORDER_STEPS = ['Distributor', 'Items', 'Discount & Freight', 'Payment', 'Review'];

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted JSON, storage disabled (private browsing in some browsers),
    // or blocked by permissions — treat it the same as "no drafts" rather
    // than breaking the page over a convenience feature.
    return [];
  }
}

function writeAll(drafts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    // Quota exceeded or storage unavailable — fail silently for the same
    // reason as above.
    return false;
  }
}

export function newDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Most recently edited first — matches how a "recent work" list is expected
// to read.
export function listDrafts() {
  return readAll().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getDraft(id) {
  return readAll().find((d) => d.id === id) || null;
}

// Upsert: creates the record on first save, updates it in place on every
// save after that (matched by id). `updatedAt` is always stamped fresh;
// `createdAt` is preserved from the existing record if there is one.
export function saveDraft(data) {
  const drafts = readAll();
  const now = new Date().toISOString();
  const idx = drafts.findIndex((d) => d.id === data.id);
  const record = {
    ...data,
    updatedAt: now,
    createdAt: idx >= 0 ? drafts[idx].createdAt : now,
  };

  if (idx >= 0) {
    drafts[idx] = record;
  } else {
    drafts.push(record);
  }

  writeAll(drafts);
  return record;
}

export function deleteDraft(id) {
  writeAll(readAll().filter((d) => d.id !== id));
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
