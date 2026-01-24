// components/ConfirmModal.tsx
import { useUIStore } from '../stores/useUIStore';

export function ConfirmModal() {
  const { confirmModal, closeConfirmModal } = useUIStore();

  if (!confirmModal) return null;

  const { title, message, confirmLabel, cancelLabel, onConfirm, variant } = confirmModal;

  const handleConfirm = () => {
    onConfirm();
    closeConfirmModal();
  };

  const confirmButtonClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-primary-600 hover:bg-primary-700 text-white';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="card max-w-md w-full p-6">
        <h2
          id="confirm-modal-title"
          className="text-xl font-bold text-gray-900 dark:text-white mb-2"
        >
          {title}
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${confirmButtonClass}`}
            autoFocus
          >
            {confirmLabel || 'Confirm'}
          </button>
          <button
            onClick={closeConfirmModal}
            className="flex-1 btn-secondary"
          >
            {cancelLabel || 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
