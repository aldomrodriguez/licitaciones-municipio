/**
 * Cola de subida de documentos: se eligen varios archivos, se completa título, tipo y
 * visibilidad de cada uno, se confirma la lista y se suben de a uno mostrando el progreso.
 */
import { avisarDespues, confirmar } from './confirmar';
import { EXTENSIONES, TAMANO_MAXIMO_CLIENTE } from '../lib/archivos-cliente';
import { formatearTamano } from '../lib/formato';
import { mejorarControles } from './controles';

interface Item {
  file: File;
  li: HTMLLIElement;
  titulo: HTMLInputElement;
  categoria: HTMLSelectElement;
  publico: HTMLInputElement;
}

function tituloSugerido(nombre: string): string {
  const base = nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function categoriaSugerida(nombre: string): string | null {
  const n = nombre.toLowerCase();
  if (n.includes('pliego')) return 'Pliego de bases y condiciones';
  if (n.includes('circular') || n.includes('aclarat')) return 'Circular / aclaración';
  if (n.includes('prorroga') || n.includes('prórroga')) return 'Prórroga';
  if (n.includes('acta')) return 'Acta de apertura';
  if (n.includes('decreto')) return 'Decreto de adjudicación';
  if (n.includes('ampliac')) return 'Ampliación';
  if (n.includes('orden') || /\boc\b/.test(n)) return 'Orden de compra / contrato';
  if (/\.(jpe?g|png|webp)$/.test(n)) return 'Imagen';
  return null;
}

function errorDeArchivo(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
  if (!EXTENSIONES.includes(ext)) return 'Formato no admitido.';
  if (f.size === 0) return 'El archivo está vacío.';
  if (f.size > TAMANO_MAXIMO_CLIENTE) return `Supera los ${TAMANO_MAXIMO_CLIENTE / 1024 / 1024} MB.`;
  return null;
}

function subirUno(procedimientoId: string, it: Item, alProgreso: (fraccion: number) => void): Promise<string | null> {
  const datos = new FormData();
  datos.set('procedimientoId', procedimientoId);
  datos.set('titulo', it.titulo.value.trim());
  datos.set('categoria', it.categoria.value);
  datos.set('publico', it.publico.checked ? 'si' : 'no');
  datos.set('archivo', it.file);
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/panel/api/documentos');
    xhr.upload.addEventListener('progress', (e) => e.lengthComputable && alProgreso(e.loaded / e.total));
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver(null);
      resolver(xhr.responseText || `Error ${xhr.status}`);
    });
    xhr.addEventListener('error', () => resolver('Se cortó la conexión.'));
    xhr.send(datos);
  });
}

export function iniciarSubida() {
  for (const raiz of document.querySelectorAll<HTMLElement>('[data-subida]')) {
    const input = raiz.querySelector<HTMLInputElement>('[data-input]')!;
    const zona = raiz.querySelector<HTMLElement>('[data-zona]')!;
    const cola = raiz.querySelector<HTMLElement>('[data-cola]')!;
    const lista = raiz.querySelector<HTMLUListElement>('[data-lista]')!;
    const plantilla = raiz.querySelector<HTMLTemplateElement>('template[data-fila]')!;
    const botonSubir = raiz.querySelector<HTMLButtonElement>('[data-subir]')!;
    const procedimientoId = raiz.dataset.procedimiento!;
    const publicado = raiz.dataset.publicado === 'si';
    let items: Item[] = [];

    const refrescar = () => {
      cola.hidden = items.length === 0;
      const validos = items.filter((i) => !errorDeArchivo(i.file)).length;
      botonSubir.textContent = validos === 1 ? 'Subir 1 documento' : `Subir ${validos} documentos`;
      botonSubir.disabled = validos === 0;
    };

    const agregar = (files: FileList | File[]) => {
      for (const file of files) {
        const frag = plantilla.content.cloneNode(true) as DocumentFragment;
        const li = frag.querySelector('li')!;
        const it: Item = {
          file,
          li,
          titulo: li.querySelector('[data-titulo]')!,
          categoria: li.querySelector('[data-categoria]')!,
          publico: li.querySelector('[data-publico]')!,
        };
        li.querySelector('[data-nombre]')!.textContent = file.name;
        li.querySelector('[data-tamano]')!.textContent = formatearTamano(file.size);
        it.titulo.value = tituloSugerido(file.name);
        // Solo se sugiere si esa categoría está permitida en la etapa actual.
        const sugerida = categoriaSugerida(file.name);
        const permitidas = [...it.categoria.options].map((o) => o.value);
        it.categoria.value = sugerida && permitidas.includes(sugerida) ? sugerida : 'Otro';
        const error = errorDeArchivo(file);
        if (error) {
          const p = li.querySelector<HTMLElement>('[data-error]')!;
          p.textContent = `${error} No se va a subir.`;
          p.hidden = false;
          li.querySelectorAll('input, select').forEach((el) => el.setAttribute('disabled', ''));
        }
        li.querySelector('[data-quitar]')!.addEventListener('click', () => {
          items = items.filter((x) => x !== it);
          li.remove();
          refrescar();
        });
        lista.append(li);
        mejorarControles(li);
        items.push(it);
      }
      input.value = '';
      refrescar();
      items.at(-1)?.titulo.focus();
    };

    input.addEventListener('change', () => input.files && agregar(input.files));
    zona.addEventListener('dragover', (e) => {
      e.preventDefault();
      zona.setAttribute('data-arrastrando', '');
    });
    zona.addEventListener('dragleave', () => zona.removeAttribute('data-arrastrando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.removeAttribute('data-arrastrando');
      if (e.dataTransfer?.files) agregar(e.dataTransfer.files);
    });

    raiz.querySelector('[data-vaciar]')!.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: '¿Descartar los archivos elegidos?',
        detalle: 'No se subió ninguno todavía. Se quitan de la lista.',
        boton: 'Descartar',
      });
      if (!ok) return;
      items = [];
      lista.replaceChildren();
      refrescar();
    });

    botonSubir.addEventListener('click', async () => {
      const aSubir = items.filter((i) => !errorDeArchivo(i.file));
      const sinTitulo = aSubir.find((i) => i.titulo.value.trim().length === 0);
      if (sinTitulo) {
        sinTitulo.titulo.reportValidity();
        return;
      }
      const publicos = aSubir.filter((i) => i.publico.checked).length;
      let subidos = 0;
      const subidosOk = new Set<(typeof aSubir)[number]>();
      const ok = await confirmar({
        titulo: aSubir.length === 1 ? '¿Subir este documento?' : `¿Subir estos ${aSubir.length} documentos?`,
        detalle: [
          `${aSubir.length === 1 ? 'Se agrega' : 'Se agregan'} a ${raiz.dataset.nombre}.`,
          publicos === 0
            ? (aSubir.length === 1 ? 'Queda como interno: no se ve en el sitio.' : 'Todos quedan como internos: no se ven en el sitio.')
            : publicado
              ? `${publicos === aSubir.length ? (aSubir.length === 1 ? 'Se publica' : 'Todos se publican') : `${publicos} se publican`} en el sitio en cuanto se suban.`
              : 'Los marcados como públicos se van a ver cuando el procedimiento se publique.',
        ],
        lista: aSubir.map((i) => ({
          etiqueta: i.titulo.value.trim(),
          despues: `${i.categoria.value}, ${formatearTamano(i.file.size)}, ${i.publico.checked ? 'público' : 'interno'}`,
        })),
        boton: 'Subir',
        ejecutar: async () => {
          const ok = document.getElementById('dlg-ok')!;
          // Un archivo que falla no frena al resto; el reintento repite solo los que fallaron.
          const fallas: string[] = [];
          for (const [n, it] of aSubir.entries()) {
            if (subidosOk.has(it)) continue;
            const error = await subirUno(procedimientoId, it, (f) => {
              ok.textContent = `Subiendo ${n + 1} de ${aSubir.length} (${Math.round(f * 100)}%)`;
            });
            if (error) fallas.push(`«${it.titulo.value.trim()}»: ${error}`);
            else subidosOk.add(it);
          }
          subidos = subidosOk.size;
          if (fallas.length === 0) return null;
          const hechos = subidos > 0 ? `Se ${subidos === 1 ? 'subió 1' : `subieron ${subidos}`}. ` : '';
          return `${hechos}No se ${fallas.length === 1 ? 'pudo subir' : 'pudieron subir'} ${fallas.join(' · ')} Cancelá para revisarlo o reintentá.`;
        },
      });
      if (ok) {
        avisarDespues(subidos === 1 ? 'Documento subido.' : `${subidos} documentos subidos.`);
        location.reload();
      } else if (subidos > 0) {
        const fallados = aSubir.filter((i) => !subidosOk.has(i)).map((i) => `«${i.titulo.value.trim()}»`);
        avisarDespues(`Se subieron ${subidos} de ${aSubir.length}. No se guardaron: ${fallados.join(', ')}.`);
        location.reload();
      }
    });
  }
}
