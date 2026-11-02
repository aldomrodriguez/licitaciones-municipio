/** Tipos de documento. Ordenados según el momento del procedimiento en que suelen aparecer. */
export const CATEGORIAS = [
  'Pliego de bases y condiciones',
  'Circular / aclaración',
  'Prórroga',
  'Acta de apertura',
  'Dictamen / preadjudicación',
  'Decreto de adjudicación',
  'Orden de compra / contrato',
  'Ampliación',
  'Expediente',
  'Imagen',
  'Otro',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export function esCategoria(v: string): v is Categoria {
  return (CATEGORIAS as readonly string[]).includes(v);
}
