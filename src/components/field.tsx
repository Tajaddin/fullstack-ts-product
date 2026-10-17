// Labelled form controls with an error slot wired through aria-describedby.
import type { ComponentPropsWithRef } from "react";

interface Common {
  label: string;
  name: string;
  hint?: string;
  error?: string;
}

function describedBy(name: string, hint?: string, error?: string) {
  const ids = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function TextField({ label, name, hint, error, ...rest }: Common & ComponentPropsWithRef<"input">) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} aria-invalid={!!error} aria-describedby={describedBy(name, hint, error)} {...rest} />
      {hint && (
        <span id={`${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${name}-error`} className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextArea({ label, name, hint, error, ...rest }: Common & ComponentPropsWithRef<"textarea">) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} aria-invalid={!!error} aria-describedby={describedBy(name, hint, error)} {...rest} />
      {hint && (
        <span id={`${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${name}-error`} className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  label,
  name,
  hint,
  error,
  options,
  ...rest
}: Common & ComponentPropsWithRef<"select"> & { options: { value: string; label: string }[] }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} aria-invalid={!!error} aria-describedby={describedBy(name, hint, error)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <span id={`${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${name}-error`} className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
