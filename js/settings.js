/* =========================================================
 * IMPOSTAZIONI (foglio IMPOSTAZIONI + CATEGORIE + obiettivi) e IMPORT/EXPORT.
 * Le sezioni sono riusate dalla configurazione guidata.
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, t = (p, v) => GA.t(p, v), I = GA.icon, api = GA.api, E = GA.engine, C = GA.config;
  const S = () => U().S, esc = (v) => U().esc(v);
  const dis = () => (U().isAdmin() ? "" : "disabled");
  const TABS = ["general", "appearance", "accounts", "categories", "goals", "vat", "depts", "data"];
  const tabLbl = { general: "set.general", appearance: "set.appearance", accounts: "set.accounts", categories: "set.categories", goals: "set.goals", vat: "set.vat", depts: "set.depts", data: "set.data" };
  const sel = (name, list, cur, attrs = "", empty) => `<select name="${name}" ${attrs}>${empty != null ? `<option value="">${esc(empty)}</option>` : ""}${list.map((o) => `<option value="${esc(o.id)}" ${o.id === cur ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>`;
  const monthsOf = (y) => { const a = y + "-" + String(S().book.fyStart).padStart(2, "0") + "-01"; return Array.from({ length: 12 }, (_, i) => E.addMonths(a, i).slice(0, 7)); };
  const iconPick = (col, r) => `<details class="iconpick"><summary class="icon-chip" title="${t("set.icon")}">${I(r.icon || "circle")}</summary><div class="ip-grid">${GA.iconChoices.map((k) => `<button type="button" class="icon-btn ${k === r.icon ? "on" : ""}" data-col="${col}" data-id="${r.id}" data-k="icon" data-v="${k}" ${dis()}>${I(k)}</button>`).join("")}</div></details>`;

  /* ---------- sezioni ---------- */
  function general(wiz) {
    const b = S().book; const L = GA.i18n.locale();
    const months = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), name: new Date(2000, i, 1).toLocaleDateString(L, { month: "long" }) }));
    return `<section class="card pad"><h3>${t("set.general")}</h3><div class="form-grid">
      <label class="full">${t("set.company")}<input data-book="company" value="${esc(b.company)}" ${dis()}></label>
      ${wiz ? "" : `<label class="full">${t("set.companyInfo")}<textarea rows="2" data-book="companyInfo" ${dis()}>${esc(b.companyInfo || "")}</textarea></label>`}
      <label>${t("set.fyStart")}${sel("fy", months, String(b.fyStart), `data-book="fyStart" data-num ${dis()}`)}</label>
      <label>${t("set.currency")}<select data-book="currency" ${dis()}>${C.currencies.map((c) => `<option ${b.currency === c ? "selected" : ""}>${c}</option>`).join("")}</select><small class="muted">${t("set.currencyHint")}</small></label>
      ${wiz ? "" : `<label>${t("set.prevIn")}<input type="number" step="0.01" data-book="prevYearIn" data-num value="${esc(b.prevYearIn || "")}" ${dis()}></label>
      <label>${t("set.prevOut")}<input type="number" step="0.01" data-book="prevYearOut" data-num value="${esc(b.prevYearOut || "")}" ${dis()}></label><p class="muted full small">${t("set.prevHint")}</p>`}
    </div></section>
    ${wiz ? "" : `<section class="card pad"><h3>${t("set.defaults")}</h3><div class="form-grid">
      <label>${t("set.vatIn")}${sel("vi", S().vatRates, b.vatDefaultIn, `data-book="vatDefaultIn" ${dis()}`)}</label>
      <label>${t("set.vatOut")}${sel("vo", S().vatRates, b.vatDefaultOut, `data-book="vatDefaultOut" ${dis()}`)}</label>
      <label>${t("set.dedDef")}${sel("dd", S().dedRates, b.dedDefault, `data-book="dedDefault" ${dis()}`)}</label></div></section>
    <section class="card pad" id="setClosing"><h3>${t("cl.channels")}</h3><p class="muted small">${t("cl.channelsHint")}</p>
      ${GA.closingChannels.map(([ch, K, ic]) => `<div class="erow cl-map"><span class="icon-chip">${I(ic)}</span><b class="cl-map-l">${t("cl." + K)}</b>
        <label class="grow">${t("tx.account")}${sel("ca" + K, S().accounts.filter((a) => a.active !== false), b["closingAcc" + K], `data-book="closingAcc${K}" ${dis()}`)}</label>
        <label class="grow">${t("tx.category")}${sel("cc" + K, S().categories.filter((c) => c.type === "in"), b["closingCat" + K], `data-book="closingCat${K}" ${dis()}`, t("tx.noCat"))}</label></div>`).join("")}</section>
    <section class="card pad"><h3>${t("set.events")}</h3>
      <label class="switch-row"><input type="checkbox" data-book="eventsAutoEntry" data-bool ${b.eventsAutoEntry ? "checked" : ""} ${dis()}><span>${t("set.eventsAuto")}</span></label>
      <div class="form-grid"><label>${t("tx.account")}${sel("ea", S().accounts.filter((a) => a.active !== false), b.eventsEntryAccount, `data-book="eventsEntryAccount" ${dis()}`)}</label>
      <label>${t("set.eventsCat")}${sel("ec", S().categories.filter((c) => c.type === "in"), b.eventsEntryCategory, `data-book="eventsEntryCategory" ${dis()}`, t("tx.noCat"))}</label>
      <label>${t("tx.vat")}${sel("ev", S().vatRates.filter((v) => !v.manual), b.eventsEntryVat, `data-book="eventsEntryVat" ${dis()}`)}</label></div></section>`}`;
  }
  // ASPETTO: scelta dello stile, per utente (anche per chi non è amministratore)
  function appearance(wiz) {
    const cur = GA.theme.current;
    return `<section class="card pad" id="themes"><h3>${t("set.appearance")}</h3><p class="muted small">${t("set.appearanceHint")}</p>
      <div class="theme-grid">${GA.themes.map((k) => `<button type="button" class="theme-opt ${k === cur ? "on" : ""}" data-theme="${k}" aria-pressed="${k === cur}">
        <span class="tprev tp-${k}" aria-hidden="true"><i class="tp-h"></i><i class="tp-b"></i><span class="tp-r"><i></i><i></i></span><i class="tp-x"></i></span>
        <b>${k === cur ? I("check") : ""}${t("th." + k)}</b><small>${t("th." + k + "D")}</small></button>`).join("")}</div></section>`;
  }
  function accounts(wiz) {
    const row = (a) => `<div class="erow" data-row="${a.id}">${iconPick("accounts", a)}
      <label class="grow">${t("set.name")}<input data-col="accounts" data-id="${a.id}" data-k="name" value="${esc(a.name)}" ${dis()}></label>
      <label class="w-num">${t("acc.opening")}<input type="number" step="0.01" data-col="accounts" data-id="${a.id}" data-k="opening" value="${esc(a.opening || 0)}" ${dis()}></label>
      ${wiz ? "" : `<label class="chk"><input type="checkbox" data-col="accounts" data-id="${a.id}" data-k="active" ${a.active !== false ? "checked" : ""} ${dis()}>${t("set.active")}</label>`}
      <button class="icon-btn" data-del="accounts" data-id="${a.id}" aria-label="${t("a.delete")}" ${dis()}>${I("trash")}</button></div>`;
    const A = S().accounts.filter((a) => a.kind !== "card"), K = S().accounts.filter((a) => a.kind === "card");
    return `<section class="card pad"><h3>${t("acc.accounts")} <small class="muted">${A.length}/${C.maxAccounts}</small></h3>${A.map(row).join("")}
      <button class="btn ghost sm" data-addacc="account" ${dis()}>${I("plus")}${t("set.addAccount")}</button></section>
      <section class="card pad"><h3>${t("acc.cards")} <small class="muted">${K.length}/${C.maxCards}</small></h3><p class="muted small">${t("acc.cardHint")}</p>${K.map(row).join("")}
      <button class="btn ghost sm" data-addacc="card" ${dis()}>${I("plus")}${t("set.addCard")}</button></section>`;
  }
  function categories(wiz) {
    const box = (type) => { const L = S().categories.filter((c) => c.type === type);
      return `<section class="card pad"><h3>${t(type === "in" ? "set.catIn" : "set.catOut")}</h3>${L.map((c) => `<div class="erow" data-row="${c.id}">${iconPick("categories", c)}
        <input class="grow" aria-label="${t("set.name")}" data-col="categories" data-id="${c.id}" data-k="name" value="${esc(c.name)}" ${dis()}>
        ${type === "out" ? `<label class="chk"><input type="checkbox" data-col="categories" data-id="${c.id}" data-k="need" ${c.need ? "checked" : ""} ${dis()}>${t("set.need")}</label>` : ""}
        ${wiz ? "" : `<label class="chk"><input type="checkbox" data-col="categories" data-id="${c.id}" data-k="active" ${c.active !== false ? "checked" : ""} ${dis()}>${t("set.active")}</label>`}
        <button class="icon-btn" data-del="categories" data-id="${c.id}" aria-label="${t("a.delete")}" ${dis()}>${I("trash")}</button></div>`).join("")}
        <button class="btn ghost sm" data-addcat="${type}" ${dis()}>${I("plus")}${t("set.addCat")}</button></section>`; };
    return `<div class="grid2">${box("in")}${box("out")}</div>`;
  }
  function goals(wiz) {
    const y = S()._goalYear || Number(E.fiscalYearStart(E.today(), S().book.fyStart).slice(0, 4));
    const ms = monthsOf(y), G = S().book.goals || {}; const tot = ms.reduce((s, m) => s + (Number(G[m]) || 0), 0);
    return `<section class="card pad"><div class="row-between"><h3>${t("set.goals")}</h3><div class="stepper"><button class="icon-btn" data-gy="-1">${I("left")}</button><b>${ms[0].slice(0, 4)}${ms[0].slice(0, 4) !== ms[11].slice(0, 4) ? "/" + ms[11].slice(2, 4) : ""}</b><button class="icon-btn" data-gy="1">${I("right")}</button></div></div>
      ${wiz ? "" : `<p class="muted small">${t("set.goalsHint")}</p>`}
      <div class="inline-form"><label>${t("wiz.sameGoal")}<input type="number" step="1" min="0" id="goalAll" ${dis()}></label><button class="btn sm" id="goalAllBtn" ${dis()}>${t("a.apply")}</button></div>
      <div class="goal-grid">${ms.map((m) => `<label>${esc(U().monthName(m, "long"))}<input type="number" step="1" min="0" data-goal="${m}" value="${esc(G[m] || "")}" ${dis()}></label>`).join("")}</div>
      <p class="total-line">${t("set.annualGoal")}: <b>${U().money(tot)}</b></p></section>`;
  }
  function vat() {
    const rows = (col, list, manual) => list.map((r) => `<div class="erow" data-row="${r.id}"><input class="grow" aria-label="${t("set.name")}" data-col="${col}" data-id="${r.id}" data-k="name" value="${esc(r.name)}" ${dis()}>
      ${r.manual ? `<span class="pill">${t("set.manual")}</span>` : `<label class="w-num">${t("set.pct")}<input type="number" step="0.01" min="0" max="100" data-col="${col}" data-id="${r.id}" data-k="pct" data-pct value="${esc(Math.round((r.pct || 0) * 10000) / 100)}" ${dis()}></label>`}
      <button class="icon-btn" data-del="${col}" data-id="${r.id}" aria-label="${t("a.delete")}" ${dis()}>${I("trash")}</button></div>`).join("");
    return `<div class="grid2"><section class="card pad"><h3>${t("set.vat")}</h3>${rows("vatRates", S().vatRates)}<button class="btn ghost sm" data-addrate="vatRates" ${dis()}>${I("plus")}${t("set.addVat")}</button></section>
      <section class="card pad"><h3>${t("set.ded")}</h3>${rows("dedRates", S().dedRates)}<button class="btn ghost sm" data-addrate="dedRates" ${dis()}>${I("plus")}${t("set.addVat")}</button></section></div>`;
  }
  function depts() {
    return `<section class="card pad"><h3>${t("set.depts")} <small class="muted">${S().departments.length}/${C.maxDepartments}</small></h3>${S().departments.map((d) => `<div class="erow" data-row="${d.id}"><input class="grow" aria-label="${t("set.name")}" data-col="departments" data-id="${d.id}" data-k="name" value="${esc(d.name)}" ${dis()}>
      <button class="icon-btn" data-del="departments" data-id="${d.id}" aria-label="${t("a.delete")}" ${dis()}>${I("trash")}</button></div>`).join("")}<button class="btn ghost sm" data-adddept ${dis()}>${I("plus")}${t("set.addDept")}</button></section>`;
  }
  function data() {
    const admin = U().isAdmin();
    return `<section class="card pad"><h3>${t("nav.tx")}</h3><p class="muted small">${t("set.importHint")}</p>
      <div class="btn-row"><button class="btn" data-export="xlsx">${I("download")}${t("a.exportXlsx")}</button><button class="btn" data-export="csv">${I("download")}${t("a.exportCsv")}</button>
      <label class="btn file">${I("upload")}${t("a.import")}<input type="file" id="impFile" accept=".xlsx,.xls,.csv" hidden></label></div></section>
      ${admin ? `<section class="card pad"><h3>${t("set.data")}</h3><div class="btn-row"><button class="btn" id="bkp">${I("download")}${t("set.backup")}</button><label class="btn file">${I("upload")}${t("set.restore")}<input type="file" id="rst" accept=".json" hidden></label></div>
      ${api.mode !== "local" ? `<p class="muted small">${t("srv.migrateHint")}</p>` : ""}
      <div class="btn-row"><a class="btn ghost" href="#/setup/1">${t("set.wizard")}</a><button class="btn danger-ghost" id="resetBook">${I("trash")}${t("set.resetBook")}</button></div></section>` : ""}
      <section class="card pad"><h3>${t("set.about")}</h3><p class="muted small">${esc(typeof C.brand.appName === "string" ? C.brand.appName : C.brand.appName.it)} · ${t("set.storage")}: <b>${api.mode === "rest" ? t("srv.modeServer") : api.mode === "cloud" ? t("srv.modeCloud") : t("srv.modeLocal")}</b>${S().user.tenant ? ` · ${t("auth.tenant")}: <b>${esc(S().user.tenant.code)}</b>` : ""}<br>${t(api.mode !== "local" ? "auth.serverNote" : "auth.localNote")}</p></section>
      ${api.mode === "rest" && api.platform && S().user.superadmin ? `<section class="card pad" id="platform"><h3>${t("srv.tenants")}</h3><p class="muted small">${t("srv.tenantsHint")}</p><div id="tenantList" class="muted small">…</div>
        <form id="tenantForm" class="form-grid"><label>${t("srv.tName")}<input name="name" required></label><label>${t("auth.tenant")}<input name="code" autocapitalize="none" placeholder="bar-rossi"></label>
        <label>${t("srv.tAdmin")}<input name="username" required autocapitalize="none" autocomplete="off"></label><label>${t("srv.tPwd")}<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <div class="actions full"><span class="sp"></span><button class="btn primary">${I("plus")}${t("srv.tCreate")}</button></div></form></section>` : ""}`;
  }
  function view(tab) {
    tab = TABS.includes(tab) ? tab : "general";
    const body = { general, appearance, accounts, categories, goals, vat, depts, data }[tab]();
    return `<header class="page-head"><h1>${t("nav.settings")}</h1></header>
      ${U().isAdmin() || tab === "appearance" ? "" : `<p class="notice">${t("set.onlyAdmin")}</p>`}
      <div class="seg scroll">${TABS.map((k) => `<a href="#/settings/${k}" class="${k === tab ? "on" : ""}">${t(tabLbl[k])}</a>`).join("")}</div>
      ${tab === "general" ? `<section class="card pad"><h3>${t("set.language")}</h3><div class="seg">${C.languages.map((l) => `<button class="${l === GA.i18n.lang ? "on" : ""}" data-lang="${l}">${GA.dict[l]._name}</button>`).join("")}</div></section>` : ""}
      ${body}`;
  }

  /* ---------- salvataggi ---------- */
  async function saveRow(col, id, k, v) {
    const r = Object.assign({}, S()[col].find((x) => x.id === id), { [k]: v });
    try { await api[col].save(r); U().toast(t("m.saved")); } catch (x) { U().toast(U().errMsg(x), true); }
    await U().refresh();
  }
  async function add(col, rec) { try { await api[col].save(rec); } catch (x) { U().toast(U().errMsg(x), true); } await U().refresh(); const rows = document.querySelectorAll(`[data-col="${col}"][data-k="name"]`); const last = rows[rows.length - 1]; if (last) { last.focus(); last.select(); } }
  const uniq = (base, list) => { let n = 1, s = base; while (list.some((x) => E.norm(x.name) === E.norm(s))) s = base + " " + ++n; return s; };
  function bind(main) {
    main.querySelectorAll("[data-theme]").forEach((b) => (b.onclick = async () => {
      const k = GA.theme.apply(b.dataset.theme);
      try { U().S.user = Object.assign(U().S.user, await api.auth.updateProfile({ theme: k })); U().toast(t("m.saved")); } catch (x) { U().toast(U().errMsg(x), true); }
      U().route();
    }));
    main.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => { GA.i18n.set(b.dataset.lang); U().render(); }));
    main.querySelectorAll("[data-book]").forEach((el) => el.addEventListener("change", async () => {
      let v = el.dataset.bool != null ? el.checked : el.value; if (el.dataset.num != null) v = Number(v) || 0;
      try { await api.book.set({ [el.dataset.book]: v }); U().toast(t("m.saved")); } catch (x) { U().toast(U().errMsg(x), true); } U().refresh();
    }));
    main.querySelectorAll("input[data-col],select[data-col]").forEach((el) => el.addEventListener("change", () => {
      let v = el.type === "checkbox" ? el.checked : el.value; if (el.dataset.pct != null) v = (Number(v) || 0) / 100;
      saveRow(el.dataset.col, el.dataset.id, el.dataset.k, v);
    }));
    main.querySelectorAll("button[data-k=icon]").forEach((b) => (b.onclick = () => saveRow(b.dataset.col, b.dataset.id, "icon", b.dataset.v)));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (!(await U().confirmBox(t("a.confirmDelete")))) return; try { await api[b.dataset.del].remove(b.dataset.id); U().toast(t("m.deleted")); } catch (x) { U().toast(U().errMsg(x), true); } U().refresh(); }));
    main.querySelectorAll("[data-addacc]").forEach((b) => (b.onclick = () => { const k = b.dataset.addacc; add("accounts", { name: uniq(t(k === "card" ? "acc.kindCard" : "acc.kindAccount"), S().accounts), kind: k, icon: k === "card" ? "card" : "bank", opening: 0, active: true }); }));
    main.querySelectorAll("[data-addcat]").forEach((b) => (b.onclick = () => add("categories", { type: b.dataset.addcat, name: uniq(t("tx.category"), S().categories.filter((c) => c.type === b.dataset.addcat)), icon: "tag", active: true, need: false })));
    main.querySelectorAll("[data-addrate]").forEach((b) => (b.onclick = () => add(b.dataset.addrate, { name: uniq(b.dataset.addrate === "vatRates" ? t("tx.vat") : t("tx.ded"), S()[b.dataset.addrate]), pct: 0 })));
    const ad = main.querySelector("[data-adddept]"); if (ad) ad.onclick = () => add("departments", { name: uniq(t("tx.dept"), S().departments) });
    main.querySelectorAll("[data-gy]").forEach((b) => (b.onclick = () => { S()._goalYear = (S()._goalYear || Number(E.fiscalYearStart(E.today(), S().book.fyStart).slice(0, 4))) + Number(b.dataset.gy); U().route(); }));
    main.querySelectorAll("[data-goal]").forEach((el) => el.addEventListener("change", async () => { const g = Object.assign({}, S().book.goals); if (el.value === "" || Number(el.value) === 0) delete g[el.dataset.goal]; else g[el.dataset.goal] = Number(el.value); await api.book.set({ goals: g }); U().toast(t("m.saved")); U().refresh(); }));
    const ga = main.querySelector("#goalAllBtn"); if (ga) ga.onclick = async () => { const v = Number(main.querySelector("#goalAll").value) || 0; const g = Object.assign({}, S().book.goals); main.querySelectorAll("[data-goal]").forEach((el) => { if (v) g[el.dataset.goal] = v; else delete g[el.dataset.goal]; }); await api.book.set({ goals: g }); U().toast(t("m.saved")); U().refresh(); };
    main.querySelectorAll("[data-export]").forEach((b) => (b.onclick = () => exportTx(b.dataset.export)));
    const imp = main.querySelector("#impFile"); if (imp) imp.onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const n = await importFile(f); U().toast(t("m.imported") + ": " + n); } catch (x) { U().toast(U().errMsg(x), true); } e.target.value = ""; U().refresh(); };
    const bk = main.querySelector("#bkp"); if (bk) bk.onclick = async () => U().download(`backup_${E.today()}.json`, new Blob([JSON.stringify(await api.admin.exportAll(), null, 1)], { type: "application/json" }));
    const rs = main.querySelector("#rst"); if (rs) rs.onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; if (api.mode !== "local" && !(await U().confirmBox(t("srv.importConfirm")))) return;
      try { const r = await api.admin.importAll(JSON.parse(await f.text())); U().toast(r && r.users != null ? t("srv.imported", { u: r.users, f: r.attachments }) + (r.needPassword ? " · " + t("srv.needPassword") : "") : t("m.saved")); } catch (x) { U().toast(U().errMsg(x), true); }
      S().user = await api.auth.current(); if (!S().user) { location.hash = "#/login"; return U().render(); } U().refresh(); };
    const pl = main.querySelector("#platform"); if (pl) {
      const load = async () => { const l = await api.platform.tenants(); main.querySelector("#tenantList").innerHTML = `<div class="txlist">${l.map((x) => `<div class="tx"><span class="tx-ic">${I("briefcase")}</span><span class="tx-main"><b>${esc(x.name)}</b><small>${esc(x.code)} · ${x.users} ${t("srv.tUsers")} · ${x.transactions} ${t("srv.tTx")}</small></span>
        ${x.code === S().user.tenant.code ? "" : `<button class="btn sm ${x.active ? "" : "primary"}" data-tact="${x.id}" data-on="${x.active ? 0 : 1}">${x.active ? t("srv.tDisable") : t("srv.tEnable")}</button>`}</div>`).join("")}</div>`;
        main.querySelectorAll("[data-tact]").forEach((b) => (b.onclick = async () => { await api.platform.setActive(b.dataset.tact, b.dataset.on === "1"); load(); })); };
      load().catch((x) => U().toast(U().errMsg(x), true));
      main.querySelector("#tenantForm").onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
        try { const r = await api.platform.createTenant({ name: d.name, code: d.code, lang: GA.i18n.lang, admin: { username: d.username, password: d.password } }); U().toast(t("srv.tCreated", { c: r.code })); e.target.reset(); load(); } catch (x) { U().toast(U().errMsg(x), true); } };
    }
    const rb = main.querySelector("#resetBook"); if (rb) rb.onclick = async () => { if (await U().confirmBox(t("set.resetConfirm"))) { await api.admin.resetBook(); await U().refresh(); location.hash = "#/setup/1"; } };
  }

  /* ---------- EXPORT / IMPORT nel formato dell'app ---------- */
  const COLS = [["type", "tx.in"], ["paid", "tx.paid"], ["ref", "tx.ref"], ["date", "tx.date"], ["account", "tx.account"], ["dept", "tx.dept"], ["category", "tx.category"], ["desc", "tx.desc"], ["gross", "tx.gross"], ["vat", "tx.vat"], ["vatManual", "tx.vatManual"], ["ded", "tx.ded"], ["net", "tx.net"], ["vatAmt", "tx.vatAmt"], ["dedAmt", "tx.dedAmt"], ["notes", "tx.notes"]];
  const typeHdr = () => t("tx.in") + "/" + t("tx.out");
  function txRows(list) {
    const r2 = (v) => Math.round(v * 100) / 100;
    return list.map((x) => ({ [typeHdr()]: x.type === "in" ? t("tx.in") : t("tx.out"), [t("tx.paid")]: x.paid ? 1 : 0, [t("tx.ref")]: x.ref || "", [t("tx.date")]: new Date(x.date + "T00:00:00"), [t("tx.account")]: U().nameOf("accounts", x.accountId), [t("tx.dept")]: U().nameOf("departments", x.deptId), [t("tx.category")]: U().nameOf("categories", x.categoryId), [t("tx.desc")]: x.desc || "", [t("tx.gross")]: x.gross, [t("tx.vat")]: U().nameOf("vatRates", x.vatId), [t("tx.vatManual")]: x.vatManual || "", [t("tx.ded")]: x.type === "out" ? U().nameOf("dedRates", x.dedId) : "", [t("tx.net")]: r2(x.net), [t("tx.vatAmt")]: r2(x.vat), [t("tx.dedAmt")]: x.type === "out" ? r2(x.ded) : "", [t("tx.notes")]: x.notes || "" }));
  }
  function exportTx(kind) {
    const list = GA.acc.filteredTx(); const stamp = E.today();
    if (kind === "csv") { const ws = XLSX.utils.json_to_sheet(txRows(list), { cellDates: true, dateNF: "yyyy-mm-dd" }); return U().download(`movimenti_${stamp}.csv`, new Blob(["\ufeff" + XLSX.utils.sheet_to_csv(ws, { FS: ";" })], { type: "text/csv;charset=utf-8" })); }
    const wb = XLSX.utils.book_new();
    [["in", "tx.ins"], ["out", "tx.outs"]].forEach(([ty, n]) => { const ws = XLSX.utils.json_to_sheet(txRows(list.filter((x) => x.type === ty)), { cellDates: true, dateNF: "dd/mm/yyyy" }); ws["!cols"] = COLS.map(([k]) => ({ wch: k === "desc" || k === "notes" ? 28 : 13 })); XLSX.utils.book_append_sheet(wb, ws, t(n).slice(0, 30)); });
    const tr = S().transfers.map((x) => ({ [t("tx.date")]: new Date(x.date + "T00:00:00"), [t("acc.from")]: x.from === "IVA" ? "IVA" : U().nameOf("accounts", x.from), [t("acc.to")]: x.to === "IVA" ? "IVA" : U().nameOf("accounts", x.to), [t("acc.amount")]: x.amount, [t("tx.notes")]: x.notes || "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tr, { cellDates: true }), t("acc.transfers").slice(0, 30));
    XLSX.writeFile(wb, `gestione_${stamp}.xlsx`, { cellDates: true });
  }
  const nz = (s) => E.norm(s).replace(/[\s_\-\/.*()%]+/g, "");
  function toISO(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : ""; }
    const s = String(v || "").trim(); let m;
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
    return "";
  }
  const numv = (v) => (typeof v === "number" ? v : Number(String(v || "").replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0);
  async function importFile(file) {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const dicts = Object.values(GA.dict); const H = {};
    COLS.forEach(([k, p]) => dicts.forEach((d) => { const v = p.split(".").reduce((o, x) => o && o[x], d); if (v) H[nz(v)] = k; }));
    dicts.forEach((d) => { H[nz(d.tx.in + "/" + d.tx.out)] = "type"; H[nz(d.acc.from)] = "from"; H[nz(d.acc.to)] = "to"; H[nz(d.acc.amount)] = "amount"; });
    const isOut = new Set(dicts.map((d) => nz(d.tx.out)).concat(dicts.map((d) => nz(d.tx.outs))));
    // trova o crea (solo admin) per nome, senza distinzione maiuscole/minuscole
    const admin = U().isAdmin();
    async function ref(col, name, extra) {
      const n = E.norm(name); if (!n) return "";
      let r = S()[col].find((x) => E.norm(x.name) === n && (!extra || !extra.type || x.type === extra.type));
      if (!r && (col === "vatRates" || col === "dedRates")) { const p = numv(String(name).replace("%", "")) / 100; r = S()[col].find((x) => !x.manual && Math.abs(x.pct - p) < 1e-9); }
      if (!r && admin) { r = await api[col].save(Object.assign({ name: String(name).trim() }, extra || {})); S()[col].push(r); }
      return r ? r.id : "";
    }
    const recs = [], trs = [];
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" });
      const hi = rows.findIndex((r) => r.filter((c) => H[nz(c)]).length >= 3); if (hi < 0) continue;
      const cols = rows[hi].map((c) => H[nz(c)] || null);
      const sheetOut = isOut.has(nz(sn));
      for (const r of rows.slice(hi + 1)) {
        const o = {}; cols.forEach((k, i) => { if (k && r[i] !== "" && r[i] != null) o[k] = r[i]; });
        if (cols.includes("from") && cols.includes("to")) { if (o.date && o.amount) trs.push({ date: toISO(o.date), from: E.norm(o.from) === "iva" ? "IVA" : await ref("accounts", o.from, { kind: "account", icon: "bank", opening: 0 }), to: E.norm(o.to) === "iva" ? "IVA" : await ref("accounts", o.to, { kind: "account", icon: "bank", opening: 0 }), amount: numv(o.amount), notes: o.notes || "" }); continue; }
        if (!o.date || !o.gross) continue;
        const type = o.type != null ? (isOut.has(nz(o.type)) ? "out" : "in") : sheetOut ? "out" : "in";
        recs.push({ type, paid: o.paid == null ? true : !["0", "no", "false", "否"].includes(E.norm(o.paid)), ref: String(o.ref || ""), date: toISO(o.date),
          accountId: await ref("accounts", o.account || nameDefault(), { kind: "account", icon: "bank", opening: 0 }), deptId: await ref("departments", o.dept || (S().departments[0] || {}).name),
          categoryId: o.category ? await ref("categories", o.category, { type, icon: "tag", active: true, need: false }) : "", desc: String(o.desc || ""), gross: numv(o.gross),
          vatId: (await ref("vatRates", o.vat || "", { pct: 0 })) || S().book[type === "in" ? "vatDefaultIn" : "vatDefaultOut"], vatManual: numv(o.vatManual),
          dedId: type === "out" ? (await ref("dedRates", o.ded || "", { pct: 1 })) || S().book.dedDefault : "", notes: String(o.notes || "") });
      }
    }
    if (!recs.length && !trs.length) throw Object.assign(new Error(), { code: "format" });
    let n = recs.length ? await api.transactions.bulk(recs) : 0;
    for (const x of trs) { await api.transfers.save(x); n++; }
    return n;
  }
  const nameDefault = () => (S().accounts[0] || {}).name;

  GA.settingsUI = { appearance, view, bind, general, accounts, categories, goals, exportTx, importFile };
})();
