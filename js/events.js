/* =========================================================
 * MODULO EVENTI: clienti, eventi, pagamenti (acconti/rate/saldo), ricevute.
 * Usa solo GA.api (dati) e GA.ui (helper di interfaccia).
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, api = GA.api, C = GA.config;
  const t = (p) => GA.t(p), esc = (v) => U().esc(v), S = () => U().S;
  const today = () => GA.engine.today();
  const money = (v, lang) => { try { return new Intl.NumberFormat({ it: "it-IT", en: "en-GB", zh: "zh-CN" }[lang || GA.i18n.lang], { style: "currency", currency: S().settings.currency || C.currency.default }).format(Number(v) || 0); } catch (e) { return (Number(v) || 0).toFixed(2); } };
  const ol = (g, k, lang) => (k ? (lang ? GA.tl(lang, "o." + g + "." + k) : t("o." + g + "." + k)) : "");
  const badge = (colors, g, k) => (k ? `<span class="badge" style="--c:${colors[k] || "#64748b"}">${esc(ol(g, k))}</span>` : "");
  const cname = (id) => { const c = S().clients.find((x) => x.id === id); return c ? c.name : ""; };
  const fmtDT = (s, lang) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString({ it: "it-IT", en: "en-GB", zh: "zh-CN" }[lang || GA.i18n.lang], { dateStyle: "medium", timeStyle: s.length > 10 ? "short" : undefined }); };
  const tabs = (cur) => `<div class="tabs">${[["", "ev.overview"], ["list", "ev.list"], ["clients", "ev.clients"]].map(([k, l]) => `<a href="#/events${k ? "/" + k : ""}" class="${cur === k ? "active" : ""}">${t(l)}</a>`).join("")}</div>`;
  const balCell = (e) => e.status === "cancelled" ? "" : e.remaining <= 0.004 ? `<span class="badge" style="--c:#16a34a">${t("ev.fullyPaid")}</span>` : `<b class="${e.balanceOverdue ? "late-txt" : ""}">${money(e.remaining)}</b>${e.balanceOverdue ? ` <span class="badge" style="--c:#dc2626">${t("ev.overdueBadge")}</span>` : ""}`;
  const payBar = (e) => `<div class="prog wide"><div style="width:${e.paidPct}%"></div></div><small>${e.paidPct}%</small>`;

  /* ---------- PANORAMICA ---------- */
  function overview() {
    const E = S().events, act = E.filter((e) => e.status !== "cancelled");
    const agreed = act.reduce((s, e) => s + (Number(e.total) || 0), 0);
    const collected = S().payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const outstanding = act.reduce((s, e) => s + Math.max(0, e.remaining), 0);
    const overdue = act.filter((e) => e.balanceOverdue);
    const out = act.filter((e) => e.remaining > 0.004).sort((a, b) => (b.balanceOverdue - a.balanceOverdue) || (a.balanceDue || "9").localeCompare(b.balanceDue || "9"));
    const lim = new Date(); lim.setDate(lim.getDate() + 30); const limS = lim.toISOString().slice(0, 16);
    const up = act.filter((e) => e.dateTime && e.dateTime.slice(0, 10) >= today() && e.dateTime <= limS).sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    // incassi per mese, ultimi 12 mesi
    const months = []; const d0 = new Date(); d0.setDate(1);
    for (let i = 11; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
    const per = months.map((m) => [m, S().payments.filter((p) => (p.date || "").slice(0, 7) === m).reduce((s, p) => s + Number(p.amount || 0), 0)]);
    const max = Math.max(1, ...per.map((x) => x[1]));
    const loc = { it: "it-IT", en: "en-GB", zh: "zh-CN" }[GA.i18n.lang];
    return `<div class="page-head"><h1>${t("nav.events")}</h1><div class="head-actions"><button class="btn ghost" data-evexport>${t("ev.exportEv")}</button><button class="btn primary" data-evnew>+ ${t("ev.new")}</button></div></div>${tabs("")}
      <div class="kpis">
        <div class="kpi"><span>${t("ev.agreed")}</span><b>${money(agreed)}</b></div>
        <div class="kpi good"><span>${t("ev.collected")}</span><b>${money(collected)}</b></div>
        <div class="kpi"><span>${t("ev.outstanding")}</span><b>${money(outstanding)}</b></div>
        <div class="kpi bad"><span>${t("ev.overdueN")}</span><b>${overdue.length}</b></div>
      </div>
      <div class="grid2">
        <section class="card"><h3>${t("ev.outList")}</h3>${out.length ? `<ul class="upcoming">${out.map((e) => `<li data-ev="${e.id}" class="${e.balanceOverdue ? "late" : ""}"><span class="ut">${esc(e.title)}<small>${esc(cname(e.clientId))} · ${t("ef.balanceDue")}: ${U().fmtDate(e.balanceDue)}</small></span><span class="amt">${balCell(e)}</span></li>`).join("")}</ul>` : `<p class="muted">${t("m.empty")}</p>`}</section>
        <section class="card"><h3>${t("ev.upcoming")}</h3>${up.length ? `<ul class="upcoming">${up.map((e) => `<li data-ev="${e.id}"><span class="days">${fmtDT(e.dateTime.slice(0, 10))}</span><span class="ut">${esc(e.title)}<small>${esc(e.location)} · ${esc(cname(e.clientId))}</small></span>${badge(GA.evStatusColors, "evStatus", e.status)}</li>`).join("")}</ul>` : `<p class="muted">${t("m.empty")}</p>`}</section>
      </div>
      <section class="card" style="margin-top:1rem"><h3>${t("ev.perMonth")}</h3><div class="vbars">${per.map(([m, v]) => `<div class="vb"><span class="vv">${v ? money(v).replace(/[.,]00(?=\D*$)/, "") : ""}</span><div class="vcol"><div style="height:${(v / max) * 100}%"></div></div><span class="vl">${new Date(m + "-01T00:00:00").toLocaleDateString(loc, { month: "short" })}</span></div>`).join("")}</div></section>`;
  }

  /* ---------- ELENCO EVENTI ---------- */
  function list() {
    const F = (S().evf = S().evf || { q: "", status: "", onlyOpen: false });
    const q = F.q.toLowerCase();
    const rows = S().events.filter((e) => (!F.status || e.status === F.status) && (!F.onlyOpen || (e.remaining > 0.004 && e.status !== "cancelled")) && (!q || [e.code, e.title, e.location, cname(e.clientId)].join(" ").toLowerCase().includes(q))).sort((a, b) => (a.dateTime || "").localeCompare(b.dateTime || ""));
    return `<div class="page-head"><h1>${t("nav.events")}</h1><div class="head-actions"><button class="btn ghost" data-evexport>${t("ev.exportEv")}</button><button class="btn primary" data-evnew>+ ${t("ev.new")}</button></div></div>${tabs("list")}
      <div class="filters card"><input type="search" data-evf="q" placeholder="${t("a.search")}" value="${esc(F.q)}">
        <select data-evf="status"><option value="">${t("ef.status")}: ${t("a.all")}</option>${GA.options.evStatus.map((o) => `<option value="${o}" ${F.status === o ? "selected" : ""}>${esc(ol("evStatus", o))}</option>`).join("")}</select>
        <label class="chk"><input type="checkbox" data-evf="onlyOpen" ${F.onlyOpen ? "checked" : ""}> ${t("ev.outstanding")}</label><span class="count">${rows.length} ${t("m.results")}</span></div>
      ${rows.length ? `<div class="table-wrap act card"><table class="tbl"><thead><tr><th>${t("ef.code")}</th><th>${t("ef.title")}</th><th>${t("ef.clientId")}</th><th>${t("ef.dateTime")}</th><th>${t("ef.type")}</th><th>${t("ef.status")}</th><th class="num">${t("ef.total")}</th><th class="num">${t("ef.paid")}</th><th>${t("ef.remaining")}</th><th></th></tr></thead><tbody>
        ${rows.map((e) => `<tr data-ev="${e.id}" class="${e.balanceOverdue ? "late" : ""} ${e.status === "cancelled" ? "closed" : ""}"><td>${esc(e.code)}</td><td data-k="title">${esc(e.title)}</td><td>${esc(cname(e.clientId))}</td><td>${fmtDT(e.dateTime)}</td><td>${esc(ol("evType", e.type))}</td><td>${badge(GA.evStatusColors, "evStatus", e.status)}</td><td class="num">${money(e.total)}</td><td class="num">${money(e.paid)}</td><td>${balCell(e)}</td><td>${payBar(e)}</td></tr>`).join("")}</tbody></table></div>
      <div class="cards">${rows.map((e) => `<div class="acard ${e.balanceOverdue ? "late" : ""}" data-ev="${e.id}"><div class="ac-top"><small>${esc(e.code)} · ${fmtDT(e.dateTime)}</small>${badge(GA.evStatusColors, "evStatus", e.status)}</div><b>${esc(e.title)}</b><div class="ac-meta">${esc(cname(e.clientId))}${e.location ? " · " + esc(e.location) : ""}</div><div class="ac-bot"><span>${money(e.paid)} / ${money(e.total)}</span><span>${balCell(e)}</span></div></div>`).join("")}</div>` : `<div class="card empty">${t("m.empty")}</div>`}`;
  }

  /* ---------- CLIENTI ---------- */
  function clients() {
    const q = (S().cq || "").toLowerCase();
    const rows = S().clients.filter((c) => !q || [c.name, c.phone, c.email, c.wechat].join(" ").toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    const stats = (id) => { const es = S().events.filter((e) => e.clientId === id && e.status !== "cancelled"); return [es.length, es.reduce((s, e) => s + Math.max(0, e.remaining), 0)]; };
    return `<div class="page-head"><h1>${t("nav.events")}</h1><button class="btn primary" data-cnew>+ ${t("ev.newClient")}</button></div>${tabs("clients")}
      <div class="filters card"><input type="search" data-cq placeholder="${t("a.search")}" value="${esc(S().cq || "")}"><span class="count">${rows.length} ${t("m.results")}</span></div>
      ${rows.length ? `<div class="table-wrap act card"><table class="tbl"><thead><tr><th>${t("cf.name")}</th><th>${t("cf.phone")}</th><th>${t("cf.email")}</th><th>${t("cf.wechat")}</th><th>${t("ev.eventsN")}</th><th>${t("ev.outstanding")}</th><th>${t("cf.notes")}</th></tr></thead><tbody>
        ${rows.map((c) => { const [n, o] = stats(c.id); return `<tr data-cl="${c.id}"><td data-k="title">${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${esc(c.wechat)}</td><td>${n}</td><td>${o > 0 ? money(o) : ""}</td><td class="muted">${esc(c.notes)}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="cards">${rows.map((c) => { const [n, o] = stats(c.id); return `<div class="acard" data-cl="${c.id}"><b>${esc(c.name)}</b><div class="ac-meta">${esc([c.phone, c.email, c.wechat && "WeChat: " + c.wechat].filter(Boolean).join(" · "))}</div><div class="ac-bot"><span>${t("ev.eventsN")}: ${n}</span><span>${o > 0 ? money(o) : ""}</span></div></div>`; }).join("")}</div>` : `<div class="card empty">${t("m.empty")}</div>`}`;
  }
  function clientForm(id, onSaved) {
    const c = id ? S().clients.find((x) => x.id === id) : {};
    const m = U().modal(`<div class="modal-head"><h2>${id ? t("ev.editClient") : t("ev.newClient")}</h2><button class="icon-btn" data-close aria-label="close">${GA.icon("x")}</button></div>
      <form id="clForm" class="form-grid two">${GA.clientSchema.map((f) => f.type === "textarea" ? `<label class="full">${t("cf." + f.key)}<textarea name="${f.key}" rows="3">${esc(c[f.key])}</textarea></label>` : `<label class="${f.key === "name" ? "full" : ""}">${t("cf." + f.key)}${f.required ? " *" : ""}<input name="${f.key}" value="${esc(c[f.key])}" ${f.required ? "required" : ""}></label>`).join("")}
      <div class="form-err full" id="clErr"></div><div class="actions full">${id ? `<button type="button" class="btn danger-ghost" data-cdel>${t("a.delete")}</button>` : ""}<span class="sp"></span><button type="button" class="btn ghost" data-close>${t("a.cancel")}</button><button class="btn primary">${t("a.save")}</button></div></form>`);
    m.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) U().closeModal();
      if (e.target.closest("[data-cdel]") && (await U().confirmBox(t("a.confirmDelete")))) { try { await api.clients.remove(id); U().toast(t("m.deleted")); U().refresh(); } catch (x) { U().toast(U().errMsg(x), true); } }
    });
    $("#clForm", m).onsubmit = async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); if (id) d.id = id;
      try { const saved = await api.clients.save(d); U().closeModal(); U().toast(t("m.saved")); if (onSaved) onSaved(saved); else U().refresh(); } catch (x) { $("#clErr", m).textContent = U().errMsg(x); }
    };
  }
  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- FORM EVENTO ---------- */
  function eventForm(id, preset) {
    const e = Object.assign({ status: "quote", owner: S().user.id }, id ? S().events.find((x) => x.id === id) : {}, preset || {});
    const f = (k, inner, full) => `<label class="${full ? "full" : ""}">${t("ef." + k)}${k === "title" ? " *" : ""}${inner}</label>`;
    const sel = (k, g) => `<select name="${k}"><option value=""></option>${GA.options[g].map((o) => `<option value="${o}" ${e[k] === o ? "selected" : ""}>${esc(ol(g, o))}</option>`).join("")}</select>`;
    const m = U().modal(`<div class="modal-head"><h2>${id ? t("ev.edit") + " · " + esc(e.code) : t("ev.new")}</h2><button class="icon-btn" data-close aria-label="close">${GA.icon("x")}</button></div>
      <form id="evForm" class="form-grid">
        ${f("title", `<input name="title" required value="${esc(e.title)}">`, true)}
        ${f("clientId", `<div class="inline"><select name="clientId"><option value="">${t("ev.noClient")}</option>${S().clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}" ${e.clientId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><button type="button" class="btn ghost sm" data-addcl title="${t("ev.newClient")}">+</button></div>`)}
        ${f("dateTime", `<input type="datetime-local" name="dateTime" value="${esc(e.dateTime)}">`)}
        ${f("location", `<input name="location" value="${esc(e.location)}">`)}
        ${f("type", sel("type", "evType"))}${f("status", sel("status", "evStatus"))}
        ${f("owner", `<select name="owner">${S().dir.map((u) => `<option value="${u.id}" ${e.owner === u.id ? "selected" : ""}>${esc(u.displayName)}</option>`).join("")}</select>`)}
        ${f("total", `<input type="number" step="0.01" min="0" name="total" value="${esc(e.total)}">`)}
        ${f("balanceDue", `<input type="date" name="balanceDue" value="${esc(e.balanceDue)}">`)}
        <div></div>
        ${f("notes", `<textarea name="notes" rows="3">${esc(e.notes)}</textarea>`, true)}
        <div class="form-err full" id="evErr"></div>
        <div class="actions full">${id && e._canDelete ? `<button type="button" class="btn danger-ghost" data-evdel>${t("a.delete")}</button>` : ""}<span class="sp"></span><button type="button" class="btn ghost" data-close>${t("a.cancel")}</button><button class="btn primary">${t("a.save")}</button></div>
      </form>`, "lg");
    const form = $("#evForm", m);
    m.addEventListener("click", async (ev) => {
      if (ev.target.closest("[data-close]")) U().closeModal();
      if (ev.target.closest("[data-addcl]")) { const keep = readForm(form); clientForm(null, async (c) => { S().clients = await api.clients.list(); eventForm(id, Object.assign(keep, { clientId: c.id })); }); }
      if (ev.target.closest("[data-evdel]") && (await U().confirmBox(t("a.confirmDelete")))) { try { await api.events.remove(id); U().toast(t("m.deleted")); location.hash = "#/events/list"; U().refresh(); } catch (x) { U().toast(U().errMsg(x), true); } }
    });
    form.onsubmit = async (ev) => {
      ev.preventDefault(); const d = readForm(form); if (id) d.id = id;
      try { const saved = await api.events.save(d); U().closeModal(); U().toast(t("m.saved")); if (!id) location.hash = "#/event/" + saved.id; U().refresh(); } catch (x) { $("#evErr", m).textContent = U().errMsg(x); }
    };
  }
  function readForm(form) { return Object.fromEntries(new FormData(form)); }

  /* ---------- DETTAGLIO EVENTO + PAGAMENTI ---------- */
  function detail(id) {
    const e = S().events.find((x) => x.id === id);
    if (!e) return `<a href="#/events/list">${t("ev.back")}</a><div class="card empty">${t("m.empty")}</div>`;
    const c = S().clients.find((x) => x.id === e.clientId) || {};
    return `<a class="back" href="#/events/list">${t("ev.back")}</a>
      <div class="page-head"><h1>${esc(e.title)} <small class="muted">${esc(e.code)}</small></h1><div class="head-actions">${badge(GA.evStatusColors, "evStatus", e.status)}<button class="btn ghost" data-evedit="${e.id}">${t("ev.edit")}</button><button class="btn primary" data-payadd>+ ${t("ev.addPayment")}</button></div></div>
      <div class="kpis">
        <div class="kpi"><span>${t("ef.total")}</span><b>${money(e.total)}</b></div>
        <div class="kpi good"><span>${t("ef.paid")}</span><b>${money(e.paid)}</b></div>
        <div class="kpi ${e.balanceOverdue ? "bad" : ""}"><span>${t("ef.remaining")}</span><b>${money(e.remaining)}</b></div>
        <div class="kpi ${e.balanceOverdue ? "bad" : ""}"><span>${t("ef.balanceDue")}</span><b class="kpi-sm">${U().fmtDate(e.balanceDue) || "—"}</b>${e.balanceOverdue ? `<span class="badge" style="--c:#dc2626">${t("ev.overdueBadge")}</span>` : ""}</div>
      </div>
      <div class="grid2">
        <section class="card"><h3>${t("ev.details")}</h3><dl class="dl">
          <dt>${t("ef.clientId")}</dt><dd>${c.id ? `<a href="#" data-cl="${c.id}">${esc(c.name)}</a><br><small class="muted">${esc([c.phone, c.email, c.wechat && "WeChat: " + c.wechat].filter(Boolean).join(" · "))}</small>` : "—"}</dd>
          <dt>${t("ef.dateTime")}</dt><dd>${fmtDT(e.dateTime) || "—"}</dd><dt>${t("ef.location")}</dt><dd>${esc(e.location) || "—"}</dd>
          <dt>${t("ef.type")}</dt><dd>${esc(ol("evType", e.type)) || "—"}</dd><dt>${t("ef.owner")}</dt><dd>${esc(U().uname(e.owner))}</dd>
          <dt>${t("ef.notes")}</dt><dd>${esc(e.notes) || "—"}</dd></dl>
          <div class="paybar">${payBar(e)}</div></section>
        <section class="card"><h3>${t("ev.payments")}</h3>${e.payments.length ? `<div class="pay-wrap"><table class="tbl pay"><thead><tr><th>${t("pf.date")}</th><th>${t("pf.kind")}</th><th class="hide-s">${t("pf.method")}</th><th class="num">${t("pf.amount")}</th><th></th></tr></thead><tbody>
          ${e.payments.map((p) => `<tr><td>${U().fmtDate(p.date)}<br><small class="muted">${esc(p.receiptNo)}</small></td><td>${esc(ol("payKind", p.kind))}<small class="muted only-s"><br>${esc(ol("payMethod", p.method))}</small>${p.note ? `<br><small class="muted">${esc(p.note)}</small>` : ""}</td><td class="hide-s">${esc(ol("payMethod", p.method))}</td><td class="num"><b>${money(p.amount)}</b></td>
            <td class="row-act">${p.txId ? `<button class="icon-btn" data-opentx="${p.txId}" title="${t("ev.linkedEntry")}">${GA.icon("link")}</button>` : ""}<button class="btn ghost sm" data-receipt="${p.id}">${t("ev.receipt")}</button><button class="icon-btn" data-payedit="${p.id}" aria-label="${t("a.edit")}">${GA.icon("edit")}</button></td></tr>`).join("")}
          <tr class="tot"><td colspan="2">${t("ef.paid")}</td><td class="hide-s"></td><td class="num"><b>${money(e.paid)}</b></td><td></td></tr></tbody></table></div>` : `<p class="muted">${t("ev.noPayments")}</p>`}</section>
      </div>`;
  }
  function entryBox(p) {
    const B = S().book, tx = p.txId ? S().tx.find((x) => x.id === p.txId) : null; const on = p.id ? !!tx : !!B.eventsAutoEntry;
    const o = (list, cur) => list.map((x) => `<option value="${x.id}" ${x.id === cur ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    return `<div class="full entry-box"><label class="switch-row"><input type="checkbox" name="asEntry" ${on ? "checked" : ""}><span>${GA.icon("link")} ${t("ev.asEntry")}</span></label>
      <div class="form-grid three entry-f"><label>${t("tx.account")}<select name="e_accountId">${o((GA.engine.selectableAccounts ? GA.engine.selectableAccounts(S().accounts, tx ? tx.accountId : B.eventsEntryAccount) : S().accounts.filter((a) => a.active !== false)), tx ? tx.accountId : B.eventsEntryAccount)}</select></label>
      <label>${t("tx.category")}<select name="e_categoryId"><option value="">${t("tx.noCat")}</option>${o(S().categories.filter((c) => c.type === "in"), tx ? tx.categoryId : B.eventsEntryCategory)}</select></label>
      <label>${t("tx.vat")}<select name="e_vatId">${o(S().vatRates.filter((v) => !v.manual), tx ? tx.vatId : B.eventsEntryVat || B.vatDefaultIn)}</select></label></div>
      <small class="muted">${t("ev.entryHint")}</small></div>`;
  }
  function paymentForm(eventId, pid) {
    const e = S().events.find((x) => x.id === eventId);
    const p = pid ? S().payments.find((x) => x.id === pid) : { kind: e.payments.length ? (e.remaining > 0 ? "balance" : "installment") : "deposit", date: today(), method: "transfer", amount: e.payments.length ? Math.max(0, e.remaining) : "" };
    const sel = (k, g) => `<select name="${k}">${GA.options[g].map((o) => `<option value="${o}" ${p[k] === o ? "selected" : ""}>${esc(ol(g, o))}</option>`).join("")}</select>`;
    const m = U().modal(`<div class="modal-head"><h2>${t("ev.addPayment")} · ${esc(e.title)}</h2><button class="icon-btn" data-close aria-label="close">${GA.icon("x")}</button></div>
      <form id="payForm" class="form-grid two">
        <label>${t("pf.kind")}${sel("kind", "payKind")}</label><label>${t("pf.amount")} (${esc(S().settings.currency)}) *<input type="number" step="0.01" min="0.01" name="amount" required value="${esc(p.amount)}"></label>
        <label>${t("pf.date")}<input type="date" name="date" value="${esc(p.date)}"></label><label>${t("pf.method")}${sel("method", "payMethod")}</label>
        <label class="full">${t("pf.note")}<input name="note" value="${esc(p.note)}"></label>
        ${entryBox(p)}
        <p class="hint full">${t("ef.total")}: <b>${money(e.total)}</b> · ${t("ef.paid")}: <b>${money(e.paid)}</b> · ${t("ef.remaining")}: <b>${money(e.remaining)}</b></p>
        <div class="form-err full" id="payErr"></div>
        <div class="actions full">${pid ? `<button type="button" class="btn danger-ghost" data-paydel>${t("a.delete")}</button>` : ""}<span class="sp"></span><button type="button" class="btn ghost" data-close>${t("a.cancel")}</button><button class="btn primary">${t("a.save")}</button></div></form>`);
    m.addEventListener("click", async (ev) => {
      if (ev.target.closest("[data-close]")) U().closeModal();
      if (ev.target.closest("[data-paydel]") && (await U().confirmBox(t("a.confirmDelete")))) { const also = p.txId ? await U().confirmBox(t("ev.delEntryToo")) : false; try { await api.payments.remove(pid, also); U().toast(t("m.deleted")); U().refresh(); } catch (x) { U().toast(U().errMsg(x), true); } }
    });
    $("#payForm", m).onsubmit = async (ev) => {
      ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)); const d = { eventId, kind: f.kind, amount: f.amount, date: f.date, method: f.method, note: f.note }; if (pid) d.id = pid;
      const entry = f.asEntry ? { accountId: f.e_accountId, categoryId: f.e_categoryId, vatId: f.e_vatId } : null;
      try { const saved = await api.payments.save(d, entry); U().closeModal(); U().toast(t("m.saved")); await U().refresh(); if (!pid) receipt(saved.id); } catch (x) { $("#payErr", m).textContent = U().errMsg(x); }
    };
  }

  /* ---------- RICEVUTA (stampa / PDF tramite CSS di stampa) ---------- */
  function receiptHTML(pid, L) {
    const tl = (k) => GA.tl(L, k);
    const p = S().payments.find((x) => x.id === pid); const e = S().events.find((x) => x.id === p.eventId); const c = S().clients.find((x) => x.id === e.clientId) || {};
    // totale versato fino a questo pagamento compreso (ricevuta "storica")
    const upTo = e.payments.filter((x) => (x.date || "") < (p.date || "") || ((x.date || "") === (p.date || "") && x.receiptNo <= p.receiptNo)).reduce((s, x) => s + Number(x.amount || 0), 0);
    const left = Math.max(0, (Number(e.total) || 0) - upTo);
    const nm = typeof C.brand.appName === "string" ? C.brand.appName : C.brand.appName[L];
    const loc = { it: "it-IT", en: "en-GB", zh: "zh-CN" }[L];
    const d = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString(loc) : "—");
    return `<div class="receipt" lang="${L === "zh" ? "zh-CN" : L}">
      <div class="rc-head"><div class="rc-brand"><img src="${esc(C.brand.logo)}" alt=""><div><b>${esc(S().book.company || nm)}</b>${S().book.companyInfo ? `<small>${esc(S().book.companyInfo)}</small>` : ""}</div></div>
        <div class="rc-no"><h2>${tl("ev.receiptTitle")}</h2><div>${tl("pf.receiptNo")} <b>${esc(p.receiptNo)}</b></div><div>${tl("pf.date")}: <b>${d(p.date)}</b></div></div></div>
      <table class="rc-tbl">
        <tr><th>${tl("ev.receivedFrom")}</th><td><b>${esc(c.name || "—")}</b>${c.phone || c.email || c.wechat ? `<br><small>${esc([c.phone, c.email, c.wechat && "WeChat: " + c.wechat].filter(Boolean).join(" · "))}</small>` : ""}</td></tr>
        <tr><th>${tl("ev.forEvent")}</th><td>${esc(e.title)} (${esc(e.code)})<br><small>${fmtDT(e.dateTime, L)}${e.location ? " · " + esc(e.location) : ""}</small></td></tr>
        <tr><th>${tl("pf.kind")}</th><td>${esc(ol("payKind", p.kind, L))}</td></tr>
        <tr><th>${tl("pf.method")}</th><td>${esc(ol("payMethod", p.method, L))}</td></tr>
        ${p.note ? `<tr><th>${tl("pf.note")}</th><td>${esc(p.note)}</td></tr>` : ""}
        <tr class="big"><th>${tl("ev.amountReceived")}</th><td><b>${money(p.amount, L)}</b></td></tr>
      </table>
      <table class="rc-sum"><tr><td>${tl("ef.total")}</td><td>${money(e.total, L)}</td></tr><tr><td>${tl("ev.paidToDate")}</td><td>${money(upTo, L)}</td></tr>
        <tr class="${left > 0 ? "due" : ""}"><td>${tl("ev.balanceLeft")}${left > 0 && e.balanceDue ? ` <small>(${tl("ev.dueBy")} ${d(e.balanceDue)})</small>` : ""}</td><td><b>${left > 0 ? money(left, L) : tl("ev.fullyPaid")}</b></td></tr></table>
      <div class="rc-foot"><div class="rc-sign">${tl("ev.signature")}<span></span></div><p>${tl("ev.thanks")}</p></div></div>`;
  }
  function receipt(pid) {
    let L = GA.i18n.lang;
    const draw = () => {
      const m = U().modal(`<div class="modal-head no-print"><h2>${t("ev.receipt")}</h2><div class="head-actions"><label class="chk">${t("ev.receiptLang")} <select id="rcLang" style="width:auto">${C.languages.map((l) => `<option value="${l}" ${l === L ? "selected" : ""}>${GA.dict[l]._name}</option>`).join("")}</select></label><button class="btn primary" id="rcPrint">${t("ev.print")}</button><button class="icon-btn" data-close aria-label="close">${GA.icon("x")}</button></div></div>${receiptHTML(pid, L)}`, "lg receipt-modal");
      $("#rcLang", m).onchange = (ev) => { L = ev.target.value; draw(); };
      $("#rcPrint", m).onclick = () => { document.body.classList.add("printing"); window.print(); setTimeout(() => document.body.classList.remove("printing"), 500); };
      m.addEventListener("click", (ev) => { if (ev.target.closest("[data-close]")) U().closeModal(); });
    };
    draw();
  }

  /* ---------- EXPORT EXCEL (2 fogli) ---------- */
  function exportXlsx() {
    const evRows = S().events.map((e) => ({ [t("ef.code")]: e.code, [t("ef.title")]: e.title, [t("ef.clientId")]: cname(e.clientId), [t("ef.dateTime")]: e.dateTime ? new Date(e.dateTime) : "", [t("ef.location")]: e.location, [t("ef.type")]: ol("evType", e.type), [t("ef.status")]: ol("evStatus", e.status), [t("ef.total")]: Number(e.total) || 0, [t("ef.paid")]: e.paid, [t("ef.remaining")]: e.remaining, [t("ef.balanceDue")]: e.balanceDue ? new Date(e.balanceDue + "T00:00:00") : "", [t("ev.overdueBadge")]: e.balanceOverdue ? t("a.yes") : "", [t("ef.owner")]: U().uname(e.owner), [t("ef.notes")]: e.notes }));
    const payRows = S().payments.map((p) => { const e = S().events.find((x) => x.id === p.eventId) || {}; return { [t("pf.receiptNo")]: p.receiptNo, [t("pf.date")]: p.date ? new Date(p.date + "T00:00:00") : "", [t("ef.code")]: e.code, [t("ef.title")]: e.title, [t("ef.clientId")]: cname(e.clientId), [t("pf.kind")]: ol("payKind", p.kind), [t("pf.method")]: ol("payMethod", p.method), [t("pf.amount")]: Number(p.amount) || 0, [t("pf.note")]: p.note }; });
    const clRows = S().clients.map((c) => ({ [t("cf.name")]: c.name, [t("cf.phone")]: c.phone, [t("cf.email")]: c.email, [t("cf.wechat")]: c.wechat, [t("cf.notes")]: c.notes }));
    const wb = XLSX.utils.book_new();
    [[evRows, "ev.list"], [payRows, "ev.payments"], [clRows, "ev.clients"]].forEach(([r, n]) => { const ws = XLSX.utils.json_to_sheet(r, { cellDates: true }); ws["!cols"] = Object.keys(r[0] || {}).map(() => ({ wch: 16 })); XLSX.utils.book_append_sheet(wb, ws, t(n).slice(0, 30)); });
    XLSX.writeFile(wb, `eventi_${today()}.xlsx`, { cellDates: true });
  }

  /* ---------- ROUTER DEL MODULO ---------- */
  GA.events = {
    money,
    view(parts) {
      if (parts[0] === "event") return detail(parts[1]);
      if (parts[1] === "list") return list();
      if (parts[1] === "clients") return clients();
      return overview();
    },
    bind(main, parts) {
      main.addEventListener("click", (ev) => {
        const el = (s) => ev.target.closest(s);
        let x;
        if ((x = el("[data-ev]"))) { location.hash = "#/event/" + x.dataset.ev; return; }
        if ((x = el("[data-cl]"))) { ev.preventDefault(); return clientForm(x.dataset.cl); }
        if (el("[data-evnew]")) return eventForm(null);
        if (el("[data-cnew]")) return clientForm(null);
        if (el("[data-evexport]")) return exportXlsx();
        if ((x = el("[data-evedit]"))) return eventForm(x.dataset.evedit);
        if (el("[data-payadd]")) return paymentForm(parts[1]);
        if ((x = el("[data-payedit]"))) return paymentForm(parts[1], x.dataset.payedit);
        if ((x = el("[data-receipt]"))) return receipt(x.dataset.receipt);
        if ((x = el("[data-opentx]"))) return GA.acc.txForm(x.dataset.opentx);
      });
      main.querySelectorAll("[data-evf]").forEach((i) => i.addEventListener(i.type === "search" ? "input" : "change", () => {
        S().evf[i.dataset.evf] = i.type === "checkbox" ? i.checked : i.value;
        clearTimeout(S()._eq); S()._eq = setTimeout(() => U().route().then(() => { if (i.type === "search") { const s = $("[data-evf=q]"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }), i.type === "search" ? 250 : 0);
      }));
      const cq = $("[data-cq]", main); if (cq) cq.addEventListener("input", () => { S().cq = cq.value; clearTimeout(S()._cq); S()._cq = setTimeout(() => U().route().then(() => { const s = $("[data-cq]"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }), 250); });
    },
    receipt,
  };
})();
