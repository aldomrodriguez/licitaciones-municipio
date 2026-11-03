/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    usuario: import('./lib/auth').UsuarioSesion | null;
    /** Configuración del sitio (marca, header, footer, textos), leída en cada pedido. */
    sitio: import('./lib/configuracion').ConfigSitio;
  }
}
