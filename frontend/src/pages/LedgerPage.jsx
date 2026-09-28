import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2,
  FileSpreadsheet,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
} from 'lucide-react';

import {
  ledger as ledgerApi,
  distributors as distributorsApi,
  exportApi,
} from '../api/endpoints';

import { apiErrorMessage, downloadFile } from '../api/client';
import { monthToDateRange } from '../utils/dateRange';
import { fetchAllPages } from '../utils/fetchAllPages';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';

const PAGE_SIZE = 50;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMonth(monthStr) {
  if (!monthStr) return 'All activity';

  const [year, month] = monthStr.split('-').map(Number);

  if (!year || !month) return 'All activity';

  return `${MONTHS[month - 1]} ${year}`;
}

export default function LedgerPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const distributorId =
    searchParams.get('distributor_id') || '';

  const [distributorsList, setDistributorsList] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [distributor, setDistributor] = useState(null);

  const [loading, setLoading] = useState(true);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const downloadingRef = useRef(false);

  /*
   * Selected accounting period.
   *
   * YYYY-MM
   * Empty = All activity
   */
  const [exportMonth, setExportMonth] = useState('');

  /*
   * Year → Month picker
   */
  const [showMonthPicker, setShowMonthPicker] =
    useState(false);

  const [pickerYear, setPickerYear] = useState(
    new Date().getFullYear()
  );

  const monthPickerRef = useRef(null);

  /*
   * Download modal
   */
  const [showDownloadModal, setShowDownloadModal] =
    useState(false);

  /*
   * Close calendar when clicking outside.
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        monthPickerRef.current &&
        !monthPickerRef.current.contains(event.target)
      ) {
        setShowMonthPicker(false);
      }
    };

    if (showMonthPicker) {
      document.addEventListener(
        'mousedown',
        handleClickOutside
      );
    }

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, [showMonthPicker]);

  /*
   * Load distributors.
   */
  useEffect(() => {
    fetchAllPages(distributorsApi.list)
      .then(setDistributorsList)
      .catch(() => {});
  }, []);

  /*
   * Load ledger.
   */
  const load = useCallback(async () => {
    setLoading(true);

    try {
      if (distributorId) {
        const res =
          await ledgerApi.distributorSummary(
            distributorId
          );

        setDistributor(res.data.distributor);
        setEntries(res.data.entries);
        setPagination(null);
      } else {
        const res = await ledgerApi.list({
          page,
          pageSize: PAGE_SIZE,
        });

        setDistributor(null);
        setEntries(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorId, page]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Distributor filter.
   */
  const handleDistributorChange = (value) => {
    setPage(1);

    if (value) {
      setSearchParams({
        distributor_id: value,
      });
    } else {
      setSearchParams({});
    }
  };

  /*
   * Open Year → Month calendar.
   */
  const openMonthPicker = () => {
    if (exportMonth) {
      const [year] = exportMonth
        .split('-')
        .map(Number);

      setPickerYear(year);
    } else {
      setPickerYear(new Date().getFullYear());
    }

    setShowMonthPicker((current) => !current);
  };

  /*
   * Select month.
   */
  const handleMonthSelect = (monthIndex) => {
    const month = String(monthIndex + 1).padStart(
      2,
      '0'
    );

    setExportMonth(
      `${pickerYear}-${month}`
    );

    setShowMonthPicker(false);
  };

  /*
   * Clear accounting period.
   */
  const handleClearMonth = () => {
    setExportMonth('');
    setShowMonthPicker(false);
  };

  /*
   * Select current month.
   */
  const handleCurrentMonth = () => {
    const now = new Date();

    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    setExportMonth(
      `${now.getFullYear()}-${month}`
    );

    setPickerYear(now.getFullYear());
    setShowMonthPicker(false);
  };

  /*
   * Change calendar year.
   */
  const changePickerYear = (amount) => {
    setPickerYear(
      (year) => year + amount
    );
  };

  /*
   * Export ledger.
   */
  const handleExport = async (format) => {
    if (downloadingRef.current) return;

    downloadingRef.current = true;

    setShowDownloadModal(false);
    setDownloading(true);
    setDownloadProgress(null);

    try {
      const {
        startDate,
        endDate,
      } = monthToDateRange(exportMonth);

      const monthLabel = exportMonth
        ? `-${exportMonth}`
        : '';

      const ext =
        format === 'pdf'
          ? 'pdf'
          : 'xlsx';

      if (distributorId) {
        const url =
          exportApi.distributorLedgerUrl(
            distributorId,
            format,
            {
              start_date: startDate,
              end_date: endDate,
            }
          );

        await downloadFile(
          url,
          `ledger-${distributor?.name || distributorId}${monthLabel}.${ext}`,
          setDownloadProgress
        );
      } else {
        const url =
          exportApi.ledgerUrl(
            format,
            {
              start_date: startDate,
              end_date: endDate,
            }
          );

        await downloadFile(
          url,
          `ledger${monthLabel}.${ext}`,
          setDownloadProgress
        );
      }

      toast.success('Ledger exported.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  /*
   * Current selected month.
   */
  const currentMonthValue = (() => {
    const now = new Date();

    return `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;
  })();

  return (
    <div className="content">

      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div className="page-header ledger-page-header">

        <div>
          <h1>Ledger</h1>

          <p>
            {distributor
              ? `${distributor.name} — running balance`
              : `All distributors${
                  pagination
                    ? ` · ${pagination.total} entries`
                    : ''
                }`}
          </p>
        </div>

      </div>


      {/* =====================================================
          PROFESSIONAL ERP FILTER BAR
      ====================================================== */}

      <div className="ledger-control-bar">

        {/* DISTRIBUTOR */}

        <div className="ledger-control-group ledger-distributor-group">

          <select
            id="ledger-distributor"
            value={distributorId}
            onChange={(e) =>
              handleDistributorChange(
                e.target.value
              )
            }
          >
            <option value="">
              All distributors
            </option>

            {distributorsList.map((d) => (
              <option
                key={d.id}
                value={d.id}
              >
                {d.name}
              </option>
            ))}
          </select>

        </div>


        {/* ACCOUNTING PERIOD */}

        {isAdmin && (
          <div
            className="ledger-control-group ledger-period-group"
            ref={monthPickerRef}
          >

            <div className="ledger-period-actions">

              <button
                type="button"
                className={`ledger-period-trigger${
                  showMonthPicker
                    ? ' is-open'
                    : ''
                }`}
                onClick={openMonthPicker}
                aria-haspopup="dialog"
                aria-expanded={
                  showMonthPicker
                }
              >

                <CalendarDays
                  size={16}
                  strokeWidth={1.8}
                />

                <span>
                  {formatMonth(exportMonth)}
                </span>

                <ChevronRight
                  size={15}
                  strokeWidth={1.8}
                  className={`ledger-period-chevron${
                    showMonthPicker
                      ? ' rotate'
                      : ''
                  }`}
                />

              </button>


              {/* DOWNLOAD */}

              <button
                type="button"
                className="btn btn-secondary ledger-download-btn"
                disabled={downloading}
                onClick={() =>
                  setShowDownloadModal(true)
                }
              >

                {downloading ? (
                  <Loader2
                    size={16}
                    className="spin"
                  />
                ) : (
                  <Download
                    size={16}
                    strokeWidth={1.8}
                  />
                )}

                {downloading
                  ? 'Downloading…'
                  : 'Download'}

              </button>

            </div>


            {/* =================================================
                YEAR → MONTH PICKER
            ================================================== */}

            {showMonthPicker && (
              <div
                className="ledger-month-picker"
                role="dialog"
                aria-label="Select accounting period"
              >

                <div className="ledger-month-picker-header">

                  <div>

                    <div className="ledger-month-picker-caption">
                      SELECT ACCOUNTING PERIOD
                    </div>

                    <div className="ledger-month-picker-year">
                      {pickerYear}
                    </div>

                  </div>


                  <div className="ledger-year-controls">

                    <button
                      type="button"
                      className="ledger-year-button"
                      onClick={() =>
                        changePickerYear(-1)
                      }
                      aria-label="Previous year"
                    >
                      <ChevronLeft
                        size={17}
                      />
                    </button>

                    <button
                      type="button"
                      className="ledger-year-button"
                      onClick={() =>
                        changePickerYear(1)
                      }
                      aria-label="Next year"
                    >
                      <ChevronRight
                        size={17}
                      />
                    </button>

                  </div>

                </div>


                <div className="ledger-month-grid">

                  {MONTHS.map(
                    (month, index) => {
                      const monthValue =
                        `${pickerYear}-${String(
                          index + 1
                        ).padStart(2, '0')}`;

                      const isSelected =
                        exportMonth ===
                        monthValue;

                      const isCurrent =
                        currentMonthValue ===
                        monthValue;

                      return (
                        <button
                          key={month}
                          type="button"
                          className={`ledger-month-option${
                            isSelected
                              ? ' selected'
                              : ''
                          }${
                            isCurrent
                              ? ' current'
                              : ''
                          }`}
                          onClick={() =>
                            handleMonthSelect(
                              index
                            )
                          }
                        >

                          <span>
                            {month.slice(0, 3)}
                          </span>

                          {isCurrent &&
                            !isSelected && (
                              <small>
                                Current
                              </small>
                            )}

                        </button>
                      );
                    }
                  )}

                </div>


                <div className="ledger-month-picker-footer">

                  <button
                    type="button"
                    className="ledger-picker-secondary"
                    onClick={
                      handleClearMonth
                    }
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    className="ledger-picker-primary"
                    onClick={
                      handleCurrentMonth
                    }
                  >
                    Current Month
                  </button>

                </div>

              </div>
            )}

          </div>
        )}


        {/* CURRENT BALANCE */}

        {distributor && (
          <div className="ledger-current-balance">

            <div className="stat-label">
              Current Balance
            </div>

            <div className="stat-value num">
              {money(
                distributor.balance
              )}
            </div>

          </div>
        )}

      </div>


      {/* =====================================================
          DOWNLOAD PROGRESS
      ====================================================== */}

      {downloading && (
        <div className="ledger-download-progress">

          <div className="progress-track">

            <div
              className={`progress-fill${
                downloadProgress == null
                  ? ' indeterminate'
                  : ''
              }`}
              style={
                downloadProgress != null
                  ? {
                      width: `${downloadProgress}%`,
                    }
                  : undefined
              }
            />

          </div>

        </div>
      )}


      {/* =====================================================
          DOWNLOAD MODAL
      ====================================================== */}

      {showDownloadModal && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowDownloadModal(false)
          }
        >

          <div
            className="modal ledger-download-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>
                <h2>
                  Download Ledger
                </h2>

                <p>
                  {exportMonth
                    ? `Accounting period: ${formatMonth(exportMonth)}`
                    : 'All activity'}
                </p>
              </div>

              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setShowDownloadModal(false)
                }
                aria-label="Close"
              >
                <X size={20} />
              </button>

            </div>


            <div className="download-options">

              <button
                type="button"
                className="download-option"
                onClick={() =>
                  handleExport('excel')
                }
              >
                <FileSpreadsheet
                  size={20}
                />

                <span>
                  <strong>
                    Excel
                  </strong>

                  <small>
                    .xlsx spreadsheet
                  </small>
                </span>

              </button>


              <button
                type="button"
                className="download-option"
                onClick={() =>
                  handleExport('pdf')
                }
              >
                <FileText
                  size={20}
                />

                <span>
                  <strong>
                    PDF
                  </strong>

                  <small>
                    .pdf document
                  </small>
                </span>

              </button>

            </div>

          </div>

        </div>
      )}


      {/* =====================================================
          LEDGER TABLE
      ====================================================== */}

      <div className="card ledger-table-card">

        {loading ? (
          <TableSkeleton
            columns={
              distributor
                ? 7
                : 8
            }
            rows={6}
          />
        ) : (

          <>

          {/* Small screens: pill cards (shown only below 640px by the
              .list-cards rule). Must sit directly before .table-wrap. */}
          <div className="list-cards">

            {entries.map((e) => (
              <div
                key={e.id}
                className="pill-card"
                data-status={e.type}
              >

                <div className="pill-card-left">

                  <div className="pill-card-name">
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {e.order_number || 'No order'}
                    </span>
                  </div>

                  {!distributor && (
                    <div className="pill-card-sub">
                      {e.distributor_name}
                    </div>
                  )}

                  <div className="pill-card-meta">
                    <CalendarDays
                      size={12}
                      style={{ verticalAlign: -2, marginRight: 4 }}
                    />
                    {new Date(e.entry_date).toLocaleDateString()}
                    {e.payment_term && (
                      <span className="capitalize"> · {e.payment_term}</span>
                    )}
                  </div>

                  {e.note && (
                    <div className="pill-card-meta ledger-pill-note">
                      {e.note}
                    </div>
                  )}

                </div>

                <div className="pill-card-divider" />

                <div className="pill-card-rows">

                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Type</span>
                    <span
                      className="pill-card-row-value pill-card-row-status"
                      data-status={e.type}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {e.type}
                    </span>
                  </div>

                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Amount</span>
                    <span className="pill-card-row-value">
                      {e.type === 'debit' ? '+' : '−'}
                      {money(e.amount)}
                    </span>
                  </div>

                  <div className="pill-card-row pill-card-row-muted">
                    <span className="pill-card-row-label">Balance</span>
                    <span className="pill-card-row-value">
                      {money(e.running_balance)}
                    </span>
                  </div>

                </div>

              </div>
            ))}

            {entries.length === 0 && (
              <div className="empty-state">
                No ledger entries yet.
              </div>
            )}

          </div>


          {/* Larger screens: the original table, unchanged. */}
          <div className="table-wrap">

            <table className="data-table">

              <thead>
                <tr>

                  {!distributor && (
                    <th>
                      Distributor
                    </th>
                  )}

                  <th>
                    Date
                  </th>

                  <th>
                    Order
                  </th>

                  <th>
                    Payment Term
                  </th>

                  <th>
                    Type
                  </th>

                  <th className="num">
                    Amount
                  </th>

                  <th className="num">
                    Running Balance
                  </th>

                  <th>
                    Note
                  </th>

                </tr>
              </thead>


              <tbody>

                {entries.map((e) => (
                  <tr key={e.id}>

                    {!distributor && (
                      <td data-label="Distributor">
                        {e.distributor_name}
                      </td>
                    )}

                    <td data-label="Date">
                      {new Date(
                        e.entry_date
                      ).toLocaleDateString()}
                    </td>

                    <td data-label="Order">
                      {e.order_number || '—'}
                    </td>

                    <td className="capitalize" data-label="Payment Term">
                      {e.payment_term || '—'}
                    </td>

                    <td data-label="Type">
                      <StatusBadge
                        value={e.type}
                      />
                    </td>

                    <td className="num" data-label="Amount">
                      {e.type === 'debit'
                        ? '+'
                        : '−'}
                      {money(e.amount)}
                    </td>

                    <td className="num" data-label="Running Balance">
                      {money(
                        e.running_balance
                      )}
                    </td>

                    <td className="ledger-note" data-label="Note">
                      {e.note || '—'}
                    </td>

                  </tr>
                ))}


                {entries.length === 0 && (
                  <tr>

                    <td
                      colSpan={
                        distributor
                          ? 7
                          : 8
                      }
                    >

                      <div className="empty-state">
                        No ledger entries yet.
                      </div>

                    </td>

                  </tr>
                )}

              </tbody>

            </table>

          </div>

          </>

        )}

        {!distributor && (
          <Pagination
            pagination={pagination}
            onPageChange={setPage}
          />
        )}

      </div>

    </div>
  );
}