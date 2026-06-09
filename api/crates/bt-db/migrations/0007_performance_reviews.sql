-- Performance Review flow (slice #4): employee self-assessment, the review
-- checkpoint itself, and per-block scores (self snapshot + lead assessment).

CREATE TYPE review_status   AS ENUM ('draft', 'pending', 'final');
CREATE TYPE review_decision AS ENUM ('hold', 'promote', 'pip');

CREATE TABLE self_assessments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  block_id     uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord    int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, block_id)
);

CREATE TABLE performance_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  period         text NOT NULL,
  status         review_status NOT NULL DEFAULT 'draft',
  from_grade_ord int  NOT NULL CHECK (from_grade_ord BETWEEN 1 AND 7),
  target_ord     int  CHECK (target_ord BETWEEN 1 AND 7),
  decision       review_decision,
  to_grade_ord   int  CHECK (to_grade_ord BETWEEN 1 AND 7),
  summary        text NOT NULL DEFAULT '',
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  finalized_at   timestamptz
);

-- At most one active (draft or pending) review per member.
CREATE UNIQUE INDEX idx_reviews_one_active
  ON performance_reviews(member_id) WHERE status IN ('draft', 'pending');
CREATE INDEX idx_reviews_member ON performance_reviews(member_id, created_at DESC);

CREATE TABLE review_scores (
  review_id uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  block_id  uuid NOT NULL REFERENCES grade_blocks(id),
  self_ord  int CHECK (self_ord BETWEEN 1 AND 7),
  lead_ord  int NOT NULL CHECK (lead_ord BETWEEN 1 AND 7),
  PRIMARY KEY (review_id, block_id)
);
