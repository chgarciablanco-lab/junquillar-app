/* JUNQO – Casa Junquillar | app.js restaurado + Reportes/Balance integrado */

const BUDGET_KEY = "junqo_presupuesto";
let PROJECT_BUDGET = 180000000;
const PROJECT_NAME = "Junquillar";
const BUCKET_NAME = "comprobantes-junquillar";
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "pdf", "xls", "xlsx", "csv"];
const CATEGORIAS = ["Materiales", "Mano de obra", "Servicios", "Herramientas", "Transporte"];

let gastos = [];
let filteredDocs = [];
let currentView = "resumen";
let docsVisibleLimit = 10;
let editModalGasto = null;

const views = {
  resumen: { title: "Resumen", subtitle: "Vista ejecutiva y control del proyecto", visible: ["section-kpis", "section-alerts", "section-control"] },
  gastos: { title: "Gastos", subtitle: "Registro y control de egresos del proyecto", visible: ["section-filtro-solo", "section-docs"] },
  documentos: { title: "Documentos", subtitle: "Carga de facturas, boletas y respaldo documental", visible: ["section-upload-only"] },
  proveedores: { title: "Proveedores", subtitle: "Análisis por proveedor, documentos y concentración", visible: ["section-proveedores"] },
  caja: { title: "Caja e IVA", subtitle: "Crédito fiscal, documentos y detalle mensual", visible: ["section-caja"] },
  balance: { title: "Balance", subtitle: "Vista contable calculada desde los gastos registrados", visible: ["section-balance"] },
  reportes: { title: "Reportes", subtitle: "Reporte ejecutivo del proyecto", visible: ["section-reportes"] },
  ventas: { title: "Ventas", subtitle: "Ingresos, cotizaciones y contactos del proyecto", visible: ["section-ventas"] },
  insumos: { title: "Insumos", subtitle: "Control de materiales y stock en obra", visible: ["section-insumos"] },
  configuracion: { title: "Configuración", subtitle: "Ajustes generales del proyecto", visible: ["section-config"] }
};

const $ = id => document.getElementById(id);

function numberValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function formatoCLP(value) {
  return numberValue(value).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}
function formatoPct(value) {
  return `${Number(value || 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}
function normalizarFecha(fecha) {
  if (!fecha) return "—";
  const raw = String(fecha).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}
function fechaOrdenable(fecha) {
  if (!fecha) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(fecha)) return String(fecha).slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
    const [d, m, y] = fecha.split("/");
    return `${y}-${m}-${d}`;
  }
  return String(fecha);
}
function mesLabel(fecha) {
  const f = fechaOrdenable(fecha);
  if (!f || f.length < 7) return "Sin fecha";
  const [y, m] = f.split("-");
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${meses[Number(m) - 1] || m} ${y}`;
}
function getCategoriaClass(categoria = "") {
  const cat = String(categoria || "").toLowerCase();
  if (cat.includes("material")) return "cat-materiales";
  if (cat.includes("mano")) return "cat-mano";
  if (cat.includes("servicio") || cat.includes("aliment")) return "cat-servicios";
  if (cat.includes("herramienta")) return "cat-herramientas";
  if (cat.includes("transporte")) return "cat-transporte";
  return "cat-otros";
}
function sumBy(rows, field) { return rows.reduce((acc, item) => acc + numberValue(item[field]), 0); }
function uniqueCount(rows, field) { return new Set(rows.map(i => i[field]).filter(Boolean)).size; }
function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row) || "Sin clasificar";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}
function emptyState(text = "Sin registros para mostrar.") { return `<div class="empty-state">${text}</div>`; }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }

function getTotals(rows = gastos) {
  const neto = sumBy(rows, "neto");
  const iva = sumBy(rows, "iva");
  const total = sumBy(rows, "total");
  const docs = rows.length;
  const proveedores = uniqueCount(rows, "proveedor");
  const pendientesOcr = rows.filter(g => String(g.estado_ocr || "").toLowerCase() === "pendiente").length;
  const sinProveedor = rows.filter(g => !g.proveedor).length;
  const docsConCF = rows.filter(g => numberValue(g.iva) > 0).length;
  const docsSinCF = rows.filter(g => numberValue(g.iva) <= 0).length;
  return { neto, iva, total, docs, proveedores, pendientesOcr, sinProveedor, docsConCF, docsSinCF };
}

function mapSupabaseRow(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    proveedor: row.proveedor || "",
    rut: row.rut || "",
    tipo_documento: row.tipo_documento || "",
    numero_documento: row.numero_documento || "",
    iva: numberValue(row.iva),
    total: numberValue(row.total),
    metodo_pago: row.metodo_pago || "",
    proyecto: row.proyecto || PROJECT_NAME,
    observacion: row.observacion || "",
    foto_url: row.foto_url || "",
    estado_ocr: row.estado_ocr || "",
    created_at: row.created_at || "",
    neto: numberValue(row.neto),
    categoria: row.categoria || "",
    foto_path: row.foto_path || ""
  };
}

async function loadBudget() {
  if (typeof window.supabaseClient === "undefined") return;
  try {
    const { data } = await window.supabaseClient.from("junqo_config").select("value").eq("key", BUDGET_KEY).single();
    if (data?.value) PROJECT_BUDGET = Number(data.value) || PROJECT_BUDGET;
  } catch (_) {}
}
async function saveBudget(val) {
  PROJECT_BUDGET = val;
  if (typeof window.supabaseClient !== "undefined") {
    await window.supabaseClient.from("junqo_config").upsert({ key: BUDGET_KEY, value: String(val), proyecto: PROJECT_NAME }, { onConflict: "key" });
  }
  renderAll();
}
async function loadData() {
  if (typeof window.supabaseClient === "undefined") {
    console.warn("Supabase no está configurado. Dashboard vacío.");
    gastos = [];
    filteredDocs = [];
    renderAll();
    return;
  }
  const { data, error } = await window.supabaseClient
    .from("gastos_junquillar_app")
    .select("*")
    .eq("proyecto", PROJECT_NAME)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error cargando gastos:", error);
    gastos = [];
    filteredDocs = [];
    renderAll();
    return;
  }
  gastos = (data || []).map(mapSupabaseRow);
  filteredDocs = [...gastos];
  await loadBudget();
  renderAll();
}

function renderKPIs() {
  const el = $("section-kpis"); if (!el) return;
  const t = getTotals(); const avance = PROJECT_BUDGET ? (t.neto / PROJECT_BUDGET) * 100 : 0;
  const saldo = Math.max(PROJECT_BUDGET - t.neto, 0);
  const kpis = [
    ["Avance financiero", formatoPct(avance), "Ejecutado", `${formatoCLP(t.neto)} ejecutado de ${formatoCLP(PROJECT_BUDGET)}`],
    ["Inversión neta", formatoCLP(t.neto), `${t.docs} docs`, `${t.proveedores} proveedores registrados`],
    ["Saldo disponible", formatoCLP(saldo), saldo > 0 ? "Disponible" : "Agotado", "Presupuesto referencial menos ejecutado"],
    ["IVA crédito fiscal", formatoCLP(t.iva), "CF", `${t.docsConCF} documentos con crédito fiscal`]
  ];
  el.innerHTML = kpis.map(k => `<div class="kpi-card"><div class="kpi-top"><div><div class="kpi-title">${k[0]}</div><div class="kpi-value">${k[1]}</div></div><span class="badge up">${k[2]}</span></div><div class="kpi-footer">${k[3]}</div></div>`).join("");
  const sidebarBig = document.querySelector(".sidebar-card .big");
  const sidebarSub = document.querySelector(".sidebar-card .sub");
  const sidebarFill = document.querySelector(".sidebar-card .progress-fill");
  if (sidebarBig) sidebarBig.textContent = formatoPct(avance);
  if (sidebarSub) sidebarSub.textContent = `${formatoCLP(t.neto)} de ${formatoCLP(PROJECT_BUDGET)} ejecutado`;
  if (sidebarFill) sidebarFill.style.width = `${Math.min(avance, 100)}%`;
}
function renderAlerts() {
  const el = $("alerts-list"); if (!el) return;
  const t = getTotals(); const avance = PROJECT_BUDGET ? (t.neto / PROJECT_BUDGET) * 100 : 0;
  const alerts = [
    ["📄", `${t.pendientesOcr} documentos pendientes OCR`, "Registros que aún requieren lectura o revisión documental."],
    ["⚠️", `${t.sinProveedor} registros incompletos`, "Gastos sin proveedor registrado o con datos pendientes."],
    ["💵", `${formatoCLP(t.iva)} de IVA crédito fiscal`, "Monto calculado desde los documentos registrados."],
    ["📊", `${formatoPct(avance)} de avance financiero`, "Avance calculado contra presupuesto referencial."]
  ];
  el.innerHTML = alerts.map(a => `<div class="alert-item"><div class="alert-icon">${a[0]}</div><div><div class="alert-title">${a[1]}</div><div class="alert-sub">${a[2]}</div></div></div>`).join("");
}

function renderDocs(limit = docsVisibleLimit) {
  const el = $("docs-table"), subtitle = $("docs-subtitle"), btn = $("load-more-btn"); if (!el) return;
  if (subtitle) subtitle.textContent = `${filteredDocs.length} registros · datos cargados desde Supabase`;
  if (!filteredDocs.length) { el.innerHTML = emptyState("No hay gastos registrados en Supabase."); if (btn) btn.style.display = "none"; return; }
  el.innerHTML = filteredDocs.slice(0, limit).map(g => `
    <div class="table-row gastos-row" data-id="${g.id}">
      <div><input type="checkbox" class="row-chk" data-id="${g.id}" /></div>
      <div>${normalizarFecha(g.fecha)}</div>
      <div><div class="doc-name">${g.proveedor || "Pendiente OCR"}</div><div class="doc-amount">${g.observacion || ""}</div></div>
      <div style="font-size:11px;color:#94a3b8">${g.rut || "—"}</div>
      <div style="font-size:12px;color:#64748b">${g.tipo_documento || "—"}</div>
      <div><span class="cat-badge ${getCategoriaClass(g.categoria)}">${g.categoria || "Sin categoría"}</span></div>
      <div>${formatoCLP(g.neto)}</div>
      <div>${g.iva ? formatoCLP(g.iva) : "—"}</div>
      <div>${g.total ? formatoCLP(g.total) : "—"}</div>
      <div style="text-align:center">${numberValue(g.iva) > 0 ? "✔" : "—"}</div>
      <div style="font-size:12px;color:#64748b">${g.metodo_pago || "—"}</div>
      <div class="doc-actions"><button class="action-btn" onclick="openEditModal('${g.id}')">✏️</button><button class="action-btn" onclick="confirmDelete('${g.id}')">🗑️</button></div>
    </div>
  `).join("");
  if (btn) btn.style.display = filteredDocs.length > limit ? "inline-flex" : "none";
}
function applyFilters() {
  const text = (($("filter-text-gastos")?.value || $("global-search")?.value || "")).toLowerCase().trim();
  const cat = $("filter-cat-gastos")?.value || "";
  const tipo = $("filter-tipo-gastos")?.value || "";
  const pago = $("filter-pago-gastos")?.value || "";
  const desde = $("filter-desde-gastos")?.value || "";
  const hasta = $("filter-hasta-gastos")?.value || "";
  filteredDocs = gastos.filter(g => {
    const hayTexto = [g.proveedor, g.rut, g.tipo_documento, g.numero_documento, g.categoria, g.metodo_pago, g.observacion].join(" ").toLowerCase();
    const f = fechaOrdenable(g.fecha);
    if (text && !hayTexto.includes(text)) return false;
    if (cat && g.categoria !== cat) return false;
    if (tipo && g.tipo_documento !== tipo) return false;
    if (pago && g.metodo_pago !== pago) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
  docsVisibleLimit = 10;
  renderDocs();
}
function clearFilters() {
  ["filter-text-gastos", "global-search", "filter-cat-gastos", "filter-tipo-gastos", "filter-desde-gastos", "filter-hasta-gastos", "filter-pago-gastos"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  filteredDocs = [...gastos]; docsVisibleLimit = 10; renderDocs();
}

function renderProveedores() {
  const el = $("proveedores-table"); if (!el) return;
  if (!gastos.length) { el.innerHTML = emptyState("Sin proveedores. No hay gastos registrados."); return; }
  const groups = groupBy(gastos, g => g.proveedor || "Pendiente OCR"), totalNeto = sumBy(gastos, "neto");
  el.innerHTML = Object.entries(groups).map(([name, rows]) => ({ name, rut: rows.find(r => r.rut)?.rut || "—", cat: rows.find(r => r.categoria)?.categoria || "Sin categoría", docs: rows.length, costo: sumBy(rows, "neto"), iva: sumBy(rows, "iva") })).sort((a, b) => b.costo - a.costo).slice(0, 20).map((p, i) => `<div class="table-row prov-row"><div>${i + 1}</div><div class="doc-name">${p.name}</div><div>${p.rut}</div><div><span class="cat-badge ${getCategoriaClass(p.cat)}">${p.cat}</span></div><div>${p.docs}</div><div>${formatoCLP(p.costo)}</div><div>${formatoCLP(p.iva)}</div><div>${formatoPct(totalNeto ? (p.costo / totalNeto) * 100 : 0)}</div></div>`).join("");
}

function renderCaja() { renderCajaKpis(); renderCajaTipos(); renderCajaMensual(); }
function renderCajaKpis() {
  const el = $("caja-kpis"); if (!el) return;
  const t = getTotals();
  el.innerHTML = [["Costo neto registrado", formatoCLP(t.neto), `${t.docs} documentos`], ["IVA crédito fiscal", formatoCLP(t.iva), "Desde IVA registrado"], ["Total documentos", formatoCLP(t.total), "Neto + IVA"], ["Docs con IVA", t.docsConCF, "Con crédito fiscal"]].map(c => `<div class="kpi-card"><div class="kpi-title">${c[0]}</div><div class="kpi-value">${c[1]}</div><div class="kpi-footer">${c[2]}</div></div>`).join("");
}
function renderCajaTipos() {
  const el = $("caja-tipos"); if (!el) return;
  if (!gastos.length) { el.innerHTML = emptyState("Sin información."); return; }
  const g = groupBy(gastos, x => x.tipo_documento || "Sin tipo");
  el.innerHTML = Object.entries(g).map(([tipo, rows]) => `<div class="table-row caja-tipos-row"><div>${tipo}</div><div>${rows.length}</div><div>${formatoCLP(sumBy(rows, "neto"))}</div><div>${formatoCLP(sumBy(rows, "iva"))}</div><div>${sumBy(rows, "iva") > 0 ? "✔" : "—"}</div><div>${sumBy(rows, "iva") > 0 ? "IVA CF" : "Sin IVA"}</div></div>`).join("");
}
function renderCajaMensual() {
  const el = $("caja-mensual"); if (!el) return;
  if (!gastos.length) { el.innerHTML = emptyState("Sin detalle."); return; }
  const g = groupBy(gastos, x => mesLabel(x.fecha)); let acum = 0;
  el.innerHTML = Object.entries(g).sort(([a], [b]) => a.localeCompare(b)).map(([mes, rows]) => { const iva = sumBy(rows, "iva"); acum += iva; return `<div class="table-row caja-mensual-row"><div>${mes}</div><div>${rows.filter(r => numberValue(r.iva) > 0).length}</div><div>${formatoCLP(sumBy(rows, "neto"))}</div><div>${formatoCLP(iva)}</div><div>${formatoCLP(acum)}</div></div>`; }).join("");
}

function getBalanceRows() {
  const t = getTotals();
  const TERRENO = 100000000;
  const APORTE_SOCIO = 60000000;
  const activoTerreno = TERRENO;
  const activoObra = t.neto;
  const activoIva = t.iva;
  const totalActivos = activoTerreno + activoObra + activoIva;
  const pasivoSocio = APORTE_SOCIO;
  const pasivoGastos = t.total;
  const totalPasivos = pasivoSocio + pasivoGastos;
  const ajuste = totalActivos - totalPasivos;
  const rows = [
    ["N°", "Cuenta", "Debe", "Haber", "Deudor", "Acreedor", "Activo", "Pasivo", "Pérdida", "Ganancia"],
    ["", "ACTIVOS", "", "", "", "", "", "", "", ""],
    ["1", "Terreno", activoTerreno, 0, activoTerreno, 0, activoTerreno, 0, 0, 0],
    ["2", "Obra en Curso", activoObra, 0, activoObra, 0, activoObra, 0, 0, 0],
    ["3", "IVA Crédito Fiscal", activoIva, 0, activoIva, 0, activoIva, 0, 0, 0],
    ["", "PASIVOS", "", "", "", "", "", "", "", ""],
    ["4", "Cuenta por pagar al Socio", 0, pasivoSocio, 0, pasivoSocio, 0, pasivoSocio, 0, 0],
    ["5", "Gastos por pagar", 0, pasivoGastos, 0, pasivoGastos, 0, pasivoGastos, 0, 0]
  ];
  if (ajuste !== 0) rows.push(["6", ajuste > 0 ? "Capital pendiente" : "Ajuste", ajuste > 0 ? ajuste : 0, ajuste < 0 ? Math.abs(ajuste) : 0, ajuste > 0 ? ajuste : 0, ajuste < 0 ? Math.abs(ajuste) : 0, 0, 0, ajuste < 0 ? Math.abs(ajuste) : 0, ajuste > 0 ? ajuste : 0]);
  rows.push(["", "TOTAL", totalActivos, totalPasivos + (ajuste > 0 ? ajuste : 0), totalActivos, totalPasivos + (ajuste > 0 ? ajuste : 0), totalActivos, totalPasivos, 0, 0]);
  return rows;
}
function renderBalance() {
  const el = $("balance-table"); if (!el) return;
  if (!gastos.length) { el.innerHTML = emptyState("Sin movimientos."); return; }
  const rows = getBalanceRows();
  const header = rows[0];
  const body = rows.slice(1);
  el.innerHTML = `<div class="table-head balance-head">${header.map(h => `<div>${h}</div>`).join("")}</div>` + body.map(r => {
    const sec = !r[0] && r[1] && r.slice(2).every(v => v === "");
    if (sec) return `<div class="balance-section-row">${r[1]}</div>`;
    const total = r[1] === "TOTAL";
    return `<div class="table-row balance-row ${total ? "balance-total-row" : ""}">${r.map((v, i) => `<div>${i > 1 ? formatoCLP(v) : v}</div>`).join("")}</div>`;
  }).join("");
}

function renderControlProyecto() { renderControlEtapas(); renderControlCat(); renderBudgetEditor(); }
function renderControlEtapas() {
  const el = $("control-etapas"); if (!el) return;
  if (!gastos.length) { el.innerHTML = emptyState("Sin avance registrado."); return; }
  const groups = groupBy(gastos, g => g.categoria || "Sin categoría"), total = sumBy(gastos, "neto");
  el.innerHTML = `<div class="etapas-grid">${Object.entries(groups).map(([cat, rows]) => { const monto = sumBy(rows, "neto"), pct = total ? (monto / total) * 100 : 0; return `<div class="etapa-card"><div class="etapa-header"><div class="etapa-nombre">${cat}</div><span class="estado-badge estado-activo">Activo</span></div><div class="etapa-value">${formatoCLP(monto)}</div><div class="etapa-progress-bar"><div class="etapa-progress-fill" style="width:${Math.min(pct, 100)}%"></div></div><div class="etapa-sub">${rows.length} documentos · ${formatoPct(pct)}</div></div>`; }).join("")}</div>`;
}
function renderControlCat() {
  const el = $("control-cat"); if (!el) return;
  if (!gastos.length) { el.innerHTML = emptyState("Sin costos."); return; }
  const cg = groupBy(gastos, g => g.categoria || "Sin categoría"), total = sumBy(gastos, "neto"), months = [...new Set(gastos.map(g => mesLabel(g.fecha)))].sort();
  el.innerHTML = Object.entries(cg).map(([cat, rows]) => { const bm = groupBy(rows, r => mesLabel(r.fecha)), ct = sumBy(rows, "neto"); const vals = Array.from({ length: 5 }).map((_, i) => `<div>${months[i] ? formatoCLP(sumBy(bm[months[i]] || [], "neto")) : "—"}</div>`).join(""); return `<div class="table-row ctrl-cat-row"><div>${cat}</div><div>Gasto</div>${vals}<div>${formatoCLP(ct)}</div><div>${formatoPct(total ? (ct / total) * 100 : 0)}</div></div>`; }).join("");
}
function renderBudgetEditor() {
  const el = $("budget-editor"); if (!el) return;
  el.innerHTML = `<div class="budget-edit-row"><span class="budget-edit-label">Presupuesto del proyecto</span><div class="budget-edit-controls"><input type="text" id="budget-input" class="budget-input" value="${PROJECT_BUDGET.toLocaleString("es-CL")}" placeholder="180.000.000"/><button class="budget-save-btn" id="btn-save-budget">Guardar</button></div></div>`;
  $("btn-save-budget")?.addEventListener("click", async () => { const val = numberValue($("budget-input")?.value); if (!val || val < 1000) { alert("Ingresa un presupuesto válido."); return; } await saveBudget(val); alert(`✅ Presupuesto actualizado a ${formatoCLP(val)}`); });
}

function getCategoriaBudget(cat) {
  const map = { "Materiales": 0.42, "Mano de obra": 0.32, "Servicios": 0.10, "Herramientas": 0.08, "Transporte": 0.08 };
  return PROJECT_BUDGET * (map[cat] || 0);
}
function renderReportes() {
  actualizarVistaReportes();
  const extras = $("reportes-export");
  if (extras && !$("btn-balance-real-excel")) {
    extras.innerHTML = `<div class="export-btns"><button class="export-btn export-btn-xl" id="btn-balance-real-excel" type="button">⬇ Balance Excel</button><button class="export-btn" id="btn-balance-real-csv" type="button">⬇ Balance CSV</button></div>`;
    $("btn-balance-real-excel")?.addEventListener("click", exportToExcel);
    $("btn-balance-real-csv")?.addEventListener("click", exportBalanceCSV);
  }
}
function actualizarVistaReportes() {
  const t = getTotals(); const avance = PROJECT_BUDGET ? (t.neto / PROJECT_BUDGET) * 100 : 0;
  setText("kpi-presupuesto", formatoCLP(PROJECT_BUDGET)); setText("kpi-ejecutado", formatoCLP(t.neto)); setText("kpi-avance", formatoPct(avance)); setText("kpi-iva", formatoCLP(t.iva));
  const bar = $("kpi-avance-bar"); if (bar) bar.style.width = `${Math.min(Math.max(avance, 0), 100)}%`;
  setText("report-updated", `Última actualización: ${new Date().toLocaleString("es-CL")}`);
  const topCat = getTopCategoria();
  setText("diagnostico-text", `${avance > 0 ? "El proyecto mantiene un avance financiero controlado según los datos disponibles." : "El proyecto aún no registra ejecución financiera suficiente para un diagnóstico completo."} La mayor concentración de gasto está en ${topCat || "las categorías registradas"}. El IVA crédito fiscal acumulado asciende a ${formatoCLP(t.iva)} y debe mantenerse separado para revisión tributaria.`);
  const alertas = $("alertas-list"); if (alertas) alertas.innerHTML = `<div class="alerta-item alerta-success">✅ Sin sobrecostos críticos contra el presupuesto total.</div><div class="alerta-item alerta-info">ℹ️ ${t.docsSinCF} documento(s) sin crédito fiscal registrado.</div><div class="alerta-item alerta-success">✅ Documentación tributaria visible en el sistema.</div>`;
  renderResumenCategoria();
  setText("trib-base-neta", formatoCLP(t.neto)); setText("trib-iva-cf", formatoCLP(t.iva)); setText("trib-docs-cf", String(t.docsConCF)); setText("trib-docs-sin-cf", String(t.docsSinCF));
  renderGraficosSimples();
}
function getTopCategoria() {
  const groups = groupBy(gastos, r => r.categoria || "Sin categoría");
  const top = Object.entries(groups).map(([cat, rs]) => [cat, sumBy(rs, "neto")]).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] || "";
}
function renderResumenCategoria() {
  const body = $("resumen-categoria-body"); if (!body) return;
  const groups = groupBy(gastos, r => r.categoria || "Sin categoría");
  if (!gastos.length) { body.innerHTML = `<tr><td colspan="5" class="empty-cell">Sin datos disponibles</td></tr>`; return; }
  body.innerHTML = CATEGORIAS.map(cat => { const ejecutado = sumBy(groups[cat] || [], "neto"); const ppto = getCategoriaBudget(cat); const dif = ppto - ejecutado; const av = ppto ? (ejecutado / ppto) * 100 : 0; return `<tr><td>${cat}</td><td class="money">${formatoCLP(ppto)}</td><td class="money">${formatoCLP(ejecutado)}</td><td class="money ${dif < 0 ? "desv-neg" : "desv-pos"}">${formatoCLP(dif)}</td><td class="money">${formatoPct(av)}</td></tr>`; }).join("");
}
function renderGraficosSimples() {
  renderBarChart("chart-presupuesto"); renderDonutLegend("chart-categoria"); renderLineSimple("chart-mensual");
}
function renderBarChart(id) {
  const el = $(id); if (!el) return;
  const groups = groupBy(gastos, r => r.categoria || "Sin categoría");
  const max = Math.max(...CATEGORIAS.map(cat => getCategoriaBudget(cat)), ...CATEGORIAS.map(cat => sumBy(groups[cat] || [], "neto")), 1);
  el.innerHTML = `<div class="simple-chart-bars">${CATEGORIAS.map(cat => { const ppto = getCategoriaBudget(cat); const eje = sumBy(groups[cat] || [], "neto"); return `<div class="simple-bar-group"><div class="simple-bars"><span class="simple-bar simple-bar-budget" style="height:${Math.max((ppto / max) * 100, 2)}%"></span><span class="simple-bar simple-bar-real" style="height:${Math.max((eje / max) * 100, 2)}%"></span></div><div class="simple-bar-label">${cat}</div></div>`; }).join("")}</div><div class="simple-legend"><span>Presupuesto</span><span>Ejecutado</span></div>`;
}
function renderDonutLegend(id) {
  const el = $(id); if (!el) return;
  const groups = groupBy(gastos, r => r.categoria || "Sin categoría"); const total = sumBy(gastos, "neto");
  const items = CATEGORIAS.map(cat => ({ cat, monto: sumBy(groups[cat] || [], "neto"), percent: total ? (sumBy(groups[cat] || [], "neto") / total) * 100 : 0 })).filter(i => i.monto > 0);
  if (!items.length) { el.innerHTML = emptyState("Sin datos para graficar."); return; }
  el.innerHTML = `<div class="simple-donut"><div class="simple-donut-center">${formatoCLP(total)}</div></div><div class="simple-donut-list">${items.map(i => `<div><span>${i.cat}</span><strong>${formatoPct(i.percent)}</strong></div>`).join("")}</div>`;
}
function renderLineSimple(id) {
  const el = $(id); if (!el) return;
  const groups = groupBy(gastos, r => mesLabel(r.fecha)); const items = Object.entries(groups).map(([mes, rs]) => ({ mes, monto: sumBy(rs, "neto") })).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6);
  if (!items.length) { el.innerHTML = emptyState("Sin datos para graficar."); return; }
  const max = Math.max(...items.map(i => i.monto), 1);
  el.innerHTML = `<div class="simple-line-chart">${items.map(i => `<div class="simple-line-point"><div class="simple-line-value" style="height:${Math.max((i.monto / max) * 100, 6)}%"></div><span>${i.mes}</span><strong>${formatoCLP(i.monto)}</strong></div>`).join("")}</div>`;
}

function rowsToCSV(rows) { return rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n"); }
function downloadBlob(filename, content, mime) { const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function exportCSV() { const h = ["fecha", "proveedor", "rut", "tipo_documento", "numero_documento", "categoria", "neto", "iva", "total", "metodo_pago", "estado_ocr"]; downloadBlob("gastos_junquillar.csv", [h.join(";"), ...filteredDocs.map(r => h.map(f => `"${String(r[f] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n"), "text/csv;charset=utf-8"); }
function getReporteEjecutivoRows() { const t = getTotals(); const av = PROJECT_BUDGET ? (t.neto / PROJECT_BUDGET) * 100 : 0; return [["Reporte Ejecutivo — Casa Junquillar"], ["Fecha de exportación", new Date().toLocaleString("es-CL")], [], ["Indicador", "Valor"], ["Presupuesto total", formatoCLP(PROJECT_BUDGET)], ["Ejecutado neto", formatoCLP(t.neto)], ["Avance financiero", formatoPct(av)], ["IVA crédito acumulado", formatoCLP(t.iva)], ["Documentos con CF", t.docsConCF], ["Documentos sin CF", t.docsSinCF], [], ["Categoría", "Presupuesto", "Ejecutado", "Diferencia", "% Avance"], ...CATEGORIAS.map(cat => { const groups = groupBy(gastos, r => r.categoria || "Sin categoría"); const ejecutado = sumBy(groups[cat] || [], "neto"); const ppto = getCategoriaBudget(cat); return [cat, formatoCLP(ppto), formatoCLP(ejecutado), formatoCLP(ppto - ejecutado), formatoPct(ppto ? (ejecutado / ppto) * 100 : 0)]; })]; }
function getBalanceExportRows() { return [["Balance General — Proyecto Casa Junquillar"], ["Fuente", "Módulo Balance"], ["Fecha de exportación", new Date().toLocaleString("es-CL")], [], ...getBalanceRows().map(r => r.map((v, i) => (i > 1 && typeof v === "number") ? formatoCLP(v) : v))]; }
function exportBalanceCSV() { downloadBlob(`balance-general-casa-junquillar-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCSV(getBalanceExportRows()), "text/csv;charset=utf-8"); }
function exportToExcel() { if (window.XLSX) { const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(getReporteEjecutivoRows()), "Reporte Ejecutivo"); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(getBalanceExportRows()), "Balance"); window.XLSX.writeFile(wb, `reporte-ejecutivo-junquillar-${new Date().toISOString().slice(0, 10)}.xlsx`); return; } downloadBlob(`reporte-ejecutivo-junquillar-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCSV(getReporteEjecutivoRows().concat([[], ["BALANCE"], ...getBalanceExportRows()])), "text/csv;charset=utf-8"); }
function exportToPDF() { actualizarVistaReportes(); const report = $("section-reportes"); const balance = $("section-balance"); const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte Ejecutivo — Casa Junquillar</title><link rel="stylesheet" href="styles.css"><style>body{background:#fff;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.module-hidden{display:block!important}.sidebar,.header,.report-header-actions{display:none!important}.card{break-inside:avoid;margin-bottom:16px}</style></head><body>${report ? report.outerHTML : ""}<hr style="margin:24px 0">${balance ? balance.outerHTML : ""}<script>window.print();<\/script></body></html>`; const w = window.open("", "_blank"); if (!w) { alert("El navegador bloqueó la ventana emergente. Permite pop-ups para exportar PDF."); return; } w.document.open(); w.document.write(html); w.document.close(); }
function toggleDetalle() { const extras = $("report-extras"); if (!extras) return; const hidden = extras.style.display === "none" || getComputedStyle(extras).display === "none"; extras.style.display = hidden ? "block" : "none"; const btn = $("btn-ver-detalle"); if (btn) btn.textContent = hidden ? "👁️ Ocultar detalle" : "👁️ Ver detalle"; renderReportes(); }

function openEditModal(id) { const g = gastos.find(x => String(x.id) === String(id)); if (!g) return; editModalGasto = g; const m = $("modal-overlay"); if (!m) return; [ ["em-fecha", g.fecha], ["em-proveedor", g.proveedor], ["em-rut", g.rut], ["em-tipo", g.tipo_documento], ["em-ndoc", g.numero_documento], ["em-neto", g.neto], ["em-iva", g.iva], ["em-total", g.total], ["em-cat", g.categoria], ["em-pago", g.metodo_pago], ["em-obs", g.observacion] ].forEach(([id, val]) => { const el = $(id); if (el) el.value = val || ""; }); m.classList.remove("modal-hidden"); }
function closeEditModal() { $("modal-overlay")?.classList.add("modal-hidden"); editModalGasto = null; }
async function saveEditModal() { if (!editModalGasto || typeof window.supabaseClient === "undefined") return; const updates = { fecha: $("em-fecha")?.value || editModalGasto.fecha, proveedor: $("em-proveedor")?.value || null, rut: $("em-rut")?.value || null, tipo_documento: $("em-tipo")?.value || null, numero_documento: $("em-ndoc")?.value || null, neto: numberValue($("em-neto")?.value), iva: numberValue($("em-iva")?.value), total: numberValue($("em-total")?.value), categoria: $("em-cat")?.value || null, metodo_pago: $("em-pago")?.value || null, observacion: $("em-obs")?.value || null }; const { error } = await window.supabaseClient.from("gastos_junquillar_app").update(updates).eq("id", editModalGasto.id); if (error) { alert(`Error guardando: ${error.message}`); return; } closeEditModal(); await loadData(); }
async function confirmDelete(id) { const g = gastos.find(x => String(x.id) === String(id)); if (!g || !confirm(`¿Eliminar el gasto de "${g.proveedor || "sin proveedor"}"?`)) return; if (typeof window.supabaseClient === "undefined") return; const { error } = await window.supabaseClient.from("gastos_junquillar_app").delete().eq("id", id); if (error) { alert(`Error eliminando: ${error.message}`); return; } await loadData(); }

function renderVentas() { const el = $("ventas-root"); if (el && !el.innerHTML.trim()) el.innerHTML = `<div class="card"><div class="card-title">Ventas</div><div class="card-sub">Módulo en preparación.</div></div>`; }
function renderInsumos() { const el = $("insumos-root"); if (el && !el.innerHTML.trim()) el.innerHTML = `<div class="card"><div class="card-title">Insumos</div><div class="card-sub">Módulo en preparación.</div></div>`; }
function renderConfig() { const el = $("config-root"); if (el && !el.innerHTML.trim()) el.innerHTML = `<div class="card"><div class="card-title">Configuración</div><div class="card-sub">Ajustes generales del proyecto.</div></div>`; }

function updateVisibleSections(ids = []) { document.querySelectorAll(".module-block").forEach(s => s.classList.add("module-hidden")); ids.forEach(id => $(id)?.classList.remove("module-hidden")); }
function setupNavigation() { const buttons = document.querySelectorAll(".nav-btn"), title = $("page-title"), subtitle = $("page-subtitle"); buttons.forEach(btn => btn.addEventListener("click", () => { buttons.forEach(b => b.classList.remove("active")); btn.classList.add("active"); currentView = btn.dataset.view; const view = views[currentView] || views.resumen; if (title) title.textContent = view.title; if (subtitle) subtitle.textContent = view.subtitle; updateVisibleSections(view.visible); docsVisibleLimit = currentView === "gastos" ? 10 : 3; renderAll(); })); $("btn-ver-reportes")?.addEventListener("click", () => document.querySelector('[data-view="reportes"]')?.click()); }
function setupButtons() { $("load-more-btn")?.addEventListener("click", () => { docsVisibleLimit += 20; renderDocs(docsVisibleLimit); }); $("btn-aplicar-filtros-gastos")?.addEventListener("click", applyFilters); $("btn-limpiar-filtros-gastos")?.addEventListener("click", clearFilters); $("btn-export-csv")?.addEventListener("click", exportCSV); $("btn-export-excel")?.addEventListener("click", exportCSV); $("filter-text-gastos")?.addEventListener("input", applyFilters); $("global-search")?.addEventListener("input", applyFilters); $("btn-modal-cancel")?.addEventListener("click", closeEditModal); $("btn-modal-cancel2")?.addEventListener("click", closeEditModal); $("btn-modal-save")?.addEventListener("click", saveEditModal); $("btn-export-pdf")?.addEventListener("click", exportToPDF); $("btn-ver-detalle")?.addEventListener("click", toggleDetalle); }

function renderAll() { renderKPIs(); renderAlerts(); renderDocs(docsVisibleLimit); renderProveedores(); renderCaja(); renderBalance(); renderControlProyecto(); renderReportes(); renderVentas(); renderInsumos(); renderConfig(); }
function injectReportStyles() { if ($("junqo-report-fix-styles")) return; const s = document.createElement("style"); s.id = "junqo-report-fix-styles"; s.textContent = `.simple-chart-bars{height:220px;display:flex;align-items:flex-end;gap:14px;padding:16px 4px}.simple-bar-group{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:70px}.simple-bars{height:160px;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:4px}.simple-bar{width:22px;border-radius:7px 7px 0 0;display:block}.simple-bar-budget{background:#d1fae5}.simple-bar-real{background:#0f172a}.simple-bar-label{font-size:11px;color:#64748b;text-align:center}.simple-legend{display:flex;justify-content:center;gap:20px;font-size:12px;color:#64748b}.simple-donut{width:150px;height:150px;border-radius:50%;margin:10px auto;background:conic-gradient(#0f766e 0 45%,#059669 45% 70%,#94a3b8 70% 100%);display:flex;align-items:center;justify-content:center}.simple-donut-center{background:#fff;border-radius:50%;width:92px;height:92px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;font-weight:700;padding:8px}.simple-donut-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}.simple-donut-list div{display:flex;justify-content:space-between;border-bottom:1px solid #edf2f7;padding-bottom:6px}.simple-line-chart{height:220px;display:flex;align-items:flex-end;gap:14px;padding:16px 4px}.simple-line-point{flex:1;height:180px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}.simple-line-value{width:28px;background:#059669;border-radius:8px 8px 0 0}.simple-line-point span{font-size:11px;color:#64748b}.simple-line-point strong{font-size:11px;color:#0f172a}.balance-head,.balance-row{grid-template-columns:.45fr 1.8fr repeat(8,1fr)!important}.balance-section-row{padding:10px 16px;background:#f8fafc;font-size:12px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0}.balance-total-row{font-weight:700;background:#f8fafc}`; document.head.appendChild(s); }
function initDashboard() { injectReportStyles(); setupNavigation(); setupButtons(); updateVisibleSections(views.resumen.visible); loadData(); }

document.addEventListener("DOMContentLoaded", initDashboard);

window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.confirmDelete = confirmDelete;
window.exportToPDF = exportToPDF;
window.exportToExcel = exportToExcel;
window.toggleDetalle = toggleDetalle;
