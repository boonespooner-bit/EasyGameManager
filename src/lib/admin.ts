import type { Session } from "next-auth";

// The single account allowed to see the god view.
export const OWNER_EMAIL = "boonespooner@gmail.com";

export function isOwner(session: Session | null | undefined): boolean {
  return session?.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
}
