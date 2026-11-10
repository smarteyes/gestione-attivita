/* =========================================================
 * MOTORE DI CALCOLO (puro, senza DOM) — stesse formule del file Excel.
 * Usato dal browser (window.GA.engine) e dai test Node (module.exports).
 * Date: stringhe 'YYYY-MM-DD'. Importi: numeri.
 * ========================================================= */
(function (root) {
  const E = {};
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  E.iso = iso; E.parse = parse;
  E.today = () => iso(new Date());
  /* EOMONTH(date, n) */
  E.eomonth = (s, n) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth() + n + 1, 0)); };
  E.addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  /* DateAdd("m") di VBA: se il giorno non esiste nel mese di arrivo, usa l'ultimo giorno */
  E.addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); const t = new Date(d.getFullYear(), d.getMonth() + n, 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(day, last)); return iso(t); };
  E.monthKey = (s) => s.slice(0, 7);
  E.monthStart = (s) => s.slice(0, 8) + "01";
  /* confronto nomi come Excel: senza maiuscole/minuscole e spazi ai bordi */
  E.norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
  const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
  E.num = num;

  /* ---------- Riga: netto / IVA / IVA detraibile ---------- */
  // ctx: { vat: {id:{pct,manual}}, ded: {id:pct} }
  E.calcTx = function (t, ctx) {
    const P = t.paid ? 1 : 0, g = num(t.gross);
    const v = ctx.vat[t.vatId] || { pct: 0, manual: false };
    const base = v.manual ? g - num(t.vatManual) : g / (1 + num(v.pct));
    if (t.type === "in") {
      const net = P * base;
      return { net, vat: (g - net) * P, ded: 0, grossPaid: P * g, vatTheo: g - base };
    }
    const dedPct = num(ctx.ded[t.dedId]);
    const net = base * P;
    return { net, vat: (g - net) * P, ded: (g - net) * dedPct * P, grossPaid: g * P, vatTheo: (g - base) * dedPct };
  };
  E.context = function (s) {
    const vat = {}, ded = {};
    (s.vatRates || []).forEach((r) => { vat[r.id] = { pct: num(r.pct), manual: !!r.manual }; });
    (s.dedRates || []).forEach((r) => { ded[r.id] = num(r.pct); });
    return { vat, ded };
  };
  /* Arricchisce le transazioni con i campi calcolati */
  E.enrich = function (txs, s) { const ctx = E.context(s); return txs.map((t) => Object.assign({}, t, E.calcTx(t, ctx))); };

  const inRange = (d, a, b) => d && d >= a && d <= b;
  const sum = (arr, k) => arr.reduce((x, t) => x + num(t[k]), 0);
  E.sum = sum;
  const byDept = (txs, dept) => (dept ? txs.filter((t) => t.deptId === dept) : txs);

  /* ---------- Giorni lavorativi ---------- */
  // wd: { weekdays:[bool x7, lun..dom], overrides: {'YYYY-MM-DD': 0|1} }
  E.isWorkday = function (s, wd) {
    if (wd && wd.overrides && s in wd.overrides) return !!wd.overrides[s];
    const w = (parse(s).getDay() + 6) % 7; // 0 = lunedì
    const def = (wd && wd.weekdays) || [true, true, true, true, true, false, false];
    return !!def[w];
  };
  E.countWorkdays = function (a, b, wd) { let n = 0; for (let d = a; d <= b; d = E.addDays(d, 1)) if (E.isWorkday(d, wd)) n++; return n; };

  /* ---------- Periodi dei filtri (CALENDARIO_HIDDEN U:W) ---------- */
  E.fiscalYearStart = function (today, startMonth) {
    // anno_attuale = se mese(oggi) >= mese inizio → anno corrente, altrimenti anno precedente
    const d = parse(today); const y = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
    return y + "-" + pad(startMonth) + "-01";
  };
  E.periods = function (today, startMonth, txDates) {
    const fy = E.fiscalYearStart(today, startMonth);
    const P = [
      { key: "today", from: today, to: today },
      { key: "last7", from: E.addDays(today, -7), to: today },
      { key: "last30", from: E.addDays(today, -30), to: today },
      { key: "lastMonth", from: E.addDays(E.eomonth(today, -2), 1), to: E.eomonth(today, -1) },
      { key: "year", from: fy, to: E.eomonth(fy, 11) },
      { key: "all", from: "0000-01-01", to: "9999-12-31" },
    ];
    for (let q = 0; q < 4; q++) { const f = E.addMonths(fy, q * 3); P.push({ key: "q" + (q + 1), from: f, to: E.eomonth(f, 2) }); }
    const months = Array.from(new Set((txDates || []).filter(Boolean).map(E.monthKey))).sort().reverse();
    months.forEach((m) => P.push({ key: "m:" + m, from: m + "-01", to: E.eomonth(m + "-01", 0) }));
    return P;
  };

  /* ---------- Filtri registro (colonna C del foglio) ---------- */
  E.filterTx = function (txs, f, periods) {
    const p = f.period && periods ? periods.find((x) => x.key === f.period) : null;
    const ref = E.norm(f.ref);
    return txs.filter((t) =>
      (!f.type || t.type === f.type) &&
      (!f.paid || (f.paid === "planned" ? !t.paid : !!t.paid)) &&
      (!p || inRange(t.date, p.from, p.to)) &&
      (!f.accountId || t.accountId === f.accountId) &&
      (!f.deptId || t.deptId === f.deptId) &&
      (!f.categoryId || t.categoryId === f.categoryId) &&
      (!ref || E.norm(t.ref) === ref) &&
      (!f.q || [t.desc, t.notes, t.ref].join(" ").toLowerCase().includes(String(f.q).toLowerCase())));
  };
  E.totals = (txs) => ({ gross: sum(txs, "gross"), net: sum(txs, "net"), vat: sum(txs, "vat"), ded: sum(txs, "ded") });

  /* ---------- Ricorrenze (form "Aggiungi ricorrenza") ---------- */
  E.FREQ = ["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual"];
  E.recurrenceDates = function (first, end, freq) {
    const out = []; let cur = first, k = 1; let guard = 0;
    while (cur <= end && guard++ < 2000) {
      out.push(cur);
      if (freq === "weekly") cur = E.addDays(cur, 7);
      else if (freq === "biweekly") cur = E.addDays(cur, 14);
      else { const step = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6 }[freq]; if (!step) break; cur = E.addMonths(first, k * step); k++; }
    }
    return out;
  };

  /* ---------- Saldi conti (GIROCONTI-IVA) ---------- */
  // accounts: [{id,name,kind:'account'|'card',opening,manual}] ; transfers: [{date,from,to,amount}] ('IVA' = erario)
  E.balances = function (accounts, txs, transfers, period) {
    const inP = (d) => !period || inRange(d, period.from, period.to);
    return accounts.map((a) => {
      const tIn = txs.filter((t) => t.type === "in" && t.accountId === a.id);
      const tOut = txs.filter((t) => t.type === "out" && t.accountId === a.id);
      const trTo = transfers.filter((x) => x.to === a.id), trFrom = transfers.filter((x) => x.from === a.id);
      const P = {
        income: sum(tIn.filter((t) => inP(t.date)), "grossPaid"),
        expense: sum(tOut.filter((t) => inP(t.date)), "grossPaid"),
        trIn: sum(trTo.filter((x) => x.from !== "IVA" && inP(x.date)), "amount"),
        trOut: sum(trFrom.filter((x) => x.to !== "IVA" && inP(x.date)), "amount"),
        vatIn: sum(trTo.filter((x) => x.from === "IVA" && inP(x.date)), "amount"),
        vatOut: sum(trFrom.filter((x) => x.to === "IVA" && inP(x.date)), "amount"),
      };
      const all = sum(tIn, "grossPaid") - sum(tOut, "grossPaid") + sum(trTo, "amount") - sum(trFrom, "amount");
      const opening = num(a.opening);
      const balance = a.kind === "card" ? -sum(tIn, "grossPaid") + sum(tOut, "grossPaid") - sum(trTo, "amount") + sum(trFrom, "amount") + opening : all + opening;
      const hasManual = a.manual !== "" && a.manual != null;
      return Object.assign({ id: a.id, name: a.name, kind: a.kind, opening, balance, manual: hasManual ? num(a.manual) : null, check: hasManual ? num(a.manual) - balance : null }, P);
    });
  };
  E.openings = (accounts) => accounts.reduce((s, a) => s + num(a.opening), 0); // SUM(R11:R22)+SUM(X11:X22)

  /* ---------- Dashboard mensile ---------- */
  // opt: { month:'YYYY-MM', dept, today, wd, goals:{'YYYY-MM':n}, accounts }
  E.month = function (txs, opt) {
    const m0 = opt.month + "-01", m1 = E.eomonth(m0, 0), p0 = E.addDays(E.eomonth(m0, -2), 1), p1 = E.eomonth(m0, -1);
    const T = byDept(txs, opt.dept), I = T.filter((t) => t.type === "in"), O = T.filter((t) => t.type === "out");
    const inM = I.filter((t) => inRange(t.date, m0, m1)), outM = O.filter((t) => inRange(t.date, m0, m1));
    const inP = I.filter((t) => inRange(t.date, p0, p1)), outP = O.filter((t) => inRange(t.date, p0, p1));
    const today = opt.today, upto = today >= m1 ? m1 : today;
    const wdElapsed = E.countWorkdays(m0, upto, opt.wd), wdTotal = E.countWorkdays(m0, m1, opt.wd), wdPrev = E.countWorkdays(p0, p1, opt.wd);
    const r = {
      from: m0, to: m1, inNet: sum(inM, "net"), outNet: sum(outM, "net"), inGross: sum(inM, "gross"), outGross: sum(outM, "gross"),
      vatSales: sum(inM, "vat"), vatPurch: sum(outM, "ded"), prevInNet: sum(inP, "net"), prevOutNet: sum(outP, "net"),
      wdElapsed, wdTotal, wdPrev, progress: wdTotal ? wdElapsed / wdTotal : 0,
    };
    r.vatBalance = r.vatSales - r.vatPurch; // >0 da versare, <0 da recuperare
    r.vatSplit = r.vatSales + r.vatPurch ? r.vatSales / (r.vatSales + r.vatPurch) : null;
    r.profit = r.inNet - r.outNet;
    r.goal = num((opt.goals || {})[opt.month]);
    r.goalDiff = r.goal - r.profit; // >0 sotto l'obiettivo
    r.goalPct = r.goal ? Math.max(0, r.profit) / r.goal : 0;
    r.inGrossPaid = sum(inM, "grossPaid"); r.outGrossPaid = sum(outM, "grossPaid");
    r.prevInGross = sum(inP, "grossPaid"); r.prevOutGross = sum(outP, "grossPaid");
    r.profitGross = r.inGrossPaid - r.outGrossPaid;
    const daily = (v, n) => (n ? v / n : null);
    r.inDaily = daily(r.inNet, wdElapsed); r.outDaily = daily(r.outNet, wdElapsed);
    r.inDailyPrev = daily(r.prevInNet, wdPrev); r.outDailyPrev = daily(r.prevOutNet, wdPrev);
    r.inRatio = r.inDaily != null && r.inDailyPrev ? r.inDaily / r.inDailyPrev : null;
    r.outRatio = r.outDaily != null && r.outDailyPrev ? r.outDaily / r.outDailyPrev : null;
    r.inDailyGross = daily(r.inGrossPaid, wdElapsed); r.outDailyGross = daily(r.outGrossPaid, wdElapsed);
    r.inDailyPrevGross = daily(r.prevInGross, wdPrev); r.outDailyPrevGross = daily(r.prevOutGross, wdPrev);
    r.inRatioGross = r.inDailyGross != null && r.inDailyPrevGross ? r.inDailyGross / r.inDailyPrevGross : null;
    r.outRatioGross = r.outDailyGross != null && r.outDailyPrevGross ? r.outDailyGross / r.outDailyPrevGross : null;
    // Stima liquidità: lordi (anche pianificati) fino a fine mese + saldi iniziali
    r.liquidity = sum(I.filter((t) => t.date <= m1), "gross") - sum(O.filter((t) => t.date <= m1), "gross") + E.openings(opt.accounts || []);
    r.liquidityStart = sum(I.filter((t) => t.date < m0), "gross") - sum(O.filter((t) => t.date < m0), "gross") + E.openings(opt.accounts || []);
    // Breakeven giornaliero: spese nette + spese pianificate (lordo - IVA teorica) / giorni lavorativi trascorsi
    const planned = outM.filter((t) => !t.paid);
    r.breakeven = wdElapsed ? (r.outNet + sum(planned, "gross") - sum(planned, "vatTheo")) / wdElapsed : 0;
    r.goalDaily = wdElapsed ? r.goal / wdElapsed : 0;
    r.days = [];
    for (let d = m0; d <= m1; d = E.addDays(d, 1)) {
      const a = sum(inM.filter((t) => t.date === d), "net"), b = sum(outM.filter((t) => t.date === d), "net");
      const ag = sum(inM.filter((t) => t.date === d), "grossPaid"), bg = sum(outM.filter((t) => t.date === d), "grossPaid");
      r.days.push({ date: d, inNet: a, outNet: b, profit: a - b, inGross: ag, outGross: bg, profitGross: ag - bg, workday: E.isWorkday(d, opt.wd) });
    }
    r.scheduledMonth = O.filter((t) => !t.paid && inRange(t.date, m0, m1)).sort((a, b) => a.date.localeCompare(b.date));
    r.scheduledAll = O.filter((t) => !t.paid).sort((a, b) => a.date.localeCompare(b.date));
    r._inM = inM; r._outM = outM; r._inP = inP; r._outP = outP;
    return r;
  };
  /* Tabelle per categoria/conto: lordo, IVA, netto, %, periodo precedente */
  E.breakdown = function (cur, prev, key, kind) {
    const g = {};
    const add = (t, isPrev) => { const k = t[key] || ""; const o = (g[k] = g[k] || { key: k, gross: 0, vat: 0, net: 0, prev: 0 }); if (isPrev) o.prev += num(t.net); else { o.gross += num(t.grossPaid); o.vat += num(kind === "out" ? t.ded : t.vat); o.net += num(t.net); } };
    cur.forEach((t) => add(t, false)); prev.forEach((t) => add(t, true));
    const rows = Object.values(g).filter((r) => r.net || r.prev || r.gross); const tot = rows.reduce((s, r) => s + r.net, 0);
    rows.forEach((r) => { r.pct = tot ? r.net / tot : 0; });
    return rows.sort((a, b) => b.net - a.net);
  };

  /* ---------- Dashboard annuale ---------- */
  // opt: { year, startMonth, dept, today, wd, goals, prevYearIn, prevYearOut, accounts, transfers }
  E.yearRange = (year, startMonth) => { const a = year + "-" + pad(startMonth) + "-01"; return { from: a, to: E.eomonth(a, 11) }; };
  E.year = function (txs, opt) {
    const R = E.yearRange(opt.year, opt.startMonth), PR = E.yearRange(opt.year - 1, opt.startMonth);
    const T = byDept(txs, opt.dept), I = T.filter((t) => t.type === "in"), O = T.filter((t) => t.type === "out");
    const inY = I.filter((t) => inRange(t.date, R.from, R.to)), outY = O.filter((t) => inRange(t.date, R.from, R.to));
    const inPY = I.filter((t) => inRange(t.date, PR.from, PR.to)), outPY = O.filter((t) => inRange(t.date, PR.from, PR.to));
    const upto = opt.today >= R.to ? R.to : opt.today;
    const wdElapsed = E.countWorkdays(R.from, upto, opt.wd), wdTotal = E.countWorkdays(R.from, R.to, opt.wd), wdPrev = E.countWorkdays(PR.from, PR.to, opt.wd);
    const r = { from: R.from, to: R.to, inNet: sum(inY, "net"), outNet: sum(outY, "net"), vatSales: sum(inY, "vat"), vatPurch: sum(outY, "ded"), prevInNet: sum(inPY, "net"), prevOutNet: sum(outPY, "net"), wdElapsed, wdTotal, progress: wdTotal ? wdElapsed / wdTotal : 0 };
    r.vatBalance = r.vatSales - r.vatPurch; r.profit = r.inNet - r.outNet;
    r.vatSplit = r.vatSales + r.vatPurch ? r.vatSales / (r.vatSales + r.vatPurch) : null;
    // obiettivo annuale = somma obiettivi dei 12 mesi
    r.months = [];
    for (let i = 0; i < 12; i++) {
      const a = E.addMonths(R.from, i), b = E.eomonth(a, 0), k = E.monthKey(a);
      const iN = sum(inY.filter((t) => inRange(t.date, a, b)), "net"), oN = sum(outY.filter((t) => inRange(t.date, a, b)), "net");
      r.months.push({ month: k, inNet: iN, outNet: oN, profit: iN - oN, goal: num((opt.goals || {})[k]), inGross: sum(inY.filter((t) => inRange(t.date, a, b)), "gross"), outGross: sum(outY.filter((t) => inRange(t.date, a, b)), "gross"), vatSales: sum(inY.filter((t) => inRange(t.date, a, b)), "vat"), vatPurch: sum(outY.filter((t) => inRange(t.date, a, b)), "ded"), liquidity: sum(I.filter((t) => t.date <= b), "gross") - sum(O.filter((t) => t.date <= b), "gross") + E.openings(opt.accounts || []) });
    }
    r.goal = r.months.reduce((s, m) => s + m.goal, 0);
    r.goalDiff = r.goal - r.profit; r.goalPct = r.goal ? Math.max(0, r.profit) / r.goal : 0;
    // confronto con anno precedente: se non ci sono dati, usa i totali "anno precedente" delle impostazioni
    const prevIn = r.prevInNet || num(opt.prevYearIn), prevOut = r.prevOutNet || num(opt.prevYearOut);
    const prevWd = r.prevInNet ? wdPrev : wdTotal;
    r.prevInUsed = prevIn; r.prevOutUsed = prevOut;
    r.inRatio = wdElapsed && prevIn ? (r.inNet / wdElapsed) / (prevIn / (r.prevInNet ? wdPrev : wdTotal)) : null;
    r.outRatio = wdElapsed && prevOut ? (r.outNet / wdElapsed) / (prevOut / (r.prevOutNet ? wdPrev : wdTotal)) : null;
    void prevWd;
    // medie: mesi trascorsi = MIN(12, (anno oggi - anno inizio)*12 + mese oggi - mese inizio)
    const td = parse(opt.today), fs = parse(R.from);
    const mElapsed = Math.min(12, (td.getFullYear() - fs.getFullYear()) * 12 + td.getMonth() - fs.getMonth());
    r.monthsElapsed = mElapsed;
    const avg = (v) => ({ monthly: mElapsed > 0 ? v / mElapsed : null, daily: wdElapsed ? v / wdElapsed : null });
    r.avgIn = avg(r.inNet); r.avgOut = avg(r.outNet); r.avgVat = avg(r.vatBalance); r.avgProfit = avg(r.profit);
    const pm = r.months.map((m) => m.profit); const mx = Math.max(...pm), mn = Math.min(...pm);
    r.best = r.months[pm.indexOf(mx)]; r.worst = r.months[pm.indexOf(mn)];
    r._inY = inY; r._outY = outY; r._inPY = inPY; r._outPY = outPY;
    return r;
  };

  /* ---------- Patrimonio (PATRIMONIO_HIDDEN): saldo cumulato giornaliero ---------- */
  E.patrimony = function (txs, transfers, accounts, from, to) {
    const start = accounts.filter((a) => a.kind !== "card").reduce((s, a) => s + num(a.opening), 0) - accounts.filter((a) => a.kind === "card").reduce((s, a) => s + num(a.opening), 0);
    const delta = {};
    const add = (d, v) => { delta[d] = (delta[d] || 0) + v; };
    txs.forEach((t) => { if (t.date) add(t.date, t.type === "in" ? num(t.grossPaid) : -num(t.grossPaid)); });
    transfers.forEach((x) => { if (x.from === "IVA") add(x.date, num(x.amount)); if (x.to === "IVA") add(x.date, -num(x.amount)); });
    let bal = start; Object.keys(delta).filter((d) => d < from).forEach((d) => { bal += delta[d]; });
    const out = [];
    for (let d = from; d <= to; d = E.addDays(d, 1)) { bal += delta[d] || 0; out.push({ date: d, balance: bal }); }
    return out;
  };

  /* ---------- Calendario: valori per giorno ---------- */
  E.calendarDay = function (txs, d) {
    const day = txs.filter((t) => t.date === d);
    const I = day.filter((t) => t.type === "in"), O = day.filter((t) => t.type === "out");
    return { inNet: sum(I, "net"), outNet: sum(O, "net"), scheduled: sum(I.filter((t) => !t.paid), "gross") - sum(O.filter((t) => !t.paid), "gross") };
  };


  /* ---------- Fatture da pagare ---------- */
  E.invoiceRemaining = function (inv) {
    const rem = Math.round((num(inv && inv.gross) - num(inv && inv.paidAmount)) * 100) / 100;
    return rem > 0 ? rem : 0;
  };
  E.invoiceDueState = function (inv, today) {
    if (!inv) return "open";
    if (inv.status === "paid" || E.invoiceRemaining(inv) <= 0.004) return "paid";
    const due = inv.dueDate || "";
    if (due && today && due < today) return "overdue";
    if (due && today && due <= E.addDays(today, 7)) return "soon";
    return "open";
  };
  E.invoiceTotals = function (list, today) {
    const rows = list || [];
    let toPay = 0, overdue = 0, nOverdue = 0, nOpen = 0, nSoon = 0;
    rows.forEach((inv) => {
      const st = E.invoiceDueState(inv, today);
      if (st === "paid") return;
      const rem = E.invoiceRemaining(inv);
      nOpen++; toPay += rem;
      if (st === "overdue") { nOverdue++; overdue += rem; }
      if (st === "soon") nSoon++;
    });
    return { toPay: Math.round(toPay * 100) / 100, overdue: Math.round(overdue * 100) / 100, nOverdue, nOpen, nSoon };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = E;
  else { root.GA = root.GA || {}; root.GA.engine = E; }
})(typeof window !== "undefined" ? window : globalThis);
