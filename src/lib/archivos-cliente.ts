/** Utilidades de archivos que no dependen de Node (se pueden usar en componentes y en el navegador). */
export function etiquetaFormato(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return mime.split('/')[1]!.toUpperCase().replace('JPEG', 'JPG');
  if (/wordprocessing|msword|opendocument\.text/.test(mime)) return 'Documento';
  if (/sheet|excel/.test(mime)) return 'Planilla';
  if (mime === 'application/zip') return 'ZIP';
  return 'Archivo';
}

export const TAMANO_MAXIMO_CLIENTE = 25 * 1024 * 1024;
export const EXTENSIONES = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods', '.zip'];
export const ACCEPT_CLIENTE = EXTENSIONES.join(',');
