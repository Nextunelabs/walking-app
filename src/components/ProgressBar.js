export function ProgressBar({ percent }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}
