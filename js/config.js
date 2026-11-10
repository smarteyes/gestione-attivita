/* =========================================================
 * CONFIGURAZIONE WHITE-LABEL
 * Per rimarchiare il prodotto si modifica solo questo file (+ assets/logo.svg).
 * ========================================================= */
window.GA = window.GA || {};

GA.config = {
  appVersion: 11,  // mostrata in Impostazioni; allineata a sw.js ga-vN e ?v=N in index.html
  // Scansione scontrini/fatture. extractor: "local" = OCR nel browser (offline, Tesseract.js + pdf.js inclusi);
  // "remote" = il backend legge il documento (es. servizio AI di visione) via POST {restBaseUrl}/scan. Nessuna chiamata online finché resta "local".
  scan: { extractor: "local", maxSide: 2000, keepSide: 1400, keepQuality: 0.62, psm: "4" },
  brand: {
    appName: "Gestione Attività",   // stringa unica oppure { it: "...", en: "...", zh: "..." }
    logo: "assets/logo.svg",
    accent: "#0f766e",              // unico colore d'accento dell'interfaccia
    accentSoft: "#e6f2f0",
  },
  defaultLanguage: "it",
  languages: ["it", "en", "zh"],
  // valute selezionabili (solo visualizzazione, nessuna conversione: come nel file Excel)
  currencies: ["EUR", "CNY", "USD", "GBP", "CHF", "HKD", "JPY"],
  maxAccounts: 12, maxCards: 12, maxDepartments: 12,
  // "local" = dati nel browser; "rest" = server Node (cartella server/); "supabase" = GitHub Pages + Supabase (vedi DEPLOY.md). Si imposta in js/runtime-config.js
  storage: { driver: "local", namespace: "ga2", restBaseUrl: "/api" },
  auth: { allowSelfRegistration: false, pbkdf2Iterations: 150000, sessionHours: 12 },
};

/* Valori predefiniti di un libro contabile NUOVO (nessun dato reale).
 * I nomi delle categorie sono creati nella lingua scelta al primo avvio e restano modificabili. */
GA.defaults = {
  book: (lang) => ({
    company: "", fyStart: 1, currency: "EUR", vatDefaultIn: "v22", vatDefaultOut: "v22", dedDefault: "d100",
    prevYearIn: 0, prevYearOut: 0, weekdays: [true, true, true, true, true, false, false], overrides: {}, goals: {},
    eventsAutoEntry: true, eventsEntryAccount: "acc-cash", eventsEntryCategory: "", eventsEntryVat: "v22", setupDone: false, lang,
    // Chiusura serata: conto e categoria di ogni canale (Contanti / POS / Non riscosso)
    closingAccCash: "acc-cash", closingAccPos: "acc-bank", closingAccUnpaid: "acc-cash",
    closingCatCash: "cat-cash", closingCatPos: "cat-pos", closingCatUnpaid: "cat-unpaid",
  }),
  vatRates: (lang) => {
    const L = { it: ["IVA", "IVA manuale"], en: ["VAT", "Manual VAT"], zh: ["增值税", "手动税额"] }[lang] || ["IVA", "IVA manuale"];
    return [{ id: "vman", name: L[1], pct: 0, manual: true }].concat([0, 4, 5, 10, 22].map((p) => ({ id: "v" + p, name: L[0] + " " + p + "%", pct: p / 100 })));
  },
  dedRates: () => [{ id: "d100", name: "100%", pct: 1 }, { id: "d50", name: "50%", pct: 0.5 }, { id: "d40", name: "40%", pct: 0.4 }, { id: "d0", name: "0%", pct: 0 }],
  accounts: (lang) => [{ id: "acc-cash", name: { it: "Contanti", en: "Cash", zh: "现金" }[lang] || "Contanti", kind: "account", icon: "cash", opening: 0, manual: "", active: true },
    { id: "acc-bank", name: { it: "Banca", en: "Bank", zh: "银行" }[lang] || "Banca", kind: "account", icon: "bank", opening: 0, manual: "", active: true }],
  departments: (lang) => [{ id: "dep-gen", name: { it: "Generale", en: "General", zh: "综合" }[lang] || "Generale" }],
  categories: (lang) => {
    const N = {
      it: [["Contanti", "cash"], ["POS", "card"], ["Non riscosso", "receipt"], ["Altre entrate", "plus"], ["Affitto", "home", 1], ["Utenze", "bolt", 1], ["Fornitori e merci", "box", 1], ["Personale", "people", 1], ["Tasse e contributi", "receipt", 1], ["Banca e commissioni", "bank", 1], ["Marketing", "megaphone", 0], ["Manutenzione", "wrench", 0], ["Altre spese", "dots", 0]],
      en: [["Cash", "cash"], ["POS / card", "card"], ["Not collected", "receipt"], ["Other income", "plus"], ["Rent", "home", 1], ["Utilities", "bolt", 1], ["Suppliers & goods", "box", 1], ["Staff", "people", 1], ["Taxes", "receipt", 1], ["Bank & fees", "bank", 1], ["Marketing", "megaphone", 0], ["Maintenance", "wrench", 0], ["Other expenses", "dots", 0]],
      zh: [["现金", "cash"], ["刷卡 POS", "card"], ["未收款", "receipt"], ["其他收入", "plus"], ["房租", "home", 1], ["水电网", "bolt", 1], ["供应商与货物", "box", 1], ["人员", "people", 1], ["税费", "receipt", 1], ["银行与手续费", "bank", 1], ["市场推广", "megaphone", 0], ["维修保养", "wrench", 0], ["其他支出", "dots", 0]],
    }[lang] || [];
    const ids = ["cat-cash", "cat-pos", "cat-unpaid", "cat-in-other"];
    return N.map(([name, icon, need], i) => ({ id: ids[i] || "cat-" + (i + 1), type: i < 4 ? "in" : "out", name, icon, active: true, need: need == null ? false : !!need }));
  },
};

/* Liste del modulo Eventi (chiavi stabili, etichette tradotte) */
GA.options = {
  evStatus: ["quote", "confirmed", "completed", "cancelled"],
  evType: ["wedding", "birthday", "corporate", "party", "conference", "other"],
  payKind: ["deposit", "installment", "balance"],
  payMethod: ["cash", "transfer", "card", "wechat", "alipay"],
  freq: ["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual"],
};
/* Canali della chiusura serata */
GA.closingChannels = [["cash", "Cash", "cash"], ["pos", "Pos", "card"], ["unpaid", "Unpaid", "receipt"]];
GA.evStatusColors = { quote: "#a8a29e", confirmed: "#0f766e", completed: "#57534e", cancelled: "#d6d3d1" };

GA.clientSchema = [
  { key: "name", type: "text", required: true }, { key: "phone", type: "text" }, { key: "email", type: "text" },
  { key: "wechat", type: "text" }, { key: "notes", type: "textarea" },
];
GA.eventSchema = ["code", "title", "clientId", "dateTime", "location", "type", "status", "total", "balanceDue", "owner", "notes"];
GA.paymentSchema = ["eventId", "kind", "amount", "date", "method", "note", "txId"];
/* Evento: incassato, residuo, saldo scaduto */
GA.computeEvent = function (e, payments) {
  const today = GA.engine.today();
  const ps = payments.filter((p) => p.eventId === e.id);
  const paid = Math.round(ps.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
  const total = Number(e.total) || 0, remaining = Math.round((total - paid) * 100) / 100;
  const active = e.status !== "cancelled";
  return Object.assign({}, e, {
    paid, remaining, payments: ps.sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    balanceOverdue: active && remaining > 0.004 && !!e.balanceDue && e.balanceDue < today,
    paidPct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
  });
};

/* STILI GRAFICI (Impostazioni → Aspetto). Il tema è una classe su <html> (css/themes.css);
 * si salva per utente (profilo) e sul dispositivo (per la schermata di accesso). */
GA.themes = ["dark", "paris", "sage", "macaron"]; // il primo è il predefinito
GA.themeDefault = "dark";
// stili tolti: a quale passa chi li aveva scelti (gli altri → Scuro)
GA.themeMigrate = { ocean: "macaron", minimal: "dark", color: "dark", classic: "dark" };
GA.themeFix = (n) => (GA.themes.includes(n) ? n : GA.themeMigrate[n] || GA.themeDefault);
GA.theme = {
  current: "dark",
  apply(name) {
    const n = GA.themeFix(name); this.current = n;
    if (typeof document === "undefined") return n;
    const h = document.documentElement; Array.from(h.classList).filter((c) => c.startsWith("theme-")).forEach((c) => h.classList.remove(c)); h.classList.add("theme-" + n);
    try { localStorage.setItem("ga_theme", n); } catch (e) { /* archiviazione non disponibile */ }
    // Colori status bar / chrome: leggibili su iOS Home Screen (Parigino rosa ≠ icone bianche)
    const barColors = { dark: "#0b0b0c", paris: "#EAC7C3", sage: "#DBDAAF", macaron: "#ffe6ee" };
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = barColors[n] || getComputedStyle(h).getPropertyValue("--bg").trim() || "#0b0b0c";
    const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (sb) sb.content = n === "dark" ? "black-translucent" : "default";
    return n;
  },
  device() { try { return GA.themeFix(localStorage.getItem("ga_theme")); } catch (e) { return GA.themeDefault; } },
};
