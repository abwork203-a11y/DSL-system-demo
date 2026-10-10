const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');

// Every authenticated role can read the zone list (see zonesRoutes.js) —
// it's a lookup table, not something scoped by who's asking. A rep still
// needs to see the full canonical list to correctly assign a zone when
// creating a distributor, even though RLS's WITH CHECK on distributors will
// only actually let that INSERT succeed for zones they themselves cover.
// (That does mean a rep could pick a zone outside their own coverage and
// have the save fail — a UX rough edge worth revisiting by filtering this
// list client-side to the rep's own zones later; not a security concern
// either way, since RLS is the actual enforcement, not this list.)
const list = asyncHandler(async (req, res) => {
  const result = await req.db.query('SELECT id, name FROM zones ORDER BY name');
  req.respond(200, result.rows);
});

// Admin-only (see zonesRoutes.js). No update/delete yet — a zone rename
// would be a one-line addition here if it comes up; deleting a zone that's
// still in use (referenced by distributors.zone_id or user_zones) is a
// real product decision (reassign first? block the delete? cascade to
// NULL, which makes every distributor in it invisible to every rep at
// once?) rather than something to default silently, so it's left out
// until that's actually asked for.
const create = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw new ApiError(400, 'name is required.');
  }

  let result;
  try {
    result = await req.db.query(
      'INSERT INTO zones (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      throw new ApiError(409, `A zone named "${name.trim()}" already exists.`);
    }
    throw err;
  }

  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'CREATE',
    entityType: 'zone',
    entityId: result.rows[0].id,
    after: result.rows[0],
  });

  req.respond(201, result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await req.db.query('SELECT * FROM zones WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Zone not found.');

  // Distributors point at a zone with a plain foreign key, so Postgres would
  // block the delete anyway. Counting first lets us give a friendly message.
  // (Admins see every distributor under RLS, so this count is accurate.)
  const inUse = await req.db.query('SELECT COUNT(*)::int AS n FROM distributors WHERE zone_id = $1', [id]);
  if (inUse.rows[0].n > 0) {
    throw new ApiError(409, `Cannot delete "${existing.rows[0].name}": ${inUse.rows[0].n} distributor(s) are still assigned to it. Reassign them first.`);
  }

  // user_zones rows are removed automatically (ON DELETE CASCADE).
  await req.db.query('DELETE FROM zones WHERE id = $1', [id]);
  req.respondEnd(204);
});


module.exports = { list, create,remove };
