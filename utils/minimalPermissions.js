const { ClientSecretCredential } = require("@azure/identity");
const axios = require("axios");

const tenantId = "fb123195-57d4-485c-8875-f5c0f8136c67";
const clientId = "58a504c8-0888-4eb1-928c-108c9d0c8083";
const clientSecret = "vo~8Q~a3gc3OWG4s8NzYRB2jXnXDSqJdh1IZPc1B";

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

async function getAccessToken() {
  const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
  return tokenResponse.token;
}

// Option 1: Use Microsoft Graph REST API with minimal permissions
async function addRowToExcelMinimal(values) {
  try {
    const accessToken = await getAccessToken();
    
    // Try to access the file directly using the file ID
    const fileId = "Ec0ILScNLXBPpvySJPg08uwBIiT90aMZ86eqbq47V5HyLg";
    
    // First, try to get file info
    const fileInfoUrl = `https://graph.microsoft.com/v1.0/drive/items/${fileId}`;
    
    try {
      const fileResponse = await axios.get(fileInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.log("✅ File accessible:", fileResponse.data.name);
    } catch (error) {
      console.log("❌ Cannot access file directly:", error.response?.data?.error?.message || error.message);
    }
    
    // Try to add row
    const url = `https://graph.microsoft.com/v1.0/drive/items/${fileId}:/workbook/tables/Table1/rows/add`;
    
    const body = {
      values: [values]
    };

    const res = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log("Row added via minimal permissions:", res.data);
    return res.data;
  } catch (error) {
    console.error("Error adding row to Excel via minimal permissions:", error.response?.data || error.message);
    throw error;
  }
}

// Option 2: Use SharePoint REST API (alternative approach)
async function addRowToExcelSharePointREST(values) {
  try {
    const accessToken = await getAccessToken();
    
    // Use SharePoint REST API instead of Graph API
    const siteUrl = "https://pandwbmw-my.sharepoint.com";
    const fileId = "Ec0ILScNLXBPpvySJPg08uwBIiT90aMZ86eqbq47V5HyLg";
    
    const url = `${siteUrl}/_api/web/GetFileById('${fileId}')/ListItemAllFields`;
    
    const body = {
      values: [values]
    };

    const res = await axios.post(url, body, {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json;odata=verbose'
      }
    });

    console.log("Row added via SharePoint REST:", res.data);
    return res.data;
  } catch (error) {
    console.error("Error adding row to Excel via SharePoint REST:", error.response?.data || error.message);
    throw error;
  }
}

// Test function
async function testMinimalPermissions() {
  console.log('🔐 Testing minimal permissions approach...\n');
  
  try {
    const testData = [
      "",                                // ID
      new Date().toISOString(),          // Start Time
      new Date().toISOString(),          // Completion Time
      "test@pandwforeigncars.com",       // Email
      "Test User",                       // Name
      "TEST123",                         // Stock#
      "Detail",                          // Location
      "Test Customer",                   // Customer Name
      "X5",                              // Model
      "TEST123456789",                   // Chassis
      "White",                           // Color
      "10000",                           // Miles
      "Test instructions",               // Instructions
      "Test comment",                    // Comments
      new Date(Date.now() + 86400000).toISOString().split('T')[0], // Due Date
      "3PM",                             // Promise Time
      "test.advisor@pandwforeigncars.com", // Advisor email
      "No"                               // Sold Unit
    ];
    
    console.log('Trying minimal permissions approach...');
    const result = await addRowToExcelMinimal(testData);
    console.log('✅ Success! Row added:', result);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Alternative: Ask IT for these minimal permissions:');
    console.log('- Files.ReadWrite.All (for file access only)');
    console.log('- Sites.Read.All (for SharePoint access only)');
  }
}

module.exports = { 
  addRowToExcelMinimal,
  addRowToExcelSharePointREST,
  testMinimalPermissions 
}; 