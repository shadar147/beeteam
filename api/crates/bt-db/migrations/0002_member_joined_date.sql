-- Real join date for tenure filtering (the existing `joined` TEXT stays as the display string).
ALTER TABLE team_members ADD COLUMN joined_date DATE NOT NULL DEFAULT '2023-01-01';
