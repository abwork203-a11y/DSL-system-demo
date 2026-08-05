import { Link } from 'react-router-dom';
import { APP_NAME } from '../config';

export default function LegalPageLayout({ title, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
        padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, textDecoration: 'none', color: 'var(--ink)' }}>
          {APP_NAME}<span style={{ color: 'var(--accent)' }}>.</span>
        </Link>
        <Link to="/" className="link-btn">← Back to app</Link>
      </div>
      <div className="content" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 20 }}>{title}</h1>
        {children}
      </div>
    </div>
  );
}
