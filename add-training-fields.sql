-- Add training fields to users table
ALTER TABLE users 
ADD COLUMN ethos_training_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN bmw_training_complete BOOLEAN DEFAULT FALSE;

-- Update existing users to have training status (you can modify these as needed)
-- UPDATE users SET ethos_training_complete = TRUE, bmw_training_complete = TRUE WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Admin', 'Manager')); 