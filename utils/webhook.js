const axios = require('axios');

// Use environment variable for webhook URL
const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || 'https://prod-71.westus.logic.azure.com:443/workflows/b76a5e4ad5ea49978990e86679806fc4/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TXM1g4mf6lpViRgQ0JrYAa59-TAvg-UjC24ZZECDFzI';

/**
 * Send webhook notification for sales operations
 * @param {string} action - 'add' or 'delete'
 * @param {Object} saleData - The sale data
 * @param {Object} userData - User information who performed the action
 */
async function sendSalesWebhook(action, saleData, userData = {}) {
  try {
    // Check if webhook URL is configured
    if (!WEBHOOK_URL) {
      console.warn('TEAMS_WEBHOOK_URL environment variable not set, skipping webhook');
      return false;
    }

    // Format the payload to match what your Power Automate flow expects
    const payload = {
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.0",
            body: [
              {
                type: "TextBlock",
                size: "Large",
                weight: "Bolder",
                text: `Sale ${action === 'add' ? 'Added' : 'Deleted'} - BopChipboard`
              },
              {
                type: "TextBlock",
                text: `**Time:** ${new Date().toLocaleString()}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Client:** ${saleData.clientName}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Stock Number:** ${saleData.stockNumber}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Vehicle:** ${saleData.year} ${saleData.make} ${saleData.model}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Color:** ${saleData.color}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Advisor:** ${saleData.advisor}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Delivered:** ${saleData.delivered ? 'Yes' : 'No'}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Delivery Date:** ${saleData.deliveryDate}`,
                wrap: true
              },
              {
                type: "TextBlock",
                text: `**Type:** ${saleData.type}`,
                wrap: true
              }
            ]
          }
        }
      ],
      // Also include the raw data for any other processing
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