const express = require('express');
const router = express.Router();
const { authenticate, checkPermission } = require('../middleware/auth');
const { oldPool } = require('../db');
const bcrypt = require('bcrypt');

// Add debugging middleware
router.use((req, res, next) => {
  console.log('Users route hit:', req.method, req.path);
  console.log('Auth header:', req.headers.authorization);
  next();
});

// Clean up the change password route
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    // Get user's current password hash
    const [users] = await oldPool.query('SELECT password FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, users[0].password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await oldPool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    // Log the full error server-side but don't send it to client
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'An error occurred while changing password' });
  }
});

// Get all users (admin only)
router.get('/', authenticate, checkPermission(['view_users']), async (req, res) => {
  try {
    console.log('Fetching users...');
    console.log('Auth user:', req.auth);
    
    // First check if tables exist
    const [tables] = await oldPool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('users', 'roles', 'organizations')
    `);
    
    console.log('Available tables:', tables);

    // Check if we can access the roles table
    const [rolesCheck] = await oldPool.query('SELECT * FROM roles LIMIT 1');
    console.log('Roles check:', rolesCheck);

    // Check if we can access the organizations table
    const [orgsCheck] = await oldPool.query('SELECT * FROM organizations LIMIT 1');
    console.log('Organizations check:', orgsCheck);

    // Now try the full query with better error handling
    const [results] = await oldPool.query(`
      SELECT u.*, 
             r.name as role_name,
             o.name as organization_name 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN organizations o ON u.organization_id = o.id
    `);
    
    console.log('Users fetched:', results?.length || 0);
    
    const usersWithoutPasswords = results.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    res.json(usersWithoutPasswords);
  } catch (err) {
    console.error('Detailed database error:', {
      code: err.code,
      errno: err.errno,
      sqlMessage: err.sqlMessage,
      sqlState: err.sqlState,
      stack: err.stack
    });
    
    return res.status(500).json({ 
      message: 'Error fetching users',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get active salespeople
router.get('/salespeople', authenticate, async (req, res) => {
  try {
    const [results] = await oldPool.query(`
      SELECT u.id, u.name, u.email 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = 'Salesperson'
      AND u.status = 'active'
      ORDER BY u.name ASC
    `);

    console.log('Salespeople query results:', results);
    res.json(results);
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ 
      message: 'Error fetching salespeople',
      error: err.message 
    });
  }
});

// Update user
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;
    
    // First, get the role_id based on the role name
    const [roles] = await oldPool.query('SELECT id FROM roles WHERE name = ?', [updates.role]);
    
    if (roles.length === 0) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Get or create organization_id
    let organizationId;
    const [orgs] = await oldPool.query('SELECT id FROM organizations WHERE name = ?', [updates.organization]);
    if (orgs.length > 0) {
      organizationId = orgs[0].id;
    } else {
      // Create new organization if it doesn't exist
      const [result] = await oldPool.query('INSERT INTO organizations (name) VALUES (?)', [updates.organization]);
      organizationId = result.insertId;
    }
    
    // Prepare the update data
    const updateData = {
      name: updates.name,
      email: updates.email,
      organization_id: organizationId,
      status: updates.status,
      role_id: roles[0].id
    };

    // Only include password if it's provided and not empty
    if (updates.password && updates.password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(updates.password, 10);
      updateData.password = hashedPassword;
    }

    // Update the user
    const [result] = await oldPool.query(
      'UPDATE users SET ? WHERE id = ?',
      [updateData, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User updated successfully' });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      message: 'Error updating user', 
      error: error.message 
    });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, checkPermission(['delete_users']), async (req, res) => {
  try {
    const userId = req.params.id;

    // First check if user exists
    const [users] = await oldPool.query(`
      SELECT u.*, r.name as role_name 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate an invalid password hash that can't be used to login
    const invalidPasswordHash = await bcrypt.hash('DEACTIVATED_' + Date.now(), 10);

    // Instead of setting password to NULL, use the invalid hash
    const [result] = await oldPool.query(`
      UPDATE users 
      SET status = 'inactive', 
          email = CONCAT(email, '_inactive_', DATE_FORMAT(NOW(), '%Y%m%d')),
          password = ?
      WHERE id = ?
    `, [invalidPasswordHash, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      message: 'User deactivated successfully. Historical sales records have been preserved.' 
    });
  } catch (error) {
    console.error('Error deactivating user:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });
    res.status(500).json({ 
      message: 'Error deactivating user',
      details: error.sqlMessage || error.message 
    });
  }
});

// Add new user (admin only)
router.post('/', authenticate, checkPermission(['edit_users']), async (req, res) => {
  try {
    const { name, email, password, role, organization, status } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get role_id from roles table
    const [roles] = await oldPool.query('SELECT id FROM roles WHERE name = ?', [role]);
    if (roles.length === 0) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const roleId = roles[0].id;

    // Get or create organization
    let organizationId;
    const [orgs] = await oldPool.query('SELECT id FROM organizations WHERE name = ?', [organization]);
    if (orgs.length > 0) {
      organizationId = orgs[0].id;
    } else {
      const [result] = await oldPool.query('INSERT INTO organizations (name) VALUES (?)', [organization]);
      organizationId = result.insertId;
    }

    // Insert new user
    const [result] = await oldPool.query(`
      INSERT INTO users (name, email, password, role_id, organization_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, email, hashedPassword, roleId, organizationId, status]);

    res.status(201).json({ 
      message: 'User created successfully',
      userId: result.insertId 
    });
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ 
      message: 'Error creating user',
      error: err.message 
    });
  }
});

// Get salespeople and managers
router.get('/salespeople-and-managers', authenticate, async (req, res) => {
  try {
    const [users] = await oldPool.query(`
      SELECT u.id, u.name, r.name as role 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name IN ('Salesperson', 'Manager') 
      AND u.status = 'active'
      ORDER BY u.name ASC
    `);
    res.json(users);
  } catch (error) {
    console.error('Error fetching salespeople and managers:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

module.exports = router;
