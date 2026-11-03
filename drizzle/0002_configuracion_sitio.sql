CREATE TABLE `cambios_configuracion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`usuario_nombre` text NOT NULL,
	`seccion` text NOT NULL,
	`cambios` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `configuracion` (
	`id` integer PRIMARY KEY NOT NULL,
	`datos` text NOT NULL,
	`actualizado_en` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`actualizado_por` text
);
