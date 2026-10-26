-- 014_devoluciones — Módulo de devoluciones a talleristas y ponentes.
-- Tallerista: se devuelve el 100% de lo pagado. Ponente: 50%.
-- Cada fila guarda el estado (y un snapshot del monto) de la devolución de una persona.

CREATE TABLE IF NOT EXISTS devoluciones (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('tallerista','ponente')),
  monto_pagado NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_devolver NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'a_devolver' CHECK (estado IN ('a_devolver','devuelto')),
  devuelto_en TIMESTAMPTZ,
  registrado_por TEXT NOT NULL DEFAULT '',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dni)
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_dni ON devoluciones(dni);
