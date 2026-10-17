import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { forbidden, hasRole, unauthorized, type SiteRole } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { findUserById, touchActivity, type CurrentUser } from "./users";

/**
 * The data access layer's view of the caller: the session cookie resolved to a fresh user row, so a role
 * change or a deleted account takes effect on the next request. Cached per request by React.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Marks the render dynamic before Auth.js runs: Auth.js mints a CSRF token with crypto.getRandomValues
  // on a first visit, which Cache Components would otherwise flag while prerendering the page shell.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await findUserById(db(), id);
  if (!user) return null;
  try {
    await touchActivity(db(), user.id);
  } catch (err) {
    logger.warn({ err, userId: user.id }, "could not record activity");
  }
  return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireRole(min: SiteRole): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, min)) throw forbidden();
  return user;
}

/** For pages: send signed-out visitors to the sign-in page and bring them back afterwards. */
export async function requireUserOrRedirect(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return user;
}
