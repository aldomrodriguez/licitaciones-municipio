# Licitaciones municipales

Micrositio público de licitaciones, licitaciones privadas y concursos de precios, con un panel de carga para el área de Compras. La identidad del municipio (nombre, colores, logo, header, footer y textos) se configura desde el panel: el código no tiene nada de un municipio en particular.

**Stack:** Astro (SSR, Node) · TypeScript · Tailwind · SQLite. Todo el estado (base, documentos, logo) vive en una sola carpeta: `DATA_DIR`.

La arquitectura, las reglas de cada etapa y las decisiones de seguridad están en [`docs/arquitectura.md`](docs/arquitectura.md).

## Qué incluye

- Sitio público con llamados abiertos, buscador y ficha de cada procedimiento con sus documentos.
- Panel para Compras: carga por etapas (borrador, llamado, evaluación o trámite, cierre), invitados, ofertas, adjudicatarios y documentos, con confirmación en cada acción e historial público de cambios.
- Usuarios con rol de administrador o de Compras, papelera y backups diarios.

## Desarrollo local

Requiere Node 22.23 o superior y pnpm.

```bash
pnpm install
pnpm dev                    # http://localhost:4321 (crea ./data/licitaciones.db y migra solo)
pnpm crear-admin "Nombre Apellido" persona@municipio.gob.ar
pnpm configurar ejemplos/generico   # opcional: carga una identidad de ejemplo
```

## Adaptarlo a tu municipio

1. **Identidad.** Completar `/panel/configuracion` o copiar `ejemplos/generico/` a una carpeta propia, cambiar `configuracion.json`, `logo.png` y `favicon.png` (PNG, JPG o WebP; SVG no) y correr `pnpm configurar <carpeta>`. Los colores necesitan contraste de al menos 4.5:1 con blanco.
2. **Montos y modalidades.** Los textos de cada modalidad y la vigencia de los montos son parte de la configuración. El circuito de estados y los mínimos de invitados están en `src/lib/estados.ts`, con sus tests.
3. **Procedimientos anteriores (opcional).** Armar un JSON con el formato de `ejemplos/importacion.json` (montos en centavos, fechas `AAAA-MM-DD`, documentos por URL) y correr `pnpm importar archivo.json`. Sin `--aplicar` solo genera un reporte en `data/reporte-importacion.md`; con `--aplicar` importa y baja los documentos. Se puede repetir sin duplicar.
4. **Zona horaria.** Las fechas se manejan en hora argentina (UTC-3 fija, `src/lib/formato.ts`).

Verificación antes de subir cambios:

```bash
pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

## Deploy en Coolify

La app se despliega como una imagen Docker (`Dockerfile` del repo) con un volumen persistente en `/data`.

### 1. Crear el recurso

1. En Coolify: **+ New → Application → Public/Private Repository** y elegir este repo, rama `main`.
2. **Build Pack: `Dockerfile`**. No usar *Docker Compose*: el `docker-compose.yml` es para probar en local y no le pasa todas las variables al contenedor.
3. **Ports Exposes:** `4321`.
4. **Domains:** el dominio público con `https://`, por ejemplo `https://licitaciones.municipio.gob.ar`. Coolify gestiona el certificado.

### 2. Variables de entorno

| Variable | Valor | Notas |
|---|---|---|
| `SITE_URL` | `https://licitaciones.municipio.gob.ar` | **Marcarla como _Build Variable_.** Tiene que coincidir exactamente con el dominio. |
| `ADMIN_EMAIL` | email del primer administrador | Solo si la base arranca vacía. |
| `ADMIN_CLAVE` | contraseña de al menos 10 caracteres | Solo si la base arranca vacía. **Borrarla después del primer arranque.** |
| `ADMIN_NOMBRE` | nombre del primer administrador | Opcional. |

> **`SITE_URL` como variable de build es obligatoria.** El dominio queda fijo al compilar (canonical, sitemap y protección CSRF del login). Si la imagen se compila con otro dominio, el sitio funciona pero **el login responde 403**.

`ADMIN_*` solo crea el usuario si la base no tiene ninguno. Si vas a subir una base existente (paso 5), no hacen falta.

### 3. Volumen persistente

En **Persistent Storage → + Add → Volume Mount**:

- **Destination Path:** `/data`

Ahí quedan `licitaciones.db`, `documentos/`, `marca/` y `backups/`. Es lo único que hay que respaldar. Sin este volumen, cada deploy borra todo.

### 4. Primer deploy

**Deploy.** La app aplica las migraciones sola al arrancar. Coolify usa el healthcheck de la imagen (`/salud`) para saber si quedó en pie.

Con una base vacía:

1. Entrar a `/panel` con `ADMIN_EMAIL` / `ADMIN_CLAVE`.
2. Borrar `ADMIN_CLAVE` de las variables en Coolify.
3. Completar la identidad del sitio en `/panel/configuracion`. Hasta entonces el sitio se ve genérico («Municipio») y el panel lo avisa.

### 5. Subir datos preparados en local (opcional)

La imagen de producción no trae `tsx` ni los scripts TypeScript (`importar`, `configurar`, `crear-admin`). Si querés arrancar con datos importados, una configuración cargada o usuarios ya creados, preparalos en local y subí la carpeta `data/`:

```bash
# En local
pnpm configurar <carpeta>           # la configuración de tu municipio
pnpm importar archivo.json --aplicar   # si corresponde: procedimientos anteriores y sus documentos
pnpm crear-admin "Nombre Apellido" persona@municipio.gob.ar
pnpm astro dev stop                 # que nada esté escribiendo en la base
```

Después:

1. **Detener la app en Coolify** (Stop).
2. Ver en **Persistent Storage** el nombre del volumen. En el servidor está en `/var/lib/docker/volumes/<nombre>/_data`.
3. Copiar el contenido de `data/` (no hace falta `backups/` ni `reporte-importacion.md`):

   ```bash
   rsync -av --exclude backups --exclude reporte-importacion.md \
     data/ usuario@servidor:/var/lib/docker/volumes/<nombre>/_data/
   ```

   Si hay archivos `licitaciones.db-wal` y `licitaciones.db-shm`, subirlos junto con `licitaciones.db`: son parte de la base.

4. En el servidor, dejar los archivos a nombre del usuario del contenedor (`node`, uid 1000):

   ```bash
   sudo chown -R 1000:1000 /var/lib/docker/volumes/<nombre>/_data
   ```

5. **Arrancar la app** (Start).

### 6. Backups

En **Scheduled Tasks → + Add**:

- **Command:** `node scripts/backup.mjs`
- **Frequency:** `0 3 * * *` (todos los días a las 3)

Hace una copia consistente de la base en `/data/backups` y conserva las últimas 30. Los documentos (`/data/documentos`) se respaldan con el backup del volumen. Para descargar una copia de todo, alcanza con bajar la carpeta del volumen.

### Actualizar

Cada push a `main` se despliega con **Redeploy** o, si está activado, automáticamente. Las migraciones nuevas se aplican solas al arrancar y los datos del volumen no se tocan.

### Problemas comunes

| Síntoma | Causa |
|---|---|
| El login responde 403 | `SITE_URL` no está marcada como variable de build o no coincide con el dominio. Corregirla y hacer **Redeploy** (hay que recompilar). |
| Los datos desaparecen después de un deploy | Falta el volumen en `/data`. |
| La app no arranca después de subir `data/` | Los archivos no son del usuario `node`: falta el `chown` del paso 5. |
| No puedo entrar y no hay otro admin | Con la app detenida, bajar la `licitaciones.db` **del servidor** (no usar una copia local vieja: se perderían los cambios de producción), restablecer la contraseña con `DATA_DIR=<carpeta> pnpm crear-admin "Nombre" email` (si el email existe, solo le cambia la contraseña), volver a subirla y arrancar. Mejor tener siempre dos administradores. |

## Licencia

Copyright © 2026 Aldo Rodriguez.

[AGPL-3.0-or-later](LICENSE). Se puede usar, modificar y desplegar libremente; si se ofrece una versión modificada como servicio, hay que publicar sus cambios con la misma licencia.
