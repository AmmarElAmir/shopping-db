// Pre-flight check for pasted links: returns a short reason when a URL is
// clearly not a product page (so it's never queued for the routine), or null
// when it should be queued. Deliberately conservative: unknown stores and
// unknown paths pass, since a wrongly rejected product is worse than one
// failed row.

const AMAZON_HOST = /(^|\.)amazon\.[a-z.]+$/i;

// Amazon paths that are account, cart, order or help pages.
const AMAZON_NON_PRODUCT_PATHS = [
  /^\/gp\/(your-account|css|cart|buy|help|yourstore|legacy|history|b2b)\b/i,
  /^\/(ap|hz|cart|orders?|wishlist|ref=)\b/i,
  /\/order-details\b/i,
  /^\/s\/?$/i, // search results (/s?k=...)
];

export function nonProductReason(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "not a valid link";
  }
  if (!/^https?:$/.test(url.protocol)) return "not a web link";

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "store home page, not a product";

  if (AMAZON_HOST.test(url.hostname)) {
    if (AMAZON_NON_PRODUCT_PATHS.some((re) => re.test(path))) {
      return "Amazon account, order, cart or search page, not a product";
    }
  }
  return null;
}
