import LegalPageLayout from '../components/LegalPageLayout';
import { BUSINESS_NAME, SUPPORT_EMAIL } from '../config';

export default function ContactPage() {
  return (
    <LegalPageLayout title="Contact & Support">
      <p style={{ color: 'var(--ink-muted)', marginBottom: 20 }}>
        Questions, issues, or feedback about this app can be sent to {BUSINESS_NAME}:
      </p>
      <div className="card" style={{ maxWidth: 400 }}>
        <div className="stat-label">Support Email</div>
        <p style={{ marginTop: 6 }}>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="link-btn">{SUPPORT_EMAIL}</a>
        </p>
      </div>
      <p style={{ color: 'var(--ink-muted)', fontSize: 12.5, marginTop: 20 }}>
        Replace the placeholder email in <code>src/config.js</code> with your real support address.
      </p>
    </LegalPageLayout>
  );
}
