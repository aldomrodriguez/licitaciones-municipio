-- La fecha de apertura pasa a ser solo un día: se normaliza al mediodía en hora argentina (UTC-3)
-- del mismo día calendario. 10800000 = 3 h; 86400000 = 1 día; 54000000 = 15 h UTC = 12 h en hora argentina.
UPDATE `procedimientos`
SET `fecha_apertura` = ((`fecha_apertura` - 10800000) / 86400000) * 86400000 + 54000000
WHERE `fecha_apertura` IS NOT NULL;
