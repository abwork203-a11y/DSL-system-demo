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

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service">
      <PlaceholderNotice />

      <Section title="Agreement to Terms">
        By accessing or using {APP_NAME} (the "Service"), operated by {BUSINESS_NAME} ("we," "us," "our"),
        you agree to these Terms of Service. If you're using the Service on behalf of a business, you're
        agreeing on that business's behalf and confirming you have the authority to do so.
      </Section>

      <Section title="Description of the Service">
        The Service is a business management tool for distribution sales: creating and invoicing orders,
        tracking distributor account balances via a running ledger, and reporting on sales performance.
        It is provided for internal business use by the operator and its authorized users.
      </Section>

      <Section title="Eligibility">
        The Service is intended for business use by adults (18+) acting on behalf of an organization.
        It is not directed at, or intended for use by, children.
      </Section>

      <Section title="Accounts">
        Accounts are created by an administrator, not through public self-signup. Two roles exist:
        <strong> Admin</strong> (full access) and <strong>Sales Rep</strong> (restricted access). You're
        responsible for keeping your login credentials confidential and for all activity under your
        account. Notify {BUSINESS_NAME} immediately at {SUPPORT_EMAIL} if you suspect unauthorized access.
      </Section>

      <Section title="Acceptable Use">
        You agree not to: use the Service for any unlawful purpose; attempt to gain unauthorized access
        to accounts, data, or systems beyond what your role permits; interfere with or disrupt the
        Service's operation; or use the Service to store or transmit data you don't have the right to hold.
      </Section>

      <Section title="Data Ownership">
        All business data you enter into the Service — distributor records, orders, ledger entries,
        product catalogs — belongs to {BUSINESS_NAME}, not to individual users who happen to enter it.
        Individual accounts exist to control access to that data, not to claim ownership of it.
      </Section>

      <Section title="Third-Party Services">
        The Service integrates with <strong>Google Drive</strong> for an optional backup feature. Files
        upload directly from an admin's browser to their own Google Drive, governed by{' '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Google's Terms</a>{' '}
        and <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        This app has no control over data once it's in Google's systems.
      </Section>

      <Section title='No Warranty / "As Is"'>
        The Service is provided "as is" and "as available," without warranties of any kind, including
        fitness for a particular purpose or merchantability. There is currently no formal Service Level
        Agreement (SLA).
      </Section>

      <Section title="Limitation of Liability">
        To the fullest extent permitted by law, {BUSINESS_NAME} will not be liable for any indirect,
        incidental, special, or consequential damages arising from use of the Service, including lost
        profits, lost data, or business interruption.
      </Section>

      <Section title="Indemnity">
        You agree to indemnify and hold {BUSINESS_NAME} harmless from claims, damages, or expenses
        arising from your misuse of the Service or violation of these Terms.
      </Section>

      <Section title="Intellectual Property">
        The Service's software, design, and branding belong to {BUSINESS_NAME} (or its licensors) and
        are not transferred to you by using the Service. This does not apply to your own business data.
      </Section>

      <Section title="Termination">
        {BUSINESS_NAME} may suspend or terminate access, including for violation of these Terms, with
        or without notice. You may stop using the Service at any time; contact {SUPPORT_EMAIL} regarding
        export or deletion of your data beforehand.
      </Section>

      <Section title="Governing Law">
        These Terms are governed by the laws of {OPERATING_COUNTRY}, without regard to conflict-of-law
        principles.
      </Section>

      <Section title="Changes to These Terms">
        We may update these Terms from time to time. Material changes will be communicated via the app
        or by email to admin accounts.
      </Section>

      <Section title="Contact">
        Questions about these Terms: {SUPPORT_EMAIL}.
      </Section>
    </LegalPageLayout>
  );
}
