import Link from "next/link";

export default function NotFound() {
  return (
    <section className="py-10">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-muted">That page or group does not exist, or it is private.</p>
      <p className="mt-4">
        <Link className="btn btn-secondary" href="/">
          Back to the start
        </Link>
      </p>
    </section>
  );
}
