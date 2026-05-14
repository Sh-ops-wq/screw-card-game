interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export function Toast({ message, onClose }: ToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="toast" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Close error">
        Close
      </button>
    </div>
  );
}
