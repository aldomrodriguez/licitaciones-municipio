/**
 * Límite de intentos fallidos de login, en memoria (la app corre en una sola instancia).
 *
 * - Por IP + email: 5 fallos en 15 minutos bloquean esa combinación 15 minutos.
 * - Por IP: 30 fallos en 15 minutos bloquean la IP entera (alguien probando muchos emails).
 *
 * Nunca se bloquea por email solo: cualquiera podría dejar afuera al administrador.
 * Solo cuentan los fallos; un ingreso correcto limpia el contador de esa combinación.
 */

const VENTANA_MS = 15 * 60 * 1000;
const MAX_POR_CUENTA = 5;
const MAX_POR_IP = 30;
const MAX_CLAVES = 10_000;

interface Registro {
  fallos: number;
  desde: number;
  bloqueadoHasta: number;
}

export class LimiteIntentos {
  private registros = new Map<string, Registro>();

  constructor(private ahora: () => number = Date.now) {}

  private claves(ip: string, email: string): [string, string] {
    return [`cuenta:${ip}:${email.trim().toLowerCase()}`, `ip:${ip}`];
  }

  /** Milisegundos que faltan para poder volver a intentar; 0 si puede intentar ya. */
  espera(ip: string, email: string): number {
    const t = this.ahora();
    return Math.max(0, ...this.claves(ip, email).map((k) => (this.registros.get(k)?.bloqueadoHasta ?? 0) - t));
  }

  registrarFallo(ip: string, email: string) {
    const t = this.ahora();
    const [cuenta, porIp] = this.claves(ip, email);
    this.sumar(cuenta, MAX_POR_CUENTA, t);
    this.sumar(porIp, MAX_POR_IP, t);
    if (this.registros.size > MAX_CLAVES) this.limpiar(t);
  }

  registrarExito(ip: string, email: string) {
    this.registros.delete(this.claves(ip, email)[0]);
  }

  private sumar(clave: string, maximo: number, t: number) {
    let r = this.registros.get(clave);
    if (!r || t - r.desde > VENTANA_MS) r = { fallos: 0, desde: t, bloqueadoHasta: 0 };
    r.fallos += 1;
    if (r.fallos >= maximo) r.bloqueadoHasta = t + VENTANA_MS;
    this.registros.set(clave, r);
  }

  /** Descarta lo vencido para que el mapa no crezca sin límite. */
  private limpiar(t: number) {
    for (const [k, r] of this.registros) {
      if (t - r.desde > VENTANA_MS && r.bloqueadoHasta < t) this.registros.delete(k);
    }
  }
}

/** Instancia de la app. */
export const limiteLogin = new LimiteIntentos();

export function textoEspera(ms: number): string {
  const minutos = Math.max(1, Math.ceil(ms / 60_000));
  return `Demasiados intentos fallidos. Probá de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
}
