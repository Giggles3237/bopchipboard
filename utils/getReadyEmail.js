const nodemailer = require("nodemailer");

// Email configuration - Gmail with App Password
const emailConfig = {
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER || "chipboard.bot@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "wcpg rmtk szwp rqmx" // Gmail App Password
  },
  // Add these settings to improve deliverability
  tls: {
    rejectUnauthorized: false
  }
};

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
    // Create transporter
    const transporter = nodemailer.createTransport(emailConfig);
    
    // Format email
    const { subject, body } = formatGetReadyEmail(data);
    
    // Default recipients if none provided
    const defaultRecipients = [
      "chris.lasko@pandwforeigncars.com",
      "get.ready@pandwforeigncars.com"
    ];
    
    // Add advisor's email if provided and not already in recipients
    let toRecipients = recipients.length > 0 ? recipients : defaultRecipients;
    
    // If we have a salesperson/advisor email, add it to recipients
    if (data.salesperson && data.salesperson.includes('@')) {
      const advisorEmail = data.salesperson;
      if (!toRecipients.includes(advisorEmail)) {
        toRecipients.push(advisorEmail);
      }
    }
    
    // Email content
    const mailOptions = {
      from: `"Chipboard System" <${emailConfig.auth.user}>`,
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
    return info;
    
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