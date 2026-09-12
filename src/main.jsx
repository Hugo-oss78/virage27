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
