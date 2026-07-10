-- Salary bands become real money: a workspace income-tax rate + a band-ordering guard.
ALTER TABLE workspaces
  ADD COLUMN salary_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0.10
  CHECK (salary_tax_rate >= 0.0 AND salary_tax_rate < 1.0);

ALTER TABLE grade_levels
  ADD CONSTRAINT band_order
  CHECK (band_low <= band_mid AND band_mid <= band_high AND band_low > 0);
