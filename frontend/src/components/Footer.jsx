import { Link } from 'react-router-dom';
import { APP_VERSION, BUSINESS_NAME, CURRENT_YEAR } from '../config';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div>© {CURRENT_YEAR} {BUSINESS_NAME} · v{APP_VERSION}</div>
      <div className="site-footer-links">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/contact">Contact</Link>
      </div>
    </footer>
  );
}
