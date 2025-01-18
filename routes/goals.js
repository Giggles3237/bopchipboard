// routes/goals.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { oldPool } = require('../db');

// 1. Team-specific routes first
router.get('/team/test/:month', authenticate, async (req, res) => {
    try {
        const { month } = req.params;
        const [results] = await oldPool.query(
            'SELECT * FROM team_goals WHERE month = ?',
            [month]
        );
        res.json({
            rawResults: results,
            parsedGoal: results.length ? {
                goal_count: results[0].goal_count,
                month: results[0].month,
                updated_at: results[0].updated_at
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/team/:month', authenticate, async (req, res) => {
  try {
    console.log('Fetching team goal for month:', req.params.month);
    
    const [results] = await oldPool.query(
      'SELECT * FROM monthly_goals WHERE month = ?',
      [req.params.month]
    );
    
    console.log('Query results:', results);

    if (!results || results.length === 0) {
      return res.json({ goal_count: 0 });
    }

    res.json({ goal_count: results[0].goal_count });
    
  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });
    
    res.status(500).json({ 
      message: 'Error fetching team goal',
      details: error.sqlMessage || error.message
    });
  }
});

router.post('/team', authenticate, async (req, res) => {
  try {
    const { month, goal_count } = req.body;
    
    const [result] = await oldPool.query(
      `INSERT INTO monthly_goals (month, goal_count) 
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE goal_count = ?`,
      [month, goal_count, goal_count]
    );
    
    res.json({ 
      message: 'Team goal saved successfully',
      goal: { month, goal_count }
    });
    
  } catch (error) {
    console.error('Error saving team goal:', {
      error: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });
    
    res.status(500).json({ 
      message: 'Error saving team goal',
      details: error.sqlMessage || error.message
    });
  }
});

// 2. Then the more generic routes
router.get('/month/:month', authenticate, async (req, res) => {
  try {
    const { month } = req.params;
    const [results] = await oldPool.query(
      'SELECT advisor_name, goal_count FROM monthly_goals WHERE month = ?',
      [month]
    );
    res.json(results);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ message: 'Error fetching goals' });
  }
});

// Get goal for specific advisor and month
router.get('/:advisor/:month', authenticate, async (req, res) => {
  try {
    const { advisor, month } = req.params;
    const [results] = await oldPool.query(
      'SELECT goal_count FROM monthly_goals WHERE advisor_name = ? AND month = ?',
      [advisor, month]
    );
    res.json(results[0] || { goal_count: 0 });
  } catch (error) {
    console.error('Error fetching goal:', error);
    res.status(500).json({ message: 'Error fetching goal' });
  }
});

// Set goal for advisor and month
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('Received goal POST request:', req.body);
    console.log('Auth data:', req.auth);
    const { advisor, month, goal_count } = req.body;
    
    // Validate input
    if (!advisor || !month || goal_count === undefined) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        received: { advisor, month, goal_count }
      });
    }

    // Allow admins to set goals for anyone, but regular users can only set their own
    if (req.auth.role !== 'Admin' && req.auth.name !== advisor) {
      console.log('Unauthorized: user', req.auth.name, 'trying to set goal for', advisor);
      return res.status(403).json({ message: 'Unauthorized to set this goal' });
    }

    console.log('Executing query with values:', { advisor, month, goal_count });
    const [result] = await oldPool.query(
      `REPLACE INTO monthly_goals (advisor_name, month, goal_count)
       VALUES (?, ?, ?)`,
      [advisor, month, goal_count]
    );

    console.log('Goal saved successfully:', result);
    res.json({ 
      message: 'Goal saved successfully',
      goal: {
        advisor,
        month,
        goal_count
      }
    });
  } catch (error) {
    console.error('Error saving goal:', {
      message: error.message,
      stack: error.stack,
      sql: error.sql,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({ 
      message: 'Error saving goal',
      details: error.sqlMessage || error.message
    });
  }
});

module.exports = router;