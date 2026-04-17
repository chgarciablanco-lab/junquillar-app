const kpis = [
  { title: 'Presupuesto construcción', value: '$180.000.000', delta: '↓ -2,1%', type: 'down', footer: 'Meta base de obra sin considerar venta' },
  { title: 'Costo acumulado', value: '$86.100.000', delta: '↑ +4,3%', type: 'up', footer: 'Ejecutado según documentos ingresados' },
  { title: 'IVA crédito acumulado', value: '$13.740.000', delta: '↑ +7,8%', type: 'up', footer: 'Crédito fiscal ya soportado en compras' },
  { title: 'Caja reservada impuestos', value: '$9.500.000', delta: '↓ -1,5%', type: 'down', footer: 'Seguimiento de liquidez para venta y cierre' }
];

const chartData = [
  { month: 'Ene', budget: 26, real: 24 },
  { month: 'Feb', budget: 40, real: 37 },
  { month: 'Mar', budget: 58, real: 61 },
  { month: 'Abr', budget: 73, real: 77 },
  { month: 'May', budget: 87, real: 84 },
  { month: 'Jun', budget: 96, real: 92 },
  { month: 'Jul', budget: 100, real: 98 }
];

const alerts = [
  { icon: '📄', title: '4 documentos sin imputar', sub: 'Faltan categoría contable y forma de pago' },
  { icon: '⚠️', title: 'Costo real sobre presupuesto', sub: 'Terminaciones van 6,3% sobre lo estimado' },
  { icon: '💵', title: 'IVA crédito acumulado relevante', sub: 'Revisar caja para venta y débito futuro' },
  { icon: '📅', title: 'Hito próximo', sub: 'Cerrar instalación eléctrica y sanitaria esta semana' }
];

const docs = [
  { name: 'Construmart Talca', type: 'Factura', amount: '$1.840.000', status: 'Pendiente de clasificación', cls: 's-red', date: '14 Abr' },
  { name: 'Arquitectura Proyecto', type: 'Factura', amount: '$2.200.000', status: 'Ingresada', cls: 's-green', date: '13 Abr' },
  { name: 'Maderas del Maule', type: 'Boleta', amount: '$386.500', status: 'Pendiente de respaldo', cls: 's-sky', date: '12 Abr' },
  { name: 'Ferretería Sur', type: 'Factura', amount: '$924.000', status: 'Por aprobar', cls: 's-amber', date: '11 Abr' }
];

const categories = [
  { name: 'Obra gruesa', pct: 34 },
  { name: 'Terminaciones', pct: 22 },
  { name: 'Instalaciones', pct: 18 },
  { name: 'Proyectos', pct: 8 },
  { name: 'Permisos', pct: 6 },
  { name: 'Terreno', pct: 12 }
];

const bottomCards = [
  { label: 'Terreno aportado', value: '$100.000.000', sub: 'Base de activo del proyecto', icon: '🏢' },
  { label: 'Partidas abiertas', value: '11', sub: 'Entre obra, permisos y cierre documental', icon: '📋' },
  { label: 'Respaldo tributario', value: '92%', sub: 'Documentos con soporte y clasificación correcta', icon: '🛡️' },
  { label: 'Caja disponible', value: '$21.000.000', sub: 'Liquidez de maniobra para obra y cierre', icon: '💼' }
];

function renderKPIs() {
  const el = document.getElementById('kpi-grid');
  el.innerHTML = kpis.map(kpi => `
    <div class="kpi-card">
      <div class="kpi-top">
        <div>
          <div class="kpi-title">${kpi.title}</div>
          <div class="kpi-value">${kpi.value}</div>
        </div>
        <div class="badge ${kpi.type}">${kpi.delta}</div>
      </div>
      <div class="kpi-footer">${kpi.footer}</div>
    </div>
  `).join('');
}

function renderChart() {
  document.getElementById('chart-bars').innerHTML = chartData.map(item => `
    <div class="chart-bar-group">
      <div class="bar-budget" style="height:${item.budget}%"></div>
      <div class="bar-real" style="height:${item.real}%"></div>
    </div>
  `).join('');

  document.getElementById('chart-labels').innerHTML = chartData.map(item => `
    <div class="chart-label">${item.month}</div>
  `).join('');
}

function renderAlerts() {
  const el = document.getElementById('alerts-list');
  el.innerHTML = alerts.map(alert => `
    <div class="alert-item">
      <div class="alert-icon">${alert.icon}</div>
      <div>
        <div class="alert-title">${alert.title}</div>
        <div class="alert-sub">${alert.sub}</div>
      </div>
    </div>
  `).join('');
}

function renderDocs() {
  const el = document.getElementById('docs-table');
  el.innerHTML = docs.map(doc => `
    <div class="table-row">
      <div><div class="doc-name">${doc.name}</div></div>
      <div><div>${doc.type}</div><div class="doc-amount">${doc.amount}</div></div>
      <div><span class="status ${doc.cls}">${doc.status}</span></div>
      <div class="doc-date">${doc.date}</div>
    </div>
  `).join('');
}

function renderCategories() {
  const el = document.getElementById('categories-list');
  el.innerHTML = categories.map(cat => `
    <div class="cat-item">
      <div class="cat-row">
        <div class="cat-name">${cat.name}</div>
        <div class="cat-pct">${cat.pct}%</div>
      </div>
      <div class="cat-track"><div class="cat-fill" style="width:${cat.pct}%"></div></div>
    </div>
  `).join('');
}

function renderBottomCards() {
  const el = document.getElementById('bottom-grid');
  el.innerHTML = bottomCards.map(card => `
    <div class="bottom-card">
      <div class="bottom-top">
        <div class="bottom-label">${card.label}</div>
        <div>${card.icon}</div>
      </div>
      <div class="bottom-value">${card.value}</div>
      <div class="bottom-sub">${card.sub}</div>
    </div>
  `).join('');
}

function init() {
  renderKPIs();
  renderChart();
  renderAlerts();
  renderDocs();
  renderCategories();
  renderBottomCards();
}

document.addEventListener('DOMContentLoaded', init);
