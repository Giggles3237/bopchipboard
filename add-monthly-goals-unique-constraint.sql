-- Add unique constraint to monthly_goals table
-- This ensures that each advisor can only have one goal per month
ALTER TABLE monthly_goals 
ADD UNIQUE KEY unique_advisor_month (advisor_name, month); 