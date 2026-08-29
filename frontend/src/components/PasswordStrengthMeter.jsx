// Lightweight, dependency-free strength heuristic — just live typing
// feedback so a "weak" password gets caught before submit. This is separate
// from (and doesn't replace) the server-side breach-database check that
// already runs on submit in userController.js/accountController.js — that's
// the real security gate; this is just earlier, friendlier feedback.
function scorePassword(password) {
  if (!password) return null;
  if (password.length < 8) {
    return { label: 'Too short', level: 1 };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { label: 'Weak', level: 2 };
  if (score <= 3) return { label: 'Fair', level: 3 };
  return { label: 'Strong', level: 4 };
}

const LEVEL_COLOR = {
  1: 'var(--status-negative)',
  2: 'var(--status-negative)',
  3: 'var(--status-pending)',
  4: 'var(--status-positive)',
};

// Drop this under a PasswordInput wherever a NEW password is being set
// (account creation, password change) — not where an existing password is
// being entered for login/verification, where a strength meter doesn't mean
// anything.
export default function PasswordStrengthMeter({ password }) {
  const result = scorePassword(password);
  if (!result) return null;

  const color = LEVEL_COLOR[result.level];

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 999,
              background: i <= result.level ? color : 'var(--surface-sunken)',
              transition: 'background 0.15s ease',
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 11.5, color, marginTop: 4, marginBottom: 0, fontWeight: 600 }}>
        {result.label}
      </p>
    </div>
  );
}
