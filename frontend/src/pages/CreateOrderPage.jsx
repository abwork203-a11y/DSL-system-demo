import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { Plus, Minus, Trash2, Loader2 } from 'lucide-react';
import { distributors as distributorsApi, products as productsApi, orders as ordersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const STEPS = ['Distributor', 'Items', 'Discount & Freight', 'Payment', 'Review'];

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [distributorsList, setDistributorsList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Mirrors `submitting`/`submitted` but updates synchronously (refs aren't
  // gated behind a React render/commit). Two things depend on reading the
  // truly-current value at the exact instant they're checked, not whatever
  // was true as of the last render:
  //  1. The double-submit guard at the top of handleSubmit — a fast second
  //     click can fire before React has re-rendered with `disabled={true}`
  //     on the button, so the guard has to check something that's already
  //     up to date the moment the first click's handler starts running.
  //  2. The unsaved-progress check the navigation blocker uses — without
  //     this, there's a real race: `setSubmitted(true)` and `navigate(...)`
  //     both run in the same batched continuation after the create request
  //     resolves, so the blocker could still evaluate against the
  //     not-yet-committed `submitted === false`, popping the "leave without
  //     saving?" confirmation right after a *successful* order creation and
  //     making it look like nothing happened.
  const submittingRef = useRef(false);
  const submittedRef = useRef(false);

  const [distributorId, setDistributorId] = useState('');
  const [distributorSearch, setDistributorSearch] = useState('');
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percentage'
  const [freightCost, setFreightCost] = useState('0');
  const [paymentTerm, setPaymentTerm] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('0');
  const [notes, setNotes] = useState('');

  // There's unsaved work worth protecting once the user has picked a
  // distributor or added at least one item — before that, leaving costs nothing.
  const hasUnsavedProgress = () => !submittedRef.current && (!!distributorId || items.length > 0);

  // Guards in-app navigation (clicking the sidebar, going back, etc.)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedProgress() && currentLocation.pathname !== nextLocation.pathname
  );

  // Guards actual tab close / browser refresh — a separate mechanism from
  // React Router, since the browser itself controls that moment.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!hasUnsavedProgress()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorId, items]);

  useEffect(() => {
    distributorsApi.list({ status: 'active' }).then((res) => setDistributorsList(res.data)).catch((err) => toast.error(apiErrorMessage(err)));
    productsApi.list({ is_active: 'true' }).then((res) => setProductsList(res.data)).catch((err) => toast.error(apiErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0),
    [items]
  );

  // The actual dollar amount being discounted, regardless of which mode is
  // active — this is what should always be subtracted from the subtotal and
  // what should always be shown to the user, never the raw percentage number.
  const discountAmount = useMemo(() => {
    const raw = Number(discount || 0);
    if (discountType === 'percentage') return subtotal * (raw / 100);
    return raw;
  }, [discount, discountType, subtotal]);

  const total = useMemo(
    () => Math.max(0, subtotal - discountAmount + Number(freightCost || 0)),
    [subtotal, discountAmount, freightCost]
  );

  const filteredDistributors = useMemo(() => {
    const q = distributorSearch.trim().toLowerCase();
    if (!q) return distributorsList;
    return distributorsList.filter((d) => d.name.toLowerCase().includes(q));
  }, [distributorsList, distributorSearch]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productsList;
    return productsList.filter((p) => p.name.toLowerCase().includes(q));
  }, [productsList, productSearch]);

  const selectDistributor = (d) => {
    setDistributorId(String(d.id));
    setDistributorSearch(d.name);
  };

  const addItem = (product) => {
    if (items.some((it) => it.product_id === product.id)) {
      toast.error('That product is already on this order — adjust its quantity instead.');
      return;
    }
    setItems([...items, {
      product_id: product.id,
      name: product.name,
      manufacturer_name: product.manufacturer_name,
      size_packaging: product.size_packaging,
      price: Number(product.price),
      retail_price: Number(product.retail_price),
      quantity: 1,
    }]);
  };

  const updateQty = (productId, qty) => {
    if (qty < 1) {
      removeItem(productId);
      return;
    }
    setItems(items.map((it) => (it.product_id === productId ? { ...it, quantity: qty } : it)));
  };
  const removeItem = (productId) => setItems(items.filter((it) => it.product_id !== productId));

  const canProceed = () => {
    if (step === 0) return !!distributorId;
    if (step === 1) return items.length > 0 && items.every((it) => Number(it.quantity) > 0);
    if (step === 3) return Number(amountPaid) <= total;
    return true;
  };

  const handleSubmit = async () => {
    // Belt-and-suspenders double-submit guard: the button's `disabled`
    // attribute already covers the normal case, but that only takes effect
    // after React re-renders — a fast enough double-click (or a second
    // Enter-key submit) can still fire before that render commits. Checking
    // a ref here is synchronous and closes that gap completely.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await ordersApi.create({
        distributor_id: Number(distributorId),
        items: items.map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity) })),
        discount: Number(discount || 0),
        discount_type: discountType,
        freight_cost: Number(freightCost || 0),
        payment_term: paymentTerm,
        amount_paid: Number(amountPaid || 0),
        notes: notes || undefined,
      });
      // Set synchronously BEFORE navigating — see the comment on
      // submittedRef above for why this can't just be the `submitted`
      // state variable.
      submittedRef.current = true;
      setSubmitted(true);
      toast.success(`Order ${res.data.order_number} created.`);
      navigate(`/orders/${res.data.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      submittingRef.current = false; // allow retrying after a failure
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDistributor = distributorsList.find((d) => d.id === Number(distributorId));

  return (
    <div className="content" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h1>New Order</h1>
          <p>Create an order, apply discount/freight, and generate the invoice.</p>
        </div>
      </div>

      <div className="stepper">
        {STEPS.map((label, i) => (
          <div key={label} className={`stepper-item${i === step ? ' active' : i < step ? ' done' : ''}`}>
            {label}
          </div>
        ))}
      </div>

      <div className="card">
        {step === 0 && (
          <div>
            <h2 style={{ marginBottom: 14 }}>Select Distributor</h2>
            <div className="field">
              <label>Distributor</label>
              <input
                type="text"
                placeholder="Search distributors by name…"
                value={distributorSearch}
                onChange={(e) => {
                  setDistributorSearch(e.target.value);
                  // Typing again after a selection means the user is looking
                  // for someone else — clear the stale selection until they
                  // click a row again.
                  if (distributorId) setDistributorId('');
                }}
              />
            </div>
            <div className="table-wrap" style={{ maxHeight: 280, height: 'auto' }}>
              <table className="data-table">
                <tbody>
                  {filteredDistributors.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => selectDistributor(d)}
                      style={{
                        cursor: 'pointer',
                        background: d.id === Number(distributorId) ? 'var(--surface-sunken)' : undefined,
                      }}
                    >
                      <td><strong>{d.name}</strong></td>
                      <td>{[d.zone, d.city].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="num">{money(d.balance)}</td>
                    </tr>
                  ))}
                  {filteredDistributors.length === 0 && (
                    <tr><td colSpan={3}><div className="empty-state">No distributors match "{distributorSearch}".</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {selectedDistributor && (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 12 }}>
                Selected: <strong>{selectedDistributor.name}</strong> — current balance: <span className="num">{money(selectedDistributor.balance)}</span>
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ marginBottom: 14 }}>Add Products</h2>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginBottom: 12 }}>
              Manufacturer is inherited per product — you can mix products from multiple manufacturers on one order.
            </p>

            <div className="toolbar" style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Search products…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            <div className="table-wrap" style={{ maxHeight: 260, height: 'auto', marginBottom: 20 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Manufacturer</th>
                    <th>Size/Packaging</th>
                    <th className="num">Retail Price</th>
                    <th className="num">Invoice Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const alreadyAdded = items.some((it) => it.product_id === p.id);
                    return (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.manufacturer_name}</td>
                        <td>{p.size_packaging || '—'}</td>
                        <td className="num">{money(p.retail_price)}</td>
                        <td className="num">{money(p.price)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={alreadyAdded}
                            onClick={() => addItem(p)}
                            title={alreadyAdded ? 'Already on this order' : 'Add to order'}
                          >
                            <Plus size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-state">No products match "{productSearch}".</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="order-builder-divider">
              <h3>Added to order ({items.length})</h3>
            </div>

            {items.length > 0 ? (
              <div className="table-wrap added-products-list">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Manufacturer</th>
                      <th className="num">Price</th>
                      <th className="num">Qty</th>
                      <th className="num">Line Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.product_id} className="added-product-row">
                        <td>{it.name}{it.size_packaging ? <span style={{ color: 'var(--ink-muted)' }}> ({it.size_packaging})</span> : ''}</td>
                        <td>{it.manufacturer_name}</td>
                        <td className="num">{money(it.price)}</td>
                        <td className="num">
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-label="Decrease quantity"
                              onClick={() => updateQty(it.product_id, Number(it.quantity) - 1)}
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              className="qty-input"
                              key={`qty-${it.product_id}-${it.quantity}`}
                              defaultValue={it.quantity}
                              aria-label={`Quantity for ${it.name}`}
                              onFocus={(e) => e.target.select()}
                              onBlur={(e) => updateQty(it.product_id, Number(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.target.blur();
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-label="Increase quantity"
                              onClick={() => updateQty(it.product_id, Number(it.quantity) + 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="num">{money(it.price * it.quantity)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-ghost btn btn-sm"
                            aria-label="Remove item"
                            onClick={() => removeItem(it.product_id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">No items added yet.</div>
            )}

            {items.length > 0 && (
              <p style={{ textAlign: 'right', marginTop: 14, fontSize: 15 }}>
                Subtotal: <strong className="num">{money(subtotal)}</strong>
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ marginBottom: 14 }}>Discount &amp; Freight</h2>

            <div className="field">
              <label>Discount Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={discountType === 'fixed' ? 'btn' : 'btn btn-secondary'}
                  onClick={() => setDiscountType('fixed')}
                >
                  Fixed Amount
                </button>
                <button
                  type="button"
                  className={discountType === 'percentage' ? 'btn' : 'btn btn-secondary'}
                  onClick={() => setDiscountType('percentage')}
                >
                  Percentage
                </button>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>{discountType === 'percentage' ? 'Discount (%)' : 'Discount'}</label>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                {discountType === 'percentage' && (
                  <p style={{ color: 'var(--ink-muted)', fontSize: 12.5, marginTop: 4 }}>
                    {Number(discount || 0)}% of {money(subtotal)} = {money(discountAmount)} off
                  </p>
                )}
              </div>
              <div className="field">
                <label>Freight / Transport Cost</label>
                <input type="number" min="0" step="0.01" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.9, marginTop: 8 }}>
              <div>Subtotal: <span className="num" style={{ float: 'right' }}>{money(subtotal)}</span></div>
              <div>Discount Amount: <span className="num" style={{ float: 'right' }}>{money(discountAmount)}</span></div>
              <div>Freight: <span className="num" style={{ float: 'right' }}>{money(freightCost)}</span></div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 600 }}>
                Total: <span className="num" style={{ float: 'right' }}>{money(total)}</span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ marginBottom: 14 }}>Payment</h2>
            <div className="field">
              <label>Payment Term</label>
              <select value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="field">
              <label>Amount Paid Now (leave 0 for fully unpaid / credit order)</label>
              <input type="number" min="0" max={total} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
            </div>
            <div className="field">
              <label>Notes (optional)</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
              Order total is <span className="num">{money(total)}</span>. Payment status will be set automatically based on the amount paid.
            </p>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 style={{ marginBottom: 14 }}>Review</h2>
            <div style={{ fontSize: 14, lineHeight: 2 }}>
              <div><strong>Distributor:</strong> {selectedDistributor?.name}</div>
              <div><strong>Items:</strong> {items.length}</div>
              <div><strong>Payment Term:</strong> <span style={{ textTransform: 'capitalize' }}>{paymentTerm}</span></div>
              <div><strong>Amount Paid Now:</strong> <span className="num">{money(amountPaid)}</span></div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.9, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div>Subtotal: <span className="num" style={{ float: 'right' }}>{money(subtotal)}</span></div>
              <div>
                Discount{discountType === 'percentage' ? ` (${Number(discount || 0)}%)` : ''}:
                <span className="num" style={{ float: 'right' }}>−{money(discountAmount)}</span>
              </div>
              <div>Freight: <span className="num" style={{ float: 'right' }}>+{money(freightCost)}</span></div>
              <div style={{ fontWeight: 600, fontSize: 16, marginTop: 4 }}>
                Total: <span className="num" style={{ float: 'right' }}>{money(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {step < STEPS.length - 1 ? (
          <button className="btn" disabled={!canProceed()} onClick={() => setStep(step + 1)}>Continue</button>
        ) : (
          <button className="btn" disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 size={16} className="spin" />}
            {submitting ? 'Creating order…' : 'Create Order & Generate Invoice'}
          </button>
        )}
      </div>

      {blocker.state === 'blocked' && (
        <Modal title="Leave without saving?" onClose={() => blocker.reset()} width={420}>
          <p style={{ color: 'var(--ink-muted)', marginBottom: 20 }}>
            This order hasn't been created yet — going back now will lose everything you've entered.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => blocker.reset()}>Stay on this page</button>
            <button className="btn btn-danger" onClick={() => blocker.proceed()}>Leave anyway</button>
          </div>
        </Modal>
      )}
    </div>
  );
}