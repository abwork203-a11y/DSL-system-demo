// Converts a "YYYY-MM" month string into the first/last calendar date of
// that month. Returns undefined start/end for an empty string, meaning
// "no filter — all activity."
export function monthToDateRange(monthStr) {
  if (!monthStr) {
    return { startDate: undefined, endDate: undefined };
  }

  const [year, month] = monthStr.split('-').map(Number);

  const startDate = `${monthStr}-01`;

  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}
