-- Remove the incorrect unique constraint on month column
-- This constraint prevents multiple advisors from having goals in the same month
ALTER TABLE monthly_goals DROP INDEX unique_user_month; 