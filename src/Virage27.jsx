import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Search,
  ListOrdered,
  Compass,
  ExternalLink,
  AlertTriangle,
  Pencil,
  X,
  Check,
  Save,
  Clipboard,
  ClipboardPaste,
} from "lucide-react";

// ---------- design tokens ----------
const T = {
  bg: "#0B2027",
  panel: "#123138",
  panel2: "#17414A",
  line: "#274A50",
  text: "#EDEDE3",
  muted: "#8FA8A4",
  faint: "#5E7A76",
  amber: "#E0954B",
  amberSoft: "#3A2E1E",
  teal: "#4FA095",
  sage: "#7BAE76",
  coral: "#C1553D",
};

const STORAGE_KEY = "virage27-state";

const CRITERIA = [
  { key: "pertinence", label: "Pertinence" },
  { key: "financiere", label: "Sécurité financière" },
  { key: "emotionnelle", label: "Sécurité émotionnelle" },
  { key: "revenus", label: "Qualité / revenus" },
];

const emptyForm = {
  nom: "",
  lieu: "",
  objectif: "",
  dateDebut: "",
  debutOffset: "0",
  dureeMois: "3",
  cout: "",
  debouches: "",
  notes: "",
  scores: { pertinence: 3, financiere: 3, emotionnelle: 3, revenus: 3 },
};

const emptyResearch = { resume: "", couts: "", debouches: "", points_attention: "", sources: "" };

// Un seul objectif confirmé pour amorcer le carnet : le reste des options
// (retour au métier, autres pistes) reste à ajouter par Babou elle-même.
const seedOptions = [
  {
    id: "seed-monitorat-bali",
    nom: "Monitorat de plongée",
    lieu: "Bali, Indonésie",
    objectif:
      "Passer le monitorat (dive master / instructeur) après le dive master déjà obtenu lors du précédent congé sans solde et la plongée refaite récemment en Indonésie.",
    dateDebut: "",
    debutOffset: 0,
    dureeMois: 3,
    cout: "",
    debouches: "",
    notes: "Coût, durée exacte et centre à confirmer — à compléter.",
    scores: { pertinence: 3, financiere: 3, emotionnelle: 3, revenus: 3 },
    research: null,
  },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function monthsFromToday(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffDays = (target - now) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diffDays / 30.44));
}

function formatDateShort(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatEuro(v) {
  const n = Number(v);
  if (!v || Number.isNaN(n)) return v || "—";
  return n.toLocaleString("fr-FR") + " €";
}

function researchPrompt(opt) {
  return `Tu es un assistant de recherche. Sujet : une personne envisage l'option suivante dans sa reconversion / son projet de vie : "${opt.nom}"${
    opt.lieu ? ` (lieu envisagé : ${opt.lieu})` : ""
  }. Contexte donné par la personne : objectif="${opt.objectif}", coût estimé="${opt.cout}", débouchés envisagés="${opt.debouches}".

Fais une recherche web pour vérifier et compléter ces informations (coûts réels, durée réelle, débouchés/marché, prérequis, points d'attention). Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, sans balises markdown, au format exact :
{"resume": "3-4 phrases de synthèse en français", "couts": "ce que tu as trouvé sur les coûts, avec une nuance si incertain", "debouches": "ce que tu as trouvé sur les débouchés/marché", "points_attention": "prérequis, risques ou pièges à connaître", "sources": [{"titre": "...", "url": "..."}]}
Si tu n'es pas sûr d'un chiffre, dis-le explicitement dans le champ concerné plutôt que de l'inventer. N'invente jamais d'URL : ne mets dans "sources" que des pages réellement retournées par ta recherche.`;
}

// ---------- small UI atoms ----------
function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, color: T.muted, marginBottom: 6, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 11, color: T.faint, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: T.panel2,
  border: `1px solid ${T.line}`,
  borderRadius: 6,
  padding: "10px 12px",
  color: T.text,
  fontSize: 15,
  fontFamily: "'IBM Plex Sans', sans-serif",
  outline: "none",
};

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function TextArea(props) {
  return <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 64, ...(props.style || {}) }} />;
}

function ScoreSlider({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.muted, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: T.amber, fontWeight: 600 }}>{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: T.amber }}
      />
    </div>
  );
}

function Tab({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "10px 4px",
        background: "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${T.amber}` : `2px solid transparent`,
        color: active ? T.text : T.faint,
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 12,
        cursor: "pointer",
        transition: "color 0.15s",
      }}
    >
      <Icon size={18} strokeWidth={1.75} />
      {children}
    </button>
  );
}

function loadFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveToLocalStorage(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// ---------- main component ----------
export default function Virage27() {
  const [options, setOptions] = useState(() => {
    const saved = loadFromLocalStorage();
    return saved ? saved.options || [] : seedOptions;
  });
  const [weights, setWeights] = useState(() => {
    const saved = loadFromLocalStorage();
    return saved ? saved.weights || { pertinence: 25, financiere: 25, emotionnelle: 25, revenus: 25 } : { pertinence: 25, financiere: 25, emotionnelle: 25, revenus: 25 };
  });
  const [tab, setTab] = useState("add");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saved | error
  const [saveErrorDetail, setSaveErrorDetail] = useState(null);
  const [pasteText, setPasteText] = useState({});
  const [copyStatus, setCopyStatus] = useState({});
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [backupCopyStatus, setBackupCopyStatus] = useState(null);

  const persist = useCallback((nextOptions, nextWeights) => {
    const result = saveToLocalStorage({ options: nextOptions, weights: nextWeights });
    if (result.ok) {
      setSaveStatus("saved");
      setSaveErrorDetail(null);
    } else {
      setSaveStatus("error");
      setSaveErrorDetail(result.error);
    }
  }, []);

  useEffect(() => {
    // sauvegarde initiale si on démarre avec les options d'exemple
    persist(options, weights);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backupText = JSON.stringify({ options, weights }, null, 2);

  async function copyBackup() {
    try {
      await navigator.clipboard.writeText(backupText);
      setBackupCopyStatus("ok");
      setTimeout(() => setBackupCopyStatus(null), 2500);
    } catch (e) {
      setBackupCopyStatus("error");
    }
  }

  function loadBackup() {
    try {
      const parsed = JSON.parse(importText);
      const nextOptions = parsed.options || [];
      const nextWeights = parsed.weights || weights;
      setOptions(nextOptions);
      setWeights(nextWeights);
      setImportStatus("ok");
      persist(nextOptions, nextWeights);
    } catch (e) {
      setImportStatus("error");
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(opt) {
    setForm({
      nom: opt.nom,
      lieu: opt.lieu || "",
      objectif: opt.objectif,
      dateDebut: opt.dateDebut || "",
      debutOffset: String(opt.debutOffset ?? 0),
      dureeMois: String(opt.dureeMois ?? 3),
      cout: opt.cout || "",
      debouches: opt.debouches || "",
      notes: opt.notes || "",
      scores: { ...opt.scores },
    });
    setEditingId(opt.id);
    setTab("add");
  }

  function saveOption() {
    if (!form.nom.trim()) {
      setErrorMsg("Donne un nom à cette option avant d'enregistrer.");
      return;
    }
    setErrorMsg(null);
    const computedOffset = form.dateDebut ? monthsFromToday(form.dateDebut) : Number(form.debutOffset) || 0;
    let next;
    if (editingId) {
      next = options.map((o) =>
        o.id === editingId
          ? {
              ...o,
              nom: form.nom,
              lieu: form.lieu,
              objectif: form.objectif,
              dateDebut: form.dateDebut || "",
              debutOffset: computedOffset,
              dureeMois: Number(form.dureeMois) || 1,
              cout: form.cout,
              debouches: form.debouches,
              notes: form.notes,
              scores: form.scores,
            }
          : o
      );
    } else {
      const newOpt = {
        id: uid(),
        nom: form.nom,
        lieu: form.lieu,
        objectif: form.objectif,
        dateDebut: form.dateDebut || "",
        debutOffset: computedOffset,
        dureeMois: Number(form.dureeMois) || 1,
        cout: form.cout,
        debouches: form.debouches,
        notes: form.notes,
        scores: form.scores,
        research: null,
      };
      next = [...options, newOpt];
    }
    setOptions(next);
    persist(next, weights);
    resetForm();
  }

  function deleteOption(id) {
    const next = options.filter((o) => o.id !== id);
    setOptions(next);
    persist(next, weights);
  }

  function updateWeight(key, val) {
    const next = { ...weights, [key]: val };
    setWeights(next);
    persist(options, next);
  }

  function weightedScore(opt) {
    const total = CRITERIA.reduce((s, c) => s + (weights[c.key] || 0), 0) || 1;
    const raw = CRITERIA.reduce((s, c) => s + (opt.scores[c.key] || 0) * (weights[c.key] || 0), 0);
    return raw / total;
  }

  async function copyPrompt(opt) {
    try {
      await navigator.clipboard.writeText(researchPrompt(opt));
      setCopyStatus((s) => ({ ...s, [opt.id]: "ok" }));
      setTimeout(() => setCopyStatus((s) => ({ ...s, [opt.id]: null })), 2500);
    } catch (e) {
      setCopyStatus((s) => ({ ...s, [opt.id]: "error" }));
    }
  }

  function applyPastedResult(opt) {
    const raw = (pasteText[opt.id] || "").trim();
    if (!raw) return;
    const cleaned = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = null;
    }
    let research;
    if (parsed) {
      research = {
        resume: parsed.resume || "",
        couts: parsed.couts || "",
        debouches: parsed.debouches || "",
        points_attention: parsed.points_attention || "",
        sources: Array.isArray(parsed.sources)
          ? parsed.sources.map((s) => (s && s.url ? `${s.titre || s.url} — ${s.url}` : "")).filter(Boolean).join("\n")
          : "",
        fetchedAt: Date.now(),
      };
    } else {
      // pas du JSON valide : on garde le texte collé tel quel dans le résumé
      research = { resume: raw, couts: "", debouches: "", points_attention: "", sources: "", fetchedAt: Date.now() };
    }
    const next = options.map((o) => (o.id === opt.id ? { ...o, research } : o));
    setOptions(next);
    persist(next, weights);
    setPasteText((s) => ({ ...s, [opt.id]: "" }));
  }

  function updateResearchField(opt, field, value) {
    const current = opt.research || { ...emptyResearch };
    const next = options.map((o) => (o.id === opt.id ? { ...o, research: { ...current, [field]: value } } : o));
    setOptions(next);
  }

  function commitResearch(opt) {
    persist(options, weights);
  }

  const ranked = [...options].sort((a, b) => weightedScore(b) - weightedScore(a));
  const maxHorizon = Math.max(12, ...options.map((o) => o.debutOffset + o.dureeMois), 1);

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
        background: T.bg,
        color: T.text,
        minHeight: "100vh",
        maxWidth: 480,
        margin: "0 auto",
        paddingBottom: 24,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${T.bg}; }
        .v27-title { font-family: 'Fraunces', serif; }
        .v27-card { background: ${T.panel}; border: 1px solid ${T.line}; border-radius: 8px; }
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
        ::selection { background: ${T.amber}; color: ${T.bg}; }
      `}</style>

      {/* header / cover */}
      <div style={{ padding: "28px 20px 18px", position: "relative", overflow: "hidden" }}>
        <svg width="100%" height="34" viewBox="0 0 400 34" style={{ position: "absolute", top: 0, left: 0, opacity: 0.35 }} preserveAspectRatio="none">
          <path d="M0 20 Q 50 4 100 20 T 200 20 T 300 20 T 400 20" fill="none" stroke={T.teal} strokeWidth="1.5" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, marginTop: 18 }}>
          <Compass size={20} color={T.amber} strokeWidth={1.5} />
          <span style={{ fontSize: 12, letterSpacing: 0.5, color: T.muted }}>Carnet de décision</span>
        </div>
        <h1 className="v27-title" style={{ fontSize: 30, fontWeight: 600, margin: 0, lineHeight: 1.1 }}>
          Virage 27
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6, marginBottom: 0 }}>
          Un point pour chaque option, avant de choisir la suite.
        </p>
      </div>

      {saveStatus === "error" && (
        <div style={{ margin: "0 20px 12px", padding: "10px 12px", background: T.amberSoft, border: `1px solid ${T.coral}`, borderRadius: 6, fontSize: 12, color: T.text, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={14} color={T.coral} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              La sauvegarde locale (navigateur) a échoué. Va dans l'onglet "Sauvegarde" pour copier tes données en sécurité avant de fermer.
            </span>
          </div>
          {saveErrorDetail && <div style={{ fontFamily: "monospace", fontSize: 11, color: T.faint, wordBreak: "break-word" }}>{saveErrorDetail}</div>}
        </div>
      )}
      {saveStatus === "saved" && (
        <div style={{ margin: "0 20px 12px", fontSize: 12, color: T.sage, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={12} /> Sauvegardé sur cet appareil
        </div>
      )}

      {/* tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.line}`, margin: "0 4px" }}>
        <Tab active={tab === "add"} onClick={() => setTab("add")} icon={Plus}>Ajouter</Tab>
        <Tab active={tab === "research"} onClick={() => setTab("research")} icon={Search}>Recherche</Tab>
        <Tab active={tab === "plan"} onClick={() => setTab("plan")} icon={ListOrdered}>Classement</Tab>
        <Tab active={tab === "backup"} onClick={() => setTab("backup")} icon={Save}>Sauvegarde</Tab>
      </div>

      <div style={{ padding: "20px" }}>
        {tab === "add" && (
          <div>
            {editingId && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: T.teal }}>Modification d'une option existante</span>
                <button onClick={resetForm} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <X size={14} /> Annuler
                </button>
              </div>
            )}
            <Field label="Nom de l'option">
              <TextInput value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex : Monitorat plongée à Bali" />
            </Field>
            <Field label="Lieu" hint="optionnel">
              <TextInput value={form.lieu} onChange={(e) => setForm({ ...form, lieu: e.target.value })} placeholder="ex : Nusa Lembongan, Indonésie" />
            </Field>
            <Field label="Objectif / description">
              <TextArea value={form.objectif} onChange={(e) => setForm({ ...form, objectif: e.target.value })} placeholder="Ce que ça représente, pourquoi cette option" />
            </Field>
            <Field label="Date de début" hint="précise si tu la connais — sinon laisse vide et indique une estimation en mois ci-dessous">
              <TextInput type="date" value={form.dateDebut} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Ou : démarre dans (mois)" hint={form.dateDebut ? "ignoré, une date précise est renseignée" : "0 = tout de suite"}>
                  <TextInput
                    type="number"
                    min="0"
                    disabled={!!form.dateDebut}
                    value={form.debutOffset}
                    onChange={(e) => setForm({ ...form, debutOffset: e.target.value })}
                    style={form.dateDebut ? { opacity: 0.5 } : {}}
                  />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Durée (mois)">
                  <TextInput type="number" min="1" value={form.dureeMois} onChange={(e) => setForm({ ...form, dureeMois: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Coût estimé">
              <TextInput value={form.cout} onChange={(e) => setForm({ ...form, cout: e.target.value })} placeholder="ex : 3000 (en €), ou une fourchette" />
            </Field>
            <Field label="Débouchés / revenus envisagés">
              <TextArea value={form.debouches} onChange={(e) => setForm({ ...form, debouches: e.target.value })} placeholder="Ce que ça peut rapporter, ou ouvrir comme suite" />
            </Field>

            <div className="v27-card" style={{ padding: 16, marginTop: 4, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: T.muted, margin: "0 0 12px" }}>Comment tu la sens, là, maintenant :</p>
              {CRITERIA.map((c) => (
                <ScoreSlider key={c.key} label={c.label} value={form.scores[c.key]} onChange={(v) => setForm({ ...form, scores: { ...form.scores, [c.key]: v } })} />
              ))}
            </div>

            <Field label="Notes libres">
              <TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Tout ce qui ne rentre pas ailleurs" />
            </Field>

            {errorMsg && <p style={{ color: T.coral, fontSize: 13 }}>{errorMsg}</p>}

            <button
              onClick={saveOption}
              style={{
                width: "100%",
                background: T.amber,
                color: T.bg,
                border: "none",
                borderRadius: 6,
                padding: "12px 16px",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              {editingId ? "Enregistrer les modifications" : "Ajouter au carnet"}
            </button>

            {options.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>Options déjà notées ({options.length})</p>
                {options.map((o) => (
                  <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                        {formatEuro(o.cout)} · {formatDateShort(o.dateDebut) || `dans ${o.debutOffset} mois`} · {o.dureeMois} mois
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(o)} style={{ background: "none", border: "none", color: T.teal, cursor: "pointer" }}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => deleteOption(o.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "research" && (
          <div>
            {options.length === 0 && <p style={{ color: T.muted, fontSize: 14 }}>Ajoute d'abord une option dans l'onglet "Ajouter".</p>}
            <div style={{ padding: "10px 12px", background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 12, color: T.muted, marginBottom: 16, display: "flex", gap: 8 }}>
              <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Cette appli n'appelle aucune IA elle-même (pas de serveur = pas de clé API sécurisée). Pour chaque option : copie le prompt, colle-le dans
                Claude ou ChatGPT, puis reviens coller la réponse ici. À vérifier ensuite auprès des organismes concernés avant toute décision engageante.
              </span>
            </div>
            {options.map((o) => {
              const r = o.research || emptyResearch;
              return (
                <div key={o.id} className="v27-card" style={{ padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{o.nom}</div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                    </div>
                    <button
                      onClick={() => copyPrompt(o)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${T.teal}`,
                        color: T.teal,
                        borderRadius: 5,
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      <Clipboard size={13} /> Copier le prompt
                    </button>
                  </div>
                  {copyStatus[o.id] === "ok" && <p style={{ fontSize: 11, color: T.sage, margin: "0 0 8px" }}>Prompt copié — colle-le dans Claude ou ChatGPT.</p>}
                  {copyStatus[o.id] === "error" && <p style={{ fontSize: 11, color: T.coral, margin: "0 0 8px" }}>La copie a échoué, sélectionne le texte à la main.</p>}

                  <div style={{ marginBottom: 10 }}>
                    <TextArea
                      value={pasteText[o.id] || ""}
                      onChange={(e) => setPasteText((s) => ({ ...s, [o.id]: e.target.value }))}
                      placeholder="Colle ici la réponse de l'IA (JSON ou texte libre)"
                      style={{ minHeight: 50, fontFamily: "monospace", fontSize: 11 }}
                    />
                    <button
                      onClick={() => applyPastedResult(o)}
                      disabled={!(pasteText[o.id] || "").trim()}
                      style={{
                        marginTop: 6,
                        background: "transparent",
                        border: `1px solid ${T.amber}`,
                        color: T.amber,
                        borderRadius: 5,
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: (pasteText[o.id] || "").trim() ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        opacity: (pasteText[o.id] || "").trim() ? 1 : 0.5,
                      }}
                    >
                      <ClipboardPaste size={13} /> Analyser la réponse
                    </button>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <Field label="Résumé">
                      <TextArea value={r.resume} onChange={(e) => updateResearchField(o, "resume", e.target.value)} onBlur={() => commitResearch(o)} />
                    </Field>
                    <Field label="Coûts">
                      <TextArea value={r.couts} onChange={(e) => updateResearchField(o, "couts", e.target.value)} onBlur={() => commitResearch(o)} />
                    </Field>
                    <Field label="Débouchés">
                      <TextArea value={r.debouches} onChange={(e) => updateResearchField(o, "debouches", e.target.value)} onBlur={() => commitResearch(o)} />
                    </Field>
                    <Field label="Points d'attention">
                      <TextArea value={r.points_attention} onChange={(e) => updateResearchField(o, "points_attention", e.target.value)} onBlur={() => commitResearch(o)} />
                    </Field>
                    <Field label="Sources" hint="une par ligne, ex : Titre — https://...">
                      <TextArea value={r.sources} onChange={(e) => updateResearchField(o, "sources", e.target.value)} onBlur={() => commitResearch(o)} />
                    </Field>
                    {r.sources && (
                      <div style={{ marginTop: 4 }}>
                        {r.sources
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line, i) => {
                            const match = line.match(/(https?:\/\/\S+)/);
                            const url = match ? match[1] : null;
                            return url ? (
                              <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, color: T.teal, fontSize: 12, marginBottom: 4, textDecoration: "none" }}>
                                <ExternalLink size={11} /> {line}
                              </a>
                            ) : null;
                          })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "plan" && (
          <div>
            {options.length === 0 && <p style={{ color: T.muted, fontSize: 14 }}>Ajoute d'abord une option dans l'onglet "Ajouter".</p>}
            {options.length > 0 && (
              <>
                <div className="v27-card" style={{ padding: 16, marginBottom: 18 }}>
                  <p style={{ fontSize: 13, color: T.muted, margin: "0 0 12px" }}>Pondère ce qui compte le plus pour toi :</p>
                  {CRITERIA.map((c) => (
                    <div key={c.key} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: T.muted }}>{c.label}</span>
                        <span style={{ color: T.amber }}>{weights[c.key]}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={weights[c.key]}
                        onChange={(e) => updateWeight(c.key, Number(e.target.value))}
                        style={{ width: "100%", accentColor: T.amber }}
                      />
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>Classement pondéré</p>
                {ranked.map((o, i) => (
                  <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="v27-title" style={{ fontSize: 20, color: i === 0 ? T.amber : T.faint, width: 24, textAlign: "center" }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Score {weightedScore(o).toFixed(1)}/5</div>
                    </div>
                  </div>
                ))}

                <p style={{ fontSize: 13, color: T.muted, margin: "24px 0 10px" }}>Chronologie</p>
                <div className="v27-card" style={{ padding: 16 }}>
                  {options
                    .slice()
                    .sort((a, b) => a.debutOffset - b.debutOffset)
                    .map((o) => {
                      const leftPct = (o.debutOffset / maxHorizon) * 100;
                      const widthPct = Math.max((o.dureeMois / maxHorizon) * 100, 6);
                      return (
                        <div key={o.id} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>{o.nom}</div>
                          <div style={{ position: "relative", height: 18, background: T.panel2, borderRadius: 4 }}>
                            <div
                              style={{
                                position: "absolute",
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                height: "100%",
                                background: T.teal,
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  <div style={{ fontSize: 10, color: T.faint, marginTop: 4 }}>Échelle : 0 à {maxHorizon} mois à partir d'aujourd'hui</div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "backup" && (
          <div>
            <div className="v27-card" style={{ padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: T.muted, margin: "0 0 4px", fontWeight: 600 }}>Pourquoi cet onglet</p>
              <p style={{ fontSize: 13, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                Tes données sont sauvegardées automatiquement sur cet appareil (dans ce navigateur). Pour les retrouver sur un autre
                appareil, ou en cas de doute, copie ce texte et garde-le quelque part (Notes, message à toi-même), puis recolle-le ici
                pour tout retrouver.
              </p>
            </div>

            <p style={{ fontSize: 13, color: T.muted, marginBottom: 8, fontWeight: 600 }}>1. Copier mes données actuelles</p>
            <textarea readOnly value={backupText} onFocus={(e) => e.target.select()} style={{ ...inputStyle, height: 140, fontFamily: "monospace", fontSize: 11, marginBottom: 10 }} />
            <button
              onClick={copyBackup}
              style={{
                width: "100%",
                background: "transparent",
                border: `1px solid ${T.teal}`,
                color: T.teal,
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Clipboard size={14} /> Copier dans le presse-papiers
            </button>
            {backupCopyStatus === "ok" && <p style={{ fontSize: 12, color: T.sage, margin: "0 0 24px" }}>Copié — colle-le dans tes Notes maintenant.</p>}
            {backupCopyStatus === "error" && (
              <p style={{ fontSize: 12, color: T.coral, margin: "0 0 24px" }}>
                La copie automatique a échoué — sélectionne le texte ci-dessus à la main (appui long) puis copie-le.
              </p>
            )}
            {!backupCopyStatus && <div style={{ marginBottom: 24 }} />}

            <p style={{ fontSize: 13, color: T.muted, marginBottom: 8, fontWeight: 600 }}>2. Recharger des données sauvegardées</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Colle ici le texte que tu avais copié précédemment"
              style={{ ...inputStyle, height: 140, fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}
            />
            <button
              onClick={loadBackup}
              disabled={!importText.trim()}
              style={{
                width: "100%",
                background: importText.trim() ? T.amber : T.panel2,
                color: importText.trim() ? T.bg : T.faint,
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: importText.trim() ? "pointer" : "default",
              }}
            >
              Charger ces données
            </button>
            {importStatus === "ok" && <p style={{ fontSize: 12, color: T.sage, marginTop: 8 }}>Données rechargées.</p>}
            {importStatus === "error" && <p style={{ fontSize: 12, color: T.coral, marginTop: 8 }}>Ce texte n'est pas valide — vérifie que tu as tout copié.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
