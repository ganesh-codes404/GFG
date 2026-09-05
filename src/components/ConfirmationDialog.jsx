import Modal from "./Modal";

export default function ConfirmationDialog({
  title,
  message,
  confirmLabel = "CONFIRM",
  cancelLabel = "CANCEL",
  onConfirm,
  onCancel,
}) {
  return (
    <Modal onClose={onCancel}>
      <h2>{title}</h2>
      <p>{message}</p>

      <div className="shared-confirm-row">
        <button className="shared-button danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="shared-button secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
