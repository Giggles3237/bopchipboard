const axios = require('axios');

const WEBHOOK_URL = 'https://prod-130.westus.logic.azure.com:443/workflows/ba2ffc1374734486b7147d7cedd1d94d/triggers/manual/paths/invoke?api-version=2016-06-01';

/**
 * Send webhook notification for sales operations
 * @param {string} action - 'add' or 'delete'
 * @param {Object} saleData - The sale data
 * @param {Object} userData - User information who performed the action
 */
async function sendSalesWebhook(action, saleData, userData = {}) {
  try {
    const payload = {
      action: action,
      timestamp: new Date().toISOString(),
      sale: saleData,
      user: userData,
      source: 'bopchipboard'
    };

    console.log(`Sending webhook for ${action} action:`, payload);

    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log(`Webhook sent successfully for ${action} action. Status:`, response.status);
    return true;
  } catch (error) {
    console.error(`Failed to send webhook for ${action} action:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Don't throw error to avoid breaking the main flow
    // The webhook failure shouldn't prevent the sale operation
    return false;
  }
}

/**
 * Send webhook for sale addition
 * @param {Object} saleData - The sale data that was added
 * @param {Object} userData - User information who added the sale
 */
async function sendSaleAddedWebhook(saleData, userData) {
  return sendSalesWebhook('add', saleData, userData);
}

/**
 * Send webhook for sale deletion
 * @param {Object} saleData - The sale data that was deleted
 * @param {Object} userData - User information who deleted the sale
 */
async function sendSaleDeletedWebhook(saleData, userData) {
  return sendSalesWebhook('delete', saleData, userData);
}

module.exports = {
  sendSalesWebhook,
  sendSaleAddedWebhook,
  sendSaleDeletedWebhook
}; 