"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/app/actions";

/**
 * A button bound to a server action. Shows the action's message next to it, asks for confirmation when
 * `confirm` is given, and stays usable without JavaScript only where a <form action> is used instead.
 */
export function ActionButton({
  action,
  children,
  className = "btn btn-secondary",
  confirm,
  pendingText = "Working…",
}: {
  action: () => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setState(await action()));
        }}
      >
        {pending ? pendingText : children}
      </button>
      {state?.message && (
        <span role="status" className={state.ok ? "text-sm text-muted" : "text-sm text-danger"}>
          {state.message}
        </span>
      )}
    </span>
  );
}
