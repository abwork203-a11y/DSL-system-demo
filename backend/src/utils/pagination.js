const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Parses & clamps page/pageSize from query params, and returns the SQL
// fragment + values needed. Clamping pageSize prevents a client (malicious
// or just buggy) from requesting an enormous page and forcing the DB/server
// to do a huge amount of work in one request.
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function paginatedResponse(rows, total, page, pageSize) {
  return {
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

module.exports = { parsePagination, paginatedResponse, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
