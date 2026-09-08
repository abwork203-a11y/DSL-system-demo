import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, X } from 'lucide-react';
import { backups as backupsApi } from '../api/endpoints';

const DISMISS_KEY = 'dsl_backup_reminder_dismissed_until';

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "Last week of the month" = the final 7 calendar days, inclusive of the
// last day itself — so an admin gets a full week's notice, not just one day.
function isLastWeekOfMonth(date = new Date()) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() >= lastDay - 6;
}

function backedUpThisMonth(backupList, date = new Date()) {
  return backupList.some((b) => {
    const created = new Date(b.created_at);
    return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth();
  });
}

export default function BackupReminder() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLastWeekOfMonth()) return;

    // "Remind me tomorrow": a dismissal is only good for the day it was
    // clicked. Comparing ISO date strings works lexicographically, so this
    // is true only if today's date is the exact day that was dismissed.
    const dismissedFor = localStorage.getItem(DISMISS_KEY);
    if (dismissedFor === todayStr()) return;

    let cancelled = false;
    backupsApi
      .list(5)
      .then((res) => {
        if (cancelled) return;
        if (!backedUpThisMonth(res.data)) setVisible(true);
      })
      .catch(() => {
        // Can't confirm whether a backup already happened this month —
        // better to remind unnecessarily than to silently stay quiet.
        if (!cancelled) setVisible(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, todayStr());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="backup-reminder-banner">
      <CloudUpload size={16} strokeWidth={2} />
      <span>It's the last week of the month — don't forget to back up before it ends.</span>
      <button
        className="link-btn"
        onClick={() => {
          setVisible(false);
          navigate('/backup');
        }}
      >
        Go to Backup →
      </button>
      <button className="backup-reminder-dismiss" onClick={dismiss} aria-label="Dismiss — remind me tomorrow">
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
