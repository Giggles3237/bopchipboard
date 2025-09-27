const nodemailer = require("nodemailer");

function buildEmailConfig() {
  const {
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_SECURE,
    EMAIL_SERVICE,
    EMAIL_USER,
    EMAIL_PASSWORD,
    EMAIL_REQUIRE_TLS,
    EMAIL_TLS_REJECT_UNAUTHORIZED
  } = process.env;

  const parsedPort = EMAIL_PORT ? parseInt(EMAIL_PORT, 10) : undefined;
  const parsedSecure = typeof EMAIL_SECURE === 'string' ? EMAIL_SECURE === 'true' : undefined;
  const rejectUnauthorized = EMAIL_TLS_REJECT_UNAUTHORIZED
    ? EMAIL_TLS_REJECT_UNAUTHORIZED === 'true'
    : false;

  const authUser = EMAIL_USER || "chipboard.bot@gmail.com";
  const authPass = EMAIL_PASSWORD || "wcpg rmtk szwp rqmx";

  if (!authUser || !authPass) {
    throw new Error('Email credentials are not configured. Please set EMAIL_USER and EMAIL_PASSWORD environment variables.');
  }

  // Allow either explicit host configuration or nodemailer's service lookup
  if (EMAIL_HOST) {
    return {
      host: EMAIL_HOST,
      port: parsedPort || 587,
      secure: typeof parsedSecure === 'boolean' ? parsedSecure : (parsedPort === 465),
      requireTLS: EMAIL_REQUIRE_TLS ? EMAIL_REQUIRE_TLS === 'true' : true,
      auth: {
        user: authUser,
        pass: authPass
      },
      tls: {
        rejectUnauthorized
      }
    };
  }

  const config = {
    service: EMAIL_SERVICE || "gmail",
    auth: {
      user: authUser,
      pass: authPass
    },
    tls: {
      rejectUnauthorized
    }
  };

  if (parsedPort) {
    config.port = parsedPort;
  }

  if (typeof parsedSecure === 'boolean') {
    config.secure = parsedSecure;
  }

  return config;
}

let emailConfig;

try {
  emailConfig = buildEmailConfig();
} catch (error) {
  console.error('[GetReadyEmail] Email configuration error:', error.message);
  emailConfig = null;
}

const fromAddress = process.env.EMAIL_FROM || (emailConfig?.auth?.user ? `"Chipboard System" <${emailConfig.auth.user}>` : null);

function formatGetReadyEmail(data) {
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
    submittedBy
  } = data;

  const emailSubject = `${getReadyId}*SOLD UNIT* GET READY - REPLY ALL FOR STATUS UPDATES`;
  
  const emailBody = `
This is a Get Ready for a sold unit. Please Reply All to this email with updates to the vehicles status.

Stock Number: ${getReadyId}
Due By: ${dueBy}
Chassis: ${chassis}
Vehicle: ${vehicle}
Location: ${location}
Miles: ${miles || ''}
Items Needed: ${JSON.stringify(itemsNeeded)}
Additional Action: ${additionalAction || 'Check for Open Campaigns'}
Comments: ${comments}
Customer Name: ${customerName}
Salesperson: ${salesperson}
Submitted By: ${submittedBy} @ ${new Date().toLocaleString()}
  `.trim();

  return {
    subject: emailSubject,
    body: emailBody
  };
}

async function sendGetReadyEmail(data, recipients = [], senderEmail = null) {
  try {
    if (!emailConfig) {
      throw new Error('Email transporter is not configured. Check server email environment variables.');
    }

    // Create transporter
    const transporter = nodemailer.createTransport(emailConfig);

    // Verify transporter configuration to surface connection issues early
    try {
      await transporter.verify();
    } catch (verifyError) {
      console.warn('[GetReadyEmail] Transport verify failed:', verifyError.message);
    }

    // Format email
    const { subject, body } = formatGetReadyEmail(data);
    
    // Default recipients
    const defaultRecipients = [
      "chris.lasko@pandwforeigncars.com",
      "get.ready@pandwforeigncars.com"
    ];

    // Start with provided recipients or defaults
    let toRecipients = recipients.length > 0 ? [...recipients] : [...defaultRecipients];

    // Add salesperson/advisor name if it looks like an email
    if (data.salesperson && typeof data.salesperson === 'string' && data.salesperson.includes('@')) {
      const advisorEmail = data.salesperson.trim();
      if (!toRecipients.includes(advisorEmail)) {
        toRecipients.push(advisorEmail);
      }
    }

    // Add explicit salespersonEmail field if provided
    if (data.salespersonEmail && typeof data.salespersonEmail === 'string' && data.salespersonEmail.includes('@')) {
      const salespersonEmail = data.salespersonEmail.trim();
      if (!toRecipients.includes(salespersonEmail)) {
        toRecipients.push(salespersonEmail);
      }
    }
    
    // Log recipients for troubleshooting
    console.log('[GetReadyEmail] To recipients:', toRecipients);
    if (senderEmail) {
      console.log('[GetReadyEmail] CC (sender):', senderEmail);
    }

    // Email content
    const mailOptions = {
      from: fromAddress || emailConfig.auth.user,
      to: toRecipients.join(', '),
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
      // Add headers to improve deliverability
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Chipboard System'
      }
    };
    
    // Add sender to CC if provided
    if (senderEmail) {
      mailOptions.cc = senderEmail;
    }
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Get Ready email sent successfully:", info.messageId);
    return {
      messageId: info.messageId,
      to: toRecipients,
      cc: senderEmail || null
    };
    
  } catch (error) {
    console.error("❌ Error sending Get Ready email:", error.message);
    throw error;
  }
}

// Function to convert your existing data format to Get Ready format
function convertToGetReadyFormat(excelData) {
  return {
    getReadyId: excelData[5] || "PB" + Math.random().toString(36).substr(2, 4).toUpperCase(), // Stock#
    dueBy: excelData[14] + " at " + excelData[15], // Due Date + Promise Time
    chassis: excelData[9] || "", // Chassis
    vehicle: excelData[8] + " " + excelData[10], // Model + Color
    location: excelData[6] || "DETAIL", // Location
    miles: excelData[11] || "", // Miles
    itemsNeeded: excelData[12] ? excelData[12].split(';') : [], // Instructions
    additionalAction: "Check for Open Campaigns",
    comments: excelData[13] || "", // Comments
    customerName: excelData[7] || "", // Customer Name
    salesperson: excelData[16] || "chris.lasko@pandwforeigncars.com", // Advisor email
    submittedBy: excelData[3] || "chris.lasko@pandwforeigncars.com" // Email
  };
}

// Test function
async function testGetReadyEmail() {
  console.log('📧 Testing Get Ready email...\n');
  
  try {
    // Test data in your Excel format
    const testExcelData = [
      "",                                // ID
      new Date().toISOString(),          // Start Time
      new Date().toISOString(),          // Completion Time
      "chris.lasko@pandwforeigncars.com", // Email
      "Chris Lasko",                    // Name
      "PB9999",                         // Stock#
      "Detail",                          // Location
      "Test Customer",                   // Customer Name
      "X5",                              // Model
      "WBA123456789",                   // Chassis
      "Black",                           // Color
      "15000",                          // Miles
      "Fuel;Fluff",                     // Instructions
      "Test comment",                    // Comments
      "2025-07-30",                     // Due Date
      "2PM",                            // Promise Time
      "mike.diaz@pandwforeigncars.com", // Advisor email
      "Yes"                              // Sold Unit
    ];
    
    // Convert to Get Ready format
    const getReadyData = convertToGetReadyFormat(testExcelData);
    
    console.log('📋 Get Ready Data:');
    console.log(JSON.stringify(getReadyData, null, 2));
    
    // Send email
    const result = await sendGetReadyEmail(getReadyData, [
      "chris.lasko@pandwforeigncars.com"
    ]);
    
    console.log('✅ Get Ready email sent successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 To fix email issues:');
    console.log('1. Update emailConfig with your SMTP settings');
    console.log('2. Set your email password in the config');
    console.log('3. Or use Gmail with app passwords');
  }
}

// Function to integrate with your existing system
async function addRowToExcelViaGetReadyEmail(values, recipients = []) {
  try {
    const getReadyData = convertToGetReadyFormat(values);
    const result = await sendGetReadyEmail(getReadyData, recipients);
    console.log("Row data sent via Get Ready email:", result.messageId);
    return result;
  } catch (error) {
    console.error("Error sending row data via Get Ready email:", error.message);
    throw error;
  }
}

module.exports = { 
  sendGetReadyEmail,
  addRowToExcelViaGetReadyEmail,
  convertToGetReadyFormat,
  testGetReadyEmail,
  formatGetReadyEmail
}; 