# Arquitectura

Micrositio público de licitaciones y panel de carga para el área de Compras. El código no tiene nada de un municipio en particular: la identidad se configura desde el panel.
Se despliega con Docker (la guía del README es para Coolify).

## Stack

Astro 7 (SSR, `@astrojs/node` standalone) · TypeScript estricto · Tailwind 4 · SQLite (`better-sqlite3`) + Drizzle · pnpm.
Íconos de `@tabler/icons`, importados de a uno como SVG crudo (`@tabler/icons/outline/x.svg?raw`) y renderizados con `components/ui/Icono.astro`.

## Comandos

```bash
pnpm dev                  # http://localhost:4321 (crea ./data/licitaciones.db y migra solo)
pnpm test                 # Vitest: estados, historial, montos, formato de importación
pnpm test:e2e             # Playwright: build de producción en :4600 con base vacía (.e2e-data), circuito completo de una pública
pnpm check                # astro check (tipos). Requiere TypeScript 6: astro check no soporta TS 7
pnpm lint
pnpm build && pnpm start  # producción local
pnpm db:generate          # nueva migración tras cambiar src/lib/db/schema.ts
pnpm crear-admin "Nombre" persona@municipio.gob.ar   # CLAVE=... para fijarla; si no, se genera una provisoria
pnpm importar archivo.json            # simulación de una importación → data/reporte-importacion.md
pnpm importar archivo.json --aplicar  # importa y baja los documentos de sus URLs (idempotente)
pnpm configurar ejemplos/generico     # carga nombre, colores, logo, header, footer y textos desde una carpeta
pnpm backup               # VACUUM INTO en data/backups, conserva 30
```

El dev server de Astro 7 corre como daemon (`pnpm astro dev stop|logs`). **Las rutas y acciones nuevas no se registran hasta reiniciarlo.**

## Arquitectura

- `src/lib/estados.ts`: **única** definición de estados, transiciones por modalidad, requisitos (fecha para abrir el llamado, adjudicatario para adjudicar, motivo para cierres) y textos de consecuencias. Si Compras cambia el circuito, se toca solo este archivo y sus tests.
- **Reglas por etapa** (`reglasEtapa()` en `estados.ts`). Las etapas son: 0 borrador, 1 llamado, 2 ofertas abiertas (evaluación/trámite) y 3 cerrado.
  - Cada campo tiene las etapas en que se edita. Número y año solo en borrador, salvo para un admin. Las ofertas recibidas desde la etapa 2. Cerrado solo admite observaciones.
  - Los adjudicatarios se cargan solo en la etapa 2 y se publican recién en «Adjudicada».
  - Cada tipo de documento tiene una etapa mínima: no se sube un decreto en borrador, pero sí un pliego más tarde, para la carga a destiempo. Decreto de adjudicación, orden de compra y ampliación solo si está adjudicada (o en el borrador de una privada); con uno cargado no se cierra sin adjudicar.
  - Un proveedor aparece una sola vez como adjudicatario, con su monto total. Si el total supera el presupuesto oficial se avisa (al agregar, en la sección y al adjudicar), pero no se bloquea.
  - Las privadas se publican solo con su resultado (que no se presente nadie sin invitación). En borrador se carga todo, también ofertas, adjudicatarios y decretos, y se pasa directo al cierre; no pasan por «En trámite» (las importadas en ese estado siguen desde ahí). Los concursos sí pasan siempre por «En trámite».
  - **Invitados** (tabla `invitados`, componente `Invitados.astro`): mínimo legal `MINIMO_INVITADOS` (5 en públicas y privadas, 3 en concursos), exigido solo al salir del borrador y nunca para anular. La invitación sale en papel: el sistema solo registra nombre, CUIT opcional y si compró el pliego. **No se publican los nombres**, solo la cantidad, como en la página anterior. `procedimientos.invitados` es la cantidad histórica importada, sin nombres: cuenta solo si no hay lista.
  - La UI muestra lo bloqueado en solo lectura con su explicación, y el servidor lo rechaza igual.
- «Requieren atención» (`lib/atencion.ts`): reglas orientativas sobre el día en hora argentina (llamado vencido o sin pliego, evaluación con apertura futura o a más de 90 días, borradores de más de 30). El listado del panel muestra el conteo y filtra con `?atencion=<regla>`. Antes de agregar una regla, medir cuántos procedimientos reales marca: si marca casi todos, es ruido.
- `src/lib/procedimientos.ts`: toda mutación pasa por acá, en una transacción que **siempre** escribe en `historial` (con el nombre del usuario copiado, para sobrevivir a bajas). Mover la fecha de apertura de algo publicado se registra como `prorroga` y es público.
- `src/actions/index.ts`: Astro Actions del panel. Validan con Zod (mensajes en español) y vuelven a chequear sesión y rol; las reglas de negocio no dependen de la UI.
- Subida de documentos: `POST /panel/api/documentos`, un archivo por pedido, para poder mostrar el progreso. Se valida extensión, tamaño (25 MB) y **firma de bytes** (un `.exe` renombrado a `.pdf` se rechaza). Los archivos se guardan como `{uuid}.{ext}` en `DATA_DIR/documentos`.
- Descargas: `/documentos/[id]` (públicas: solo documentos públicos de procedimientos no borrador ni en la papelera) y `/panel/api/documentos/[id]` (panel: todos).
- Borrado: siempre lógico primero (`eliminado_en`, papelera). El borrado definitivo es solo para admin y borra también el archivo del disco.
- Montos en **centavos enteros**. Fechas en hora argentina (UTC-3 fija) con `formato.ts`.
- **La fecha de apertura es solo un día, sin hora.** Se guarda al mediodía en hora argentina (`desdeFechaInput` / `aFechaInput`), y para comparar se usa `diaLocal()`, que da `AAAA-MM-DD`. Un llamado sigue abierto hasta el mismo día de la apertura inclusive.
- **Controles propios** en `src/scripts/controles.ts`: ningún `<select>` ni selector de fecha nativo se ve en pantalla.
  - Todo `<select>` se reemplaza por un combobox accesible (patrón «select-only combobox» de ARIA APG). El select original queda oculto como fuente de verdad.
  - La fecha se escribe como `<input type="text" hidden data-fecha value="AAAA-MM-DD">` y se muestra con un calendario propio («date picker dialog» de APG), en español y con la semana empezando el lunes.
  - El contenido agregado después de cargar la página se mejora con `mejorarControles(nodo)`.
- **Marca configurable** (`lib/configuracion.ts`): nombre, colores, logo, favicon, header, footer y textos viven en la tabla `configuracion` (una fila JSON validada con Zod) y se editan en `/panel/configuracion` (solo admin). Sin fila guardada, el sitio es genérico («Municipio») y el panel avisa.
  - El middleware la lee en cada pedido (`Astro.locals.sitio`). Ningún componente puede tener texto, link ni color de un municipio en particular.
  - Colores: se elige uno y `lib/color.ts` deriva el resto. No se guarda un color con contraste menor a 4.5:1 con blanco. Los tonos se aplican pisando `--color-marca-*` con un `<style>` en `components/marca/Cabeza.astro`; el token de Tailwind se llama `marca` (nunca un color con nombre).
  - Si el color no cambia, al guardar se conservan los tonos guardados (pueden venir ajustados a mano desde `pnpm configurar`).
  - Logo y favicon: PNG, JPG o WebP (firma de bytes, 2 MB). **SVG no**, porque puede traer scripts. Se guardan en `DATA_DIR/marca` con un nombre único por subida y se sirven en `/marca/[archivo]` con caché inmutable.
  - Los links solo aceptan `https:`, `http:`, `mailto:` y `tel:` (un `javascript:` sería un XSS en todo el sitio).
  - Las dimensiones de logos y cajas son fijas: el logo se encaja (`object-contain`) en esas cajas, sin cambiar el layout.
  - Cada guardado queda en `cambios_configuracion`. En las listas se registra solo lo agregado, lo quitado o el nuevo orden.
- `ejemplos/generico/`: una configuración completa con logo y favicon neutros. Se carga con `pnpm configurar ejemplos/generico`; cada municipio arma su carpeta con la misma forma. Las fuentes Geist (`public/fonts`) son genéricas.
- **Importación inicial** (`scripts/importar.ts`, formato en `scripts/importar/formato.ts`): lee un JSON con los procedimientos anteriores al sistema (ejemplo en `ejemplos/importacion.json`). Montos en centavos, fechas `AAAA-MM-DD`, documentos por URL. Cada registro se valida por separado: uno mal formado se informa y no frena al resto. Convertir la publicación anterior de cada municipio a ese JSON queda fuera del repo.

## Seguridad

- **Content-Security-Policy** (`POLITICA_CONTENIDO` en `lib/seguridad.ts`, la aplica el middleware solo en el build): `script-src 'self'`. **Nunca** un `<script>` en línea ni un handler `on*=`. Por eso `vite.build.assetsInlineLimit` está en 0: si no, Astro incrusta los scripts chicos y la CSP los bloquea. En dev no rige; los e2e (build de producción) fallan ante cualquier violación (`tests/e2e/fixtures.ts`). Todo spec nuevo importa `test` de ahí.
- JSON dentro de un `<script>` (JSON-LD) **siempre** con `jsonParaScript()`: `JSON.stringify` no escapa `</script>`.
- Login: límite de intentos fallidos en memoria (`lib/limite-intentos.ts`), por IP + email y por IP. Nunca por email solo (dejaría afuera al admin). Se chequea antes de argon2.
- Contraseñas generadas por el sistema (alta, reseteo, `crear-admin` sin `CLAVE`) son **provisorias** (`debe_cambiar_clave`): el middleware solo deja usar `/panel/cuenta`, `/panel/salir` y `cambiarMiClave` hasta cambiarla. Cambiar la propia pide la actual y cierra las otras sesiones.
- El middleware compara rutas sin la barra final: en producción el cliente de las acciones llama a `/_actions/x/`.
- Usuarios: toda mutación pasa por `lib/usuarios.ts` y queda en `cambios_usuarios` (se muestra en `/panel/usuarios`).
- Subidas: se rechaza por `Content-Length` (413) antes de leer el cuerpo; el adaptador tiene `bodySizeLimit` de 27 MB.
- Ningún texto, ejemplo ni validación supone un dominio de email o un municipio en particular.

## Reglas del panel

- Navegación en **barra lateral** (`components/panel/NavPanel.astro`): fija desde `lg`, y en pantallas chicas un `<dialog>` modal que se abre con el botón de menú. Las secciones de administración solo aparecen para admin.

- **Toda acción lleva confirmación**: estado, guardar (muestra el diff), subir (lista de archivos), quitar, papelera, restaurar, eliminar definitivo (hay que tipear el número), usuarios y salir sin guardar.
- Se usa `<form data-accion="..." data-titulo=... data-detalle=...>`, que maneja `src/scripts/formularios.ts`, o `confirmar()` de `src/scripts/confirmar.ts`. **Nunca** `confirm()` ni `alert()`.
- El `beforeunload` nativo está desactivado en dev: las recargas automáticas lo disparan y traban las pruebas automatizadas del navegador.

## Datos

`DATA_DIR` (por defecto `./data`, en Docker `/data`) contiene `licitaciones.db`, `documentos/`, `marca/` (logo y favicon) y `backups/`. Es el único volumen a respaldar.
Ningún dato de un municipio vive en el repo: todo está en `DATA_DIR`.

## Deploy

- `Dockerfile` (multi-stage, corre como `node`), con un volumen persistente en `/data` y healthcheck en `/salud`.
- Variable: `SITE_URL`. **Tiene que estar marcada como variable de build en Coolify**: el dominio queda fijo al compilar (canonical, sitemap y la protección CSRF del login). Si la imagen se compila con otro dominio, el login responde 403.
- Scheduled task diaria: `node scripts/backup.mjs`. Los documentos se respaldan con el backup del volumen.
- Después del primer arranque, el admin completa `/panel/configuracion`, o se corre `pnpm configurar <carpeta>` en local y se sube `data/` (incluye `data/marca`).
- Primer administrador: variables `ADMIN_EMAIL`, `ADMIN_CLAVE` y `ADMIN_NOMBRE`. Solo actúan si la base no tiene usuarios. Borrar `ADMIN_CLAVE` después del primer arranque.
- La imagen de producción no incluye `tsx` ni los scripts TypeScript. La importación se corre en local (`pnpm importar archivo.json --aplicar`) y después se sube el contenido de `data/` (`licitaciones.db` + `documentos/`) al volumen `/data`, con la app detenida.
