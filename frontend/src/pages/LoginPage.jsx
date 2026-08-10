import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { APP_NAME } from '../config';
import Footer from '../components/Footer';

export default function LoginPage() {
  const { login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 2 state — only populated once step 1 comes back saying MFA is required.
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.done) {
        navigate('/');
      } else {
        setMfaToken(result.mfaToken);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeMfaLogin(mfaToken, code.trim());
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-center">
        <div className="auth-card">
          <div style={{ marginBottom: 22 }}>
            <h1>{APP_NAME}<span style={{ color: 'var(--accent)' }}>.</span></h1>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13.5 }}>
              {mfaToken ? 'Two-factor verification' : 'Distribution Sales & Ledger Management'}
            </p>
          </div>
          {error && <div className="error-banner">{error}</div>}

          {!mfaToken ? (
            <form onSubmit={handlePasswordSubmit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button className="btn" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit}>
              <p style={{ color: 'var(--ink-muted)', fontSize: 13.5, marginBottom: 16 }}>
                {useBackupCode
                  ? 'Enter one of your saved backup codes.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>
              <div className="field">
                <label htmlFor="mfa-code">{useBackupCode ? 'Backup code' : 'Authentication code'}</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode={useBackupCode ? 'text' : 'numeric'}
                  maxLength={useBackupCode ? 10 : 6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                  style={{ letterSpacing: useBackupCode ? 'normal' : '0.3em', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <button className="btn" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button type="button" className="link-btn" onClick={() => { setMfaToken(null); setCode(''); setError(''); }}>
                  ← Back
                </button>
                <button type="button" className="link-btn" onClick={() => { setUseBackupCode(!useBackupCode); setCode(''); setError(''); }}>
                  {useBackupCode ? 'Use authenticator code instead' : 'Use a backup code instead'}
                </button>
              </div>
            </form>
          )}

          {!mfaToken && (
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 18, fontSize: 12 }}>
              <Link to="/terms" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Terms</Link>
              <Link to="/privacy" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Privacy</Link>
              <Link to="/cookies" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Cookies</Link>
              <Link to="/contact" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Contact</Link>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
