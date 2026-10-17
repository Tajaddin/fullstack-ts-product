import Link from "next/link";
import { signOutAction } from "@/app/actions";
import type { CurrentUser } from "@/server/users";

export function Nav({ user, pending = false }: { user: CurrentUser | null; pending?: boolean }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Coursemates
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-3 text-sm sm:gap-5">
            <li>
              <Link className="hover:underline" href="/courses">
                Courses
              </Link>
            </li>
            <li>
              <Link className="hover:underline" href="/groups/new">
                Start a group
              </Link>
            </li>
            {pending ? (
              <li aria-live="polite" className="text-muted">
                …
              </li>
            ) : user ? (
              <>
                <li>
                  <Link className="hover:underline" href="/me">
                    My groups
                  </Link>
                </li>
                {user.role !== "member" && (
                  <li>
                    <Link className="hover:underline" href="/admin">
                      Admin
                    </Link>
                  </li>
                )}
                <li>
                  <form action={signOutAction}>
                    <button type="submit" className="btn btn-secondary px-3 py-1.5" title={user.email}>
                      Sign out
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <li>
                <Link className="btn btn-primary px-3 py-1.5" href="/signin">
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
