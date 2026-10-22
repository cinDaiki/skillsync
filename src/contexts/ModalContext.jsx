import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import "./Modal.css";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modalConfig, setModalConfig] = useState(null);
  const dialogRef = useRef(null);

  const confirm = useCallback(({ title, message, onConfirm, confirmText = "Confirm", cancelText = "Cancel", isDestructive = false }) => {
    setModalConfig({
      title,
      message,
      onConfirm,
      confirmText,
      cancelText,
      isDestructive
    });
  }, []);

  const close = useCallback(() => {
    setModalConfig(null);
  }, []);

  useEffect(() => {
    if (!modalConfig) return;
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        // Keep nested confirmations above the underlying dialog's keyboard trap.
        event.stopPropagation();
        const buttons = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled)') || []);
        const edge = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
        if (document.activeElement === edge || !dialogRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [modalConfig, close]);

  const handleConfirm = useCallback(() => {
    if (modalConfig?.onConfirm) {
      modalConfig.onConfirm();
    }
    close();
  }, [modalConfig, close]);

  return (
    <ModalContext.Provider value={{ confirm }}>
      {children}
      {modalConfig && (
        <div className="app-confirm-overlay">
          <div ref={dialogRef} className="app-confirm-content app-confirm-zoom-in" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title">
            <div className="app-confirm-header">
              <div className={`app-confirm-icon ${modalConfig.isDestructive ? 'destructive' : 'primary'}`}>
                {modalConfig.isDestructive ? '⚠️' : '❓'}
              </div>
              <h3 id="app-confirm-title">{modalConfig.title}</h3>
            </div>
            <div className="app-confirm-body">
              <p>{modalConfig.message}</p>
            </div>
            <div className="app-confirm-actions">
              <button className="app-confirm-btn-cancel" onClick={close}>
                {modalConfig.cancelText}
              </button>
              <button 
                className={`app-confirm-btn-confirm ${modalConfig.isDestructive ? 'destructive' : 'primary'}`} 
                onClick={handleConfirm}
              >
                {modalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}
