const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { sendGetReadyEmail } = require('../utils/getReadyEmail');
const { sendGetReadyWebhook } = require('../utils/webhook');

// Test route without authentication
router.get('/test', (req, res) => {
  console.log('✅ GET /api/getready/test route hit');
  res.json({ message: 'GetReady router is working!' });
});

// Send Get Ready email
router.post('/send-email', authenticate, async (req, res) => {
  console.log('📧 POST /api/getready/send-email received');
  console.log('📋 Request body:', req.body);
  console.log('📋 Request headers:', req.headers);
  
  try {
    const {
      getReadyId,
      dueBy,
      chassis,
      vehicle,
      location,
      miles,
      itemsNeeded,
      additionalAction,
      comments,
      customerName,
      salesperson,
        submittedBy,
        salespersonEmail
    } = req.body;

    // Validate required fields
    if (!getReadyId || !dueBy || !vehicle || !customerName) {
      return res.status(400).json({
        message: 'Missing required fields',
        required: ['getReadyId', 'dueBy', 'vehicle', 'customerName'],
        received: req.body
      });
    }

    // Prepare data for email
    const getReadyData = {
      getReadyId,
      dueBy,
      chassis: chassis || '',
      vehicle,
      location: location || 'DETAIL',
      miles: miles || '',
      itemsNeeded: Array.isArray(itemsNeeded) ? itemsNeeded : [],
      additionalAction: additionalAction || 'Check for Open Campaigns',
      comments: comments || '',
      customerName,
      salesperson: salesperson || req.auth.userName,
      submittedBy: submittedBy || req.auth.userName,
      salespersonEmail: salespersonEmail || ''
    };

    // Send email with sender in CC
    const sendResult = await sendGetReadyEmail(getReadyData, [], req.auth.email);

    // Notify Teams channel
    await sendGetReadyWebhook(getReadyData);

    res.status(200).json({
      message: 'Get Ready email sent successfully',
      data: getReadyData,
      recipients: sendResult?.to || [],
      cc: sendResult?.cc || null
    });

  } catch (error) {
    console.error('Error sending Get Ready email:', error);
    res.status(500).json({
      message: 'Error sending Get Ready email',
      error: error.message
    });
  }
});

module.exports = router; 