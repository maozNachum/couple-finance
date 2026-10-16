/** Selection hints only. Every destination reloads and authorizes its own graph. */
export function accountHref(path: '/accounts' | '/transactions' | '/imports', account: { readonly id: string; readonly householdId: string }) {
  return `${path}?${new URLSearchParams({ household: account.householdId, account: account.id })}`;
}
