/**
 * Formato de importación: un JSON con los procedimientos que ya existían antes del sistema
 * (la página anterior, una planilla, etc.). Cada municipio arma su propio conversor a este formato.
 * Ver ejemplos/importacion.json.
 *
 * Es puro: no toca la base ni la red, para poder testearlo.
 */
import { z } from 'zod';
import { CATEGORIAS } from '../../src/lib/categorias';
import { ESTADOS, ESTADOS_POR_TIPO, LISTA_TIPOS, TIPOS } from '../../src/lib/estados';
import { desdeFechaInput } from '../../src/lib/formato';
import type { Tipo } from '../../src/lib/db/schema';

const centavos = z.number().int('Los montos van en centavos enteros.').nonnegative().nullable().default(null);
const cantidad = z.number().int().nonnegative().nullable().default(null);
const texto = z.string().trim().min(1).nullable().default(null);

const esquemaProcedimiento = z
  .object({
    tipo: z.enum(LISTA_TIPOS as [Tipo, ...Tipo[]]),
    numero: z.number().int().positive(),
    anio: z.number().int().min(1990).max(2100),
    objeto: z.string().trim().min(1, 'Falta el objeto.'),
    estado: z.enum(Object.keys(ESTADOS) as [keyof typeof ESTADOS, ...(keyof typeof ESTADOS)[]]),
    motivoEstado: texto,
    presupuestoOficial: centavos,
    valorPliego: centavos,
    /** Solo el día: AAAA-MM-DD. */
    fechaApertura: z
      .string()
      .nullable()
      .default(null)
      .transform((v, ctx) => {
        if (v == null) return null;
        const d = desdeFechaInput(v);
        if (!d) ctx.addIssue({ code: 'custom', message: `Fecha inválida «${v}»: tiene que ser AAAA-MM-DD.` });
        return d;
      }),
    invitados: cantidad,
    cantidadOfertantes: cantidad,
    observacionesPublicas: texto,
    adjudicaciones: z.array(z.object({ proveedor: z.string().trim().min(1), monto: centavos })).default([]),
    documentos: z
      .array(z.object({ url: z.url({ protocol: /^https?$/ }), titulo: z.string().trim().min(1), categoria: z.enum(CATEGORIAS) }))
      .default([]),
    /** Observaciones del conversor para revisar con Compras. Van al reporte, no a la base. */
    advertencias: z.array(z.string()).default([]),
  })
  .superRefine((p, ctx) => {
    if (!ESTADOS_POR_TIPO[p.tipo].includes(p.estado)) {
      ctx.addIssue({ code: 'custom', path: ['estado'], message: `Una ${TIPOS[p.tipo].nombre} no pasa por «${ESTADOS[p.estado].nombre}».` });
    }
  });

const esquemaArchivo = z.object({ procedimientos: z.array(z.unknown()) });

export type Importado = z.output<typeof esquemaProcedimiento> & { clave: string };

export interface Lectura {
  items: Importado[];
  /** Registros rechazados, con el motivo. */
  errores: string[];
}

/** Valida cada registro por separado: uno mal formado no frena al resto. */
export function leerImportacion(json: string): Lectura {
  const archivo = esquemaArchivo.safeParse(JSON.parse(json));
  if (!archivo.success) return { items: [], errores: ['El archivo tiene que ser un objeto con la lista «procedimientos».'] };
  const items: Importado[] = [];
  const errores: string[] = [];
  archivo.data.procedimientos.forEach((crudo, i) => {
    const r = esquemaProcedimiento.safeParse(crudo);
    if (r.success) {
      items.push({ ...r.data, clave: `${r.data.tipo}-${r.data.numero}-${r.data.anio}` });
    } else {
      const detalle = r.error.issues.map((e) => `${e.path.join('.') || 'registro'}: ${e.message}`).join('; ');
      errores.push(`Registro ${i + 1}: ${detalle}`);
    }
  });
  return { items, errores };
}

/** Detecta duplicados de clave y registros sospechosamente iguales (mismo adjudicatario y monto). */
export function revisarConjunto(items: Importado[]): string[] {
  const avisos: string[] = [];
  const claves = new Map<string, number>();
  for (const it of items) claves.set(it.clave, (claves.get(it.clave) ?? 0) + 1);
  for (const [k, n] of claves) if (n > 1) avisos.push(`${k} aparece ${n} veces: se importa solo la primera.`);

  const firmas = new Map<string, string[]>();
  for (const it of items) {
    if (it.adjudicaciones.length === 0) continue;
    const f = `${it.anio}|${it.adjudicaciones.map((a) => `${a.proveedor}:${a.monto}`).join(',')}`;
    firmas.set(f, [...(firmas.get(f) ?? []), it.clave]);
  }
  for (const [, ks] of firmas) if (ks.length > 1) avisos.push(`Mismo adjudicatario y monto en ${ks.join(' y ')}: posible copia mal editada.`);
  return avisos;
}
