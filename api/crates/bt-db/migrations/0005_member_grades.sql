-- Per-member grade assignment (slice #2). One grade per member.
CREATE TABLE member_grades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL UNIQUE REFERENCES team_members(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES disciplines(id),
  grade_ord     int  NOT NULL CHECK (grade_ord BETWEEN 1 AND 7),
  target_ord    int  CHECK (target_ord BETWEEN 1 AND 7),
  compa         double precision NOT NULL DEFAULT 0.5,
  ready_months  int  NOT NULL DEFAULT 0,
  mgr_track     bool NOT NULL DEFAULT false,
  next_review   date,
  last_review   date
);

CREATE TABLE member_block_levels (
  member_grade_id uuid NOT NULL REFERENCES member_grades(id) ON DELETE CASCADE,
  block_id        uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord       int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  UNIQUE(member_grade_id, block_id)
);

CREATE INDEX idx_member_block_levels_grade ON member_block_levels(member_grade_id);
