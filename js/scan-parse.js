/* Lettura "intelligente" del testo di scontrini e fatture italiane (anche EN/ZH di base).
   Funzione pura: riceve il testo (OCR o PDF) e restituisce i campi con un grado di fiducia 0..1.
   Funziona sia nel browser (GA.scanParse) sia in Node (require) per i test. */
(function (root) {
  "use strict";
  const RATES = [4, 5, 10, 22]; // aliquote IVA italiane
  const MONTHS = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
    jan: 1, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, dec: 12 };
  const r2 = (v) => Math.round(v * 100) / 100;
  const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.011 : tol);
  const pad = (n) => String(n).padStart(2, "0");

  /* correzioni tipiche dell'OCR dentro i numeri: O→0, l/I→1, S→5, B→8 */
  function fixDigits(s) {
    return s.replace(/[0-9OoIl|SB]+(?:\s?[,.]\s?[0-9OoIl|SB]{2})?/g, (tok) => {
      if ((tok.match(/\d/g) || []).length < 1 || !/[\d][,.]|[,.][\d]|\d{2}/.test(tok)) return tok;
      return tok.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
    });
  }
  const DATE_RX = [
    /(?<!\d)(\d{1,2})\s?[\/\-.]\s?(\d{1,2})\s?[\/\-.]\s?(\d{4}|\d{2})(?!\d)/g,
    /(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g,
  ];
  const stripDatesTimes = (s) => s.replace(DATE_RX[0], " ").replace(DATE_RX[1], " ").replace(/\b\d{1,2}[:.]\d{2}(?::\d{2})?\b(?=\s|$)(?![,.]\d)/g, (m, o, str) => (/[:]/.test(m) ? " " : m));

  /* importi con due decimali, separatore delle migliaia opzionale (1.234,56 / 1 234,56 / 1234.56) */
  function amounts(line) {
    const s = stripDatesTimes(line).replace(/(\d)\s?%/g, "$1% ");
    const out = []; const rx = /(?<![\d.,])(-?)(\d{1,3}(?:[.' ]\d{3})+|\d+)\s?[,.]\s?(\d{2})(?![\d%])/g; let m;
    while ((m = rx.exec(s))) {
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 2);
      if (/^\s?%/.test(after)) continue;
      const v = parseInt(m[2].replace(/[.' ]/g, ""), 10) + parseInt(m[3], 10) / 100;
      out.push(m[1] ? -v : v);
    }
    return out;
  }
  function ratesIn(line) {
    const out = []; const rx = /(?<![\d,.])(\d{1,2})(?:[,.]0{1,2})?\s?%/g; let m;
    while ((m = rx.exec(line))) { const r = +m[1]; if (RATES.includes(r)) out.push(r); }
    return out;
  }

  function findDate(lines) {
    const c = [];
    lines.forEach((l, i) => {
      const low = l.toLowerCase(); const kw = /\bdata\b|\bdel\b|\bdate\b|日期|emess/.test(low) ? 2 : 0; const bad = /scaden|valid|nato|nascita|entro/.test(low) ? -3 : 0;
      const push = (y, mo, d) => {
        if (y < 100) y += 2000; if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
        c.push({ v: `${y}-${pad(mo)}-${pad(d)}`, s: 1 + kw + bad, i });
      };
      let m; const a = new RegExp(DATE_RX[0].source, "g"), b = new RegExp(DATE_RX[1].source, "g");
      while ((m = a.exec(l))) push(+m[3], +m[2], +m[1]);
      while ((m = b.exec(l))) push(+m[1], +m[2], +m[3]);
      const mt = /(?<!\d)(\d{1,2})\s+([a-zà]{3})[a-zà]*\.?\s+(\d{4})/i.exec(l); if (mt && MONTHS[mt[2].toLowerCase()]) push(+mt[3], MONTHS[mt[2].toLowerCase()], +mt[1]);
      const zh = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(l); if (zh) push(+zh[1], +zh[2], +zh[3]);
    });
    if (!c.length) return { value: null, conf: 0 };
    c.sort((x, y) => y.s - x.s || x.i - y.i); const best = c[0];
    const uniq = new Set(c.map((x) => x.v)).size === 1;
    return { value: best.v, conf: best.s >= 3 || uniq ? 0.9 : best.s >= 1 ? 0.65 : 0.4 };
  }

  const EXCL_TOT = /sub\s*-?\s*tot|imponib|totale\s+(?:iva|imposta)|tot\.?\s*iva|di\s+cui|sconto|resto|abbuono|non\s+riscosso|tot\.?\s*pezzi|n\.?\s*pezzi|articoli|resto/;
  function totalScore(low) {
    if (EXCL_TOT.test(low)) return 0;
    if (/totale\s*(?:complessivo|documento|fattura|generale|a\s+pagare|da\s+pagare|euro|eur\b|€)|netto\s+a\s+pagare|importo\s+(?:totale|pagato|dovuto)|totale\s+dovuto|应付|实付|合计|总计/.test(low)) return 3;
    if (/\btotale\b|\btotal\b|\btot\b\.?/.test(low)) return 2.5;
    if (/da\s+pagare|\bimporto\b|\bpagato\b|\bamount\b/.test(low)) return 1.5;
    return 0;
  }
  function findTotal(lines) {
    const c = [];
    lines.forEach((l, i) => {
      const low = l.toLowerCase(); const s = totalScore(low); if (!s) return;
      let a = amounts(l), adj = 0;
      if (!a.length && lines[i + 1] != null && !totalScore(lines[i + 1].toLowerCase()) && !EXCL_TOT.test(lines[i + 1].toLowerCase())) { a = amounts(lines[i + 1]); adj = 1; }
      if (!a.length && lines[i - 1] != null && !EXCL_TOT.test(lines[i - 1].toLowerCase())) { a = amounts(lines[i - 1]); adj = 1; }
      if (a.length) c.push({ v: a[a.length - 1], s: s - adj * 0.5, adj, i });
    });
    if (!c.length) {
      const all = lines.flatMap((l) => (EXCL_TOT.test(l.toLowerCase()) ? [] : amounts(l))).filter((v) => v > 0);
      return all.length ? { value: Math.max(...all), conf: 0.3 } : { value: null, conf: 0 };
    }
    c.sort((x, y) => y.s - x.s || y.v - x.v); const b = c[0];
    const agree = c.filter((x) => near(x.v, b.v)).length > 1;
    let conf = b.s >= 3 ? 0.88 : b.s >= 2.5 ? 0.82 : b.s >= 2 ? 0.7 : 0.55; if (agree) conf += 0.07;
    return { value: b.v, conf: Math.min(conf, 0.97), alts: c };
  }

  function findVat(lines, total) {
    const rows = {}; let explicit = null, explicitConf = 0; const rates = new Set();
    lines.forEach((l, i) => {
      const low = l.toLowerCase(); if (/sconto/.test(low)) return;
      const rs = ratesIn(l); rs.forEach((r) => rates.add(r));
      const a = amounts(l).filter((v) => v >= 0);
      // riga di riepilogo: aliquota + imponibile + imposta
      if (rs.length === 1 && a.length >= 2) {
        const r = rs[0];
        for (let k = 0; k < a.length - 1; k++) {
          if (near(r2(a[k] * r / 100), a[k + 1], 0.02 + a[k] * 0.0005)) { rows[r] = { rate: r, base: a[k], vat: a[k + 1] }; return; }
        }
      }
      if (/totale\s+(?:iva|imposta)|tot\.?\s*iva|di\s+cui\s+iva|iva\s+total|totale\s+imposte|税额|tax\b|vat\s+total/.test(low) && a.length) {
        explicit = a[a.length - 1]; explicitConf = 0.88; return;
      }
      if (/^\s*(?:iva|imposta)\b/.test(low) && rs.length === 1 && a.length === 1) { rows[rs[0]] = Object.assign(rows[rs[0]] || { rate: rs[0] }, { vat: a[0] }); return; }
      if (/imponibile/.test(low) && rs.length === 1 && a.length) { rows[rs[0]] = Object.assign(rows[rs[0]] || { rate: rs[0] }, { base: a[a.length - 1] }); }
      // "di cui IVA" sulla riga dopo l'importo (foto storte)
      if (/di\s+cui\s+iva|^\s*iva\s*$/.test(low) && !a.length && lines[i + 1]) { const n = amounts(lines[i + 1]); if (n.length === 1 && (!total || n[0] < total)) { explicit = n[0]; explicitConf = 0.7; } }
    });
    const list = Object.values(rows).filter((r) => r.vat != null || r.base != null);
    list.forEach((r) => { if (r.vat == null && r.base != null) r.vat = r2(r.base * r.rate / 100); });
    const sumRows = list.length ? r2(list.reduce((s, r) => s + (r.vat || 0), 0)) : null;
    let value = explicit != null ? explicit : sumRows, conf = explicit != null ? explicitConf : sumRows != null ? 0.8 : 0;
    if (explicit != null && sumRows != null && near(explicit, sumRows, 0.02)) conf = 0.95;
    const rl = [...rates].sort((a, b) => a - b);
    if (value != null && total && value >= total) { value = null; conf = 0; }
    if (value != null && total && rl.length === 1) { const exp = r2(total - total / (1 + rl[0] / 100)); conf = near(exp, value, 0.03) ? Math.max(conf, 0.95) : Math.min(conf, 0.6); }
    if (value == null && total && rl.length === 1) { value = r2(total - total / (1 + rl[0] / 100)); conf = 0.55; }
    if (value != null && total && !rl.length) { // nessuna aliquota letta: la ricavo dal rapporto IVA/imponibile
      const r = RATES.find((x) => near(r2(total - total / (1 + x / 100)), value, 0.03)); if (r) rl.push(r);
    }
    return { vat: { value, conf }, rates: { value: rl, conf: rl.length ? (list.length || rl.length === 1 ? 0.85 : 0.7) : 0 }, rows: list };
  }

  const LEGAL = /\b(?:s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?c\.?\s?a\.?\s?r\.?\s?l\.?|soc\.?\s+coop|società|ditta|f\.?\s?lli|&\s?c\.?|ltd|gmbh|有限公司|公司)(?=\W|$)/i;
  const NOT_NAME = /\bvia\b|viale|piazza|p\.?zza|corso|c\.so|strada|vicolo|largo|loc\.|p\.?\s?iva|partita|c\.?\s?f\.?\b|cod\.?\s?fisc|\btel\b|\bfax\b|cell|www|http|@|\b\d{5}\b|documento|scontrino|fattura|ricevuta|benvenut|grazie|cassa|operatore|rt\s|matricola|telefono|email|e-mail|pec\b|iban|^\W*$/i;
  function findSupplier(lines) {
    const lab = lines.findIndex((l) => /ragione\s+sociale|fornitore|cedente|prestatore|venditore|emittente/i.test(l));
    if (lab >= 0) {
      const after = lines[lab].split(/[:\-–]/).slice(1).join(" ").trim();
      const v = after.replace(/ragione\s+sociale|cedente\s*\/?\s*prestatore/ig, "").trim() || (lines[lab + 1] || "").trim();
      if (/[a-z]{3}/i.test(v) && !NOT_NAME.test(v)) return { value: clean(v), conf: 0.85 };
    }
    let stop = lines.findIndex((l) => /spett|destinatar|\bcliente\b|intestat|committente|cessionario|documento\s+commerciale|fattura\s*n/i.test(l));
    if (stop < 0 || stop > 10) stop = Math.min(lines.length, 8);
    const c = [];
    for (let i = 0, rank = 0; i < stop; i++) {
      const l = lines[i].trim(); const letters = (l.match(/[A-Za-zÀ-ÿ\u4e00-\u9fff]/g) || []).length;
      if (letters < 3 || NOT_NAME.test(l) || (l.match(/\d/g) || []).length > letters) continue;
      let s = 3 - rank * 0.8; if (LEGAL.test(l)) s += 2; if (/^di\s/i.test(l)) s -= 3; if (l === l.toUpperCase() && /[A-Z]/.test(l)) s += 0.5;
      if (letters < 5) s -= 1; c.push({ v: clean(l), s, legal: LEGAL.test(l) }); rank++;
    }
    if (!c.length) return { value: null, conf: 0 };
    c.sort((a, b) => b.s - a.s); return { value: c[0].v, conf: c[0].legal ? 0.85 : 0.6 };
  }
  function clean(s) { return s.replace(/^[^\wÀ-ÿ\u4e00-\u9fff&]+|[^\wÀ-ÿ\u4e00-\u9fff.)&]+$/g, "").replace(/\s{2,}/g, " ").trim(); }

  function pivaOk(p) {
    if (!/^\d{11}$/.test(p) || /^0+$/.test(p)) return false; let s = 0;
    for (let i = 0; i < 10; i++) { let d = +p[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
    return (10 - (s % 10)) % 10 === +p[10];
  }
  function findPiva(lines) {
    const c = [];
    lines.forEach((l, i) => {
      const rx = /(?:p\.?\s?\.?\s?i(?:va)?|partita\s+i\.?v\.?a\.?|vat(?:\s*(?:no|n|number|reg))?|c\.?\s?f\.?\s*(?:e|\/)?\s*p\.?\s?iva|cod(?:ice)?\.?\s*fisc(?:ale)?)\s*[:.\-n°]*\s*(?:IT\s*)?([0-9OoIl ]{11,15})/ig; let m;
      while ((m = rx.exec(l))) { const d = m[1].replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/\s/g, "").slice(0, 11); if (/^\d{11}$/.test(d)) c.push({ v: d, ok: pivaOk(d), i }); }
      const bare = /(?<!\d)(?:IT)?(\d{11})(?!\d)/g; while ((m = bare.exec(l))) if (pivaOk(m[1]) && !c.some((x) => x.v === m[1])) c.push({ v: m[1], ok: true, i, bare: 1 });
    });
    if (!c.length) return { value: null, conf: 0 };
    const good = c.filter((x) => x.ok && !x.bare)[0] || c.filter((x) => x.ok)[0];
    return good ? { value: good.v, conf: good.bare ? 0.7 : 0.95 } : { value: c[0].v, conf: 0.35 };
  }

  function findNumber(lines) {
    const rxs = [
      [/fattura(?:\s+(?:accompagnatoria|differita|immediata|elettronica))?\s*(?:n(?:r|um(?:ero)?)?\s?[.°º:]?|°|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-.]*)/i, 0.85],
      [/(?:n(?:r|um(?:ero)?)?\.?\s*(?:fattura|documento|doc\.?))\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-.]*)/i, 0.85],
      [/(?:doc(?:umento)?|scontrino|ricevuta)\s*\.?\s*(?:n(?:r|um(?:ero)?)?\s?[.°º:]?|°|#)\s*[:.]?\s*(\d[\dA-Z\/\-]*)/i, 0.8],
      [/(?:invoice|receipt)\s*(?:no\.?|n\.?|#|number)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-.]*)/i, 0.8],
      [/发票号码?\s*[:：]?\s*([A-Z0-9\-]+)/, 0.8],
      [/(?:^|\s)(?:n\.|nr\.?|num\.?|no\.)\s*([0-9][0-9A-Z\/\-]{1,})/i, 0.5],
    ];
    for (const [rx, conf] of rxs) for (const l of lines) {
      const m = rx.exec(l); if (!m) continue; const v = m[1].replace(/[.\-\/]+$/, "");
      if (!/\d/.test(v) || /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.test(v) || /p\.?\s?iva/i.test(l.slice(0, m.index + 5))) continue;
      return { value: v, conf };
    }
    return { value: null, conf: 0 };
  }

  function findPayment(lines) {
    const t = lines.join("\n").toLowerCase(); const hit = [];
    const add = (k, rx) => { const m = rx.exec(t); if (m) hit.push({ k, i: m.index }); };
    add("card", /pagamento\s+elettronico|carta\s+(?:di\s+)?(?:credito|debito)|\bcarta\b|bancomat|\bpos\b|visa|mastercard|maestro|contactless|american\s+express|amex|satispay|pagobancomat|刷卡|银行卡|信用卡/);
    add("cash", /contant[ei]|\bcash\b|现金/);
    add("transfer", /bonifico|\briba\b|ri\.ba|\bsdd\b|rid\b/);
    add("other", /支付宝|微信|alipay|wechat|paypal/);
    if (!hit.length) return { value: null, conf: 0 };
    hit.sort((a, b) => b.i - a.i); // la menzione più in basso è di solito il pagamento effettivo
    return { value: hit[0].k, conf: hit.length === 1 ? 0.85 : 0.6 };
  }

  function parse(text) {
    const raw = String(text || "").replace(/\r/g, "").replace(/[€]/g, " € ").replace(/[ \t]+/g, " ");
    const lines = raw.split("\n").map((l) => fixDigits(l.trim())).filter((l) => l.length);
    const total = findTotal(lines); const v = findVat(lines, total.value);
    const f = {
      date: findDate(lines), total: { value: total.value, conf: total.conf }, vat: v.vat, rates: v.rates,
      supplier: findSupplier(lines), piva: findPiva(lines), number: findNumber(lines), payment: findPayment(lines),
      kind: { value: /fattura|invoice|发票/i.test(raw) ? "invoice" : "receipt", conf: 0.8 },
    };
    // controllo incrociato: imponibile + IVA = totale
    if (v.rows.length && f.total.value != null) {
      const base = v.rows.reduce((s, r) => s + (r.base || 0), 0);
      if (base && near(r2(base + (f.vat.value || 0)), f.total.value, 0.03)) { f.total.conf = Math.max(f.total.conf, 0.97); f.vat.conf = Math.max(f.vat.conf, 0.95); }
    }
    return { fields: f, rows: v.rows, lines };
  }

  const api = { parse, amounts, pivaOk, RATES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.GA = root.GA || {}; root.GA.scanParse = api; }
})(typeof window !== "undefined" ? window : globalThis);
