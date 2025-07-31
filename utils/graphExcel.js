const { ClientSecretCredential } = require("@azure/identity");
const axios = require("axios");

const tenantId = "fb123195-57d4-485c-8875-f5c0f8136c67";
const clientId = "58a504c8-0888-4eb1-928c-108c9d0c8083";
const clientSecret = "vo~8Q~a3gc3OWG4s8NzYRB2jXnXDSqJdh1IZPc1B";

// SharePoint file information extracted from the URL
const SHAREPOINT_CONFIG = {
  domain: "pandwbmw-my.sharepoint.com",
  userEmail: "chris.lasko@pandwforeigncars.com",
  fileId: "Ec0ILScNLXBPpvySJPg08uwBIiT90aMZ86eqbq47V5HyLg",
  fileName: "Get Ready.xlsx"
};

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

async function getAccessToken() {
  const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
  return tokenResponse.token;
}

// Option 1: Access via user's OneDrive (requires User.ReadWrite.All permission)
async function addRowToExcelViaUserDrive(values) {
  try {
    const accessToken = await getAccessToken();
    
    const url = `https://graph.microsoft.com/v1.0/users/${SHAREPOINT_CONFIG.userEmail}/drive/items/${SHAREPOINT_CONFIG.fileId}:/workbook/tables/Table1/rows/add`;

    const body = {
      values: [values]
    };

    const res = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log("Row added via user drive:", res.data);
    return res.data;
  } catch (error) {
    console.error("Error adding row to Excel via user drive:", error.response?.data || error.message);
    throw error;
  }
}

// Option 2: Access via SharePoint site (requires Sites.ReadWrite.All permission)
async function getSiteId() {
  try {
    const accessToken = await getAccessToken();
    
    // Get the site ID for the personal site
    const url = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_CONFIG.domain}:/sites/personal`;
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    return response.data.id;
  } catch (error) {
    console.error("Error getting site ID:", error.response?.data || error.message);
    throw error;
  }
}

async function addRowToExcelViaSharePoint(values) {
  try {
    const accessToken = await getAccessToken();
    
    // First get the site ID
    const siteId = await getSiteId();
    
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${SHAREPOINT_CONFIG.fileId}:/workbook/tables/Table1/rows/add`;

    const body = {
      values: [values]
    };

    const res = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log("Row added via SharePoint:", res.data);
    return res.data;
  } catch (error) {
    console.error("Error adding row to Excel via SharePoint:", error.response?.data || error.message);
    throw error;
  }
}

// Option 3: Direct file access (requires delegated authentication)
async function addRowToExcelDirect(values) {
  try {
    const accessToken = await getAccessToken();
    
    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${SHAREPOINT_CONFIG.fileId}:/workbook/tables/Table1/rows/add`;

    const body = {
      values: [values]
    };

    const res = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log("Row added via direct access:", res.data);
    return res.data;
  } catch (error) {
    console.error("Error adding row to Excel via direct access:", error.response?.data || error.message);
    throw error;
  }
}

// Main function that tries different approaches
async function addRowToExcel(values, method = 'auto') {
  const methods = {
    'user': addRowToExcelViaUserDrive,
    'sharepoint': addRowToExcelViaSharePoint,
    'direct': addRowToExcelDirect,
    'auto': async (values) => {
      // Try methods in order of preference
      const methodsToTry = [
        { name: 'SharePoint', fn: addRowToExcelViaSharePoint },
        { name: 'User Drive', fn: addRowToExcelViaUserDrive },
        { name: 'Direct', fn: addRowToExcelDirect }
      ];
      
      for (const method of methodsToTry) {
        try {
          console.log(`Trying ${method.name} method...`);
          return await method.fn(values);
        } catch (error) {
          console.log(`${method.name} method failed:`, error.response?.data?.error?.message || error.message);
          if (method === methodsToTry[methodsToTry.length - 1]) {
            throw error; // Re-throw if all methods failed
          }
        }
      }
    }
  };
  
  const selectedMethod = methods[method] || methods.auto;
  return await selectedMethod(values);
}

// Helper functions for debugging
async function testFileAccess() {
  try {
    const accessToken = await getAccessToken();
    
    console.log('🔍 Testing file access methods...\n');
    
    // Test 1: Get site ID
    try {
      const siteId = await getSiteId();
      console.log(`✅ Site ID: ${siteId}`);
    } catch (error) {
      console.log(`❌ Cannot get site ID: ${error.response?.data?.error?.message || error.message}`);
    }
    
    // Test 2: Get file info via user drive
    try {
      const url = `https://graph.microsoft.com/v1.0/users/${SHAREPOINT_CONFIG.userEmail}/drive/items/${SHAREPOINT_CONFIG.fileId}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.log(`✅ File accessible via user drive: ${response.data.name}`);
    } catch (error) {
      console.log(`❌ Cannot access file via user drive: ${error.response?.data?.error?.message || error.message}`);
    }
    
    // Test 3: Get file info via direct access
    try {
      const url = `https://graph.microsoft.com/v1.0/me/drive/items/${SHAREPOINT_CONFIG.fileId}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.log(`✅ File accessible via direct access: ${response.data.name}`);
    } catch (error) {
      console.log(`❌ Cannot access file via direct access: ${error.response?.data?.error?.message || error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Legacy functions for backward compatibility
async function getUserByEmail(email) {
  try {
    const accessToken = await getAccessToken();
    
    const url = `https://graph.microsoft.com/v1.0/users/${email}`;
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    return response.data.id;
  } catch (error) {
    console.error(`Error getting user ID for email ${email}:`, error.response?.data || error.message);
    throw error;
  }
}

async function listSites() {
  try {
    const accessToken = await getAccessToken();
    
    const url = "https://graph.microsoft.com/v1.0/sites";
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    console.log("Available sites:", response.data.value);
    return response.data.value;
  } catch (error) {
    console.error("Error listing sites:", error.response?.data || error.message);
    throw error;
  }
}

async function listDrives(siteId) {
  try {
    const accessToken = await getAccessToken();
    
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    console.log("Available drives:", response.data.value);
    return response.data.value;
  } catch (error) {
    console.error("Error listing drives:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { 
  addRowToExcel,
  addRowToExcelViaUserDrive,
  addRowToExcelViaSharePoint,
  addRowToExcelDirect,
  testFileAccess,
  getAccessToken, 
  getUserByEmail,
  listSites,
  listDrives,
  SHAREPOINT_CONFIG
};
