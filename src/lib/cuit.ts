/** CUIT/CUIL: formato XX-XXXXXXXX-X y dígito verificador (módulo 11, algoritmo de AFIP). */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Formatea mientras se escribe: "3012345" → "30-12345", "30123456781" → "30-12345678-1". */
export function formatearCuit(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** null si es válido; si no, el motivo para mostrar. */
export function errorCuit(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  if (d.length !== 11) return 'El CUIT tiene que tener 11 dígitos (XX-XXXXXXXX-X).';
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto;
  if (resto === 10 || verificador !== Number(d[10])) {
    return 'El CUIT no es válido: el dígito verificador no coincide. Revisá que esté bien escrito.';
  }
  return null;
}
