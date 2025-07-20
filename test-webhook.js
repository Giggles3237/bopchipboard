const axios = require('axios');

const WEBHOOK_URL = 'https://prod-71.westus.logic.azure.com:443/workflows/b76a5e4ad5ea49978990e86679806fc4/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TXM1g4mf6lpViRgQ0JrYAa59-TAvg-UjC24ZZECDFzI';

async function testWebhook() {
  try {
    console.log('Testing webhook...');
    
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
                text: "Test Sale Added - BopChipboard"
              },
              {
                type: "TextBlock",
                text: "**Time:** Test Time",
                wrap: true
              },
              {
                type: "TextBlock",
                text: "**Client:** Test Client",
                wrap: true
              },
              {
                type: "TextBlock",
                text: "**Stock Number:** TEST123",
                wrap: true
              },
              {
                type: "TextBlock",
                text: "**Vehicle:** 2024 BMW X5",
                wrap: true
              }
            ]
          }
        }
      ],
      action: "add",
      timestamp: new Date().toISOString(),
      sale: {
        id: 999,
        clientName: "Test Client",
        stockNumber: "TEST123",
        year: 2024,
        make: "BMW",
        model: "X5",
        color: "Black",
        advisor: "Test Advisor",
        delivered: true,
        deliveryDate: "2024-12-01",
        type: "New BMW"
      },
      user: {
        userId: 123,
        organizationId: 456
      },
      source: "bopchipboard"
    };

    console.log('Sending test webhook...');
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('Webhook sent successfully!');
    console.log('Status:', response.status);
    console.log('Response:', response.data);
    return true;
  } catch (error) {
    console.error('Failed to send webhook:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
}

// Run the test
testWebhook().then(success => {
  if (success) {
    console.log('✅ Webhook test completed successfully!');
  } else {
    console.log('❌ Webhook test failed. Check the error details above.');
  }
  process.exit(0);
}); 