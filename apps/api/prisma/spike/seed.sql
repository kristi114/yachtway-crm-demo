-- Seed runs as the superuser (bypasses RLS), so inserts land regardless of policy.
INSERT INTO users (id, email, role) VALUES
  ('u_rep',   'rep@yachtway.com',     'SALES_REP'),
  ('u_fin',   'fintech@yachtway.com', 'FINTECH'),
  ('u_admin', 'admin@yachtway.com',   'ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO contacts (id, record_type, first_name, last_name, email) VALUES
  ('c_buyer1', 'Buyer', 'Dana', 'Reyes', 'dana@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO easyfund_loans (id, contact_id, credit_score, monthly_income, down_payment) VALUES
  ('ef_1', 'c_buyer1', '740-799', 18500.00, 120000.00)
ON CONFLICT (id) DO NOTHING;
