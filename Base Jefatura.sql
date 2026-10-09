-- ============================================================
-- BASE DE DATOS: JEFATURA QUILMES
-- Compatible con TiDB Serverless y MySQL 8+
-- NOTA TiDB: Ejecutar en el SQL Editor del dashboard de TiDB Cloud
-- o via mysql CLI con el connection string provisto por TiDB.
-- La base de datos se crea previamente desde el dashboard de TiDB Cloud.
-- ============================================================

CREATE DATABASE IF NOT EXISTS jefatura_db;
USE jefatura_db;

-- ============================================================
-- TABLA: categorias
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icono       VARCHAR(50),
  color       VARCHAR(7) DEFAULT '#0d2154',
  INDEX idx_nombre (nombre)
);

INSERT INTO categorias (nombre, descripcion, icono, color) VALUES
  ('Comunicado',      'Comunicados oficiales',      '📢', '#0d2154'),
  ('Infraestructura', 'Obras y mejoras',             '🏗️', '#1a3a7a'),
  ('Recursos Humanos','Personal y RH',               '👥', '#4a90c4'),
  ('Pedagógico',      'Educación y pedagogía',       '📚', '#7ab8de'),
  ('Institucional',   'Eventos e instituciones',     '🏛️', '#c9a227'),
  ('Cultura',         'Actividades culturales',      '🎭', '#e8be47')
ON DUPLICATE KEY UPDATE
  descripcion = VALUES(descripcion),
  icono       = VALUES(icono);

-- ============================================================
-- TABLA: noticias
CREATE TABLE IF NOT EXISTS
  `noticias` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `titulo` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(300) UNIQUE,
    `descripcion` VARCHAR(500),
    `texto` LONGTEXT NOT NULL,
    `categoria_id` INT,
    `fecha` DATE NOT NULL,
    `imagen_url` VARCHAR(500),
    `destacada` BOOLEAN DEFAULT FALSE,
    `publicada` BOOLEAN DEFAULT TRUE,
    `deleted_at` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL,
    INDEX `idx_fecha` (`fecha`),
    INDEX `idx_categoria` (`categoria_id`),
    INDEX `idx_destacada` (`destacada`),
    INDEX `idx_publicada` (`publicada`),
    INDEX `idx_deleted_at` (`deleted_at`),
    INDEX `idx_created_at` (`created_at`),
    FULLTEXT INDEX `ft_titulo` (`titulo`),
    FULLTEXT INDEX `ft_texto` (`texto`),
    FULLTEXT INDEX `ft_descripcion` (`descripcion`)
  );

CREATE TABLE IF NOT EXISTS noticias_imagenes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  noticia_id  INT NOT NULL,
  imagen_url  VARCHAR(500) NOT NULL,
  orden       INT NOT NULL DEFAULT 0,
  FOREIGN KEY (noticia_id) REFERENCES noticias(id) ON DELETE CASCADE,
  UNIQUE KEY uq_noticia_imagenes_orden (noticia_id, orden)
);

-- ============================================================
-- TABLA: auditoria_noticias (opcional)
-- ============================================================
CREATE TABLE IF NOT EXISTS auditoria_noticias (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  noticia_id        INT,
  accion            VARCHAR(50),
  usuario           VARCHAR(100),
  fecha_cambio      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valores_anteriores JSON,
  valores_nuevos    JSON,
  FOREIGN KEY (noticia_id) REFERENCES noticias(id) ON DELETE CASCADE,
  INDEX idx_noticia_id  (noticia_id),
  INDEX idx_fecha_cambio(fecha_cambio)
);

-- ============================================================
-- Ejemplo de INSERT para verificar que todo funciona:
--
-- INSERT INTO noticias
--   (titulo, slug, descripcion, texto, categoria_id, fecha, imagen_url, destacada, publicada)
-- VALUES (
--   'Primer noticia de prueba',
--   'primer-noticia-de-prueba',
--   'Verificación de que la base de datos funciona correctamente.',
--   'Este es el texto completo de la noticia de prueba.',
--   1,
--   CURDATE(),
--   NULL,
--   FALSE,
--   TRUE
-- );
-- ============================================================
-- ============================================================
-- ADICIÓN: actividades de inspectores por nivel / grado / mes
-- (agregado sin tocar las tablas existentes de arriba)
-- ============================================================
CREATE TABLE IF NOT EXISTS actividades_inspectores (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nivel             VARCHAR(50)  NOT NULL,   -- slug: inicial, primaria, secundaria, tecnica, agraria, superior, especial, pcyps, dejayam, ed-fisica, ed-artistica
  grado             VARCHAR(150) NOT NULL,   -- texto libre, ej: "Sala de 4", "6to grado A"
  mes               DATE         NOT NULL,   -- siempre día 01 del mes que representa
  titulo            VARCHAR(255) NOT NULL,
  descripcion       TEXT,
  inspector_nombre  VARCHAR(150),
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nivel      (nivel),
  INDEX idx_mes        (mes),
  INDEX idx_grado      (grado),
  INDEX idx_deleted_at (deleted_at)
);

CREATE TABLE IF NOT EXISTS actividades_imagenes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  actividad_id  INT NOT NULL,
  imagen_url    VARCHAR(500) NOT NULL,
  orden         INT DEFAULT 0,
  FOREIGN KEY (actividad_id) REFERENCES actividades_inspectores(id) ON DELETE CASCADE,
  INDEX idx_actividad_id (actividad_id)
);