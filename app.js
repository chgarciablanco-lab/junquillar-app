/* ============================================================
   JUNQO – Casa Junquillar  |  app.js
   ============================================================ */

/* ── KPIs ─────────────────────────────────────────────────── */
const kpis = [
  {title:"Inversión total (Costo Neto)", value:"$ 80.209.999", delta:"↑ 44,6%", type:"up",   footer:"Dic 2025 – Abr 2026 · 99 documentos"},
  {title:"IVA Crédito Fiscal",           value:"$ 15.198.267", delta:"↑ 19,0%", type:"up",   footer:"86 docs CF · Art. 23 D.L. 825 recuperable"},
  {title:"Total Activo Contable",        value:"$ 95.408.266", delta:"↑ 0,0%",  type:"up",   footer:"Obra en Curso + IVA CF"},
  {title:"Documentos registrados",       value:"99 docs",      delta:"↑ 34",    type:"up",   footer:"84 FA · 2 GD · 13 BE"}
];

/* ── GASTOS ─────────────────────────────────────────────────
   Los gastos reales se cargan desde Supabase:
   public.gastos_junquillar_app

   Columnas esperadas en Supabase:
   fecha, proveedor, rut, tipo_documento, numero_documento, iva, total,
   metodo_pago, proyecto, observacion, foto_url, estado_ocr, neto,
   categoria, foto_path

   Si Supabase no está configurado o falla, la tabla queda vacía
   y la app no se rompe.
────────────────────────────────────────────────────────────── */
const docs = [];
let supabaseStatus = {
  connected: false,
  loading: false,
  error: null
};

function formatoCLP(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = Number(valor);
  if (Number.isNaN(numero)) return "—";

  return numero.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  });
}

function formatoFechaCL(fecha) {
  if (!fecha) return "—";

  // Si viene como YYYY-MM-DD desde Supabase.
  if (/^\d{4}-\d{2}-\d{2}/.test(String(fecha))) {
    const [yyyy, mm, dd] = String(fecha).slice(0, 10).split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  return String(fecha);
}

function parseMontoCLP(valorFormateado) {
  if (!valorFormateado || valorFormateado === "—") return 0;
  return Number(String(valorFormateado).replace(/[^0-9-]/g, "")) || 0;
}

function getCategoriaClass(categoria = "") {
  const cat = String(categoria || "").toLowerCase();

  if (cat.includes("material")) return "cat-materiales";
  if (cat.includes("mano")) return "cat-mano";
  if (cat.includes("servicio")) return "cat-servicios";
  if (cat.includes("herramienta")) return "cat-herramientas";
  if (cat.includes("transporte")) return "cat-transporte";
  if (cat.includes("aliment")) return "cat-servicios";

  return "cat-otros";
}

function normalizarTipoDocumento(tipo = "") {
  const t = String(tipo || "").toLowerCase();

  if (t.includes("factura") || t === "fa") return "FA";
  if (t.includes("guía") || t.includes("guia") || t === "gd") return "GD";
  if (t.includes("boleta") || t === "be") return "BE";

  return tipo || "—";
}

function mapSupabaseGastoToDoc(gasto) {
  const ivaNumero = Number(gasto.iva || 0);
  const netoNumero = Number(gasto.neto || 0);
  const totalNumero = Number(gasto.total || 0);

  return {
    id: gasto.id,
    date: formatoFechaCL(gasto.fecha),
    fechaISO: gasto.fecha || "",
    name: gasto.proveedor || "Pendiente OCR",
    rut: gasto.rut || "—",
    tipo: normalizarTipoDocumento(gasto.tipo_documento),
    numero: gasto.numero_documento || "—",
    cat: gasto.categoria || "Sin categoría",
    catCls: getCategoriaClass(gasto.categoria),
    costo: formatoCLP(netoNumero),
    iva: formatoCLP(ivaNumero),
    total: formatoCLP(totalNumero),
    cf: ivaNumero > 0 ? "✔" : "—",
    pago: gasto.metodo_pago || "—",
    proyecto: gasto.proyecto || "Junquillar",
    observacion: gasto.observacion || "",
    estadoOcr: gasto.estado_ocr || "pendiente",
    fotoUrl: gasto.foto_url || null,
    fotoPath: gasto.foto_path || null,
    createdAt: gasto.created_at || null
  };
}

async function cargarGastosDesdeSupabase() {
  if (typeof supabaseClient === "undefined") {
    console.warn("Supabase no está configurado. Revisa supabaseClient.js.");
    supabaseStatus = {
      connected: false,
      loading: false,
      error: "Supabase no configurado"
    };
    renderDocs(3);
    return;
  }

  supabaseStatus = {
    connected: false,
    loading: true,
    error: null
  };

  const { data, error } = await supabaseClient
    .from("gastos_junquillar_app")
    .select("*")
    .eq("proyecto", "Junquillar")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando gastos desde Supabase:", error);
    supabaseStatus = {
      connected: false,
      loading: false,
      error: error.message || "Error Supabase"
    };
    renderDocs(3);
    return;
  }

  docs.length = 0;
  docs.push(...(data || []).map(mapSupabaseGastoToDoc));

  filteredDocs = [...docs];

  supabaseStatus = {
    connected: true,
    loading: false,
    error: null
  };

  actualizarKPIsDesdeDocs();

  const activeView = document.querySelector(".nav-btn.active")?.dataset.view || "resumen";
  renderDocs(activeView === "gastos" ? 10 : 3);
}

function actualizarKPIsDesdeDocs() {
  const totalNeto = docs.reduce((acc, d) => acc + parseMontoCLP(d.costo), 0);
  const totalIva = docs.reduce((acc, d) => acc + parseMontoCLP(d.iva), 0);
  const totalActivo = totalNeto + totalIva;
  const docsConCF = docs.filter(d => d.cf === "✔").length;
  const avance = totalNeto > 0 ? Math.min((totalNeto / 180000000) * 100, 100) : 0;

  kpis[0] = {
    title: "Inversión total (Costo Neto)",
    value: formatoCLP(totalNeto),
    delta: `↑ ${avance.toFixed(1).replace(".", ",")}%`,
    type: "up",
    footer: `${docs.length} documentos cargados desde Supabase`
  };

  kpis[1] = {
    title: "IVA Crédito Fiscal",
    value: formatoCLP(totalIva),
    delta: docsConCF > 0 ? `↑ ${docsConCF}` : "—",
    type: "up",
    footer: `${docsConCF} docs con IVA CF recuperable`
  };

  kpis[2] = {
    title: "Total Activo Contable",
    value: formatoCLP(totalActivo),
    delta: "↑ 0,0%",
    type: "up",
    footer: "Obra en Curso + IVA CF"
  };

  kpis[3] = {
    title: "Documentos registrados",
    value: `${docs.length} docs`,
    delta: "Supabase",
    type: "up",
    footer: "Tabla gastos_junquillar_app"
  };

  renderKPIs();
}

/* ── PROVEEDORES ──────────────────────────────────────────── */
const proveedores = [
  {n:1,  name:"CSS Asesorías y Construcción Ltda.", rut:"77.340.307-4", cat:"Mano de obra",  catCls:"cat-mano",        docs:3,  costo:"$ 35.202.811", iva:"$ 6.688.533", pct:"43,9%"},
  {n:2,  name:"Ebema S.A.",                         rut:"83.585.400-0", cat:"Materiales",    catCls:"cat-materiales",  docs:7,  costo:"$ 10.391.045", iva:"$ 1.974.298", pct:"13,0%"},
  {n:3,  name:"Solusip SPA",                        rut:"76.874.595-1", cat:"Materiales",    catCls:"cat-materiales",  docs:2,  costo:"$ 9.848.740",  iva:"$ 1.871.260", pct:"12,3%"},
  {n:4,  name:"Hormigones Polpaico S.A.",            rut:"76.084.154-4", cat:"Materiales",    catCls:"cat-materiales",  docs:4,  costo:"$ 7.465.217",  iva:"$ 1.418.391", pct:"9,3%"},
  {n:5,  name:"Guillermo Eliseo Díaz Olave",         rut:"10.789.987-1", cat:"Servicios",     catCls:"cat-servicios",   docs:3,  costo:"$ 5.000.000",  iva:"$ 950.000",   pct:"6,2%"},
  {n:6,  name:"Formación de Aceros S.A.",            rut:"95.672.000-1", cat:"Materiales",    catCls:"cat-materiales",  docs:1,  costo:"$ 4.204.131",  iva:"$ 798.785",   pct:"5,2%"},
  {n:7,  name:"Oscar Atala y Ernesto Contreras Ltda.",rut:"78.792.230-9",cat:"Servicios",     catCls:"cat-servicios",   docs:2,  costo:"$ 3.077.675",  iva:"$ 584.759",   pct:"3,8%"},
  {n:8,  name:"Sodimac S.A.",                        rut:"96.792.430-K", cat:"Materiales",    catCls:"cat-materiales",  docs:8,  costo:"$ 1.022.836",  iva:"$ 194.339",   pct:"1,3%"},
  {n:9,  name:"Ferretería Industrial SyC Ltda.",     rut:"76.884.923-4", cat:"Materiales",    catCls:"cat-materiales",  docs:9,  costo:"$ 537.516",    iva:"$ 102.129",   pct:"0,7%"},
  {n:10, name:"Bosamaq SPA",                         rut:"77.073.449-5", cat:"Servicios",     catCls:"cat-servicios",   docs:2,  costo:"$ 520.000",    iva:"$ 98.800",    pct:"0,6%"},
  {n:11, name:"Hojalatería Talk-Tec SPA",            rut:"77.570.212-5", cat:"Servicios",     catCls:"cat-servicios",   docs:1,  costo:"$ 453.782",    iva:"$ 86.219",    pct:"0,6%"},
  {n:12, name:"Acenor Aceros del Norte S.A.",        rut:"77.660.960-9", cat:"Materiales",    catCls:"cat-materiales",  docs:1,  costo:"$ 367.772",    iva:"$ 69.877",    pct:"0,5%"},
  {n:13, name:"Mauricio Eugenio Nuñez Moreno",       rut:"16.002.577-8", cat:"Servicios",     catCls:"cat-servicios",   docs:3,  costo:"$ 345.000",    iva:"$ 65.550",    pct:"0,4%"},
  {n:14, name:"Soc. Comercial Betrental Ltda.",      rut:"77.040.509-2", cat:"Servicios",     catCls:"cat-servicios",   docs:1,  costo:"$ 300.000",    iva:"$ 57.000",    pct:"0,4%"},
  {n:15, name:"RLB Construcciones SPA",              rut:"77.331.893-K", cat:"Herramientas",  catCls:"cat-herramientas", docs:10, costo:"$ 199.633",   iva:"$ 37.930",    pct:"0,2%"},
  {n:16, name:"Hormigones La Promesa SPA",           rut:"77.539.021-2", cat:"Materiales",    catCls:"cat-materiales",  docs:1,  costo:"$ 185.546",    iva:"$ 35.254",    pct:"0,2%"},
  {n:17, name:"Energyfusion SPA",                    rut:"77.514.352-5", cat:"Materiales",    catCls:"cat-materiales",  docs:1,  costo:"$ 175.000",    iva:"$ 33.250",    pct:"0,2%"},
  {n:18, name:"Copec (Cabo de Hornos Ltda.)",        rut:"76.416.244-7", cat:"Transporte",    catCls:"cat-transporte",  docs:8,  costo:"$ 151.230",    iva:"—",           pct:"0,2%"},
  {n:19, name:"Aceros Talca S.A.",                   rut:"96.978.630-3", cat:"Materiales",    catCls:"cat-materiales",  docs:1,  costo:"$ 133.160",    iva:"$ 25.300",    pct:"0,2%"},
  {n:20, name:"Easy Retail S.A.",                    rut:"76.568.660-1", cat:"Materiales",    catCls:"cat-materiales",  docs:5,  costo:"$ 122.124",    iva:"$ 23.204",    pct:"0,2%"}
];

/* ── CONTROL DE COSTOS ────────────────────────────────────── */
const costosCat = [
  {cat:"Materiales",   tipo:"Directo",   dic:"$ 17.544.029", ene:"$ 12.180.784", feb:"$ 3.419.397",  mar:"$ 1.733.915", abr:"—",           total:"$ 34.878.125", pct:43.5},
  {cat:"Mano de obra", tipo:"Directo",   dic:"$ 10.714.034", ene:"$ 7.679.691",  feb:"$ 16.809.086", mar:"—",           abr:"—",           total:"$ 35.202.811", pct:43.9},
  {cat:"Servicios",    tipo:"Indirecto", dic:"$ 1.420.035",  ene:"$ 3.479.675",  feb:"$ 2.237.500",  mar:"$ 913.782",   abr:"$ 1.775.000", total:"$ 9.825.992",  pct:12.3},
  {cat:"Herramientas", tipo:"Indirecto", dic:"$ 49.520",     ene:"$ 85.590",     feb:"$ 16.731",     mar:"—",           abr:"—",           total:"$ 151.841",    pct:0.2},
  {cat:"Transporte",   tipo:"Indirecto", dic:"$ 40.248",     ene:"$ 110.982",    feb:"—",            mar:"—",           abr:"—",           total:"$ 151.230",    pct:0.2}
];

const etapas = [
  {etapa:"Movimiento de tierra", partidas:"Trabajos previos · Trazados y niveles",                                                           real:"$ 2.597.330",  presup:"$ 9.000.000",  pct:28.9,  estado:"en-curso"},
  {etapa:"Obra gruesa",          partidas:"Fundaciones · Hormigones · Pavimentos · Estructura tabiques · Acero estructural",                  real:"$ 25.684.710", presup:"$ 72.000.000", pct:35.7,  estado:"en-curso"},
  {etapa:"Techumbre",            partidas:"Estructura techumbre · Aislación · Cubierta · Impermeabilización",                                 real:"$ 17.284.115", presup:"$ 27.000.000", pct:64.0,  estado:"en-curso"},
  {etapa:"Terminaciones",        partidas:"Revestimientos · Porcelanatos · Cielos · Puertas · Molduras · Pinturas",                           real:"$ 16.517.507", presup:"$ 45.000.000", pct:36.7,  estado:"pendiente"},
  {etapa:"Instalaciones",        partidas:"Instalaciones eléctricas, sanitarias y gas",                                                       real:"$ 18.126.337", presup:"$ 27.000.000", pct:67.1,  estado:"en-curso"}
];

const hitos = [
  {area:"Obra gruesa",      estado:"en-curso",   desc:"Hormigones y estructura avanzados",          responsable:"CSS Asesorías y Construcción Ltda.",   fecha:"En ejecución"},
  {area:"Techumbre",        estado:"en-curso",   desc:"Cubierta e impermeabilización en proceso",    responsable:"Solusip SPA",                          fecha:"En ejecución"},
  {area:"Instalaciones",    estado:"en-curso",   desc:"Eléctrica y sanitaria en ejecución",          responsable:"Oscar Atala y Ernesto Contreras Ltda.", fecha:"Esta semana"},
  {area:"Terminaciones",    estado:"pendiente",  desc:"Revestimientos y pinturas pendientes",        responsable:"Por asignar",                          fecha:"Próxima etapa"},
  {area:"Permisos",         estado:"pendiente",  desc:"Recepción municipal pendiente",               responsable:"Administrador del proyecto",            fecha:"Al término obra"},
  {area:"Documentación",    estado:"observado",  desc:"4 documentos sin imputar",                    responsable:"Christian García Blanco",              fecha:"Urgente"}
];

/* ── IVA / CAJA ───────────────────────────────────────────── */
const ivaMes = [
  {mes:"Dic 2025", docs:24, base:"$ 29.705.318", cf:"$ 5.644.010",  acum:"$ 5.644.010"},
  {mes:"Ene 2026", docs:29, base:"$ 23.390.647", cf:"$ 4.444.223",  acum:"$ 10.088.233"},
  {mes:"Feb 2026", docs:29, base:"$ 22.472.214", cf:"$ 4.269.721",  acum:"$ 14.357.954"},
  {mes:"Mar 2026", docs:3,  base:"$ 2.647.697",  cf:"$ 503.063",    acum:"$ 14.861.017"},
  {mes:"Abr 2026", docs:1,  base:"$ 1.775.000",  cf:"$ 337.250",    acum:"$ 15.198.267"}
];

const ivaTipos = [
  {tipo:"Factura afecta",   docs:84, base:"$ 78.130.623", iva:"$ 14.771.468", cf:"✔", criterio:"Costo=Neto, IVA=CF"},
  {tipo:"Guía de Despacho", docs:2,  base:"$ 1.860.253",  iva:"$ 426.799",    cf:"✔", criterio:"Costo=Neto, IVA=CF"},
  {tipo:"Boleta exenta",    docs:13, base:"$ 219.123",    iva:"—",            cf:"✘", criterio:"Costo=Total (sin IVA)"}
];

/* ── ALERTAS ──────────────────────────────────────────────── */
const alerts = [
  {icon:"📄", title:"4 documentos sin imputar",        sub:"Faltan categoría contable y forma de pago"},
  {icon:"⚠️", title:"Terminaciones sobre presupuesto", sub:"Costo real supera estimado en 6,3%"},
  {icon:"💵", title:"IVA CF $ 15.198.267 acumulado",   sub:"Recuperar en F29 SII próximo período"},
  {icon:"📅", title:"Hito crítico: Instalaciones",     sub:"Eléctrica y sanitaria pendiente esta semana"}
];

/* ── PAGINACIÓN ───────────────────────────────────────────── */
let docsVisible = 3;
const DOCS_PAGE = 5;
let filteredDocs = [...docs];

/* ── VIEWS ────────────────────────────────────────────────── */
const views = {
  resumen:     {title:"Resumen",             subtitle:"Vista ejecutiva del proyecto · Dic 2025 – Abr 2026",    visible:["section-kpis","section-upload","section-docs","section-alerts","section-bottom"]},
  control:     {title:"Control de Proyecto", subtitle:"Avance físico, presupuesto y hitos · Casa Junquillar",  visible:["section-control"]},
  gastos:      {title:"Gastos",              subtitle:"Libro de gastos completo · 99 registros",               visible:["section-filtro-solo","section-docs","section-alerts"]},
  documentos:  {title:"Documentos",          subtitle:"Adjuntar y buscar documentos del proyecto",             visible:["section-upload"]},
  proveedores: {title:"Proveedores",         subtitle:"Análisis de proveedores · 34 proveedores",             visible:["section-proveedores"]},
  caja:        {title:"Caja e IVA",          subtitle:"Liquidez e IVA Crédito Fiscal · D.L. 825",             visible:["section-caja"]},
  balance:     {title:"Balance",             subtitle:"Balance general formato contable · Al 01/04/2026",      visible:["section-balance"]},
  reportes:    {title:"Reportes",            subtitle:"Exportar para contador, socio o banco",                 visible:["section-reportes"]}
};

const ALL_SECTION_IDS = [
  "section-kpis","section-upload","section-docs","section-alerts","section-bottom",
  "section-control","section-proveedores","section-caja","section-balance","section-reportes","section-filtro-solo"
];

/* ── RENDER KPIs ──────────────────────────────────────────── */
function renderKPIs() {
  const el = document.getElementById("section-kpis");
  if (!el) return;
  el.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-top">
        <div><div class="kpi-title">${k.title}</div><div class="kpi-value">${k.value}</div></div>
        <span class="badge ${k.type}">${k.delta}</span>
      </div>
      <div class="kpi-footer">${k.footer}</div>
    </div>`).join("");
}

/* ── RENDER ALERTAS ───────────────────────────────────────── */
function renderAlerts() {
  const el = document.getElementById("alerts-list");
  if (!el) return;
  el.innerHTML = alerts.map(a => `
    <div class="alert-item">
      <div class="alert-icon">${a.icon}</div>
      <div><div class="alert-title">${a.title}</div><div class="alert-sub">${a.sub}</div></div>
    </div>`).join("");
}

/* ── RENDER GASTOS ────────────────────────────────────────── */
function renderDocsRows() {
  const el  = document.getElementById("docs-table");
  const btn = document.getElementById("load-more-btn");
  const sub = document.getElementById("docs-subtitle");
  if (!el) return;
  const visible = filteredDocs.slice(0, docsVisible);

  if (!filteredDocs.length) {
    const mensaje = supabaseStatus.error
      ? `No se pudieron cargar gastos desde Supabase: ${supabaseStatus.error}`
      : "No hay gastos cargados todavía. Sube registros a Supabase para verlos aquí.";

    el.innerHTML = `
      <div class="table-row gastos-row">
        <div class="doc-date">—</div>
        <div class="doc-name">${mensaje}</div>
        <div class="doc-rut">—</div>
        <div class="doc-tipo">—</div>
        <div><span class="cat-badge cat-otros">Sin datos</span></div>
        <div class="doc-amount">—</div>
        <div class="doc-amount">—</div>
        <div class="doc-amount">—</div>
        <div class="doc-cf">—</div>
        <div class="doc-pago">—</div>
        <div class="doc-actions">—</div>
      </div>
    `;
    if (sub) sub.textContent = supabaseStatus.loading
      ? "Cargando registros desde Supabase..."
      : "0 registros · Sin datos cargados";
    if (btn) btn.style.display = "none";
    return;
  }

  el.innerHTML = visible.map(d => `
    <div class="table-row gastos-row">
      <div class="doc-date">${d.date}</div>
      <div class="doc-name">${d.name}</div>
      <div class="doc-rut">${d.rut}</div>
      <div class="doc-tipo">${d.tipo}</div>
      <div><span class="cat-badge ${d.catCls}">${d.cat}</span></div>
      <div class="doc-amount">${d.costo}</div>
      <div class="doc-amount">${d.iva}</div>
      <div class="doc-amount">${d.total}</div>
      <div class="doc-cf">${d.cf}</div>
      <div class="doc-pago">${d.pago}</div>
      <div class="doc-actions">
        <button class="action-btn" title="Editar">✏️</button>
        <button class="action-btn" title="Eliminar">🗑️</button>
      </div>
    </div>`).join("");

  if (sub) {
    const origen = supabaseStatus.connected ? "Supabase" : "local";
    sub.textContent = `${filteredDocs.length} registros · Origen: ${origen} · FA = Factura Afecta · GD = Guía de Despacho · BE = Boleta Exenta`;
  }

  if (btn) btn.style.display = docsVisible >= filteredDocs.length ? "none" : "inline-flex";
}

function renderDocs(initialCount) {
  docsVisible = initialCount || 3;
  filteredDocs = [...docs];
  renderDocsRows();
  const btn = document.getElementById("load-more-btn");
  if (btn) {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.textContent = "Ver más";
    newBtn.addEventListener("click", () => {
      docsVisible = Math.min(docsVisible + DOCS_PAGE, filteredDocs.length);
      renderDocsRows();
    });
  }
}

function applyFilters() {
  const txt = (
    document.getElementById("filter-text")?.value ||
    document.getElementById("filter-text-gastos")?.value ||
    ""
  ).toLowerCase();

  const cat = (
    document.getElementById("filter-cat")?.value ||
    document.getElementById("filter-cat-gastos")?.value ||
    ""
  );

  const tipo = (
    document.getElementById("filter-tipo")?.value ||
    document.getElementById("filter-tipo-gastos")?.value ||
    ""
  );

  const pago = document.getElementById("filter-pago")?.value || "";

  const desde = (
    document.getElementById("filter-desde")?.value ||
    document.getElementById("filter-desde-gastos")?.value ||
    ""
  );

  const hasta = (
    document.getElementById("filter-hasta")?.value ||
    document.getElementById("filter-hasta-gastos")?.value ||
    ""
  );
  filteredDocs = docs.filter(d => {
    const name = String(d.name || "").toLowerCase();
    const rut = String(d.rut || "").toLowerCase();
    const categoria = String(d.cat || "");
    const tipoDoc = String(d.tipo || "");
    const metodo = String(d.pago || "");

    if (txt && !name.includes(txt) && !rut.includes(txt)) return false;
    if (cat && categoria !== cat) return false;
    if (tipo && tipoDoc !== tipo) return false;
    if (pago && metodo !== pago) return false;
    if (desde && d.fechaISO && d.fechaISO < desde) return false;
    if (hasta && d.fechaISO && d.fechaISO > hasta) return false;
    return true;
  });
  docsVisible = 10;
  renderDocsRows();
}

function clearFilters() {
  [
    "filter-text","filter-cat","filter-tipo","filter-pago","filter-desde","filter-hasta",
    "filter-text-gastos","filter-cat-gastos","filter-tipo-gastos","filter-desde-gastos","filter-hasta-gastos"
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  filteredDocs = [...docs];
  docsVisible = 3;
  renderDocsRows();
}

/* ── RENDER CONTROL DE PROYECTO ───────────────────────────── */
function renderControl() {
  /* KPIs de control */
  const kpiEl = document.getElementById("control-kpis");
  if (kpiEl) {
    const ctrlKpis = [
      {label:"Costo ejecutado",     value:"$ 80.209.999", sub:"de $ 180.000.000 presupuestado", pct:44.6, color:"up"},
      {label:"Costo por m²",        value:"$ 948.474",    sub:"sobre 190 m² útiles",            pct:null, color:"up"},
      {label:"Desviación",          value:"-$ 99.790.001",sub:"vs presupuesto construcción",    pct:null, color:"down"},
      {label:"Avance presupuesto",  value:"44,6%",        sub:"5 etapas activas",               pct:44.6, color:"up"}
    ];
    kpiEl.innerHTML = ctrlKpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-top">
          <div><div class="kpi-title">${k.label}</div><div class="kpi-value">${k.value}</div></div>
          <span class="badge ${k.color}">${k.color === "up" ? "↑" : "↓"}</span>
        </div>
        <div class="kpi-footer">${k.sub}</div>
      </div>`).join("");
  }

  /* Etapas */
  const etEl = document.getElementById("control-etapas");
  if (etEl) {
    etEl.innerHTML = etapas.map(e => {
      const desv = parseInt(e.real.replace(/\D/g,"")) - parseInt(e.presup.replace(/\D/g,""));
      const desvFmt = desv < 0 ? `-$ ${Math.abs(desv).toLocaleString("es-CL")}` : `+$ ${desv.toLocaleString("es-CL")}`;
      const estadoCls = {pendiente:"estado-pendiente","en-curso":"estado-activo",terminado:"estado-ok"}[e.estado] || "";
      return `<div class="etapa-card">
        <div class="etapa-header">
          <div class="etapa-nombre">${e.etapa}</div>
          <span class="estado-badge ${estadoCls}">${e.estado === "en-curso" ? "En curso" : e.estado === "pendiente" ? "Pendiente" : "Terminado"}</span>
        </div>
        <div class="etapa-partidas">${e.partidas}</div>
        <div class="etapa-progress-wrap">
          <div class="etapa-progress-bar">
            <div class="etapa-progress-fill" style="width:${e.pct}%"></div>
          </div>
          <span class="etapa-pct">${e.pct}%</span>
        </div>
        <div class="etapa-nums">
          <div class="etapa-num"><span class="etapa-lbl">Real</span><span class="etapa-val">${e.real}</span></div>
          <div class="etapa-num"><span class="etapa-lbl">Presupuesto</span><span class="etapa-val">${e.presup}</span></div>
          <div class="etapa-num"><span class="etapa-lbl">Desviación</span><span class="etapa-val ${desv < 0 ? "desv-neg" : "desv-pos"}">${desvFmt}</span></div>
        </div>
      </div>`;
    }).join("");
  }

  /* Hitos */
  const hitosEl = document.getElementById("control-hitos");
  if (hitosEl) {
    hitosEl.innerHTML = hitos.map(h => {
      const cls = {pendiente:"estado-pendiente","en-curso":"estado-activo",observado:"estado-obs"}[h.estado] || "";
      const icon = {pendiente:"⏳","en-curso":"🔨",observado:"⚠️"}[h.estado] || "•";
      return `<div class="hito-card">
        <div class="hito-icon">${icon}</div>
        <div class="hito-body">
          <div class="hito-area">${h.area}</div>
          <div class="hito-desc">${h.desc}</div>
          <div class="hito-meta"><span class="hito-resp">👤 ${h.responsable}</span><span class="hito-fecha">📅 ${h.fecha}</span></div>
        </div>
        <span class="estado-badge ${cls}">${h.estado === "en-curso" ? "En curso" : h.estado === "pendiente" ? "Pendiente" : "Observado"}</span>
      </div>`;
    }).join("");
  }

  /* Costos por categoría */
  const catEl = document.getElementById("control-cat");
  if (catEl) {
    catEl.innerHTML = costosCat.map(c => `
      <div class="table-row ctrl-cat-row">
        <div class="doc-name">${c.cat}</div>
        <div><span class="tipo-badge ${c.tipo === "Directo" ? "tipo-directo" : "tipo-indirecto"}">${c.tipo}</span></div>
        <div class="doc-amount">${c.dic}</div>
        <div class="doc-amount">${c.ene}</div>
        <div class="doc-amount">${c.feb}</div>
        <div class="doc-amount">${c.mar}</div>
        <div class="doc-amount">${c.abr}</div>
        <div class="doc-amount"><strong>${c.total}</strong></div>
        <div class="prov-pct">
          <div class="prov-bar-wrap"><div class="prov-bar" style="width:${c.pct}%"></div></div>
          <span>${c.pct}%</span>
        </div>
      </div>`).join("");
  }
}

/* ── RENDER PROVEEDORES ───────────────────────────────────── */
function renderProveedores() {
  const el = document.getElementById("proveedores-table");
  if (!el) return;
  el.innerHTML = proveedores.map(p => `
    <div class="table-row prov-row">
      <div class="prov-n">${p.n}</div>
      <div class="doc-name">${p.name}</div>
      <div class="doc-rut">${p.rut}</div>
      <div><span class="cat-badge ${p.catCls}">${p.cat}</span></div>
      <div class="doc-amount">${p.docs}</div>
      <div class="doc-amount">${p.costo}</div>
      <div class="doc-amount">${p.iva}</div>
      <div class="prov-pct">
        <div class="prov-bar-wrap"><div class="prov-bar" style="width:${parseFloat(p.pct)}%"></div></div>
        <span>${p.pct}</span>
      </div>
    </div>`).join("");
}

/* ── RENDER CAJA ──────────────────────────────────────────── */
function renderCaja() {
  const tipos   = document.getElementById("caja-tipos");
  const mensual = document.getElementById("caja-mensual");
  if (tipos) tipos.innerHTML = ivaTipos.map(t => `
    <div class="caja-tipos-row">
      <div class="doc-name">${t.tipo}</div>
      <div class="doc-amount">${t.docs}</div>
      <div class="doc-amount">${t.base}</div>
      <div class="doc-amount">${t.iva}</div>
      <div><span class="cf-badge ${t.cf === "✔" ? "cf-ok" : "cf-no"}">${t.cf} ${t.cf === "✔" ? "Recuperable" : "Sin IVA"}</span></div>
      <div class="doc-tipo">${t.criterio}</div>
    </div>`).join("");
  if (mensual) mensual.innerHTML = ivaMes.map(m => `
    <div class="caja-mensual-row">
      <div class="doc-name">${m.mes}</div>
      <div class="doc-amount">${m.docs}</div>
      <div class="doc-amount">${m.base}</div>
      <div class="doc-amount iva-cf">${m.cf}</div>
      <div class="doc-amount">${m.acum}</div>
    </div>`).join("");
}

/* ── RENDER BALANCE ───────────────────────────────────────── */
function renderBalance() {
  const el = document.getElementById("balance-table");
  if (!el) return;
  const secciones = [
    {
      label:"1. ACTIVO CORRIENTE",
      rows:[
        {n:"1",cuenta:"11100 · IVA Crédito Fiscal (FA + GD)",debe:"$ 15.198.267",haber:"—",deudor:"$ 15.198.267",acreedor:"—",activo:"$ 15.198.267",pasivo:"—",perdida:"—",ganancia:"—"}
      ],
      sub:{debe:"$ 15.198.267",haber:"—",deudor:"$ 15.198.267",acreedor:"—",activo:"$ 15.198.267",pasivo:"—",perdida:"—",ganancia:"—"}
    },
    {
      label:"2. ACTIVO NO CORRIENTE — OBRA EN CURSO",
      rows:[
        {n:"2",cuenta:"12100 · Obra en Curso — Materiales",          debe:"$ 34.878.125",haber:"—",deudor:"$ 34.878.125",acreedor:"—",activo:"$ 34.878.125",pasivo:"—",perdida:"—",ganancia:"—"},
        {n:"3",cuenta:"12200 · Obra en Curso — Mano de Obra Directa", debe:"$ 35.202.811",haber:"—",deudor:"$ 35.202.811",acreedor:"—",activo:"$ 35.202.811",pasivo:"—",perdida:"—",ganancia:"—"},
        {n:"4",cuenta:"12300 · Obra en Curso — Servicios y Subcontratos",debe:"$ 9.825.992",haber:"—",deudor:"$ 9.825.992",acreedor:"—",activo:"$ 9.825.992",pasivo:"—",perdida:"—",ganancia:"—"},
        {n:"5",cuenta:"12400 · Obra en Curso — Herramientas y Equipos", debe:"$ 151.841",  haber:"—",deudor:"$ 151.841",  acreedor:"—",activo:"$ 151.841",  pasivo:"—",perdida:"—",ganancia:"—"},
        {n:"6",cuenta:"12500 · Obra en Curso — Transporte y Logística", debe:"$ 151.230",  haber:"—",deudor:"$ 151.230",  acreedor:"—",activo:"$ 151.230",  pasivo:"—",perdida:"—",ganancia:"—"}
      ],
      sub:{debe:"$ 80.209.999",haber:"—",deudor:"$ 80.209.999",acreedor:"—",activo:"$ 80.209.999",pasivo:"—",perdida:"—",ganancia:"—"}
    },
    {
      label:"3. PASIVO",
      rows:[{n:"7",cuenta:"31000 · Pasivos (No informado)",debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"}],
      sub:{debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"}
    },
    {
      label:"4. PATRIMONIO",
      rows:[{n:"8",cuenta:"41000 · Capital Proyecto (No determinado)",debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"}],
      sub:{debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"}
    },
    {
      label:"5. RESULTADOS DEL EJERCICIO",
      rows:[
        {n:"",cuenta:"51000 · Ingresos  ← No registrados (proyecto en construcción)",debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"},
        {n:"",cuenta:"52000 · Costos ← Activados como Obra en Curso (no como gasto)",debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"},
        {n:"",cuenta:"RESULTADO DEL EJERCICIO ← Indeterminado (sin ingresos realizados)",debe:"—",haber:"—",deudor:"—",acreedor:"—",activo:"—",pasivo:"—",perdida:"—",ganancia:"—"}
      ],
      sub:null
    }
  ];
  let html = "";
  secciones.forEach(s => {
    html += `<div class="balance-section-header">${s.label}</div>`;
    s.rows.forEach(r => {
      html += `<div class="table-row balance-row">
        <div class="balance-n">${r.n}</div><div class="balance-cuenta">${r.cuenta}</div>
        <div class="doc-amount">${r.debe}</div><div class="doc-amount">${r.haber}</div>
        <div class="doc-amount">${r.deudor}</div><div class="doc-amount">${r.acreedor}</div>
        <div class="doc-amount balance-activo">${r.activo}</div><div class="doc-amount">${r.pasivo}</div>
        <div class="doc-amount">${r.perdida}</div><div class="doc-amount">${r.ganancia}</div>
      </div>`;
    });
    if (s.sub) html += `<div class="table-row balance-subtotal">
      <div></div><div>SUBTOTAL</div>
      <div class="doc-amount">${s.sub.debe}</div><div class="doc-amount">${s.sub.haber}</div>
      <div class="doc-amount">${s.sub.deudor}</div><div class="doc-amount">${s.sub.acreedor}</div>
      <div class="doc-amount balance-activo">${s.sub.activo}</div><div class="doc-amount">${s.sub.pasivo}</div>
      <div class="doc-amount">${s.sub.perdida}</div><div class="doc-amount">${s.sub.ganancia}</div>
    </div>`;
  });
  html += `<div class="table-row balance-total">
    <div></div><div>TOTALES GENERALES</div>
    <div class="doc-amount">$ 95.408.266</div><div class="doc-amount">—</div>
    <div class="doc-amount">$ 95.408.266</div><div class="doc-amount">—</div>
    <div class="doc-amount balance-activo">$ 95.408.266</div><div class="doc-amount">—</div>
    <div class="doc-amount">—</div><div class="doc-amount">—</div>
  </div>`;
  el.innerHTML = html;
}

/* ── RENDER REPORTES ──────────────────────────────────────── */
function renderReportes() {
  const catEl   = document.getElementById("reportes-cat");
  const etapaEl = document.getElementById("reportes-etapas");
  if (catEl) catEl.innerHTML = costosCat.map(c => `
    <div class="table-row ctrl-cat-row">
      <div class="doc-name">${c.cat}</div>
      <div><span class="tipo-badge ${c.tipo === "Directo" ? "tipo-directo" : "tipo-indirecto"}">${c.tipo}</span></div>
      <div class="doc-amount">${c.dic}</div><div class="doc-amount">${c.ene}</div>
      <div class="doc-amount">${c.feb}</div><div class="doc-amount">${c.mar}</div>
      <div class="doc-amount">${c.abr}</div>
      <div class="doc-amount"><strong>${c.total}</strong></div>
      <div class="prov-pct">
        <div class="prov-bar-wrap"><div class="prov-bar" style="width:${c.pct}%"></div></div>
        <span>${c.pct}%</span>
      </div>
    </div>`).join("");
  if (etapaEl) etapaEl.innerHTML = etapas.map(e => {
    const desv = parseInt(e.real.replace(/\D/g,"")) - parseInt(e.presup.replace(/\D/g,""));
    const desvFmt = `-$ ${Math.abs(desv).toLocaleString("es-CL")}`;
    return `<div class="etapa-reporte-row">
      <div class="doc-name">${e.etapa}</div>
      <div class="doc-amount">${e.real}</div>
      <div class="doc-amount">${e.presup}</div>
      <div class="doc-amount desv-neg">${desvFmt}</div>
      <div class="prov-pct">
        <div class="prov-bar-wrap"><div class="prov-bar prov-bar-etapa" style="width:${e.pct}%"></div></div>
        <span>${e.pct}%</span>
      </div>
    </div>`;
  }).join("");
}

/* ── RENDER BOTTOM CARDS ──────────────────────────────────── */
function renderBottomCards() {
  const el = document.getElementById("section-bottom");
  if (!el) return;
  const cards = [
    {label:"Terreno aportado",    value:"$ 100.000.000", sub:"Base de activo del proyecto",                       icon:"🏢"},
    {label:"Etapas activas",      value:"5",             sub:"Mov. tierra · Obra gruesa · Techumbre · Term. · Inst.", icon:"📋"},
    {label:"Respaldo tributario", value:"87%",           sub:"86 de 99 docs con IVA CF recuperable",              icon:"🛡️"},
    {label:"Avance presupuesto",  value:"44,6%",         sub:"$ 80,2M de $ 180M presupuestado",                   icon:"🏗️"}
  ];
  el.innerHTML = cards.map(c => `
    <div class="bottom-card">
      <div class="bottom-top"><div class="bottom-label">${c.label}</div><div>${c.icon}</div></div>
      <div class="bottom-value">${c.value}</div>
      <div class="bottom-sub">${c.sub}</div>
    </div>`).join("");
}

/* ── EXPORT HELPERS ───────────────────────────────────────── */
function toCSV(rows, headers) {
  const escape = v => `"${String(v).replace(/"/g,'""')}"`;
  return [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
}
function downloadFile(content, filename, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = filename;
  a.click();
}
function exportCSV() {
  const headers = ["Fecha","Proveedor","RUT","Tipo","Categoría","Costo Neto","IVA CF","Total Doc.","CF?","Método Pago"];
  const rows = filteredDocs.map(d => [d.date,d.name,d.rut,d.tipo,d.cat,d.costo,d.iva,d.total,d.cf,d.pago]);
  downloadFile(toCSV(rows, headers), "gastos_junquillar.csv", "text/csv");
}
function exportExcel() {
  const headers = ["Fecha","Proveedor","RUT","Tipo","Categoría","Costo Neto","IVA CF","Total Doc.","CF?","Método Pago"];
  const rows = filteredDocs.map(d => [d.date,d.name,d.rut,d.tipo,d.cat,d.costo,d.iva,d.total,d.cf,d.pago]);
  // Simple TSV that Excel opens natively
  const tsv = [headers, ...rows].map(r => r.join("\t")).join("\n");
  downloadFile(tsv, "gastos_junquillar.xls", "application/vnd.ms-excel");
}
function exportProvCSV() {
  const headers = ["#","Proveedor","RUT","Categoría","N° Docs","Costo Neto","IVA CF","% Total"];
  const rows = proveedores.map(p => [p.n,p.name,p.rut,p.cat,p.docs,p.costo,p.iva,p.pct]);
  downloadFile(toCSV(rows, headers), "proveedores_junquillar.csv", "text/csv");
}
function exportProvExcel() {
  const headers = ["#","Proveedor","RUT","Categoría","N° Docs","Costo Neto","IVA CF","% Total"];
  const rows = proveedores.map(p => [p.n,p.name,p.rut,p.cat,p.docs,p.costo,p.iva,p.pct]);
  downloadFile([headers,...rows].map(r=>r.join("\t")).join("\n"), "proveedores_junquillar.xls", "application/vnd.ms-excel");
}
function exportReporteCSV() { exportCSV(); }
function exportReporteExcel() { exportExcel(); }
function exportReportePDF() {
  window.print();
}

/* ── VISIBILITY ───────────────────────────────────────────── */
function updateVisibleSections(ids = []) {
  ALL_SECTION_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("module-hidden", !ids.includes(id));
  });
}

/* ── NAVIGATION ───────────────────────────────────────────── */
function setupNavigation() {
  const btns    = document.querySelectorAll(".nav-btn[data-view]");
  const titleEl = document.getElementById("page-title");
  const subEl   = document.getElementById("page-subtitle");
  if (!btns.length) return;
  btns.forEach(btn => btn.addEventListener("click", () => {
    btns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const cfg = views[btn.dataset.view];
    if (!cfg) return;
    titleEl.textContent = cfg.title;
    subEl.textContent   = cfg.subtitle;
    updateVisibleSections(cfg.visible);
    const v = btn.dataset.view;
    if (v === "resumen") renderDocs(3);
    else if (v === "gastos") renderDocs(10);
  }));
}

/* ── INIT ─────────────────────────────────────────────────── */
function initDashboard() {
  /* Sidebar "Ver reportes" button */
  const verReportesBtn = document.getElementById('btn-ver-reportes');
  if (verReportesBtn) {
    verReportesBtn.addEventListener('click', function() {
      document.querySelector('[data-view="reportes"]').click();
    });
  }
  renderKPIs();
  renderAlerts();
  renderDocs(3);
  renderControl();
  renderProveedores();
  renderCaja();
  renderBalance();
  renderReportes();
  renderBottomCards();
  setupNavigation();
  updateVisibleSections(views.resumen.visible);
  cargarGastosDesdeSupabase();
}

document.addEventListener("DOMContentLoaded", initDashboard);