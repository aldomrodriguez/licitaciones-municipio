import type { Procedimiento } from './db/schema';

export function urlPublica(p: Pick<Procedimiento, 'tipo' | 'anio' | 'numero'>): string {
  return `/${p.tipo}/${p.anio}/${p.numero}`;
}

export function urlPanel(p: Pick<Procedimiento, 'id'>): string {
  return `/panel/procedimientos/${p.id}`;
}

export function urlDescargaPublica(documentoId: number): string {
  return `/documentos/${documentoId}`;
}

export function urlDocumentoPanel(documentoId: number, inline = false): string {
  return `/panel/api/documentos/${documentoId}${inline ? '?ver=1' : ''}`;
}
