import { Link } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import PlaceholderNotice from '../components/PlaceholderNotice';
import { APP_NAME, BUSINESS_NAME, SUPPORT_EMAIL, OPERATING_COUNTRY } from '../config';

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ color: 'var(--ink-muted)', fontSize: 13.5, lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">

      <PlaceholderNotice />

      <Section title="Who We Are">
        {APP_NAME} is operated by {BUSINESS_NAME}, based in {OPERATING_COUNTRY}. For privacy questions,
        contact {SUPPORT_EMAIL}.
      </Section>

      <Section title="What the Service Does">
        {APP_NAME} is a business tool for managing distribution sales — order invoicing, distributor
        ledger tracking, and sales reporting — used internally by an operator's team.
      </Section>

      <Section title="Information We Collect">
        <strong>Account information:</strong> name, email, and a securely hashed password (the actual
        password is never stored) for each user account.<br /><br />
        <strong>Business data you enter:</strong> distributor contact details, product/manufacturer
        catalogs, order and invoice records, ledger/payment history, and any order notes.<br /><br />
        <strong>Technical/security data:</strong> basic request logs (timestamp, IP address, requested
        endpoint) used only to operate and secure the Service, not for tracking or profiling.<br /><br />
        <strong>We do not collect:</strong> payment card details (no payment processor is integrated),
        or any data through advertising/analytics trackers (none are used).
      </Section>

      <Section title="How We Use Information">
        Solely to operate the Service: authenticating users, enforcing role-based access, generating
        invoices/reports, maintaining the ledger, and securing the app. We do not sell data, use it for
        advertising, or share it with third parties except as described below.
      </Section>

      <Section title="Cookies">
        The Service uses exactly two cookies, both strictly necessary for the app to function — no
        analytics or advertising cookies. See the <Link to="/cookies" className="link-btn">Cookie Policy</Link> for full detail.
      </Section>

      <Section title="Third-Party Services">
        <strong>Google Drive (optional backup feature only):</strong> when an admin backs up data, files
        upload directly from their browser to their own Google Drive, using a Google sign-in required
        every time — nothing is cached or stored. This app's server never sees the admin's Google
        credentials or Drive contents. The permission requested is Google's narrowest scope
        (<code>drive.file</code>), which only lets the app manage files it creates itself. No other
        third-party services are integrated.
      </Section>

      <Section title="Data Retention">
        Business data (orders, ledger entries, distributor/product records) is retained for as long as
        {' '}{BUSINESS_NAME} operates the Service, since it constitutes the business's own operating
        records. Contact {SUPPORT_EMAIL} with account deletion requests.
      </Section>

      <Section title="Your Rights">
        You may have rights to access, correct, or request deletion of your personal account information
        (this does not extend to business records like orders/ledger entries, which belong to the
        operating business). If you have users in the EU/UK or California, additional rights under
        GDPR or CCPA may apply — {BUSINESS_NAME} should confirm specific compliance steps for those
        jurisdictions before serving users there.
      </Section>

      <Section title="Children's Privacy">
        The Service is a business tool not directed at children, and we do not knowingly collect data
        from children under 13 (or the relevant age of consent in your jurisdiction).
      </Section>

      <Section title="Security">
        Account passwords are hashed; sessions use httpOnly, CSRF-protected cookies; role-based access
        is enforced on every request; failed-login lockout and rate limiting protect against
        brute-force attempts. No security measure is perfect — no warranty of absolute security is made.
      </Section>

      <Section title="Changes to This Policy">
        Material changes will be communicated via the app or by email to admin accounts.
      </Section>

      <Section title="Contact">
        Privacy questions or data requests: {SUPPORT_EMAIL}.
      </Section>
    </LegalPageLayout>
  );
}
