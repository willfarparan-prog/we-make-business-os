/**
 * Only the configured owner, and only once the auth provider has verified they
 * own that address: otherwise anyone could register an account under the
 * owner's email and walk in.
 */
export function isVerifiedOwner(email: string | null | undefined, emailVerified: unknown, ownerEmail: string | null | undefined) {
  if (!email || !ownerEmail) return false;
  return emailVerified === true && email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}
