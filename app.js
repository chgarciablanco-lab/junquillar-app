/* JUNQO – Casa Junquillar | app.js */
const BUDGET_KEY = "junqo_presupuesto";
let PROJECT_BUDGET = 180000000;
const PROJECT_NAME = "Junquillar";
const BUCKET_NAME = "comprobantes-junquillar";
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_FILE_EXTENSIONS = ["jpg","jpeg","png","pdf","xls","xlsx","csv"];
const REPORT_WIDGETS_KEY = "junqo_report_widgets";

let gastos = [];
let filteredDocs = [];
let currentView = "resumen";
let docsVisibleLimit = 10;
let editModalGasto = null;

const DEFAULT_WIDGETS = ["cat","mensual","proveedores","iva","avance","documentos"];
let activeWidgets = JSON.parse(localStorage.getItem(REPORT_WIDGETS_KEY) || JSON.stringify(DEFAULT_WIDGETS));

const views = {
  resumen:     { title:"Resumen",            subtitle:"Vista ejecutiva y control del proyecto",               visible:["section-kpis","section-alerts","section-control"] },
  gastos:      { title:"Gastos",             subtitle:"Registro y control de egresos del proyecto",          visible:["section-filtro-solo","section-docs"] },
  documentos:  { title:"Documentos",         subtitle:"Carga de facturas, boletas y respaldo documental",    visible:["section-upload-only"] },
  proveedores: { title:"Proveedores",        subtitle:"Análisis por proveedor, documentos y concentración",  visible:["section-proveedores"] },
  caja:        { title:"Caja e IVA",         subtitle:"Crédito fiscal, documentos y detalle mensual",        visible:["section-caja"] },
  balance:     { title:"Balance",            subtitle:"Vista contable calculada desde los gastos registrados",visible:["section-balance"] },
  reportes:    { title:"Reportes",           subtitle:"Análisis resumido por categoría y mes",               visible:["section-reportes"] },
  ventas:       { title:"Ventas",            subtitle:"Ingresos, cotizaciones y contactos del proyecto",     visible:["section-ventas"] },
  insumos:      { title:"Insumos",           subtitle:"Control de materiales y stock en obra",               visible:["section-insumos"] },
  configuracion:{ title:"Configuración",     subtitle:"Ajustes generales del proyecto y apariencia",         visible:["section-config"] }
};

const $ = id => document.getElementById(id);

/* ── FORMATEO ─────────────────────────────────────────────── */
function numberValue(v){ if(v===null||v===undefined||v==="") return 0; const n=Number(String(v).replace(/\./g,"").replace(",",".")); return Number.isFinite(n)?n:0; }
function formatoCLP(v){ return numberValue(v).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}); }
function formatoPct(v){ return `${Number(v||0).toLocaleString("es-CL",{maximumFractionDigits:1})}%`; }
function normalizarFecha(f){ if(!f) return "—"; const r=String(f).slice(0,10); if(/^\d{4}-\d{2}-\d{2}$/.test(r)){const[y,m,d]=r.split("-");return`${d}/${m}/${y}`;}return r; }
function fechaOrdenable(f){ if(!f) return ""; if(/^\d{4}-\d{2}-\d{2}/.test(f)) return String(f).slice(0,10); if(/^\d{2}\/\d{2}\/\d{4}$/.test(f)){const[d,m,y]=f.split("/");return`${y}-${m}-${d}`;}return String(f); }
function mesLabel(f){ const x=fechaOrdenable(f); if(!x||x.length<7) return "Sin fecha"; const[y,m]=x.split("-"); const ms=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]; return`${ms[Number(m)-1]||m} ${y}`; }
function getCategoriaClass(c=""){ const cat=String(c||"").toLowerCase(); if(cat.includes("material")) return"cat-materiales"; if(cat.includes("mano")) return"cat-mano"; if(cat.includes("servicio")||cat.includes("aliment")) return"cat-servicios"; if(cat.includes("herramienta")) return"cat-herramientas"; if(cat.includes("transporte")) return"cat-transporte"; return"cat-otros"; }
function sumBy(rows,f){ return rows.reduce((a,i)=>a+numberValue(i[f]),0); }
function uniqueCount(rows,f){ return new Set(rows.map(i=>i[f]).filter(Boolean)).size; }
function groupBy(rows,fn){ return rows.reduce((a,r)=>{ const k=fn(r)||"Sin clasificar"; if(!a[k])a[k]=[]; a[k].push(r); return a; },{}); }
function emptyState(t="Sin registros."){ return`<div class="empty-state">${t}</div>`; }

function getTotals(rows=gastos){
  const neto=sumBy(rows,"neto"),iva=sumBy(rows,"iva"),total=sumBy(rows,"total"),docs=rows.length;
  const proveedores=uniqueCount(rows,"proveedor");
  const pendientesOcr=rows.filter(g=>String(g.estado_ocr||"").toLowerCase()==="pendiente").length;
  const sinProveedor=rows.filter(g=>!g.proveedor).length;
  return{neto,iva,total,docs,proveedores,pendientesOcr,sinProveedor};
}

/* ── SUPABASE ROW MAP ─────────────────────────────────────── */
function mapSupabaseRow(r){
  return{ id:r.id, fecha:r.fecha, proveedor:r.proveedor||"", rut:r.rut||"", tipo_documento:r.tipo_documento||"", numero_documento:r.numero_documento||"", iva:numberValue(r.iva), total:numberValue(r.total), metodo_pago:r.metodo_pago||"", proyecto:r.proyecto||PROJECT_NAME, observacion:r.observacion||"", foto_url:r.foto_url||"", estado_ocr:r.estado_ocr||"", created_at:r.created_at||"", neto:numberValue(r.neto), categoria:r.categoria||"", foto_path:r.foto_path||"" };
}

/* ── FILE UTILS ───────────────────────────────────────────── */
function getFileExtension(f){ return String(f||"").split(".").pop().toLowerCase(); }
function sanitizeFileName(f){ return String(f||"archivo").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_"); }
function getFileGroup(ext){ if(["jpg","jpeg","png"].includes(ext)) return"imagenes"; if(["xls","xlsx","csv"].includes(ext)) return"planillas"; return"pdf"; }

/* ── EXCEL PARSER ─────────────────────────────────────────── */
const EXACT_HEADERS={0:"fecha",1:"proveedor",2:"rut",3:"tipo_documento",4:"numero_documento",5:"neto",6:"iva",7:"total",8:"categoria",9:"metodo_pago",10:"proyecto"};
const HEADER_ALIASES={fecha:["fecha","date"],proveedor:["proveedor","supplier","nombre","razón social","razon social"],rut:["rut","r.u.t","r.u.t."],tipo_documento:["tipo","tipo documento","tipo doc","type","documento"],numero_documento:["nº documento","n° documento","numero documento","folio","nro","n°","doc"],neto:["neto","monto neto","base neta","costo neto","net","base"],iva:["iva","i.v.a","i.v.a.","tax","impuesto"],total:["total","total doc","monto total","total bruto"],categoria:["categoría","categoria","category","partida","etapa"],metodo_pago:["método de pago","metodo de pago","método pago","forma pago","pago","payment"],proyecto:["proyecto","project"]};
function normH(h){ return String(h||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(); }
function buildColMap(hr){ const known=["fecha","proveedor","rut","tipo","nº documento","neto","iva","total","categoría","método de pago","proyecto"],nr=hr.map(normH),exact=known.every((h,i)=>nr[i]&&nr[i].includes(normH(h))); if(exact){const m={};Object.entries(EXACT_HEADERS).forEach(([i,f])=>{m[f]=Number(i);});return m;} const m={};nr.forEach((n,i)=>{for(const[f,al]of Object.entries(HEADER_ALIASES)){if(m[f]!==undefined)continue;if(al.some(a=>n===normH(a)||n.includes(normH(a)))){m[f]=i;break;}}});return m; }
function toDateISO(v){ if(v===null||v===undefined||v==="") return null; if(typeof v==="number"){const d=new Date(Math.round((v-25569)*86400*1000));if(!isNaN(d))return d.toISOString().slice(0,10);}const s=String(v).trim();if(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(s)){const[d,m,y]=s.split(/[-\/]/);return`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;}if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);return null; }
function toNum(v){ if(v===null||v===undefined||v==="") return null; if(typeof v==="number") return v; const n=Number(String(v).replace(/\./g,"").replace(",",".").replace(/[^0-9.\-]/g,"")); return Number.isFinite(n)?n:null; }
function isSkipRow(row,cm){ const p=String(row[cm.proveedor??1]||"").trim().toLowerCase(),t=String(row[cm.total??7]||"").trim().toLowerCase(),n=String(row[cm.neto??5]||"").trim().toLowerCase(); if(!row.some(c=>String(c||"").trim()))return true; if(["total","subtotal","totales","sub total"].includes(p))return true; if(["total","subtotal","totales","sub total"].includes(n))return true; if(p==="proveedor"||p==="supplier")return true; return false; }
function sheetToGastos(rows,fp){ if(!rows||rows.length<2)return[]; let hi=-1; for(let i=0;i<Math.min(5,rows.length);i++){const r=rows[i],c0=normH(r[0]),c1=normH(r[1]);if(c0==="fecha"||c0.includes("fecha")||c1==="proveedor"||c1.includes("proveedor")){hi=i;break;}} if(hi===-1)hi=0; const hr=rows[hi],cm=buildColMap(hr); if(cm.fecha===undefined&&cm.proveedor===undefined)return[]; const res=[]; for(let i=hi+1;i<rows.length;i++){const row=rows[i];if(isSkipRow(row,cm))continue;const get=f=>cm[f]!==undefined?row[cm[f]]:undefined;const fv=toDateISO(get("fecha")),neto=toNum(get("neto")),iva=toNum(get("iva")),total=toNum(get("total"));if(!fv&&!get("proveedor")&&!neto)continue;const tr=String(get("tipo_documento")||"").toLowerCase(),esBoleta=tr.includes("boleta")||tr.includes("be");let nf,ivf,tf;if(esBoleta){nf=(total!==null)?total:(neto!==null?neto:0);ivf=0;tf=nf;}else if(neto===null&&iva===null&&total!==null){nf=total;ivf=0;tf=total;}else{nf=(neto!==null)?neto:0;ivf=(iva!==null)?iva:0;tf=(total!==null)?total:(nf+ivf);}res.push({fecha:fv||new Date().toISOString().slice(0,10),proveedor:String(get("proveedor")||"").trim()||null,rut:String(get("rut")||"").trim()||null,tipo_documento:String(get("tipo_documento")||"").trim()||null,numero_documento:String(get("numero_documento")||"").trim()||null,neto:nf,iva:ivf,total:tf,categoria:String(get("categoria")||"").trim()||null,metodo_pago:String(get("metodo_pago")||"").trim()||null,proyecto:PROJECT_NAME,foto_path:fp,estado_ocr:"importado"});}return res; }
async function parseSpreadsheet(file,fp){ return new Promise(res=>{ const r=new FileReader();r.onload=e=>{try{const d=new Uint8Array(e.target.result),wb=window.XLSX.read(d,{type:"array",cellDates:false}),ws=wb.Sheets[wb.SheetNames[0]],rows=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});res(sheetToGastos(rows,fp));}catch(err){console.error(err);res([]);}};r.onerror=()=>res([]);r.readAsArrayBuffer(file);}); }
async function parseCSV(file,fp){ return new Promise(res=>{ const r=new FileReader();r.onload=e=>{try{const text=e.target.result,sep=text.includes(";")?";":","  ,rows=text.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(sep).map(c=>c.replace(/^"|"$/g,"").trim()));res(sheetToGastos(rows,fp));}catch(err){console.error(err);res([]);}};r.onerror=()=>res([]);r.readAsText(file,"UTF-8");}); }

/* ── FILE UPLOAD ──────────────────────────────────────────── */
async function handleFileUpload(event){
  const file=event.target.files?.[0]; if(!file)return;
  const ext=getFileExtension(file.name);
  if(!ALLOWED_FILE_EXTENSIONS.includes(ext)){alert("Formato no permitido.");event.target.value="";return;}
  if(file.size>MAX_FILE_SIZE_MB*1024*1024){alert(`Máximo ${MAX_FILE_SIZE_MB} MB.`);event.target.value="";return;}
  if(typeof window.supabaseClient==="undefined"){alert("Supabase no está configurado.");event.target.value="";return;}
  if(["xls","xlsx","csv"].includes(ext)&&typeof window.XLSX==="undefined"){alert("Librería Excel no cargada.");event.target.value="";return;}
  const isSheet=["xls","xlsx"].includes(ext),isCSV=ext==="csv";
  let rows=[];
  if(isSheet||isCSV){ rows=isCSV?await parseCSV(file,null):await parseSpreadsheet(file,null); if(!rows.length){alert("No se encontraron filas reconocibles.");event.target.value="";return;} }
  const safeName=sanitizeFileName(file.name),group=getFileGroup(ext),path=`junquillar/${group}/${Date.now()}-${safeName}`;
  const{data:up,error:ue}=await window.supabaseClient.storage.from(BUCKET_NAME).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type||undefined});
  if(ue){alert(`Error subiendo: ${ue.message}`);event.target.value="";return;}
  const stored=up.path;
  if(isSheet||isCSV){
    rows.forEach(r=>r.foto_path=stored);
    let ins=0;
    for(let i=0;i<rows.length;i+=50){const b=rows.slice(i,i+50);const{error}=await window.supabaseClient.from("gastos_junquillar_app").insert(b);if(error){alert(`Insertados ${ins}, luego error: ${error.message}`);event.target.value="";await loadData();return;}ins+=b.length;}
    alert(`✅ ${ins} registros importados.`);event.target.value="";await loadData();return;
  }
  const{error:ie}=await window.supabaseClient.from("gastos_junquillar_app").insert({fecha:new Date().toISOString().slice(0,10),proyecto:PROJECT_NAME,observacion:`Archivo: ${file.name}`,estado_ocr:"pendiente",foto_path:stored});
  if(ie){alert(`Archivo subido pero error al registrar: ${ie.message}`);event.target.value="";return;}
  alert("📎 Archivo adjuntado.");event.target.value="";await loadData();
}
function setupFileUpload(){
  const input=$("file-input");if(!input)return;
  input.addEventListener("change",handleFileUpload);
  $("select-file-link")?.addEventListener("click",()=>input.click());
  $("btn-adjuntar")?.addEventListener("click",()=>input.click());
  $("btn-foto")?.addEventListener("click",()=>input.click());
  const dz=$("dropzone");
  if(dz){
    dz.addEventListener("dragover",e=>{e.preventDefault();dz.classList.add("drag-over");});
    dz.addEventListener("dragleave",()=>dz.classList.remove("drag-over"));
    dz.addEventListener("drop",async e=>{e.preventDefault();dz.classList.remove("drag-over");const f=e.dataTransfer?.files?.[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);input.files=dt.files;await handleFileUpload({target:input});});
  }
}

/* ── LOAD DATA ────────────────────────────────────────────── */
async function loadData(){
  if(typeof window.supabaseClient==="undefined"){gastos=[];filteredDocs=[];renderAll();return;}
  const{data,error}=await window.supabaseClient.from("gastos_junquillar_app").select("*").eq("proyecto",PROJECT_NAME).order("fecha",{ascending:false}).order("created_at",{ascending:false});
  if(error){console.error(error);gastos=[];filteredDocs=[];renderAll();return;}
  gastos=(data||[]).map(mapSupabaseRow);filteredDocs=[...gastos];
  await loadBudget();
  renderAll();
}

/* ── PRESUPUESTO EDITABLE (Supabase config table) ─────────── */
async function loadBudget(){
  if(typeof window.supabaseClient==="undefined") return;
  try{
    const{data}=await window.supabaseClient.from("junqo_config").select("value").eq("key",BUDGET_KEY).single();
    if(data?.value) PROJECT_BUDGET=Number(data.value)||180000000;
  }catch(e){}
}
async function saveBudget(val){
  if(typeof window.supabaseClient==="undefined"){PROJECT_BUDGET=val;renderAll();return;}
  await window.supabaseClient.from("junqo_config").upsert({key:BUDGET_KEY,value:String(val),proyecto:PROJECT_NAME},{onConflict:"key"});
  PROJECT_BUDGET=val;renderAll();
}
function renderBudgetEditor(){
  const el=$("budget-editor");if(!el)return;
  el.innerHTML=`
    <div class="budget-edit-row">
      <span class="budget-edit-label">Presupuesto del proyecto</span>
      <div class="budget-edit-controls">
        <input type="text" id="budget-input" class="budget-input" value="${PROJECT_BUDGET.toLocaleString("es-CL")}" placeholder="180.000.000"/>
        <button class="budget-save-btn" id="btn-save-budget">Guardar</button>
      </div>
    </div>`;
  $("btn-save-budget")?.addEventListener("click",async()=>{
    const raw=String($("budget-input")?.value||"").replace(/\./g,"").replace(",",".");
    const val=Number(raw);
    if(!val||val<1000){alert("Ingresa un presupuesto válido.");return;}
    await saveBudget(val);
    alert(`✅ Presupuesto actualizado a ${formatoCLP(val)}`);
  });
}

/* ── KPIs ─────────────────────────────────────────────────── */
function renderKPIs(){
  const el=$("section-kpis");if(!el)return;
  const t=getTotals(),avance=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
  const saldo=Math.max(PROJECT_BUDGET-t.neto,0);
  const chipStyle=(bg,color)=>`background:${bg};color:${color};border:1px solid ${color}33`;
  el.innerHTML=[
    {title:"Avance financiero",    value:formatoPct(avance),      chip:["Ejecutado",chipStyle(avance>=90?"#fee2e2":avance>=70?"#fef3c7":"#d1fae5",avance>=90?"#dc2626":avance>=70?"#d97706":"#059669")], footer:`${formatoCLP(t.neto)} ejecutado de ${formatoCLP(PROJECT_BUDGET)}`},
    {title:"Inversión neta",       value:formatoCLP(t.neto),      chip:[`${t.docs} docs`,chipStyle("#eff6ff","#3b82f6")], footer:`${t.proveedores} proveedores · ${t.docs} documentos registrados`},
    {title:"Saldo disponible",     value:formatoCLP(saldo),        chip:[saldo>0?"Disponible":"Agotado",chipStyle(saldo>0?"#d1fae5":"#fee2e2",saldo>0?"#059669":"#dc2626")], footer:"Presupuesto referencial menos lo ejecutado"},
    {title:"IVA crédito fiscal",   value:formatoCLP(t.iva),       chip:["CF deducible",chipStyle("#f5f3ff","#7c3aed")], footer:`${t.pendientesOcr} documentos pendientes OCR`},
  ].map(k=>`<div class="kpi-card"><div class="kpi-top"><div><div class="kpi-title">${k.title}</div><div class="kpi-value">${k.value}</div></div><span class="kpi-chip" style="${k.chip[1]}">${k.chip[0]}</span></div><div class="kpi-footer">${k.footer}</div></div>`).join("");
  const sf=document.querySelector(".sidebar-card .progress-fill");
  const sb=document.querySelector(".sidebar-card .big");
  const ss=document.querySelector(".sidebar-card .sub");
  if(sf)sf.style.width=`${Math.min(avance,100)}%`;
  if(sb)sb.textContent=formatoPct(avance);
  if(ss)ss.textContent=`${formatoCLP(t.neto)} de ${formatoCLP(PROJECT_BUDGET)} ejecutado`;
}
function renderAlerts(){
  const el=$("alerts-list");if(!el)return;
  const t=getTotals(),avance=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
  const saldo=Math.max(PROJECT_BUDGET-t.neto,0);
  const alertItems=[
    {icon:"📄",title:`${t.pendientesOcr} documentos pendientes OCR`,sub:"Requieren revisión documental",warn:t.pendientesOcr>0},
    {icon:"⚠️",title:`${t.sinProveedor} registros sin proveedor`,sub:"Datos de proveedor incompletos",warn:t.sinProveedor>0},
    {icon:"💵",title:`${formatoCLP(t.iva)} IVA crédito fiscal`,sub:"Monto deducible acumulado",warn:false},
    {icon:"📊",title:`${formatoPct(avance)} avance financiero`,sub:"Contra presupuesto referencial",warn:avance>=90},
  ].map(a=>`<div class="resumen-alert-item${a.warn?" resumen-alert-warn":""}"><span class="resumen-alert-icon">${a.icon}</span><div><div class="resumen-alert-title">${a.title}</div><div class="resumen-alert-sub">${a.sub}</div></div></div>`).join("");
  const hitos=[
    {icon:"📄",label:"Documentación",estado:t.pendientesOcr>0?"Pendiente":"Completo",   desc:`${t.pendientesOcr} docs pendientes OCR`,    ok:t.pendientesOcr===0},
    {icon:"💰",label:"Presupuesto",  estado:t.neto>PROJECT_BUDGET?"Sobre ppto":"En control",desc:`${formatoCLP(t.neto)} ejecutado`,         ok:t.neto<=PROJECT_BUDGET},
    {icon:"🏢",label:"Proveedores",  estado:t.proveedores>0?"Con actividad":"Sin actividad",desc:`${t.proveedores} proveedores`,             ok:t.proveedores>0},
    {icon:"📊",label:"Avance",       estado:t.neto>0?"En progreso":"Sin inicio",          desc:`${formatoPct(avance)} del presupuesto`,     ok:t.neto>0},
  ].map(h=>`<div class="hito-tile"><div class="hito-tile-top"><span class="hito-tile-icon">${h.icon}</span><span class="status ${h.ok?"s-green":"s-amber"}">${h.estado}</span></div><div class="hito-tile-label">${h.label}</div><div class="hito-tile-desc">${h.desc}</div></div>`).join("");
  el.innerHTML=`<div class="resumen-2col">
    <div class="resumen-left-col">
      <div class="resumen-avance-wrap">
        <div class="resumen-avance-pct">${formatoPct(avance)}</div>
        <div class="resumen-avance-label">de avance financiero</div>
        <div class="cat-track resumen-bar"><div class="cat-fill" style="width:${Math.min(avance,100)}%"></div></div>
        <div class="resumen-avance-detail"><span>${formatoCLP(t.neto)} ejecutado</span><span>${formatoCLP(saldo)} disponible</span></div>
      </div>
      <div class="resumen-alerts-list">${alertItems}</div>
    </div>
    <div class="resumen-right-col">
      <div class="resumen-hitos-title">Hitos del proyecto</div>
      <div class="hitos-2x2">${hitos}</div>
    </div>
  </div>`;
}
function renderBottomCards(){ /* section-bottom no longer shown in resumen */ }

/* ── GASTOS TABLE ─────────────────────────────────────────── */
let selectedIds = new Set();

function updateBulkBar(){
  const bar=$("bulk-bar"), count=$("bulk-count");
  if(!bar)return;
  if(selectedIds.size>0){
    bar.classList.remove("bulk-bar-hidden");
    if(count) count.textContent=`${selectedIds.size} seleccionado${selectedIds.size!==1?"s":""}`;
  } else {
    bar.classList.add("bulk-bar-hidden");
  }
  // Actualizar checkbox "seleccionar todo"
  const chkAll=$("chk-all");
  if(chkAll){
    const slice=filteredDocs.slice(0,docsVisibleLimit);
    chkAll.checked = slice.length>0 && slice.every(g=>selectedIds.has(String(g.id)));
    chkAll.indeterminate = !chkAll.checked && slice.some(g=>selectedIds.has(String(g.id)));
  }
}

function gastoRowHTML(g){
  const safeNombre=(g.proveedor||"").replace(/'/g,"\\'").replace(/"/g,"&quot;");
  const checked=selectedIds.has(String(g.id))?"checked":"";
  return`<div class="table-row gastos-row${checked?" row-selected":""}" data-id="${g.id}">
    <div><input type="checkbox" class="row-chk" data-id="${g.id}" ${checked} onclick="toggleRowSelect('${g.id}',this)"/></div>
    <div>${normalizarFecha(g.fecha)}</div>
    <div><div class="doc-name">${g.proveedor||"Pendiente OCR"}</div><div class="doc-amount">${g.observacion||""}</div></div>
    <div style="font-size:11px;color:#94a3b8">${g.rut||"—"}</div>
    <div style="font-size:12px;color:#64748b">${g.tipo_documento||"—"}</div>
    <div><span class="cat-badge ${getCategoriaClass(g.categoria)}">${g.categoria||"Sin categoría"}</span></div>
    <div>${formatoCLP(g.neto)}</div>
    <div>${g.iva?formatoCLP(g.iva):"—"}</div>
    <div>${g.total?formatoCLP(g.total):"—"}</div>
    <div style="text-align:center">${numberValue(g.iva)>0?"✔":"—"}</div>
    <div style="font-size:12px;color:#64748b">${g.metodo_pago||"—"}</div>
    <div class="doc-actions">
      <button class="action-btn foto-btn" data-path="${g.foto_path||""}" title="${g.foto_path?"Ver comprobante":"Sin comprobante"}" style="${g.foto_path?"":"opacity:.3;cursor:default"}">📎</button>
      <button class="action-btn" title="Editar" onclick="openEditModal('${g.id}')">✏️</button>
      <button class="action-btn" title="Eliminar" onclick="confirmDelete('${g.id}','${safeNombre}','${g.foto_path||""}')">🗑️</button>
    </div>
  </div>`;
}

async function renderDocs(limit=docsVisibleLimit){
  const el=$("docs-table"),sub=$("docs-subtitle"),btn=$("load-more-btn");if(!el)return;
  if(sub)sub.textContent=`${filteredDocs.length} registros · datos cargados desde Supabase`;
  if(!filteredDocs.length){el.innerHTML=emptyState("No hay gastos registrados.");if(btn)btn.style.display="none";updateBulkBar();return;}
  const slice=filteredDocs.slice(0,limit);
  el.innerHTML=slice.map(g=>gastoRowHTML(g)).join("");
  if(btn)btn.style.display=filteredDocs.length>limit?"inline-flex":"none";
  updateBulkBar();
  // Cargar URLs firmadas async
  el.querySelectorAll(".foto-btn").forEach(async b=>{
    const path=b.dataset.path;if(!path)return;
    const url=await getFotoUrl(path);
    if(url){b.style.opacity="1";b.style.cursor="pointer";b.onclick=()=>window.open(url,"_blank");}
  });
}

function toggleRowSelect(id, chk){
  if(chk.checked) selectedIds.add(String(id));
  else selectedIds.delete(String(id));
  // Actualizar clase visual de la fila
  const row=document.querySelector(`.gastos-row[data-id="${id}"]`);
  if(row) row.classList.toggle("row-selected", chk.checked);
  updateBulkBar();
}

function toggleSelectAll(chk){
  const slice=filteredDocs.slice(0,docsVisibleLimit);
  slice.forEach(g=>{
    if(chk.checked) selectedIds.add(String(g.id));
    else selectedIds.delete(String(g.id));
  });
  renderDocs(docsVisibleLimit);
}

function cancelBulkSelection(){
  selectedIds.clear();
  renderDocs(docsVisibleLimit);
}

async function bulkDelete(){
  if(selectedIds.size===0)return;
  if(!confirm(`¿Eliminar ${selectedIds.size} gasto${selectedIds.size!==1?"s":""}?\nEsta acción no se puede deshacer.`))return;
  if(typeof window.supabaseClient==="undefined"){alert("Sin conexión.");return;}
  const ids=[...selectedIds];
  // Obtener foto_paths de los registros seleccionados para borrar del storage
  const toDelete=gastos.filter(g=>ids.includes(String(g.id)));
  const fotoPaths=toDelete.map(g=>g.foto_path).filter(Boolean);
  // Borrar archivos del storage
  if(fotoPaths.length>0){
    const{error:se}=await window.supabaseClient.storage.from(BUCKET_NAME).remove(fotoPaths);
    if(se) console.warn("Error borrando archivos:",se.message);
  }
  // Borrar registros en lotes de 50
  for(let i=0;i<ids.length;i+=50){
    const batch=ids.slice(i,i+50);
    const{error}=await window.supabaseClient.from("gastos_junquillar_app").delete().in("id",batch);
    if(error){alert(`Error eliminando lote: ${error.message}`);break;}
  }
  selectedIds.clear();
  await loadData();
}

async function getFotoUrl(path){
  if(!path||typeof window.supabaseClient==="undefined") return null;
  try{
    const{data,error}=await window.supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(path,300);
    if(error||!data?.signedUrl) return null;
    return data.signedUrl;
  }catch(e){return null;}
}

/* ── FILTROS (unificados, funcionan en Gastos) ────────────── */
function applyFilters(){
  const text=(($("filter-text-gastos")?.value||$("global-search")?.value||"")).toLowerCase().trim();
  const cat=$("filter-cat-gastos")?.value||"";
  const tipo=$("filter-tipo-gastos")?.value||"";
  const desde=$("filter-desde-gastos")?.value||"";
  const hasta=$("filter-hasta-gastos")?.value||"";
  const pago=$("filter-pago-gastos")?.value||"";
  filteredDocs=gastos.filter(g=>{
    const hay=[g.proveedor,g.rut,g.tipo_documento,g.numero_documento,g.categoria,g.metodo_pago,g.observacion].join(" ").toLowerCase();
    const f=fechaOrdenable(g.fecha);
    if(text&&!hay.includes(text))return false;
    if(cat&&g.categoria!==cat)return false;
    if(tipo&&g.tipo_documento!==tipo)return false;
    if(pago&&g.metodo_pago!==pago)return false;
    if(desde&&f<desde)return false;
    if(hasta&&f>hasta)return false;
    return true;
  });
  docsVisibleLimit=10;renderDocs();
}
function clearFilters(){
  ["filter-text-gastos","filter-cat-gastos","filter-tipo-gastos","filter-desde-gastos","filter-hasta-gastos","filter-pago-gastos","global-search"].forEach(id=>{const el=$(id);if(el)el.value="";});
  filteredDocs=[...gastos];docsVisibleLimit=10;renderDocs();
}

/* ── EDIT / DELETE MODAL ──────────────────────────────────── */
function openEditModal(id){
  const g=gastos.find(x=>String(x.id)===String(id));if(!g)return;
  editModalGasto=g;
  const m=$("modal-overlay");if(!m)return;
  $("em-fecha").value=g.fecha||"";
  $("em-proveedor").value=g.proveedor||"";
  $("em-rut").value=g.rut||"";
  $("em-tipo").value=g.tipo_documento||"";
  $("em-ndoc").value=g.numero_documento||"";
  $("em-neto").value=g.neto||"";
  $("em-iva").value=g.iva||"";
  $("em-total").value=g.total||"";
  $("em-cat").value=g.categoria||"";
  $("em-pago").value=g.metodo_pago||"";
  $("em-obs").value=g.observacion||"";
  m.classList.remove("modal-hidden");
}
function closeEditModal(){ $("modal-overlay")?.classList.add("modal-hidden"); editModalGasto=null; }
async function saveEditModal(){
  if(!editModalGasto)return;
  const updates={
    fecha:$("em-fecha")?.value||editModalGasto.fecha,
    proveedor:$("em-proveedor")?.value||null,
    rut:$("em-rut")?.value||null,
    tipo_documento:$("em-tipo")?.value||null,
    numero_documento:$("em-ndoc")?.value||null,
    neto:toNum($("em-neto")?.value)||0,
    iva:toNum($("em-iva")?.value)||0,
    total:toNum($("em-total")?.value)||0,
    categoria:$("em-cat")?.value||null,
    metodo_pago:$("em-pago")?.value||null,
    observacion:$("em-obs")?.value||null
  };
  if(typeof window.supabaseClient==="undefined"){alert("Sin conexión a Supabase.");return;}
  const{error}=await window.supabaseClient.from("gastos_junquillar_app").update(updates).eq("id",editModalGasto.id);
  if(error){alert(`Error guardando: ${error.message}`);return;}
  closeEditModal();await loadData();
}
async function confirmDelete(id,nombre,fotoPath){
  if(!confirm(`¿Eliminar el gasto de "${nombre}"?\nEsta acción no se puede deshacer.`))return;
  if(typeof window.supabaseClient==="undefined"){alert("Sin conexión.");return;}
  // Borrar archivo del storage si existe
  if(fotoPath){
    const{error:storageErr}=await window.supabaseClient.storage.from(BUCKET_NAME).remove([fotoPath]);
    if(storageErr) console.warn("No se pudo borrar el archivo del storage:",storageErr.message);
  }
  // Borrar registro de la tabla
  const{error}=await window.supabaseClient.from("gastos_junquillar_app").delete().eq("id",id);
  if(error){alert(`Error eliminando: ${error.message}`);return;}
  await loadData();
}

/* ── PROVEEDORES ──────────────────────────────────────────── */
function renderProveedores(){
  const el=$("proveedores-table");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin proveedores.");return;}
  const groups=groupBy(gastos,g=>g.proveedor||"Pendiente OCR"),totalNeto=sumBy(gastos,"neto");
  el.innerHTML=Object.entries(groups).map(([name,rows])=>({name,rut:rows.find(r=>r.rut)?.rut||"—",cat:rows.find(r=>r.categoria)?.categoria||"Sin categoría",docs:rows.length,costo:sumBy(rows,"neto"),iva:sumBy(rows,"iva")})).sort((a,b)=>b.costo-a.costo).slice(0,20).map((p,i)=>`<div class="table-row prov-row"><div>${i+1}</div><div class="doc-name">${p.name}</div><div>${p.rut}</div><div><span class="cat-badge ${getCategoriaClass(p.cat)}">${p.cat}</span></div><div>${p.docs}</div><div>${formatoCLP(p.costo)}</div><div>${formatoCLP(p.iva)}</div><div>${formatoPct(totalNeto?(p.costo/totalNeto)*100:0)}</div></div>`).join("");
}

/* ── CAJA ─────────────────────────────────────────────────── */
function renderCaja(){renderCajaKpis();renderCajaTipos();renderCajaMensual();}
function renderCajaKpis(){
  const el=$("caja-kpis");if(!el)return;
  const t=getTotals(),docsConIva=gastos.filter(g=>numberValue(g.iva)>0).length;
  el.innerHTML=[["Costo neto registrado",formatoCLP(t.neto),`${t.docs} documentos`],["IVA crédito fiscal",formatoCLP(t.iva),"Desde IVA registrado"],["Total documentos",formatoCLP(t.total),"Neto + IVA"],["Docs con IVA",docsConIva,"Con crédito fiscal"]].map(c=>`<div class="kpi-card"><div class="kpi-top"><div><div class="kpi-title">${c[0]}</div><div class="kpi-value">${c[1]}</div></div></div><div class="kpi-footer">${c[2]}</div></div>`).join("");
}
function renderCajaTipos(){
  const el=$("caja-tipos");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin información.");return;}
  const g=groupBy(gastos,x=>x.tipo_documento||"Sin tipo");
  el.innerHTML=Object.entries(g).map(([tipo,rows])=>`<div class="table-row caja-tipos-row"><div>${tipo}</div><div>${rows.length}</div><div>${formatoCLP(sumBy(rows,"neto"))}</div><div>${formatoCLP(sumBy(rows,"iva"))}</div><div>${sumBy(rows,"iva")>0?"✔":"—"}</div><div>${sumBy(rows,"iva")>0?"IVA CF":"Sin IVA"}</div></div>`).join("");
}
function renderCajaMensual(){
  const el=$("caja-mensual");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin detalle.");return;}
  const g=groupBy(gastos,x=>mesLabel(x.fecha));let acum=0;
  el.innerHTML=Object.entries(g).sort(([a],[b])=>a.localeCompare(b)).map(([mes,rows])=>{const iva=sumBy(rows,"iva");acum+=iva;return`<div class="table-row caja-mensual-row"><div>${mes}</div><div>${rows.filter(r=>numberValue(r.iva)>0).length}</div><div>${formatoCLP(sumBy(rows,"neto"))}</div><div>${formatoCLP(iva)}</div><div>${formatoCLP(acum)}</div></div>`;}).join("");
}

/* ── BALANCE ──────────────────────────────────────────────── */
function renderBalance(){
  const el=$("balance-table");if(!el)return;
  const t=getTotals();
  if(!gastos.length){el.innerHTML=emptyState("Sin movimientos.");return;}
  const TERRENO=100000000,APORTE=60000000;
  const aT=TERRENO,aO=t.neto,aI=t.iva,totA=aT+aO+aI;
  const pS=APORTE,pG=t.total,totP=pS+pG;
  const diff=totA-totP;
  const clp=v=>formatoCLP(v),z=()=>`<span style="color:#94a3b8">$0</span>`;
  const cell=(v,col)=>(!v||v===0)?z():(col?`<span style="color:${col};font-weight:600">${clp(v)}</span>`:clp(v));
  const row=(n,c,d,h,de,ac,a,p,pe,g,x="")=>`<div class="bal-row${x}"><div class="bal-n">${n}</div><div class="bal-cuenta">${c}</div><div class="bal-num">${cell(d)}</div><div class="bal-num">${cell(h)}</div><div class="bal-num">${cell(de)}</div><div class="bal-num">${cell(ac)}</div><div class="bal-num">${cell(a,"#059669")}</div><div class="bal-num">${cell(p)}</div><div class="bal-num">${cell(pe,"#e11d48")}</div><div class="bal-num">${cell(g,"#059669")}</div></div>`;
  const sec=l=>`<div class="bal-section">${l}</div>`;
  el.innerHTML=`<div class="bal-wrap"><div class="bal-group-head"><div class="bal-gh-spacer"></div><div class="bal-gh-group">MOVIMIENTOS</div><div class="bal-gh-group">SALDOS</div><div class="bal-gh-group">BALANCE</div><div class="bal-gh-group">RESULTADOS</div></div><div class="bal-col-head"><div class="bal-n">N°</div><div class="bal-cuenta">Cuenta</div><div class="bal-num">DEBE</div><div class="bal-num">HABER</div><div class="bal-num">DEUDOR</div><div class="bal-num">ACREEDOR</div><div class="bal-num">ACTIVO</div><div class="bal-num">PASIVO</div><div class="bal-num">PÉRDIDA</div><div class="bal-num">GANANCIA</div></div>${sec("ACTIVOS")}${row("1","Terreno",aT,0,aT,0,aT,0,0,0)}${row("2","Obra en Curso",aO,0,aO,0,aO,0,0,0)}${row("3","IVA Crédito Fiscal",aI,0,aI,0,aI,0,0,0)}${sec("PASIVOS")}${row("4","Cuenta por pagar al Socio",0,pS,0,pS,0,pS,0,0)}${row("5","Gastos por pagar",0,pG,0,pG,0,pG,0,0)}${diff!==0?row("6",diff>0?"Capital pendiente":"Ajuste",diff>0?diff:0,diff<0?Math.abs(diff):0,diff>0?diff:0,diff<0?Math.abs(diff):0,0,0,diff<0?Math.abs(diff):0,diff>0?diff:0):""}<div class="bal-row bal-total"><div class="bal-n"></div><div class="bal-cuenta">TOTAL</div><div class="bal-num">${clp(totA)}</div><div class="bal-num">${clp(totP+(diff>0?diff:0))}</div><div class="bal-num">${clp(totA)}</div><div class="bal-num">${clp(totP+(diff>0?diff:0))}</div><div class="bal-num">${clp(totA)}</div><div class="bal-num">${clp(totP)}</div><div class="bal-num">$0</div><div class="bal-num">$0</div></div></div>`;
  el.parentElement.querySelector(".balance-note")?.remove();
  el.insertAdjacentHTML("afterend",`<div class="balance-note">⚠️ Valores calculados automáticamente. No reemplaza revisión contable formal.</div>`);
}

/* ── CONTROL DE PROYECTO ──────────────────────────────────── */
function renderControlProyecto(){renderControlEtapas();renderControlCat();}
function renderControlKpis(){
  const el=$("control-kpis");if(!el)return;
  const t=getTotals(),av=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
  el.innerHTML=[
    ["Avance financiero",formatoPct(av),`${formatoCLP(t.neto)} ejecutado`],
    ["Presupuesto referencial",formatoCLP(PROJECT_BUDGET),"Base de comparación"],
    ["Saldo estimado",formatoCLP(Math.max(PROJECT_BUDGET-t.neto,0)),"Presupuesto menos ejecutado"],
    ["Partidas con gasto",uniqueCount(gastos,"categoria"),"Categorías registradas"]
  ].map(c=>`<div class="kpi-card"><div class="kpi-title">${c[0]}</div><div class="kpi-value">${c[1]}</div><div class="kpi-footer">${c[2]}</div></div>`).join("");
}
function renderControlEtapas(){
  const el=$("control-etapas");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin avance registrado.");return;}
  const groups=groupBy(gastos,g=>g.categoria||"Sin categoría"),total=sumBy(gastos,"neto");
  const sorted=Object.entries(groups).map(([cat,rows])=>({cat,rows,monto:sumBy(rows,"neto")})).sort((a,b)=>b.monto-a.monto);
  el.innerHTML=`<div class="etapas-cards-grid">${sorted.map(({cat,rows,monto})=>{
    const pct=total?(monto/total)*100:0,avg=rows.length?monto/rows.length:0;
    return`<div class="etapa-card-item">
      <div class="etapa-card-top">
        <span class="cat-badge ${getCategoriaClass(cat)}">${cat}</span>
        <span class="etapa-card-pct">${formatoPct(pct)}</span>
      </div>
      <div class="etapa-card-monto">${formatoCLP(monto)}</div>
      <div class="cat-track" style="margin-top:10px">
        <div class="cat-fill" style="width:${Math.min(pct,100)}%"></div>
      </div>
      <div class="etapa-card-meta">
        <span>${rows.length} doc${rows.length!==1?"s":""}</span>
        <span>Prom. ${formatoCLP(avg)}</span>
      </div>
    </div>`;
  }).join("")}</div>`;
}
function renderControlHitos(){
  const el=$("control-hitos");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin hitos.");return;}
  const t=getTotals();
  const hitos=[
    {icon:"📄",label:"Documentación", estado:t.pendientesOcr>0?"Pendiente":"Completo",         desc:`${t.pendientesOcr} docs pendientes OCR`,                          ok:t.pendientesOcr===0},
    {icon:"💰",label:"Presupuesto",   estado:t.neto>PROJECT_BUDGET?"Sobre ppto":"En control",  desc:`${formatoCLP(t.neto)} ejecutado`,                                 ok:t.neto<=PROJECT_BUDGET},
    {icon:"🏢",label:"Proveedores",   estado:t.proveedores>0?"Con actividad":"Sin actividad",   desc:`${t.proveedores} proveedores registrados`,                        ok:t.proveedores>0},
    {icon:"📊",label:"Avance",        estado:t.neto>0?"En progreso":"Sin inicio",               desc:`${formatoPct(PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0)} del ppto`, ok:t.neto>0}
  ];
  el.innerHTML=`<div class="hitos-2x2">${hitos.map(h=>`
    <div class="hito-tile">
      <div class="hito-tile-top">
        <span class="hito-tile-icon">${h.icon}</span>
        <span class="status ${h.ok?"s-green":"s-amber"}">${h.estado}</span>
      </div>
      <div class="hito-tile-label">${h.label}</div>
      <div class="hito-tile-desc">${h.desc}</div>
    </div>`).join("")}</div>`;
}
function renderControlCat(){
  const el=$("control-cat");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin costos.");return;}
  const cg=groupBy(gastos,g=>g.categoria||"Sin categoría"),total=sumBy(gastos,"neto"),months=[...new Set(gastos.map(g=>mesLabel(g.fecha)))].sort().slice(0,5);
  const head=document.querySelector(".ctrl-cat-head");
  if(head) head.innerHTML=`<div>Categoría</div><div>Tipo</div>${months.map(m=>`<div>${m}</div>`).join("")}${Array.from({length:5-months.length}).map(()=>`<div></div>`).join("")}<div>Total</div><div>%</div>`;
  const sorted=Object.entries(cg).sort((a,b)=>sumBy(b[1],"neto")-sumBy(a[1],"neto"));
  el.innerHTML=sorted.map(([cat,rows])=>{
    const bm=groupBy(rows,r=>mesLabel(r.fecha)),ct=sumBy(rows,"neto");
    const vals=Array.from({length:5}).map((_,i)=>`<div>${months[i]?formatoCLP(sumBy(bm[months[i]]||[],"neto")):"—"}</div>`).join("");
    return`<div class="table-row ctrl-cat-row"><div><span class="cat-badge ${getCategoriaClass(cat)}">${cat}</span></div><div style="font-size:11px;color:var(--muted)">Gasto</div>${vals}<div style="font-weight:600">${formatoCLP(ct)}</div><div><span class="kpi-chip" style="background:#d1fae511;color:#059669;border:1px solid #05966933">${formatoPct(total?(ct/total)*100:0)}</span></div></div>`;
  }).join("");
}

/* ── EXPORT BAR ──────────────────────────────────────────── */
let exportFormat = "csv";

const EXPORT_REPORTS = [
  { key:"gastos",       label:"Gastos",       icon:"📋" },
  { key:"balance",      label:"Balance",      icon:"⚖️" },
  { key:"proveedores",  label:"Proveedores",  icon:"🏢" },
  { key:"ventas",       label:"Ventas",       icon:"💰" },
  { key:"cotizaciones", label:"Cotizaciones", icon:"📝" },
  { key:"contactos",    label:"Contactos",    icon:"👥" },
  { key:"insumos",      label:"Insumos",      icon:"🔧" },
  { key:"iva",          label:"IVA CF",       icon:"💵" },
];

function getExportData(key){
  if(key==="gastos"){
    return{ name:"Gastos", headers:["Fecha","Proveedor","RUT","Tipo Documento","N° Documento","Categoría","Neto","IVA","Total","Método Pago","Estado OCR"],
      rows:gastos.map(g=>[normalizarFecha(g.fecha),g.proveedor||"",g.rut||"",g.tipo_documento||"",g.numero_documento||"",g.categoria||"",g.neto,g.iva,g.total,g.metodo_pago||"",g.estado_ocr||""]) };
  }
  if(key==="balance"){
    const grps=groupBy(gastos,g=>g.categoria||"Sin categoría"),tot=sumBy(gastos,"neto");
    const rows=Object.entries(grps).sort((a,b)=>sumBy(b[1],"neto")-sumBy(a[1],"neto")).map(([cat,rs])=>{
      const neto=sumBy(rs,"neto"),iva=sumBy(rs,"iva"),t=sumBy(rs,"total");
      return[cat,rs.length,neto,iva,t,tot?(neto/tot*100).toFixed(1)+"%":"0%"];
    });
    rows.push(["TOTAL",gastos.length,sumBy(gastos,"neto"),sumBy(gastos,"iva"),sumBy(gastos,"total"),"100%"]);
    return{ name:"Balance", headers:["Categoría","N° Docs","Neto","IVA","Total","% s/ Total"], rows };
  }
  if(key==="proveedores"){
    const grps=groupBy(gastos,g=>g.proveedor||"Pendiente"),tot=sumBy(gastos,"neto");
    const rows=Object.entries(grps).map(([prov,rs])=>{
      const neto=sumBy(rs,"neto"),iva=sumBy(rs,"iva"),t=sumBy(rs,"total");
      return[prov,rs[0]?.rut||"",rs.length,neto,iva,t,tot?(neto/tot*100).toFixed(1)+"%":"0%"];
    }).sort((a,b)=>b[3]-a[3]);
    return{ name:"Proveedores", headers:["Proveedor","RUT","N° Docs","Neto","IVA","Total","% s/ Total"], rows };
  }
  if(key==="ventas"){
    return{ name:"Ventas", headers:["Fecha","Concepto","Tipo","Monto","Estado"],
      rows:ventasIngresos.map(v=>[v.fecha,v.concepto,v.tipo,v.monto,v.estado]) };
  }
  if(key==="cotizaciones"){
    return{ name:"Cotizaciones", headers:["Fecha","Proveedor","Descripción","Neto","IVA","Total","Estado"],
      rows:ventasCotizaciones.map(c=>[c.fecha,c.proveedor,c.descripcion,c.neto,c.iva,c.total,c.estado]) };
  }
  if(key==="contactos"){
    return{ name:"Contactos", headers:["Nombre","Rol","Teléfono","Correo","Estado"],
      rows:ventasContactos.map(c=>[c.nombre,c.rol,c.telefono,c.correo,c.estado]) };
  }
  if(key==="insumos"){
    return{ name:"Insumos", headers:["Nombre","Categoría","Cantidad","Stock Mínimo","Unidad","Precio Unit.","Estado"],
      rows:insumosData.map(i=>[i.nombre,i.categoria,i.cantidad,i.stock_min,i.unidad,i.precio_unit,i.estado]) };
  }
  if(key==="iva"){
    const grps=groupBy(gastos,g=>mesLabel(g.fecha));
    let acum=0;
    const rows=Object.entries(grps).sort(([a],[b])=>a.localeCompare(b)).map(([mes,rs])=>{
      const iva=sumBy(rs,"iva"),neto=sumBy(rs,"neto"),docs=rs.filter(g=>g.iva>0).length;
      acum+=iva; return[mes,docs,neto,iva,acum];
    });
    return{ name:"IVA CF", headers:["Mes","Docs con CF","Neto","IVA CF","Acumulado CF"], rows };
  }
  return null;
}

function exportReport(key){
  const d=getExportData(key);
  if(!d||!d.rows.length){showToast("Sin datos para exportar.");return;}
  if(exportFormat==="csv")   exportAsCSV(d.name,d.headers,d.rows);
  if(exportFormat==="excel") exportAsExcel(d.name,d.headers,d.rows);
  if(exportFormat==="pdf")   exportAsPDF(d.name,d.headers,d.rows);
}
function exportAsCSV(name,headers,rows){
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv=[headers.join(";"),...rows.map(r=>r.map(esc).join(";"))].join("\n");
  downloadText(`${name.toLowerCase().replace(/\s/g,"_")}_junqo.csv`,"﻿"+csv);
  showToast(`✅ ${name} exportado como CSV`);
}
function exportAsExcel(name,headers,rows){
  if(typeof window.XLSX==="undefined"){showToast("Librería Excel no disponible.");return;}
  const ws=window.XLSX.utils.aoa_to_sheet([headers,...rows]);
  const wb=window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
  window.XLSX.writeFile(wb,`${name.toLowerCase().replace(/\s/g,"_")}_junqo.xlsx`);
  showToast(`✅ ${name} exportado como Excel`);
}
function exportAsPDF(name,headers,rows){
  const trs=rows.map(r=>`<tr>${r.map(c=>`<td>${c??""}</td>`).join("")}</tr>`).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name} — Junqo</title>
<style>body{font-family:system-ui,sans-serif;font-size:11px;padding:24px;color:#1e293b}
h2{font-size:15px;color:#059669;margin-bottom:4px}p{font-size:11px;color:#64748b;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{background:#f1f5f9;font-weight:600;padding:7px 9px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
td{padding:6px 9px;border-bottom:1px solid #f1f5f9;font-size:11px}
tr:last-child td{border-bottom:none}
.footer{margin-top:18px;font-size:9px;color:#94a3b8}
@media print{body{padding:0}}</style></head><body>
<h2>${name} — Junqo · Casa Junquillar</h2>
<p>Generado el ${new Date().toLocaleString("es-CL")}</p>
<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>
<div class="footer">Junqo App · Casa Junquillar · ${new Date().getFullYear()}</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`;
  const w=window.open("","_blank","width=900,height=700");
  if(w){w.document.write(html);w.document.close();}
  showToast(`🖨️ ${name} listo para imprimir / guardar PDF`);
}
function setExportFormat(fmt){
  exportFormat=fmt;
  renderExportBar();
}
function renderExportBar(){
  const el=$("reportes-export");if(!el)return;
  const fmts=[{key:"csv",label:"CSV",icon:"📄"},{key:"excel",label:"Excel",icon:"📊"},{key:"pdf",label:"PDF / Imprimir",icon:"🖨️"}];
  el.innerHTML=`
    <div class="export-bar-top">
      <span class="export-bar-label">Formato:</span>
      <div class="export-fmt-row">
        ${fmts.map(f=>`<button class="export-fmt-btn${exportFormat===f.key?" export-fmt-active":""}" onclick="setExportFormat('${f.key}')">${f.icon} ${f.label}</button>`).join("")}
      </div>
    </div>
    <div class="export-chips-row">
      ${EXPORT_REPORTS.map(r=>`<button class="export-chip" onclick="exportReport('${r.key}')">${r.icon} ${r.label}</button>`).join("")}
    </div>`;
}
window.setExportFormat=setExportFormat;
window.exportReport=exportReport;

/* ── REPORTES ─────────────────────────────────────────────── */
const WIDGET_DEFS = {
  cat:         { label:"Por Categoría",         icon:"🏷️" },
  mensual:     { label:"Mensual",               icon:"📅" },
  proveedores: { label:"Top Proveedores",        icon:"🏢" },
  iva:         { label:"IVA Crédito Fiscal",     icon:"💵" },
  avance:      { label:"Avance Financiero",      icon:"📊" },
  documentos:  { label:"Documentos por Tipo",   icon:"📄" },
  metodo_pago: { label:"Método de Pago",         icon:"💳" },
  mensual_iva: { label:"IVA Mensual",            icon:"🧾" },
};

function renderReportes(){
  renderReportHeader();
  renderReportKPIs();
  renderReportDiagnostico();
  renderReportAlertas();
  renderReportCharts();
  renderResumenCategoria();
  renderResumenTributario();
  // Mantener la funcionalidad existente
  renderExportBar();
  renderReportConfig();
  renderReportWidgets();
}

/* ── REPORTE EJECUTIVO: Header ────────────────────────────── */
function renderReportHeader(){
  const now=new Date();
  const meses=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const periodo=`${meses[now.getMonth()]} ${now.getFullYear()}`;
  const actualizada=`Última actualización: ${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  
  const periodEl=$("report-period");
  const updatedEl=$("report-updated");
  if(periodEl)periodEl.textContent=periodo;
  if(updatedEl)updatedEl.textContent=actualizada;
}

/* ── REPORTE EJECUTIVO: KPIs ──────────────────────────────── */
function renderReportKPIs(){
  const t=getTotals();
  const avance=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
  
  const kpiPresupuesto=$("kpi-presupuesto");
  const kpiEjecutado=$("kpi-ejecutado");
  const kpiAvance=$("kpi-avance");
  const kpiAvanceBar=$("kpi-avance-bar");
  const kpiIva=$("kpi-iva");
  
  if(kpiPresupuesto)kpiPresupuesto.textContent=formatoCLP(PROJECT_BUDGET);
  if(kpiEjecutado)kpiEjecutado.textContent=formatoCLP(t.neto);
  if(kpiAvance)kpiAvance.textContent=formatoPct(avance);
  if(kpiAvanceBar)kpiAvanceBar.style.width=`${Math.min(avance,100)}%`;
  if(kpiIva)kpiIva.textContent=formatoCLP(t.iva);
}

/* ── REPORTE EJECUTIVO: Diagnóstico ───────────────────────── */
function renderReportDiagnostico(){
  const t=getTotals();
  const avance=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
  
  // Obtener categorías principales
  const groups=groupBy(gastos,g=>g.categoria||"Sin categoría");
  const catEntries=Object.entries(groups).map(([cat,rows])=>({cat,monto:sumBy(rows,"neto")})).sort((a,b)=>b.monto-a.monto);
  const principalCat=catEntries.length>0?catEntries[0].cat:"Sin datos";
  
  let diagnostico="";
  if(gastos.length===0){
    diagnostico="No hay datos de gastos registrados. La vista se mostrará con valores en cero hasta que se carguen documentos.";
  }else if(avance<30){
    diagnostico=`El proyecto se encuentra en etapa inicial con un ${formatoPct(avance)} de avance financiero. Los gastos registrados ascienden a ${formatoCLP(t.neto)} netos, concentrados principalmente en ${principalCat}. Se recomienda continuar con el registro de comprobantes para mantener el control del presupuesto.`;
  }else if(avance<70){
    diagnostico=`El proyecto mantiene un avance financiero controlado del ${formatoPct(avance)}. La mayor concentración de gasto está en ${principalCat}. El IVA crédito fiscal acumulado de ${formatoCLP(t.iva)} se mantiene disponible para compensación futura.`;
  }else{
    diagnostico=`El proyecto se encuentra en etapa avanzada con un ${formatoPct(avance)} de ejecución presupuestaria. Se han registrado ${gastos.length} documentos por un total neto de ${formatoCLP(t.neto)}. Se recomienda revisar las desviaciones por categoría para asegurar el cierre dentro del presupuesto.`;
  }
  
  const diagEl=$("diagnostico-text");
  if(diagEl)diagEl.textContent=diagnostico;
}

/* ── REPORTE EJECUTIVO: Alertas ───────────────────────────── */
function renderReportAlertas(){
  const t=getTotals();
  const avance=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
  const alertas=[];
  
  // Verificar sobrecostos
  if(avance>100){
    alertas.push({tipo:"error",texto:"Sobrecosto detectado: el ejecutado supera el presupuesto total"});
  }else if(avance>85){
    alertas.push({tipo:"warning",texto:"Alerta: el proyecto está acercándose al presupuesto (85%+)"});  
  }

  // Verificar categorías con desviación
  const groups=groupBy(gastos,g=>g.categoria||"Sin categoría");
  const presupuestoPorCat=PROJECT_BUDGET/5; // Distribución aproximada
  for(const[cat,rows]of Object.entries(groups)){
    const monto=sumBy(rows,"neto");
    if(monto>presupuestoPorCat*1.2){
      alertas.push({tipo:"warning",texto:`Partida "${cat}" supera el 120% del umbral presupuestado`});
    }
  }
  
  // Verificar documentos pendientes
  const pendientes=gastos.filter(g=>String(g.estado_ocr||"").toLowerCase()==="pendiente").length;
  if(pendientes>0){
    alertas.push({tipo:"info",texto:`${pendientes} documento(s) pendiente(s) de procesamiento OCR`});
  }
  
  // Verificar documentación
  if(gastos.length>0){
    alertas.push({tipo:"success",texto:"Documentación tributaria al día"});
  }
  
  if(alertas.length===0){
    alertas.push({tipo:"success",texto:"Sin sobrecostos críticos. El proyecto se encuentra dentro de los parámetros esperados."});
  }
  
  const alertasEl=$("alertas-list");
  if(alertasEl){
    alertasEl.innerHTML=alertas.map(a=>`
      <div class="alerta-item alerta-${a.tipo}">
        ${a.tipo==="error"?"🔴":a.tipo==="warning"?"🟡":a.tipo==="success"?"🟢":"🔵"} ${a.texto}
      </div>
    `).join("");
  }
}

/* ── REPORTE EJECUTIVO: Gráficos ──────────────────────────── */
let chartPresupuesto=null;
let chartCategoria=null;
let chartMensual=null;

function renderReportCharts(){
  // Verificar si Chart.js está disponible
  if(typeof Chart==="undefined"){
    // Mostrar mensaje de fallback
    const containers=["chart-presupuesto","chart-categoria","chart-mensual"];
    containers.forEach(id=>{
      const el=$(id);
      if(el)el.innerHTML='<div class="chart-fallback">Gráfico no disponible (Chart.js no cargado)</div>';
    });
    return;
  }
  
  const t=getTotals();
  
  // Gráfico 1: Presupuesto vs Ejecutado (barras)
  const ctx1=$("chart-presupuesto-canvas");
  if(ctx1){
    if(chartPresupuesto)chartPresupuesto.destroy();
    chartPresupuesto=new Chart(ctx1,{
      type:"bar",
      data:{
        labels:["Presupuesto","Ejecutado"],
        datasets:[{
          label:"Monto",
          data:[PROJECT_BUDGET,t.neto],
          backgroundColor:["#3b82f6","#10b981"],
          borderRadius:4
        }]
      },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true, ticks:{callback:v=>formatoCLP(v)}}}}
    });
  }
  
  // Gráfico 2: Distribución por categoría (doughnut)
  const ctx2=$("chart-categoria-canvas");
  if(ctx2){
    const groups=groupBy(gastos,g=>g.categoria||"Sin categoría");
    const catData=Object.entries(groups).map(([cat,rows])=>({cat,monto:sumBy(rows,"neto")})).sort((a,b)=>b.monto-a.monto);
    if(chartCategoria)chartCategoria.destroy();
    chartCategoria=new Chart(ctx2,{
      type:"doughnut",
      data:{
        labels:catData.map(c=>c.cat),
        datasets:[{data:catData.map(c=>c.monto),backgroundColor:["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4"]}]
      },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"right"}}}
    });
  }
  
  // Gráfico 3: Evolución mensual (línea)
  const ctx3=$("chart-mensual-canvas");
  if(ctx3){
    const groups=groupBy(gastos,g=>mesLabel(g.fecha));
    const sortedMeses=Object.entries(groups).sort(([a],[b])=>a.localeCompare(b));
    const labels=sortedMeses.map(([mes])=>mes);
    const data=sortedMeses.map(([,rows])=>sumBy(rows,"neto"));
    if(chartMensual)chartMensual.destroy();
    chartMensual=new Chart(ctx3,{
      type:"line",
      data:{
        labels:labels.length?labels:["Sin datos"],
        datasets:[{label:"Gasto neto",data:data.length?data:[0],borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,0.1)",fill:true,tension:0.3}]
      },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:v=>formatoCLP(v)}}}}
    });
  }
}

/* ── REPORTE EJECUTIVO: Resumen por Categoría ─────────────── */
function renderResumenCategoria(){
  const categorias=["Materiales","Mano de obra","Servicios","Herramientas","Transporte"];
  const presupuestoPorCat=PROJECT_BUDGET/categorias.length;
  
  const groups=groupBy(gastos,g=>g.categoria||"Sin categoría");
  const rows=categorias.map(cat=>{
    const catGastos=groups[cat]||[];
    const ejecutado=sumBy(catGastos,"neto");
    const diferencia=presupuestoPorCat-ejecutado;
    const pctAvance=presupuestoPorCat>0?(ejecutado/presupuestoPorCat)*100:0;
    return{cat,presupuesto:presupuestoPorCat,ejecutado,diferencia,pctAvance};
  });
  
  const tbody=$("resumen-categoria-body");
  if(tbody){
    tbody.innerHTML=rows.map(r=>`
      <tr>
        <td><span class="cat-badge ${getCategoriaClass(r.cat)}">${r.cat}</span></td>
        <td class="money">${formatoCLP(r.presupuesto)}</td>
        <td class="money">${formatoCLP(r.ejecutado)}</td>
        <td class="money ${r.diferencia<0?'text-red':'text-green'}">${formatoCLP(r.diferencia)}</td>
        <td class="money">${formatoPct(r.pctAvance)}</td>
      </tr>
    `).join("");
  }
}

/* ── REPORTE EJECUTIVO: Resumen Tributario ───────────────── */
function renderResumenTributario(){
  const t=getTotals();
  const docsConCF=gastos.filter(g=>numberValue(g.iva)>0).length;
  const docsSinCF=gastos.filter(g=>numberValue(g.iva)===0).length;
  
  const baseNeta=$("trib-base-neta");
  const ivaCF=$("trib-iva-cf");
  const docsCF=$("trib-docs-cf");
  const docsSin=$("trib-docs-sin-cf");
  
  if(baseNeta)baseNeta.textContent=formatoCLP(t.neto);
  if(ivaCF)ivaCF.textContent=formatoCLP(t.iva);
  if(docsCF)docsCF.textContent=String(docsConCF);
  if(docsSin)docsSin.textContent=String(docsSinCF);
}

/* ── REPORTE EJECUTIVO: Funciones de exportación ─────────── */
function exportToPDF(){
  showToast("📄 Generando PDF... (funcionalidad en desarrollo)");
  // Implementación básica usando window.print
  window.print();
}

function exportToExcel(){
  if(!gastos.length){
    showToast("⚠️ No hay datos para exportar");
    return;
  }
  const data=gastos.map(r=>({
    Fecha:normalizarFecha(r.fecha),
    Proveedor:r.proveedor||"",
    RUT:r.rut||"",
    "Tipo documento":r.tipo_documento||"",
    "N° documento":r.numero_documento||"",
    Categoría:r.categoria||"",
    "Costo neto":r.neto,
    "IVA":r.iva,
    "Total":r.total,
    "Método pago":r.metodo_pago||""
  }));
  
  if(typeof XLSX==="undefined"){
    showToast("⚠️ Librería Excel no disponible");
    return;
  }
  
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Reporte Ejecutivo");
  XLSX.writeFile(wb,`Reporte_Ejecutivo_${new Date().toISOString().split("T")[0]}.xlsx`);
  showToast("✅ Reporte Excel descargado");
}

function toggleDetalle(){
  const extras=$("report-extras");
  if(extras){
    extras.style.display=extras.style.display==="none"?"block":"none";
  }
}

window.exportToPDF=exportToPDF;
window.exportToExcel=exportToExcel;
window.toggleDetalle=toggleDetalle;

/* ── REPORTES: Configuración existente ───────────────────── */
function renderReportConfig(){
  const el=$("reportes-config");if(!el)return;
  el.innerHTML=`
    <div class="report-config-title">⚙️ Configurar widgets visibles</div>
    <div class="report-config-chips">
      ${Object.entries(WIDGET_DEFS).map(([k,w])=>`
        <button class="report-chip ${activeWidgets.includes(k)?"chip-active":""}" data-widget="${k}">
          ${w.icon} ${w.label}
        </button>`).join("")}
    </div>`;
  el.querySelectorAll(".report-chip").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const k=btn.dataset.widget;
      if(activeWidgets.includes(k)){
        if(activeWidgets.length<=1)return;
        activeWidgets=activeWidgets.filter(x=>x!==k);
      }else{ activeWidgets.push(k); }
      localStorage.setItem(REPORT_WIDGETS_KEY,JSON.stringify(activeWidgets));
      renderReportes();
    });
  });
}

function renderReportWidgets(){
  const el=$("reportes-widgets");if(!el)return;
  if(!gastos.length){el.innerHTML=emptyState("Sin datos.");return;}
  el.innerHTML=activeWidgets.map(k=>renderWidget(k)).join("");
}

function renderWidget(k){
  const def=WIDGET_DEFS[k];if(!def)return"";
  const t=getTotals();
  const card=(title,sub,content)=>`
    <div class="report-widget-card">
      <div class="report-widget-title">${def.icon} ${title}</div>
      <div class="report-widget-sub">${sub}</div>
      <div class="report-widget-body">${content}</div>
    </div>`;

  if(k==="cat"){
    const groups=groupBy(gastos,g=>g.categoria||"Sin categoría"),total=sumBy(gastos,"neto");
    const items=Object.entries(groups).map(([cat,rows])=>({cat,monto:sumBy(rows,"neto"),docs:rows.length})).sort((a,b)=>b.monto-a.monto);
    return card("Por Categoría","Gasto neto por categoría",`<div class="rw-etapas-grid">${items.map(r=>{const pct=total?(r.monto/total)*100:0;return`<div class="etapa-card-item"><div class="etapa-card-top"><span class="cat-badge ${getCategoriaClass(r.cat)}">${r.cat}</span><span class="etapa-card-pct">${formatoPct(pct)}</span></div><div class="etapa-card-monto">${formatoCLP(r.monto)}</div><div class="cat-track" style="margin-top:8px"><div class="cat-fill" style="width:${Math.min(pct,100)}%"></div></div><div class="etapa-card-sub">${r.docs} docs</div></div>`;}).join("")}</div>`);
  }
  if(k==="mensual"){
    const groups=groupBy(gastos,g=>mesLabel(g.fecha)),totalG=sumBy(gastos,"neto");
    const sorted=Object.entries(groups).sort(([a],[b])=>a.localeCompare(b));
    return card("Reporte Mensual","Evolución de gastos por mes",`<div class="rw-etapas-grid">${sorted.map(([mes,rows])=>{const neto=sumBy(rows,"neto"),iva=sumBy(rows,"iva"),pct=totalG?(neto/totalG)*100:0;return`<div class="etapa-card-item"><div class="etapa-card-top"><span style="font-weight:700;color:var(--text)">${mes}</span><span class="etapa-card-pct">${formatoPct(pct)}</span></div><div class="etapa-card-monto">${formatoCLP(neto)}</div><div class="cat-track" style="margin-top:8px"><div class="cat-fill" style="width:${Math.min(pct,100)}%"></div></div><div class="etapa-card-sub">${rows.length} docs · IVA ${formatoCLP(iva)}</div></div>`;}).join("")}</div>`);
  }
  if(k==="proveedores"){
    const groups=groupBy(gastos,g=>g.proveedor||"Pendiente"),totalN=sumBy(gastos,"neto");
    const top=Object.entries(groups).map(([n,rows])=>({n,monto:sumBy(rows,"neto"),docs:rows.length})).sort((a,b)=>b.monto-a.monto).slice(0,6);
    return card("Top Proveedores","Por monto neto registrado",`<div class="rw-etapas-grid">${top.map(p=>{const pct=totalN?(p.monto/totalN)*100:0;return`<div class="etapa-card-item"><div class="etapa-card-top"><span style="font-size:13px;font-weight:600;color:var(--text)">${p.n}</span><span class="etapa-card-pct">${formatoPct(pct)}</span></div><div class="etapa-card-monto">${formatoCLP(p.monto)}</div><div class="cat-track" style="margin-top:8px"><div class="cat-fill" style="width:${Math.min(pct,100)}%"></div></div><div class="etapa-card-sub">${p.docs} docs</div></div>`;}).join("")}</div>`);
  }
  if(k==="iva"){
    const docsConIva=gastos.filter(g=>numberValue(g.iva)>0).length;
    return card("IVA Crédito Fiscal","Resumen tributario",`<div class="rw-kpi-row"><div class="rw-kpi"><div class="rw-kpi-label">IVA Total CF</div><div class="rw-kpi-val">${formatoCLP(t.iva)}</div></div><div class="rw-kpi"><div class="rw-kpi-label">Docs con CF</div><div class="rw-kpi-val">${docsConIva}</div></div><div class="rw-kpi"><div class="rw-kpi-label">% sobre neto</div><div class="rw-kpi-val">${formatoPct(t.neto?(t.iva/t.neto)*100:0)}</div></div></div>`);
  }
  if(k==="avance"){
    const av=PROJECT_BUDGET?(t.neto/PROJECT_BUDGET)*100:0;
    return card("Avance Financiero","Neto ejecutado vs presupuesto",`<div class="rw-avance"><div class="rw-avance-pct">${formatoPct(av)}</div><div class="cat-track rw-avance-bar"><div class="cat-fill" style="width:${Math.min(av,100)}%"></div></div><div class="rw-avance-detail"><span>${formatoCLP(t.neto)} ejecutado</span><span>de ${formatoCLP(PROJECT_BUDGET)}</span></div></div>`);
  }
  if(k==="documentos"){
    const groups=groupBy(gastos,g=>g.tipo_documento||"Sin tipo");
    const items=Object.entries(groups).map(([tipo,rows])=>({tipo,docs:rows.length,monto:sumBy(rows,"neto")})).sort((a,b)=>b.monto-a.monto);
    return card("Por Tipo de Documento","Clasificación documental",`<div class="rw-etapas-grid">${items.map(r=>{const pct=t.neto?(r.monto/t.neto)*100:0;return`<div class="etapa-card-item"><div class="etapa-card-top"><span style="font-size:12px;font-weight:600">${r.tipo}</span><span class="etapa-card-pct">${r.docs} docs</span></div><div class="etapa-card-monto">${formatoCLP(r.monto)}</div><div class="cat-track" style="margin-top:8px"><div class="cat-fill" style="width:${Math.min(pct,100)}%"></div></div><div class="etapa-card-sub">${formatoPct(pct)} del neto</div></div>`;}).join("")}</div>`);
  }
  if(k==="metodo_pago"){
    const groups=groupBy(gastos,g=>g.metodo_pago||"Sin registrar");
    const items=Object.entries(groups).map(([mp,rows])=>({mp,docs:rows.length,monto:sumBy(rows,"neto")})).sort((a,b)=>b.monto-a.monto);
    return card("Por Método de Pago","Distribución de pagos",`<div class="rw-etapas-grid">${items.map(r=>{const pct=t.neto?(r.monto/t.neto)*100:0;return`<div class="etapa-card-item"><div class="etapa-card-top"><span style="font-size:12px;font-weight:600">${r.mp}</span><span class="etapa-card-pct">${r.docs} docs</span></div><div class="etapa-card-monto">${formatoCLP(r.monto)}</div><div class="cat-track" style="margin-top:8px"><div class="cat-fill" style="width:${Math.min(pct,100)}%"></div></div><div class="etapa-card-sub">${formatoPct(pct)}</div></div>`;}).join("")}</div>`);
  }
  if(k==="mensual_iva"){
    const groups=groupBy(gastos,g=>mesLabel(g.fecha));
    const sorted=Object.entries(groups).sort(([a],[b])=>a.localeCompare(b));
    let acum=0;
    return card("IVA Mensual","Crédito fiscal acumulado por mes",`<div class="rw-etapas-grid">${sorted.map(([mes,rows])=>{const iva=sumBy(rows,"iva");acum+=iva;return`<div class="etapa-card-item"><div class="etapa-card-top"><span style="font-weight:700">${mes}</span><span class="etapa-card-pct">${formatoCLP(iva)}</span></div><div class="etapa-card-monto">${formatoCLP(acum)}</div><div class="etapa-card-sub">Acumulado</div></div>`;}).join("")}</div>`);
  }
  return "";
}

/* ── NAVIGATION ───────────────────────────────────────────── */
function updateVisibleSections(ids=[]){
  document.querySelectorAll(".module-block").forEach(s=>s.classList.add("module-hidden"));
  ids.forEach(id=>$(id)?.classList.remove("module-hidden"));
}
function setupNavigation(){
  const buttons=document.querySelectorAll(".nav-btn"),title=$("page-title"),subtitle=$("page-subtitle");
  buttons.forEach(btn=>btn.addEventListener("click",()=>{
    buttons.forEach(b=>b.classList.remove("active"));btn.classList.add("active");
    currentView=btn.dataset.view;
    const view=views[currentView]||views.resumen;
    if(title)title.textContent=view.title;
    if(subtitle)subtitle.textContent=view.subtitle;
    updateVisibleSections(view.visible);
    docsVisibleLimit=(currentView==="gastos")?10:3;
    renderDocs(docsVisibleLimit);
  }));
  $("btn-ver-reportes")?.addEventListener("click",()=>document.querySelector('[data-view="reportes"]')?.click());
}

/* ── RENDER ALL ───────────────────────────────────────────── */
function renderAll(){
  renderKPIs();renderAlerts();renderBottomCards();
  renderDocs(docsVisibleLimit);renderProveedores();
  renderCaja();renderBalance();renderControlProyecto();
  renderReportes();renderBudgetEditor();
  renderVentas();renderInsumos();renderConfiguracion();
}

/* ── CSV EXPORT ───────────────────────────────────────────── */
function rowsToCSV(rows){
  const h=["fecha","proveedor","rut","tipo_documento","numero_documento","categoria","neto","iva","total","metodo_pago","estado_ocr"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  return[h.join(";"),...rows.map(r=>h.map(f=>esc(r[f])).join(";"))].join("\n");
}
function downloadText(name,text){const b=new Blob([text],{type:"text/csv;charset=utf-8"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
function exportCSV(){downloadText("gastos_junquillar.csv",rowsToCSV(filteredDocs));}

/* ── SETUP ────────────────────────────────────────────────── */
function setupButtons(){
  $("load-more-btn")?.addEventListener("click",()=>{docsVisibleLimit+=20;renderDocs(docsVisibleLimit);});
  $("btn-aplicar-filtros-gastos")?.addEventListener("click",applyFilters);
  $("btn-limpiar-filtros-gastos")?.addEventListener("click",clearFilters);
  $("btn-export-csv")?.addEventListener("click",exportCSV);
  $("btn-export-excel")?.addEventListener("click",exportCSV);
  ["filter-text-gastos","global-search"].forEach(id=>$(id)?.addEventListener("input",applyFilters));
  $("modal-overlay")?.addEventListener("click", e => { if(e.target===$("modal-overlay")) closeEditModal(); });
  $("btn-modal-cancel")?.addEventListener("click",closeEditModal);
  $("btn-modal-save")?.addEventListener("click",saveEditModal);
  $("chk-all")?.addEventListener("change", e=>toggleSelectAll(e.target));
  $("btn-bulk-delete")?.addEventListener("click",bulkDelete);
  $("btn-bulk-cancel")?.addEventListener("click",cancelBulkSelection);
}
/* ── VENTAS DATA ─────────────────────────────────────────── */
const ventasIngresos = [
  {id:1, fecha:"2024-05-23", concepto:"Aporte mensual — Mayo",          tipo:"Transferencia", monto:5000000,  estado:"Recibido"},
  {id:2, fecha:"2024-05-10", concepto:"Anticipo Etapa 1 — Estructura",  tipo:"Cheque",        monto:15000000, estado:"Recibido"},
  {id:3, fecha:"2024-04-28", concepto:"Aporte mensual — Abril",         tipo:"Transferencia", monto:5000000,  estado:"Recibido"},
  {id:4, fecha:"2024-04-05", concepto:"Anticipo inicial del proyecto",   tipo:"Transferencia", monto:20000000, estado:"Recibido"},
];
const ventasCotizaciones = [
  {id:1, fecha:"2024-05-20", proveedor:"Constructora XYZ",      descripcion:"Estructura metálica techumbre",  neto:8500000, iva:1615000, total:10115000, estado:"Pendiente"},
  {id:2, fecha:"2024-05-15", proveedor:"Electricistas Ramírez", descripcion:"Instalación eléctrica completa", neto:3200000, iva:608000,  total:3808000,  estado:"Aprobada"},
  {id:3, fecha:"2024-04-30", proveedor:"Gasfitería Central",    descripcion:"Red agua fría y caliente",       neto:2800000, iva:532000,  total:3332000,  estado:"Aprobada"},
  {id:4, fecha:"2024-04-22", proveedor:"Pinturas del Sur SA",   descripcion:"Pintura interior y exterior",    neto:1900000, iva:361000,  total:2261000,  estado:"Rechazada"},
];
const ventasContactos = [
  {id:1, nombre:"Christian García B.", rol:"Propietario", telefono:"+56 9 8765 4321", correo:"chgarciablanco@gmail.com", estado:"Activo"},
  {id:2, nombre:"Arq. Patricia López",  rol:"Arquitecto",  telefono:"+56 9 7654 3210", correo:"plopez@arq.cl",            estado:"Activo"},
  {id:3, nombre:"Constructora XYZ",     rol:"Contratista", telefono:"+56 2 2345 6789", correo:"contacto@xyz.cl",          estado:"Activo"},
  {id:4, nombre:"Inspector Municipal",  rol:"Inspector",   telefono:"+56 2 2234 5678", correo:"insp@municipio.cl",        estado:"Activo"},
];
let ventasTab = "ingresos";

/* ── INSUMOS DATA ────────────────────────────────────────── */
const insumosData = [
  {id:1,  nombre:"Cemento Portland",       categoria:"Materiales", unidad:"saco",   cantidad:45,  stock_min:10,  precio_unit:8500,  estado:"En stock"},
  {id:2,  nombre:"Fierro 10mm",            categoria:"Materiales", unidad:"barra",  cantidad:120, stock_min:20,  precio_unit:4200,  estado:"En stock"},
  {id:3,  nombre:"Madera pino 2x4",        categoria:"Materiales", unidad:"unidad", cantidad:8,   stock_min:15,  precio_unit:3800,  estado:"Bajo stock"},
  {id:4,  nombre:"Ladrillos cerámicos",    categoria:"Materiales", unidad:"unidad", cantidad:0,   stock_min:100, precio_unit:220,   estado:"Agotado"},
  {id:5,  nombre:"Esmalte blanco 1gl",     categoria:"Pinturas",   unidad:"galón",  cantidad:12,  stock_min:4,   precio_unit:18500, estado:"En stock"},
  {id:6,  nombre:"Cemento cola",           categoria:"Materiales", unidad:"saco",   cantidad:7,   stock_min:5,   precio_unit:9200,  estado:"En stock"},
  {id:7,  nombre:"Guantes de cuero",       categoria:"EPP",        unidad:"par",    cantidad:3,   stock_min:5,   precio_unit:4500,  estado:"Bajo stock"},
  {id:8,  nombre:"Casco de seguridad",     categoria:"EPP",        unidad:"unidad", cantidad:6,   stock_min:4,   precio_unit:12000, estado:"En stock"},
  {id:9,  nombre:"Cable eléctrico 2,5mm",  categoria:"Eléctrico",  unidad:"metro",  cantidad:180, stock_min:50,  precio_unit:850,   estado:"En stock"},
  {id:10, nombre:"Tubería PVC 4\"",         categoria:"Gasfitería", unidad:"metro",  cantidad:22,  stock_min:10,  precio_unit:3200,  estado:"En stock"},
];
let insumosQuery = "";
let insumosFilterCat = "";

/* ── VENTAS RENDER ───────────────────────────────────────── */
function renderVentas(){
  const el = $("ventas-root");
  if(!el) return;
  const badge = e => {
    const m = {Recibido:{bg:"var(--green-soft)",c:"var(--green)"},Pendiente:{bg:"var(--amber-soft)",c:"var(--amber)"},Aprobada:{bg:"var(--green-soft)",c:"var(--green)"},Rechazada:{bg:"var(--red-soft)",c:"var(--red)"},Activo:{bg:"var(--green-soft)",c:"var(--green)"}};
    const s = m[e]||{bg:"#f8fafc",c:"var(--muted)"};
    return `<span class="jv-badge" style="background:${s.bg};color:${s.c}">${e}</span>`;
  };
  const tabBar = `<div class="jv-tabs">
    <button class="jv-tab${ventasTab==="ingresos"?" jv-tab-active":""}" onclick="setVentasTab('ingresos')">Ingresos</button>
    <button class="jv-tab${ventasTab==="cotizaciones"?" jv-tab-active":""}" onclick="setVentasTab('cotizaciones')">Cotizaciones</button>
    <button class="jv-tab${ventasTab==="contactos"?" jv-tab-active":""}" onclick="setVentasTab('contactos')">Contactos</button>
  </div>`;
  let content = "";
  if(ventasTab === "ingresos"){
    const total = ventasIngresos.reduce((a,r)=>a+r.monto,0);
    content = `<div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-title">Total ingresos</div><div class="kpi-value">${formatoCLP(total)}</div><div class="kpi-footer">${ventasIngresos.length} aportes</div></div>
      <div class="kpi-card"><div class="kpi-title">Recibidos</div><div class="kpi-value">${ventasIngresos.filter(r=>r.estado==="Recibido").length}</div><div class="kpi-footer">Confirmados</div></div>
      <div class="kpi-card"><div class="kpi-title">Último ingreso</div><div class="kpi-value">${normalizarFecha(ventasIngresos[0]?.fecha)}</div><div class="kpi-footer">Más reciente</div></div>
      <div class="kpi-card"><div class="kpi-title">Promedio por aporte</div><div class="kpi-value">${formatoCLP(total/ventasIngresos.length)}</div><div class="kpi-footer">Calculado</div></div>
    </div>
    <div class="card"><div class="card-title">Registro de aportes e ingresos</div>
      <div class="table-wrap"><div class="table-head jv-ing-head"><div>Fecha</div><div>Concepto</div><div>Tipo</div><div style="text-align:right">Monto</div><div>Estado</div></div>
      <div>${ventasIngresos.map(r=>`<div class="table-row jv-ing-row"><div>${normalizarFecha(r.fecha)}</div><div class="doc-name">${r.concepto}</div><div style="font-size:12px;color:var(--muted)">${r.tipo}</div><div style="text-align:right;font-weight:600">${formatoCLP(r.monto)}</div><div>${badge(r.estado)}</div></div>`).join("")}</div>
    </div></div>`;
  }
  if(ventasTab === "cotizaciones"){
    const aprobadas = ventasCotizaciones.filter(c=>c.estado==="Aprobada");
    content = `<div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-title">Total cotizaciones</div><div class="kpi-value">${ventasCotizaciones.length}</div><div class="kpi-footer">Registradas</div></div>
      <div class="kpi-card"><div class="kpi-title">Aprobadas</div><div class="kpi-value">${aprobadas.length}</div><div class="kpi-footer">Tasa ${Math.round(aprobadas.length/ventasCotizaciones.length*100)}%</div></div>
      <div class="kpi-card"><div class="kpi-title">Monto aprobado</div><div class="kpi-value">${formatoCLP(aprobadas.reduce((a,c)=>a+c.total,0))}</div><div class="kpi-footer">Neto + IVA</div></div>
      <div class="kpi-card"><div class="kpi-title">Pendientes</div><div class="kpi-value">${ventasCotizaciones.filter(c=>c.estado==="Pendiente").length}</div><div class="kpi-footer">Por revisar</div></div>
    </div>
    <div class="card"><div class="card-title">Cotizaciones de contratistas</div>
      <div class="table-wrap"><div class="table-head jv-cot-head"><div>Fecha</div><div>Proveedor</div><div>Descripción</div><div style="text-align:right">Neto</div><div style="text-align:right">IVA</div><div style="text-align:right">Total</div><div>Estado</div></div>
      <div>${ventasCotizaciones.map(c=>`<div class="table-row jv-cot-row"><div>${normalizarFecha(c.fecha)}</div><div class="doc-name">${c.proveedor}</div><div style="font-size:12px;color:var(--muted)">${c.descripcion}</div><div style="text-align:right">${formatoCLP(c.neto)}</div><div style="text-align:right">${formatoCLP(c.iva)}</div><div style="text-align:right;font-weight:600">${formatoCLP(c.total)}</div><div>${badge(c.estado)}</div></div>`).join("")}</div>
    </div></div>`;
  }
  if(ventasTab === "contactos"){
    content = `<div class="card"><div class="card-title">Contactos del proyecto</div><div class="card-sub">${ventasContactos.length} personas y organizaciones vinculadas</div>
      <div class="table-wrap" style="margin-top:14px"><div class="table-head jv-cont-head"><div>Nombre</div><div>Rol</div><div>Teléfono</div><div>Correo</div><div>Estado</div></div>
      <div>${ventasContactos.map(c=>`<div class="table-row jv-cont-row"><div class="doc-name">${c.nombre}</div><div><span class="jv-badge" style="background:var(--sky-soft);color:var(--sky)">${c.rol}</span></div><div style="font-size:12px">${c.telefono}</div><div style="font-size:12px;color:var(--muted)">${c.correo}</div><div>${badge(c.estado)}</div></div>`).join("")}</div>
    </div></div>`;
  }
  el.innerHTML = tabBar + content;
}
function setVentasTab(tab){ ventasTab = tab; renderVentas(); }

/* ── INSUMOS RENDER ──────────────────────────────────────── */
function renderInsumos(){
  const el = $("insumos-root");
  if(!el) return;
  const filtered = insumosData.filter(i=>{
    const q = insumosQuery.toLowerCase();
    return (!q || i.nombre.toLowerCase().includes(q) || i.categoria.toLowerCase().includes(q))
        && (!insumosFilterCat || i.categoria === insumosFilterCat);
  });
  const ec = {"En stock":{bg:"var(--green-soft)",c:"var(--green)"},"Bajo stock":{bg:"var(--amber-soft)",c:"var(--amber)"},"Agotado":{bg:"var(--red-soft)",c:"var(--red)"}};
  const cats = [...new Set(insumosData.map(i=>i.categoria))];
  const totalValor = insumosData.reduce((a,i)=>a+i.cantidad*i.precio_unit,0);
  el.innerHTML = `
  <div class="kpi-grid" style="margin-bottom:20px">
    <div class="kpi-card"><div class="kpi-title">En stock</div><div class="kpi-value">${insumosData.filter(i=>i.estado==="En stock").length}</div><div class="kpi-footer">De ${insumosData.length} ítems</div></div>
    <div class="kpi-card"><div class="kpi-title">Bajo stock</div><div class="kpi-value">${insumosData.filter(i=>i.estado==="Bajo stock").length}</div><div class="kpi-footer">Requieren reposición</div></div>
    <div class="kpi-card"><div class="kpi-title">Agotados</div><div class="kpi-value">${insumosData.filter(i=>i.estado==="Agotado").length}</div><div class="kpi-footer">Sin unidades</div></div>
    <div class="kpi-card"><div class="kpi-title">Valor inventario</div><div class="kpi-value">${formatoCLP(totalValor)}</div><div class="kpi-footer">Cantidad × precio unit.</div></div>
  </div>
  <div class="card filter-card" style="margin-bottom:16px">
    <div class="filter-search-wrap"><span class="filter-search-icon">🔍</span>
      <input type="text" class="filter-search-input" placeholder="Buscar insumo o categoría…" value="${insumosQuery}" oninput="insumosQuery=this.value;renderInsumos()"/>
    </div>
    <div class="filter-row" style="margin-top:12px">
      <div class="filter-group"><label class="filter-label">Categoría</label>
        <select class="filter-select" onchange="insumosFilterCat=this.value;renderInsumos()">
          <option value="">Todas</option>
          ${cats.map(c=>`<option${insumosFilterCat===c?" selected":""}>${c}</option>`).join("")}
        </select>
      </div>
    </div>
  </div>
  <div class="card"><div class="card-title">Inventario de materiales e insumos</div>
    <div class="card-sub">${filtered.length} ítem${filtered.length!==1?"s":""} encontrado${filtered.length!==1?"s":""}</div>
    <div class="table-wrap"><div class="table-head ins-head">
      <div>Insumo</div><div>Categoría</div><div style="text-align:right">Cantidad</div>
      <div>Unidad</div><div style="text-align:right">Precio unit.</div>
      <div style="text-align:right">Valor total</div><div>Estado</div>
    </div>
    <div>${filtered.length ? filtered.map(i=>{
      const s = ec[i.estado]||{bg:"#f8fafc",c:"var(--muted)"};
      return`<div class="table-row ins-row"><div class="doc-name">${i.nombre}</div>
        <div><span class="cat-badge ${getCategoriaClass(i.categoria)}">${i.categoria}</span></div>
        <div style="text-align:right">${i.cantidad}</div><div style="font-size:12px;color:var(--muted)">${i.unidad}</div>
        <div style="text-align:right;font-size:12px">${formatoCLP(i.precio_unit)}</div>
        <div style="text-align:right;font-weight:600">${formatoCLP(i.cantidad*i.precio_unit)}</div>
        <div><span class="jv-badge" style="background:${s.bg};color:${s.c}">${i.estado}</span></div>
      </div>`;}).join("") : emptyState("Sin insumos que coincidan.")}</div>
  </div></div>`;
}

/* ── CONFIGURACIÓN RENDER ────────────────────────────────── */
const cfgUsers = [
  {nombre:"Christian García B.", cargo:"Administrador", rol:"Admin",    correo:"chgarciablanco@gmail.com", activo:true},
  {nombre:"Arq. Patricia López",  cargo:"Arquitecto",   rol:"Revisor",  correo:"plopez@arq.cl",            activo:true},
  {nombre:"Inspector Municipal",  cargo:"Fiscalizador", rol:"Inspector",correo:"insp@municipio.cl",        activo:true},
];
const cfgCategorias = {
  "Gastos":  ["Materiales","Mano de obra","Servicios","Herramientas","Transporte"],
  "Insumos": ["Materiales","Pinturas","EPP","Eléctrico","Gasfitería"],
};
const cfgAvBg = ["#059669","#0284c7","#d97706","#e11d48","#8b5cf6"];

function renderConfiguracion(){
  const el = $("config-root");
  if(!el) return;
  const av = (n,i) => `<div class="cfg2-avatar" style="background:${cfgAvBg[i%cfgAvBg.length]}">${n.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>`;
  const rolBg = {Admin:{bg:"var(--green-soft)",c:"var(--green)"},Revisor:{bg:"var(--sky-soft)",c:"var(--sky)"},Inspector:{bg:"var(--amber-soft)",c:"var(--amber)"}};
  el.innerHTML = `
  <div class="cfg2-grid">
    <div class="card">
      <div class="cfg2-head"><div class="cfg2-icon">🏗️</div><div><div class="card-title">Datos del proyecto</div><div class="card-sub">Información general</div></div></div>
      <div class="cfg2-form">
        <label class="cfg2-label">Nombre del proyecto<input class="filter-select" value="${PROJECT_NAME}" style="height:38px;width:100%"></label>
        <label class="cfg2-label">Administrador<input class="filter-select" value="Christian García B." style="height:38px;width:100%"></label>
        <label class="cfg2-label">Presupuesto (CLP)<input class="filter-select" value="${PROJECT_BUDGET.toLocaleString("es-CL")}" style="height:38px;width:100%"></label>
        <label class="cfg2-label">Fecha de inicio<input type="date" class="filter-select" value="2024-01-15" style="height:38px;width:100%"></label>
        <label class="cfg2-label" style="grid-column:1/-1">Dirección<input class="filter-select" value="Sector Junquillar, Región Metropolitana" style="height:38px;width:100%"></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="filter-btn-apply" onclick="showToast('✓ Datos guardados correctamente')">Guardar cambios</button>
        <button class="filter-btn-clear" onclick="renderConfiguracion()">Cancelar</button>
      </div>
    </div>
    <div class="card">
      <div class="cfg2-head"><div class="cfg2-icon">👥</div><div><div class="card-title">Usuarios del proyecto</div><div class="card-sub">${cfgUsers.filter(u=>u.activo).length} activos</div></div></div>
      <div class="cfg2-users">
        ${cfgUsers.map((u,i)=>`<div class="cfg2-user-row">${av(u.nombre,i)}
          <div class="cfg2-user-info"><strong>${u.nombre}</strong><small>${u.cargo}</small></div>
          <small class="cfg2-email">${u.correo}</small>
          <span class="jv-badge" style="background:${rolBg[u.rol]?.bg||"#f8fafc"};color:${rolBg[u.rol]?.c||"var(--muted)"}">${u.rol}</span>
          <span class="jv-badge" style="background:var(--green-soft);color:var(--green)">● Activo</span>
        </div>`).join("")}
      </div>
      <button class="filter-btn-apply" style="margin-top:14px" onclick="showToast('✓ Función disponible próximamente')">+ Agregar usuario</button>
    </div>
  </div>
  <div class="cfg2-grid" style="margin-top:16px">
    <div class="card">
      <div class="cfg2-head"><div class="cfg2-icon">🏷️</div><div><div class="card-title">Categorías</div><div class="card-sub">Gastos e insumos</div></div></div>
      ${Object.entries(cfgCategorias).map(([grupo,cats])=>`
        <div style="margin-bottom:14px">
          <div class="cfg2-group-label">${grupo}</div>
          <div class="cfg2-tags">
            ${cats.map(c=>`<span class="cfg2-tag">${c}<button class="cfg2-tag-del" onclick="this.closest('.cfg2-tag').remove()">×</button></span>`).join("")}
            <button class="cfg2-tag-add" onclick="cfg2AddTag(this)">+ Agregar</button>
          </div>
        </div>`).join("")}
    </div>
    <div class="card">
      <div class="cfg2-head"><div class="cfg2-icon">🎨</div><div><div class="card-title">Apariencia</div><div class="card-sub">Tema y color de acento</div></div></div>
      <div class="cfg2-group-label">Tema de la interfaz</div>
      <div class="cfg2-theme-group">
        <button class="cfg2-theme-btn active" onclick="cfg2SetTheme(this)">☀️ Claro</button>
        <button class="cfg2-theme-btn" onclick="cfg2SetTheme(this)">🌙 Oscuro</button>
        <button class="cfg2-theme-btn" onclick="cfg2SetTheme(this)">💻 Sistema</button>
      </div>
      <div class="cfg2-group-label" style="margin-top:18px">Color de acento</div>
      <div class="cfg2-colors">
        <button class="cfg2-color active" style="background:#059669" onclick="cfg2SetColor(this,'#059669','#ecfdf5')" title="Verde (defecto)"></button>
        <button class="cfg2-color" style="background:#0b4f6c" onclick="cfg2SetColor(this,'#0b4f6c','#f0f9ff')" title="Azul marino"></button>
        <button class="cfg2-color" style="background:#0284c7" onclick="cfg2SetColor(this,'#0284c7','#e0f2fe')" title="Azul"></button>
        <button class="cfg2-color" style="background:#8b5cf6" onclick="cfg2SetColor(this,'#8b5cf6','#f5f3ff')" title="Violeta"></button>
        <button class="cfg2-color" style="background:#d97706" onclick="cfg2SetColor(this,'#d97706','#fffbeb')" title="Ámbar"></button>
        <button class="cfg2-color" style="background:#e11d48" onclick="cfg2SetColor(this,'#e11d48','#fff1f2')" title="Rojo"></button>
      </div>
      <button class="filter-btn-apply" style="margin-top:18px;width:100%" onclick="showToast('✓ Apariencia guardada')">Guardar apariencia</button>
    </div>
    <div class="card">
      <div class="cfg2-head"><div class="cfg2-icon">💰</div><div><div class="card-title">Presupuesto del proyecto</div><div class="card-sub">Se guarda en Supabase</div></div></div>
      <div id="cfg2-budget-editor"></div>
    </div>
  </div>`;
  renderCfgBudget();
}

function renderCfgBudget(){
  const el = $("cfg2-budget-editor");
  if(!el) return;
  el.innerHTML = `<div class="cfg2-label" style="margin-bottom:8px">Presupuesto referencial (CLP)</div>
    <div style="display:flex;gap:8px">
      <input type="text" id="cfg2-budget-input" class="filter-select" style="flex:1;height:38px" value="${PROJECT_BUDGET.toLocaleString("es-CL")}" placeholder="180.000.000">
      <button class="filter-btn-apply" id="cfg2-btn-save-budget">Guardar</button>
    </div>
    <div style="margin-top:10px;font-size:13px;color:var(--muted)">Actual: <strong>${formatoCLP(PROJECT_BUDGET)}</strong></div>`;
  $("cfg2-btn-save-budget")?.addEventListener("click", async()=>{
    const raw = String($("cfg2-budget-input")?.value||"").replace(/\./g,"").replace(",",".");
    const val = Number(raw);
    if(!val||val<1000){alert("Ingresa un presupuesto válido.");return;}
    await saveBudget(val);
    showToast("✓ Presupuesto actualizado");
    renderCfgBudget();
  });
}

function cfg2AddTag(btn){
  const nombre = prompt("Nueva categoría:");
  if(!nombre||!nombre.trim()) return;
  const tag = document.createElement("span");
  tag.className = "cfg2-tag";
  tag.innerHTML = nombre.trim() + `<button class="cfg2-tag-del" onclick="this.closest('.cfg2-tag').remove()">×</button>`;
  btn.before(tag);
}

function cfg2SetTheme(btn){
  btn.closest(".cfg2-theme-group").querySelectorAll(".cfg2-theme-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const t = btn.textContent;
  if(t.includes("Oscuro")) document.documentElement.setAttribute("data-theme","dark");
  else if(t.includes("Sistema")) document.documentElement.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");
  else document.documentElement.removeAttribute("data-theme");
}

function cfg2SetColor(btn, color, soft){
  btn.closest(".cfg2-colors").querySelectorAll(".cfg2-color").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  document.documentElement.style.setProperty("--green", color);
  document.documentElement.style.setProperty("--green-soft", soft);
}

function showToast(msg){
  document.querySelectorAll(".junqo-toast").forEach(t=>t.remove());
  const t = document.createElement("div");
  t.className = "junqo-toast"; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("junqo-toast-show"));
  setTimeout(()=>{t.classList.remove("junqo-toast-show");setTimeout(()=>t.remove(),300);},2800);
}

function initDashboard(){setupNavigation();setupFileUpload();setupButtons();updateVisibleSections(views.resumen.visible);loadData();}
document.addEventListener("DOMContentLoaded",initDashboard);

/* ── Exponer funciones al scope global (necesario para onclick inline) ── */
window.openEditModal   = openEditModal;
window.closeEditModal  = closeEditModal;
window.confirmDelete   = confirmDelete;
window.setVentasTab    = setVentasTab;
window.showToast       = showToast;
window.cfg2AddTag      = cfg2AddTag;
window.cfg2SetTheme    = cfg2SetTheme;
window.cfg2SetColor    = cfg2SetColor;
window.toggleRowSelect = toggleRowSelect;
