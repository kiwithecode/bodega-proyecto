-- =============================================================================
--  15 · OBREROS  —  catálogo de personal y rendimiento por obrero
--  Ejecutar después de 08 y 14. Idempotente.
--
--  El nombre del obrero se digitaba libre (08) y con errores de tipeo ("Jose", "José ",
--  "jose p") no se puede medir a nadie. Ahora:
--    · tabla `obreros` (nombre único sin importar mayúsculas/espacios), se administra en Catálogos;
--    · `procesos.obrero_id` → obreros; el texto `procesos.obrero` se mantiene sincronizado por
--      trigger para no romper v_trazabilidad ni la historia;
--    · los nombres ya digitados se convierten en obreros (uno por nombre distinto) y se enlazan;
--    · `fn_rendimiento_obrero(desde, hasta)`: procesos, kg, % principal, % merma, horas y kg/hora.
-- =============================================================================

create table if not exists obreros (
    id         serial primary key,
    nombre     text not null,
    activo     boolean not null default true,
    notas      text,
    created_at timestamptz not null default now()
);
create unique index if not exists obreros_nombre_uk on obreros (lower(trim(nombre)));

alter table procesos add column if not exists obrero_id int references obreros(id);
create index if not exists procesos_obrero_idx on procesos(obrero_id);

-- Migrar los nombres libres ya digitados (un obrero por nombre distinto, con mayúscula inicial).
insert into obreros (nombre)
select distinct on (lower(trim(obrero))) initcap(trim(obrero))
  from procesos where nullif(trim(obrero), '') is not null
on conflict (lower(trim(nombre))) do nothing;
update procesos p set obrero_id = o.id
  from obreros o
 where p.obrero_id is null and lower(trim(p.obrero)) = lower(trim(o.nombre));

-- El texto sigue al catálogo: al elegir obrero_id, procesos.obrero toma el nombre.
create or replace function trg_proceso_obrero() returns trigger
language plpgsql as $$
begin
    if new.obrero_id is not null then
        select nombre into new.obrero from obreros where id = new.obrero_id;
    end if;
    return new;
end $$;
drop trigger if exists proc_obrero_bi on procesos;
create trigger proc_obrero_bi before insert or update of obrero_id on procesos
for each row execute function trg_proceso_obrero();

-- Si renombran al obrero, se refleja en sus procesos.
create or replace function trg_obrero_renombrado() returns trigger
language plpgsql as $$
begin
    if new.nombre is distinct from old.nombre then
        update procesos set obrero = new.nombre where obrero_id = new.id;
    end if;
    return null;
end $$;
drop trigger if exists obreros_au on obreros;
create trigger obreros_au after update of nombre on obreros
for each row execute function trg_obrero_renombrado();

-- Seguridad y auditoría como el resto de catálogos.
alter table obreros enable row level security;
drop policy if exists obreros_auth_all on obreros;
create policy obreros_auth_all on obreros for all to authenticated using (true) with check (true);
grant all on obreros to authenticated;
grant usage, select on sequence obreros_id_seq to authenticated;
drop trigger if exists aud_obreros on obreros;
create trigger aud_obreros after insert or update or delete on obreros for each row execute function trg_auditar();

-- Ya no hace falta la lista de nombres libres.
drop function if exists fn_obreros();

-- Rendimiento por obrero en un período (procesos cerrados). Horas: fin − inicio, +24 h si cruzó medianoche.
create or replace function fn_rendimiento_obrero(p_desde date, p_hasta date)
returns table (
    obrero_id int, obrero text, procesos bigint, kg_entrada numeric, kg_principal numeric, kg_subproductos numeric,
    rendimiento_pct numeric, merma_pct numeric, kg_sobrante numeric, horas numeric, kg_por_hora numeric, ultimo date
) language sql stable as $$
    select o.id, o.nombre, count(distinct p.id),
           coalesce(sum(p.kg_consumidos),0),
           coalesce(sum(sal.kg_principal),0),
           coalesce(sum(sal.kg_sub),0),
           round(100 * sum(sal.kg_principal) / nullif(sum(p.kg_consumidos),0), 1),
           round(100 * sum(sal.kg_merma + greatest(p.kg_merma_no_reg,0)) / nullif(sum(p.kg_consumidos),0), 1),
           coalesce(sum(greatest(-p.kg_merma_no_reg,0)),0),
           round(sum(dur.horas), 2),
           round(sum(p.kg_consumidos) filter (where dur.horas is not null) / nullif(sum(dur.horas),0), 1),
           max(p.fecha)
      from obreros o
      join procesos p on p.obrero_id = o.id and p.procesado_at is not null and p.fecha between p_desde and p_hasta
      join lateral (
            select coalesce(sum(kg) filter (where rol='principal'),0)   kg_principal,
                   coalesce(sum(kg) filter (where rol='subproducto'),0) kg_sub,
                   coalesce(sum(kg) filter (where rol='merma'),0)       kg_merma
              from proceso_salidas where proceso_id = p.id) sal on true
      join lateral (
            select case when p.hora_inicio is null or p.hora_fin is null then null
                        else extract(epoch from (p.hora_fin - p.hora_inicio + case when p.hora_fin < p.hora_inicio then interval '24 hours' else interval '0' end)) / 3600 end as horas) dur on true
     group by o.id, o.nombre
     order by 7 desc nulls last, 3 desc;
$$;
grant execute on function fn_rendimiento_obrero(date, date) to authenticated;
