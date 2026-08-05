export default function PlaceholderNotice() {
  return (
    <div style={{
      background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid var(--amber)',
      borderRadius: 8, padding: '12px 16px', fontSize: 13.5, marginBottom: 24, lineHeight: 1.6,
    }}>
      <strong>Not legal advice.</strong> This text was generated to match this app's actual
      features (not generic filler), but it's boilerplate, not a substitute for a lawyer.
      Bracketed placeholders like <code>[Operator Legal Name]</code> mark facts only you can fill
      in — edit <code>src/config.js</code> and this page. Have the final version reviewed by a
      qualified attorney before relying on it, especially once you have EU/California users or
      accept payments.
    </div>
  );
}
