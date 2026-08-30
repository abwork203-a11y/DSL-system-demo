import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { account as accountApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import PasswordInput from '../components/PasswordInput';

const THEMES = [
  { key: 'ocean', label: 'Ocean', swatch: ['#F8FAFC', '#2563EB', '#1E293B'] },
  { key: 'forest', label: 'Forest', swatch: ['#F7F9F6', '#2F6D50', '#182A20'] },
  { key: 'terracotta', label: 'Terracotta', swatch: ['#FDF8F3', '#C2571F', '#2E2018'] },
  { key: 'slate', label: 'Slate', swatch: ['#F7F8FA', '#475569', '#111827'] },
];

const FONTS = [
  { key: 'classic', label: 'Classic', display: "'Fraunces', Georgia, serif", body: "'Inter', -apple-system, sans-serif" },
  { key: 'grotesk', label: 'Grotesk', display: "'Space Grotesk', -apple-system, sans-serif", body: "'Work Sans', -apple-system, sans-serif" },
  { key: 'editorial', label: 'Editorial', display: "'Playfair Display', Georgia, serif", body: "'Lora', Georgia, serif" },
];

export default function AccountSettingsPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [mfaEnabled, setMfaEnabled] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    accountApi.mfaStatus().then((res) => setMfaEnabled(res.data.mfaEnabled)).catch(() => {});
  }, []);

  const TABS = [
    { key: 'profile', label: 'Profile' },
    { key: 'password', label: 'Change Password' },
    { key: 'security', label: 'Security' },
    ...(isAdmin ? [{ key: 'preferences', label: 'Preferences' }] : []),
  ];

  return (
    <div className="content" style={{ maxWidth: 780 }}>
      <div className="page-header">
        <div>
          <h1>Account Settings</h1>
          <p>{user?.name} · {user?.email}</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`settings-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {activeTab === 'profile' && <ProfileTab user={user} toast={toast} />}

          {activeTab === 'password' && <PasswordCard toast={toast} />}

          {activeTab === 'security' && (
            <>
              <MfaCard mfaEnabled={mfaEnabled} setMfaEnabled={setMfaEnabled} toast={toast} />
              <SessionsCard toast={toast} />
            </>
          )}

          {activeTab === 'preferences' && isAdmin && <AppearanceCard />}
        </div>
      </div>
    </div>
  );
}

// New tab — the mockup asks for an editable profile (name/email/phone) plus
// an avatar uploader, neither of which the API supports yet. Both actions
// below call account endpoints (updateProfile / uploadAvatar) that need to be
// added server-side; until then they'll surface as a normal toast error
// rather than silently doing nothing, so the gap is obvious rather than
// hidden. Role is shown read-only on purpose — a user shouldn't be able to
// promote themselves by editing their own form.
function ProfileTab({ user, toast }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await accountApi.updateProfile({ name, email, phone });
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previousPreview = avatarPreview;
    setAvatarPreview(URL.createObjectURL(file)); // optimistic local preview
    setUploadingAvatar(true);
    try {
      await accountApi.uploadAvatar(file);
      toast.success('Profile picture updated.');
    } catch (err) {
      setAvatarPreview(previousPreview); // roll back
      toast.error(apiErrorMessage(err));
    } finally {
      setUploadingAvatar(false);
      e.target.value = ''; // allow re-selecting the same file next time
    }
  };

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="settings-profile-grid">
      <div className="card">
        <h2>Profile Information</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Phone Number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>Role</label>
            <input value={user?.role === 'admin' ? 'Admin' : 'Sales Rep'} disabled />
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="card settings-avatar-card">
        <h2>Profile Picture</h2>
        <div className="settings-avatar">
          {avatarPreview ? <img src={avatarPreview} alt="Profile" /> : initial}
        </div>
        <label className="btn btn-secondary settings-avatar-btn">
          {uploadingAvatar ? 'Uploading…' : 'Change Picture'}
          <input type="file" accept="image/*" hidden disabled={uploadingAvatar} onChange={handleAvatarChange} />
        </label>
        <p className="settings-avatar-hint">JPG or PNG, up to 2MB</p>
      </div>
    </div>
  );
}

function AppearanceCard() {
  // The saved value (if any) was already applied to <html> before this
  // component ever mounted (see public/theme-init.js) — read it back from
  // the DOM/localStorage here purely to highlight the right option, not to
  // re-apply it.
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'ocean');
  const [font, setFont] = useState(() => localStorage.getItem('font') || 'classic');

  const applyTheme = (key) => {
    document.documentElement.setAttribute('data-theme', key);
    localStorage.setItem('theme', key);
    setTheme(key);
  };

  const applyFont = (key) => {
    document.documentElement.setAttribute('data-font', key);
    localStorage.setItem('font', key);
    setFont(key);
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Appearance</h2>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginBottom: 16 }}>
        Changes apply immediately across the whole app and are remembered on this device.
      </p>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 10 }}>Theme</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {THEMES.map((t) => {
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTheme(t.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 76,
                }}
                aria-pressed={active}
              >
                <div
                  style={{
                    position: 'relative', width: 56, height: 56, borderRadius: '50%',
                    overflow: 'hidden', border: active ? '2px solid var(--ink)' : '2px solid var(--rule)',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
                  }}
                >
                  <div style={{ gridColumn: '1 / span 2', background: t.swatch[0] }} />
                  <div style={{ background: t.swatch[1] }} />
                  <div style={{ background: t.swatch[2] }} />
                  {active && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.15)',
                    }}>
                      <Check size={20} color="#fff" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 10 }}>Font Pairing</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {FONTS.map((f) => {
            const active = font === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => applyFont(f.key)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', cursor: 'pointer',
                  width: 168, padding: '10px 12px', borderRadius: 8,
                  border: active ? '2px solid var(--ink)' : '1px solid var(--rule)',
                  background: active ? 'var(--surface-sunken)' : 'var(--surface)',
                }}
                aria-pressed={active}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: f.display, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Aa</span>
                  {active && <Check size={14} color="var(--ink)" strokeWidth={3} />}
                </div>
                <span style={{ fontFamily: f.body, fontSize: 12, color: 'var(--ink-muted)' }}>{f.label} pairing</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PasswordCard({ toast }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await accountApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed. Any other signed-in devices have been logged out.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Password</h2>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginBottom: 16 }}>
        Changing your password signs you out everywhere else you're currently logged in.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Current password</label>
            <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>New password (min. 8 characters)</label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
          </div>
        </div>
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Change Password'}</button>
      </form>
    </div>
  );
}

function MfaCard({ mfaEnabled, setMfaEnabled, toast }) {
  const [setupData, setSetupData] = useState(null); // { qrDataUrl, secret }
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await accountApi.mfaSetup();
      setSetupData(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await accountApi.mfaVerifySetup(verifyCode.trim());
      setBackupCodes(res.data.backupCodes);
      setMfaEnabled(true);
      setSetupData(null);
      setVerifyCode('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await accountApi.mfaDisable(disablePassword);
      setMfaEnabled(false);
      setDisableOpen(false);
      setDisablePassword('');
      toast.success('MFA disabled.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Two-Factor Authentication</h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            Require a code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) in addition to your password.
          </p>
        </div>
        {mfaEnabled !== null && (
          <span className={`badge ${mfaEnabled ? 'badge-green' : 'badge-neutral'}`}>{mfaEnabled ? 'Enabled' : 'Disabled'}</span>
        )}
      </div>

      {backupCodes ? (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--amber-light)', borderRadius: 8 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Save these backup codes now — they won't be shown again.</p>
          <p style={{ color: 'var(--ink-muted)', fontSize: 12.5, marginBottom: 10 }}>
            Each one can be used once to sign in if you lose access to your authenticator app.
          </p>
          <div className="num" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13.5 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={() => setBackupCodes(null)}>Done, I've saved them</button>
        </div>
      ) : mfaEnabled === false && !setupData ? (
        <button className="btn" style={{ marginTop: 14 }} onClick={startSetup} disabled={busy}>
          {busy ? 'Preparing…' : 'Enable Two-Factor Authentication'}
        </button>
      ) : setupData ? (
        <form onSubmit={confirmSetup} style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13.5, marginBottom: 10 }}>Scan this QR code with your authenticator app:</p>
          <img src={setupData.qrDataUrl} alt="MFA QR code" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid var(--rule)' }} />
          <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8 }}>
            Can't scan it? Enter this code manually: <span className="num">{setupData.secret}</span>
          </p>
          <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
            <label>Enter the 6-digit code to confirm</label>
            <input
              type="text" inputMode="numeric" maxLength={6} value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)} required autoFocus
              style={{ letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Confirming…' : 'Confirm & Enable'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setSetupData(null)}>Cancel</button>
          </div>
        </form>
      ) : mfaEnabled === true ? (
        <button className="btn btn-danger" style={{ marginTop: 14 }} onClick={() => setDisableOpen(true)}>Disable Two-Factor Authentication</button>
      ) : null}

      {disableOpen && (
        <Modal title="Disable Two-Factor Authentication" onClose={() => setDisableOpen(false)}>
          <form onSubmit={disable}>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13.5, marginBottom: 14 }}>
              Confirm your password to disable MFA. This will also sign out any other active sessions on this account.
            </p>
            <div className="field">
              <label>Current password</label>
              <PasswordInput value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required autoFocus />
            </div>
            <button className="btn btn-danger" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Disabling…' : 'Disable MFA'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SessionsCard({ toast }) {
  const [busy, setBusy] = useState(false);

  const handleLogoutAll = async () => {
    setBusy(true);
    try {
      await accountApi.logoutAllSessions();
      toast.success('Signed out of every other session. This one stays active.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Sessions</h2>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginBottom: 14 }}>
        If you think you're logged in somewhere you shouldn't be — a shared computer, a lost device — sign out everywhere else at once.
      </p>
      <button className="btn btn-secondary" onClick={handleLogoutAll} disabled={busy}>
        {busy ? 'Signing out…' : 'Log Out All Other Sessions'}
      </button>
    </div>
  );
}
