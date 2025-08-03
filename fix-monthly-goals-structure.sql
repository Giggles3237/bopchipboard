-- Fix monthly_goals table structure
-- Remove the incorrect unique constraint on month (which prevents multiple advisors from having goals in the same month)
ALTER TABLE monthly_goals DROP INDEX month;

-- Add the correct unique constraint on advisor_name and month combination
-- This ensures each advisor can have one goal per month
ALTER TABLE monthly_goals ADD UNIQUE KEY unique_advisor_month (advisor_name, month); 