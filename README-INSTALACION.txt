CORRECCIÓN DEFINITIVA — JUNQO REPORTES + BALANCE

El problema no era solo la descarga del balance.
En la versión nueva, index.html llama estas funciones:

  exportToPDF()
  exportToExcel()
  toggleDetalle()

pero app.js no las trae implementadas.

Además, en el index.html publicado actualmente NO aparece cargado reportes-balance-fix.js.
Por eso el cambio anterior no podía funcionar.

INSTALACIÓN CORRECTA

1) Sube este archivo a la raíz del repositorio:

   reportes-balance-fix.js

Debe quedar al mismo nivel que:
   index.html
   app.js
   styles.css
   supabaseClient.js

2) Edita index.html y al final, justo después de app.js, agrega:

   <script src="reportes-balance-fix.js"></script>

Debe quedar EXACTAMENTE así:

   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
   <script src="supabaseClient.js"></script>
   <script src="app.js"></script>
   <script src="reportes-balance-fix.js"></script>
   </body>
   </html>

3) Guarda el cambio en GitHub.

4) Espera a que GitHub Pages actualice la página.

5) Abre la app con recarga dura:
   CTRL + F5

QUÉ CORRIGE

- Hace funcionar Exportar PDF.
- Hace funcionar Exportar Excel.
- Hace funcionar Ver detalle.
- Actualiza los KPIs de Reportes con datos reales.
- Actualiza el Resumen Tributario.
- Completa la tabla Resumen por Categoría.
- Exporta el Balance real desde #balance-table.
- No cambia sidebar.
- No cambia diseño base.
- No toca app.js.
- No toca styles.css.

IMPORTANTE

Si después de subirlo sigue igual, revisa en el navegador:
1) F12
2) Pestaña Network
3) Buscar reportes-balance-fix.js

Si aparece 404, el archivo no quedó subido en la raíz.
Si no aparece, la línea script no quedó agregada en index.html.
