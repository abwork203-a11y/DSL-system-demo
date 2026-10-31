// Read-only, filled-in copy of the form a sales rep submitted (new distributor
// or order). Mirrors the labels/layout of DistributorsPage's and
// CreateOrderPage's forms so the admin reviews exactly what the rep entered.

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, value, multiline = false }) {
  const shown = value === undefined || value === null || value === '' ? '—' : String(value);
  return (
    <div className="field">
      <label>{label}</label>
      {multiline ? (
        <textarea rows={2} readOnly value={shown} />
      ) : (
        <input type="text" readOnly value={shown} />
      )}
    </div>
  );
}

export default function RequestDetailsForm({ request, productName, productPrice, overridePrices, zoneName }) {
  const p = request.payload || {};

  if (request.type === 'distributor_create') {
    return (
      <div className="request-form">
        <Field label="Name" value={p.name} />
        <div className="field-row">
          <Field label="Contact Name" value={p.contact_name} />
          <Field label="Contact Phone" value={p.contact_phone} />
        </div>
        <Field label="Contact Email" value={p.contact_email} />
        <Field label="Address" value={p.address} />
        <div className="field-row">
          <Field label="Zone" value={zoneName(p.zone_id)} />
          <Field label="Region" value={p.region} />
        </div>
        <div className="field-row">
          <Field label="City" value={p.city} />
          <Field label="Area" value={p.area} />
        </div>
      </div>
    );
  }

  if (request.type === 'order') {
    const items = Array.isArray(p.items) ? p.items : [];
    const lines = items.map((it) => {
      const unit = (it.price_override_id && overridePrices?.get(it.price_override_id)) ?? (productPrice.get(it.product_id) || 0);
      return { ...it, unit, line: unit * Number(it.quantity || 0) };
    });
    const subtotal = lines.reduce((s, l) => s + l.line, 0);
    const discount = Number(p.discount || 0);
    const isPct = p.discount_type === 'percentage';
    const discountAmount = isPct ? (subtotal * discount) / 100 : discount;
    const freight = Number(p.freight_cost || 0);
    const total = Math.max(0, subtotal - discountAmount + freight);

    return (
      <div className="request-form">
        <Field label="Distributor" value={request.distributor_name} />

        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Qty</th>
                <th className="num">Price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td data-label="Product">
                    {productName.get(l.product_id) || `Product #${l.product_id}`}
                    {l.price_override_id ? <span className="badge badge-amber" style={{ marginLeft: 8 }}>Special price</span> : null}
                  </td>
                  <td className="num" data-label="Qty">{l.quantity}</td>
                  <td className="num" data-label="Price">{money(l.unit)}</td>
                  <td className="num" data-label="Amount">{money(l.line)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={4}><div className="empty-state">No items.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="field-row">
          <Field label="Discount Type" value={isPct ? 'Percentage' : 'Fixed amount'} />
          <Field label={isPct ? 'Discount (%)' : 'Discount'} value={money(discount)} />
        </div>
        <div className="field-row">
          <Field label="Freight / Transport Cost" value={money(freight)} />
          <Field label="Payment Term" value={p.payment_term} />
        </div>
        <Field label="Amount Paid Now" value={money(p.amount_paid)} />
        <Field label="Notes" value={p.notes} multiline />

        <div className="request-form-total">
          <span>Estimated total</span>
          <strong className="num">{money(total)}</strong>
        </div>
        <p className="request-form-hint">Prices shown are current catalog prices (or the approved special price); the final total is computed when you approve.</p>
      </div>
    );
  }

  return null;
}
