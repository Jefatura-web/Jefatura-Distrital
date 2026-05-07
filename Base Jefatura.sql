-- ================================
-- BASE DE DATOS: JEFATURA QUILMES
-- ================================

CREATE DATABASE IF NOT EXISTS jefatura_db;
USE jefatura_db;

-- ================================
-- TABLA: categorias
-- ================================
CREATE TABLE categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

INSERT INTO categorias (nombre) VALUES
  ('Comunicado'),
  ('Infraestructura'),
  ('Recursos Humanos'),
  ('Pedagógico'),
  ('Institucional'),
  ('Cultura');

-- ================================
-- TABLA: noticias
-- ================================
CREATE TABLE noticias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  texto TEXT NOT NULL,
  categoria_id INT,
  fecha DATE NOT NULL,
  imagen_url VARCHAR(500),
  destacada BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- ================================
-- EJEMPLO DE INSERT
-- Para cargar una noticia:
--
-- INSERT INTO noticias (titulo, texto, categoria_id, fecha, imagen_url, destacada)
-- VALUES ('Título', 'Texto...', 1, '2026-04-30', NULL, FALSE);
--
-- Categorías disponibles:
--   1 = Comunicado
--   2 = Infraestructura
--   3 = Recursos Humanos
--   4 = Pedagógico
--   5 = Institucional
--   6 = Cultura
-- ================================