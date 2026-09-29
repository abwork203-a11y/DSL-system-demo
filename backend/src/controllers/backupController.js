const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

// Logs that a backup happened. Called by the client after it has already
// finished uploading files to the user's own Google Drive — this endpoint
// never sees or touches the files themselves, just the summary.
const create = asyncHandler(async (req, res) => {
  const { folder_name, folder_url, period_start, period_end, file_count, failed_count } = req.body;

  if (!folder_name || !folder_url) {
    throw new ApiError(400, 'folder_name and folder_url are required.');
  }

  const result = await req.db.query(
    `INSERT INTO backups (user_id, folder_name, folder_url, period_start, period_end, file_count, failed_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      req.user.id,
      folder_name,
      folder_url,
      period_start || null,
      period_end || null,
      Number(file_count) || 0,
      Number(failed_count) || 0,
    ]
  );

  req.respond(201, result.rows[0]);
});

// Recent backup history, most recent first. Kept simple (no pagination) —
// this is a short receipt list, not a growing operational dataset like
// orders or the audit log.
const list = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const result = await req.db.query(
    `SELECT b.*, u.name AS user_name
     FROM backups b
     LEFT JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC
     LIMIT $1`,
    [limit]
  );
  req.respond(200, result.rows);
});

module.exports = { create, list };
