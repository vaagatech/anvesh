export function Pager({
  from,
  size,
  total,
  onChange,
  disabled,
}: {
  from: number;
  size: number;
  total: number;
  onChange: (nextFrom: number) => void;
  disabled?: boolean;
}) {
  if (total <= size) return null;
  const start = total === 0 ? 0 : from + 1;
  const end = Math.min(from + size, total);
  return (
    <div className="pager row">
      <button
        type="button"
        className="btn secondary"
        disabled={disabled || from <= 0}
        onClick={() => onChange(Math.max(0, from - size))}
      >
        ← Prev
      </button>
      <span className="hint pager-meta">
        {start}–{end} of {total}
      </span>
      <button
        type="button"
        className="btn secondary"
        disabled={disabled || from + size >= total}
        onClick={() => onChange(from + size)}
      >
        Next →
      </button>
    </div>
  );
}
