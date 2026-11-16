/**
 * Configuración del sitio: identidad del organismo, header, footer y textos.
 * Se edita desde /panel/configuracion (solo admin) y se guarda en una fila de SQLite.
 * Sin fila guardada, el sitio usa los valores genéricos de abajo.
 */
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import type { Db } from './db';
import { cambiosConfiguracion, configuracion } from './db/schema';
import { derivarColores, esHex, problemaDeContraste } from './color';

const PROTOCOLOS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

/** Solo links web, mail o teléfono: un `javascript:` en el header sería un XSS en todo el sitio. */
export function esHrefSeguro(href: string): boolean {
  try {
    const url = new URL(href);
    if (!PROTOCOLOS.has(url.protocol)) return false;
    if (url.protocol.startsWith('http')) return url.hostname.includes('.') || url.hostname === 'localhost';
    return url.pathname.length > 0;
  } catch {
    return false;
  }
}

const href = z
  .string()
  .trim()
  .max(500, 'El link es demasiado largo.')
  .refine(esHrefSeguro, 'Cada link tiene que empezar con https://, http://, mailto: o tel:.');

const enlace = z.object({
  texto: z.string().trim().min(1, 'Cada link necesita un texto.').max(60, 'El texto de un link no puede pasar de 60 caracteres.'),
  href,
});
export type Enlace = z.infer<typeof enlace>;

const imagen = z.object({
  archivo: z.string().regex(/^[\w-]+\.(png|jpg|webp)$/),
  ancho: z.number().int().positive(),
  alto: z.number().int().positive(),
});
export type ImagenMarca = z.infer<typeof imagen>;

const colorHex = z.string().refine(esHex, 'Color inválido.');

const COLOR_GENERICO = '#2b5d8a';

export const TEXTOS_GENERICOS = {
  queEs:
    'La licitación es el proceso administrativo por el cual el Municipio adquiere bienes y contrata servicios, seleccionando entre las propuestas de los proveedores la más conveniente según precio, plazos y calidad.',
  modalidades: {
    publica:
      'Se publica formalmente en el Boletín Oficial y en medios locales para garantizar la difusión. Corresponde para las compras de mayor monto, según la normativa vigente.',
    privada: 'No requiere publicación oficial del llamado: se invita a proveedores. Corresponde para compras de monto intermedio.',
    concurso: 'Para contrataciones de menor monto: se solicitan presupuestos a un grupo de proveedores invitados.',
  },
};

const columna = z.object({
  titulo: z.string().trim().min(1, 'Cada columna del footer necesita un título.').max(40),
  textos: z.array(z.string().trim().min(1).max(120)).max(6),
  links: z.array(enlace).max(10, 'Una columna admite hasta 10 links.'),
});
export type ColumnaFooter = z.infer<typeof columna>;

export const esquemaConfiguracion = z.object({
  nombre: z.string().trim().min(3, 'Indicá el nombre del organismo.').max(80).default('Municipio'),
  direccion: z.string().trim().max(120).default(''),
  sitioUrl: z.union([z.literal(''), href]).default(''),
  textoVolver: z.string().trim().min(1).max(60).default('Volver al sitio del Municipio'),
  colores: z
    .object({ marca: colorHex, oscuro: colorHex, claro: colorHex, sobreOscuro: colorHex, sobreMarca: colorHex })
    .default(derivarColores(COLOR_GENERICO)),
  logo: imagen.nullable().default(null),
  favicon: imagen.nullable().default(null),
  migas: z.array(enlace).max(4, 'Hasta 4 niveles en la ruta de navegación.').default([]),
  nav: z.array(enlace).max(8, 'El menú admite hasta 8 links.').default([]),
  destacado: enlace.nullable().default(null),
  lema: z.string().trim().max(200).default(''),
  columnas: z.array(columna).max(3, 'El footer admite hasta 3 columnas.').default([]),
  queEs: z.string().trim().min(20, 'Escribí al menos una oración.').max(800).default(TEXTOS_GENERICOS.queEs),
  modalidades: z
    .object({
      publica: z.string().trim().min(10).max(600),
      privada: z.string().trim().min(10).max(600),
      concurso: z.string().trim().min(10).max(600),
    })
    .default(TEXTOS_GENERICOS.modalidades),
  vigenciaMontos: z.string().trim().max(40).default(''),
});
export type ConfigSitio = z.infer<typeof esquemaConfiguracion>;

export const CONFIG_GENERICA: ConfigSitio = esquemaConfiguracion.parse({});

/** Secciones que se guardan por separado desde el panel, con su nombre para el registro. */
export const SECCIONES = {
  identidad: { nombre: 'Identidad', campos: ['nombre', 'colores', 'logo', 'favicon'] },
  encabezado: { nombre: 'Header y footer', campos: ['direccion', 'sitioUrl', 'textoVolver', 'migas', 'nav', 'destacado', 'lema', 'columnas'] },
  textos: { nombre: 'Textos del sitio', campos: ['queEs', 'modalidades', 'vigenciaMontos'] },
} as const satisfies Record<string, { nombre: string; campos: readonly (keyof ConfigSitio)[] }>;
export type Seccion = keyof typeof SECCIONES;

const ETIQUETAS: Record<keyof ConfigSitio, string> = {
  nombre: 'Nombre del organismo',
  direccion: 'Dirección (barra superior)',
  sitioUrl: 'Sitio principal',
  textoVolver: 'Texto del link al sitio principal',
  colores: 'Color principal',
  logo: 'Logo',
  favicon: 'Ícono de la pestaña',
  migas: 'Ruta de navegación',
  nav: 'Menú del header',
  destacado: 'Botón destacado',
  lema: 'Lema del footer',
  columnas: 'Columnas del footer',
  queEs: '¿Qué es una licitación?',
  modalidades: 'Descripción de las modalidades',
  vigenciaMontos: 'Vigencia de los montos',
};

// ─── Lectura y escritura ──────────────────────────────────────────────────────

/** Configuración vigente. Ante datos inválidos (editados a mano) cae en los genéricos campo por campo. */
export function leerConfiguracion(db: Db): ConfigSitio {
  const fila = db.select().from(configuracion).where(eq(configuracion.id, 1)).get();
  if (!fila) return CONFIG_GENERICA;
  let crudo: Record<string, unknown>;
  try {
    crudo = JSON.parse(fila.datos);
  } catch {
    return CONFIG_GENERICA;
  }
  const r = esquemaConfiguracion.safeParse(crudo);
  if (r.success) return r.data;
  const sano = Object.fromEntries(
    Object.entries(crudo).filter(([k, v]) => {
      const campo = esquemaConfiguracion.shape[k as keyof ConfigSitio];
      return campo?.safeParse(v).success;
    }),
  );
  return esquemaConfiguracion.parse(sano);
}

/** Si nunca se guardó la configuración (instalación nueva). */
export function estaConfigurado(db: Db): boolean {
  return Boolean(db.select({ id: configuracion.id }).from(configuracion).where(eq(configuracion.id, 1)).get());
}

function resumen(campo: keyof ConfigSitio, v: ConfigSitio[keyof ConfigSitio]): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  if (campo === 'colores') return (v as ConfigSitio['colores']).marca;
  if (campo === 'logo' || campo === 'favicon') {
    const i = v as ImagenMarca;
    return `Imagen de ${i.ancho} × ${i.alto} px`;
  }
  if (campo === 'modalidades') {
    const m = v as ConfigSitio['modalidades'];
    return `Pública: ${m.publica} / Privada: ${m.privada} / Concurso: ${m.concurso}`;
  }
  const l = v as Enlace;
  return `${l.texto} (${l.href})`;
}

export interface CambioCampo {
  campo: string;
  antes: string;
  despues: string;
}

function itemsLista(campo: keyof ConfigSitio, v: ConfigSitio[keyof ConfigSitio]): string[] {
  if (campo === 'columnas') {
    return (v as ColumnaFooter[]).map((c) => `${c.titulo}: ${[...c.textos, ...c.links.map((l) => `${l.texto} (${l.href})`)].join(', ') || 'vacía'}`);
  }
  return (v as Enlace[]).map((l) => `${l.texto} (${l.href})`);
}

const LISTAS: readonly (keyof ConfigSitio)[] = ['migas', 'nav', 'columnas'];

export function diferencias(antes: ConfigSitio, despues: ConfigSitio, campos: readonly (keyof ConfigSitio)[]): CambioCampo[] {
  return campos
    .filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(despues[c]))
    .map((c) => {
      if (!LISTAS.includes(c)) return { campo: ETIQUETAS[c], antes: resumen(c, antes[c]), despues: resumen(c, despues[c]) };
      // En las listas se registra lo que se quitó y lo que se agregó, o el nuevo orden.
      const a = itemsLista(c, antes[c]);
      const d = itemsLista(c, despues[c]);
      const quitados = a.filter((i) => !d.includes(i));
      const agregados = d.filter((i) => !a.includes(i));
      if (!quitados.length && !agregados.length) return { campo: `${ETIQUETAS[c]}: nuevo orden`, antes: a.join(' / '), despues: d.join(' / ') };
      return { campo: ETIQUETAS[c], antes: quitados.join(' / ') || '—', despues: agregados.join(' / ') || '—' };
    });
}

export class ErrorConfiguracion extends Error {}

/**
 * Guarda los campos de una sección. Valida todo con el esquema (links, largos, contraste)
 * y registra el cambio. Devuelve lo que cambió (vacío si no hubo cambios).
 */
export function guardarSeccion(db: Db, usuarioNombre: string, seccion: Seccion, parcial: Partial<ConfigSitio>): CambioCampo[] {
  const campos = SECCIONES[seccion].campos as readonly (keyof ConfigSitio)[];
  const ajenos = Object.keys(parcial).filter((k) => !campos.includes(k as keyof ConfigSitio));
  if (ajenos.length) throw new ErrorConfiguracion(`Campos fuera de la sección: ${ajenos.join(', ')}.`);
  if (parcial.colores) {
    const problema = problemaDeContraste(parcial.colores.marca);
    if (problema) throw new ErrorConfiguracion(problema);
  }

  const actual = leerConfiguracion(db);
  const r = esquemaConfiguracion.safeParse({ ...actual, ...parcial });
  if (!r.success) throw new ErrorConfiguracion([...new Set(r.error.issues.map((i) => i.message))].join('\n'));
  const nueva = r.data;
  const lista = diferencias(actual, nueva, campos);
  const primeraVez = !estaConfigurado(db);
  if (lista.length === 0 && !primeraVez) return [];

  db.transaction((tx) => {
    const datos = JSON.stringify(nueva);
    tx.insert(configuracion)
      .values({ id: 1, datos, actualizadoPor: usuarioNombre })
      .onConflictDoUpdate({ target: configuracion.id, set: { datos, actualizadoPor: usuarioNombre, actualizadoEn: new Date() } })
      .run();
    tx.insert(cambiosConfiguracion)
      .values({ usuarioNombre, seccion: SECCIONES[seccion].nombre, cambios: JSON.stringify(lista) })
      .run();
  });
  return lista;
}

export function cambiosRecientes(db: Db, limite = 30) {
  return db
    .select()
    .from(cambiosConfiguracion)
    .orderBy(desc(cambiosConfiguracion.id))
    .limit(limite)
    .all()
    .map((c) => ({ ...c, lista: JSON.parse(c.cambios) as CambioCampo[] }));
}

// ─── Derivados para las plantillas ───────────────────────────────────────────

/** Letra grande decorativa de la portada: la inicial de la última palabra del nombre («Municipio de Ejemplo» → E). */
export function letraDecorativa(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/);
  return (palabras.at(-1)?.[0] ?? 'M').toUpperCase();
}

/** URL pública de una imagen de marca (nombre único por subida: no queda en caché la vieja). */
export function urlImagen(i: ImagenMarca): string {
  return `/marca/${i.archivo}`;
}

/** Alto proporcional para los atributos width/height (evita saltos de layout). */
export function altoPara(i: ImagenMarca, ancho: number): number {
  return Math.round((ancho * i.alto) / i.ancho);
}
