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

    // Determine color scheme based on vehicle type
    let titleColor = "Accent"; // Default
    let backgroundColor = "Default";
    
    if (saleData.type) {
      const type = saleData.type.toLowerCase();
      if (type.includes('new bmw')) {
        titleColor = "Good"; // Blue for New BMW
        backgroundColor = "Good";
      } else if (type.includes('used')) {
        titleColor = "Warning"; // Blue with white text for Used
        backgroundColor = "Warning";
      } else if (type.includes('new mini')) {
        titleColor = "Good"; // Green for New MINI
        backgroundColor = "Good";
      }
    }

    // For deletions, use a different color scheme
    if (action === 'delete') {
      titleColor = "Attention"; // Red for deletions
      backgroundColor = "Attention";
    }

    // Determine title based on action
    const title = action === 'add' ? 'Vehicle Sold - ChipBoard Bot' : 'Sale Deleted - ChipBoard Bot';

    // Format the payload to match what your Power Automate flow expects
    const payload = {
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.0",
            style: backgroundColor !== "Default" ? backgroundColor : undefined,
            body: [
              {
                type: "TextBlock",
                size: "Large",
                weight: "Bolder",
                color: titleColor,
                text: title
              },
              {
                type: "TextBlock",
                text: `**Client:** ${saleData.clientName}`,
                wrap: true,
                spacing: "Medium"
              },
              {
                type: "TextBlock",
                text: `**Stock Number:** ${saleData.stockNumber}`,
                wrap: true,
                spacing: "Small"
              },
              {
                type: "TextBlock",
                text: `**Color:** ${saleData.color}`,
                wrap: true,
                spacing: "Small"
              },
              {
                type: "TextBlock",
                text: `**${saleData.year} ${saleData.make} ${saleData.model}**`,
                wrap: true,
                spacing: "Small",
                weight: "Bolder"
              },
              {
                type: "TextBlock",
                text: `**Advisor:** ${saleData.advisor}`,
                wrap: true,
                spacing: "Medium"
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