-- =============================================================================
--  03 · ALTA DE PRODUCTOS Y PROVEEDORES
--  Ejecutar después de 01_schema.sql y 02_seed_catalogos.sql
--
--  Da a la pantalla "Agregar producto / proveedor" tres cosas:
--    · fn_proveedores_similares(nombre)          -> ¿ya existe este proveedor?
--    · fn_productos_similares(nombre, especie)   -> ¿ya existe este producto?
--    · fn_sugerir_codigos(nombre, especie)       -> códigos libres que siguen la lógica de la casa
--    · fn_siguiente_codigo_proveedor()           -> el próximo número libre
--  y bloquea en la base los duplicados exactos aunque cambien mayúsculas,
--  tildes o espacios.
-- =============================================================================

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- 1. Normalización:  "  Pulpa de Res " -> "PULPA RES"
--    Quita tildes, mayúsculas, espacios dobles y las palabras vacías (de, del, la, con)
-- -----------------------------------------------------------------------------
create or replace function fn_normalizar(p text)
returns text language sql immutable as $$
    select nullif(trim(regexp_replace(
             regexp_replace(
               upper(unaccent(coalesce(p, ''))),
               '\m(DE|DEL|LA|EL|LOS|LAS|CON|Y)\M', ' ', 'g'),
             '[^A-Z0-9/ ]+|\s+', ' ', 'g')), '');
$$;

alter table productos   add column if not exists nombre_norm text
    generated always as (fn_normalizar(nombre)) stored;
alter table proveedores add column if not exists nombre_norm text
    generated always as (fn_normalizar(nombre)) stored;

-- Duplicado exacto (tras normalizar) = rechazado por la base, no solo por la pantalla
create unique index if not exists productos_nombre_norm_especie_ux
    on productos (nombre_norm, coalesce(especie_id, 0));
-- Proveedores: NO se pone índice único porque el catálogo actual ya trae un
-- homónimo real (17 y 48 = JUAN SANCHEZ). El duplicado lo controla
-- fn_crear_proveedor, que permite forzar cuando son dos personas distintas.

-- Índices para la búsqueda difusa
create index if not exists productos_nombre_norm_trgm   on productos   using gin (nombre_norm gin_trgm_ops);
create index if not exists proveedores_nombre_norm_trgm on proveedores using gin (nombre_norm gin_trgm_ops);

-- Formato de código de producto: 2 a 6 letras mayúsculas, sin espacios ni guiones
alter table productos drop constraint if exists productos_codigo_formato;
alter table productos add constraint productos_codigo_formato
    check (codigo ~ '^[A-Z]{2,6}$');

-- -----------------------------------------------------------------------------
-- 2. ¿Ya existe este proveedor?
--    Devuelve coincidencias ordenadas: 1.0 = idéntico, >0.45 = probablemente el mismo
-- -----------------------------------------------------------------------------
create or replace function fn_proveedores_similares(p_nombre text, p_min real default 0.30)
returns table (id int, codigo int, nombre text, similitud real, veredicto text)
language sql stable as $$
    with q as (select fn_normalizar(p_nombre) as n)
    select pr.id, pr.codigo, pr.nombre,
           greatest(similarity(pr.nombre_norm, q.n),
                    word_similarity(q.n, pr.nombre_norm))::real as similitud,
           -- en proveedores solo la similitud global bloquea; compartir una palabra
           -- ("DISTRIBUIDORA", "LOMO FINO") apenas lo muestra como PARECIDO
           case
             when pr.nombre_norm = q.n                    then 'REPETIDO'
             when similarity(pr.nombre_norm, q.n) >= 0.45 then 'MUY PARECIDO'
             else 'PARECIDO'
           end
      from proveedores pr, q
     where q.n is not null
       and pr.activo
       and (pr.nombre_norm = q.n
            or similarity(pr.nombre_norm, q.n) >= p_min
            or word_similarity(q.n, pr.nombre_norm) >= 0.60)
     order by 4 desc
     limit 8;
$$;

-- -----------------------------------------------------------------------------
-- 3. ¿Ya existe este producto?
--    Busca en todas las especies, pero marca si la coincidencia es de la misma.
-- -----------------------------------------------------------------------------
create or replace function fn_productos_similares(p_nombre text, p_especie_codigo text default null,
                                                  p_min real default 0.30)
returns table (id int, codigo text, nombre text, especie text, misma_especie boolean,
               similitud real, veredicto text)
language sql stable as $$
    with q as (select fn_normalizar(p_nombre) as n,
                      (select id from especies where codigo = upper(p_especie_codigo)) as esp)
    select po.id, po.codigo, po.nombre, e.nombre,
           (po.especie_id = q.esp) as misma_especie,
           greatest(similarity(po.nombre_norm, q.n),
                    word_similarity(q.n, po.nombre_norm))::real as similitud,
           case
             when po.nombre_norm = q.n and po.especie_id = q.esp        then 'REPETIDO'
             when po.nombre_norm = q.n                                  then 'MISMO NOMBRE, OTRA ESPECIE'
             when greatest(similarity(po.nombre_norm, q.n),
                           word_similarity(q.n, po.nombre_norm)) >= 0.45 then 'MUY PARECIDO'
             else 'PARECIDO'
           end
      from productos po
      left join especies e on e.id = po.especie_id, q
     where q.n is not null
       and po.activo
       and (po.nombre_norm = q.n
            or similarity(po.nombre_norm, q.n) >= p_min
            or word_similarity(q.n, po.nombre_norm) >= 0.60)
     order by (po.especie_id = q.esp) desc, 6 desc
     limit 8;
$$;

-- -----------------------------------------------------------------------------
-- 4. Sugerir códigos que sigan la lógica de la casa
--
--    Cómo están armados los códigos actuales:
--      · Letra(s) + sufijo de especie:   AR, CR, DR = res  ·  AC, BC = cerdo  ·  AP = pollo
--      · Variante de un producto base:   CR + A = CRA (lomo falda LIMPIO)
--                                        ER + E = ERE (industrial ESPECIAL), ER + AG = ERAG
--      · Iniciales del nombre + especie: KPC (gallina de campo), MTC (manteca cerdo)
--
--    La función devuelve hasta 5 códigos LIBRES, con la regla que usó para cada uno.
-- -----------------------------------------------------------------------------
create or replace function fn_sugerir_codigos(p_nombre text, p_especie_codigo text)
returns table (codigo text, regla text, prioridad int)
language plpgsql stable as $$
declare
    v_esp     text := upper(coalesce(p_especie_codigo, ''));
    v_norm    text := fn_normalizar(p_nombre);
    v_words   text[];
    v_base    record;
    v_resto   text;
    v_cand    text;
    v_ini     text := '';
    w         text;
    l         text;
    v_out     text[] := '{}';
begin
    if v_norm is null or v_esp = '' then return; end if;
    v_words := regexp_split_to_array(v_norm, ' ');

    -- 4a. VARIANTE: el nombre contiene el nombre de un producto ya existente de la misma especie
    --     "LOMO FALDA LIMPIO" contiene "LOMO FALDA" (CR)  ->  CR + L = CRL
    for v_base in
        select po.codigo, po.nombre_norm
          from productos po join especies e on e.id = po.especie_id
         where e.codigo = v_esp
           and po.nombre_norm <> v_norm
           and position(po.nombre_norm in v_norm) = 1
         order by length(po.nombre_norm) desc
         limit 2
    loop
        v_resto := trim(replace(v_norm, v_base.nombre_norm, ''));
        if v_resto <> '' then
            v_cand := v_base.codigo || left(regexp_replace(v_resto, ' ', '', 'g'), 1);
            if not exists (select 1 from productos where productos.codigo = v_cand)
               and not (v_cand = any(v_out)) and length(v_cand) <= 6 then
                v_out := v_out || v_cand;
                codigo := v_cand;
                regla  := format('Variante de %s (%s) + "%s"', v_base.codigo, initcap(lower(v_base.nombre_norm)), v_resto);
                prioridad := 1;
                return next;
            end if;
            -- misma idea con dos letras del calificativo: ER + AG = ERAG
            v_cand := v_base.codigo || left(regexp_replace(v_resto, ' ', '', 'g'), 2);
            if not exists (select 1 from productos where productos.codigo = v_cand)
               and not (v_cand = any(v_out)) and length(v_cand) <= 6 then
                v_out := v_out || v_cand;
                codigo := v_cand; regla := format('Variante de %s + dos letras', v_base.codigo); prioridad := 2;
                return next;
            end if;
        end if;
    end loop;

    -- 4b. INICIALES + especie:  "GALLINA CAMPO" -> G, C  -> GC + P = GCP
    foreach w in array v_words loop
        if w <> '' then v_ini := v_ini || left(w, 1); end if;
    end loop;
    v_cand := left(v_ini, 3) || v_esp;
    if length(v_ini) >= 2
       and not exists (select 1 from productos where productos.codigo = v_cand)
       and not (v_cand = any(v_out)) and length(v_cand) <= 6 then
        v_out := v_out || v_cand;
        codigo := v_cand; regla := 'Iniciales del nombre + especie'; prioridad := 3;
        return next;
    end if;

    -- 4c. PRIMERA LETRA DEL NOMBRE + especie, si está libre:  "FALDITAS" -> F + R = FR (ocupado) ...
    v_cand := left(v_words[1], 1) || v_esp;
    if not exists (select 1 from productos where productos.codigo = v_cand)
       and not (v_cand = any(v_out)) then
        v_out := v_out || v_cand;
        codigo := v_cand; regla := 'Primera letra + especie'; prioridad := 4;
        return next;
    end if;

    -- 4d. PRÓXIMA LETRA LIBRE de la serie de la especie (A..Z + sufijo), como se hizo siempre
    for l in select chr(c) from generate_series(65, 90) c loop
        v_cand := l || v_esp;
        if not exists (select 1 from productos where productos.codigo = v_cand)
           and not (v_cand = any(v_out)) then
            v_out := v_out || v_cand;
            codigo := v_cand; regla := 'Siguiente letra libre de la serie ' || v_esp; prioridad := 5;
            return next;
            exit;
        end if;
    end loop;

    -- 4e. Dos primeras letras de la primera palabra + especie:  "BONDIOLA" -> BO + C = BOC
    v_cand := left(v_words[1], 2) || v_esp;
    if not exists (select 1 from productos where productos.codigo = v_cand)
       and not (v_cand = any(v_out)) then
        codigo := v_cand; regla := 'Dos letras + especie'; prioridad := 6;
        return next;
    end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Próximo código de proveedor (el número lo da el sistema, no la persona)
-- -----------------------------------------------------------------------------
create or replace function fn_siguiente_codigo_proveedor()
returns int language sql stable as $$
    select coalesce(max(codigo), 0) + 1 from proveedores;
$$;

-- -----------------------------------------------------------------------------
-- 6. Alta segura: valida, avisa y crea en un solo paso (para llamar por RPC)
--    Si hay un REPETIDO devuelve error. Si solo hay parecidos, la pantalla ya
--    los mostró y el usuario confirmó con p_forzar = true.
-- -----------------------------------------------------------------------------
create or replace function fn_crear_producto(p_codigo text, p_nombre text, p_especie_codigo text,
                                             p_rol rol_salida default 'principal',
                                             p_interno boolean default false,
                                             p_forzar boolean default false)
returns productos language plpgsql as $$
declare
    v_dup record;
    v_row productos;
begin
    select * into v_dup from fn_productos_similares(p_nombre, p_especie_codigo)
     where veredicto in ('REPETIDO', 'MUY PARECIDO') order by similitud desc limit 1;

    if v_dup.veredicto = 'REPETIDO' then
        raise exception 'Ya existe: % (%)', v_dup.nombre, v_dup.codigo using errcode = 'unique_violation';
    end if;
    if v_dup.veredicto = 'MUY PARECIDO' and not p_forzar then
        raise exception 'Se parece mucho a: % (%). Confirma si es distinto.', v_dup.nombre, v_dup.codigo
              using errcode = 'check_violation';
    end if;
    if exists (select 1 from productos where codigo = upper(p_codigo)) then
        raise exception 'El código % ya está ocupado', upper(p_codigo) using errcode = 'unique_violation';
    end if;

    insert into productos (codigo, nombre, especie_id, rol_defecto, interno)
    values (upper(trim(p_codigo)), trim(p_nombre),
            (select id from especies where codigo = upper(p_especie_codigo)), p_rol, p_interno)
    returning * into v_row;
    return v_row;
end $$;

create or replace function fn_crear_proveedor(p_nombre text, p_acuerdo text default null,
                                              p_forzar boolean default false)
returns proveedores language plpgsql as $$
declare
    v_dup record;
    v_row proveedores;
begin
    select * into v_dup from fn_proveedores_similares(p_nombre)
     where veredicto in ('REPETIDO', 'MUY PARECIDO') order by similitud desc limit 1;

    if v_dup.veredicto = 'REPETIDO' then
        raise exception 'Ya existe: % (código %)', v_dup.nombre, v_dup.codigo using errcode = 'unique_violation';
    end if;
    if v_dup.veredicto = 'MUY PARECIDO' and not p_forzar then
        raise exception 'Se parece mucho a: % (código %). Confirma si es distinto.', v_dup.nombre, v_dup.codigo
              using errcode = 'check_violation';
    end if;

    insert into proveedores (codigo, nombre, acuerdo_limpieza)
    values (fn_siguiente_codigo_proveedor(), trim(p_nombre), p_acuerdo)
    returning * into v_row;
    return v_row;
end $$;

grant execute on all functions in schema public to authenticated;
