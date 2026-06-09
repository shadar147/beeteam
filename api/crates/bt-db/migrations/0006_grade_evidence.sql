-- Grade evidence captured during 1-2-1s (slice #3).
CREATE TYPE evidence_status AS ENUM ('demonstrated', 'partial');

CREATE TABLE grade_evidence (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  block_id   uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord  int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  status     evidence_status NOT NULL DEFAULT 'demonstrated',
  note       text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grade_evidence_member ON grade_evidence(member_id, created_at DESC);
CREATE INDEX idx_grade_evidence_meeting ON grade_evidence(meeting_id);
