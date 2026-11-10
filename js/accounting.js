/* =========================================================
 * CONTABILITÀ: home (mese corrente + saldo), registri Entrate/Spese, ricorrenze,
 * conti e giroconti-IVA, dashboard mensile e annuale, calendario.
 * Tutti i numeri vengono da GA.engine (stesse formule del file Excel).
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, t = (p, v) => GA.t(p, v), I = GA.icon, api = GA.api, E = GA.engine;
  const S = () => U().S, esc = (v) => U().esc(v), $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const M = (v) => U().money(v), M0 = (v) => U().money0(v);
  const CH = []; // grafici attivi
  const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const col = { accent: () => css("--accent") || "#0f766e", get ink() { return css("--ch-ink") || "#44403c"; }, get mute() { return css("--ch-mute") || "#a8a29e"; }, get line() { return css("--ch-2") || "#e7e5e4"; }, get grid() { return css("--ch-grid") || "#f0efed"; }, get card() { return css("--card") || "#fff"; }, get fill() { return css("--accent-fill") || "rgba(15,118,110,.06)"; }, neg: "#b4533c" };
  const signCls = (v) => (v < -0.004 ? "neg" : "");
  const today = () => E.today();
  const catOf = (id) => S().categories.find((c) => c.id === id);
  const accOf = (id) => S().accounts.find((a) => a.id === id);
  const canEdit = (r) => U().isAdmin() || r.createdBy === S().user.id;
  const deptOpts = (cur) => `<option value="">${t("dash.allDepts")}</option>${S().departments.map((d) => `<option value="${d.id}" ${cur === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}`;
  const ctxOpts = () => ({ today: today(), wd: { weekdays: S().book.weekdays, overrides: S().book.overrides }, goals: S().book.goals, accounts: S().accounts, startMonth: S().book.fyStart, prevYearIn: S().book.prevYearIn, prevYearOut: S().book.prevYearOut });

  /* ---------- periodi dei filtri ---------- */
  const periods = () => E.periods(today(), S().book.fyStart, S().tx.map((x) => x.date));
  const periodLabel = (p) => (p.key.startsWith("m:") ? U().monthName(p.key.slice(2)) : t("period." + p.key));
  const periodSelect = (cur, attrs) => `<select ${attrs}>${periods().map((p) => `<option value="${p.key}" ${cur === p.key ? "selected" : ""}>${esc(periodLabel(p))}</option>`).join("")}</select>`;
  function txMonthKey() { return S()._txMonth || today().slice(0, 7); }
  function shortDate(iso) {
    if (!iso) return ""; const d = new Date(iso + "T00:00:00"); if (isNaN(d)) return iso;
    const dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
    return GA.i18n.lang === "zh" ? (d.getMonth() + 1) + "/" + d.getDate() : dd + "/" + mm;
  }
  function dayHeading(iso) {
    if (!iso) return "";
    if (iso === today()) return t("tx.today");
    if (iso === E.addDays(today(), -1)) return t("tx.yesterday");
    const d = new Date(iso + "T00:00:00"); if (isNaN(d)) return iso;
    const loc = GA.i18n.locale();
    if (GA.i18n.lang === "zh") return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + d.toLocaleDateString(loc, { weekday: "long" });
    const s = d.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function weekDayLabels() {
    // 2023-01-02 = lunedì; etichette corte nella lingua corrente
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = new Date(Date.UTC(2023, 0, 2 + i));
      return d.toLocaleDateString(GA.i18n.locale(), { weekday: "short", timeZone: "UTC" }).replace(/\.$/, "");
    });
  }
  function calAmt(n, kind) {
    const v = Math.abs(Number(n) || 0);
    const num = (Math.round(v * 100) / 100).toLocaleString(GA.i18n.locale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (kind === "in" ? "+" : "−") + num;
  }
  function filteredTx() {
    let rows = E.filterTx(S().tx, S().f, periods());
    const day = S()._txDay; const mk = txMonthKey();
    if (day) rows = rows.filter((x) => x.date === day);
    else if (!S().f.period) rows = rows.filter((x) => (x.date || "").startsWith(mk));
    return rows;
  }
  function dayStatsMap(txs) {
    const map = {};
    txs.forEach((x) => {
      if (!x.paid || !x.date) return;
      const m = map[x.date] || (map[x.date] = { in: 0, out: 0 });
      m[x.type === "in" ? "in" : "out"] += Number(x.gross) || 0;
    });
    return map;
  }
  function monthCalCells(ym, stats) {
    const first = ym + "-01";
    const dow = (E.parse(first).getDay() + 6) % 7; // 0 = lunedì
    let cur = E.addDays(first, -dow);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const st = stats[cur] || { in: 0, out: 0 };
      cells.push({ iso: cur, n: Number(cur.slice(8)), inMonth: cur.startsWith(ym), today: cur === today(), inn: st.in, out: st.out });
      cur = E.addDays(cur, 1);
    }
    return cells;
  }
  function renderTxGroups(rows, lim, compact) {
    const slice = rows.slice(0, lim); let html = "", cur = "", buf = [];
    const flush = () => {
      if (!cur) return;
      const dayIn = buf.filter((x) => x.type === "in" && x.paid).reduce((s, x) => s + x.gross, 0);
      const dayOut = buf.filter((x) => x.type === "out" && x.paid).reduce((s, x) => s + x.gross, 0);
      const tot = dayIn - dayOut;
      html += `<div class="tx-dayhead" role="heading" aria-level="3"><span class="tx-dayhead-l"><b>${esc(dayHeading(cur))}</b></span><small class="tx-dayhead-r ${tot < 0 ? "neg" : ""}">${M(tot)}</small></div>`;
      html += buf.map((x) => txItem(x, compact)).join(""); buf = [];
    };
    slice.forEach((x) => { if (x.date !== cur) { flush(); cur = x.date; } buf.push(x); }); flush();
    return html;
  }

  /* tonalità stabile per categoria (usata dal tema Colorato per i chip colorati) */
  const hue = (k) => { let h = 0; for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  /* ---------- riga movimento ---------- */
  function txItem(x, compact) {
    const c = catOf(x.categoryId), a = accOf(x.accountId); const sign = x.type === "in" ? "+" : "−";
    const sub = [shortDate(x.date), !x.paid ? t("tx.planned") : ""].filter(Boolean).join(" · ");
    return `<div class="tx ${x.paid ? "" : "planned"}" data-tx="${x.id}">
      <button class="paid-dot ${x.paid ? "on" : ""}" data-toggle="${x.id}" title="${t("tx.tapPaid")}" aria-label="${x.paid ? t("tx.paid") : t("tx.planned")}" ${canEdit(x) ? "" : "disabled"}>${I(x.paid ? "check" : "circle")}</button>
      <span class="tx-ic ${x.type}" style="--h:${hue(x.categoryId || x.type)}">${I((c && c.icon) || (x.type === "in" ? "plus" : "tag"))}</span>
      <span class="tx-main"><b>${esc(x.desc || (c ? c.name : t("tx.noCat")))}</b><small>${esc([c && x.desc ? c.name : "", a ? a.name : "", x.ref].filter(Boolean).join(" · "))}${x.eventId ? ` · ${I("link", "xs")} ${t("tx.fromEvent")}` : ""}${x.attachmentId ? ` · <span class="has-photo" title="${t("sc.photo")}">${I("clip", "xs")}</span>` : ""}</small></span>
      ${compact ? "" : `<span class="tx-col">${U().fmtDate(x.date)}</span><span class="tx-col num">${esc(U().nameOf("vatRates", x.vatId))}</span><span class="tx-col num">${x.paid ? M(x.net) : "—"}</span>`}
      <span class="tx-amt ${x.type}"><b>${sign}${M(x.gross)}</b><small>${esc(sub)}</small></span></div>`;
  }

  /* ---------- HOME (telefono: riepilogo del mese corrente con il saldo) ---------- */
  function viewHome() {
    const B = S().book, mk = today().slice(0, 7), o = ctxOpts();
    const m = E.month(S().tx, Object.assign({ month: mk }, o));
    const bal = E.balances(S().accounts, S().tx, S().transfers);
    const avail = bal.reduce((s, r) => s + (r.kind === "card" ? -r.balance : r.balance), 0);
    const goalTxt = m.goal ? (m.goalDiff > 0 ? t("dash.goalMissing", { v: M0(m.goalDiff) }) : t("dash.goalAbove", { v: M0(-m.goalDiff) })) : t("dash.noGoal");
    const todayCl = closingRows(today()); const toCol = toCollect();
    const sched = m.scheduledMonth.slice(0, 5); const recent = S().tx.filter((x) => x.date <= today()).slice(0, 8);
    return `<header class="home-head"><div><span class="brand-script">${esc(typeof GA.config.brand.appName === "string" ? GA.config.brand.appName : GA.config.brand.appName[GA.i18n.lang] || GA.config.brand.appName.it)}</span><small class="muted">${esc(B.company || "")}</small><h1>${esc(U().monthName(mk))}</h1></div><a class="btn ghost sm" href="#/month/${mk}">${t("dash.seeMonth")}${I("right")}</a></header>
      <section class="hero card">
        <span class="label">${t("dash.balanceNow")}</span><b class="big ${signCls(avail)}">${M(avail)}</b>
        <div class="hero-sub"><span>${t("dash.liquidity")} <b class="${signCls(m.liquidity)}">${M(m.liquidity)}</b></span><span>${t("dash.progress")} <b>${U().pct(m.progress)}</b></span></div>
        <div class="acc-chips">${bal.filter((r) => accOf(r.id).active !== false).map((r) => `<a href="#/accounts" class="chip">${I(accOf(r.id).icon || "bank")}<span>${esc(r.name)}</span><b class="${signCls(r.kind === "card" ? -r.balance : r.balance)}">${M(r.kind === "card" ? -r.balance : r.balance)}</b></a>`).join("")}</div>
      </section>
      <div class="quick"><a class="btn quick-in closing-btn" href="#/closing" id="homeClosing">${I("moon")}<span><b>${t("cl.title")}</b><small>${todayCl.length ? t("cl.todayDone", { v: M(todayCl.reduce((s, x) => s + x.gross, 0)) }) : t("cl.todayTodo")}</small></span></a><button class="btn quick-out" data-quick="out">${I("plus")}${t("tx.out")}</button></div>
      <div class="quick-more"><button class="link-btn" data-quick="in">${I("plus", "xs")}${t("cl.single")}</button><button class="link-btn" id="homeScan" data-scansheet>${I("camera", "xs")}${t("sc.short")}</button></div>
      <div class="kpis">
        ${kpi(t("dash.inNet"), M(m.inNet), m.inRatio != null ? deltaTxt(m.inRatio, t("dash.vsPrev")) : "")}
        ${kpi(t("dash.outNet"), M(m.outNet), m.outRatio != null ? deltaTxt(m.outRatio, t("dash.vsPrev"), true) : "")}
        ${kpi(t("dash.profit"), `<span class="${signCls(m.profit)}">${M(m.profit)}</span>`, goalTxt, m.goal ? bar(m.goalPct) : "")}
        ${kpi(t("dash.vat"), M(Math.abs(m.vatBalance)), m.vatBalance >= 0 ? t("dash.vatPay") : t("dash.vatRecover"))}
      </div>
      ${toCol.length ? `<section class="card collect-card"><div class="card-h"><h3>${t("cl.toCollect")}</h3><b id="toCollectTot">${M(toCol.reduce((s, x) => s + x.gross, 0))}</b></div>
        <div class="txlist">${toCol.map((x) => `<div class="tx collect"><span class="tx-ic in">${I("receipt")}</span><span class="tx-main"><b>${esc(x.notes || x.desc || t("cl.Unpaid"))}</b><small>${esc(U().fmtDate(x.date, { weekday: "short", day: "numeric", month: "short" }))}</small></span><span class="tx-amt in"><b>${M(x.gross)}</b></span><button class="btn sm" data-collect="${x.id}" ${canEdit(x) ? "" : "disabled"}>${I("check", "xs")}<span>${t("cl.collect")}</span></button></div>`).join("")}</div></section>` : ""}
      <div class="grid2">
        <section class="card"><div class="card-h"><h3>${t("dash.scheduled")}</h3><small class="muted">${M(m.scheduledMonth.reduce((s, x) => s + x.gross, 0))}</small></div>
          ${sched.length ? `<div class="txlist">${sched.map((x) => txItem(x, true)).join("")}</div>` : `<p class="empty">${t("m.empty")}</p>`}</section>
        <section class="card"><div class="card-h"><h3>${t("dash.recent")}</h3><a href="#/tx" class="muted small">${t("nav.tx")} ${I("right", "xs")}</a></div>
          ${recent.length ? `<div class="txlist">${recent.map((x) => txItem(x, true)).join("")}</div>` : `<p class="empty">${t("m.empty")}</p>`}</section>
      </div>`;
  }
  const kpi = (label, value, sub, extra) => `<div class="kpi card"><span class="label">${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}${extra || ""}</div>`;
  const bar = (p) => `<div class="bar"><i style="width:${Math.min(100, Math.max(0, p * 100))}%"></i></div>`;
  function deltaTxt(ratio, lbl, inverse) { const d = ratio - 1; const good = inverse ? d <= 0 : d >= 0; return `<span class="delta ${good ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${U().pct(Math.abs(d), 1)}</span> ${lbl} ${t("dash.perDay")}`; }


  /* ---------- CHIUSURA SERATA: Contanti / POS / Non riscosso sempre in vista ---------- */
  const CHN = () => GA.closingChannels;
  const defDept = () => S()._clDept || (S().departments[0] || {}).id || "";
  function closingRows(date, dept) { const d = dept == null ? defDept() : dept; return S().tx.filter((x) => x.closing && x.date === date && (x.deptId || "") === d); }
  function toCollect() { return S().tx.filter((x) => x.type === "in" && x.closing === "unpaid" && !x.paid).sort((a, b) => a.date.localeCompare(b.date)); }
  const chLabel = (K) => { const c = catOf(S().book["closingCat" + K]); return c ? c.name : t("cl." + K); };
  const plainVat = () => S().vatRates.filter((v) => !v.manual);
  function viewClosing(parts) {
    const B = S().book, date = /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "") ? parts[1] : today(), dept = defDept();
    const ex = closingRows(date, dept), ro = ex.some((x) => !canEdit(x));
    const defVat = (plainVat().find((v) => v.id === B.vatDefaultIn) || plainVat().slice(-1)[0] || {}).id;
    const rows = CHN().map(([ch, K, ic]) => { const o = ex.find((x) => x.closing === ch) || {}; const acc = accOf(ch === "unpaid" && o.id ? o.accountId : B["closingAcc" + K]);
      return `<section class="card cl-row ${ch}" data-ch="${ch}">
        <div class="cl-top"><span class="tx-ic in">${I(ic)}</span><span class="grow"><b>${esc(chLabel(K))}</b><small>${ch === "unpaid" ? (o.id && o.paid ? `${I("check", "xs")} ${t("cl.collected")} · ${esc(acc ? acc.name : "")}` : t("cl.toCollect")) : esc(acc ? acc.name : "")}</small></span></div>
        <div class="cl-in"><label><span class="sr">${t("tx.gross")}</span><input type="number" inputmode="decimal" step="0.01" min="0" name="g_${ch}" placeholder="0,00" value="${o.gross != null ? esc(o.gross) : ""}" ${ro ? "disabled" : ""}></label>
          <label><span class="sr">${t("tx.vat")}</span><select name="v_${ch}" ${ro ? "disabled" : ""}>${plainVat().map((v) => `<option value="${v.id}" ${(o.vatId || defVat) === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label></div>
        <div class="cl-calc" id="calc_${ch}"></div>
        ${ch === "unpaid" && !(o.id && o.paid) ? `<p class="hint small">${t("cl.unpaidHint")}</p>` : ""}</section>`; }).join("");
    return `<header class="page-head"><h1>${t("cl.title")}</h1><div class="head-actions"><button class="btn ghost sm" data-quick="in">${I("plus")}<span>${t("cl.single")}</span></button></div></header>
      <form id="clForm" class="closing narrow-l">
        <div class="cl-head"><div class="cl-date">
          <label>${t("tx.date")}<input type="date" name="date" value="${date}" required></label>
          ${S().departments.length > 1 ? `<label>${t("tx.dept")}<select name="deptId">${S().departments.map((d) => `<option value="${d.id}" ${d.id === dept ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>` : ""}
        </div>${ex.length ? `<p class="notice" id="clEditing">${t(ro ? "cl.readOnly" : "cl.editing")}</p>` : `<p class="hint">${t("cl.intro")}</p>`}</div>
        <div class="cl-list">${rows}</div>
        <section class="card cl-total"><div><span class="label">${t("cl.total")}</span><small class="muted" id="clTotSub"></small></div><b id="clTot">${M(0)}</b></section>
        <label class="cl-note">${t("tx.notes")}<input name="notes" value="${esc((ex[0] || {}).notes || "")}" ${ro ? "disabled" : ""}></label>
        <div class="form-err" id="clErr"></div>
        <div class="actions">${U().isAdmin() ? `<a class="btn ghost sm" href="#/settings/general">${I("settings", "xs")}${t("cl.setLink")}</a>` : ""}<span class="sp"></span>${ro ? "" : `<button class="btn primary" id="clSave">${t("cl.save")}</button>`}</div>
      </form>`;
  }
  function bindClosing(main) {
    const form = $("#clForm", main); if (!form) return; const ctx = E.context(S());
    const calc = () => { let g = 0, n = 0, v = 0;
      CHN().forEach(([ch]) => { const gross = Number(form["g_" + ch].value) || 0; const c = E.calcTx({ type: "in", paid: 1, gross, vatId: form["v_" + ch].value }, ctx); g += gross; n += c.net; v += c.vat;
        $("#calc_" + ch, main).innerHTML = gross ? `<span>${t("tx.net")} <b>${M(c.net)}</b></span><span>${t("tx.vatAmt")} <b>${M(c.vat)}</b></span>` : ""; });
      $("#clTot", main).textContent = M(g); $("#clTotSub", main).innerHTML = g ? `${t("tx.net")} ${M(n)} · ${t("tx.vatAmt")} ${M(v)}` : ""; };
    form.addEventListener("input", calc); form.addEventListener("change", calc); calc();
    form.date.addEventListener("change", () => { if (form.date.value) location.hash = "#/closing/" + form.date.value; });
    if (form.deptId) form.deptId.addEventListener("change", () => { S()._clDept = form.deptId.value; U().route(); });
    form.onsubmit = async (e) => { e.preventDefault(); const rows = {}; CHN().forEach(([ch]) => (rows[ch] = { gross: form["g_" + ch].value, vatId: form["v_" + ch].value }));
      try { await api.transactions.saveClosing({ date: form.date.value, deptId: form.deptId ? form.deptId.value : defDept(), notes: form.notes.value, rows }); U().toast(t("cl.saved")); await U().refresh(); location.hash = "#/home"; }
      catch (x) { $("#clErr", main).textContent = U().errMsg(x); } };
    if (!closingRows(form.date.value).length) setTimeout(() => form.g_cash && form.g_cash.focus(), 50);
  }
  function collectForm(id) {
    const x = S().tx.find((r) => r.id === id); if (!x) return; const B = S().book;
    const def = B.closingAccCash || x.accountId;
    const m = U().modal(`${U().mhead(t("cl.collectTitle"))}<form id="colForm" class="stack">
      <p class="hint">${esc(U().fmtDate(x.date))} · ${esc(x.desc || "")} · <b>${M(x.gross)}</b></p>
      <label>${t("cl.collectTo")}<select name="accountId">${S().accounts.filter((a) => a.active !== false).map((a) => `<option value="${a.id}" ${a.id === def ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
      <div class="form-err" id="colErr"></div>
      <div class="actions"><span class="sp"></span><button type="button" class="btn" data-close>${t("a.cancel")}</button><button class="btn primary">${I("check", "xs")}${t("cl.collect")}</button></div></form>`, "sheet");
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) U().closeModal(); });
    $("#colForm", m).onsubmit = async (e) => { e.preventDefault(); try { await api.transactions.collect(id, e.target.accountId.value); U().closeModal(); U().toast(t("m.saved")); U().refresh(); } catch (er) { $("#colErr", m).textContent = U().errMsg(er); } };
  }

  /* ---------- REGISTRO MOVIMENTI ---------- */
  function viewTx(parts) {
    if (parts[1] === "in" || parts[1] === "out") S().f.type = parts[1];
    if (!S()._txMonth) S()._txMonth = today().slice(0, 7);
    const F = S().f, mk = txMonthKey(), dsel = S()._txDay;
    const prevM = E.addMonths(mk + "-01", -1).slice(0, 7), nextM = E.addMonths(mk + "-01", 1).slice(0, 7);
    const rows = filteredTx(), tot = E.totals(rows), lim = S()._lim || 200;
    const cats = S().categories.filter((c) => !F.type || c.type === F.type);
    const nFilters = ["paid", "period", "accountId", "deptId", "categoryId", "ref", "q"].filter((k) => F[k]).length + (dsel ? 1 : 0);
    // totali calendario: stessi filtri, senza giorno selezionato
    const monthRows = (() => { const hold = S()._txDay; S()._txDay = null; const r = filteredTx(); S()._txDay = hold; return r; })();
    const cells = monthCalCells(mk, dayStatsMap(monthRows));
    const wds = weekDayLabels();
    const cal = `<section class="card tx-cal-card">
      <div class="stepper tx-month"><button type="button" class="icon-btn" data-txm="${prevM}" aria-label="prev">${I("left")}</button><b>${esc(U().monthName(mk))}</b><button type="button" class="icon-btn" data-txm="${nextM}" aria-label="next">${I("right")}</button></div>
      <div class="tx-cal" role="grid" aria-label="${esc(t("tx.cal"))}">
        <div class="tx-cal-wd">${wds.map((w) => `<span>${esc(w)}</span>`).join("")}</div>
        <div class="tx-cal-grid">${cells.map((c) => {
          const cls = ["tx-cal-d", c.inMonth ? "" : "out", c.today ? "today" : "", dsel === c.iso ? "on" : "", (c.inn || c.out) ? "has" : ""].filter(Boolean).join(" ");
          const has = c.inn || c.out;
          const am = has
            ? `<span class="tx-cal-out">${esc(calAmt(c.out, "out"))}</span><span class="tx-cal-in">${esc(calAmt(c.inn, "in"))}</span>`
            : `<span class="tx-cal-blank"></span>`;
          return `<button type="button" class="${cls}" data-txday="${c.iso}" ${c.inMonth ? "" : 'data-txm="' + c.iso.slice(0, 7) + '"'}><span class="tx-cal-n">${c.n}</span>${am}</button>`;
        }).join("")}</div>
      </div>
      ${dsel ? `<div class="tx-cal-foot"><button type="button" class="btn ghost sm" data-dayclear>${t("tx.allMonth")}</button><small class="muted">${esc(dayHeading(dsel))}</small></div>` : ""}
    </section>`;
    return `<header class="page-head"><h1>${t("nav.tx")}</h1><div class="head-actions">
        <button class="btn ghost sm" data-rec>${I("repeat")}<span>${t("tx.recurrence")}</span></button>
        <button class="btn primary sm" data-new>${I("plus")}<span>${F.type === "out" ? t("tx.newOut") : t("tx.newIn")}</span></button></div></header>
      ${cal}
      <div class="seg">${[["", "tx.all"], ["in", "tx.ins"], ["out", "tx.outs"]].map(([k, l]) => `<button class="${F.type === k ? "on" : ""}" data-ftype="${k}">${t(l)}</button>`).join("")}</div>
      <details class="filters card" ${S()._fopen ? "open" : ""}><summary>${I("filter")}<span>${t("a.filters")}</span>${nFilters ? `<span class="pill">${nFilters}</span>` : ""}<span class="sp"></span><small class="muted">${rows.length} ${t("tx.count")}</small></summary>
        <div class="form-grid">
          <label class="full"><span class="sr">${t("a.search")}</span><input type="search" data-f="q" placeholder="${t("a.search")}" value="${esc(F.q)}"></label>
          <label>${t("tx.period")}${periodSelect(F.period || "all", 'data-f="period"')}</label>
          <label>${t("tx.paidF")}<select data-f="paid"><option value="">${t("a.all")}</option><option value="planned" ${F.paid === "planned" ? "selected" : ""}>${t("tx.onlyPlanned")}</option><option value="paid" ${F.paid === "paid" ? "selected" : ""}>${t("tx.onlyPaid")}</option></select></label>
          <label>${t("tx.account")}<select data-f="accountId"><option value="">${t("a.all")}</option>${S().accounts.map((a) => `<option value="${a.id}" ${F.accountId === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label>${t("tx.dept")}<select data-f="deptId">${deptOpts(F.deptId)}</select></label>
          <label>${t("tx.category")}<select data-f="categoryId"><option value="">${t("a.all")}</option>${cats.map((c) => `<option value="${c.id}" ${F.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          <label>${t("tx.ref")}<input data-f="ref" value="${esc(F.ref)}" list="refList"><datalist id="refList">${Array.from(new Set(S().tx.map((x) => x.ref).filter(Boolean))).sort().map((r) => `<option value="${esc(r)}">`).join("")}</datalist></label>
          <div class="full btn-row"><button class="btn ghost sm" data-freset>${t("a.reset")}</button>${U().isAdmin() ? `<button class="btn ghost sm" data-defvat>${t("tx.defaultVat")}</button>` : ""}<button class="btn ghost sm" data-export="xlsx">${I("download")}${t("a.exportXlsx")}</button></div>
        </div></details>
      <div class="totals card"><div><span class="label">${t("tx.gross")}</span><b>${M(tot.gross)}</b></div><div><span class="label">${t("tx.net")}</span><b>${M(tot.net)}</b></div>
        ${F.type !== "out" ? `<div><span class="label">${t("tx.vatAmt")}</span><b>${M(tot.vat)}</b></div>` : ""}${F.type === "out" ? `<div><span class="label">${t("tx.dedAmt")}</span><b>${M(tot.ded)}</b></div>` : ""}</div>
      ${rows.length ? `<div class="card txlist full-list"><div class="tx head"><span></span><span></span><span class="tx-main">${t("tx.desc")}</span><span class="tx-col">${t("tx.date")}</span><span class="tx-col num">${t("tx.vat")}</span><span class="tx-col num">${t("tx.net")}</span><span class="tx-amt">${t("tx.gross")}</span></div>
        ${renderTxGroups(rows, lim, false)}${rows.length > lim ? `<button class="btn ghost block" data-more>+ ${rows.length - lim}</button>` : ""}</div>
        <p class="muted small center">${t("tx.sort")} · ${t("tx.planHint")}</p>` : `<div class="card empty-state">${I("list", "big")}<p>${t("m.empty")}</p><button class="btn primary" data-new>${I("plus")}${t("tx.newIn")}</button></div>`}`;
  }

  /* ---------- FORM MOVIMENTO (inserimento rapido su telefono) ---------- */
  function txForm(id, preset) {
    const B = S().book, old = id ? S().tx.find((x) => x.id === id) : null;
    const r = Object.assign({ type: "in", paid: true, date: today(), accountId: (S().accounts.find((a) => a.active !== false) || {}).id, deptId: (S().departments[0] || {}).id, vatId: B.vatDefaultIn, dedId: B.dedDefault, gross: "" }, old || {}, preset || {});
    if (!old && preset && preset.type === "out" && !preset.vatId) r.vatId = B.vatDefaultOut;
    const ro = old && !canEdit(old) ? "disabled" : "";
    const draw = () => {
      const cats = S().categories.filter((c) => c.type === r.type && (c.active !== false || c.id === r.categoryId));
      const vat = S().vatRates.find((v) => v.id === r.vatId) || {};
      const sc = r._scan, cf = (sc && sc.conf) || {}, un = (k) => (sc && !(cf[k] >= 0.7) ? " unsure" : ""), unB = (k) => (un(k) ? ` <em class="unsure-tag">${t("sc.check")}</em>` : "");
      const m = U().modal(`${U().mhead(sc ? t("sc.review") : old ? t("tx.edit") : r.type === "in" ? t("tx.newIn") : t("tx.newOut"))}
        <form id="txForm" class="stack">
          ${sc ? `<div class="scan-head">${sc.image ? `<button type="button" class="scan-thumb" data-zoom aria-label="${t("sc.photo")}"><img src="${sc.image.dataUrl}" alt=""></button>` : ""}<div><b>${t("sc.reviewHint")}</b><small class="muted">${t(sc.source === "pdf" ? "sc.srcPdf" : sc.source === "remote" ? "sc.srcRemote" : "sc.srcOcr")}${sc.vat != null ? ` · ${t("sc.vatRead")} ${M(sc.vat)}${sc.rates.length ? ` (${sc.rates.map((x) => x + "%").join(" + ")})` : ""}` : ""}</small>${sc.learned ? `<small class="ok-tag">${I("check", "xs")} ${t("sc.learned")}</small>` : ""}</div></div>` : ""}
          ${!old && !sc && r.type === "out" && GA.scan ? GA.scan.buttons() : ""}
          ${old && old.attachmentId ? `<button type="button" class="btn ghost scan-see" data-photo>${I("clip")}${t("sc.viewPhoto")}</button>` : ""}
          <div class="seg wide">${["in", "out"].map((k) => `<button type="button" class="${r.type === k ? "on " + k : ""}" data-type="${k}" ${ro}>${t("tx." + k)}</button>`).join("")}</div>
          <label class="amount-in${un("gross")}"><span>${t("tx.gross")}${unB("gross")}</span><input name="gross" type="number" inputmode="decimal" step="0.01" required value="${esc(r.gross)}" placeholder="0,00" ${ro}></label>
          <div class="calc" id="calc"></div>
          <div class="form-grid">
            <label class="${un("date")}">${t("tx.date")}${unB("date")}<input type="date" name="date" required value="${esc(r.date)}" ${ro}></label>
            <label class="${un("accountId")}">${t("tx.account")}${unB("accountId")}<select name="accountId" ${ro}>${S().accounts.filter((a) => a.active !== false || a.id === r.accountId).map((a) => `<option value="${a.id}" ${a.id === r.accountId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
            <label class="full${un("categoryId")}">${t("tx.category")}${unB("categoryId")}<select name="categoryId" ${ro}><option value="">${t("tx.noCat")}</option>${cats.map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
            <label class="full${un("desc")}">${t("tx.desc")}${unB("desc")}<input name="desc" value="${esc(r.desc)}" ${ro} list="descList"><datalist id="descList">${Array.from(new Set(S().tx.filter((x) => x.type === r.type).map((x) => x.desc).filter(Boolean))).slice(0, 50).map((d) => `<option value="${esc(d)}">`).join("")}</datalist></label>
            <label class="${un("vatId")}">${t("tx.vat")}${unB("vatId")}<select name="vatId" ${ro}>${S().vatRates.map((v) => `<option value="${v.id}" ${v.id === r.vatId ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>
            ${vat.manual ? `<label>${t("tx.vatManual")}<input type="number" step="0.01" name="vatManual" value="${esc(r.vatManual || "")}" ${ro}></label>` : ""}
            ${r.type === "out" ? `<label>${t("tx.ded")}<select name="dedId" ${ro}>${S().dedRates.map((d) => `<option value="${d.id}" ${d.id === r.dedId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>` : ""}
            <label class="switch-row full"><input type="checkbox" name="paid" ${r.paid ? "checked" : ""} ${ro}><span>${t("tx.paid")}</span><small class="muted">${t("tx.planHint")}</small></label>
          </div>
          <details class="more" ${sc || r.ref || r.notes || S().departments.length > 1 ? "open" : ""}><summary>${t("tx.more")}</summary><div class="form-grid">
            <label class="${un("ref")}">${t("tx.ref")}${unB("ref")}<input name="ref" value="${esc(r.ref)}" ${ro}></label>
            <label>${t("tx.dept")}<select name="deptId" ${ro}>${S().departments.map((d) => `<option value="${d.id}" ${d.id === r.deptId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
            <label class="full">${t("tx.notes")}<textarea name="notes" rows="2" ${ro}>${esc(r.notes)}</textarea></label></div></details>
          ${old ? `<p class="muted small">${t("u.createdBy")}: ${esc(U().uname(old.createdBy))}${old.eventId ? ` · <a href="#/event/${old.eventId}" data-close>${I("link", "xs")} ${t("tx.fromEvent")}</a>` : ""}</p>` : ""}
          ${sc && sc.text ? `<details class="scan-raw"><summary>${t("sc.raw")}</summary><pre>${esc(sc.text)}</pre></details>` : ""}
          <div class="form-err" id="txErr"></div>
          <div class="actions">${old && !ro ? `<button type="button" class="btn danger-ghost" data-del>${I("trash")}${t("a.delete")}</button>` : ""}<span class="sp"></span><button type="button" class="btn" data-close>${t("a.cancel")}</button>${ro ? "" : `<button class="btn primary">${sc ? t("sc.confirm") : t("a.save")}</button>`}</div>
        </form>`, "sheet");
      const form = $("#txForm", m);
      const read = () => { const d = Object.fromEntries(new FormData(form)); d.paid = form.paid.checked; return d; };
      const calc = () => { const d = Object.assign({}, r, read(), { type: r.type, paid: true }); const c = E.calcTx({ type: d.type, paid: 1, gross: d.gross, vatId: d.vatId, vatManual: d.vatManual, dedId: d.dedId }, E.context(S()));
        $("#calc", m).innerHTML = Number(d.gross) ? `<span>${t("tx.net")} <b>${M(c.net)}</b></span><span>${t("tx.vatAmt")} <b>${M(c.vat)}</b></span>${d.type === "out" ? `<span>${t("tx.dedAmt")} <b>${M(c.ded)}</b></span>` : ""}` : ""; };
      form.addEventListener("input", (e) => { calc(); const l = e.target.closest(".unsure"); if (l) { l.classList.remove("unsure"); const tg = l.querySelector(".unsure-tag"); if (tg) tg.remove(); if (sc) cf[e.target.name === "vatManual" ? "vatId" : e.target.name] = 1; } }); calc();
      if (GA.scan) GA.scan.bindInputs(m, () => Object.assign({}, read(), { type: "out" }));
      form.vatId.addEventListener("change", () => { Object.assign(r, read()); draw(); });
      m.addEventListener("click", async (e) => {
        if (e.target.closest("[data-close]")) U().closeModal();
        if (e.target.closest("[data-zoom]") && sc) { const box = document.createElement("div"); box.className = "scan-zoom"; box.innerHTML = `<img src="${sc.image.dataUrl}" alt="">`; box.onclick = () => box.remove(); m.appendChild(box); }
        if (e.target.closest("[data-photo]")) { U().closeModal(); GA.scan.view(old.attachmentId, () => txForm(id)); }
        const ty = e.target.closest("[data-type]"); if (ty && ty.dataset.type !== r.type) { Object.assign(r, read(), { type: ty.dataset.type, categoryId: "" }); if (!old) r.vatId = ty.dataset.type === "in" ? B.vatDefaultIn : B.vatDefaultOut; draw(); }
        if (e.target.closest("[data-del]")) { const msg = `${t("tx.confirmDel")}\n${[old.ref, U().fmtDate(old.date), M(old.gross), old.desc].filter(Boolean).join(" · ")}`; if (await U().confirmBox(msg)) { try { await api.transactions.remove(id); U().toast(t("m.deleted")); U().refresh(); } catch (x) { U().toast(U().errMsg(x), true); } } }
      });
      form.onsubmit = async (e) => {
        e.preventDefault(); const d = Object.assign(read(), { type: r.type }); if (id) d.id = id; if (r.type === "in") d.dedId = "";
        if (!(S().vatRates.find((v) => v.id === d.vatId) || {}).manual) d.vatManual = 0;
        try { if (sc && sc.image && !r.attachmentId) r.attachmentId = await GA.scan.saveImage(sc.image); if (r.attachmentId) d.attachmentId = r.attachmentId; await api.transactions.save(d); U().closeModal(); U().toast(t("m.saved")); U().refresh(); } catch (x) { $("#txErr", m).textContent = U().errMsg(x); }
      };
      if (!old) setTimeout(() => form.gross.focus(), 50);
    };
    draw();
  }

  /* ---------- RICORRENZA (stesse frequenze del form Excel) ---------- */
  function recurrenceForm(type) {
    const B = S().book; const r = { type: type || "out", first: today(), end: E.addMonths(today(), 11), freq: "monthly", vatId: type === "in" ? B.vatDefaultIn : B.vatDefaultOut, dedId: B.dedDefault, accountId: (S().accounts[0] || {}).id, deptId: (S().departments[0] || {}).id };
    const draw = () => {
      const m = U().modal(`${U().mhead(t("tx.recTitle"))}<form id="recForm" class="stack">
        <div class="seg wide">${["in", "out"].map((k) => `<button type="button" class="${r.type === k ? "on " + k : ""}" data-type="${k}">${t("tx." + k)}</button>`).join("")}</div>
        <div class="form-grid">
          <label class="full">${t("tx.desc")}<input name="desc" value="${esc(r.desc)}"></label>
          <label>${t("tx.gross")} *<input name="gross" type="number" step="0.01" required value="${esc(r.gross)}" inputmode="decimal"></label>
          <label>${t("tx.freq")}<select name="freq">${GA.options.freq.map((f) => `<option value="${f}" ${r.freq === f ? "selected" : ""}>${t("o.freq." + f)}</option>`).join("")}</select></label>
          <label>${t("tx.first")}<input type="date" name="first" required value="${r.first}"></label><label>${t("tx.end")}<input type="date" name="end" required value="${r.end}"></label>
          <label>${t("tx.account")}<select name="accountId">${S().accounts.filter((a) => a.active !== false).map((a) => `<option value="${a.id}" ${a.id === r.accountId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label>${t("tx.category")}<select name="categoryId"><option value="">${t("tx.noCat")}</option>${S().categories.filter((c) => c.type === r.type && c.active !== false).map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          <label>${t("tx.vat")}<select name="vatId">${S().vatRates.filter((v) => !v.manual).map((v) => `<option value="${v.id}" ${v.id === r.vatId ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>
          ${r.type === "out" ? `<label>${t("tx.ded")}<select name="dedId">${S().dedRates.map((d) => `<option value="${d.id}" ${d.id === r.dedId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>` : ""}
          <label>${t("tx.dept")}<select name="deptId">${S().departments.map((d) => `<option value="${d.id}" ${d.id === r.deptId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
          <label>${t("tx.ref")}<input name="ref" value="${esc(r.ref)}"></label>
          <label class="full">${t("tx.notes")}<input name="notes" value="${esc(r.notes)}"></label></div>
        <p class="hint" id="recPrev"></p><div class="form-err" id="recErr"></div>
        <div class="actions"><span class="sp"></span><button type="button" class="btn" data-close>${t("a.cancel")}</button><button class="btn primary">${t("a.add")}</button></div></form>`, "sheet");
      const form = $("#recForm", m);
      const dates = () => { const d = Object.fromEntries(new FormData(form)); return d.first && d.end ? E.recurrenceDates(d.first, d.end, d.freq) : []; };
      const prev = () => { const ds = dates(), p = ds.filter((x) => x <= today()).length; $("#recPrev", m).textContent = t("tx.preview", { n: ds.length, p, f: ds.length - p }); };
      form.addEventListener("input", prev); form.addEventListener("change", prev); prev();
      m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) U().closeModal(); const ty = e.target.closest("[data-type]"); if (ty) { Object.assign(r, Object.fromEntries(new FormData(form)), { type: ty.dataset.type, categoryId: "" }); r.vatId = r.type === "in" ? B.vatDefaultIn : B.vatDefaultOut; draw(); } });
      form.onsubmit = async (e) => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(form)); const ds = dates(); if (!ds.length) { $("#recErr", m).textContent = t("m.date"); return; }
        const rid = "rec-" + Date.now().toString(36);
        // come la macro: date passate = pagate (P=1), future = pianificate (P=0)
        const recs = ds.map((dt) => ({ type: r.type, paid: dt <= today(), date: dt, ref: d.ref, desc: d.desc, gross: d.gross, accountId: d.accountId, categoryId: d.categoryId, deptId: d.deptId, vatId: d.vatId, dedId: r.type === "out" ? d.dedId : "", notes: d.notes, recurrenceId: rid }));
        try { const n = await api.transactions.bulk(recs); U().closeModal(); U().toast(t("tx.created", { n })); U().refresh(); } catch (x) { $("#recErr", m).textContent = U().errMsg(x); }
      };
    };
    draw();
  }
  function defaultVatForm() {
    const B = S().book; const opts = (cur) => S().vatRates.map((v) => `<option value="${v.id}" ${v.id === cur ? "selected" : ""}>${esc(v.name)}</option>`).join("");
    const m = U().modal(`${U().mhead(t("tx.defaultVat"))}<form id="dvForm" class="stack"><label>${t("set.vatIn")}<select name="vatDefaultIn">${opts(B.vatDefaultIn)}</select></label><label>${t("set.vatOut")}<select name="vatDefaultOut">${opts(B.vatDefaultOut)}</select></label>
      <label>${t("set.dedDef")}<select name="dedDefault">${S().dedRates.map((v) => `<option value="${v.id}" ${v.id === B.dedDefault ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>
      <div class="actions"><span class="sp"></span><button type="button" class="btn" data-close>${t("a.cancel")}</button><button class="btn primary">${t("a.save")}</button></div></form>`, "sm");
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) U().closeModal(); });
    $("#dvForm", m).onsubmit = async (e) => { e.preventDefault(); await api.book.set(Object.fromEntries(new FormData(e.target))); U().closeModal(); U().toast(t("m.saved")); U().refresh(); };
  }

  /* ---------- CONTI E GIROCONTI-IVA ---------- */
  function viewAccounts() {
    const pk = S()._accPeriod || "all"; const p = periods().find((x) => x.key === pk);
    const bal = E.balances(S().accounts, S().tx, S().transfers, pk === "all" ? null : p);
    const card = (r) => { const a = accOf(r.id); return `<section class="card acc-card ${a.active === false ? "inactive" : ""}"><div class="card-h"><h3>${I(a.icon || "bank")} ${esc(r.name)}</h3><small class="muted">${t(r.kind === "card" ? "acc.kindCard" : "acc.kindAccount")}</small></div>
        <b class="big ${signCls(r.balance)}">${M(r.balance)}</b><span class="label">${t("acc.balance")}</span>
        <dl class="kv">${[["acc.income", r.income], ["acc.expense", r.expense], ["acc.trIn", r.trIn], ["acc.trOut", r.trOut], ["acc.vatIn", r.vatIn], ["acc.vatOut", r.vatOut], ["acc.opening", r.opening]].map(([k, v]) => `<dt>${t(k)}</dt><dd>${M(v)}</dd>`).join("")}</dl>
        <label class="manual">${t("acc.manual")}<input type="number" step="0.01" data-manual="${r.id}" value="${r.manual == null ? "" : r.manual}" placeholder="${t("acc.setManual")}" ${U().isAdmin() ? "" : "disabled"}></label>
        ${r.check == null ? "" : Math.abs(r.check) < 0.005 ? `<p class="check ok">${I("check", "xs")} ${t("acc.ok")}</p>` : `<p class="check bad">${t("acc.diff")}: <b>${M(r.check)}</b></p>`}</section>`; };
    const trs = S().transfers.slice().sort((a, b) => b.date.localeCompare(a.date));
    const an = (id) => (id === "IVA" ? t("acc.vatPseudo") : U().nameOf("accounts", id));
    return `<header class="page-head"><h1>${t("acc.title")}</h1><button class="btn primary sm" data-trnew>${I("swap")}<span>${t("acc.newTransfer")}</span></button></header>
      <div class="toolbar"><label>${t("tx.period")}${periodSelect(pk, 'id="accPeriod"')}</label><small class="muted">${t("acc.periodHint")}</small></div>
      <div class="acc-grid">${bal.filter((r) => r.kind !== "card").map(card).join("")}</div>
      ${bal.some((r) => r.kind === "card") ? `<h2 class="section-t">${t("acc.cards")}</h2><p class="muted small">${t("acc.cardHint")}</p><div class="acc-grid">${bal.filter((r) => r.kind === "card").map(card).join("")}</div>` : ""}
      <section class="card"><div class="card-h"><h3>${t("acc.transfers")}</h3><small class="muted">${trs.length}</small></div>
        ${trs.length ? `<div class="txlist">${trs.map((x) => `<div class="tx tr3" data-tr="${x.id}"><span class="tx-ic">${I(x.from === "IVA" || x.to === "IVA" ? "receipt" : "swap")}</span><span class="tx-main"><b>${esc(an(x.from))} → ${esc(an(x.to))}</b><small>${U().fmtDate(x.date)}${x.notes ? " · " + esc(x.notes) : ""}</small></span><span class="tx-amt"><b>${M(x.amount)}</b></span></div>`).join("")}</div>` : `<p class="empty">${t("m.empty")}</p>`}</section>`;
  }
  function transferForm(id) {
    const old = id ? S().transfers.find((x) => x.id === id) : null; const r = Object.assign({ date: today(), from: (S().accounts[0] || {}).id, to: (S().accounts[1] || {}).id || "IVA" }, old || {});
    const opts = (cur) => S().accounts.map((a) => `<option value="${a.id}" ${a.id === cur ? "selected" : ""}>${esc(a.name)}</option>`).join("") + `<option value="IVA" ${cur === "IVA" ? "selected" : ""}>${t("acc.vatPseudo")}</option>`;
    const ro = old && !canEdit(old) ? "disabled" : "";
    const m = U().modal(`${U().mhead(t("acc.newTransfer"))}<form id="trForm" class="stack"><div class="form-grid">
      <label>${t("tx.date")}<input type="date" name="date" required value="${r.date}" ${ro}></label><label>${t("acc.amount")}<input type="number" step="0.01" min="0.01" name="amount" required value="${esc(r.amount)}" inputmode="decimal" ${ro}></label>
      <label>${t("acc.from")}<select name="from" ${ro}>${opts(r.from)}</select></label><label>${t("acc.to")}<select name="to" ${ro}>${opts(r.to)}</select></label>
      <label class="full">${t("tx.notes")}<input name="notes" value="${esc(r.notes)}" ${ro}></label></div>
      <div class="form-err" id="trErr"></div><div class="actions">${old && !ro ? `<button type="button" class="btn danger-ghost" data-del>${I("trash")}${t("a.delete")}</button>` : ""}<span class="sp"></span><button type="button" class="btn" data-close>${t("a.cancel")}</button>${ro ? "" : `<button class="btn primary">${t("a.save")}</button>`}</div></form>`, "sheet");
    m.addEventListener("click", async (e) => { if (e.target.closest("[data-close]")) U().closeModal(); if (e.target.closest("[data-del]") && (await U().confirmBox(t("a.confirmDelete")))) { await api.transfers.remove(id); U().toast(t("m.deleted")); U().refresh(); } });
    $("#trForm", m).onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); if (id) d.id = id; try { await api.transfers.save(d); U().closeModal(); U().toast(t("m.saved")); U().refresh(); } catch (x) { $("#trErr", m).textContent = U().errMsg(x); } };
  }

  /* ---------- DASHBOARD MENSILE ---------- */
  function breakdownTable(rows, key, kind) {
    const nm = (k) => (key === "categoryId" ? U().nameOf("categories", k, t("tx.noCat")) : U().nameOf("accounts", k, "—"));
    if (!rows.length) return `<p class="empty">${t("m.empty")}</p>`;
    const tot = rows.reduce((s, r) => ({ gross: s.gross + r.gross, vat: s.vat + r.vat, net: s.net + r.net, prev: s.prev + r.prev }), { gross: 0, vat: 0, net: 0, prev: 0 });
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t(key === "categoryId" ? "dash.byCategory" : "dash.byAccount")}</th><th class="num hide-s">${t("tx.gross")}</th><th class="num hide-s">${t(kind === "out" ? "tx.dedAmt" : "tx.vatAmt")}</th><th class="num">${t("tx.net")}</th><th class="num">${t("dash.share")}</th><th class="num">${t("dash.prev")}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(nm(r.key))}<div class="bar thin"><i style="width:${Math.max(0, r.pct * 100)}%"></i></div></td><td class="num hide-s">${M(r.gross)}</td><td class="num hide-s">${M(r.vat)}</td><td class="num"><b>${M(r.net)}</b></td><td class="num">${U().pct(r.pct)}</td><td class="num muted">${M(r.prev)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>${t("dash.total")}</td><td class="num hide-s">${M(tot.gross)}</td><td class="num hide-s">${M(tot.vat)}</td><td class="num">${M(tot.net)}</td><td></td><td class="num muted">${M(tot.prev)}</td></tr></tfoot></table></div>`;
  }
  function viewMonth(mk) {
    mk = /^\d{4}-\d{2}$/.test(mk || "") ? mk : today().slice(0, 7);
    const dept = S()._dept || "", by = S()._by || "categoryId", schedAll = !!S()._schedAll;
    const m = E.month(S().tx, Object.assign({ month: mk, dept }, ctxOpts()));
    const goalTxt = m.goal ? (m.goalDiff > 0 ? t("dash.goalMissing", { v: M0(m.goalDiff) }) : t("dash.goalAbove", { v: M0(-m.goalDiff) })) : t("dash.noGoal");
    const sched = schedAll ? m.scheduledAll : m.scheduledMonth; const prevK = E.addMonths(mk + "-01", -1).slice(0, 7), nextK = E.addMonths(mk + "-01", 1).slice(0, 7);
    S()._monthData = m;
    return `<header class="page-head"><div class="stepper big"><a class="icon-btn" href="#/month/${prevK}" aria-label="prev">${I("left")}</a><h1>${esc(U().monthName(mk))}</h1><a class="icon-btn" href="#/month/${nextK}" aria-label="next">${I("right")}</a></div>
        <select id="dept" class="w-auto">${deptOpts(dept)}</select></header>
      <p class="muted small">${t("dash.month")} · ${t("dash.progress")} ${U().pct(m.progress)} (${m.wdElapsed}/${m.wdTotal} ${t("dash.workdays")})</p>${bar(m.progress)}
      <div class="kpis k3">
        ${kpi(t("dash.inNet"), M(m.inNet), m.inRatio != null ? deltaTxt(m.inRatio, t("dash.vsPrev")) : `${t("dash.prev")}: ${M(m.prevInNet)}`)}
        ${kpi(t("dash.outNet"), M(m.outNet), m.outRatio != null ? deltaTxt(m.outRatio, t("dash.vsPrev"), true) : `${t("dash.prev")}: ${M(m.prevOutNet)}`)}
        ${kpi(t("dash.profit"), `<span class="${signCls(m.profit)}">${M(m.profit)}</span>`, `${t("dash.goal")} ${m.goal ? M0(m.goal) : "—"} · ${goalTxt}`, m.goal ? bar(m.goalPct) : "")}
        ${kpi(t("dash.vat"), M(Math.abs(m.vatBalance)), `${m.vatBalance >= 0 ? t("dash.vatPay") : t("dash.vatRecover")} · ${t("dash.vatSales")} ${M(m.vatSales)} · ${t("dash.vatPurch")} ${M(m.vatPurch)}`, m.vatSplit != null ? `<div class="split"><i style="width:${m.vatSplit * 100}%"></i></div>` : "")}
        ${kpi(t("dash.liquidity"), `<span class="${signCls(m.liquidity)}">${M(m.liquidity)}</span>`, t("dash.liquidityHint"))}
        ${kpi(t("dash.perWd"), `${M(m.inDaily || 0)}`, `${t("tx.outs")} ${M(m.outDaily || 0)} · ${t("dash.breakeven")} ${M(m.breakeven)}`)}
      </div>
      <section class="card"><div class="card-h"><h3>${t("dash.daily")}</h3></div><div class="chart h260"><canvas id="chDaily"></canvas></div></section>
      <div class="seg"><button class="${by === "categoryId" ? "on" : ""}" data-by="categoryId">${t("dash.byCategory")}</button><button class="${by === "accountId" ? "on" : ""}" data-by="accountId">${t("dash.byAccount")}</button></div>
      <div class="grid2 lg">
        <section class="card"><div class="card-h"><h3>${t("tx.ins")}</h3></div><div class="chart h200"><canvas id="chDonutIn"></canvas></div>${breakdownTable(E.breakdown(m._inM, m._inP, by, "in"), by, "in")}</section>
        <section class="card"><div class="card-h"><h3>${t("tx.outs")}</h3></div><div class="chart h200"><canvas id="chDonutOut"></canvas></div>${breakdownTable(E.breakdown(m._outM, m._outP, by, "out"), by, "out")}</section>
      </div>
      <label class="switch-row small"><input type="checkbox" id="smallCats" ${S()._small ? "checked" : ""}><span>${t("dash.smallCats")}</span></label>
      <section class="card"><div class="card-h"><h3>${t("dash.scheduled")}</h3><div class="seg sm"><button class="${schedAll ? "" : "on"}" data-sched="0">${t("dash.scheduledMonth")}</button><button class="${schedAll ? "on" : ""}" data-sched="1">${t("dash.scheduledAll")}</button></div></div>
        ${sched.length ? `<div class="txlist">${sched.map((x) => txItem(x, true)).join("")}</div><p class="total-line">${t("dash.total")}: <b>${M(sched.reduce((s, x) => s + x.gross, 0))}</b></p>` : `<p class="empty">${t("m.empty")}</p>`}</section>`;
  }

  /* ---------- DASHBOARD ANNUALE ---------- */
  function viewYear(y) {
    const fy = Number(E.fiscalYearStart(today(), S().book.fyStart).slice(0, 4)); y = Number(y) || fy;
    const dept = S()._dept || "", by = S()._by || "categoryId";
    const r = E.year(S().tx, Object.assign({ year: y, dept }, ctxOpts())); S()._yearData = r;
    const label = r.from.slice(0, 4) === r.to.slice(0, 4) ? r.from.slice(0, 4) : r.from.slice(0, 4) + "/" + r.to.slice(2, 4);
    const goalTxt = r.goal ? (r.goalDiff > 0 ? t("dash.goalMissing", { v: M0(r.goalDiff) }) : t("dash.goalAbove", { v: M0(-r.goalDiff) })) : t("dash.noGoal");
    const usingSettings = !r.prevInNet && !r.prevOutNet && (S().book.prevYearIn || S().book.prevYearOut);
    const av = (o) => `<td class="num">${o.monthly == null ? "—" : M(o.monthly)}</td><td class="num">${o.daily == null ? "—" : M(o.daily)}</td>`;
    return `<header class="page-head"><div class="stepper big"><a class="icon-btn" href="#/year/${y - 1}">${I("left")}</a><h1>${label}</h1><a class="icon-btn" href="#/year/${y + 1}">${I("right")}</a></div><select id="dept" class="w-auto">${deptOpts(dept)}</select></header>
      <p class="muted small">${t("dash.year")} · ${t("dash.progress")} ${U().pct(r.progress)} (${r.wdElapsed}/${r.wdTotal} ${t("dash.workdays")})</p>${bar(r.progress)}
      <div class="kpis k3">
        ${kpi(t("dash.inNet"), M(r.inNet), r.inRatio != null ? deltaTxt(r.inRatio, t("dash.vsPrevYear")) : "")}
        ${kpi(t("dash.outNet"), M(r.outNet), r.outRatio != null ? deltaTxt(r.outRatio, t("dash.vsPrevYear"), true) : "")}
        ${kpi(t("dash.profit"), `<span class="${signCls(r.profit)}">${M(r.profit)}</span>`, `${t("set.annualGoal")} ${r.goal ? M0(r.goal) : "—"} · ${goalTxt}`, r.goal ? bar(r.goalPct) : "")}
        ${kpi(t("dash.vat"), M(Math.abs(r.vatBalance)), `${r.vatBalance >= 0 ? t("dash.vatPay") : t("dash.vatRecover")} · ${t("dash.vatSales")} ${M(r.vatSales)} · ${t("dash.vatPurch")} ${M(r.vatPurch)}`, r.vatSplit != null ? `<div class="split"><i style="width:${r.vatSplit * 100}%"></i></div>` : "")}
        ${kpi(t("dash.best"), r.best && r.best.profit ? `${esc(U().monthName(r.best.month, "long").split(" ")[0])}` : "—", r.best && r.best.profit ? M(r.best.profit) : "")}
        ${kpi(t("dash.worst"), r.worst && r.worst.profit ? `${esc(U().monthName(r.worst.month, "long").split(" ")[0])}` : "—", r.worst && r.worst.profit ? `<span class="${signCls(r.worst.profit)}">${M(r.worst.profit)}</span>` : "")}
      </div>
      ${usingSettings ? `<p class="muted small">${t("dash.prevYearNote")}</p>` : ""}
      <section class="card"><div class="card-h"><h3>${t("dash.monthsChart")}</h3></div><div class="chart h260"><canvas id="chYear"></canvas></div></section>
      <div class="grid2">
        <section class="card"><div class="card-h"><h3>${t("dash.averages")}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="num">${t("dash.monthly")}</th><th class="num">${t("dash.perWd")}</th></tr></thead><tbody>
          <tr><td>${t("dash.inNet")}</td>${av(r.avgIn)}</tr><tr><td>${t("dash.outNet")}</td>${av(r.avgOut)}</tr><tr><td>${t("dash.vat")}</td>${av(r.avgVat)}</tr><tr><td>${t("dash.profit")}</td>${av(r.avgProfit)}</tr></tbody></table></div></section>
        <section class="card"><div class="card-h"><h3>${t("dash.patrimony")}</h3></div><div class="chart h200"><canvas id="chPatr"></canvas></div></section>
      </div>
      <section class="card"><div class="card-h"><h3>${t("dash.stats")}</h3></div><div class="tbl-wrap"><table class="tbl stats"><thead><tr><th></th>${r.months.map((x) => `<th class="num"><a href="#/month/${x.month}">${esc(U().monthShort(x.month))}</a></th>`).join("")}</tr></thead><tbody>
        ${[["dash.profit", "profit"], ["dash.goal", "goal"], ["dash.goalPct", "gp"], ["dash.outNet", "outNet"], ["dash.vatPurch", "vatPurch"], ["dash.outGross", "outGross"], ["dash.liquidity", "liquidity"], ["dash.inNet", "inNet"], ["dash.vatSales", "vatSales"], ["dash.inGross", "inGross"]].map(([l, k]) => `<tr><th>${t(l)}</th>${r.months.map((x) => `<td class="num ${k === "profit" || k === "liquidity" ? signCls(x[k]) : ""}">${k === "gp" ? (x.goal ? U().pct(Math.max(0, x.profit) / x.goal) : "—") : M0(x[k])}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div></section>
      <div class="seg"><button class="${by === "categoryId" ? "on" : ""}" data-by="categoryId">${t("dash.byCategory")}</button><button class="${by === "accountId" ? "on" : ""}" data-by="accountId">${t("dash.byAccount")}</button></div>
      <div class="grid2 lg">
        <section class="card"><div class="card-h"><h3>${t("tx.ins")}</h3></div><div class="chart h200"><canvas id="chDonutIn"></canvas></div>${breakdownTable(E.breakdown(r._inY, r._inPY, by, "in"), by, "in")}</section>
        <section class="card"><div class="card-h"><h3>${t("tx.outs")}</h3></div><div class="chart h200"><canvas id="chDonutOut"></canvas></div>${breakdownTable(E.breakdown(r._outY, r._outPY, by, "out"), by, "out")}</section>
      </div><label class="switch-row small"><input type="checkbox" id="smallCats" ${S()._small ? "checked" : ""}><span>${t("dash.smallCats")}</span></label>`;
  }

  /* ---------- CALENDARIO (giorni lavorativi + importi per giorno) ---------- */
  function viewCalendar(y) {
    const fy = Number(E.fiscalYearStart(today(), S().book.fyStart).slice(0, 4)); y = Number(y) || fy;
    const R = E.yearRange(y, S().book.fyStart); const wd = { weekdays: S().book.weekdays, overrides: S().book.overrides };
    const L = GA.i18n.locale(); const wdn = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(L, { weekday: "narrow" }));
    const wdl = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(L, { weekday: "short" }));
    const admin = U().isAdmin(); const pat = S()._pat || S().book.weekdays.slice();
    const byDay = {}; S().tx.forEach((x) => { if (x.date >= R.from && x.date <= R.to) (byDay[x.date] = byDay[x.date] || []).push(x); });
    const months = Array.from({ length: 12 }, (_, i) => E.addMonths(R.from, i).slice(0, 7));
    const label = R.from.slice(0, 4) === R.to.slice(0, 4) ? R.from.slice(0, 4) : R.from.slice(0, 4) + "/" + R.to.slice(2, 4);
    const monthCard = (mk) => {
      const a = mk + "-01", b = E.eomonth(a, 0); const lead = (E.parse(a).getDay() + 6) % 7; const cells = [];
      for (let i = 0; i < lead; i++) cells.push(`<span class="d pad"></span>`);
      let inN = 0, outN = 0, sch = 0, vs = 0, vp = 0;
      for (let d = a; d <= b; d = E.addDays(d, 1)) {
        const v = E.calendarDay(byDay[d] || [], d); inN += v.inNet; outN += v.outNet; sch += v.scheduled;
        (byDay[d] || []).forEach((x) => { if (x.type === "in") vs += x.vat; else vp += x.ded; });
        const w = E.isWorkday(d, wd);
        cells.push(`<button class="d ${w ? "w" : "off"} ${d === today() ? "today" : ""}" data-day="${d}" ${admin ? "" : "disabled"} title="${U().fmtDate(d)} · ${w ? t("cal.workday") : t("cal.off")}${v.inNet ? " · +" + M(v.inNet) : ""}${v.outNet ? " · −" + M(v.outNet) : ""}${v.scheduled ? " · " + t("cal.scheduled") + " " + M(v.scheduled) : ""}"><span>${Number(d.slice(8))}</span>${v.inNet || v.outNet || v.scheduled ? `<i class="dots">${v.inNet ? '<em class="in"></em>' : ""}${v.outNet ? '<em class="out"></em>' : ""}${v.scheduled ? '<em class="sch"></em>' : ""}</i>` : ""}</button>`);
      }
      return `<section class="card cal-m"><div class="card-h"><h3><a href="#/month/${mk}">${esc(U().monthName(mk, "long"))}</a></h3><small class="muted">${E.countWorkdays(a, b, wd)} ${t("dash.workdays")}</small>${admin ? `<button class="btn ghost xs" data-applym="${mk}">${t("cal.applyMonth")}</button>` : ""}</div>
        <div class="cal-grid">${wdn.map((n) => `<span class="h">${n}</span>`).join("")}${cells.join("")}</div>
        <dl class="kv sm"><dt>${t("dash.inNet")}</dt><dd>${M(inN)}</dd><dt>${t("dash.outNet")}</dt><dd>${M(outN)}</dd><dt>${t("dash.profit")}</dt><dd class="${signCls(inN - outN)}">${M(inN - outN)}</dd><dt>${t("cal.scheduled")}</dt><dd class="${signCls(sch)}">${M(sch)}</dd><dt>${t("dash.vat")} ${vs - vp >= 0 ? t("dash.vatPay") : t("dash.vatRecover")}</dt><dd>${M(Math.abs(vs - vp))}</dd></dl></section>`;
    };
    return `<header class="page-head"><div class="stepper big"><a class="icon-btn" href="#/calendar/${y - 1}">${I("left")}</a><h1>${t("cal.title")} ${label}</h1><a class="icon-btn" href="#/calendar/${y + 1}">${I("right")}</a></div></header>
      ${admin ? `<section class="card pad"><h3>${t("cal.setWeekdays")}</h3><div class="wd-pick">${wdl.map((n, i) => `<label class="chip-chk"><input type="checkbox" data-pat="${i}" ${pat[i] ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}</div>
        <div class="btn-row"><button class="btn sm" data-applyy>${t("cal.applyYear")}</button><small class="muted">${t("cal.tapHint")}</small></div></section>` : ""}
      <div class="legend muted small"><span><i class="lgd w"></i>${t("cal.workday")}</span><span><i class="lgd off"></i>${t("cal.off")}</span><span><em class="in"></em>${t("tx.ins")}</span><span><em class="out"></em>${t("tx.outs")}</span><span><em class="sch"></em>${t("cal.scheduled")}</span></div>
      ${[0, 1, 2, 3].map((q) => `<h2 class="section-t">${t("period.q" + (q + 1))}</h2><div class="cal-q">${months.slice(q * 3, q * 3 + 3).map(monthCard).join("")}</div>`).join("")}`;
  }

  /* ---------- GRAFICI (Chart.js incluso nel pacchetto) ---------- */
  function destroyCharts() { while (CH.length) CH.pop().destroy(); }
  function mk(id, cfg) { const el = document.getElementById(id); if (!el || !window.Chart) return; cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, color: col.ink, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label || c.label}: ${M(c.parsed.y ?? c.parsed)}` } } } }, cfg.options || {}); CH.push(new Chart(el, cfg)); }
  const axes = (stacked) => ({ x: { grid: { display: false }, ticks: { color: col.mute, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 8 }, stacked }, y: { grid: { color: col.grid }, border: { display: false }, ticks: { color: col.mute, font: { size: 10 }, callback: (v) => new Intl.NumberFormat(GA.i18n.locale(), { notation: "compact" }).format(v) } } });
  function donut(id, rows, key) {
    const nm = (k) => (key === "categoryId" ? U().nameOf("categories", k, t("tx.noCat")) : U().nameOf("accounts", k, "—"));
    let data = rows.filter((r) => r.net > 0); if (!data.length) { const el = document.getElementById(id); if (el) el.parentElement.style.display = "none"; return; }
    if (!S()._small) { const big = data.filter((r) => r.pct >= 0.03), small = data.filter((r) => r.pct < 0.03); if (small.length > 1) data = big.concat([{ key: "__o", net: small.reduce((s, r) => s + r.net, 0) }]); }
    const a = col.accent(); const shades = data.map((_, i) => i === 0 ? a : `color-mix(in srgb, ${a} ${Math.max(12, 85 - i * 13)}%, ${col.line})`);
    const fallback = ["#0f766e", "#3f8f87", "#6fa9a2", "#9fc4bf", "#c9ddda", "#a8a29e", "#d6d3d1", "#78716c", "#57534e", "#e7e5e4"];
    const ok = CSS.supports && CSS.supports("color", "color-mix(in srgb, red 50%, white)");
    mk(id, { type: "doughnut", data: { labels: data.map((r) => (r.key === "__o" ? t("dash.other") : nm(r.key))), datasets: [{ data: data.map((r) => r.net), backgroundColor: css("--ch-pal") ? data.map((_, i) => css("--ch-pal").split(",")[i % css("--ch-pal").split(",").length].trim()) : ok ? shades : fallback, borderWidth: 2, borderColor: col.card }] }, options: { cutout: "68%", plugins: { legend: { position: "right", labels: { boxWidth: 8, boxHeight: 8, font: { size: 11 }, color: col.ink } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${M(c.parsed)}` } } } } });
  }
  function drawCharts(view) {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const by = S()._by || "categoryId";
    if (view === "month") {
      const m = S()._monthData; const lbl = m.days.map((d) => Number(d.date.slice(8)));
      mk("chDaily", { data: { labels: lbl, datasets: [
        { type: "bar", label: t("dash.inNet"), data: m.days.map((d) => d.inNet), backgroundColor: col.accent(), borderRadius: 3, maxBarThickness: 14 },
        { type: "bar", label: t("dash.outNet"), data: m.days.map((d) => -d.outNet), backgroundColor: col.line, borderRadius: 3, maxBarThickness: 14 },
        { type: "line", label: t("dash.breakeven"), data: m.days.map(() => m.breakeven), borderColor: col.ink, borderWidth: 1, borderDash: [4, 4], pointRadius: 0 },
        ...(m.goal ? [{ type: "line", label: t("dash.goalDaily"), data: m.days.map(() => m.goalDaily), borderColor: col.mute, borderWidth: 1, pointRadius: 0 }] : [])] }, options: { scales: axes(true) } });
      donut("chDonutIn", E.breakdown(m._inM, m._inP, by, "in"), by); donut("chDonutOut", E.breakdown(m._outM, m._outP, by, "out"), by);
    }
    if (view === "year") {
      const r = S()._yearData; const lbl = r.months.map((x) => U().monthShort(x.month));
      mk("chYear", { data: { labels: lbl, datasets: [
        { type: "bar", label: t("dash.inNet"), data: r.months.map((x) => x.inNet), backgroundColor: col.accent(), borderRadius: 3, maxBarThickness: 22 },
        { type: "bar", label: t("dash.outNet"), data: r.months.map((x) => x.outNet), backgroundColor: col.line, borderRadius: 3, maxBarThickness: 22 },
        { type: "line", label: t("dash.profit"), data: r.months.map((x) => x.profit), borderColor: col.ink, borderWidth: 1.5, pointRadius: 2, tension: 0.3 },
        ...(r.goal ? [{ type: "line", label: t("dash.goal"), data: r.months.map((x) => x.goal), borderColor: col.mute, borderDash: [4, 4], borderWidth: 1, pointRadius: 0 }] : [])] }, options: { scales: axes(false) } });
      const p = E.patrimony(S().tx, S().transfers, S().accounts, r.from, r.to > today() ? today() : r.to);
      if (p.length) mk("chPatr", { type: "line", data: { labels: p.map((d) => U().fmtDate(d.date, { day: "numeric", month: "short" })), datasets: [{ label: t("dash.patrimony"), data: p.map((d) => d.balance), borderColor: col.accent(), backgroundColor: col.fill, fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0.2 }] }, options: { plugins: { legend: { display: false } }, scales: axes(false) } });
      donut("chDonutIn", E.breakdown(r._inY, r._inPY, by, "in"), by); donut("chDonutOut", E.breakdown(r._outY, r._outPY, by, "out"), by);
    }
  }

  /* ---------- eventi UI ---------- */
  function bind(main, view, parts) {
    main.addEventListener("click", async (e) => {
      const el = (s) => e.target.closest(s); let x;
      if ((x = el("[data-toggle]"))) { e.stopPropagation(); try { await api.transactions.togglePaid(x.dataset.toggle); } catch (er) { U().toast(U().errMsg(er), true); } return U().refresh(); }
      if ((x = el("[data-tx]"))) return txForm(x.dataset.tx);
      if ((x = el("[data-tr]"))) return transferForm(x.dataset.tr);
      if ((x = el("[data-quick]"))) return txForm(null, { type: x.dataset.quick });
      if ((x = el("[data-scansheet]"))) return GA.scan.sheet();
      if ((x = el("[data-collect]"))) return collectForm(x.dataset.collect);
      if (el("[data-new]")) return txForm(null, { type: S().f.type || "in" });
      if (el("[data-rec]")) return recurrenceForm(S().f.type || "out");
      if (el("[data-defvat]")) return defaultVatForm();
      if (el("[data-trnew]")) return transferForm(null);
      if (el("[data-more]")) { S()._lim = (S()._lim || 200) + 300; return U().route(); }
      if ((x = el("[data-ftype]"))) { S().f.type = x.dataset.ftype; S().f.categoryId = ""; if (parts[1]) { location.hash = "#/tx"; return; } return U().route(); }
      if (el("[data-freset]")) { Object.keys(S().f).forEach((k) => { if (k !== "type") S().f[k] = ""; }); S()._txDay = null; return U().route(); }
      if ((x = el("[data-txday]"))) {
        const iso = x.dataset.txday; const jump = x.dataset.txm;
        if (jump && jump !== txMonthKey()) { S()._txMonth = jump; S()._txDay = iso; S().f.period = ""; }
        else S()._txDay = (S()._txDay === iso) ? null : iso;
        S()._lim = 200; return U().route();
      }
      if ((x = el("[data-txm]"))) { S()._txMonth = x.dataset.txm; S()._txDay = null; S().f.period = ""; S()._lim = 200; return U().route(); }
      if (el("[data-dayclear]")) { S()._txDay = null; S()._lim = 200; return U().route(); }
      if ((x = el("[data-export]"))) return GA.settingsUI.exportTx(x.dataset.export);
      if ((x = el("[data-by]"))) { S()._by = x.dataset.by; return U().route(); }
      if ((x = el("[data-sched]"))) { S()._schedAll = x.dataset.sched === "1"; return U().route(); }
      if ((x = el("[data-day]"))) { const d = x.dataset.day; const ov = Object.assign({}, S().book.overrides); const cur = E.isWorkday(d, { weekdays: S().book.weekdays, overrides: ov }); const def = E.isWorkday(d, { weekdays: S().book.weekdays }); if (!cur === def) delete ov[d]; else ov[d] = cur ? 0 : 1; await api.book.set({ overrides: ov }); await U().refresh(); return; }
      if ((x = el("[data-applym]"))) { const pat = S()._pat || S().book.weekdays; const a = x.dataset.applym + "-01", b = E.eomonth(a, 0); const ov = Object.assign({}, S().book.overrides); for (let d = a; d <= b; d = E.addDays(d, 1)) ov[d] = pat[(E.parse(d).getDay() + 6) % 7] ? 1 : 0; await api.book.set({ overrides: ov }); U().toast(t("m.saved")); return U().refresh(); }
      if (el("[data-applyy]")) { const pat = S()._pat || S().book.weekdays; const R = E.yearRange(Number(parts[1]) || Number(E.fiscalYearStart(today(), S().book.fyStart).slice(0, 4)), S().book.fyStart); const ov = {}; Object.entries(S().book.overrides).forEach(([d, v]) => { if (d < R.from || d > R.to) ov[d] = v; }); await api.book.set({ weekdays: pat.slice(), overrides: ov }); S()._pat = null; U().toast(t("m.saved")); return U().refresh(); }
    });
    $$("[data-pat]", main).forEach((c) => (c.onchange = () => { S()._pat = $$("[data-pat]", main).map((x) => x.checked); }));
    $$("[data-f]", main).forEach((el) => {
      const ev = el.type === "search" || el.tagName === "INPUT" ? "input" : "change";
      el.addEventListener(ev, () => {
        S().f[el.dataset.f] = el.dataset.f === "period" && el.value === "all" ? "" : el.value; S()._fopen = true; S()._lim = 200;
        if (el.dataset.f === "period") { S()._txDay = null; if (/^m:\d{4}-\d{2}$/.test(S().f.period || "")) S()._txMonth = S().f.period.slice(2); }
        clearTimeout(S()._q); S()._q = setTimeout(() => U().route().then(() => { const s = $(`[data-f="${el.dataset.f}"]`); if (s && s.tagName === "INPUT") { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }), ev === "input" ? 300 : 0);
      });
    });
    const fd = $("details.filters", main); if (fd) fd.addEventListener("toggle", () => { S()._fopen = fd.open; });
    const dp = $("#dept", main); if (dp) dp.onchange = () => { S()._dept = dp.value; U().route(); };
    const sc = $("#smallCats", main); if (sc) sc.onchange = () => { S()._small = sc.checked; U().route(); };
    const ap = $("#accPeriod", main); if (ap) ap.onchange = () => { S()._accPeriod = ap.value; U().route(); };
    $$("[data-manual]", main).forEach((i) => i.addEventListener("change", async () => { const a = accOf(i.dataset.manual); try { await api.accounts.save(Object.assign({}, a, { manual: i.value })); U().toast(t("m.saved")); } catch (x) { U().toast(U().errMsg(x), true); } U().refresh(); }));
    drawCharts(view);
  }

  GA.acc = { viewClosing, bindClosing, collectForm, viewHome, viewTx, viewAccounts, viewMonth, viewYear, viewCalendar, bind, txForm, destroyCharts, filteredTx };
})();
