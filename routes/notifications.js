const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../db');

// Get notifications
router.get('/', authenticate, (req, res) => {
  const userId = req.auth.userId;
  const userRole = req.auth.role;

  let query = 'SELECT * FROM notifications WHERE recipient_id = ?';
  let params = [userId];

  // Admin can see all notifications
  if (userRole === 'Admin') {
    query = 'SELECT * FROM notifications';
    params = [];
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Error fetching notifications' });
    }
    res.json(results);
  });
});

// Create notification
router.post('/', authenticate, (req, res) => {
  const { recipientId, message, type } = req.body;
  const senderId = req.auth.userId;

  const query = `
    INSERT INTO notifications (sender_id, recipient_id, message, type, created_at)
    VALUES (?, ?, ?, ?, NOW())
  `;

  db.query(query, [senderId, recipientId, message, type], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Error creating notification' });
    }
    res.status(201).json({ 
      id: result.insertId,
      sender_id: senderId,
      recipient_id: recipientId,
      message,
      type
    });
  });
});

// Mark notification as read
router.put('/:id/read', authenticate, (req, res) => {
  const notificationId = req.params.id;
  const userId = req.auth.userId;

  const query = `
    UPDATE notifications 
    SET read_at = NOW()
    WHERE id = ? AND recipient_id = ?
  `;

  db.query(query, [notificationId, userId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Error updating notification' });
    }
    res.json({ message: 'Notification marked as read' });
  });
});

module.exports = router;
