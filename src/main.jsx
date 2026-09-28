import React from "react";
import ReactDOM from "react-dom/client";
import Virage27 from "./Virage27.jsx";
import PasswordGate from "./PasswordGate.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PasswordGate>
      <Virage27 />
    </PasswordGate>
  </React.StrictMode>
);

// nécessaire pour que Chrome/Android propose "Installer l'application"
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
