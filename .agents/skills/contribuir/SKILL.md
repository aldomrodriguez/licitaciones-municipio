---
name: contribuir
description: Cómo trabajar bien en el repo licitaciones-municipio (Astro + SQLite) — reglas, arquitectura, tests y armado del pull request. Usar antes de cambiar código, agregar una funcionalidad, corregir un error o preparar un commit o un PR en este proyecto.
license: AGPL-3.0-or-later
metadata:
  author: Aldo Rodriguez
  version: "1.0"
---

# Contribuir a licitaciones-municipio

Micrositio público de licitaciones y panel de carga para el área de Compras de un municipio. Lo puede usar cualquier municipio: la identidad se configura desde el panel y **el código no puede tener nada de un municipio en particular**.

## Antes de empezar

1. Leer `docs/arquitectura.md`. Ahí están las reglas de cada etapa, la seguridad y las decisiones que no se discuten en cada cambio.
2. Ubicar dónde va el cambio con la tabla de abajo. Si la regla de negocio no está clara o el pedido es ambiguo, **preguntar antes de escribir código**.
3. Para cambios grandes (refactors, funcionalidades nuevas, cambios en el circuito de estados), proponer el enfoque y esperar el visto bueno antes de implementar.

```bash
pnpm install
pnpm dev     # http://localhost:4321 — corre como daemon: pnpm astro dev stop | logs
```

Las rutas y acciones nuevas no se registran hasta reiniciar el dev server.

## Dónde va cada cosa

| Cambio | Lugar |
|---|---|
| Estados, transiciones, requisitos, qué se edita en cada etapa | `src/lib/estados.ts` (único lugar) y sus tests |
| Cualquier mutación de un procedimiento | `src/lib/procedimientos.ts`, en una transacción que escribe en `historial` |
| Acciones del panel | `src/actions/index.ts`: Zod con mensajes en español, y volver a chequear sesión y rol |
| Usuarios | `src/lib/usuarios.ts` (queda registrado en `cambios_usuarios`) |
| Identidad del municipio | `src/lib/configuracion.ts`: nunca en un componente |
| Montos y fechas | `src/lib/formato.ts` |
| Esquema de la base | `src/lib/db/schema.ts` y después `pnpm db:generate` (nunca editar una migración ya publicada) |
| Selects y calendario | `src/scripts/controles.ts` |
| Confirmaciones | `src/scripts/formularios.ts` (`<form data-accion>`) o `confirmar()` de `src/scripts/confirmar.ts` |

## Reglas que no se negocian

**Contenido**
- Textos de interfaz, mensajes de error, comentarios y documentación en **español**.
- Nada propio de un municipio: ni nombres, ni direcciones, ni dominios de email, ni colores, ni links. En ejemplos y tests usar `persona@municipio.gob.ar`, `https://www.municipio.gob.ar/` o «Municipio de Ejemplo», y proveedores inventados.

**Datos**
- Montos en **centavos enteros**. Nunca `float` para plata.
- La fecha de apertura es un día sin hora, en hora argentina (UTC-3): `desdeFechaInput`, `aFechaInput` y `diaLocal()`.
- Borrado siempre lógico primero (papelera). Toda mutación deja rastro en el historial.
- Las reglas de negocio se validan en el servidor, aunque la interfaz ya las bloquee.

**Seguridad**
- CSP con `script-src 'self'`: **nunca** un `<script>` en línea ni un handler `on*=`. JSON dentro de un `<script>`, solo con `jsonParaScript()`.
- Links configurables solo `https:`, `http:`, `mailto:` y `tel:`. Imágenes subidas: PNG, JPG o WebP con firma de bytes, nunca SVG.
- Subidas: validar extensión, tamaño y firma de bytes.

**Interfaz**
- Tailwind 4 como única solución de estilos. El color del municipio es el token `marca`, nunca un color con nombre.
- Íconos de `@tabler/icons`, uno por import (`@tabler/icons/outline/x.svg?raw`), renderizados con `components/ui/Icono.astro`.
- Toda acción del panel lleva confirmación. **Nunca** `confirm()` ni `alert()`.
- Ningún `<select>` ni selector de fecha nativo a la vista. El contenido agregado después de la carga se mejora con `mejorarControles(nodo)`.
- Accesibilidad obligatoria: HTML semántico, ARIA cuando corresponda, foco manejado y contraste AA.

**TypeScript**
- Modo estricto. Evitar `any` y `unknown`; preferir la inferencia.

## Tests

- Si cambia el comportamiento, se agregan o actualizan tests aunque nadie los pida.
- Unitarios con Vitest, junto al archivo (`algo.test.ts`). Para la base, `crearDb(':memory:')`.
- Los e2e con Playwright corren sobre un build de producción con base vacía. Todo spec nuevo importa `test` de `tests/e2e/fixtures.ts`, que hace fallar el test ante cualquier violación de la CSP.
- Un cambio en `estados.ts` necesita tests de la transición permitida **y** de la rechazada.

## Antes de dar el trabajo por terminado

```bash
pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Las cuatro tienen que pasar. No se acepta código con errores de tipos, de lint o con tests fallidos. Si algo falla, se informa tal cual, sin ocultarlo.

Control de contenido antes de commitear: ningún dato de un municipio real en el diff.

## Commits y pull request

- Commits a nombre de la persona que contribuye, con mensaje en español que diga qué cambia. **Sin líneas `Co-authored-by` de herramientas ni asistentes de IA** y sin firmas del tipo «generado con».
- PR chico y enfocado: una cosa por PR.
- La descripción explica **qué** cambia, **por qué** (si es por normativa, cuál y de qué provincia) y **cómo se verificó**.
- Si se introduce una regla nueva («nunca X», «siempre Y»), se documenta en `docs/arquitectura.md` en el mismo PR.
