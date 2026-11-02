/**
 * Textos institucionales del micrositio. Los montos de las modalidades se actualizan
 * por decreto; cambiar acá cuando Compras informe los nuevos valores.
 */
import type { Tipo } from './db/schema';

export const QUE_ES =
  'La licitación es el proceso administrativo por el cual el Municipio de Lobos adquiere bienes y contrata servicios, seleccionando entre las propuestas de los proveedores la más conveniente según precio, plazos y calidad.';

export const VIGENCIA_MONTOS = 'enero de 2026';

export const MODALIDADES: Record<Tipo, string> = {
  publica:
    'Se publica formalmente en el Boletín Oficial de la Provincia y en medios locales para garantizar la difusión masiva. Corresponde cuando la compra supera $121.071.387.',
  privada:
    'No requiere publicación oficial del llamado: se invita a proveedores. Corresponde cuando la compra es menor a $121.071.387 y mayor a $40.357.372.',
  concurso:
    'Para contrataciones de menor monto: se solicitan presupuestos a un grupo de proveedores invitados.',
};
