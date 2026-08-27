import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="content" style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center', marginTop: 60 }}>
        <h1 style={{ marginBottom: 8 }}>Page not found</h1>
        <p style={{ color: 'var(--ink-muted)', marginBottom: 20 }}>
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link to="/" className="btn">Back to Dashboard</Link>
      </div>
    </div>
  );
}
