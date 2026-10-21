const axios = require('axios');
async function submitToLoanerFlow(payload) {
  const url = process.env.LOANER_REQUEST_FLOW_URL;

  if (!url) {
    return {
      ok: false,
      message: 'Loaner request Power Automate URL is not configured.'
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': payload.requestId
  };

  if (process.env.LOANER_REQUEST_FLOW_KEY) {
    headers['x-chipboard-key'] = process.env.LOANER_REQUEST_FLOW_KEY;
  }

  try {
    const response = await axios.post(url, payload, {
      headers,
      timeout: 15000,
      maxRedirects: 0
    });

    return {
      ok: true,
      status: response.status,
      data: response.data || null
    };
  } catch (error) {
    console.error('Error submitting loaner request flow:', error.response?.data || error.message);
    const responseMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    return {
      ok: false,
      status: error.response?.status || null,
      message: typeof responseMessage === 'string' ? responseMessage : JSON.stringify(responseMessage),
      details: error.response?.data || null
    };
  }
}


module.exports = { submitToLoanerFlow };
