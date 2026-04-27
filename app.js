/* ============================================================
   JUNQO — Fix definitivo Reportes + Balance
   ------------------------------------------------------------
   Cargar DESPUÉS de app.js:
   <script src="reportes-balance-fix.js"></script>

   Qué corrige:
   1) Define exportToPDF(), exportToExcel() y toggleDetalle().
   2) Actualiza la vista ejecutiva de Reportes con datos reales.
   3) Exporta el Balance real desde #balance-table, no una tabla simple.
   4) No modifica diseño, sidebar, etiquetas ni estilos base.
   ============================================================ */

(function () {
  "use strict";

  const CATEGORIAS = ["Materiales", "Mano de obra", "Servicios", "Herramientas", "Transporte"];

  function $(id) {
    return document.getElementById(id);
  }

  function texto(el) {
    return String(el?.innerText || el?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeGlobal(name, fallback) {
    try {
      // Permite leer variables globales declaradas con let/const en app.js
      // sin exigir que estén colgadas en window.
      const value = window.eval(name);
      return value === undefined ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function num(v) {
    if (typeof window.numberValue === "function") return window.numberValue(v);
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function clp(v) {
    try {
      const f = safeGlobal("formatoCLP", null);
      if (typeof f === "function") return f(v);
    } catch (_) {}
    return num(v).toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0
    });
  }

  function pct(v) {
    const n = Number(v || 0);
    return `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
  }

  function csvEscape(value) {
    const v = String(value ?? "").replace(/\r?\n/g, " ").trim();
    return `"${v.replace(/"/g, '""')}"`;
  }

  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getGastos() {
    const g = safeGlobal("gastos", []);
    return Array.isArray(g) ? g : [];
  }

  function getBudget() {
    return num(safeGlobal("PROJECT_BUDGET", 0));
  }

  function getTotalsLocal(rows = getGastos()) {
    return {
      neto: rows.reduce((a, r) => a + num(r.neto), 0),
      iva: rows.reduce((a, r) => a + num(r.iva), 0),
      total: rows.reduce((a, r) => a + num(r.total), 0),
      docs: rows.length,
      docsConCF: rows.filter(r => num(r.iva) > 0).length,
      docsSinCF: rows.filter(r => num(r.iva) <= 0).length
    };
  }

  function mesLabelLocal(fecha) {
    if (!fecha) return "Sin fecha";
    const s = String(fecha).slice(0, 10);
    const match = s.match(/^(\d{4})-(\d{2})/);
    if (!match) return "Sin fecha";
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${meses[Number(match[2]) - 1] || match[2]} ${match[1]}`;
  }

  function groupBy(rows, fn) {
    return rows.reduce((acc, row) => {
      const key = fn(row) || "Sin clasificar";
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function getCategoriaBudget(cat, presupuestoTotal) {
    const map = {
      "Materiales": 0.42,
      "Mano de obra": 0.32,
      "Servicios": 0.10,
      "Herramientas": 0.08,
      "Transporte": 0.08
    };
    return presupuestoTotal * (map[cat] || 0);
  }

  function actualizarVistaReportes() {
    const rows = getGastos();
    const budget = getBudget();
    const totals = getTotalsLocal(rows);
    const avance = budget ? (totals.neto / budget) * 100 : 0;

    // KPIs principales
    setText("kpi-presupuesto", clp(budget));
    setText("kpi-ejecutado", clp(totals.neto));
    setText("kpi-avance", pct(avance));
    setText("kpi-iva", clp(totals.iva));

    const bar = $("kpi-avance-bar");
    if (bar) bar.style.width = `${Math.min(Math.max(avance, 0), 100)}%`;

    const updated = $("report-updated");
    if (updated) updated.textContent = `Última actualización: ${new Date().toLocaleString("es-CL")}`;

    const period = $("report-period");
    if (period && !period.textContent.trim()) {
      period.textContent = new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    }

    // Diagnóstico
    const diag = $("diagnostico-text");
    if (diag) {
      const topCat = getTopCategoria(rows);
      const estado = avance >= 100
        ? "El proyecto presenta ejecución completa o sobre el presupuesto referencial."
        : avance >= 75
          ? "El proyecto presenta un avance financiero alto y requiere control fino de desviaciones."
          : avance > 0
            ? "El proyecto mantiene un avance financiero controlado según los datos disponibles."
            : "El proyecto aún no registra ejecución financiera suficiente para un diagnóstico completo.";

      diag.textContent = `${estado} La mayor concentración de gasto está en ${topCat || "las categorías registradas"}. El IVA crédito fiscal acumulado asciende a ${clp(totals.iva)} y debe mantenerse separado para revisión tributaria.`;
    }

    // Alertas
    const alertas = $("alertas-list");
    if (alertas) {
      const items = [];
      if (!rows.length) {
        items.push(["info", "Sin datos suficientes para generar alertas."]);
      } else {
        if (avance > 100) items.push(["warn", "El ejecutado neto supera el presupuesto referencial."]);
        else items.push(["ok", "Sin sobrecostos críticos contra el presupuesto total."]);

        const desviadas = getCategoriasDesviadas(rows, budget);
        if (desviadas.length) items.push(["warn", `${desviadas.length} partida(s) con desviación moderada.`]);
        else items.push(["ok", "Partidas dentro del rango esperado."]);

        if (totals.docsSinCF > 0) items.push(["info", `${totals.docsSinCF} documento(s) sin crédito fiscal registrado.`]);
        else items.push(["ok", "Documentación tributaria con crédito fiscal al día."]);
      }

      alertas.innerHTML = items.map(([type, label]) => {
        const cls = type === "warn" ? "alerta-warning" : type === "ok" ? "alerta-success" : "alerta-info";
        const icon = type === "warn" ? "⚠️" : type === "ok" ? "✅" : "ℹ️";
        return `<div class="alerta-item ${cls}">${icon} ${label}</div>`;
      }).join("");
    }

    // Tabla Resumen por Categoría
    renderResumenCategoria(rows, budget);

    // Resumen tributario
    setText("trib-base-neta", clp(totals.neto));
    setText("trib-iva-cf", clp(totals.iva));
    setText("trib-docs-cf", String(totals.docsConCF));
    setText("trib-docs-sin-cf", String(totals.docsSinCF));

    // Gráficos livianos sin librería externa, para que no falle si Chart.js no existe
    renderGraficosSimples(rows, budget);
  }

  function getTopCategoria(rows) {
    const groups = groupBy(rows, r => r.categoria || "Sin categoría");
    const top = Object.entries(groups)
      .map(([cat, rs]) => [cat, rs.reduce((a, r) => a + num(r.neto), 0)])
      .sort((a, b) => b[1] - a[1])[0];
    return top?.[0] || "";
  }

  function getCategoriasDesviadas(rows, budget) {
    if (!budget) return [];
    const groups = groupBy(rows, r => r.categoria || "Sin categoría");
    return CATEGORIAS.filter(cat => {
      const ejecutado = (groups[cat] || []).reduce((a, r) => a + num(r.neto), 0);
      const pptoCat = getCategoriaBudget(cat, budget);
      return pptoCat > 0 && ejecutado / pptoCat > 0.9;
    });
  }

  function renderResumenCategoria(rows, budget) {
    const body = $("resumen-categoria-body");
    if (!body) return;

    const groups = groupBy(rows, r => r.categoria || "Sin categoría");
    const cats = CATEGORIAS.slice();

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="empty-cell">Sin datos disponibles</td></tr>`;
      return;
    }

    body.innerHTML = cats.map(cat => {
      const ejecutado = (groups[cat] || []).reduce((a, r) => a + num(r.neto), 0);
      const ppto = getCategoriaBudget(cat, budget);
      const dif = ppto - ejecutado;
      const av = ppto ? (ejecutado / ppto) * 100 : 0;
      const difClass = dif < 0 ? "desv-neg" : "desv-pos";
      return `
        <tr>
          <td>${cat}</td>
          <td class="money">${clp(ppto)}</td>
          <td class="money">${clp(ejecutado)}</td>
          <td class="money ${difClass}">${clp(dif)}</td>
          <td class="money">${pct(av)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderGraficosSimples(rows, budget) {
    renderBarChart("chart-presupuesto", rows, budget);
    renderDonutLegend("chart-categoria", rows);
    renderLineSimple("chart-mensual", rows);
  }

  function renderBarChart(id, rows, budget) {
    const el = $(id);
    if (!el) return;
    const groups = groupBy(rows, r => r.categoria || "Sin categoría");
    const max = Math.max(
      ...CATEGORIAS.map(cat => getCategoriaBudget(cat, budget)),
      ...CATEGORIAS.map(cat => (groups[cat] || []).reduce((a, r) => a + num(r.neto), 0)),
      1
    );

    el.innerHTML = `
      <div class="simple-chart-bars">
        ${CATEGORIAS.map(cat => {
          const ppto = getCategoriaBudget(cat, budget);
          const eje = (groups[cat] || []).reduce((a, r) => a + num(r.neto), 0);
          return `
            <div class="simple-bar-group">
              <div class="simple-bars">
                <span class="simple-bar simple-bar-budget" style="height:${Math.max((ppto / max) * 100, 2)}%"></span>
                <span class="simple-bar simple-bar-real" style="height:${Math.max((eje / max) * 100, 2)}%"></span>
              </div>
              <div class="simple-bar-label">${cat}</div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="simple-legend"><span>Presupuesto</span><span>Ejecutado</span></div>
    `;
  }

  function renderDonutLegend(id, rows) {
    const el = $(id);
    if (!el) return;
    const groups = groupBy(rows, r => r.categoria || "Sin categoría");
    const total = rows.reduce((a, r) => a + num(r.neto), 0);
    const items = CATEGORIAS.map(cat => {
      const monto = (groups[cat] || []).reduce((a, r) => a + num(r.neto), 0);
      return { cat, monto, percent: total ? (monto / total) * 100 : 0 };
    }).filter(i => i.monto > 0);

    if (!items.length) {
      el.innerHTML = `<div class="empty-state">Sin datos para graficar.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="simple-donut">
        <div class="simple-donut-center">${clp(total)}</div>
      </div>
      <div class="simple-donut-list">
        ${items.map(i => `<div><span>${i.cat}</span><strong>${pct(i.percent)}</strong></div>`).join("")}
      </div>
    `;
  }

  function renderLineSimple(id, rows) {
    const el = $(id);
    if (!el) return;
    const groups = groupBy(rows, r => mesLabelLocal(r.fecha));
    const items = Object.entries(groups)
      .map(([mes, rs]) => ({ mes, monto: rs.reduce((a, r) => a + num(r.neto), 0) }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6);

    if (!items.length) {
      el.innerHTML = `<div class="empty-state">Sin datos para graficar.</div>`;
      return;
    }

    const max = Math.max(...items.map(i => i.monto), 1);
    el.innerHTML = `
      <div class="simple-line-chart">
        ${items.map(i => `
          <div class="simple-line-point">
            <div class="simple-line-value" style="height:${Math.max((i.monto / max) * 100, 6)}%"></div>
            <span>${i.mes}</span>
            <strong>${clp(i.monto)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  function extraerBalanceReal() {
    const el = $("balance-table");
    if (!el) return [];

    const rows = [];
    const gridRows = el.querySelectorAll(".table-head, .table-row, tr");

    gridRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll("div, th, td"))
        .map(texto)
        .filter(Boolean);
      if (cells.length) rows.push(cells);
    });

    if (rows.length) return rows;

    const raw = (el.innerText || el.textContent || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (raw.length) return raw.map(x => [x]);

    return [];
  }

  function rowsToCSV(rows) {
    return rows.map(row => row.map(csvEscape).join(";")).join("\n");
  }

  function getReporteEjecutivoRows() {
    const rows = getGastos();
    const budget = getBudget();
    const totals = getTotalsLocal(rows);
    const avance = budget ? (totals.neto / budget) * 100 : 0;

    return [
      ["Reporte Ejecutivo — Casa Junquillar"],
      ["Fecha de exportación", new Date().toLocaleString("es-CL")],
      [],
      ["Indicador", "Valor"],
      ["Presupuesto total", clp(budget)],
      ["Ejecutado neto", clp(totals.neto)],
      ["Avance financiero", pct(avance)],
      ["IVA crédito acumulado", clp(totals.iva)],
      ["Documentos con CF", totals.docsConCF],
      ["Documentos sin CF", totals.docsSinCF],
      [],
      ["Categoría", "Presupuesto", "Ejecutado", "Diferencia", "% Avance"],
      ...CATEGORIAS.map(cat => {
        const groups = groupBy(rows, r => r.categoria || "Sin categoría");
        const ejecutado = (groups[cat] || []).reduce((a, r) => a + num(r.neto), 0);
        const ppto = getCategoriaBudget(cat, budget);
        return [cat, clp(ppto), clp(ejecutado), clp(ppto - ejecutado), pct(ppto ? (ejecutado / ppto) * 100 : 0)];
      })
    ];
  }

  function exportarBalanceCSV() {
    const balance = extraerBalanceReal();
    const header = [
      ["Balance General — Proyecto Casa Junquillar"],
      ["Fuente", "Módulo Balance"],
      ["Fecha de exportación", new Date().toLocaleString("es-CL")],
      []
    ];
    const rows = balance.length ? header.concat(balance) : header.concat([["Sin datos visibles en Balance"]]);
    downloadBlob(`balance-general-casa-junquillar-${new Date().toISOString().slice(0,10)}.csv`, rowsToCSV(rows), "text/csv;charset=utf-8");
  }

  function exportarExcelCompleto() {
    actualizarVistaReportes();

    const reporteRows = getReporteEjecutivoRows();
    const balanceRows = extraerBalanceReal();

    if (window.XLSX) {
      const wb = window.XLSX.utils.book_new();

      const wsReporte = window.XLSX.utils.aoa_to_sheet(reporteRows);
      window.XLSX.utils.book_append_sheet(wb, wsReporte, "Reporte Ejecutivo");

      const wsBalance = window.XLSX.utils.aoa_to_sheet(
        balanceRows.length
          ? [["Balance General — Proyecto Casa Junquillar"], ["Fuente", "Módulo Balance"], [], ...balanceRows]
          : [["Balance General — Proyecto Casa Junquillar"], ["Sin datos visibles en Balance"]]
      );
      window.XLSX.utils.book_append_sheet(wb, wsBalance, "Balance");

      window.XLSX.writeFile(wb, `reporte-ejecutivo-junquillar-${new Date().toISOString().slice(0,10)}.xlsx`);
      return;
    }

    // Fallback CSV si XLSX no carga
    const csv = rowsToCSV(reporteRows.concat([[], ["BALANCE"], ...balanceRows]));
    downloadBlob(`reporte-ejecutivo-junquillar-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportarPDF() {
    actualizarVistaReportes();

    const report = $("section-reportes");
    const balance = $("section-balance");
    const html = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Reporte Ejecutivo — Casa Junquillar</title>
        <link rel="stylesheet" href="styles.css">
        <style>
          body{background:#fff;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
          .layout,.main,.content{display:block;padding:0;margin:0;}
          .module-hidden{display:block!important;}
          .sidebar,.header,.report-header-actions,.bell-btn,.search-wrap{display:none!important;}
          .card{break-inside:avoid;margin-bottom:16px;}
          @media print{body{padding:0}.card{box-shadow:none}}
        </style>
      </head>
      <body>
        ${report ? report.outerHTML : "<h1>Reporte Ejecutivo — Casa Junquillar</h1>"}
        <hr style="margin:24px 0">
        ${balance ? balance.outerHTML : ""}
        <script>window.print();<\/script>
      </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (!w) {
      alert("El navegador bloqueó la ventana emergente. Permite pop-ups para exportar PDF.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function toggleDetalle() {
    const extras = $("report-extras");
    if (!extras) return;
    const hidden = extras.style.display === "none" || getComputedStyle(extras).display === "none";
    extras.style.display = hidden ? "block" : "none";

    const btn = $("btn-ver-detalle");
    if (btn) btn.textContent = hidden ? "👁️ Ocultar detalle" : "👁️ Ver detalle";

    if (hidden) agregarBotonesBalanceDetalle();
  }

  function agregarBotonesBalanceDetalle() {
    const cont = $("reportes-export");
    if (!cont || $("btn-balance-real-excel")) return;

    const wrap = document.createElement("div");
    wrap.className = "export-btns";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
      <button class="export-btn export-btn-xl" id="btn-balance-real-excel" type="button">⬇ Balance Excel</button>
      <button class="export-btn" id="btn-balance-real-csv" type="button">⬇ Balance CSV</button>
    `;
    cont.prepend(wrap);

    $("btn-balance-real-excel")?.addEventListener("click", exportarExcelCompleto);
    $("btn-balance-real-csv")?.addEventListener("click", exportarBalanceCSV);
  }

  function conectarBotones() {
    const pdfBtn = $("btn-export-pdf");
    const excelBtn = $("btn-export-excel");
    const detalleBtn = $("btn-ver-detalle");

    if (pdfBtn && pdfBtn.dataset.fix !== "1") {
      pdfBtn.dataset.fix = "1";
      pdfBtn.onclick = exportarPDF;
      pdfBtn.addEventListener("click", function(e){ e.preventDefault(); exportarPDF(); });
    }

    if (excelBtn && excelBtn.dataset.fix !== "1") {
      excelBtn.dataset.fix = "1";
      excelBtn.onclick = exportarExcelCompleto;
      excelBtn.addEventListener("click", function(e){ e.preventDefault(); exportarExcelCompleto(); });
    }

    if (detalleBtn && detalleBtn.dataset.fix !== "1") {
      detalleBtn.dataset.fix = "1";
      detalleBtn.onclick = toggleDetalle;
      detalleBtn.addEventListener("click", function(e){ e.preventDefault(); toggleDetalle(); });
    }
  }

  function boot() {
    // Define las funciones que el HTML llama con onclick.
    window.exportToPDF = exportarPDF;
    window.exportToExcel = exportarExcelCompleto;
    window.toggleDetalle = toggleDetalle;
    window.exportarBalanceRealCSV = exportarBalanceCSV;
    window.actualizarVistaReportes = actualizarVistaReportes;

    conectarBotones();
    actualizarVistaReportes();

    // La app renderiza después de cargar datos desde Supabase, por eso se refresca varias veces.
    let count = 0;
    const interval = setInterval(() => {
      conectarBotones();
      actualizarVistaReportes();
      if (++count > 12) clearInterval(interval);
    }, 700);

    const observer = new MutationObserver(() => {
      conectarBotones();
      if ($("section-reportes")) actualizarVistaReportes();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
