-- Supabase Storage para adjuntar archivos de Junquillar
-- Ejecutar en SQL Editor de Supabase.

insert into storage.buckets (id, name, public)
values ('junquillar', 'junquillar', true)
on conflict (id) do nothing;

drop policy if exists "Permitir subir archivos junquillar" on storage.objects;
create policy "Permitir subir archivos junquillar"
on storage.objects
for insert
to anon
with check (bucket_id = 'junquillar');

drop policy if exists "Permitir leer archivos junquillar" on storage.objects;
create policy "Permitir leer archivos junquillar"
on storage.objects
for select
to anon
using (bucket_id = 'junquillar');

alter table public.gastos_junquillar_app enable row level security;

drop policy if exists "Permitir insertar gastos junquillar app" on public.gastos_junquillar_app;
create policy "Permitir insertar gastos junquillar app"
on public.gastos_junquillar_app
for insert
to anon
with check (proyecto = 'Junquillar');

drop policy if exists "Permitir leer gastos junquillar app" on public.gastos_junquillar_app;
create policy "Permitir leer gastos junquillar app"
on public.gastos_junquillar_app
for select
to anon
using (proyecto = 'Junquillar');
