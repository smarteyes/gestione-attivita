/* =========================================================
 * GUSCIO DELL'APP: accesso, menu, router, impostazioni, utenti, profilo,
 * configurazione guidata, import/export. Parla solo con GA.api.
 * ========================================================= */
(function () {
  const t = GA.t, api = GA.api, C = GA.config, E = GA.engine, I = GA.icon;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const S = { user: null, loaded: false, f: { type: "", paid: "", period: "", accountId: "", deptId: "", categoryId: "", ref: "", q: "" } };
  GA.theme.apply(GA.theme.device()); // stile dell'ultimo utente su questo dispositivo
  const app = () => $("#app");
  const appName = () => (typeof C.brand.appName === "string" ? C.brand.appName : C.brand.appName[GA.i18n.lang] || C.brand.appName.it);
  const isAdmin = () => S.user && S.user.role === "admin";

  /* ---------- formattazione ---------- */
  const money = (v, opt = {}) => { const n = Number(v) || 0; try { return new Intl.NumberFormat(GA.i18n.locale(), Object.assign({ style: "currency", currency: (S.book && S.book.currency) || "EUR" }, opt)).format(n); } catch (e) { return n.toFixed(2); } };
  const money0 = (v) => money(v, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : new Intl.NumberFormat(GA.i18n.locale(), { style: "percent", maximumFractionDigits: d }).format(v));
  const fmtDate = (s, o) => { if (!s) return ""; const d = new Date(s.length <= 10 ? s + "T00:00:00" : s); return isNaN(d) ? s : d.toLocaleDateString(GA.i18n.locale(), o); };
  const monthName = (k, style = "long") => new Date(k + "-01T00:00:00").toLocaleDateString(GA.i18n.locale(), { month: style, year: "numeric" });
  const monthShort = (k) => new Date(k + "-01T00:00:00").toLocaleDateString(GA.i18n.locale(), { month: "short" });
  const uname = (id) => { const u = (S.dir || []).find((x) => x.id === id); return u ? u.displayName : "—"; };
  const errMsg = (e) => { const c = e && e.code; const map = { badLogin: "auth.badLogin", quota: "err.quota", exists: "auth.exists", weak: "auth.weak", disabled: "auth.disabled", regClosed: "auth.regClosed", required: "m.required", perm: "m.noPerm", cantSelf: "u.cantSelf", lastAdmin: "u.lastAdmin", inUse: "m.inUse", amount: "m.amount", date: "m.date", transfer: "m.transfer", dupName: "m.dupName", max: "m.max", format: "m.format", mismatch: "auth.mismatch", setupToken: "srv.e_setupToken", tenantRequired: "srv.e_tenantRequired", network: "srv.e_network", rate: "srv.e_rate", tooLarge: "srv.e_tooLarge", csrf: "srv.e_server", server: "srv.e_server", http: "srv.e_server", auth: "srv.e_auth", number: "m.format", tooLong: "srv.e_tooLong", scanDisabled: "srv.e_server" }; return map[c] ? t(map[c]) : (e && e.message) || "Error"; };
  const nameOf = (list, id, fb = "") => { const x = (S[list] || []).find((r) => r.id === id); return x ? x.name : fb; };

  /* ---------- toast, modali, conferme ---------- */
  function toast(msg, bad) { const el = document.createElement("div"); el.className = "toast" + (bad ? " bad" : ""); el.textContent = msg; document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("show")); setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2400); }
  function modal(html, size) {
    closeModal();
    const w = document.createElement("div"); w.className = "modal-wrap"; w.innerHTML = `<div class="modal ${size || ""}" role="dialog" aria-modal="true">${html}</div>`;
    w.addEventListener("mousedown", (e) => { if (e.target === w) closeModal(); });
    document.body.appendChild(w); document.body.classList.add("noscroll"); return w.firstElementChild;
  }
  function closeModal() { $$(".modal-wrap").forEach((m) => m.remove()); document.body.classList.remove("noscroll"); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  const mhead = (title) => `<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="${t("a.close")}">${I("x")}</button></div>`;
  function confirmBox(msg) {
    return new Promise((res) => {
      const m = modal(`<p class="confirm-msg">${esc(msg)}</p><div class="actions"><button class="btn" data-v="0">${t("a.no")}</button><button class="btn danger" data-v="1">${t("a.yes")}</button></div>`, "sm");
      m.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { closeModal(); res(b.dataset.v === "1"); } });
    });
  }
  function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  function applyBrand() { const r = document.documentElement.style; r.setProperty("--brand", C.brand.accent); r.setProperty("--brand-soft", C.brand.accentSoft); /* colore del marchio = accento del tema Minimal */ document.title = appName(); }
  const langSelect = () => `<label class="lang-sel">${I("globe")}<select class="lang" aria-label="${t("set.language")}">${C.languages.map((l) => `<option value="${l}" ${l === GA.i18n.lang ? "selected" : ""}>${GA.dict[l]._name}</option>`).join("")}</select></label>`;
  function bindLang(root) { $$("select.lang", root).forEach((s) => s.addEventListener("change", () => { GA.i18n.set(s.value); document.title = appName(); render(); })); }
  const brand = () => `<div class="brand"><img src="${esc(C.brand.logo)}" alt=""><span>${esc(appName())}</span></div>`;

  /* ---------- ACCESSO / PRIMO AVVIO ---------- */
  async function renderAuth(tk) {
    const st = await api.status(); const ap = await api.app.get().catch(() => ({}));
    if (tk !== S._rt) return;
    const mode = !st.hasUsers ? "first" : location.hash === "#/register" && ap.allowSelfRegistration ? "register" : "login";
    const reg = mode !== "login";
    app().innerHTML = `<div class="auth-page"><div class="auth-card">
      <div class="auth-top">${brand()}${langSelect()}</div>
      <h1>${mode === "first" ? t("auth.firstRun") : reg ? t("auth.register") : t("auth.login")}</h1>
      ${mode === "first" ? `<p class="muted">${t("auth.firstRunHint")}</p>` : ""}
      <form id="authForm" class="stack" autocomplete="on">
        ${mode === "first" && st.needsSetupToken ? `<label>${t("auth.setupToken")}<input name="setupToken" required autocomplete="off" autocapitalize="none"><small class="muted">${t("auth.setupTokenHint")}</small></label>` : ""}
        ${mode === "first" && st.server ? `<label>${t("auth.company")}<input name="company" autocomplete="organization"></label>` : ""}
        <label>${t("auth.username")}<input name="username" required autocomplete="username" autocapitalize="none"></label>
        ${mode === "login" && st.multiTenant ? `<label>${t("auth.tenant")}<input name="tenant" autocapitalize="none" autocomplete="organization"><small class="muted">${t("auth.tenantHint")}</small></label>` : ""}
        ${reg ? `<label>${t("auth.displayName")}<input name="displayName"></label>` : ""}
        <label>${t("auth.password")}<input name="password" type="password" required autocomplete="${reg ? "new-password" : "current-password"}" ${reg ? 'minlength="8"' : ""}></label>
        ${reg ? `<label>${t("auth.password2")}<input name="password2" type="password" required autocomplete="new-password"></label>` : ""}
        <div class="form-err" id="authErr"></div>
        <button class="btn primary block" type="submit">${mode === "first" ? t("auth.create") : reg ? t("auth.register") : t("auth.login")}</button>
      </form>
      ${mode !== "first" && ap.allowSelfRegistration ? `<p class="switch">${reg ? t("auth.haveAccount") : t("auth.noAccount")} <a href="${reg ? "#/login" : "#/register"}">${reg ? t("auth.login") : t("auth.register")}</a></p>` : ""}
      <p class="note">${t(st.server ? "auth.serverNote" : "auth.localNote")}</p></div></div>`;
    bindLang(app());
    $("#authForm").onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const er = $("#authErr"); er.textContent = "";
      const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        if (reg && f.password !== f.password2) throw Object.assign(new Error(), { code: "mismatch" });
        if (mode === "first") S.user = await api.bootstrap(f, GA.i18n.lang);
        else if (reg) S.user = await api.auth.register(f);
        else S.user = await api.auth.login(f.username, f.password, f.tenant || undefined);
        S.loaded = false; if (location.hash !== "#/home") location.hash = "#/home"; else render();
      } catch (x) { er.textContent = errMsg(x); btn.disabled = false; }
    };
  }
  const pwdForm = (forced) => `<form id="pwdForm" class="card stack narrow"><h3>${t("auth.changePwd")}</h3>${forced ? `<p class="muted">${t("auth.mustChange")}</p>` : ""}
      <label>${t("auth.oldPwd")}<input type="password" name="old" required autocomplete="current-password"></label>
      <label>${t("auth.newPwd")}<input type="password" name="n1" required minlength="8" autocomplete="new-password"></label>
      <label>${t("auth.password2")}<input type="password" name="n2" required autocomplete="new-password"></label>
      <div class="form-err" id="pwdErr"></div><button class="btn primary">${t("a.save")}</button></form>`;
  function bindPwd(after) {
    $("#pwdForm").onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const er = $("#pwdErr");
      if (f.n1 !== f.n2) { er.textContent = t("auth.mismatch"); return; }
      try { await api.auth.changePassword(f.old, f.n1); toast(t("auth.pwdChanged")); S.user = await api.auth.current(); after(); } catch (x) { er.textContent = errMsg(x); }
    };
  }

  /* ---------- GUSCIO ---------- */
  const NAV = [["home", "home"], ["closing", "moon"], ["tx", "list"], ["month", "chart"], ["year", "star"], ["accounts", "wallet"], ["invoices", "receipt"], ["calendar", "calendar"], ["events", "event"], ["settings", "settings"]];
  const navHref = (k) => (k === "month" ? "#/month/" + E.today().slice(0, 7) : k === "year" ? "#/year/" + E.fiscalYearStart(E.today(), S.book.fyStart).slice(0, 4) : "#/" + k);
  function shell(view, content) {
    const company = S.book.company;
    app().innerHTML = `<div class="layout">
      <aside class="side">
        ${brand()}${company ? `<div class="company">${esc(company)}</div>` : ""}
        <nav>${NAV.map(([k, ic]) => `<a href="${navHref(k)}" class="${view === k ? "active" : ""}">${I(ic)}<span>${t("nav." + k)}</span></a>`).join("")}
          ${isAdmin() ? `<a href="#/users" class="${view === "users" ? "active" : ""}">${I("people")}<span>${t("nav.users")}</span></a>` : ""}</nav>
        <div class="side-foot">${langSelect()}<a href="#/profile" class="me ${view === "profile" ? "active" : ""}">${I("user")}<span>${esc(S.user.displayName)}<small>${t("o.role." + S.user.role)}</small></span></a>
          <button class="link-btn" id="logout">${I("logout")}<span>${t("nav.logout")}</span></button></div>
      </aside>
      <main class="main" id="main">${content}</main>
      <button class="fab" id="fab" aria-label="${t("sc.fab")}">${I("plus")}</button>
      <nav class="tabbar">
        ${[["home", "home"], ["tx", "list"]].map(([k, ic]) => `<a href="${navHref(k)}" class="${view === k ? "active" : ""}">${I(ic)}<span>${t("nav." + k)}</span></a>`).join("")}
        <span class="tab-gap"></span>
        <a href="${navHref("month")}" class="${view === "month" ? "active" : ""}">${I("chart")}<span>${t("nav.month")}</span></a>
        <a href="#/more" class="${["more", "year", "accounts", "invoices", "calendar", "events", "event", "settings", "users", "profile"].includes(view) ? "active" : ""}">${I("menu")}<span>${t("nav.more")}</span></a>
      </nav></div>`;
    bindLang(app());
    $("#logout").onclick = logout;
    $("#fab").onclick = quickMenu;
  }
  async function logout() { await api.auth.logout(); S.user = null; S.loaded = false; S._migClosing = false; if (location.hash !== "#/login") location.hash = "#/login"; else render(); }
  function viewMore() {
    const items = [["year", "star"], ["accounts", "wallet"], ["invoices", "receipt"], ["calendar", "calendar"], ["events", "event"], ["settings", "settings"]].concat(isAdmin() ? [["users", "people"]] : []).concat([["profile", "user"]]);
    return `<header class="page-head"><h1>${t("nav.more")}</h1></header>
      <div class="menu-list card">${items.map(([k, ic]) => `<a href="${navHref(k)}">${I(ic)}<span>${t("nav." + k)}</span>${I("right", "chev")}</a>`).join("")}</div>
      <div class="menu-list card"><div class="row-item">${I("globe")}<span>${t("set.language")}</span>${langSelect()}</div><button class="row-item" id="logout3">${I("logout")}<span>${t("nav.logout")}</span></button></div>`;
  }

  /* ---------- DATI ---------- */
  async function loadData() {
    S.loaded = true;
    if (!S._migClosing) {
      try {
        if (typeof api.migrateClosingV13 === "function") await api.migrateClosingV13();
        if (typeof api.migrateClosingV14 === "function") await api.migrateClosingV14();
        S._migClosing = true;
      } catch (e) { /* riprova al prossimo caricamento */ }
    }
    const [dir, book, accounts, departments, vatRates, dedRates, categories, tx, transfers, clients, payments, events, invoices] = await Promise.all([
      api.users.directory(), api.book.get(), api.accounts.list(), api.departments.list(), api.vatRates.list(), api.dedRates.list(), api.categories.list(),
      api.transactions.list(), api.transfers.list(), api.clients.list(), api.payments.list(), api.events.list(), api.invoices.list()]);
    Object.assign(S, { dir, book, accounts, departments, vatRates, dedRates, categories, transfers, clients, payments, invoices });
    S.tx = E.enrich(tx, S).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    S.events = events.map((e) => GA.computeEvent(e, payments));
    S.settings = { currency: book.currency }; // usato dal modulo Eventi
  }

  /* ---------- CONFIGURAZIONE GUIDATA (5 passi di ISTRUZIONI) ---------- */
  function viewSetup(n) {
    n = Math.min(5, Math.max(1, Number(n) || 1));
    const steps = [1, 2, 3, 4, 5];
    const body = n === 1 ? GA.settingsUI.general(true) + GA.settingsUI.appearance(true) + GA.settingsUI.accounts(true)
      : n === 2 ? GA.settingsUI.categories(true)
      : n === 3 ? GA.settingsUI.goals(true)
      : `<div class="card pad wiz-note">${I(n === 4 ? "list" : "chart", "big")}<p>${t("wiz.s" + n + "h")}</p></div>`;
    return `<div class="wizard">
      <div class="wiz-steps">${steps.map((i) => `<a href="#/setup/${i}" class="${i === n ? "on" : i < n ? "done" : ""}"><b>${i}</b><span>${t("wiz.s" + i)}</span></a>`).join("")}</div>
      <header class="page-head"><div><small class="muted">${t("wiz.step", { n })}</small><h1>${t("wiz.s" + n)}</h1></div></header>
      ${n <= 3 ? `<p class="muted lead">${t("wiz.s" + n + "h")}</p>` : ""}
      ${body}
      <div class="wiz-nav">${n > 1 ? `<a class="btn" href="#/setup/${n - 1}">${t("a.back")}</a>` : "<span></span>"}
        ${n < 5 ? `<a class="btn primary" href="#/setup/${n + 1}">${t("a.next")}</a>` : `<button class="btn primary" id="wizDone">${t("wiz.done")}</button>`}</div></div>`;
  }

  /* ---------- UTENTI ---------- */
  async function viewUsers() {
    const list = await api.users.list(); const ap = await api.app.get();
    return `<header class="page-head"><h1>${t("u.title")}</h1><button class="btn primary" data-uadd>${I("plus")}${t("u.add")}</button></header>
      <div class="card pad"><label class="switch-row"><input type="checkbox" id="allowReg" ${ap.allowSelfRegistration ? "checked" : ""}><span>${t("set.allowReg")}</span></label></div>
      <div class="card list">${list.map((u) => `<div class="li" data-uid="${u.id}"><div class="li-main"><b>${esc(u.displayName)}</b><small>@${esc(u.username)} · ${t("u.lastLogin")}: ${u.lastLogin ? fmtDate(u.lastLogin.slice(0, 10)) : "—"}</small></div>
        <div class="li-side"><select data-urole ${u.id === S.user.id ? "disabled" : ""}><option value="user" ${u.role === "user" ? "selected" : ""}>${t("o.role.user")}</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>${t("o.role.admin")}</option></select>
        <label class="chk"><input type="checkbox" data-uactive ${u.active ? "checked" : ""} ${u.id === S.user.id ? "disabled" : ""}>${t("u.active")}</label>
        <button class="btn sm" data-ureset>${t("u.resetPwd")}</button>${u.id !== S.user.id ? `<button class="icon-btn" data-udel aria-label="${t("a.delete")}">${I("trash")}</button>` : ""}</div></div>`).join("")}</div>`;
  }
  function bindUsers(main) {
    const upd = async (id, p) => { try { await api.users.update(id, p); toast(t("m.saved")); } catch (x) { toast(errMsg(x), true); } refresh(); };
    $("#allowReg", main).onchange = async (e) => { await api.app.set({ allowSelfRegistration: e.target.checked }); toast(t("m.saved")); };
    $$("[data-urole]", main).forEach((s) => (s.onchange = () => upd(s.closest("[data-uid]").dataset.uid, { role: s.value })));
    $$("[data-uactive]", main).forEach((s) => (s.onchange = () => upd(s.closest("[data-uid]").dataset.uid, { active: s.checked })));
    $$("[data-udel]", main).forEach((b) => (b.onclick = async () => { if (await confirmBox(t("a.confirmDelete"))) { try { await api.users.remove(b.closest("[data-uid]").dataset.uid); toast(t("m.deleted")); } catch (x) { toast(errMsg(x), true); } refresh(); } }));
    $$("[data-ureset]", main).forEach((b) => (b.onclick = () => userModal(b.closest("[data-uid]").dataset.uid)));
    $("[data-uadd]", main).onclick = () => userModal(null);
  }
  function userModal(resetId) {
    const m = modal(`${mhead(resetId ? t("u.resetPwd") : t("u.add"))}<form id="uForm" class="stack">${resetId ? "" : `<label>${t("auth.username")} *<input name="username" required autocapitalize="none"></label><label>${t("auth.displayName")}<input name="displayName"></label><label>${t("auth.email")}<input name="email" type="email"></label><label>${t("u.role")}<select name="role"><option value="user">${t("o.role.user")}</option><option value="admin">${t("o.role.admin")}</option></select></label>`}
      <label>${t("u.tempPwd")} *<input name="password" required minlength="8" autocomplete="new-password"></label>
      <div class="form-err" id="uErr"></div><div class="actions"><button type="button" class="btn" data-close>${t("a.cancel")}</button><button class="btn primary">${t("a.save")}</button></div></form>`);
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
    $("#uForm", m).onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); try { if (resetId) await api.users.resetPassword(resetId, d.password); else await api.users.create(d); closeModal(); toast(t("m.saved")); refresh(); } catch (x) { $("#uErr", m).textContent = errMsg(x); } };
  }

  /* ---------- PROFILO ---------- */
  const viewProfile = () => `<header class="page-head"><h1>${t("nav.profile")}</h1></header>
      <form id="profForm" class="card stack narrow"><label>${t("auth.username")}<input value="${esc(S.user.username)}" disabled></label>
      <label>${t("auth.displayName")}<input name="displayName" value="${esc(S.user.displayName)}"></label><label>${t("auth.email")}<input name="email" type="email" value="${esc(S.user.email)}"></label>
      <label>${t("u.role")}<input value="${t("o.role." + S.user.role)}" disabled></label><button class="btn primary">${t("a.save")}</button></form>
      ${pwdForm(false)}<div class="narrow"><button class="btn danger-ghost" id="logout2">${I("logout")}${t("nav.logout")}</button></div>`;

  /* ---------- ROUTER ---------- */
  /* menu rapido del + : chiusura serata, spesa, scansione, entrata singola */
  function quickMenu() {
    const it = (k, ic, label, sub) => `<button type="button" class="qm-item" data-qm="${k}"><span class="qm-ic ${k}">${I(ic)}</span><span><b>${label}</b><small class="muted">${sub}</small></span></button>`;
    const m = modal(`${mhead(t("sc.fab"))}<div class="qm">${it("closing", "moon", t("cl.title"), t("sc.qmClosing"))}${it("out", "minus" in GA.icons ? "minus" : "receipt", t("tx.newOut"), t("sc.qmOut"))}
      <label class="qm-item" data-qm="scan"><span class="qm-ic scan">${I("camera")}</span><span><b>${t("sc.title")}</b><small class="muted">${t("sc.qmScan")}</small></span><input type="file" accept="image/*" capture="environment" data-scan hidden></label>
      <label class="qm-item" data-qm="scanfile"><span class="qm-ic scanfile">${I("file")}</span><span><b>${t("sc.file")}</b><small class="muted">${t("sc.qmFile")}</small></span><input type="file" accept="image/*,application/pdf,.pdf" data-scan hidden></label>
      ${it("in", "plus", t("tx.newIn"), t("sc.qmIn"))}</div>`, "sheet qm-sheet");
    GA.scan.bindInputs(m);
    m.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeModal();
      const b = e.target.closest("button[data-qm]"); if (!b) return; const k = b.dataset.qm;
      if (k === "closing") { closeModal(); location.hash = "#/closing"; } else { closeModal(); GA.acc.txForm(null, { type: k }); }
    });
  }
  async function refresh() { await loadData(); return route(); }
  async function route() {
    if (S.user && S.user.theme && S.user.theme !== GA.theme.current) GA.theme.apply(S.user.theme);
    const raw = location.hash.replace(/^#\/?/, "") || "home"; const parts = raw.split("?")[0].split("/"); let view = parts[0];
    if (S.user.mustChangePassword) { app().innerHTML = `<div class="auth-page"><div class="auth-card"><div class="auth-top">${brand()}${langSelect()}</div>${pwdForm(true)}</div></div>`; bindLang(app()); bindPwd(() => route()); return; }
    if (!S.book.setupDone && isAdmin() && view !== "setup") { location.hash = "#/setup/1"; return; }
    let html;
    switch (view) {
      case "setup": if (!isAdmin()) { location.hash = "#/home"; return; } html = viewSetup(parts[1]); break;
      case "closing": html = GA.acc.viewClosing(parts); break;
      case "tx": html = GA.acc.viewTx(parts); break;
      case "accounts": html = GA.acc.viewAccounts(); break;
      case "month": html = GA.acc.viewMonth(parts[1]); break;
      case "year": html = GA.acc.viewYear(parts[1]); break;
      case "calendar": html = GA.acc.viewCalendar(parts[1]); break;
      case "invoices": html = GA.invoicesUI.view(parts); break;
      case "events": case "event": html = GA.events.view(parts); break;
      case "settings": html = GA.settingsUI.view(parts[1]); break;
      case "users": if (!isAdmin()) { location.hash = "#/home"; return; } html = await viewUsers(); break;
      case "profile": html = viewProfile(); break;
      case "more": html = viewMore(); break;
      default: view = "home"; html = GA.acc.viewHome();
    }
    const sc = S._lastView === raw ? window.scrollY : 0; S._lastView = raw;
    GA.acc.destroyCharts();
    if (view === "setup") { app().innerHTML = `<div class="layout solo"><main class="main" id="main"><div class="solo-top">${brand()}${langSelect()}</div>${html}</main></div>`; bindLang(app()); }
    else shell(view === "event" ? "events" : view, html);
    const main = $("#main");
    if (view === "setup") { GA.settingsUI.bind(main); const d = $("#wizDone", main); if (d) d.onclick = async () => { await api.book.set({ setupDone: true }); await loadData(); location.hash = "#/home"; }; }
    if (view === "users") bindUsers(main);
    if (view === "invoices") GA.invoicesUI.bind(main);
    if (view === "events" || view === "event") GA.events.bind(main, parts);
    if (view === "settings") GA.settingsUI.bind(main);
    if (["home", "tx", "accounts", "month", "year", "calendar", "closing"].includes(view)) GA.acc.bind(main, view, parts);
    if (view === "closing") GA.acc.bindClosing(main);
    if (view === "profile") { $("#logout2").onclick = logout; bindPwd(() => route()); $("#profForm").onsubmit = async (e) => { e.preventDefault(); S.user = await api.auth.updateProfile(Object.fromEntries(new FormData(e.target))); toast(t("m.saved")); refresh(); }; }
    if (view === "more") $("#logout3").onclick = logout;
    window.scrollTo(0, sc);
  }
  async function render() {
    if (!S.user) { const tk = (S._rt = (S._rt || 0) + 1); return renderAuth(tk); }
    await loadData(); return route();
  }
  GA.ui = { S, t, esc, $, $$, modal, mhead, closeModal, toast, confirmBox, fmtDate, monthName, monthShort, money, money0, pct, uname, errMsg, download, refresh, route, isAdmin, nameOf, render };
  async function boot() {
    try { S.user = await api.auth.current(); await render(); }
    catch (e) { // modalità online senza rete: l'app si apre dalla cache ma i dati sono sul server
      if (!e || e.code !== "network") throw e;
      app().innerHTML = `<div class="auth-page"><div class="auth-card offline-card"><div class="auth-top">${brand()}</div><h2>${t("srv.offlineTitle")}</h2><p>${t("srv.e_network")}</p><button class="btn primary" id="retryBtn">${t("srv.retry")}</button></div></div>`;
      $("#retryBtn").onclick = () => boot(); window.addEventListener("online", () => boot(), { once: true });
    }
  }
  window.addEventListener("hashchange", () => { if (S.user && S.loaded) route(); else render(); });
  document.addEventListener("DOMContentLoaded", async () => {
    applyBrand(); GA.i18n.init();
    if (!window.crypto || !crypto.subtle) { app().innerHTML = `<p style="padding:2rem">Web Crypto non disponibile: aprire il sito via https, http://localhost o file://</p>`; return; }
    await api.init(); await boot();
    // PWA: aggiornamento aggressivo per iOS standalone (icona Home).
    // updateViaCache:'none' evita che Safari tenga sw.js fresco dalla HTTP cache (GH Pages max-age=600).
    // update() al load / pageshow / visibilitychange; un solo reload su controllerchange.
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      const swUrl = "sw.js?v=" + (GA.config.appVersion || "");
      // Reload solo quando un NUOVO worker sostituisce uno già attivo (aggiornamento),
      // non alla prima installazione — altrimenti iOS/standalone o il login vengono interrotti.
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.register(swUrl, { updateViaCache: "none" }).then((reg) => {
        const poke = () => { try { reg.update(); } catch (e) {} };
        poke();
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poke(); });
        // iOS standalone: pageshow (anche da snapshot) + focus quando si rientra dall'icona Home
        window.addEventListener("pageshow", () => poke());
        window.addEventListener("focus", poke);
        setInterval(poke, 3 * 60 * 1000);
      }).catch(() => {});
    }
  });
})();
