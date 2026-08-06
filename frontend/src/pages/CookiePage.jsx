import LegalPageLayout from '../components/LegalPageLayout';
import PlaceholderNotice from '../components/PlaceholderNotice';
import { SUPPORT_EMAIL } from '../config';

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ color: 'var(--ink-muted)', fontSize: 13.5, lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

export default function CookiePage() {
  return (
    <LegalPageLayout title="Cookie Policy">

      <Section title="What Cookies Are">
        Cookies are small text files a website stores in your browser, used to remember information
        between visits or requests.
      </Section>

      <Section title="Cookies This App Uses">
        <div className="table-wrap" style={{ marginTop: 4 }}>
          <table className="data-table">
            <thead>
              <tr><th>Cookie</th><th>Type</th><th>Purpose</th><th>Duration</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>dsl_session</code></td>
                <td>Strictly necessary</td>
                <td>Keeps you signed in. Set as <code>httpOnly</code> — not readable by any JavaScript, including this app's own frontend code.</td>
                <td>8 hours, or until logout</td>
              </tr>
              <tr>
                <td><code>csrf_token</code></td>
                <td>Strictly necessary</td>
                <td>Security token confirming requests actually came from this app's own frontend, preventing cross-site request forgery.</td>
                <td>Session-length</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 10 }}>
          That's the complete list. This app does not use analytics cookies, advertising/tracking
          cookies, or any other third-party cookies of its own.
        </p>
      </Section>

      <Section title="Third-Party Cookies">
        The only third party involved at all is <strong>Google</strong>, and only during the optional
        Drive backup flow: while the Google sign-in popup is open, Google may set its own cookies in
        that window, governed entirely by{' '}
        <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener noreferrer">Google's cookie policy</a>.
        These are not set by, or on behalf of, this app.
      </Section>

      <Section title="Managing Cookies">
        Because both of this app's cookies are strictly necessary for login to function, disabling them
        will prevent you from staying signed in. To clear them, use your browser's standard cookie
        management (usually under Settings → Privacy).
      </Section>

      <Section title="A Note on Cookie Consent Banners">
        Since this app uses only strictly-necessary cookies, a cookie-consent banner is generally not
        legally required under EU/UK ePrivacy rules, which exempt cookies strictly necessary for a
        service the user requested (like staying logged in). Confirm this with a lawyer if serving
        EU/UK users, and revisit immediately if analytics or advertising cookies are ever added.
      </Section>

      <Section title="Contact">
        Questions about cookies: {SUPPORT_EMAIL}.
      </Section>
    </LegalPageLayout>
  );
}
