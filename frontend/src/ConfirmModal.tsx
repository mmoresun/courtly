import { useEffect, useRef, type ReactNode } from "react";

/**
 * A yes/no question in a modal: a title, a few "label: value" rows, two buttons.
 * A native <dialog> opened with showModal(): the browser handles the backdrop, focus and the Esc key.
 */
export function ConfirmModal({ title, rows, confirmLabel, backLabel = "Back", danger = false, busy, onConfirm, onClose }: {
  title: string;
  rows: [label: string, value: ReactNode][];
  confirmLabel: string;
  backLabel?: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="confirm" onClose={onClose}>
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="actions">
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>
          {backLabel}
        </button>
        <button type="button" className={danger ? "danger" : ""} disabled={busy} onClick={onConfirm} autoFocus>
          {busy ? "Please wait…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
