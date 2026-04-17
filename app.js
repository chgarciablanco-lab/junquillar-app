/* ============================================================
   JUNQO DASHBOARD – app.js
   ============================================================ */

/* ── DATA ─────────────────────────────────────────────────── */

const kpis = [
  {
    title: "Presupuesto construcción",
    value: "$180.000.000",
    delta: "↓ -2,1%",
    type: "down",
    footer: "Meta estimada de obra sin considerar venta"
  },
  {
    title: "Costo acumulado",
    value: "$86.100.000",
    delta: "↑ +4,3%",
    type: "up",
    footer: "Ejecutado según documentos ingresados"
  },
  {
    title: "IVA crédito acumulado",
    value: "$13.740.000",
    delta: "↑ +7,8%",
    type: "up",
    footer: "Crédito fiscal ya soportado en compras"
  },
  {
    title: "Caja reservada impuestos",
    value: "$9.500.000",
    delta: "↓ -1,5%",
    type: "down",
    footer: "Seguimiento de liquidez para venta y cierre"
  }
];

const chartData = [
  { month: "Ene", budget: 18, real: 16 },
  { month: "Feb", budget: 28, real: 25 },
  { month: "Mar", budget: 42, real: 46 },
  { month: "Abr", budget: 55, real: 58 },
  { month: "May", budget: 70, real: 68 },
  { month: "Jun", budget: 84, real: 79 },
  { month: "Jul", budget: 100, real: 92 }
];

const alerts = [
  {
    icon: "📄",
    title: "4 documentos sin imputar",
    sub: "Faltan categoría contable y forma de pago"
  },
  {
    icon: "⚠️",
    title: "Costo real sobre presupuesto",
    sub: "Terminaciones van 6,3% sobre lo estimado"
  },
  {
    icon: "💵",
    title: "IVA crédito acumulado relevante",
    sub: "Revisar caja para venta y débito futuro"
  },
  {
    icon: "📅",
    title: "Hito próximo",
    sub: "Cerrar instalación eléctrica y sanitaria esta semana"
  }
];

const docs = [
  { date: "16/04/2026", name: "Almuerzo con cliente",  cat: "Alimentación", catCls: "cat-alimentacion", amount: "$ 25.000",  pago: "Efectivo" },
  { date: "15/04/2026", name: "Combustible",           cat: "Transporte",   catCls: "cat-transporte",   amount: "$ 40.000",  pago: "Tarjeta"  },
  { date: "14/04/2026", name: "Material de oficina",   cat: "Oficina",      catCls: "cat-oficina",      amount: "$ 18.500",  pago: "Tarjeta"  },
  { date: "13/04/2026", name: "Estacionamiento",       cat: "Transporte",   catCls: "cat-transporte",   amount: "$ 5.000",   pago: "Efectivo" },
  { date: "12/04/2026", name: "Café reunión",          cat: "Alimentación", catCls: "cat-alimentacion", amount: "$ 4.500",   pago: "Efectivo" },
  { date: "11/04/2026", name: "Pasajes",               cat: "Transporte",   catCls: "cat-transporte",   amount: "$ 32.000",  pago: "Tarjeta"  },
  { date: "10/04/2026", name: "Útiles de aseo",        cat: "Hogar",        catCls: "cat-hogar",        amount: "$ 12.300",  pago: "Efectivo" },
  { date: "09/04/2026", name: "Internet oficina",      cat: "Servicios",    catCls: "cat-servicios",    amount: "$ 29.900",  pago: "Tarjeta"  },
  { date: "08/04/2026", name: "Almuerzo equipo",       cat: "Alimentación", catCls: "cat-alimentacion", amount: "$ 27.800",  pago: "Efectivo" },
  { date: "07/04/2026", name: "Papelería",             cat: "Oficina",      catCls: "cat-oficina",      amount: "$ 7.600",   pago: "Efectivo" }
];

const categories = [
  { name: "Obra gruesa",   pct: 34 },
  { name: "Terminaciones", pct: 22 },
  { name: "Instalaciones", pct: 18 },
  { name: "Proyectos",     pct: 8  },
  { name: "Permisos",      pct: 6  },
  { name: "Terreno",       pct: 12 }
];

const bottomCards = [
  {
    label: "Terreno aportado",
    value: "$100.000.000",
    sub: "Base de activo del proyecto",
    icon: "🏢"
  },
  {
    label: "Partidas abiertas",
    value: "11",
    sub: "Entre obra, permisos y cierre documental",
    icon: "📋"
  },
  {
    label: "Respaldo tributario",
    value: "92%",
    sub: "Documentos con soporte y clasificación correcta",
    icon: "🛡️"
  },
  {
    label: "Avance de obra",
    value: "68%",
    sub: "Ejecución general estimada del proyecto",
    icon: "🏗️"
  }
];

/* ── NAVIGATION CONFIG ────────────────────────────────────── */

const views = {
  inicio: {
    title: "Dashboard Junquillar",
    subtitle: "Resumen general del proyecto",
    visible: ["section-kpis", "section-charts", "section-docs", "section-bottom"]
  },
  costos: {
    title: "Costos",
    subtitle: "Control de gastos y avance presupuestario",
    visible: ["section-kpis", "section-charts", "section-docs"]
  },
  compras: {
    title: "Compras",
    subtitle: "Seguimiento de adquisiciones y proveedores",
    visible: ["section-kpis", "section-docs"]
  },
  documentos: {
    title: "Documentos",
    subtitle: "Facturas, boletas y respaldo del proyecto",
    visible: ["section-docs"]
  },
  caja: {
    title: "Caja",
    subtitle: "Liquidez disponible y movimientos del proyecto",
    visible: ["section-kpis", "section-bottom"]
  },
  balance: {
    title: "Balance",
    subtitle: "Vista general del estado financiero",
    visible: ["section-kpis", "section-bottom"]
  },
  reportes: {
    title: "Reportes",
    subtitle: "Indicadores clave y análisis resumido",
    visible: ["section-charts", "section-docs", "section-bottom"]
  }
};

/* ── RENDER FUNCTIONS ─────────────────────────────────────── */

function renderKPIs() {
  const el = document.getElementById("section-kpis");
  if (!el) return;

  el.innerHTML = kpis.map((kpi) => `
    <div class="kpi-card">
      <div class="kpi-top">
        <div>
          <div class="kpi-title">${kpi.title}</div>
          <div class="kpi-value">${kpi.value}</div>
        </div>
        <span class="badge ${kpi.type}">${kpi.delta}</span>
      </div>
      <div class="kpi-footer">${kpi.footer}</div>
    </div>
  `).join("");
}

function renderChart() {
  const bars   = document.getElementById("chart-bars");
  const labels = document.getElementById("chart-labels");
  if (!bars || !labels) return;

  const maxVal = Math.max(...chartData.map((d) => Math.max(d.budget, d.real)));

  bars.innerHTML = chartData.map((item) => `
    <div class="chart-bar-group">
      <div class="bar-budget" style="height:${Math.round((item.budget / maxVal) * 100)}%"></div>
      <div class="bar-real"   style="height:${Math.round((item.real   / maxVal) * 100)}%"></div>
    </div>
  `).join("");

  labels.innerHTML = chartData.map((item) => `
    <div class="chart-label">${item.month}</div>
  `).join("");
}

function renderAlerts() {
  const el = document.getElementById("alerts-list");
  if (!el) return;

  el.innerHTML = alerts.map((a) => `
    <div class="alert-item">
      <div class="alert-icon">${a.icon}</div>
      <div>
        <div class="alert-title">${a.title}</div>
        <div class="alert-sub">${a.sub}</div>
      </div>
    </div>
  `).join("");
}

function renderDocs() {
  const el = document.getElementById("docs-table");
  if (!el) return;

  el.innerHTML = docs.map((doc) => `
    <div class="table-row gastos-row">
      <div class="doc-date">${doc.date}</div>
      <div class="doc-name">${doc.name}</div>
      <div><span class="cat-badge ${doc.catCls}">${doc.cat}</span></div>
      <div class="doc-amount">${doc.amount}</div>
      <div class="doc-pago">${doc.pago}</div>
      <div class="doc-comprobante">📄</div>
      <div class="doc-actions">
        <button class="action-btn" title="Editar">✏️</button>
        <button class="action-btn" title="Eliminar">🗑️</button>
      </div>
    </div>
  `).join("");
}

function renderCategories() {
  const el = document.getElementById("categories-list");
  if (!el) return;

  el.innerHTML = categories.map((cat) => `
    <div class="cat-item">
      <div class="cat-row">
        <span class="cat-name">${cat.name}</span>
        <span class="cat-pct">${cat.pct}%</span>
      </div>
      <div class="cat-track">
        <div class="cat-fill" style="width:${cat.pct}%"></div>
      </div>
    </div>
  `).join("");
}

function renderBottomCards() {
  const el = document.getElementById("section-bottom");
  if (!el) return;

  el.innerHTML = bottomCards.map((card) => `
    <div class="bottom-card">
      <div class="bottom-top">
        <div class="bottom-label">${card.label}</div>
        <div class="bottom-icon">${card.icon}</div>
      </div>
      <div class="bottom-value">${card.value}</div>
      <div class="bottom-sub">${card.sub}</div>
    </div>
  `).join("");
}

/* ── MODULE VISIBILITY ────────────────────────────────────── */

const ALL_SECTION_IDS = [
  "section-kpis",
  "section-charts",
  "section-docs",
  "section-bottom"
];

function updateVisibleSections(visibleIds = []) {
  ALL_SECTION_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (visibleIds.includes(id)) {
      el.classList.remove("module-hidden");
    } else {
      el.classList.add("module-hidden");
    }
  });
}

/* ── NAVIGATION ───────────────────────────────────────────── */

function setupNavigation() {
  const buttons  = document.querySelectorAll(".nav-btn[data-view]");
  const titleEl  = document.getElementById("page-title");
  const subEl    = document.getElementById("page-subtitle");

  if (!buttons.length || !titleEl || !subEl) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const view   = btn.dataset.view;
      const config = views[view];
      if (!config) return;

      titleEl.textContent = config.title;
      subEl.textContent   = config.subtitle;

      updateVisibleSections(config.visible);
    });
  });
}

/* ── INIT ─────────────────────────────────────────────────── */

function initDashboard() {
  renderKPIs();
  renderChart();
  renderAlerts();
  renderDocs();
  renderCategories();
  renderBottomCards();
  setupNavigation();

  updateVisibleSections(views.inicio.visible);
}

document.addEventListener("DOMContentLoaded", initDashboard);