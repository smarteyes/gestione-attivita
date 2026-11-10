/* =========================================================
 * LIVELLO DATI / SERVIZI — unico punto di contatto della UI (GA.api.*, tutto async).
 * Driver "local": localStorage + password PBKDF2 (Web Crypto).
 * Driver "rest": stesse firme via HTTP (backend futuro; nel Mini Program WeChat fetch → wx.request).
 * ATTENZIONE: nel driver locale i permessi sono controllati nel browser e sono aggirabili;
 * la sicurezza reale richiede il backend, che deve ripetere gli stessi controlli lato server.
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const C = GA.config, enc = new TextEncoder();
  const hex = (b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  const unhex = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  const err = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
  const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };
  async function pbkdf2(pw, salt, it) { const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]); return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: it }, k, 256)); }
  const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
  const pub = (u) => u && { id: u.id, username: u.username, displayName: u.displayName, email: u.email, role: u.role, active: u.active, mustChangePassword: !!u.mustChangePassword, theme: u.theme || "", createdAt: u.createdAt, lastLogin: u.lastLogin };
  const pick = (o, keys) => { const r = {}; keys.forEach((k) => { if (k in o) r[k] = o[k]; }); return r; };
  const num = (v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", ".")) || 0);
  const N = (s) => String(s == null ? "" : s).trim().toLowerCase();

  // campi salvati di ogni collezione (le formule sono nel motore, mai salvate)
  const FIELDS = {
    transactions: ["type", "paid", "ref", "date", "accountId", "deptId", "categoryId", "desc", "gross", "vatId", "vatManual", "dedId", "notes", "recurrenceId", "paymentId", "eventId", "closing", "attachmentId", "invoiceId"],
    transfers: ["date", "from", "to", "amount", "notes"],
    accounts: ["name", "kind", "icon", "opening", "manual", "active"],
    departments: ["name"], vatRates: ["name", "pct", "manual"], dedRates: ["name", "pct"],
    categories: ["type", "name", "icon", "active", "need"],
    clients: GA.clientSchema.map((f) => f.key), events: GA.eventSchema.filter((k) => k !== "code"), payments: GA.paymentSchema,
    invoices: ["supplier", "number", "invoiceDate", "dueDate", "gross", "vat", "vatId", "vatManual", "dedId", "categoryId", "accountId", "notes", "attachmentId", "status", "paidDate", "paidAccountId", "paidAmount", "txId", "payTxIds"],
  };
  const MASTER = ["accounts", "departments", "vatRates", "dedRates", "categories"]; // solo admin

  /* Allegati (foto di scontrini/fatture): IndexedDB, che regge decine di MB; se non c'è, localStorage. */
  function FileStore(ns) {
    const DB = ns + "-files", ST = "att"; let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no-idb"));
      const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: "id" });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(ST, mode); const st = t.objectStore(ST); const out = fn(st); t.oncomplete = () => res(out && "result" in out ? out.result : undefined); t.onerror = () => rej(t.error); }); };
    const LS = ns + ":att:";
    const lsAll = () => Object.keys(localStorage).filter((k) => k.startsWith(LS)).map((k) => JSON.parse(localStorage.getItem(k)));
    return {
      put: async (rec) => { try { await tx("readwrite", (st) => st.put(rec)); } catch (e) { if (e && e.name === "QuotaExceededError") throw Object.assign(new Error("quota"), { code: "quota" }); localStorage.setItem(LS + rec.id, JSON.stringify(rec)); } return rec.id; },
      get: async (id) => { try { const v = await tx("readonly", (st) => st.get(id)); if (v) return v; } catch (e) { /* fallback */ } const l = localStorage.getItem(LS + id); return l ? JSON.parse(l) : null; },
      remove: async (id) => { try { await tx("readwrite", (st) => st.delete(id)); } catch (e) { /* fallback */ } localStorage.removeItem(LS + id); },
      all: async () => { let a = []; try { a = (await tx("readonly", (st) => st.getAll())) || []; } catch (e) { /* fallback */ } return a.concat(lsAll()); },
      clear: async () => { try { await tx("readwrite", (st) => st.clear()); } catch (e) { /* fallback */ } Object.keys(localStorage).filter((k) => k.startsWith(LS)).forEach((k) => localStorage.removeItem(k)); },
    };
  }

  // opt.store / opt.files: usati dal driver "supabase", che riusa queste stesse regole su una copia in memoria dei dati online
  function LocalDriver(ns, opt) {
    opt = opt || {};
    const LS = opt.store || { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: (k) => localStorage.removeItem(k), keys: () => Object.keys(localStorage) };
    const K = (k) => ns + ":" + k;
    const read = (k, d) => { try { const v = LS.getItem(K(k)); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
    const write = (k, v) => LS.setItem(K(k), JSON.stringify(v));
    let session = read("session", null);
    const files = opt.files || FileStore(ns);
    const withFiles = (c) => Object.assign({}, c, { remove: async (id) => { const t = read("transactions", []).find((x) => x.id === id); await c.remove(id); if (t && t.attachmentId) await files.remove(t.attachmentId); } });
    const gcFiles = async () => { const used = new Set([].concat(read("transactions", []).map((x) => x.attachmentId), read("invoices", []).map((x) => x.attachmentId)).filter(Boolean)); for (const f of await files.all()) if (!used.has(f.id) && Date.now() - (f.at || 0) > 864e5) await files.remove(f.id); };
    const users = () => read("users", []);
    const col = (n) => read(n, []);
    const seq = (k, p) => { const n = read("seq_" + k, 0) + 1; write("seq_" + k, n); return p + String(n).padStart(4, "0"); };
    const app = () => Object.assign({ allowSelfRegistration: C.auth.allowSelfRegistration }, read("app", {}));
    const book = () => read("book", null);

    // stili non più disponibili → stile sostitutivo (Oceano → Macaron, altri → Scuro), salvato nel profilo
    function migrateThemes() { const l = users(); let ch = false; l.forEach((u) => { if (u.theme && GA.themes && !GA.themes.includes(u.theme)) { u.theme = GA.themeFix(u.theme); ch = true; } }); if (ch) write("users", l); }
    function me() { if (!session || new Date(session.expires) < new Date()) return null; const u = users().find((x) => x.id === session.userId); return u && u.active ? u : null; }
    const reqU = () => { const u = me(); if (!u) throw err("auth"); return u; };
    const reqA = () => { const u = reqU(); if (u.role !== "admin") throw err("perm"); return u; };
    const own = (u, r) => u.role === "admin" || r.createdBy === u.id;
    const canSeeEv = (u, e) => u.role === "admin" || e.createdBy === u.id || e.owner === u.id;
    const start = (u) => { session = { userId: u.id, token: rnd(16), expires: new Date(Date.now() + C.auth.sessionHours * 3600e3).toISOString() }; write("session", session); };
    async function mkUser({ username, password, displayName, email, role }, must) {
      username = String(username || "").trim(); if (!username) throw err("required");
      if (users().some((x) => N(x.username) === N(username))) throw err("exists");
      if (!password || password.length < 8) throw err("weak");
      const salt = rnd(16), it = C.auth.pbkdf2Iterations;
      return { id: uid(), username, displayName: displayName || username, email: email || "", role: role === "admin" ? "admin" : "user", active: true, salt, iterations: it, hash: await pbkdf2(password, salt, it), mustChangePassword: !!must, createdAt: now() };
    }
    function initBook(lang) {
      const D = GA.defaults;
      write("book", D.book(lang)); write("accounts", D.accounts(lang)); write("departments", D.departments(lang));
      write("vatRates", D.vatRates(lang)); write("dedRates", D.dedRates()); write("categories", D.categories(lang));
      ["transactions", "transfers", "clients", "events", "payments", "invoices"].forEach((k) => write(k, []));
    }
    // validazione: nomi unici senza distinzione maiuscole/minuscole (come i confronti di Excel)
    function validate(name, rec, list) {
      if (name === "transactions") {
        if (!["in", "out"].includes(rec.type)) throw err("required");
        if (!rec.date || !/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) throw err("date");
        rec.gross = num(rec.gross); rec.vatManual = num(rec.vatManual); rec.paid = !!rec.paid && rec.paid !== "0";
        if (!rec.gross) throw err("amount");
      }
      if (name === "transfers") { rec.amount = num(rec.amount); if (!(rec.amount > 0) || !rec.from || !rec.to || rec.from === rec.to || !rec.date) throw err("transfer"); }
      if (["accounts", "departments", "categories", "vatRates", "dedRates"].includes(name)) {
        rec.name = String(rec.name || "").trim(); if (!rec.name) throw err("required");
        if (list.some((x) => x.id !== rec.id && N(x.name) === N(rec.name) && (name !== "categories" || x.type === rec.type))) throw err("dupName");
        if (name === "accounts") { rec.opening = num(rec.opening); rec.manual = rec.manual === "" || rec.manual == null ? "" : num(rec.manual); rec.active = rec.active !== false; rec.kind = rec.kind === "card" ? "card" : "account";
          const max = rec.kind === "card" ? C.maxCards : C.maxAccounts; if (!rec.id && list.filter((x) => x.kind === rec.kind).length >= max) throw err("max"); }
        if (name === "departments" && !rec.id && list.length >= C.maxDepartments) throw err("max");
        if (name === "vatRates" || name === "dedRates") rec.pct = num(rec.pct);
      }
      if (name === "clients" && !String(rec.name || "").trim()) throw err("required");
      if (name === "events") { if (!String(rec.title || "").trim()) throw err("required"); rec.total = num(rec.total); }
      if (name === "payments") { rec.amount = num(rec.amount); if (!(rec.amount > 0)) throw err("amount"); }
      if (name === "invoices") {
        rec.supplier = String(rec.supplier || "").trim(); if (!rec.supplier) throw err("required");
        if (!rec.invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(rec.invoiceDate)) throw err("date");
        if (!rec.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(rec.dueDate)) throw err("date");
        rec.gross = num(rec.gross); rec.vat = num(rec.vat); rec.vatManual = num(rec.vatManual); rec.paidAmount = num(rec.paidAmount);
        if (!(rec.gross > 0)) throw err("amount");
        if (rec.paidAmount < 0) rec.paidAmount = 0;
        if (rec.paidAmount > rec.gross) rec.paidAmount = rec.gross;
        rec.status = rec.paidAmount >= rec.gross - 0.004 ? "paid" : "open";
      }
    }
    function inUse(name, id) {
      const tx = col("transactions");
      if (name === "accounts") return tx.some((t) => t.accountId === id) || col("transfers").some((x) => x.from === id || x.to === id);
      if (name === "departments") return tx.some((t) => t.deptId === id);
      if (name === "categories") return tx.some((t) => t.categoryId === id);
      if (name === "vatRates") return tx.some((t) => t.vatId === id);
      if (name === "dedRates") return tx.some((t) => t.dedId === id);
      if (name === "clients") return col("events").some((e) => e.clientId === id);
      return false;
    }
    function saveIn(name, rec, u) {
      const list = col(name); const clean = pick(rec, FIELDS[name]); if (rec.id) clean.id = rec.id;
      if (rec.id) {
        const i = list.findIndex((x) => x.id === rec.id); if (i < 0) throw err("notfound");
        if (!MASTER.includes(name) && name !== "clients" && !own(u, list[i]) && !(name === "events" && canSeeEv(u, list[i]))) throw err("perm");
        const next = Object.assign({}, list[i], clean); validate(name, next, list);
        list[i] = Object.assign(next, { updatedAt: now(), updatedBy: u.id }); write(name, list); return list[i];
      }
      validate(name, clean, list);
      const r = Object.assign({ id: uid(), createdBy: u.id, createdAt: now(), updatedAt: now() }, clean);
      if (name === "events") { r.code = seq("ev", "EV-"); if (!r.owner) r.owner = u.id; }
      if (name === "payments") r.receiptNo = seq("rc", "RC-");
      list.push(r); write(name, list); return r;
    }
    function removeIn(name, id, u) {
      const list = col(name), r = list.find((x) => x.id === id); if (!r) return;
      if (!MASTER.includes(name) && !own(u, r)) throw err("perm");
      if (inUse(name, id)) throw err("inUse");
      write(name, list.filter((x) => x.id !== id));
    }
    // servizio CRUD generico con regole per collezione
    const crud = (name, opt = {}) => ({
      list: async () => { const u = reqU(); const l = col(name); return opt.filter ? l.filter((r) => opt.filter(u, r)) : l; },
      save: async (rec) => { const u = MASTER.includes(name) ? reqA() : reqU(); return saveIn(name, rec, u); },
      remove: async (id) => { const u = MASTER.includes(name) ? reqA() : reqU(); return removeIn(name, id, u); },
    });
    // collegamento pagamento evento → Entrata
    function syncEntry(p, entry, u) {
      const txs = col("transactions"); const e = col("events").find((x) => x.id === p.eventId) || {};
      const lang = (book() || {}).lang || "it"; const kindLbl = GA.tl ? GA.tl(lang, "o.payKind." + p.kind) : p.kind;
      const i = p.txId ? txs.findIndex((t) => t.id === p.txId) : -1;
      if (!entry) { if (i >= 0) { write("transactions", txs.filter((t) => t.id !== p.txId)); } return ""; }
      const b = book();
      const rec = { type: "in", paid: true, ref: e.code || "", date: p.date || GA.engine.today(), accountId: entry.accountId || b.eventsEntryAccount, deptId: entry.deptId || (col("departments")[0] || {}).id || "", categoryId: entry.categoryId || b.eventsEntryCategory || "", desc: kindLbl + " · " + (e.title || ""), gross: p.amount, vatId: entry.vatId || b.eventsEntryVat || b.vatDefaultIn, vatManual: 0, notes: p.note || "", paymentId: p.id, eventId: p.eventId };
      if (i >= 0) { txs[i] = Object.assign({}, txs[i], rec, { updatedAt: now(), updatedBy: u.id }); write("transactions", txs); return txs[i].id; }
      const t = Object.assign({ id: uid(), createdBy: u.id, createdAt: now(), updatedAt: now() }, rec); validate("transactions", t, txs); txs.push(t); write("transactions", txs); return t.id;
    }

    return {
      mode: "local",
      init: async () => {},
      // primo avvio: nessun utente → si crea l'amministratore (nessuna password predefinita)
      status: async () => ({ hasUsers: users().length > 0, setupDone: !!(book() && book().setupDone) }),
      bootstrap: async (d, lang) => {
        if (users().length) throw err("perm");
        const u = await mkUser(Object.assign({}, d, { role: "admin" })); u.lastLogin = now(); write("users", [u]); initBook(lang || C.defaultLanguage); start(u); return pub(u);
      },
      auth: {
        current: async () => { migrateThemes(); return pub(me()); },
        login: async (username, password) => {
          const list = users(), u = list.find((x) => N(x.username) === N(username));
          if (!u) { await pbkdf2(password, "00", 1000); throw err("badLogin"); }
          if (!safeEq(await pbkdf2(password, u.salt, u.iterations), u.hash)) throw err("badLogin");
          if (!u.active) throw err("disabled");
          u.lastLogin = now(); write("users", list); migrateThemes(); start(u); return pub(users().find((x) => x.id === u.id));
        },
        register: async (d) => { if (!app().allowSelfRegistration) throw err("regClosed"); const u = await mkUser(Object.assign({}, d, { role: "user" })); const l = users(); l.push(u); write("users", l); start(u); return pub(u); },
        logout: async () => { session = null; LS.removeItem(K("session")); },
        changePassword: async (o, n) => { const c = reqU(), l = users(), u = l.find((x) => x.id === c.id); if (!safeEq(await pbkdf2(o, u.salt, u.iterations), u.hash)) throw err("badLogin"); if (!n || n.length < 8) throw err("weak"); u.salt = rnd(16); u.iterations = C.auth.pbkdf2Iterations; u.hash = await pbkdf2(n, u.salt, u.iterations); u.mustChangePassword = false; write("users", l); },
        updateProfile: async ({ displayName, email, theme }) => { const c = reqU(), l = users(), u = l.find((x) => x.id === c.id); u.displayName = displayName || u.displayName; u.email = email ?? u.email; if (theme && GA.themes.includes(theme)) u.theme = theme; write("users", l); return pub(u); },
      },
      users: {
        directory: async () => { reqU(); return users().map((u) => ({ id: u.id, displayName: u.displayName, username: u.username, active: u.active })); },
        list: async () => { reqA(); return users().map(pub); },
        create: async (d) => { reqA(); const u = await mkUser(d, true); const l = users(); l.push(u); write("users", l); return pub(u); },
        update: async (id, p) => {
          const a = reqA(), l = users(), u = l.find((x) => x.id === id); if (!u) throw err("notfound");
          if (id === a.id && ((p.role && p.role !== "admin") || p.active === false)) throw err("cantSelf");
          ["displayName", "email", "role", "active"].forEach((k) => { if (k in p) u[k] = p[k]; });
          if (!l.some((x) => x.role === "admin" && x.active)) throw err("lastAdmin");
          write("users", l); return pub(u);
        },
        resetPassword: async (id, pw) => { reqA(); if (!pw || pw.length < 8) throw err("weak"); const l = users(), u = l.find((x) => x.id === id); u.salt = rnd(16); u.iterations = C.auth.pbkdf2Iterations; u.hash = await pbkdf2(pw, u.salt, u.iterations); u.mustChangePassword = true; write("users", l); },
        remove: async (id) => { const a = reqA(); if (id === a.id) throw err("cantSelf"); write("users", users().filter((x) => x.id !== id)); },
      },
      // impostazioni del libro contabile (IMPOSTAZIONI + obiettivi + giorni lavorativi)
      book: {
        get: async () => { reqU(); return book(); },
        set: async (patch) => { reqA(); const b = Object.assign({}, book(), patch); write("book", b); return b; },
        // giorni lavorativi: anche gli utenti? no, solo admin (come impostazione)
      },
      app: { get: async () => app(), set: async (p) => { reqA(); write("app", Object.assign(app(), p)); return app(); } },
      accounts: crud("accounts"), departments: crud("departments"), vatRates: crud("vatRates"), dedRates: crud("dedRates"), categories: crud("categories"),
      transactions: Object.assign(withFiles(crud("transactions")), {
        // CHIUSURA SERATA: una Entrata per canale non vuoto (Contanti, POS, Altro incasso) per data + attività.
        // Se la chiusura di quella data esiste già viene aggiornata (niente doppioni); un importo azzerato elimina la riga.
        saveClosing: async (d) => {
          const u = reqU(), b = book(); let txs = col("transactions");
          if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) throw err("date");
          const dept = d.deptId || (col("departments")[0] || {}).id || "";
          const ex = txs.filter((t) => t.closing && t.date === d.date && (t.deptId || "") === dept);
          if (ex.some((t) => !own(u, t))) throw err("perm");
          const rows = d.rows || {}; if (!GA.closingChannels.some(([ch]) => num((rows[ch] || {}).gross))) throw err("amount");
          const desc = GA.tl ? GA.tl(b.lang || "it", "cl.title") : "Chiusura serata"; const out = [];
          GA.closingChannels.forEach(([ch, K]) => {
            const r = rows[ch] || {}, g = Math.round(num(r.gross) * 100) / 100, old = ex.find((t) => t.closing === ch);
            if (!g) { if (old) txs = txs.filter((t) => t.id !== old.id); return; }
            const rec = { type: "in", date: d.date, deptId: dept, categoryId: b["closingCat" + K] || "", desc, gross: g, vatId: r.vatId || (GA.engine && GA.engine.closingVatId ? GA.engine.closingVatId(b, K, col("vatRates")) : b["closingVat" + K] || b.vatDefaultIn), vatManual: 0, dedId: "", notes: d.notes || "", closing: ch,
              paid: true, accountId: b["closingAcc" + K] || b.closingAccCash || (col("accounts")[0] || {}).id };
            if (old) { const i = txs.findIndex((t) => t.id === old.id); const n = Object.assign({}, old, rec, { updatedAt: now(), updatedBy: u.id }); validate("transactions", n, txs); txs[i] = n; out.push(n); }
            else { const n = Object.assign({ id: uid(), createdBy: u.id, createdAt: now(), updatedAt: now() }, rec); validate("transactions", n, txs); txs.push(n); out.push(n); }
          });
          write("transactions", txs); return out;
        },
        // (compatibilità) segna come pagata una riga di chiusura o un'entrata pianificata sul conto scelto
        collect: async (id, accountId) => { const u = reqU(); return saveIn("transactions", { id, paid: true, accountId }, u); },
        // inserimento multiplo (ricorrenze, import): tutto o niente
        bulk: async (recs) => { const u = reqU(); const l = col("transactions"); const out = recs.map((r) => { const c = pick(r, FIELDS.transactions); validate("transactions", c, l); return Object.assign({ id: uid(), createdBy: u.id, createdAt: now(), updatedAt: now() }, c); }); write("transactions", l.concat(out)); return out.length; },
        togglePaid: async (id) => { const u = reqU(); const l = col("transactions"); const t = l.find((x) => x.id === id); if (!t) throw err("notfound"); if (!own(u, t)) throw err("perm"); t.paid = !t.paid; t.updatedAt = now(); write("transactions", l);
          if (t.invoiceId) { const invs = col("invoices"); const inv = invs.find((x) => x.id === t.invoiceId); if (inv && inv.txId === id) { if (t.paid) { inv.paidAmount = num(inv.gross); inv.status = "paid"; inv.paidDate = t.date; inv.paidAccountId = t.accountId; } else { inv.paidAmount = Math.max(0, num(inv.paidAmount) - num(t.gross)); inv.status = "open"; inv.paidDate = ""; } inv.updatedAt = now(); write("invoices", invs); } }
          return t; },
        remove: async (id) => { const u = reqU(); const l = col("transactions"); const t = l.find((x) => x.id === id); if (!t) return; if (!own(u, t)) throw err("perm"); write("transactions", l.filter((x) => x.id !== id)); if (t.paymentId) { const ps = col("payments"); const p = ps.find((x) => x.id === t.paymentId); if (p) { p.txId = ""; write("payments", ps); } }
          if (t.invoiceId) { const invs = col("invoices"); const inv = invs.find((x) => x.id === t.invoiceId); if (inv) { if (inv.txId === id) inv.txId = ""; if (inv.payTxIds) inv.payTxIds = String(inv.payTxIds).split(",").filter((x) => x && x !== id).join(","); invs[invs.findIndex((x) => x.id === inv.id)] = inv; write("invoices", invs); } } },
      }),
      transfers: crud("transfers"),
      clients: crud("clients"),
      events: Object.assign(crud("events", { filter: canSeeEv }), {
        remove: async (id) => { const u = reqU(); const e = col("events").find((x) => x.id === id); if (!e) return; if (!own(u, e)) throw err("perm");
          const ps = col("payments").filter((p) => p.eventId === id); const txIds = new Set(ps.map((p) => p.txId).filter(Boolean));
          write("transactions", col("transactions").filter((t) => !txIds.has(t.id))); write("payments", col("payments").filter((p) => p.eventId !== id)); write("events", col("events").filter((x) => x.id !== id)); },
      }),
      payments: {
        list: async () => { const u = reqU(); const ev = new Set(col("events").filter((e) => canSeeEv(u, e)).map((e) => e.id)); return col("payments").filter((p) => ev.has(p.eventId)); },
        // entry: null = nessuna Entrata; {accountId, categoryId, vatId, deptId} = crea/aggiorna l'Entrata collegata
        save: async (rec, entry) => {
          const u = reqU(); const e = col("events").find((x) => x.id === rec.eventId); if (!e || !canSeeEv(u, e)) throw err("perm");
          const prev = rec.id ? col("payments").find((x) => x.id === rec.id) : null;
          const p = saveIn("payments", Object.assign({}, rec, { txId: prev ? prev.txId : "" }), u);
          const txId = syncEntry(p, entry, u); const l = col("payments"); const i = l.findIndex((x) => x.id === p.id); l[i].txId = txId; write("payments", l); return l[i];
        },
        remove: async (id, alsoEntry) => { const u = reqU(); const p = col("payments").find((x) => x.id === id); if (!p) return; if (!own(u, p)) throw err("perm"); if (alsoEntry && p.txId) write("transactions", col("transactions").filter((t) => t.id !== p.txId)); write("payments", col("payments").filter((x) => x.id !== id)); },
      },
      // allegati: { id, type, name, dataUrl, w, h, size, at }

      invoices: (function () {
        const descOf = (inv) => [inv.number ? ("Ft. " + inv.number) : "", inv.supplier].filter(Boolean).join(" · ") || "Fattura";
        const todaySafe = () => (GA.engine && GA.engine.today) ? GA.engine.today() : now().slice(0, 10);
        const putTx = (txs, rec, u, id) => {
          if (id) {
            const i = txs.findIndex((x) => x.id === id);
            if (i >= 0) { const n = Object.assign({}, txs[i], rec, { id, updatedAt: now(), updatedBy: u.id }); validate("transactions", n, txs); txs[i] = n; return n.id; }
          }
          const n = Object.assign({ id: uid(), createdBy: u.id, createdAt: now(), updatedAt: now() }, rec);
          validate("transactions", n, txs); txs.push(n); return n.id;
        };
        const baseRec = (inv, gross, paid, date, accountId) => ({
          type: "out", paid: !!paid, date: date, accountId: accountId || inv.accountId,
          categoryId: inv.categoryId || "", desc: descOf(inv), gross: gross, vatId: inv.vatId, vatManual: inv.vatManual || 0,
          dedId: inv.dedId || "", notes: inv.notes || "", ref: inv.number || "", attachmentId: inv.attachmentId || "", invoiceId: inv.id,
        });
        const remOf = (inv) => Math.round((num(inv.gross) - num(inv.paidAmount)) * 100) / 100;
        const persistInv = (inv) => { const list = col("invoices"); const i = list.findIndex((x) => x.id === inv.id); if (i >= 0) list[i] = inv; else list.push(inv); write("invoices", list); return inv; };
        const syncPlanned = (inv, u) => {
          const txs = col("transactions");
          const rem = remOf(inv);
          if (rem > 0.004) {
            inv.txId = putTx(txs, baseRec(inv, rem, false, inv.dueDate || inv.invoiceDate, inv.accountId), u, inv.txId);
            write("transactions", txs);
          } else if (inv.txId) {
            const t = txs.find((x) => x.id === inv.txId);
            if (t && !t.paid) { write("transactions", txs.filter((x) => x.id !== inv.txId)); inv.txId = ""; }
          }
          return persistInv(inv);
        };
        return {
          list: async () => { reqU(); return col("invoices"); },
          save: async (rec) => { const u = reqU(); const inv = saveIn("invoices", rec, u); return syncPlanned(inv, u); },
          remove: async (id) => {
            const u = reqU(); const inv = col("invoices").find((x) => x.id === id); if (!inv) return; if (!own(u, inv)) throw err("perm");
            let txs = col("transactions");
            if (inv.txId) { const t = txs.find((x) => x.id === inv.txId); if (t && !t.paid) txs = txs.filter((x) => x.id !== inv.txId); }
            write("transactions", txs);
            write("invoices", col("invoices").filter((x) => x.id !== id));
          },
          markPaid: async (id, p) => {
            const u = reqU(); const inv = col("invoices").find((x) => x.id === id); if (!inv) throw err("notfound"); if (!own(u, inv)) throw err("perm");
            const rem = remOf(inv); if (rem <= 0.004) return inv;
            const date = (p && p.date) || todaySafe();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw err("date");
            const accountId = (p && p.accountId) || inv.accountId;
            let amount = num(p && p.amount) || rem;
            if (amount <= 0) throw err("amount");
            if (amount > rem + 0.004) amount = rem;
            amount = Math.round(amount * 100) / 100;
            const txs = col("transactions");
            const full = amount >= rem - 0.004;
            if (full) {
              inv.txId = putTx(txs, baseRec(inv, rem, true, date, accountId), u, inv.txId);
              inv.paidAmount = num(inv.gross); inv.status = "paid"; inv.paidDate = date; inv.paidAccountId = accountId;
            } else {
              const pid = putTx(txs, baseRec(inv, amount, true, date, accountId), u, null);
              inv.payTxIds = [inv.payTxIds, pid].filter(Boolean).join(",").replace(/^,|,$/g, "");
              inv.paidAmount = Math.round((num(inv.paidAmount) + amount) * 100) / 100;
              inv.txId = putTx(txs, baseRec(inv, remOf(inv), false, inv.dueDate || inv.invoiceDate, inv.accountId), u, inv.txId);
              inv.status = "open";
            }
            write("transactions", txs);
            inv.updatedAt = now(); inv.updatedBy = u.id;
            return persistInv(inv);
          },
        };
      })(),
      attachments: {
        put: async (rec) => { reqU(); const r = Object.assign({ id: uid(), at: Date.now() }, pick(rec, ["id", "type", "name", "dataUrl", "w", "h", "size", "source"])); if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(r.dataUrl || "")) throw err("format"); gcFiles().catch(() => {}); return files.put(r); },
        get: async (id) => { reqU(); return files.get(id); },
        remove: async (id) => { reqU(); await files.remove(id); },
        gc: gcFiles,
      },
      admin: {
        exportAll: async () => { reqA(); const o = { format: "gestione-attivita", version: 3, exportedAt: now(), users: users(), app: app(), book: book() }; ["accounts", "departments", "vatRates", "dedRates", "categories", "transactions", "transfers", "clients", "events", "payments", "invoices"].forEach((k) => (o[k] = col(k))); o.seq = { ev: read("seq_ev", 0), rc: read("seq_rc", 0) }; o.attachments = await files.all(); return o; },
        importAll: async (d) => { reqA(); if (!d || d.format !== "gestione-attivita" || !Array.isArray(d.users) || !d.book) throw err("format"); write("users", d.users); write("app", d.app || {}); write("book", d.book); ["accounts", "departments", "vatRates", "dedRates", "categories", "transactions", "transfers", "clients", "events", "payments", "invoices"].forEach((k) => write(k, d[k] || [])); write("seq_ev", (d.seq || {}).ev || 0); write("seq_rc", (d.seq || {}).rc || 0); await files.clear(); for (const f of Array.isArray(d.attachments) ? d.attachments : []) if (f && f.id && /^data:/.test(f.dataUrl || "")) await files.put(f); },
        // svuota il libro contabile (movimenti, impostazioni → predefinite), mantiene gli utenti
        resetBook: async () => { const a = reqA(); initBook((book() || {}).lang || C.defaultLanguage); await files.clear(); void a; },
        wipeAll: async () => { reqA(); await files.clear(); LS.keys().filter((k) => k.startsWith(ns + ":")).forEach((k) => LS.removeItem(k)); session = null; },
      },
      migrateClosingV13: async () => {
        const u = reqU();
        const b = book() || {};
        const accs = col("accounts");
        const defAcc = b.closingAccUnpaid || b.closingAccCash || (accs.find((a) => a.active !== false) || accs[0] || {}).id || "";
        const can = (t) => own(u, t);
        const txM = (GA.engine && GA.engine.migrateClosingUnpaid) ? GA.engine.migrateClosingUnpaid(col("transactions"), { accounts: accs, defaultAccountId: defAcc, canEdit: can }) : { transactions: col("transactions"), changed: 0 };
        if (txM.changed) {
          const stamped = txM.transactions.map((t, i) => {
            const o = col("transactions")[i];
            return (o && t !== o) ? Object.assign({}, t, { updatedAt: now(), updatedBy: u.id }) : t;
          });
          write("transactions", stamped);
        }
        let catChanged = 0;
        if (u.role === "admin" && GA.engine && GA.engine.renameClosingUnpaidCategory) {
          const catM = GA.engine.renameClosingUnpaidCategory(col("categories"), b.lang || (GA.i18n && GA.i18n.lang) || "it");
          if (catM.changed) { write("categories", catM.categories); catChanged = catM.changed; }
        }
        return { transactions: txM.changed, categories: catChanged };
      },
      migrateClosingV14: async () => {
        const u = reqU();
        const E = GA.engine;
        if (!E || !E.applyClosingVatDefaults) return { transactions: 0, book: false, vat: false };
        const isAdmin = u.role === "admin";
        const rates0 = col("vatRates");
        const applied = E.applyClosingVatDefaults(book() || {}, rates0, (book() || {}).lang || (GA.i18n && GA.i18n.lang) || "it");
        if (isAdmin && applied.createdRate) write("vatRates", applied.rates);
        if (isAdmin && applied.bookChanged) write("book", applied.book);
        const vatId = applied.zeroId || E.closingVatId(applied.book, "Unpaid", applied.rates);
        const shouldTx = (isAdmin && applied.firstUnpaid) || (!isAdmin && !(book() || {}).closingVatUnpaid);
        let nTx = 0;
        if (shouldTx && vatId) {
          const txs = col("transactions");
          const txM = E.migrateClosingUnpaidVat(txs, { vatId, canEdit: (t) => own(u, t) });
          if (txM.changed) {
            const stamped = txM.transactions.map((t, i) => (txs[i] && t !== txs[i]) ? Object.assign({}, t, { updatedAt: now(), updatedBy: u.id }) : t);
            write("transactions", stamped);
            nTx = txM.changed;
          }
        }
        return { transactions: nTx, book: !!(isAdmin && applied.bookChanged), vat: !!(isAdmin && applied.createdRate) };
      },
      _initBook: initBook, _reloadSession: () => { session = read("session", null); },
    };
  }

  /* ---------------- Driver REST (server: server/ in questo pacchetto) ----------------
   Sessione in un cookie httpOnly (il token non è mai leggibile da JavaScript); ogni scrittura porta l'intestazione X-GA
   (protezione CSRF). Stesse firme del driver locale: la UI non cambia. */
  function RestDriver(base) {
    async function req(m, p, body) {
      let r;
      try { r = await fetch(base + p, { method: m, credentials: "same-origin", cache: "no-store", headers: Object.assign({ "X-GA": "1" }, body !== undefined ? { "Content-Type": "application/json" } : {}), body: body !== undefined ? JSON.stringify(body) : undefined }); }
      catch (e) { throw err("network"); }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw err(j.code || (r.status === 401 ? "auth" : r.status === 403 ? "perm" : r.status === 413 ? "tooLarge" : r.status === 429 ? "rate" : "http")); }
      return r.status === 204 ? null : r.json();
    }
    const crud = (n) => ({ list: () => req("GET", "/" + n), save: (r) => (r.id ? req("PUT", `/${n}/${r.id}`, r) : req("POST", "/" + n, r)), remove: (id) => req("DELETE", `/${n}/${id}`) });
    return {
      mode: "rest", init: async () => {},
      status: () => req("GET", "/status"),
      bootstrap: (d, lang) => req("POST", "/bootstrap", Object.assign({ lang }, d)),
      auth: {
        current: async () => { try { return await req("GET", "/auth/me"); } catch (e) { if (e.code === "auth") return null; throw e; } },
        login: (u, p, tenant) => req("POST", "/auth/login", { username: u, password: p, tenant }), register: (d) => req("POST", "/auth/register", d),
        logout: () => req("POST", "/auth/logout", {}), changePassword: (o, n) => req("POST", "/auth/password", { oldPassword: o, newPassword: n }), updateProfile: (d) => req("PATCH", "/auth/me", d),
      },
      users: { directory: () => req("GET", "/users/directory"), list: () => req("GET", "/users"), create: (d) => req("POST", "/users", d), update: (id, p) => req("PATCH", "/users/" + id, p), resetPassword: (id, password) => req("POST", `/users/${id}/password`, { password }), remove: (id) => req("DELETE", "/users/" + id) },
      book: { get: () => req("GET", "/book"), set: (p) => req("PATCH", "/book", p) }, app: { get: () => req("GET", "/app"), set: (p) => req("PATCH", "/app", p) },
      accounts: crud("accounts"), departments: crud("departments"), vatRates: crud("vat-rates"), dedRates: crud("deduction-rates"), categories: crud("categories"),
      transactions: Object.assign(crud("transactions"), { bulk: (r) => req("POST", "/transactions/bulk", r).then((j) => j.count), togglePaid: (id) => req("POST", `/transactions/${id}/toggle-paid`, {}), saveClosing: (d) => req("POST", "/transactions/closing", d), collect: (id, accountId) => req("POST", `/transactions/${id}/collect`, { accountId }) }),
      migrateClosingV13: () => req("POST", "/transactions/migrate-closing-v13", {}),
      migrateClosingV14: () => req("POST", "/transactions/migrate-closing-v14", {}),
      transfers: crud("transfers"), clients: crud("clients"), events: crud("events"),
      payments: { list: () => req("GET", "/payments"), save: (r, entry) => (r.id ? req("PUT", "/payments/" + r.id, { payment: r, entry }) : req("POST", "/payments", { payment: r, entry })), remove: (id, alsoEntry) => req("DELETE", `/payments/${id}?entry=${alsoEntry ? 1 : 0}`) },
      invoices: Object.assign(crud("invoices"), { markPaid: (id, p) => req("POST", `/invoices/${id}/pay`, p || {}) }),
      // foto: il server le salva su disco (limite di dimensione e quota per azienda); get restituisce i metadati e l'indirizzo dell'immagine
      attachments: { put: (rec) => req("POST", "/attachments", rec).then((j) => j.id), get: (id) => req("GET", "/attachments/" + id), remove: (id) => req("DELETE", "/attachments/" + id), gc: async () => {} },
      admin: { exportAll: () => req("GET", "/admin/export"), importAll: (d) => req("POST", "/admin/import", d), resetBook: () => req("POST", "/admin/reset-book", {}), wipeAll: () => req("POST", "/admin/wipe", {}), audit: (n) => req("GET", "/admin/audit?limit=" + (n || 100)) },
      platform: { tenants: () => req("GET", "/platform/tenants"), createTenant: (d) => req("POST", "/platform/tenants", d), setActive: (id, active) => req("PATCH", "/platform/tenants/" + id, { active }) },
    };
  }
  /* ---------------- Driver "supabase" (versione gratuita: app su GitHub Pages, dati su Supabase) ----------------
   Tutto passa da UNA funzione del database, ga() (vedi supabase/schema.sql), che controlla sessione, ruolo e proprietà dei dati.
   Le regole di calcolo e di validazione sono quelle del driver locale, applicate a una copia in memoria sincronizzata:
   prima di ogni operazione si scaricano le modifiche degli altri, dopo si inviano solo i record cambiati. */
  function CloudDriver(url, key) {
    if (!url || !key || /INSERISCI|YOUR_/i.test(url + key)) console.warn("Supabase non configurato: modifica js/runtime-config.js");
    const TK = "ga_cloud_token"; let token = localStorage.getItem(TK) || "";
    const setToken = (t) => { token = t || ""; if (token) localStorage.setItem(TK, token); else localStorage.removeItem(TK); };
    async function rpc(fn, args) {
      let r;
      try { r = await fetch(String(url).replace(/\/+$/, "") + "/rest/v1/rpc/ga", { method: "POST", cache: "no-store", headers: Object.assign({ apikey: key, "Content-Type": "application/json" }, /^eyJ/.test(key) ? { Authorization: "Bearer " + key } : {}), body: JSON.stringify({ p: { token, fn, args: args || {} } }) }); }
      catch (e) { throw err("network"); }
      if (!r.ok) throw err(r.status === 413 ? "tooLarge" : r.status === 429 ? "rate" : r.status >= 500 ? "server" : "http");
      const j = await r.json();
      if (j && typeof j === "object" && !Array.isArray(j) && typeof j.error === "string") { if (j.error === "auth") { setToken(""); setMe(null); } throw err(j.error); }
      return j;
    }
    const NS = "c", COLLS = ["accounts", "departments", "vatRates", "dedRates", "categories", "transactions", "transfers", "clients", "events", "payments", "invoices"], KVS = ["book", "app", "seq_ev", "seq_rc"];
    const mem = new Map(); const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), keys: () => [...mem.keys()] };
    const K = (k) => NS + ":" + k, get = (k, d) => { const v = store.getItem(K(k)); return v == null ? d : JSON.parse(v); }, put = (k, v) => store.setItem(K(k), JSON.stringify(v));
    const files = { put: async (rec) => (await rpc("files.put", rec)).id, get: (id) => rpc("files.get", { id }), remove: (id) => rpc("files.remove", { id }), all: async () => [], clear: async () => {} };
    const core = LocalDriver(NS, { store, files });
    let since = 0, lastPull = 0, me = null;
    function setMe(u) { me = u || null; if (me) { put("users", [Object.assign({}, me)]); put("session", { userId: me.id, token: "-", expires: "9999-12-31T00:00:00.000Z" }); } else { store.removeItem(K("users")); store.removeItem(K("session")); } core._reloadSession(); }
    function clearCache() { [...COLLS, ...KVS].forEach((k) => store.removeItem(K(k))); since = 0; lastPull = 0; }
    async function pull(force) {
      if (!force && Date.now() - lastPull < 1500) return;
      const j = await rpc("pull", { since });
      const by = {}; for (const d of j.docs) (by[d.c] = by[d.c] || []).push(d);
      for (const c of Object.keys(by)) { const l = get(c, []); for (const d of by[c]) { const i = l.findIndex((x) => x.id === d.id); if (d.del) { if (i >= 0) l.splice(i, 1); } else if (i >= 0) l[i] = d.d; else l.push(d.d); } put(c, l); }
      for (const k of KVS) { if (j.kv && k in j.kv) put(k, j.kv[k]); else store.removeItem(K(k)); }
      since = Math.max(since, Number(j.rev) || 0); lastPull = Date.now(); setMe(j.me);
    }
    const snap = () => { const o = {}; for (const k of COLLS.concat(KVS)) o[k] = store.getItem(K(k)); return o; };
    function diff(before) {
      const ops = [];
      for (const k of COLLS) {
        const a = new Map(JSON.parse(before[k] || "[]").map((x) => [x.id, JSON.stringify(x)])), seen = new Set();
        for (const x of get(k, [])) { seen.add(x.id); if (a.get(x.id) !== JSON.stringify(x)) ops.push({ op: "put", c: k, id: x.id, d: x }); }
        for (const id of a.keys()) if (!seen.has(id)) ops.push({ op: "del", c: k, id });
      }
      for (const k of KVS) { const v = store.getItem(K(k)); if (v != null && v !== before[k]) ops.push({ op: "kv", c: k, d: JSON.parse(v) }); }
      return ops;
    }
    // una operazione alla volta: scarica → applica le regole → invia le differenze (in caso di errore la copia locale si riscarica)
    let queue = Promise.resolve();
    const wrap = (fn, write) => (...args) => {
      const r = queue.then(async () => {
        await pull(write); const before = snap();
        try { const out = await fn(...args); const ops = diff(before); for (let i = 0; i < ops.length; i += 400) await rpc("write", { ops: ops.slice(i, i + 400) }); if (ops.length) lastPull = 0; return out; }
        catch (e) { clearCache(); throw e; }
      });
      queue = r.catch(() => {}); return r;
    };
    const W = (o, reads) => { const r = {}; for (const [k, f] of Object.entries(o)) if (typeof f === "function") r[k] = wrap(f, !(reads || ["list", "get"]).includes(k)); return r; };
    const initRemote = (lang, company) => wrap(async () => { core._initBook(lang || C.defaultLanguage); if (company) put("book", Object.assign(get("book", {}), { company: String(company).trim() })); }, true)();
    const after = (j) => { setToken(j.token); clearCache(); setMe(j.user); return j.user; };
    return {
      mode: "cloud", init: async () => {},
      status: () => rpc("status"),
      bootstrap: async (d, lang) => { const j = await rpc("bootstrap", Object.assign({ lang }, d)); after(j); await initRemote(lang, d && d.company); return j.user; },
      auth: {
        current: async () => { if (!token) return null; try { const u = await rpc("me"); setMe(u); return u; } catch (e) { if (e.code === "auth") return null; throw e; } },
        login: async (u, p) => after(await rpc("login", { username: u, password: p })),
        register: async (d) => after(await rpc("register", d)),
        logout: async () => { await rpc("logout").catch(() => {}); setToken(""); clearCache(); setMe(null); },
        changePassword: (o, n) => rpc("changePassword", { oldPassword: o, newPassword: n }),
        updateProfile: async (d) => { const u = await rpc("updateProfile", d); setMe(u); return u; },
      },
      users: { directory: () => rpc("users.directory"), list: () => rpc("users.list"), create: (d) => rpc("users.create", d), update: (id, patch) => rpc("users.update", { id, patch }), resetPassword: (id, password) => rpc("users.resetPassword", { id, password }), remove: (id) => rpc("users.remove", { id }) },
      book: W(core.book),
      migrateClosingV13: wrap(core.migrateClosingV13, true),
      migrateClosingV14: wrap(core.migrateClosingV14, true),
      app: { get: async () => (token ? wrap(core.app.get, false)() : rpc("status").then((s) => ({ allowSelfRegistration: !!s.allowSelfRegistration }))), set: wrap(core.app.set, true) },
      accounts: W(core.accounts), departments: W(core.departments), vatRates: W(core.vatRates), dedRates: W(core.dedRates), categories: W(core.categories),
      transactions: W(core.transactions), transfers: W(core.transfers), clients: W(core.clients), events: W(core.events), payments: W(core.payments), invoices: W(core.invoices),
      attachments: { put: (rec) => rpc("files.put", pick(rec || {}, ["id", "type", "name", "dataUrl", "w", "h"])).then((j) => j.id), get: (id) => rpc("files.get", { id }), remove: (id) => rpc("files.remove", { id }), gc: async () => {}, usage: () => rpc("files.usage") },
      admin: {
        exportAll: async () => {
          const o = await wrap(core.admin.exportAll, false)(); o.users = await rpc("users.list"); o.attachments = [];
          for (const id of await rpc("admin.files")) { const f = await rpc("files.get", { id }); if (f) o.attachments.push(f); }
          return o;
        },
        // ripristino di un backup (anche dell'app offline): sostituisce i dati online; gli utenti nuovi arrivano senza password
        importAll: async (d) => {
          if (!d || d.format !== "gestione-attivita" || !Array.isArray(d.users) || !d.book) throw err("format");
          await rpc("admin.reset"); const nu = await rpc("admin.importUsers", { users: d.users });
          const docs = []; for (const c of COLLS) for (const x of Array.isArray(d[c]) ? d[c] : []) if (x && x.id) docs.push({ c, id: x.id, d: x });
          for (let i = 0; i < docs.length; i += 300) await rpc("admin.importDocs", { docs: docs.slice(i, i + 300) });
          await rpc("write", { ops: [{ op: "kv", c: "book", d: d.book }, { op: "kv", c: "app", d: d.app || {} }, { op: "kv", c: "seq_ev", d: (d.seq || {}).ev || 0 }, { op: "kv", c: "seq_rc", d: (d.seq || {}).rc || 0 }] });
          let na = 0; for (const f of Array.isArray(d.attachments) ? d.attachments : []) if (f && f.id && /^data:/.test(f.dataUrl || "")) { await rpc("files.put", pick(f, ["id", "type", "name", "dataUrl", "w", "h"])); na++; }
          clearCache(); return { users: nu.users, attachments: na, keptCurrentUser: true, needPassword: nu.users };
        },
        resetBook: async () => { const lang = (get("book", {}) || {}).lang; await rpc("admin.reset"); clearCache(); await initRemote(lang); },
        wipeAll: async () => { await rpc("admin.wipe"); setToken(""); clearCache(); setMe(null); },
        audit: (n) => rpc("admin.audit", { limit: n || 100 }),
      },
    };
  }
  GA.api = C.storage.driver === "rest" ? RestDriver(C.storage.restBaseUrl) : C.storage.driver === "supabase" ? CloudDriver(C.storage.supabaseUrl, C.storage.supabaseKey) : LocalDriver(C.storage.namespace);
})();
