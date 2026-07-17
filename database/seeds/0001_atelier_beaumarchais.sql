-- Optional presentation workspace bootstrap. This does not create Obsidian files
-- and is never run by the production deployment unless explicitly requested.
INSERT INTO ops_memory.organizations (slug, display_name, timezone, settings)
VALUES (
  'atelier-beaumarchais',
  'Atelier Beaumarchais',
  'Europe/Paris',
  '{"memory_mode":"central","obsidian_projection":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  timezone = EXCLUDED.timezone,
  settings = ops_memory.organizations.settings || EXCLUDED.settings;
