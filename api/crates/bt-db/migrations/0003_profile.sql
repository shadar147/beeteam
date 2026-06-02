-- Goals tab: dev-plan items + competency bars (OKRs already live in `goals`).
CREATE TABLE development_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL,                   -- Курс / Доклад / Книга / Сертификат / Менторство (free text)
  status       TEXT NOT NULL DEFAULT 'planned', -- planned | in_progress | done
  note         TEXT,                            -- e.g. "Прогресс 60%", "Глава 4 / 12"
  ord          INT NOT NULL DEFAULT 0
);
CREATE TABLE competencies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  score        INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  ord          INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_dev_items_member ON development_items(member_id);
CREATE INDEX idx_competencies_member ON competencies(member_id);
