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
  Archive,
  ArchiveRestore,
  Bell,
  CalendarCheck,
  CalendarX,
  CalendarClock,
  RotateCcw,
  CalendarPlus,
  Download,
  GraduationCap,
  Plane,
  Briefcase,
} from "lucide-react";

// ---------- design tokens ----------
export const T = {
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

const STATUS_STYLE = {
  active: { label: null, color: T.muted },
  done: { label: "réalisée", color: T.sage },
  aborted: { label: "non atteignable", color: T.coral },
  archived: { label: "archivée", color: T.faint },
};

const CATEGORIES = {
  formation: { label: "Formation", color: "#9B8AC4", icon: GraduationCap },
  voyage: { label: "Voyage", color: "#5FA8D3", icon: Plane },
  job: { label: "Job / Pro", color: "#C9A227", icon: Briefcase },
};

function categoryColor(o) {
  return (o.categorie && CATEGORIES[o.categorie] && CATEGORIES[o.categorie].color) || T.faint;
}

const emptyForm = {
  categorie: null,
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
  reminders: [],
};

const emptyResearch = { resume: "", couts: "", debouches: "", points_attention: "", sources: "" };

// Options réelles de Babou, remplies par sa famille pour amorcer le carnet.
const seedOptions = [
  {
    id: "seed-monitorat-bali",
    categorie: "formation",
    nom: "Monitorat de plongée",
    lieu: "Bali, Indonésie",
    objectif:
      "Passer le monitorat (dive master / instructeur) après le dive master déjà obtenu lors du précédent congé sans solde et la plongée refaite récemment en Indonésie.",
    dateDebut: "2027-03-13",
    debutOffset: 6,
    dureeMois: 1,
    cout: "",
    debouches: "",
    notes: "Coût, durée exacte et centre à confirmer — à compléter.",
    scores: { pertinence: 4, financiere: 3, emotionnelle: 5, revenus: 2 },
    research: null,
    status: "active",
    createdAt: 1789247916616,
    reminders: [],
  },
  {
    id: "gr30ajg6",
    categorie: "job",
    nom: "Ergothérapeute Présence Verte ",
    lieu: "Montpellier",
    objectif: "Reprise ",
    dateDebut: "2026-09-21",
    debutOffset: 0,
    dureeMois: 4,
    cout: "",
    debouches: "",
    notes: "",
    scores: { pertinence: 3, financiere: 4, emotionnelle: 2, revenus: 3 },
    reminders: [
      {
        id: "y2d78ytb",
        label: "Retrouver mail/papier condition de reprise suite congé sans soldée",
        date: "2026-09-17",
        done: false,
      },
    ],
    research: null,
    status: "active",
    createdAt: 1789248119575,
  },
  {
    id: "qsg3ovxc",
    categorie: "voyage",
    nom: "Congé sans solde ",
    lieu: "Asie",
    objectif: "Voyager, Se former, s'ouvrir au monde ",
    dateDebut: "2026-02-05",
    debutOffset: 0,
    dureeMois: 7,
    cout: "8000€",
    debouches: "",
    notes: "",
    scores: { pertinence: 5, financiere: 3, emotionnelle: 5, revenus: 1 },
    reminders: [],
    research: null,
    status: "done",
    createdAt: 1789282087985,
  },
];

const seedWeights = { pertinence: 70, financiere: 50, emotionnelle: 25, revenus: 25 };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// remet à niveau les options sauvegardées avant l'ajout du statut/des rappels/des dates de création
function migrateOption(o) {
  return {
    ...o,
    status: o.status || (o.archived ? "archived" : "active"),
    createdAt: o.createdAt || Date.now(),
    reminders: o.reminders || [],
    categorie: o.categorie || null,
  };
}

function monthsFromToday(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffDays = (target - now) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diffDays / 30.44));
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// date de début réelle d'une option : la date précise si elle est connue,
// sinon la date de création + le nombre de mois d'attente indiqué
function getStartDate(o) {
  return parseDate(o.dateDebut) || addMonths(new Date(o.createdAt || Date.now()), o.debutOffset || 0);
}

function getEndDate(o) {
  return addMonths(getStartDate(o), o.dureeMois || 1);
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(o, today) {
  return o.status === "active" && getEndDate(o).getTime() < today.getTime();
}

function formatDateShort(dateStr) {
  const d = parseDate(dateStr);
  return d ? formatDateObj(d) : null;
}

function formatDateObj(d) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatEuro(v) {
  const n = Number(v);
  if (!v || Number.isNaN(n)) return v || "—";
  return n.toLocaleString("fr-FR") + " €";
}

// ---------- export calendrier (.ics) ----------
function icsEscape(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDateFromStr(dateStr) {
  return (dateStr || "").replace(/-/g, "");
}

function icsDatePlusOneDay(yyyymmdd) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

// événement d'une journée entière (on ne connaît qu'une date, pas d'heure précise)
function buildICS(events) {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Virage27//FR", "CALSCALE:GREGORIAN"];
  events.forEach((ev) => {
    const start = icsDateFromStr(ev.dateStr);
    if (!start) return;
    const end = icsDatePlusOneDay(start);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}@virage27`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:${icsEscape(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(filename, icsContent) {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(text) {
  return String(text || "rappel")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "rappel";
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
        justifyContent: "center",
        gap: 3,
        padding: "9px 2px",
        background: active ? "rgba(224, 149, 75, 0.16)" : "transparent",
        border: "none",
        borderRadius: 16,
        color: active ? T.amber : "rgba(237, 237, 227, 0.55)",
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 10,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        transition: "background 0.2s ease, color 0.2s ease",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.75} />
      {children}
    </button>
  );
}

function ghostButtonStyle(color) {
  return { background: "none", border: "none", color, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 };
}

function CategoryTag({ categorie }) {
  const cat = categorie && CATEGORIES[categorie];
  if (!cat) return null;
  const Icon = cat.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        color: cat.color,
        border: `1px solid ${cat.color}`,
        borderRadius: 999,
        padding: "1px 7px 1px 5px",
        flexShrink: 0,
      }}
    >
      <Icon size={10} /> {cat.label}
    </span>
  );
}

function CategoryPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      {Object.entries(CATEGORIES).map(([key, cat]) => {
        const Icon = cat.icon;
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              padding: "10px 4px",
              borderRadius: 10,
              border: `1.5px solid ${active ? cat.color : T.line}`,
              background: active ? `${cat.color}22` : T.panel2,
              color: active ? cat.color : T.muted,
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
            {cat.label}
          </button>
        );
      })}
    </div>
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
    const raw = saved ? saved.options || [] : seedOptions;
    return raw.map(migrateOption);
  });
  const [weights, setWeights] = useState(() => {
    const saved = loadFromLocalStorage();
    return saved ? saved.weights || seedWeights : seedWeights;
  });
  const [tab, setTab] = useState("add");
  const [form, setForm] = useState(emptyForm);
  const [newReminderLabel, setNewReminderLabel] = useState("");
  const [newReminderDate, setNewReminderDate] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saved | error
  const [saveErrorDetail, setSaveErrorDetail] = useState(null);
  const [pasteText, setPasteText] = useState({});
  const [copyStatus, setCopyStatus] = useState({});
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [backupCopyStatus, setBackupCopyStatus] = useState(null);
  const [postponeId, setPostponeId] = useState(null);
  const [postponeDate, setPostponeDate] = useState("");

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
    // sauvegarde initiale si on démarre avec les options d'exemple / une migration
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
      const nextOptions = (parsed.options || []).map(migrateOption);
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
    setNewReminderLabel("");
    setNewReminderDate("");
  }

  function startEdit(opt) {
    setForm({
      categorie: opt.categorie || null,
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
      reminders: (opt.reminders || []).map((r) => ({ ...r })),
    });
    setEditingId(opt.id);
    setTab("add");
  }

  function addReminderToForm() {
    if (!newReminderLabel.trim() || !newReminderDate) return;
    setForm((f) => ({ ...f, reminders: [...f.reminders, { id: uid(), label: newReminderLabel.trim(), date: newReminderDate, done: false }] }));
    setNewReminderLabel("");
    setNewReminderDate("");
  }

  function removeReminderFromForm(id) {
    setForm((f) => ({ ...f, reminders: f.reminders.filter((r) => r.id !== id) }));
  }

  function saveOption() {
    if (!form.categorie) {
      setErrorMsg("Choisis un type (formation / voyage / job) avant d'enregistrer.");
      return;
    }
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
              categorie: form.categorie,
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
              reminders: form.reminders,
            }
          : o
      );
    } else {
      const newOpt = {
        id: uid(),
        categorie: form.categorie,
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
        reminders: form.reminders,
        research: null,
        status: "active",
        createdAt: Date.now(),
      };
      next = [...options, newOpt];
    }
    setOptions(next);
    persist(next, weights);
    resetForm();
  }

  function deleteOption(id) {
    const opt = options.find((o) => o.id === id);
    if (opt && !window.confirm(`Supprimer définitivement "${opt.nom}" ? Cette action est irréversible — archive-la plutôt si tu n'es pas sûre.`)) return;
    const next = options.filter((o) => o.id !== id);
    setOptions(next);
    persist(next, weights);
    if (editingId === id) resetForm();
  }

  function setStatus(id, status) {
    const next = options.map((o) => (o.id === id ? { ...o, status } : o));
    setOptions(next);
    persist(next, weights);
    if (editingId === id) resetForm();
    if (postponeId === id) setPostponeId(null);
  }

  function postponeOption(id, newDate) {
    if (!newDate) return;
    const next = options.map((o) => (o.id === id ? { ...o, dateDebut: newDate, debutOffset: 0, status: "active" } : o));
    setOptions(next);
    persist(next, weights);
    setPostponeId(null);
    setPostponeDate("");
  }

  function toggleReminder(optionId, reminderId) {
    const next = options.map((o) =>
      o.id === optionId ? { ...o, reminders: (o.reminders || []).map((r) => (r.id === reminderId ? { ...r, done: !r.done } : r)) } : o
    );
    setOptions(next);
    persist(next, weights);
  }

  function deleteReminder(optionId, reminderId) {
    const next = options.map((o) => (o.id === optionId ? { ...o, reminders: (o.reminders || []).filter((r) => r.id !== reminderId) } : o));
    setOptions(next);
    persist(next, weights);
  }

  function exportReminderToCalendar(r) {
    const ics = buildICS([{ uid: r.id, dateStr: r.date, summary: r.label, description: `Virage 27 — ${r.optionName}` }]);
    downloadICS(`${slugify(r.label)}.ics`, ics);
  }

  function exportAllRemindersToCalendar() {
    const events = allReminders.map((r) => ({ uid: r.id, dateStr: r.date, summary: r.label, description: `Virage 27 — ${r.optionName}` }));
    downloadICS("rappels-virage27.ics", buildICS(events));
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

  const today = startOfToday();
  const activeOptions = options.filter((o) => o.status === "active");
  const archivedOptions = options.filter((o) => o.status === "archived");
  const doneOptions = options.filter((o) => o.status === "done");
  const abortedOptions = options.filter((o) => o.status === "aborted");
  const overdueOptions = activeOptions.filter((o) => isOverdue(o, today));
  const ranked = [...activeOptions].sort((a, b) => weightedScore(b) - weightedScore(a));
  const hasResearch = (o) => !!(o.research && (o.research.resume || o.research.couts || o.research.debouches || o.research.points_attention));

  // chronologie : toutes les options (même passées / résolues) sur un axe de dates réelles
  const timelineOptions = [...options].sort((a, b) => getStartDate(a) - getStartDate(b));
  let rangeStart = today;
  let rangeEnd = addMonths(today, 12);
  if (timelineOptions.length > 0) {
    const starts = timelineOptions.map(getStartDate).map((d) => d.getTime());
    const ends = timelineOptions.map(getEndDate).map((d) => d.getTime());
    rangeStart = addMonths(new Date(Math.min(...starts, today.getTime())), -1);
    rangeEnd = addMonths(new Date(Math.max(...ends, today.getTime())), 1);
  }
  const rangeTotalMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 1);
  const todayLeftPct = ((today.getTime() - rangeStart.getTime()) / rangeTotalMs) * 100;

  // rappels de toutes les options actives, triés par date
  const allReminders = activeOptions
    .flatMap((o) => (o.reminders || []).map((r) => ({ ...r, optionId: o.id, optionName: o.nom })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const upcomingReminderCount = allReminders.filter((r) => !r.done && parseDate(r.date) && parseDate(r.date).getTime() <= addMonths(today, 1).getTime()).length;

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
        .v27-tabbar {
          /* navigateur classique : un peu de marge pour la barre d'adresse du téléphone */
          bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        }
        @media (display-mode: standalone) {
          .v27-tabbar {
            /* app installée : pas de barre d'adresse à dégager */
            bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          }
        }
      `}</style>

      {/* header / cover */}
      <div style={{ padding: "calc(28px + env(safe-area-inset-top, 0px)) 20px 18px", position: "relative", overflow: "hidden" }}>
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

      <div style={{ padding: "20px 20px 160px" }}>
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
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>C'est plutôt...</p>
            <CategoryPicker value={form.categorie} onChange={(categorie) => setForm({ ...form, categorie })} />
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

            <div className="v27-card" style={{ padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: T.muted, margin: "0 0 4px", fontWeight: 600 }}>Rappels / dates butoires</p>
              <p style={{ fontSize: 12, color: T.faint, margin: "0 0 12px" }}>Inscription, acompte, dossier à rendre... — retrouvables dans l'onglet "Rappels".</p>
              {form.reminders.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {form.reminders.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
                      <div>
                        <div style={{ fontSize: 13 }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: T.muted }}>{formatDateShort(r.date)}</div>
                      </div>
                      <button onClick={() => removeReminderFromForm(r.id)} style={ghostButtonStyle(T.coral)} aria-label={`Retirer le rappel ${r.label}`}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={newReminderLabel}
                  onChange={(e) => setNewReminderLabel(e.target.value)}
                  placeholder="ex : Inscription avant le..."
                  style={{ flex: 2 }}
                />
                <TextInput type="date" value={newReminderDate} onChange={(e) => setNewReminderDate(e.target.value)} style={{ flex: 1 }} />
              </div>
              <button
                onClick={addReminderToForm}
                disabled={!newReminderLabel.trim() || !newReminderDate}
                style={{
                  background: "transparent",
                  border: `1px solid ${T.teal}`,
                  color: T.teal,
                  borderRadius: 5,
                  padding: "6px 10px",
                  fontSize: 12,
                  cursor: newReminderLabel.trim() && newReminderDate ? "pointer" : "default",
                  opacity: newReminderLabel.trim() && newReminderDate ? 1 : 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={13} /> Ajouter ce rappel
              </button>
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

            {activeOptions.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>Options déjà notées ({activeOptions.length})</p>
                {activeOptions.map((o) => (
                  <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                      </div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                        {formatEuro(o.cout)} · {formatDateShort(o.dateDebut) || `dans ${o.debutOffset} mois`} · {o.dureeMois} mois
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(o)} style={{ background: "none", border: "none", color: T.teal, cursor: "pointer" }} aria-label={`Modifier ${o.nom}`}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setStatus(o.id, "archived")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }} aria-label={`Archiver ${o.nom}`}>
                        <Archive size={16} />
                      </button>
                      <button onClick={() => deleteOption(o.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }} aria-label={`Supprimer ${o.nom}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(archivedOptions.length > 0 || doneOptions.length > 0 || abortedOptions.length > 0) && (
              <p style={{ fontSize: 12, color: T.faint, marginTop: 12 }}>
                {archivedOptions.length + doneOptions.length + abortedOptions.length} option(s) archivée(s), réalisée(s) ou non atteignable(s) — visibles en bas de l'onglet "Classement".
              </p>
            )}
          </div>
        )}

        {tab === "research" && (
          <div>
            {activeOptions.length === 0 && <p style={{ color: T.muted, fontSize: 14 }}>Ajoute d'abord une option dans l'onglet "Ajouter".</p>}
            <div style={{ padding: "10px 12px", background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 12, color: T.muted, marginBottom: 16, display: "flex", gap: 8 }}>
              <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Cette appli n'appelle aucune IA elle-même (pas de serveur = pas de clé API sécurisée). Pour chaque option : copie le prompt, colle-le dans
                Claude ou ChatGPT, puis reviens coller la réponse ici. À vérifier ensuite auprès des organismes concernés avant toute décision engageante.
              </span>
            </div>
            {activeOptions.map((o) => {
              const r = o.research || emptyResearch;
              return (
                <div key={o.id} className="v27-card" style={{ padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                      </div>
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

            {overdueOptions.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: T.amber, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={14} /> Échéance dépassée ({overdueOptions.length})
                </p>
                {overdueOptions.map((o) => {
                  const overdueDays = daysBetween(getEndDate(o), today);
                  return (
                    <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, border: `1px solid ${T.amber}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2, marginBottom: 10 }}>
                        Échéance passée depuis {overdueDays} jour{overdueDays > 1 ? "s" : ""} ({formatDateObj(getEndDate(o))})
                      </div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <button onClick={() => setStatus(o.id, "done")} style={{ ...ghostButtonStyle(T.sage), fontSize: 12 }}>
                          <CalendarCheck size={14} /> Réalisée
                        </button>
                        <button onClick={() => setStatus(o.id, "aborted")} style={{ ...ghostButtonStyle(T.coral), fontSize: 12 }}>
                          <CalendarX size={14} /> Non atteignable
                        </button>
                        <button
                          onClick={() => {
                            setPostponeId(postponeId === o.id ? null : o.id);
                            setPostponeDate(o.dateDebut || "");
                          }}
                          style={{ ...ghostButtonStyle(T.amber), fontSize: 12 }}
                        >
                          <CalendarClock size={14} /> Reporter
                        </button>
                      </div>
                      {postponeId === o.id && (
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <TextInput type="date" value={postponeDate} onChange={(e) => setPostponeDate(e.target.value)} style={{ flex: 1 }} />
                          <button
                            onClick={() => postponeOption(o.id, postponeDate)}
                            disabled={!postponeDate}
                            style={{
                              background: T.amber,
                              color: T.bg,
                              border: "none",
                              borderRadius: 5,
                              padding: "0 14px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: postponeDate ? "pointer" : "default",
                              opacity: postponeDate ? 1 : 0.5,
                            }}
                          >
                            Valider
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeOptions.length === 0 && options.length > 0 && (
              <p style={{ color: T.muted, fontSize: 14, marginBottom: 20 }}>Aucune option active pour le moment — regarde la chronologie et les listes ci-dessous.</p>
            )}

            {activeOptions.length > 0 && (
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                        {!hasResearch(o) && (
                          <span
                            style={{
                              fontSize: 10,
                              color: T.amber,
                              border: `1px solid ${T.amber}`,
                              borderRadius: 999,
                              padding: "1px 7px",
                              flexShrink: 0,
                            }}
                          >
                            à vérifier
                          </span>
                        )}
                      </div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Score {weightedScore(o).toFixed(1)}/5</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(o)} style={{ background: "none", border: "none", color: T.teal, cursor: "pointer" }} aria-label={`Modifier ${o.nom}`}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setStatus(o.id, "archived")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }} aria-label={`Archiver ${o.nom}`}>
                        <Archive size={16} />
                      </button>
                      <button onClick={() => deleteOption(o.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }} aria-label={`Supprimer ${o.nom}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {options.length > 0 && (
              <>
                <p style={{ fontSize: 13, color: T.muted, margin: "24px 0 10px" }}>Chronologie</p>
                <div className="v27-card" style={{ padding: "26px 16px 16px" }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", top: -12, bottom: -6, left: `${todayLeftPct}%`, width: 1, background: T.amber, opacity: 0.6 }} />
                    <div style={{ position: "absolute", top: -26, left: `${todayLeftPct}%`, transform: "translateX(-50%)", fontSize: 9, color: T.amber, whiteSpace: "nowrap" }}>
                      aujourd'hui
                    </div>
                    {timelineOptions.map((o) => {
                      const start = getStartDate(o);
                      const end = getEndDate(o);
                      const leftPct = ((start.getTime() - rangeStart.getTime()) / rangeTotalMs) * 100;
                      const widthPct = Math.max(((end.getTime() - start.getTime()) / rangeTotalMs) * 100, 3);
                      const style = STATUS_STYLE[o.status] || STATUS_STYLE.active;
                      return (
                        <div key={o.id} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ opacity: o.status === "active" ? 1 : 0.6 }}>{o.nom}</span>
                            <CategoryTag categorie={o.categorie} />
                            {style.label && (
                              <span style={{ fontSize: 9, color: style.color, border: `1px solid ${style.color}`, borderRadius: 999, padding: "0 6px" }}>{style.label}</span>
                            )}
                          </div>
                          <div style={{ position: "relative", height: 18, background: T.panel2, borderRadius: 4 }}>
                            <div
                              style={{
                                position: "absolute",
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                height: "100%",
                                background: categoryColor(o),
                                opacity: o.status === "active" ? 1 : 0.45,
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: T.faint, marginTop: 4 }}>
                    Du {formatDateObj(rangeStart)} au {formatDateObj(rangeEnd)}
                  </div>
                </div>
              </>
            )}

            {archivedOptions.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>Écartées ({archivedOptions.length})</p>
                {archivedOptions.map((o) => (
                  <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, opacity: 0.7 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                      </div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setStatus(o.id, "active")} style={{ background: "none", border: "none", color: T.sage, cursor: "pointer" }} aria-label={`Restaurer ${o.nom}`}>
                        <ArchiveRestore size={16} />
                      </button>
                      <button onClick={() => deleteOption(o.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }} aria-label={`Supprimer ${o.nom}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {doneOptions.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{ fontSize: 13, color: T.sage, marginBottom: 10 }}>Réalisées ({doneOptions.length})</p>
                {doneOptions.map((o) => (
                  <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderColor: T.sage }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                      </div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setStatus(o.id, "active")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }} aria-label={`Remettre ${o.nom} en actif`}>
                        <RotateCcw size={16} />
                      </button>
                      <button onClick={() => deleteOption(o.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }} aria-label={`Supprimer ${o.nom}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {abortedOptions.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{ fontSize: 13, color: T.coral, marginBottom: 10 }}>Idées avortées ({abortedOptions.length})</p>
                {abortedOptions.map((o) => (
                  <div key={o.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderColor: T.coral }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nom}</div>
                        <CategoryTag categorie={o.categorie} />
                      </div>
                      {o.lieu && <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{o.lieu}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setStatus(o.id, "active")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }} aria-label={`Remettre ${o.nom} en actif`}>
                        <RotateCcw size={16} />
                      </button>
                      <button onClick={() => deleteOption(o.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }} aria-label={`Supprimer ${o.nom}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "reminders" && (
          <div>
            <div style={{ padding: "10px 12px", background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 12, color: T.muted, marginBottom: 16, display: "flex", gap: 8 }}>
              <Bell size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Les dates butoires (inscription, acompte...) ajoutées sur chaque option, toutes réunies ici et triées par date. Le
                bouton calendrier télécharge un fichier .ics : ouvre-le ensuite pour l'ajouter à Calendrier (iPhone) ou Google
                Calendar (Android).
              </span>
            </div>
            {allReminders.length === 0 && (
              <p style={{ color: T.muted, fontSize: 14 }}>Aucun rappel pour l'instant — ajoute-en un depuis la fiche d'une option, dans l'onglet "Ajouter".</p>
            )}
            {allReminders.length > 0 && (
              <button
                onClick={exportAllRemindersToCalendar}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${T.teal}`,
                  color: T.teal,
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Download size={14} /> Exporter tous les rappels (.ics)
              </button>
            )}
            {allReminders.map((r) => {
              const d = parseDate(r.date);
              const overdue = !r.done && d && d.getTime() < today.getTime();
              const soon = !r.done && !overdue && d && d.getTime() <= addMonths(today, 1).getTime();
              return (
                <div key={r.id} className="v27-card" style={{ padding: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 12, opacity: r.done ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={() => toggleReminder(r.optionId, r.id)}
                    style={{ width: 18, height: 18, accentColor: T.amber, flexShrink: 0 }}
                    aria-label={`Marquer "${r.label}" comme fait`}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, textDecoration: r.done ? "line-through" : "none" }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: T.teal, marginTop: 1 }}>{r.optionName}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: T.muted }}>{formatDateShort(r.date)}</span>
                      {overdue && (
                        <span style={{ fontSize: 9, color: T.coral, border: `1px solid ${T.coral}`, borderRadius: 999, padding: "0 6px" }}>en retard</span>
                      )}
                      {soon && <span style={{ fontSize: 9, color: T.amber, border: `1px solid ${T.amber}`, borderRadius: 999, padding: "0 6px" }}>bientôt</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                    <button onClick={() => exportReminderToCalendar(r)} style={{ background: "none", border: "none", color: T.teal, cursor: "pointer" }} aria-label={`Ajouter ${r.label} au calendrier`}>
                      <CalendarPlus size={16} />
                    </button>
                    <button onClick={() => deleteReminder(r.optionId, r.id)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer" }} aria-label={`Supprimer le rappel ${r.label}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
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

      <nav
        className="v27-tabbar"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 28px)",
          maxWidth: 452,
          display: "flex",
          gap: 2,
          padding: 6,
          borderRadius: 26,
          background: "rgba(18, 49, 56, 0.62)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.09)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          zIndex: 50,
        }}
      >
        <Tab active={tab === "add"} onClick={() => setTab("add")} icon={Plus}>Ajouter</Tab>
        <Tab active={tab === "research"} onClick={() => setTab("research")} icon={Search}>Recherche</Tab>
        <Tab active={tab === "plan"} onClick={() => setTab("plan")} icon={ListOrdered}>Classement</Tab>
        <Tab active={tab === "reminders"} onClick={() => setTab("reminders")} icon={Bell}>
          Rappels{upcomingReminderCount > 0 ? ` (${upcomingReminderCount})` : ""}
        </Tab>
        <Tab active={tab === "backup"} onClick={() => setTab("backup")} icon={Save}>Sauvegarde</Tab>
      </nav>
    </div>
  );
}
