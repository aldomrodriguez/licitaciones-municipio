CREATE TABLE `invitados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedimiento_id` integer NOT NULL,
	`proveedor` text NOT NULL,
	`cuit` text,
	`compro_pliego` integer DEFAULT false NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`procedimiento_id`) REFERENCES `procedimientos`(`id`) ON UPDATE no action ON DELETE cascade
);
