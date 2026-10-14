-- Date-based themes are on by default: every default rule starts enabled.
UPDATE theme_rules SET enabled=1 WHERE key IN ('spring','summer','autumn','winter','nowruz','valentine','yalda','halloween');
