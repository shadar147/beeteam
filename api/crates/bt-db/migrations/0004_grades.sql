-- Grade framework (read-only foundation): disciplines, IC1–IC7 levels, block×level matrix, bands.
CREATE TABLE disciplines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  ord          INT NOT NULL DEFAULT 0
);
CREATE TABLE grade_levels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ord          INT NOT NULL,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  exp          TEXT NOT NULL DEFAULT '',
  autonomy     TEXT NOT NULL DEFAULT '',
  scope        TEXT NOT NULL DEFAULT '',
  mgr          BOOLEAN NOT NULL DEFAULT false,
  band_low     DOUBLE PRECISION NOT NULL,
  band_mid     DOUBLE PRECISION NOT NULL,
  band_high    DOUBLE PRECISION NOT NULL
);
CREATE TABLE grade_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  ord           INT NOT NULL DEFAULT 0
);
CREATE TABLE matrix_cells (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id  UUID NOT NULL REFERENCES grade_blocks(id) ON DELETE CASCADE,
  level_ord INT NOT NULL,
  text      TEXT,
  required  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (block_id, level_ord)
);
CREATE INDEX idx_disciplines_ws ON disciplines(workspace_id);
CREATE INDEX idx_grade_levels_ws ON grade_levels(workspace_id);
CREATE INDEX idx_grade_blocks_disc ON grade_blocks(discipline_id);
CREATE INDEX idx_matrix_cells_block ON matrix_cells(block_id);
