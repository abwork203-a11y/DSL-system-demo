import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { APP_NAME } from '../config';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--sidebar-bg)',
    }}>
      <div className="card" style={{ width: 380, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ marginBottom: 22 }}>
          <h1>{APP_NAME}<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 13.5 }}>Distribution Sales &amp; Ledger Management</p>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
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
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 18, fontSize: 12 }}>
          <Link to="/terms" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Terms</Link>
          <Link to="/privacy" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Privacy</Link>
          <Link to="/cookies" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Cookies</Link>
          <Link to="/contact" className="link-btn" style={{ color: 'var(--ink-muted)' }}>Contact</Link>
        </div>
      </div>
    </div>
  );
}
