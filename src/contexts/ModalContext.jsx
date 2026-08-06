import React, { createContext, useContext, useState, useCallback } from "react";
import "./Modal.css";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modalConfig, setModalConfig] = useState(null);

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
        <div className="modal-overlay">
          <div className="modal-content zoom-in">
            <div className="modal-header">
              <div className={`modal-icon ${modalConfig.isDestructive ? 'destructive' : 'primary'}`}>
                {modalConfig.isDestructive ? '⚠️' : '❓'}
              </div>
              <h3>{modalConfig.title}</h3>
            </div>
            <div className="modal-body">
              <p>{modalConfig.message}</p>
            </div>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={close}>
                {modalConfig.cancelText}
              </button>
              <button 
                className={`modal-btn-confirm ${modalConfig.isDestructive ? 'destructive' : 'primary'}`} 
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
