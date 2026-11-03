CREATE TABLE `cambios_usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`actor_nombre` text NOT NULL,
	`usuario_id` integer,
	`usuario_nombre` text NOT NULL,
	`usuario_email` text NOT NULL,
	`accion` text NOT NULL,
	`detalle` text,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `debe_cambiar_clave` integer DEFAULT false NOT NULL;