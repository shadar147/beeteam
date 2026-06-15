-- HR review approval (slice #5a): return-to-lead comment + who/when resolved.

ALTER TABLE performance_reviews
  ADD COLUMN hr_comment  text NOT NULL DEFAULT '',
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES users(id);
