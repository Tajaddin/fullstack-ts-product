"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="py-10">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">The error has been recorded{error.digest ? ` (reference ${error.digest})` : ""}.</p>
      <p className="mt-4">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
      </p>
    </section>
  );
}
