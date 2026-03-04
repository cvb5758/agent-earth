-- Migration: add subtitle column to waypoints
-- Run this in Supabase SQL Editor to restore per-waypoint subtitle support.
-- After running, update seed.js to include subtitle in waypoint rows and re-seed.
--
-- Context: subtitle data exists in data/travels/*/oscar.json and claudie.json
-- (perspectives[].subtitle). The DB column was missing from the initial schema,
-- causing a silent regression. This migration restores the column.

ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS subtitle TEXT;
