-- Enums
CREATE TYPE user_role     AS ENUM ('lead', 'hr_admin', 'employee');
CREATE TYPE cadence       AS ENUM ('1w', '2w', '4w');
CREATE TYPE visibility    AS ENUM ('private', 'hr', 'org');
CREATE TYPE member_status AS ENUM ('ok', 'warn', 'miss');
CREATE TYPE field_type    AS ENUM ('text','longtext','scale','mood','checklist','select','date','file');
CREATE TYPE meeting_state AS ENUM ('planned', 'done', 'miss');
CREATE TYPE goal_status   AS ENUM ('ontrack', 'risk', 'done');
CREATE TYPE file_kind     AS ENUM ('doc', 'img', 'pdf', 'video', 'sheet');

CREATE TABLE workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  domain          TEXT,
  default_cadence cadence NOT NULL DEFAULT '2w',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'lead',
  hue           INT NOT NULL DEFAULT 28 CHECK (hue BETWEEN 0 AND 359),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE field_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  system       BOOLEAN NOT NULL DEFAULT false,
  version      TEXT NOT NULL DEFAULT '1.0',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE field_defs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES field_templates(id) ON DELETE CASCADE,
  ord         INT NOT NULL,
  type        field_type NOT NULL,
  title       TEXT NOT NULL,
  required    BOOLEAN NOT NULL DEFAULT false,
  placeholder TEXT,
  hint        TEXT,
  options     TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE teams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  mission             TEXT,
  color               TEXT NOT NULL DEFAULT '#F5A524',
  lead_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  default_template_id UUID REFERENCES field_templates(id) ON DELETE SET NULL,
  default_cadence     cadence NOT NULL DEFAULT '2w',
  visibility          visibility NOT NULL DEFAULT 'private'
);

CREATE TABLE team_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  email        TEXT NOT NULL,
  joined       TEXT NOT NULL,
  tz           TEXT NOT NULL,
  mood_trend   INT[] NOT NULL DEFAULT '{}',
  status       member_status NOT NULL DEFAULT 'ok',
  tags         TEXT[] NOT NULL DEFAULT '{}',
  lead_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  hue          INT NOT NULL DEFAULT 28 CHECK (hue BETWEEN 0 AND 359)
);

CREATE TABLE meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  date          TIMESTAMPTZ NOT NULL,
  state         meeting_state NOT NULL DEFAULT 'planned',
  duration_min  INT NOT NULL DEFAULT 45,
  mood          TEXT,
  mood_score    INT CHECK (mood_score BETWEEN 1 AND 10),
  fields        JSONB NOT NULL DEFAULT '{}',
  blockers      TEXT,
  goals         TEXT,
  feedback_to   TEXT,
  feedback_from TEXT,
  development   TEXT[] NOT NULL DEFAULT '{}',
  relationships TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  quarter      TEXT NOT NULL,
  title        TEXT NOT NULL,
  key_result   TEXT NOT NULL,
  progress     INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status       goal_status NOT NULL DEFAULT 'ontrack',
  due          TIMESTAMPTZ NOT NULL
);

CREATE TABLE files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  meeting_id   UUID REFERENCES meetings(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  kind         file_kind NOT NULL,
  size_bytes   BIGINT NOT NULL,
  storage_key  TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reserved for the per-employee Fields-tab override (later sub-project).
CREATE TABLE member_field_overrides (
  member_id   UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES field_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, template_id)
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_meetings_member   ON meetings(member_id, date DESC);
CREATE INDEX idx_goals_member      ON goals(member_id);
CREATE INDEX idx_files_member      ON files(member_id);
