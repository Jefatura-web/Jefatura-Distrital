-- ================================
-- BASE DE DATOS: JEFATURA QUILMES
-- ✅ Mejorada con índices, más campos y estado de publicación
-- ================================

CREATE DATABASE IF NOT EXISTS jefatura_db;
USE jefatura_db;

-- ================================
-- TABLA: categorias
-- ================================
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icono VARCHAR(50),
  color VARCHAR(7) DEFAULT '#0d2154',
  INDEX idx_nombre (nombre)
);

INSERT INTO categorias (nombre, descripcion, icono, color) VALUES
  ('Comunicado', 'Comunicados oficiales', '📢', '#0d2154'),
  ('Infraestructura', 'Obras y mejoras', '🏗️', '#1a3a7a'),
  ('Recursos Humanos', 'Personal y RH', '👥', '#4a90c4'),
  ('Pedagógico', 'Educación y pedagogía', '📚', '#7ab8de'),
  ('Institucional', 'Eventos e instituciones', '🏛️', '#c9a227'),
  ('Cultura', 'Actividades culturales', '🎭', '#e8be47')
ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion), icono=VALUES(icono);

-- ================================
-- TABLA: noticias (mejorada)
-- ================================
CREATE TABLE IF NOT EXISTS noticias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  slug VARCHAR(300) UNIQUE,
  descripcion VARCHAR(500),
  texto LONGTEXT NOT NULL,
  categoria_id INT,
  fecha DATE NOT NULL,
  imagen_url VARCHAR(500),
  destacada BOOLEAN DEFAULT FALSE,
  publicada BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  INDEX idx_fecha (fecha),
  INDEX idx_categoria (categoria_id),
  INDEX idx_destacada (destacada),
  INDEX idx_publicada (publicada),
  INDEX idx_created_at (created_at),
  FULLTEXT INDEX ft_titulo_texto (titulo, texto),
  FULLTEXT INDEX ft_descripcion (descripcion)
);

-- ================================
-- TABLA: auditoria (opcional)
-- ================================
CREATE TABLE IF NOT EXISTS auditoria_noticias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  noticia_id INT,
  accion VARCHAR(50),
  usuario VARCHAR(100),
  fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valores_anteriores JSON,
  valores_nuevos JSON,
  FOREIGN KEY (noticia_id) REFERENCES noticias(id) ON DELETE CASCADE,
  INDEX idx_noticia_id (noticia_id),
  INDEX idx_fecha_cambio (fecha_cambio)
);

-- ================================
-- EJEMPLO DE INSERT
-- Para cargar una noticia:
--
-- INSERT INTO noticias (titulo, slug, descripcion, texto, categoria_id, fecha, imagen_url, destacada, publicada)
-- VALUES (
--   'Título de la noticia',
--   'titulo-de-la-noticia',
--   'Descripción corta para vista previa',
--   'Texto completo de la noticia...',
--   1,
--   '2026-04-30',
--   'proyecto_distrital.jpg',
--   FALSE,
--   TRUE
-- );
--
-- Categorías disponibles:
--   1 = Comunicado
--   2 = Infraestructura
--   3 = Recursos Humanos
--   4 = Pedagógico
--   5 = Institucional
--   6 = Cultura
-- ================================