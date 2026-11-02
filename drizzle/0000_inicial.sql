CREATE TABLE `adjudicaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedimiento_id` integer NOT NULL,
	`proveedor` text NOT NULL,
	`cuit` text,
	`monto` integer,
	`orden` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`procedimiento_id`) REFERENCES `procedimientos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedimiento_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`categoria` text NOT NULL,
	`archivo` text NOT NULL,
	`nombre_original` text NOT NULL,
	`mime` text NOT NULL,
	`tamano` integer NOT NULL,
	`publico` integer DEFAULT true NOT NULL,
	`subido_por` integer,
	`subido_en` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`eliminado_en` integer,
	FOREIGN KEY (`procedimiento_id`) REFERENCES `procedimientos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historial` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedimiento_id` integer NOT NULL,
	`usuario_id` integer,
	`usuario_nombre` text NOT NULL,
	`fecha` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`accion` text NOT NULL,
	`campo` text,
	`valor_anterior` text,
	`valor_nuevo` text,
	`motivo` text,
	`publico` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`procedimiento_id`) REFERENCES `procedimientos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `historial_procedimiento` ON `historial` (`procedimiento_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `procedimientos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`numero` integer NOT NULL,
	`anio` integer NOT NULL,
	`objeto` text NOT NULL,
	`area_solicitante` text,
	`presupuesto_oficial` integer,
	`valor_pliego` integer,
	`fecha_apertura` integer,
	`lugar_apertura` text,
	`invitados` integer,
	`cantidad_ofertantes` integer,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`motivo_estado` text,
	`observaciones_publicas` text,
	`creado_en` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`actualizado_en` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`eliminado_en` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procedimientos_tipo_numero_anio` ON `procedimientos` (`tipo`,`numero`,`anio`);--> statement-breakpoint
CREATE INDEX `procedimientos_anio` ON `procedimientos` (`anio`);--> statement-breakpoint
CREATE TABLE `sesiones` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` integer NOT NULL,
	`expira_en` integer NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`email` text NOT NULL,
	`hash` text NOT NULL,
	`rol` text DEFAULT 'compras' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_email_unique` ON `usuarios` (`email`);