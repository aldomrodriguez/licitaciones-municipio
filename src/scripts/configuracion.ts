/**
 * Pantalla de configuración del sitio:
 * - editores de listas (links y columnas del footer), que guardan su contenido como JSON
 *   en un campo oculto para que la confirmación muestre el diff;
 * - selector de color con vista previa y control de contraste;
 * - subida del logo y del favicon con vista previa y confirmación.
 * Quitar una fila o una columna también pide confirmación.
 */
import { avisarDespues, confirmar } from './confirmar';
import { derivarColores, esHex, problemaDeContraste } from '../lib/color';

let contador = 0;
const nuevoId = () => `n${Date.now().toString(36)}${contador++}`;

/** Clona una plantilla reemplazando el marcador de ids por uno nuevo. */
function clonar(plantilla: HTMLTemplateElement, marcador: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = plantilla.innerHTML.replaceAll(marcador, nuevoId());
  return t.content.firstElementChild as HTMLElement;
}

function avisarCambio(el: Element) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Editor de links ─────────────────────────────────────────────────────────

const valor = (raiz: ParentNode, sel: string) => raiz.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)?.value.trim() ?? '';

function leerEnlaces(editor: HTMLElement) {
  return [...editor.querySelectorAll<HTMLElement>(':scope > ol > [data-fila]')].map((f) => ({ texto: valor(f, '[data-texto]'), href: valor(f, '[data-href]') }));
}

function leerColumnas(editor: HTMLElement) {
  return [...editor.querySelectorAll<HTMLElement>(':scope > ol > [data-columna]')].map((c) => ({
    titulo: valor(c, '[data-titulo-columna]'),
    textos: valor(c, '[data-textos-columna]')
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    links: leerEnlaces(c.querySelector<HTMLElement>('[data-editor-enlaces]')!),
  }));
}

/** Vuelve a escribir los JSON ocultos y el estado de cada lista (vacía, al máximo). */
function sincronizar(form: HTMLFormElement) {
  for (const ed of form.querySelectorAll<HTMLElement>('[data-editor-enlaces]')) {
    const filas = ed.querySelectorAll(':scope > ol > [data-fila]').length;
    const max = Number(ed.dataset.max);
    ed.querySelector<HTMLElement>(':scope > [data-vacio]')!.hidden = filas > 0;
    ed.querySelector<HTMLElement>(':scope > [data-cabecera]')!.hidden = filas === 0;
    ed.querySelector<HTMLButtonElement>(':scope > [data-agregar]')!.disabled = filas >= max;
    ed.querySelector<HTMLElement>(':scope > [data-limite]')!.hidden = filas < max;
    const oculto = ed.querySelector<HTMLInputElement>(':scope > input[data-lista]');
    if (oculto) oculto.value = JSON.stringify(leerEnlaces(ed));
  }
  for (const ed of form.querySelectorAll<HTMLElement>('[data-editor-columnas]')) {
    const n = ed.querySelectorAll(':scope > ol > [data-columna]').length;
    const max = Number(ed.dataset.max);
    ed.querySelector<HTMLElement>('[data-vacio-columnas]')!.hidden = n > 0;
    ed.querySelector<HTMLButtonElement>('[data-agregar-columna]')!.disabled = n >= max;
    ed.querySelector<HTMLElement>('[data-limite-columnas]')!.hidden = n < max;
    ed.querySelector<HTMLInputElement>(':scope > input[data-lista]')!.value = JSON.stringify(leerColumnas(ed));
  }
}

function mover(item: HTMLElement, delta: -1 | 1, foco: string) {
  const otro = delta < 0 ? item.previousElementSibling : item.nextElementSibling;
  if (!otro) return;
  if (delta < 0) otro.before(item);
  else otro.after(item);
  item.querySelector<HTMLElement>(foco)?.focus();
  avisarCambio(item);
}

function nombreFila(fila: HTMLElement): string {
  return valor(fila, '[data-texto]') || valor(fila, '[data-titulo-columna]') || 'sin texto';
}

function iniciarEditores(form: HTMLFormElement) {
  form.addEventListener('input', () => sincronizar(form), { capture: true });

  form.addEventListener('click', async (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!boton) return;
    const d = boton.dataset;

    if (d.agregar !== undefined) {
      const ed = boton.closest<HTMLElement>('[data-editor-enlaces]')!;
      const fila = clonar(ed.querySelector<HTMLTemplateElement>(':scope > template[data-plantilla]')!, '__N__');
      ed.querySelector(':scope > ol')!.append(fila);
      fila.querySelector<HTMLInputElement>('[data-texto]')!.focus();
      avisarCambio(fila);
    } else if (d.agregarColumna !== undefined) {
      const ed = boton.closest<HTMLElement>('[data-editor-columnas]')!;
      const col = clonar(ed.querySelector<HTMLTemplateElement>('template[data-plantilla-columna]')!, '__C__');
      ed.querySelector(':scope > ol')!.append(col);
      col.querySelector<HTMLInputElement>('[data-titulo-columna]')!.focus();
      avisarCambio(col);
    } else if (d.subir !== undefined || d.bajar !== undefined) {
      mover(boton.closest<HTMLElement>('[data-fila]')!, d.subir !== undefined ? -1 : 1, d.subir !== undefined ? '[data-subir]' : '[data-bajar]');
    } else if (d.subirColumna !== undefined || d.bajarColumna !== undefined) {
      const arriba = d.subirColumna !== undefined;
      mover(boton.closest<HTMLElement>('[data-columna]')!, arriba ? -1 : 1, arriba ? '[data-subir-columna]' : '[data-bajar-columna]');
    } else if (d.quitar !== undefined || d.quitarColumna !== undefined) {
      const esColumna = d.quitarColumna !== undefined;
      const item = boton.closest<HTMLElement>(esColumna ? '[data-columna]' : '[data-fila]')!;
      const lista = esColumna ? 'Columnas del footer' : item.closest<HTMLElement>('[data-editor-enlaces]')!.dataset.etiquetaLista;
      const ok = await confirmar({
        titulo: esColumna ? '¿Quitar esta columna?' : '¿Quitar este link?',
        detalle: [
          `Se quita «${nombreFila(item)}» de ${lista}${esColumna ? ', con todos sus links' : ''}.`,
          'El sitio no cambia hasta que guardes la sección.',
        ],
        tono: 'peligro',
        boton: 'Quitar',
      });
      if (!ok) return;
      const vecino = (item.nextElementSibling ?? item.previousElementSibling) as HTMLElement | null;
      const contenedor = item.parentElement!.parentElement!;
      item.remove();
      sincronizar(form);
      avisarCambio(contenedor);
      (vecino?.querySelector<HTMLElement>('input') ?? contenedor.querySelector<HTMLElement>(esColumna ? '[data-agregar-columna]' : ':scope > [data-agregar]'))?.focus();
    }
  });

  // Los nombres accesibles de los botones de cada fila incluyen el texto del link.
  const rotular = () => {
    for (const f of form.querySelectorAll<HTMLElement>('[data-fila], [data-columna]')) {
      const n = nombreFila(f);
      const col = f.matches('[data-columna]');
      f.querySelector(col ? ':scope [data-subir-columna]' : ':scope [data-subir]')?.setAttribute('aria-label', `Subir «${n}»`);
      f.querySelector(col ? ':scope [data-bajar-columna]' : ':scope [data-bajar]')?.setAttribute('aria-label', `Bajar «${n}»`);
      f.querySelector(col ? ':scope [data-quitar-columna]' : ':scope [data-quitar]')?.setAttribute('aria-label', `Quitar «${n}»`);
    }
  };
  form.addEventListener('input', rotular);
  rotular();
  sincronizar(form);
}

// ─── Color ───────────────────────────────────────────────────────────────────

function iniciarColor(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('#color')!;
  const estado = form.querySelector<HTMLElement>('#color-estado')!;
  const vista = form.querySelector<HTMLElement>('[data-vista-color]')!;
  const muestras = [...form.querySelectorAll<HTMLButtonElement>('[data-color]')];
  const ayudaBase = estado.textContent ?? '';

  const aplicar = () => {
    const hex = input.value.trim().toLowerCase();
    muestras.forEach((m) => m.setAttribute('aria-checked', String(m.dataset.color === hex)));
    if (!esHex(hex)) {
      input.setCustomValidity('Escribí el color con el formato #RRGGBB, por ejemplo #2b5d8a.');
      input.setAttribute('aria-invalid', 'true');
      estado.textContent = 'Formato #RRGGBB, por ejemplo #2b5d8a.';
      return;
    }
    const problema = problemaDeContraste(hex);
    input.setCustomValidity(problema ?? '');
    if (problema) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    estado.textContent = problema ?? ayudaBase;
    estado.classList.toggle('text-peligro', Boolean(problema));
    const c = derivarColores(hex);
    vista.style.setProperty('--color-marca', c.marca);
    vista.style.setProperty('--color-marca-sobre-marca', c.sobreMarca);
    vista.style.setProperty('--color-marca-sobre-oscuro', c.sobreOscuro);
  };

  // Al cargar, la vista previa muestra los tonos guardados (no los recalcula).
  const inicial = input.value;
  input.addEventListener('input', aplicar);
  for (const m of muestras) {
    m.addEventListener('click', () => {
      input.value = m.dataset.color!;
      aplicar();
      avisarCambio(input);
    });
  }
  // Flechas para moverse entre las muestras (patrón radiogroup).
  muestras.forEach((m, i) => {
    m.tabIndex = m.getAttribute('aria-checked') === 'true' || (i === 0 && !muestras.some((x) => x.getAttribute('aria-checked') === 'true')) ? 0 : -1;
    m.addEventListener('keydown', (e) => {
      const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!paso) return;
      e.preventDefault();
      const otra = muestras[(i + paso + muestras.length) % muestras.length]!;
      muestras.forEach((x) => (x.tabIndex = x === otra ? 0 : -1));
      otra.focus();
      otra.click();
    });
  });
  if (inicial !== input.value) aplicar();
}

// ─── Logo y favicon ──────────────────────────────────────────────────────────

function iniciarImagen(raiz: HTMLElement) {
  const clase = raiz.dataset.clase!;
  const titulo = raiz.dataset.titulo!;
  const elegir = raiz.querySelector<HTMLInputElement>('[data-elegir]')!;
  const vista = raiz.querySelector<HTMLElement>('[data-vista]')!;
  const img = raiz.querySelector<HTMLImageElement>('[data-vista-img]')!;
  const error = raiz.querySelector<HTMLElement>('[data-error]')!;
  let archivo: File | null = null;
  let url = '';

  const limpiar = () => {
    if (url) URL.revokeObjectURL(url);
    archivo = null;
    url = '';
    vista.hidden = true;
    elegir.value = '';
  };

  elegir.addEventListener('change', () => {
    error.hidden = true;
    const f = elegir.files?.[0];
    if (!f) return;
    if (!/\.(png|jpe?g|webp)$/i.test(f.name)) {
      error.textContent = `«${f.name}» no es PNG, JPG ni WebP.`;
      error.hidden = false;
      elegir.value = '';
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      error.textContent = `«${f.name}» supera los 2 MB.`;
      error.hidden = false;
      elegir.value = '';
      return;
    }
    limpiar();
    archivo = f;
    url = URL.createObjectURL(f);
    img.src = url;
    raiz.querySelector('[data-vista-nombre]')!.textContent = f.name;
    vista.hidden = false;
    raiz.querySelector<HTMLButtonElement>('[data-usar]')!.focus();
  });

  raiz.querySelector('[data-descartar]')!.addEventListener('click', () => {
    limpiar();
    elegir.focus();
  });

  raiz.querySelector('[data-usar]')!.addEventListener('click', async () => {
    if (!archivo) return;
    const f = archivo;
    const reemplaza = Boolean(raiz.querySelector('img[data-actual]'));
    const ok = await confirmar({
      titulo: clase === 'logo' ? '¿Usar este logo?' : '¿Usar este ícono?',
      detalle: [
        reemplaza ? `Reemplaza el ${titulo.toLowerCase()} actual, que se borra.` : `Es el primer ${titulo.toLowerCase()} del sitio.`,
        clase === 'logo' ? 'Se ve enseguida en el header, el footer, el login y el panel.' : 'Se ve en la pestaña del navegador (puede tardar en actualizarse por la caché).',
      ],
      lista: [{ etiqueta: f.name, despues: `${Math.round(f.size / 1024)} KB` }],
      boton: 'Usar esta imagen',
      ejecutar: async () => {
        const datos = new FormData();
        datos.set('clase', clase);
        datos.set('archivo', f);
        try {
          const r = await fetch('/panel/api/marca', { method: 'POST', body: datos });
          return r.ok ? null : (await r.text()) || `Error ${r.status}`;
        } catch {
          return 'Se cortó la conexión. Probá de nuevo.';
        }
      },
    });
    if (!ok) return;
    avisarDespues(clase === 'logo' ? 'Logo actualizado.' : 'Ícono actualizado.');
    location.reload();
  });
}

export function iniciarConfiguracion() {
  const identidad = document.querySelector<HTMLFormElement>('[data-form-identidad]');
  if (identidad) iniciarColor(identidad);
  const encabezado = document.querySelector<HTMLFormElement>('[data-form-encabezado]');
  if (encabezado) iniciarEditores(encabezado);
  document.querySelectorAll<HTMLElement>('[data-imagen-marca]').forEach(iniciarImagen);
}
