
INSERT INTO players (
  first_name, 
  last_name, 
  dni, 
  gender, 
  preferred_side, 
  preferred_hand, 
  phone, 
  score, 
  es_prueba
) VALUES
-- Jugadores 1-21
('Carlos', 'García', '99001001', 'MALE', 'DRIVE', 'Derecha', '01112345001', 750, true),
('Ana', 'López', '99001002', 'MALE', 'REVES', 'Izquierda', '01112345002', 680, true),
('Miguel', 'Rodríguez', '99001003', 'MALE', 'DRIVE', 'Derecha', '01112345003', 820, true),
('Sofía', 'Martínez', '99001004', 'MALE', 'REVES', 'Derecha', '01112345004', 590, true),
('Diego', 'González', '99001005', 'MALE', 'DRIVE', 'Izquierda', '01112345005', 710, true),
('Lucía', 'Pérez', '99001006', 'MALE', 'REVES', 'Derecha', '01112345006', 640, true),
('Javier', 'Sánchez', '99001007', 'MALE', 'DRIVE', 'Derecha', '01112345007', 780, true),
('Valentina', 'Ramírez', '99001008', 'MALE', 'REVES', 'Izquierda', '01112345008', 560, true),
('Alejandro', 'Cruz', '99001009', 'MALE', 'DRIVE', 'Derecha', '01112345009', 850, true),
('Camila', 'Flores', '99001010', 'MALE', 'REVES', 'Derecha', '01112345010', 620, true),
('Sebastián', 'Gómez', '99001011', 'MALE', 'DRIVE', 'Izquierda', '01112345011', 730, true),
('Isabella', 'Morales', '99001012', 'MALE', 'REVES', 'Derecha', '01112345012', 580, true),
('Fernando', 'Vázquez', '99001013', 'MALE', 'DRIVE', 'Derecha', '01112345013', 790, true),
('Martina', 'Jiménez', '99001014', 'MALE', 'REVES', 'Izquierda', '01112345014', 660, true),
('Pablo', 'Hernández', '99001015', 'MALE', 'DRIVE', 'Derecha', '01112345015', 740, true),
('Antonella', 'Ruiz', '99001016', 'MALE', 'REVES', 'Derecha', '01112345016', 600, true),
('Nicolás', 'Díaz', '99001017', 'MALE', 'DRIVE', 'Izquierda', '01112345017', 810, true),
('Julieta', 'Moreno', '99001018', 'MALE', 'REVES', 'Derecha', '01112345018', 570, true),
('Gabriel', 'Muñoz', '99001019', 'MALE', 'DRIVE', 'Derecha', '01112345019', 760, true),
('Florencia', 'Álvarez', '99001020', 'MALE', 'REVES', 'Izquierda', '01112345020', 630, true),
('Matías', 'Romero', '99001021', 'MALE', 'DRIVE', 'Derecha', '01112345021', 700, true),

-- Jugadores 22-42
('Agustina', 'Gutiérrez', '99001022', 'MALE', 'REVES', 'Derecha', '01112345022', 650, true),
('Lucas', 'Navarro', '99001023', 'MALE', 'DRIVE', 'Izquierda', '01112345023', 800, true),
('Victoria', 'Torres', '99001024', 'MALE', 'REVES', 'Derecha', '01112345024', 590, true),
('Manuel', 'Domínguez', '99001025', 'MALE', 'DRIVE', 'Derecha', '01112345025', 720, true),
('Catalina', 'Ramos', '99001026', 'MALE', 'REVES', 'Izquierda', '01112345026', 610, true),
('Ignacio', 'Gil', '99001027', 'MALE', 'DRIVE', 'Derecha', '01112345027', 770, true),
('Renata', 'Serrano', '99001028', 'MALE', 'REVES', 'Derecha', '01112345028', 580, true),
('Federico', 'Blanco', '99001029', 'MALE', 'DRIVE', 'Izquierda', '01112345029', 830, true),
('Esperanza', 'Molina', '99001030', 'MALE', 'REVES', 'Derecha', '01112345030', 640, true),
('Joaquín', 'Castro', '99001031', 'MALE', 'DRIVE', 'Derecha', '01112345031', 710, true),
('Constanza', 'Ortega', '99001032', 'MALE', 'REVES', 'Izquierda', '01112345032', 590, true),
('Tomás', 'Delgado', '99001033', 'MALE', 'DRIVE', 'Derecha', '01112345033', 780, true),
('Milagros', 'Ortiz', '99001034', 'MALE', 'REVES', 'Derecha', '01112345034', 620, true),
('Bruno', 'Marín', '99001035', 'MALE', 'DRIVE', 'Izquierda', '01112345035', 750, true),
('Delfina', 'Vargas', '99001036', 'MALE', 'REVES', 'Derecha', '01112345036', 570, true),
('Santiago', 'Herrera', '99001037', 'MALE', 'DRIVE', 'Derecha', '01112345037', 820, true),
('Clara', 'Guerrero', '99001038', 'MALE', 'REVES', 'Izquierda', '01112345038', 660, true),
('Marcos', 'Medina', '99001039', 'MALE', 'DRIVE', 'Derecha', '01112345039', 730, true),
('Elena', 'Castillo', '99001040', 'MALE', 'REVES', 'Derecha', '01112345040', 600, true),
('Facundo', 'Rojas', '99001041', 'MALE', 'DRIVE', 'Izquierda', '01112345041', 790, true),
('Emilia', 'Santos', '99001042', 'MALE', 'REVES', 'Derecha', '01112345042', 610, true);

-- Verificar que se crearon correctamente
SELECT 
  COUNT(*) as total_jugadores_prueba,
  AVG(score) as score_promedio
FROM players 
WHERE es_prueba = true; 