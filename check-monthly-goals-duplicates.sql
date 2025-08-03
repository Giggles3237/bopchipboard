-- Check for duplicate entries in monthly_goals table
SELECT advisor_name, month, COUNT(*) as count
FROM monthly_goals 
GROUP BY advisor_name, month 
HAVING COUNT(*) > 1;

-- Show all entries for a specific advisor and month (example)
-- SELECT * FROM monthly_goals WHERE advisor_name = 'John Doe' AND month = '2024-01'; 