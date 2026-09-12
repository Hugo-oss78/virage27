import React, { useState } from "react";
import { Lock } from "lucide-react";
import { T } from "./Virage27.jsx";

const ACCESS_CODE = "1612";
const UNLOCK_KEY = "virage27-unlocked";

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return window.localStorage.getItem(UNLOCK_KEY) === "yes";
    } catch (e) {
      return false;
    }
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (code === ACCESS_CODE) {
      try {
        window.localStorage.setItem(UNLOCK_KEY, "yes");
      } catch (e) {
        // tant pis, on laisse passer quand même pour cette session
      }
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  }

  if (unlocked) return children;

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
        background: T.bg,
        color: T.text,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
        <Lock size={28} color={T.amber} strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <p style={{ fontSize: 14, color: T.muted, marginBottom: 16 }}>Code d'accès</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: T.panel2,
            border: `1px solid ${error ? T.coral : T.line}`,
            borderRadius: 6,
            padding: "10px 12px",
            color: T.text,
            fontSize: 18,
            textAlign: "center",
            letterSpacing: 4,
            outline: "none",
            marginBottom: 12,
          }}
        />
        {error && <p style={{ color: T.coral, fontSize: 13, marginBottom: 12 }}>Code incorrect.</p>}
        <button
          type="submit"
          style={{
            width: "100%",
            background: T.amber,
            color: T.bg,
            border: "none",
            borderRadius: 6,
            padding: "10px 16px",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Entrer
        </button>
      </form>
    </div>
  );
}
