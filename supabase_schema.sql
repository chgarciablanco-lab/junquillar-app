-- ============================================================
-- JUNQO – Supabase schema inicial
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

create table if not exists public.gastos_junquillar (
  id bigint generated always as identity primary key,
  fecha date,
  proveedor text,
  rut text,
  tipo_doc text,
  numero_doc text,
  categoria text,
  costo_neto numeric,
  iva numeric,
  total numeric,
  credito_fiscal boolean default false,
  metodo_pago text,
  estado text default 'Ingresado',
  archivo_url text,
  created_at timestamp with time zone default now()
);

alter table public.gastos_junquillar enable row level security;

drop policy if exists "Permitir lectura publica gastos_junquillar" on public.gastos_junquillar;
drop policy if exists "Permitir insercion publica gastos_junquillar" on public.gastos_junquillar;

create policy "Permitir lectura publica gastos_junquillar"
on public.gastos_junquillar
for select
to anon
using (true);

create policy "Permitir insercion publica gastos_junquillar"
on public.gastos_junquillar
for insert
to anon
with check (true);

insert into public.gastos_junquillar
(fecha, proveedor, rut, tipo_doc, numero_doc, categoria, costo_neto, iva, total, credito_fiscal, metodo_pago, estado)
values
('2026-04-14', 'Construmart Talca', '76.123.456-7', 'FA', '2451', 'Materiales', 1546218, 293782, 1840000, true, 'Transferencia', 'Ingresado')
on conflict do nothing;
