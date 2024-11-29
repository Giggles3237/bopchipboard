// routes/goals.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../db');

// 1. Team-specific routes first
router.get('/team/test/:month', authenticate, async (req, res) => {
    try {
        const { month } = req.params;
        const [results] = await db.query(
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
        const { month } = req.params;
        console.log('GET /team/:month - Fetching team goal for month:', month);

        const [results] = await db.query(
            'SELECT * FROM team_goals WHERE month = ?',
            [month]
        );
        
        console.log('GET /team/:month - Raw database results:', results);

        if (!results || !results.length) {
            console.log('GET /team/:month - No goal found for month:', month);
            res.json({ goal_count: 0 });
            return;
        }

        const goal = results[0];
        console.log('GET /team/:month - Found goal:', goal);
        
        const response = {
            goal_count: parseInt(goal.goal_count),
            month: goal.month,
            updated_at: goal.updated_at
        };
        
        console.log('GET /team/:month - Sending response:', response);
        res.json(response);

    } catch (error) {
        console.error('GET /team/:month - Error:', error);
        res.status(500).json({ message: 'Error fetching team goal' });
    }
});

router.post('/team', authenticate, async (req, res) => {
  try {
    const { month, goal_count } = req.body;
    
    if (!month || goal_count === undefined) {
      console.error('Invalid request data:', { month, goal_count });
      return res.status(400).json({ 
        message: 'Missing required fields',
        received: { month, goal_count }
      });
    }

    // First check if a record exists for this month
    const [existing] = await db.query(
      'SELECT id FROM team_goals WHERE month = ?',
      [month]
    );

    let result;
    if (existing.length > 0) {
      // Update existing record
      [result] = await db.query(
        'UPDATE team_goals SET goal_count = ? WHERE month = ?',
        [goal_count, month]
      );
    } else {
      // Insert new record
      [result] = await db.query(
        'INSERT INTO team_goals (month, goal_count) VALUES (?, ?)',
        [month, goal_count]
      );
    }

    // Log the operation result
    console.log('Database operation result:', {
      result,
      affectedRows: result.affectedRows,
      insertId: result.insertId
    });

    // Verify the save
    const [verification] = await db.query(
      'SELECT * FROM team_goals WHERE month = ?',
      [month]
    );
    
    console.log('Verification query result:', verification);

    res.json({ 
      message: 'Team goal saved successfully',
      goal: { month, goal_count },
      verification: verification[0]
    });
    
  } catch (error) {
    console.error('Error saving team goal:', {
      error: error.message,
      stack: error.stack,
      sql: error.sql,
      sqlMessage: error.sqlMessage
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
    const [results] = await db.query(
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
    const [results] = await db.query(
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

    // Only allow users to set their own goals
    if (req.auth.name !== advisor) {
      console.log('Unauthorized: user', req.auth.name, 'trying to set goal for', advisor);
      return res.status(403).json({ message: 'Unauthorized to set this goal' });
    }

    console.log('Executing query with values:', { advisor, month, goal_count });
    const [result] = await db.query(
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