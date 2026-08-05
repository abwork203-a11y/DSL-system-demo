import { Link } from 'react-router-dom';
import { APP_VERSION, BUSINESS_NAME, CURRENT_YEAR } from '../config';

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '14px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
      fontSize: 12.5,
      color: 'var(--ink-muted)',
    }}>
      <div>© {CURRENT_YEAR} {BUSINESS_NAME} · v{APP_VERSION}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        <Link to="/terms" className="link-btn" style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Terms</Link>
        <Link to="/privacy" className="link-btn" style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Privacy</Link>
        <Link to="/cookies" className="link-btn" style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Cookies</Link>
        <Link to="/contact" className="link-btn" style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Contact</Link>
      </div>
    </footer>
  );
}
