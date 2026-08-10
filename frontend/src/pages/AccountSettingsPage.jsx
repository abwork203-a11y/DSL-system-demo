import { useEffect, useState } from 'react';
import { account as accountApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [mfaEnabled, setMfaEnabled] = useState(null);

  useEffect(() => {
    accountApi.mfaStatus().then((res) => setMfaEnabled(res.data.mfaEnabled)).catch(() => {});
  }, []);

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div>
          <h1>Account Settings</h1>
          <p>{user?.name} · {user?.email}</p>
        </div>
      </div>

      <PasswordCard toast={toast} />
      <MfaCard mfaEnabled={mfaEnabled} setMfaEnabled={setMfaEnabled} toast={toast} />
      <SessionsCard toast={toast} />
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
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>New password (min. 8 characters)</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
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
          <img src={setupData.qrDataUrl} alt="MFA QR code" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid var(--border)' }} />
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
              <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required autoFocus />
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
