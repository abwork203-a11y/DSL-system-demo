// Loops through every page of a paginated list endpoint and returns the
// combined rows. Use this specifically where a real "give me everything"
// list is needed (a search-to-add picker, a dropdown filter's option list)
// as opposed to a paginated table view, which should use the `page`/
// `pagination` state + <Pagination> directly instead of this.
//
// Mirrors the loop BackupPage.jsx already used for fetchAllOrders — pulled
// out here once other endpoints (products, distributors) also became
// paginated and needed the same "fetch it all" behavior.
export async function fetchAllPages(apiCall, params = {}) {
  const all = [];
  let page = 1;
  const pageSize = 200; // MAX_PAGE_SIZE server-side — fewest round-trips while staying within what the API allows
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await apiCall({ ...params, page, pageSize });
    all.push(...res.data.data);
    if (page >= res.data.pagination.totalPages) break;
    page += 1;
  }
  return all;
}
