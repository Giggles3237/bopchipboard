const axios = require('axios');

// Webhook URLs for Microsoft Teams
// Sales notifications
const SALES_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || 'https://prod-71.westus.logic.azure.com:443/workflows/b76a5e4ad5ea49978990e86679806fc4/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TXM1g4mf6lpViRgQ0JrYAa59-TAvg-UjC24ZZECDFzI';
// Get Ready notifications
const GETREADY_WEBHOOK_URL = process.env.TEAMS_GETREADY_WEBHOOK_URL;

/**
 * Send webhook notification for sales operations
 * @param {string} action - 'add' or 'delete'
 * @param {Object} saleData - The sale data
 * @param {Object} userData - User information who performed the action
 */
async function sendSalesWebhook(action, saleData, userData = {}) {
  try {
    // Check if webhook URL is configured
    if (!SALES_WEBHOOK_URL) {
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

    const response = await axios.post(SALES_WEBHOOK_URL, payload, {
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

/**
 * Send webhook notification when a Get Ready is submitted
 * @param {Object} getReadyData - Data describing the Get Ready request
 */
async function sendGetReadyWebhook(getReadyData = {}) {
  try {
    if (!GETREADY_WEBHOOK_URL) {
      console.warn('TEAMS_GETREADY_WEBHOOK_URL environment variable not set, skipping Get Ready webhook');
      return false;
    }

    const body = [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: 'Get Ready Submitted - ChipBoard Bot'
      },
      {
        type: 'TextBlock',
        text: `**Stock Number:** ${getReadyData.getReadyId}`,
        wrap: true
      },
      {
        type: 'TextBlock',
        text: `**Due By:** ${getReadyData.dueBy}`,
        wrap: true
      },
      {
        type: 'TextBlock',
        text: `**Vehicle:** ${getReadyData.vehicle}`,
        wrap: true
      },
      {
        type: 'TextBlock',
        text: `**Location:** ${getReadyData.location}`,
        wrap: true
      },
      {
        type: 'TextBlock',
        text: `**Salesperson:** ${getReadyData.salesperson}`,
        wrap: true
      },
      {
        type: 'TextBlock',
        text: `**Customer:** ${getReadyData.customerName}`,
        wrap: true
      }
    ];

    if (getReadyData.itemsNeeded && getReadyData.itemsNeeded.length) {
      body.push({
        type: 'TextBlock',
        text: `**Items Needed:** ${Array.isArray(getReadyData.itemsNeeded) ? getReadyData.itemsNeeded.join(', ') : getReadyData.itemsNeeded}`,
        wrap: true
      });
    }

    if (getReadyData.comments) {
      body.push({
        type: 'TextBlock',
        text: `**Comments:** ${getReadyData.comments}`,
        wrap: true
      });
    }

    const payload = {
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.0',
            body
          }
        }
      ],
      action: 'getready',
      timestamp: new Date().toISOString(),
      getReady: getReadyData,
      source: 'bopchipboard'
    };

    console.log('Sending Get Ready webhook:', payload);

    const response = await axios.post(GETREADY_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    console.log('Get Ready webhook sent successfully. Status:', response.status);
    return true;
  } catch (error) {
    console.error('Failed to send Get Ready webhook:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
}

module.exports = {
  sendSalesWebhook,
  sendSaleAddedWebhook,
  sendSaleDeletedWebhook,
  sendGetReadyWebhook
};