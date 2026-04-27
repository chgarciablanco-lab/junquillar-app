/* ============================================================
   JUNQO – FIX REPORTES / BALANCE
   ------------------------------------------------------------
   Objetivo:
   - Mantener el diseño visual actual.
   - No tocar la lógica base de app.js.
   - Hacer funcionar los botones nuevos de Reportes:
     exportToPDF(), exportToExcel() y toggleDetalle().
   - Hacer que la descarga de Balance use el Balance real visible
     en #balance-table, no una tabla simple genérica.
   ============================================================ */
(function () {
  "use strict";

  const BALANCE_TABLE_ID = "balance-table";
  const REPORT_SECTION_ID = "section-reportes";
  const REPORT_EXTRAS_ID = "report-extras";
  const REPORT_EXPORT_ID = "reportes-export";

  function $(id) {
    return document.getElementById(id);
  }

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const parsed = Number(String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCLP(value) {
    try {
      if (typeof formatoCLP === "function") return formatoCLP(value);
    } catch (_) {}
    return toNumber(value).toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    });
  }

  function formatPct(value) {
    try {
      if (typeof formatoPct === "function") return formatoPct(value);
    } catch (_) {}
    return `${Number(value || 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
  }

  function csvEscape(value) {
    const text = cleanText(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadBlob(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function todayStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function safeGetTotals() {
    try {
      if (typeof getTotals === "function") return getTotals();
    } catch (_) {}

    try {
      if (Array.isArray(gastos)) {
        const neto = gastos.reduce((acc, g) => acc + toNumber(g.neto), 0);
        const iva = gastos.reduce((acc, g) => acc + toNumber(g.iva), 0);
        const total = gastos.reduce((acc, g) => acc + toNumber(g.total), 0);
        const docs = gastos.length;
        return { neto, iva, total, docs };
      }
    } catch (_) {}

    return { neto: 0, iva: 0, total: 0, docs: 0 };
  }

  function safeBudget() {
    try {
      if (typeof PROJECT_BUDGET !== "undefined") return toNumber(PROJECT_BUDGET);
    } catch (_) {}
    return 0;
  }

  function readVisibleReportSummary() {
    const rows = [];
    const add = (label, value) => rows.push([label, cleanText(value)]);

    add("Reporte", "Reporte Ejecutivo — Casa Junquillar");
    add("Fecha exportación", new Date().toLocaleString("es-CL"));
    add("Período", $("report-period")?.innerText || "");
    add("Estado", "En ejecución");
    add("Última actualización", $("report-updated")?.innerText || "");
    add("Presupuesto total", $("kpi-presupuesto")?.innerText || "");
    add("Ejecutado neto", $("kpi-ejecutado")?.innerText || "");
    add("Avance financiero", $("kpi-avance")?.innerText || "");
    add("IVA crédito acumulado", $("kpi-iva")?.innerText || "");
    add("Base neta acumulada", $("trib-base-neta")?.innerText || "");
    add("IVA crédito fiscal", $("trib-iva-cf")?.innerText || "");
    add("Documentos con CF", $("trib-docs-cf")?.innerText || "");
    add("Documentos sin CF", $("trib-docs-sin-cf")?.innerText || "");

    return rows;
  }

  function extractHtmlTableRows(tableSelector) {
    const table = document.querySelector(tableSelector);
    if (!table) return [];

    const rows = [];
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((cell) => cleanText(cell.innerText || cell.textContent));
      if (cells.some(Boolean)) rows.push(cells);
    });
    return rows;
  }

  function extractDivTableRows(containerId) {
    const container = $(containerId);
    if (!container) return [];

    const selectors = [
      ".balance-head",
      ".balance-row",
      ".balance-sec",
      ".balance-total",
      ".table-head",
      ".table-row",
      "tr",
    ].join(",");

    const rows = [];
    container.querySelectorAll(selectors).forEach((row) => {
      if (row.matches("tr")) {
        const cells = Array.from(row.querySelectorAll("th,td")).map((cell) => cleanText(cell.innerText || cell.textContent));
        if (cells.some(Boolean)) rows.push(cells);
        return;
      }

      const directChildren = Array.from(row.children);
      const cells = directChildren.length
        ? directChildren.map((child) => cleanText(child.innerText || child.textContent)).filter(Boolean)
        : [cleanText(row.innerText || row.textContent)].filter(Boolean);

      if (cells.length) rows.push(cells);
    });

    if (rows.length) return rows;

    const fallbackText = cleanText(container.innerText || container.textContent);
    if (!fallbackText) return [];
    return fallbackText
      .split(/(?=MOVIMIENTOS|SALDOS|BALANCE|RESULTADOS|ACTIVOS|PASIVOS|TOTAL|Terreno|Obra en Curso|IVA Crédito|Cuenta por pagar|Gastos por pagar|Capital pendiente|Ajuste)/g)
      .map(cleanText)
      .filter(Boolean)
      .map((line) => [line]);
  }

  function getBalanceRowsFromDOM() {
    const rows = extractDivTableRows(BALANCE_TABLE_ID);
    if (rows.length) return rows;

    return [
      ["Balance General — Proyecto Casa Junquillar"],
      ["Sin datos visibles en el módulo Balance"],
    ];
  }

  function getBalanceRowsCalculated() {
    const totals = safeGetTotals();
    const terreno = 100000000;
    const aporteSocio = 60000000;

    const activoTerreno = terreno;
    const activoObra = totals.neto;
    const activoIva = totals.iva;
    const totalActivo = activoTerreno + activoObra + activoIva;

    const pasivoSocio = aporteSocio;
    const pasivoGastos = totals.total;
    const totalPasivo = pasivoSocio + pasivoGastos;
    const diferencia = totalActivo - totalPasivo;

    const rows = [
      ["Balance General — Proyecto Casa Junquillar"],
      ["Fecha exportación", new Date().toLocaleString("es-CL")],
      [],
      ["N°", "Cuenta", "Debe", "Haber", "Deudor", "Acreedor", "Activo", "Pasivo", "Pérdida", "Ganancia"],
      ["ACTIVOS"],
      ["1", "Terreno", formatCLP(activoTerreno), formatCLP(0), formatCLP(activoTerreno), formatCLP(0), formatCLP(activoTerreno), formatCLP(0), formatCLP(0), formatCLP(0)],
      ["2", "Obra en Curso", formatCLP(activoObra), formatCLP(0), formatCLP(activoObra), formatCLP(0), formatCLP(activoObra), formatCLP(0), formatCLP(0), formatCLP(0)],
      ["3", "IVA Crédito Fiscal", formatCLP(activoIva), formatCLP(0), formatCLP(activoIva), formatCLP(0), formatCLP(activoIva), formatCLP(0), formatCLP(0), formatCLP(0)],
      ["PASIVOS"],
      ["4", "Cuenta por pagar al Socio", formatCLP(0), formatCLP(pasivoSocio), formatCLP(0), formatCLP(pasivoSocio), formatCLP(0), formatCLP(pasivoSocio), formatCLP(0), formatCLP(0)],
      ["5", "Gastos por pagar", formatCLP(0), formatCLP(pasivoGastos), formatCLP(0), formatCLP(pasivoGastos), formatCLP(0), formatCLP(pasivoGastos), formatCLP(0), formatCLP(0)],
    ];

    if (diferencia !== 0) {
      rows.push([
        "6",
        diferencia > 0 ? "Capital pendiente" : "Ajuste",
        diferencia > 0 ? formatCLP(diferencia) : formatCLP(0),
        diferencia < 0 ? formatCLP(Math.abs(diferencia)) : formatCLP(0),
        diferencia > 0 ? formatCLP(diferencia) : formatCLP(0),
        diferencia < 0 ? formatCLP(Math.abs(diferencia)) : formatCLP(0),
        formatCLP(0),
        formatCLP(0),
        diferencia < 0 ? formatCLP(Math.abs(diferencia)) : formatCLP(0),
        diferencia > 0 ? formatCLP(diferencia) : formatCLP(0),
      ]);
    }

    rows.push([
      "TOTAL",
      "",
      formatCLP(totalActivo),
      formatCLP(totalPasivo + (diferencia > 0 ? diferencia : 0)),
      formatCLP(totalActivo),
      formatCLP(totalPasivo + (diferencia > 0 ? diferencia : 0)),
      formatCLP(totalActivo),
      formatCLP(totalPasivo),
      formatCLP(0),
      formatCLP(0),
    ]);

    return rows;
  }

  function getBestBalanceRows() {
    const domRows = getBalanceRowsFromDOM();
    const hasRealDomRows = domRows.length > 2 && domRows.some((row) => row.join(" ").includes("Terreno") || row.join(" ").includes("Obra en Curso"));
    return hasRealDomRows ? domRows : getBalanceRowsCalculated();
  }

  function rowsToCSV(rows) {
    return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
  }

  function exportBalanceCSV() {
    const rows = getBestBalanceRows();
    const csv = rowsToCSV(rows);
    downloadBlob(`balance-general-casa-junquillar-${todayStamp()}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportWorkbook() {
    const resumenRows = readVisibleReportSummary();
    const categoriaRows = extractHtmlTableRows(".resumen-categoria-table");
    const balanceRows = getBestBalanceRows();

    if (window.XLSX) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), "Resumen Ejecutivo");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(categoriaRows.length ? categoriaRows : [["Sin datos por categoría"]]), "Resumen Categoría");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balanceRows), "Balance");
      XLSX.writeFile(wb, `reporte-ejecutivo-junquillar-${todayStamp()}.xlsx`);
      return;
    }

    const csv = [
      ...resumenRows,
      [],
      ["Resumen por Categoría"],
      ...(categoriaRows.length ? categoriaRows : [["Sin datos por categoría"]]),
      [],
      ["Balance"],
      ...balanceRows,
    ];

    downloadBlob(`reporte-ejecutivo-junquillar-${todayStamp()}.csv`, rowsToCSV(csv), "text/csv;charset=utf-8");
  }

  function exportReportPDF() {
    const report = $(REPORT_SECTION_ID);
    if (!report) return;

    const printable = report.cloneNode(true);
    const extras = printable.querySelector(`#${REPORT_EXTRAS_ID}`);
    if (extras) extras.style.display = "none";

    const balanceRows = getBestBalanceRows();
    const balanceHtml = `
      <section class="print-balance">
        <h2>Balance General — Proyecto Casa Junquillar</h2>
        <table>
          <tbody>
            ${balanceRows.map((row) => `<tr>${row.map((cell) => `<td>${cleanText(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </section>`;

    const win = window.open("", "_blank");
    if (!win) {
      alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para exportar PDF.");
      return;
    }

    win.document.write(`<!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Reporte Ejecutivo — Casa Junquillar</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;margin:28px;background:#fff;}
          h1,h2,h3{margin:0 0 10px;}
          .card,.kpi-card{border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:12px 0;break-inside:avoid;}
          .kpi-grid,.report-charts-grid,.tributario-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
          .report-header-actions,.report-extras,canvas,.chart-container{display:none!important;}
          table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;}
          th,td{border:1px solid #e2e8f0;padding:7px;text-align:left;vertical-align:top;}
          th{background:#f8fafc;}
          .money{text-align:right;}
          @media print{body{margin:18mm;} .card{box-shadow:none;} }
        </style>
      </head>
      <body>
        ${printable.innerHTML}
        ${balanceHtml}
      </body>
      </html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function toggleReportDetail() {
    const extras = $(REPORT_EXTRAS_ID);
    const btn = $("btn-ver-detalle");
    if (!extras) return;

    const isHidden = extras.style.display === "none" || getComputedStyle(extras).display === "none";
    extras.style.display = isHidden ? "block" : "none";
    if (btn) btn.innerHTML = isHidden ? "👁️ Ocultar detalle" : "👁️ Ver detalle";
  }

  function insertBalanceExportButtons() {
    const exportBox = $(REPORT_EXPORT_ID);
    if (!exportBox || exportBox.dataset.balanceFixReady === "1") return;
    exportBox.dataset.balanceFixReady = "1";

    exportBox.insertAdjacentHTML(
      "afterbegin",
      `<div class="export-btns" style="flex-wrap:wrap;gap:8px">
        <button class="export-btn export-btn-xl" id="btn-export-balance-xlsx" type="button">⬇ Balance Excel</button>
        <button class="export-btn" id="btn-export-balance-csv" type="button">⬇ Balance CSV</button>
      </div>`
    );

    $("btn-export-balance-xlsx")?.addEventListener("click", exportWorkbook);
    $("btn-export-balance-csv")?.addEventListener("click", exportBalanceCSV);
  }

  function interceptOldBalanceButtons() {
    const reportes = $(REPORT_SECTION_ID);
    if (!reportes) return;

    reportes.querySelectorAll("button,a").forEach((btn) => {
      const text = cleanText(btn.innerText || btn.textContent).toLowerCase();
      const id = String(btn.id || "").toLowerCase();
      const data = String(btn.dataset?.report || btn.dataset?.export || "").toLowerCase();
      const isBalance = text.includes("balance") || id.includes("balance") || data.includes("balance");
      if (!isBalance || btn.dataset.balanceFixApplied === "1") return;

      btn.dataset.balanceFixApplied = "1";
      btn.addEventListener(
        "click",
        function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          exportBalanceCSV();
        },
        true
      );
    });
  }

  function hydrateReportHeader() {
    const updated = $("report-updated");
    if (updated && updated.innerText.includes("--")) {
      updated.textContent = `Última actualización: ${new Date().toLocaleString("es-CL")}`;
    }

    const totals = safeGetTotals();
    const budget = safeBudget();
    const avance = budget ? (totals.neto / budget) * 100 : 0;

    if ($("kpi-presupuesto")) $("kpi-presupuesto").textContent = formatCLP(budget);
    if ($("kpi-ejecutado")) $("kpi-ejecutado").textContent = formatCLP(totals.neto);
    if ($("kpi-avance")) $("kpi-avance").textContent = formatPct(avance);
    if ($("kpi-iva")) $("kpi-iva").textContent = formatCLP(totals.iva);
    if ($("kpi-avance-bar")) $("kpi-avance-bar").style.width = `${Math.min(avance, 100)}%`;

    if ($("trib-base-neta")) $("trib-base-neta").textContent = formatCLP(totals.neto);
    if ($("trib-iva-cf")) $("trib-iva-cf").textContent = formatCLP(totals.iva);

    try {
      if (Array.isArray(gastos)) {
        const docsConCF = gastos.filter((g) => toNumber(g.iva) > 0).length;
        const docsSinCF = gastos.length - docsConCF;
        if ($("trib-docs-cf")) $("trib-docs-cf").textContent = String(docsConCF);
        if ($("trib-docs-sin-cf")) $("trib-docs-sin-cf").textContent = String(docsSinCF);
      }
    } catch (_) {}
  }

  function setupFix() {
    window.exportToExcel = exportWorkbook;
    window.exportToPDF = exportReportPDF;
    window.toggleDetalle = toggleReportDetail;
    window.exportBalanceCSV = exportBalanceCSV;
    window.exportarBalanceRealDesdeReportes = exportBalanceCSV;

    hydrateReportHeader();
    insertBalanceExportButtons();
    interceptOldBalanceButtons();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupFix();
    const observer = new MutationObserver(() => setupFix());
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
