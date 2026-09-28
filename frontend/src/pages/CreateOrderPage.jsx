import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useBlocker, useLocation, Link } from 'react-router-dom';
import { Plus, Minus, Loader2, ArrowLeft, X, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { distributors as distributorsApi, products as productsApi, orders as ordersApi, reports } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Modal from '../components/Modal';
import { LoadingModal, SavingModal } from '../components/StatusModals';
import { newDraftId, getDraft, saveDraft, saveDraftBeacon, deleteDraft, ORDER_STEPS as STEPS } from '../utils/orderDrafts';
import { fetchAllPages } from '../utils/fetchAllPages';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const [step, setStep] = useState(0);
  const [distributorsList, setDistributorsList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  // IDs of the best-selling products, best first. Used to float them to the
  // top of the product picker and mark them with a star.
  const [topSellerIds, setTopSellerIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // Only meaningful on narrow screens, where the "Added to Order" panel
  // becomes a slide-in drawer instead of a fixed side column — see the
  // order-builder-cart / order-cart-toggle CSS.
  const [cartOpen, setCartOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [discarding, setDiscarding] = useState(false);
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
  // Assigned on first save (or immediately, if resuming an existing draft) —
  // every save after that updates the same localStorage record instead of
  // creating a new one each time.
  const draftIdRef = useRef(null);

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

  // Snapshot of everything needed to resume later. Deliberately excludes
  // productSearch/distributorsList/productsList — those are either ephemeral
  // UI state or re-fetched fresh on load, not user input worth persisting.
  const buildDraftData = () => ({
    step,
    distributorId,
    distributorSearch,
    distributorName: selectedDistributor?.name || distributorSearch || '',
    items,
    discount,
    discountType,
    freightCost,
    paymentTerm,
    amountPaid,
    notes,
  });

  // Persisted server-side now (see utils/orderDrafts.js / backend's
  // order_drafts table) instead of localStorage — every save after the
  // first updates the same row rather than creating a new one.
  const saveDraftNow = async () => {
    if (!hasUnsavedProgress()) return;
    if (!draftIdRef.current) draftIdRef.current = newDraftId();
    await saveDraft({ id: draftIdRef.current, ...buildDraftData() });
  };

  // Guards in-app navigation (clicking the sidebar, going back, etc.)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedProgress() && currentLocation.pathname !== nextLocation.pathname
  );

  // Guards actual tab close / browser refresh — a separate mechanism from
  // React Router, since the browser itself controls that moment. A normal
  // async save can't be trusted to finish before the tab actually closes,
  // so this uses navigator.sendBeacon() instead (see saveDraftBeacon in
  // utils/orderDrafts.js) — the one save path guaranteed to be attempted
  // even as the page is being torn down.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!hasUnsavedProgress()) return;
      if (!draftIdRef.current) draftIdRef.current = newDraftId();
      saveDraftBeacon({ id: draftIdRef.current, ...buildDraftData() });
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    // Deliberately broad: this needs to re-register with a fresh closure
    // whenever any field that ends up in the draft snapshot changes, or a
    // real close event could save stale values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, distributorId, distributorSearch, items, discount, discountType, freightCost, paymentTerm, amountPaid, notes]);

  // Resuming a draft: OrdersPage navigates here with { state: { resumeDraftId } }.
  useEffect(() => {
    const resumeId = location.state?.resumeDraftId;
    if (!resumeId) return;

    let cancelled = false;

    (async () => {
      let draft;
      try {
        draft = await getDraft(resumeId);
      } catch (err) {
        if (!cancelled) toast.error(apiErrorMessage(err));
        return;
      }
      if (cancelled || !draft) return;

      draftIdRef.current = draft.id;
      setStep(draft.step ?? 0);
      setDistributorId(draft.distributorId ?? '');
      setDistributorSearch(draft.distributorSearch ?? draft.distributorName ?? '');
      setItems(Array.isArray(draft.items) ? draft.items : []);
      setDiscount(draft.discount ?? '0');
      setDiscountType(draft.discountType ?? 'fixed');
      setFreightCost(draft.freightCost ?? '0');
      setPaymentTerm(draft.paymentTerm ?? 'cash');
      setAmountPaid(draft.amountPaid ?? '0');
      setNotes(draft.notes ?? '');
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAllPages(distributorsApi.list, { status: 'active' }).then(setDistributorsList).catch((err) => toast.error(apiErrorMessage(err)));
    fetchAllPages(productsApi.list, { is_active: 'true' }).then(setProductsList).catch((err) => toast.error(apiErrorMessage(err)));
    // Nice-to-have only: if this fails (e.g. no permission), the picker just
    // shows products in their normal order, so no error toast here.
    reports.topProducts(5).then((res) => setTopSellerIds(res.data.map((row) => row.id))).catch(() => {});
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

  // id -> rank (0 = best seller). A Map makes "is this a favourite?" a fast lookup.
  const topSellerRank = useMemo(
    () => new Map(topSellerIds.map((id, index) => [id, index])),
    [topSellerIds]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const matches = q ? productsList.filter((p) => p.name.toLowerCase().includes(q)) : productsList;
    if (topSellerRank.size === 0) return matches;

    // Favourites first (best seller at the very top), everyone else keeps
    // their existing order. Array.sort is stable, so returning 0 for two
    // non-favourites leaves them exactly where they were.
    return [...matches].sort((a, b) => {
      const rankA = topSellerRank.has(a.id) ? topSellerRank.get(a.id) : Infinity;
      const rankB = topSellerRank.has(b.id) ? topSellerRank.get(b.id) : Infinity;
      if (rankA === rankB) return 0;
      return rankA - rankB;
    });
  }, [productsList, productSearch, topSellerRank]);

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
      if (draftIdRef.current) deleteDraft(draftIdRef.current).catch(() => {});
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
    <div className="content" style={{ maxWidth:980 }}>
      <div className="page-header">
        <div>
          <Link to="/orders" className="link-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10, fontSize: 13 }}>
            <ArrowLeft size={14} /> Leave Order Page
          </Link>
          <h1>New Order</h1>
          <p>Create an order, apply discount/freight, and generate the invoice.</p>
        </div>
      </div>

      <div className="stepper">
        {STEPS.map((label, i) => (
          <div key={label} className={`stepper-item${i === step ? ' active' : i < step ? ' done' : ''}`}>
            <span className="stepper-number">{i + 1}</span>
            <span className="stepper-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="card">
        {step === 0 && (
          <div>
            <h2>Select Distributor</h2>
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
            <div className="table-wrap" style={{ maxHeight: 260, height: 'auto' }}>
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
          <div className="order-builder-layout">
            <div className="order-builder-main">
              <h2>Add Products</h2>
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

              <div className="list-cards order-product-list">
                {filteredProducts.map((p) => {
                  const alreadyAdded = items.some((it) => it.product_id === p.id);
                  return (
                    <div
                      key={p.id}
                      className={`pill-card order-pick-card${alreadyAdded ? ' order-pick-card-added' : ''}`}
                      role="button"
                      tabIndex={alreadyAdded ? -1 : 0}
                      aria-disabled={alreadyAdded}
                      title={alreadyAdded ? 'Already on this order' : 'Tap to add to order'}
                      onClick={() => { if (!alreadyAdded) addItem(p); }}
                      onKeyDown={(e) => {
                        if (alreadyAdded) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addItem(p);
                        }
                      }}
                    >
                      <div className="pill-card-left">
                        <div className="pill-card-name">
                          <span>
                            {p.name}
                            {topSellerRank.has(p.id) && (
                              <Star size={14} className="favourite-star favourite-star-inline" aria-label="Best seller" />
                            )}
                          </span>
                        </div>
                        <div className="pill-card-sub">{p.manufacturer_name}</div>
                        {p.size_packaging && <div className="pill-card-meta">{p.size_packaging}</div>}
                      </div>
                      <div className="pill-card-divider" />
                      <div className="pill-card-rows">
                        <div className="pill-card-row">
                          <span className="pill-card-row-label">Retail Price</span>
                          <span className="pill-card-row-value">{money(p.retail_price)}</span>
                        </div>
                        <div className="pill-card-row pill-card-row-muted">
                          <span className="pill-card-row-label">Invoice Price</span>
                          <span className="pill-card-row-value">{money(p.price)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div className="empty-state">No products match "{productSearch}".</div>
                )}
              </div>

              <div className="table-wrap" style={{ maxHeight: 260, height: 'auto' }}>
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
                          <td data-label="Product">
                            <span className="favourite-name">
                              {topSellerRank.has(p.id) && (
                                <Star size={14} className="favourite-star" aria-label="Best seller" />
                              )}
                              {p.name}
                            </span>
                          </td>
                          <td data-label="Manufacturer">{p.manufacturer_name}</td>
                          <td data-label="Size/Packaging">{p.size_packaging || '—'}</td>
                          <td className="num" data-label="Retail Price">{money(p.retail_price)}</td>
                          <td className="num" data-label="Invoice Price">{money(p.price)}</td>
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
            </div>

            {/* Dims the rest of the page and closes the drawer when clicked —
                only exists in the DOM while the drawer is open, so it can
                never block clicks the rest of the time. */}
            {cartOpen && (
              <div className="order-cart-overlay" onClick={() => setCartOpen(false)} />
            )}

            <button
              type="button"
              className={`order-cart-toggle${cartOpen ? ' is-open' : ''}`}
              onClick={() => setCartOpen((v) => !v)}
              aria-label={cartOpen ? 'Hide added items' : 'Show added items'}
              aria-expanded={cartOpen}
            >
              {cartOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              {items.length > 0 && <span className="order-cart-toggle-badge">{items.length}</span>}
            </button>

            <div className={`order-builder-cart${cartOpen ? ' is-open' : ''}`}>
              <div className="order-builder-divider">
                <h3>Added to order ({items.length})</h3>
              </div>

              {items.length > 0 ? (
                <>
                  <div className="list-cards order-product-list">
                    {items.map((it) => (
                      <div key={it.product_id} className="pill-card order-added-card added-product-row">
                        <button
                          type="button"
                          className="order-remove-btn"
                          aria-label="Remove item"
                          onClick={() => removeItem(it.product_id)}
                        >
                          <X size={14} strokeWidth={3} />
                        </button>
                        <div className="pill-card-left">
                          <div className="pill-card-name">{it.name}</div>
                          <div className="pill-card-sub">{it.manufacturer_name}</div>
                          {it.size_packaging && <div className="pill-card-meta">{it.size_packaging}</div>}
                        </div>
                        <div className="pill-card-divider" />
                        <div className="pill-card-rows">
                          <div className="pill-card-row pill-card-row-muted">
                            <span className="pill-card-row-label">Invoice Price</span>
                            <span className="pill-card-row-value">{money(it.price)}</span>
                          </div>
                          <div className="pill-card-row">
                            <span className="pill-card-row-label">QTY</span>
                            <div className="pill-card-row-value order-qty-stepper">
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
                          </div>
                          <div className="pill-card-row">
                            <span className="pill-card-row-label">Total Price</span>
                            <span className="pill-card-row-value">{money(it.price * it.quantity)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Manufacturer</th>
                          <th className="num">Invoice Price</th>
                          <th className="num">Qty</th>
                          <th className="num">Total Price</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.product_id} className="added-product-row">
                            <td data-label="Product">{it.name}{it.size_packaging ? <span style={{ color: 'var(--ink-muted)' }}> ({it.size_packaging})</span> : ''}</td>
                            <td data-label="Manufacturer">{it.manufacturer_name}</td>
                            <td className="num" data-label="Invoice Price">{money(it.price)}</td>
                            <td className="num" data-label="Qty">
                              <div className="order-qty-stepper" style={{ justifyContent: 'flex-start' }}>
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
                            <td className="num" data-label="Total Price">{money(it.price * it.quantity)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-ghost"
                                aria-label="Remove item"
                                onClick={() => removeItem(it.product_id)}
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-state">No items added yet.</div>
              )}

              {items.length > 0 && (
                <p style={{ textAlign: 'right', marginTop: 28, fontSize: 15 }}>
                  Subtotal: <strong className="num">{money(subtotal)}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2>Discount &amp; Freight</h2>

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
            <div className="order-summary">
              <div className="order-summary-row">
                <span>Subtotal</span>
                <span className="num">{money(subtotal)}</span>
              </div>
              <div className="order-summary-row">
                <span>Discount</span>
                <span className="num">−{money(discountAmount)}</span>
              </div>
              <div className="order-summary-row">
                <span>Freight</span>
                <span className="num">+{money(freightCost)}</span>
              </div>
              <div className="order-summary-row order-summary-total">
                <span>Total</span>
                <span className="num">{money(total)}</span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2>Payment</h2>
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
            <h2>Review</h2>
            <div style={{ fontSize: 14, lineHeight: 2 }}>
              <div><strong>Distributor:</strong> {selectedDistributor?.name}</div>
              <div><strong>Items:</strong> {items.length}</div>
              <div><strong>Payment Term:</strong> <span style={{ textTransform: 'capitalize' }}>{paymentTerm}</span></div>
              <div><strong>Amount Paid Now:</strong> <span className="num">{money(amountPaid)}</span></div>
            </div>
            <div className="order-summary">
              <div className="order-summary-row">
                <span>Subtotal</span>
                <span className="num">{money(subtotal)}</span>
              </div>
              <div className="order-summary-row">
                <span>Discount{discountType === 'percentage' ? ` (${Number(discount || 0)}%)` : ''}</span>
                <span className="num">−{money(discountAmount)}</span>
              </div>
              <div className="order-summary-row">
                <span>Freight</span>
                <span className="num">+{money(freightCost)}</span>
              </div>
              <div className="order-summary-row order-summary-total">
                <span>Total</span>
                <span className="num">{money(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <div style={{ display: 'flex', gap: 10 }}>
          {hasUnsavedProgress() && (
            <button
              className="btn btn-secondary"
              disabled={savingDraft}
              onClick={() => confirm({
                title: 'Discard this order?',
                message: 'Your progress will not be saved. This cannot be undone.',
                confirmLabel: 'Discard',
                danger: true,
                onConfirm: async () => {
                  if (draftIdRef.current) await deleteDraft(draftIdRef.current).catch(() => {});
                  submittedRef.current = true; // already handled — don't also trigger the leave-blocker on this navigation
                  navigate('/orders');
                },
              })}
            >
              Discard
            </button>
          )}
          {hasUnsavedProgress() && (
            <button
              className="btn btn-secondary"
              disabled={savingDraft}
              onClick={async () => {
                setSavingDraft(true);
                try {
                  await saveDraftNow();
                  submittedRef.current = true; // already saved deliberately — don't also block this navigation
                  toast.success('Draft saved.');
                  navigate('/orders', { state: { tab: 'drafts' } });
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                  setSavingDraft(false); // stay put — nothing was actually saved, don't pretend otherwise
                }
              }}
            >
              {savingDraft && <Loader2 size={16} className="spin" />}
              {savingDraft ? 'Saving…' : 'Save as Draft'}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn" disabled={!canProceed()} onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn" disabled={submitting} onClick={handleSubmit}>
              {submitting && <Loader2 size={16} className="spin" />}
              {submitting ? 'Creating order…' : 'Create Order & Generate Invoice'}
            </button>
          )}
        </div>
      </div>

      {blocker.state === 'blocked' && !savingDraft && !discarding && (
        <Modal title="Save this order as a draft?" onClose={() => blocker.reset()} width={440}>
          <p style={{ color: 'var(--ink-muted)', marginBottom: 20 }}>
            This order hasn't been created yet. We'll save your progress as a draft you can pick back
            up anytime from the Drafts tab on the Orders page.
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              disabled={savingDraft || discarding}
              onClick={async () => {
                setDiscarding(true);
                try {
                  if (draftIdRef.current) await deleteDraft(draftIdRef.current).catch(() => {});
                  submittedRef.current = true; // already handled — don't also trigger beforeunload's save
                  blocker.proceed();
                } finally {
                  setDiscarding(false);
                }
              }}
            >
              {discarding ? 'Discarding…' : 'Discard'}
            </button>
            <button
              className="btn"
              disabled={savingDraft || discarding}
              onClick={async () => {
                setSavingDraft(true);
                try {
                  await saveDraftNow();
                  blocker.proceed();
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                } finally {
                  setSavingDraft(false);
                }
              }}
            >
              {savingDraft && <Loader2 size={16} className="spin" />}
              {savingDraft ? 'Saving…' : 'Save & Leave'}
            </button>
          </div>
        </Modal>
      )}

      {savingDraft && <SavingModal title="Saving Draft…" />}
      {submitting && <LoadingModal title="Creating Order…" message="Please wait while we generate your invoice." />}
    </div>
  );
}
