// Scrolls back to the top of the page, e.g. after switching to another page of a list.
// Some layouts scroll the whole browser window, others scroll an inner area next to a
// sidebar. This handles both: it scrolls the window, and then every scrollable
// parent of the page content (".content").
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });

  let node = document.querySelector('.content');
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    const scrolls = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
    if (scrolls) node.scrollTo({ top: 0, behavior: 'smooth' });
    node = node.parentElement;
  }
}
