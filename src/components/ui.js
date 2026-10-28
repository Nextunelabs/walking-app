export const boxField =
  "w-full rounded-xl border border-solid border-primary bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-gray-400";

export const primaryButton =
  "inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60";

export const secondaryButton =
  "inline-flex items-center justify-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-muted disabled:opacity-60";

export const dangerButton =
  "inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-destructive hover:bg-red-50 disabled:opacity-60";

export function Field({ label, children, error }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </label>
  );
}

export function Banner({ tone = "ok", children }) {
  if (!children) return null;
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-destructive"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-xl border px-3 py-2 text-sm ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.details = data.details;
    throw error;
  }
  return data;
}

export function errorText(error) {
  if (error?.details?.length) return error.details.join(" ");
  return error?.message || "Something went wrong";
}
