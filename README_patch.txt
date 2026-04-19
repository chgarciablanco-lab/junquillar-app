# Junqo con subida real de archivos

Reemplazar:
- index.html
- app.js

Incluye:
- input acepta JPG, PNG, PDF, XLS, XLSX y CSV.
- al seleccionar archivo, se sube a Supabase Storage bucket `junquillar`.
- luego crea registro en `gastos_junquillar_app` con `foto_path`.
- conserva el dashboard completo y el comportamiento de Supabase.

También ejecutar en Supabase:
- supabase_storage_policies.sql
