-- Apply to the existing Chipboard MYSQL_DATABASE only after deployment approval.
-- No application-startup DDL; do not run against production during local tests.
CREATE TABLE IF NOT EXISTS loaner_requests (
  id CHAR(36) PRIMARY KEY,
  submitted_by VARCHAR(100) NOT NULL,
  request_json JSON NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  approval_json JSON NULL,
  email_payload JSON NULL,
  email_state VARCHAR(20) NOT NULL DEFAULT 'not_ready',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX loaner_queue (state, created_at)
) ENGINE=InnoDB;
