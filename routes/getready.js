const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const { sendGetReadyEmail } = require('../utils/getReadyEmail');
const { sendGetReadyWebhook } = require('../utils/webhook');

function buildDueDate(getReadyDate, promiseTime, dueBy) {
  if (getReadyDate) {
    const normalizedTime = /^\d{2}:\d{2}$/.test(String(promiseTime || '14:00'))
      ? String(promiseTime || '14:00')
      : '14:00';
    const parsed = new Date(`${getReadyDate}T${normalizedTime}:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (dueBy) {
    const fallback = new Date(String(dueBy).replace(' at ', ' '));
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toISOString();
    }
  }

  return null;
}

async function submitToGetReadySystem(payload) {
  const url = process.env.GET_READY_API_URL || 'https://getready-ww41.onrender.com/api/integrations/bopchipboard/get-ready';
  const integrationKey = process.env.GET_READY_INTEGRATION_KEY || process.env.BOPCHIPBOARD_API_KEY;

  if (!integrationKey) {
    return {
      ok: false,
      message: 'Get Ready integration key is not configured.'
    };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey
      }
    });

    return {
      ok: true,
      vehicle: response.data?.vehicle || null
    };
  } catch (error) {
    console.error('Error submitting to Get Ready system:', error.response?.data || error.message);
    return {
      ok: false,
      message: error.response?.data?.message || error.message
    };
  }
}

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
      salespersonEmail,
      year,
      make,
      modelName,
      color,
      getReadyDate,
      promiseTime
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

    const integration = await submitToGetReadySystem({
      stock_number: getReadyId,
      year: Number(year),
      make,
      model: modelName,
      color,
      due_date: buildDueDate(getReadyDate, promiseTime, dueBy),
      submitted_by_name: salesperson || req.auth.userName,
      submitted_by_email: salespersonEmail || req.auth.email,
      instructions: Array.isArray(itemsNeeded) ? itemsNeeded : [],
      comments: comments || '',
      location: location || 'DETAIL',
      miles: miles || '',
      customerName,
      chassis: chassis || '',
      integration_source: 'bopchipboard'
    });

    res.status(200).json({
      message: 'Get Ready email sent successfully',
      data: getReadyData,
      recipients: sendResult?.to || [],
      cc: sendResult?.cc || null,
      integration
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
