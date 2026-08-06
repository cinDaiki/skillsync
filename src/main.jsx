import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/variables.css";
import "./styles/auth.css";
import "./styles/dashboard.css";
import "./styles/responsive.css";
import { ToastProvider } from "./contexts/ToastContext";
import { ModalProvider } from "./contexts/ModalContext";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ModalProvider>
        <App />
      </ModalProvider>
    </ToastProvider>
  </React.StrictMode>
);