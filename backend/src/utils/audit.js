// Records an audit trail entry. Accepts an existing client so it can be part
// of the same transaction as the change it's recording (or the pool directly
// for standalone writes).
async function recordAudit(db, { userId, action, entityType, entityId, before = null, after = null }) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, entityType, entityId, JSON.stringify({ before, after })]
  );
}

module.exports = { recordAudit };
