/** What the checkout form remembers in this browser between visits. */
export const DRAFT_KEY = "checkout:draft:v1";

/** Signing out or deleting the account forgets it, so the next person on this device starts blank. */
export function forgetCheckoutDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode: nothing was stored.
  }
}
