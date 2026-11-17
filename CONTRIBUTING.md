# Cómo contribuir

Gracias por querer sumar. Este proyecto existe para que cualquier municipio pueda publicar sus compras de forma clara, y cada aporte ayuda a que sirva a más gobiernos y a más vecinos.

## Formas de ayudar

- **Reportar un error:** abrir un [issue](https://github.com/aldomrodriguez/licitaciones-municipio/issues) con qué hiciste, qué esperabas y qué pasó.
- **Proponer una mejora:** contar qué necesita tu área de Compras. Si depende de la normativa, decir cuál y de qué provincia: conocer esas diferencias ayuda a que el sistema funcione en más lugares.
- **Contar que lo usás:** saber qué municipios lo implementaron ayuda a decidir qué mejorar.
- **Enviar código:** seguir los pasos de abajo.

## Antes de escribir código

1. Leer [`docs/arquitectura.md`](docs/arquitectura.md): las etapas, los estados, la seguridad y las decisiones tomadas.
2. Para un cambio grande (una funcionalidad nueva, un cambio en el circuito de estados o un refactor), abrir primero un issue y acordar el enfoque.

```bash
pnpm install
pnpm dev     # http://localhost:4321
```

## Reglas del proyecto

- Textos, mensajes y comentarios **en español**.
- **Nada propio de un municipio** en el código, los ejemplos ni los tests: ni nombres, ni direcciones, ni dominios de email, ni colores, ni proveedores reales. Lo de cada municipio va en su configuración.
- Montos en centavos enteros. Fechas de apertura como un día en hora argentina.
- Nunca scripts en línea (la política de seguridad los bloquea), nunca `confirm()` ni `alert()`, y toda acción del panel con confirmación.
- Accesibilidad obligatoria: HTML semántico, teclado y contraste.
- Todo tiene que andar en un celular de 320 px de ancho sin scroll horizontal.

El detalle completo está en `docs/arquitectura.md`. La misma guía, pensada para asistentes de código, está en [`.agents/skills/contribuir/SKILL.md`](.agents/skills/contribuir/SKILL.md).

## Pull requests

1. Un PR chico y enfocado en una sola cosa.
2. Si cambia el comportamiento, agregar o actualizar los tests.
3. Antes de enviarlo, esto tiene que pasar:
   ```bash
   pnpm lint && pnpm check && pnpm test && pnpm test:e2e
   ```
4. En la descripción: **qué** cambia, **por qué** y **cómo lo probaste**.
5. Commits con tu nombre y un mensaje en español. Sin líneas `Co-authored-by` de herramientas ni asistentes de IA.

Al enviar un aporte, aceptás que se publique bajo la licencia del proyecto, [AGPL-3.0-or-later](LICENSE).
