import type { Metadata } from "next";
import Link from "next/link";
import { signInWithGoogleAction } from "@/app/actions";
import { devLoginEnabled, googleEnabled } from "@/auth.config";
import { DevSignInForm } from "@/components/forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const { next, error } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/me";
  return (
    <section className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-muted">
        We only keep your name and e-mail. Read the{" "}
        <Link className="underline" href="/privacy">
          privacy policy
        </Link>
        .
      </p>
      {typeof error === "string" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Sign-in did not complete ({error}). Please try again.
        </p>
      )}
      <div className="card mt-6 grid gap-4">
        {googleEnabled ? (
          <form action={signInWithGoogleAction}>
            <input type="hidden" name="next" value={target} />
            <button type="submit" className="btn btn-primary w-full justify-center">
              Continue with Google
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">Google sign-in is not configured on this instance.</p>
        )}
        {devLoginEnabled && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm text-muted">Development login (never available in production builds).</p>
            <DevSignInForm next={target} />
          </div>
        )}
      </div>
    </section>
  );
}
