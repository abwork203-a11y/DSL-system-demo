import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
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

  const [distributorId, setDistributorId] = useState('');
  const [items, setItems] = useState([]);
  const [productToAdd, setProductToAdd] = useState('');
  const [discount, setDiscount] = useState('0');
  const [freightCost, setFreightCost] = useState('0');
  const [paymentTerm, setPaymentTerm] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('0');
  const [notes, setNotes] = useState('');

  // There's unsaved work worth protecting once the user has picked a
  // distributor or added at least one item — before that, leaving costs nothing.
  const hasUnsavedProgress = !submitted && (!!distributorId || items.length > 0);

  // Guards in-app navigation (clicking the sidebar, going back, etc.)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedProgress && currentLocation.pathname !== nextLocation.pathname
  );

  // Guards actual tab close / browser refresh — a separate mechanism from
  // React Router, since the browser itself controls that moment.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!hasUnsavedProgress) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedProgress]);

  useEffect(() => {
    distributorsApi.list({ status: 'active' }).then((res) => setDistributorsList(res.data)).catch((err) => toast.error(apiErrorMessage(err)));
    productsApi.list({ is_active: 'true' }).then((res) => setProductsList(res.data)).catch((err) => toast.error(apiErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0),
    [items]
  );
  const total = useMemo(
    () => Math.max(0, subtotal - Number(discount || 0) + Number(freightCost || 0)),
    [subtotal, discount, freightCost]
  );

  const addItem = () => {
    if (!productToAdd) return;
    const product = productsList.find((p) => p.id === Number(productToAdd));
    if (!product) return;
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
      quantity: 1,
    }]);
    setProductToAdd('');
  };

  const updateQty = (productId, qty) => {
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
    setSubmitting(true);
    try {
      const res = await ordersApi.create({
        distributor_id: Number(distributorId),
        items: items.map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity) })),
        discount: Number(discount || 0),
        freight_cost: Number(freightCost || 0),
        payment_term: paymentTerm,
        amount_paid: Number(amountPaid || 0),
        notes: notes || undefined,
      });
      setSubmitted(true);
      toast.success(`Order ${res.data.order_number} created.`);
      navigate(`/orders/${res.data.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
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
              <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)}>
                <option value="" disabled>Select a distributor</option>
                {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {selectedDistributor && (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                Current balance: <span className="num">{money(selectedDistributor.balance)}</span>
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
            <div className="toolbar" style={{ marginBottom: 18 }}>
              <select value={productToAdd} onChange={(e) => setProductToAdd(e.target.value)} style={{ minWidth: 260 }}>
                <option value="" disabled>Select a product to add…</option>
                {productsList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.manufacturer_name} ({money(p.price)})</option>
                ))}
              </select>
              <button className="btn btn-secondary" type="button" onClick={addItem}>Add</button>
            </div>

            {items.length > 0 ? (
              <div className="table-wrap">
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
                      <tr key={it.product_id}>
                        <td>{it.name}{it.size_packaging ? <span style={{ color: 'var(--ink-muted)' }}> ({it.size_packaging})</span> : ''}</td>
                        <td>{it.manufacturer_name}</td>
                        <td className="num">{money(it.price)}</td>
                        <td className="num">
                          <input
                            type="number" min="1" step="1" value={it.quantity}
                            onChange={(e) => updateQty(it.product_id, e.target.value)}
                            style={{ width: 64, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px' }}
                          />
                        </td>
                        <td className="num">{money(it.price * it.quantity)}</td>
                        <td><button className="btn-ghost btn btn-sm" onClick={() => removeItem(it.product_id)}>Remove</button></td>
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
            <div className="field-row">
              <div className="field">
                <label>Discount</label>
                <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="field">
                <label>Freight / Transport Cost</label>
                <input type="number" min="0" step="0.01" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.9, marginTop: 8 }}>
              <div>Subtotal: <span className="num" style={{ float: 'right' }}>{money(subtotal)}</span></div>
              <div>Discount: <span className="num" style={{ float: 'right' }}>−{money(discount)}</span></div>
              <div>Freight: <span className="num" style={{ float: 'right' }}>+{money(freightCost)}</span></div>
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
              <div>Discount: <span className="num" style={{ float: 'right' }}>−{money(discount)}</span></div>
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
