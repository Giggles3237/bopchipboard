import React, { useContext, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';
import './EditSaleForm.css';
import GetReadyAcknowledgment, { useGetReadyAcknowledgment } from './GetReadyAcknowledgment';

const toDateOnlyString = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().split('T')[0];
};

const instructionOptions = [
  'Fuel',
  'Fluff',
  'CPO',
  'Check for Retail',
  'PDI',
  'Safety Check',
  'State and Emissions',
  'Cilajet',
  'Body Estimate',
  'Wholesale - Check for recalls',
  'Maintenance',
  'Prep for PPF',
  'Other'
];

function StandaloneGetReady() {
  const { auth } = useContext(AuthContext);
  const [isSending, setIsSending] = useState(false);
  const [formData, setFormData] = useState({
    stockNumber: '',
    year: new Date().getFullYear(),
    make: '',
    model: '',
    color: '',
    chassis: '',
    location: 'annex',
    miles: '',
    customerName: 'Stock Unit',
    salesperson: auth?.user?.name || '',
    salespersonEmail: auth?.user?.email || '',
    getReadyDate: new Date(),
    promiseTime: '14:00',
    instructions: [],
    comments: ''
  });

  const getReadyAcknowledgment = useGetReadyAcknowledgment(formData.getReadyDate, formData.promiseTime);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleInstructionChange = (instruction) => {
    setFormData((prevData) => ({
      ...prevData,
      instructions: prevData.instructions.includes(instruction)
        ? prevData.instructions.filter((item) => item !== instruction)
        : [...prevData.instructions, instruction]
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSending) {
      return;
    }

    if (!getReadyAcknowledgment.canSend()) return;

    setIsSending(true);

    try {
      const selectedGetReadyDate = formData.getReadyDate || new Date();
      const dueDate = selectedGetReadyDate.toLocaleDateString();
      const payload = {
        getReadyId: formData.stockNumber,
        dueBy: `${dueDate} at ${formData.promiseTime}`,
        chassis: formData.chassis,
        vehicle: `${formData.model} ${formData.color}`.trim(),
        location: formData.location,
        miles: formData.miles,
        itemsNeeded: formData.instructions,
        additionalAction: 'Check for Open Campaigns',
        comments: formData.comments,
        customerName: formData.customerName,
        salesperson: formData.salesperson,
        submittedBy: auth?.user?.name || '',
        salespersonEmail: formData.salespersonEmail,
        year: Number(formData.year),
        make: formData.make,
        modelName: formData.model,
        color: formData.color,
        getReadyDate: toDateOnlyString(selectedGetReadyDate),
        promiseTime: formData.promiseTime,
        soldUnit: false
      };

      const response = await axios.post(`${API_BASE_URL}/getready/send-email`, payload, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json'
        }
      });

      const sentTo = response?.data?.recipients || [];
      const cc = response?.data?.cc ? `\nCC: ${response.data.cc}` : '';
      const integrationNote = response?.data?.integration?.ok === false
        ? `\nGet Ready system warning: ${response.data.integration.message || 'submission failed'}`
        : '\nGet Ready was also added to the new tracking system.';
      const excelNote = response?.data?.excel?.ok === false && !response.data.excel.skipped
        ? '\nExcel update failed. The email was sent; contact a manager about the Excel entry.'
        : '';
      alert(`Get Ready sent successfully.\nSent to: ${sentTo.join(', ') || 'N/A'}${cc}${integrationNote}${excelNote}`);
      setFormData((prevData) => ({
        ...prevData,
        stockNumber: '',
        year: new Date().getFullYear(),
        make: '',
        model: '',
        color: '',
        chassis: '',
        miles: '',
        customerName: 'Stock Unit',
        instructions: [],
        comments: ''
      }));
    } catch (error) {
      console.error('Error sending standalone Get Ready:', error);
      const serverMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      alert(`Error sending Get Ready: ${serverMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="standalone-get-ready-page">
      <div className="edit-sale-form">
        <h2>Get Ready</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="stockNumber">Stock Number:</label>
            <input id="stockNumber" name="stockNumber" type="text" value={formData.stockNumber} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="year">Year:</label>
            <input id="year" name="year" type="number" value={formData.year} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="make">Make:</label>
            <input id="make" name="make" type="text" value={formData.make} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="model">Model:</label>
            <input id="model" name="model" type="text" value={formData.model} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="color">Color:</label>
            <input id="color" name="color" type="text" value={formData.color} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="chassis">Chassis:</label>
            <input id="chassis" name="chassis" type="text" value={formData.chassis} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="location">Location:</label>
            <input id="location" name="location" type="text" value={formData.location} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="miles">Miles:</label>
            <input id="miles" name="miles" type="number" value={formData.miles} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="customerName">Requested For:</label>
            <input id="customerName" name="customerName" type="text" value={formData.customerName} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="salesperson">Submitted By:</label>
            <input id="salesperson" name="salesperson" type="text" value={formData.salesperson} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="salespersonEmail">Submitter Email:</label>
            <input id="salespersonEmail" name="salespersonEmail" type="email" value={formData.salespersonEmail} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="getReadyDate">Get Ready Date:</label>
            <DatePicker
              selected={formData.getReadyDate}
              onChange={(date) => setFormData((prevData) => ({ ...prevData, getReadyDate: date || new Date() }))}
              dateFormat="yyyy-MM-dd"
              id="getReadyDate"
              name="getReadyDate"
              required
            />
          </div>
          <div>
            <label htmlFor="promiseTime">Promise Time:</label>
            <input id="promiseTime" name="promiseTime" type="time" value={formData.promiseTime} onChange={handleChange} />
          </div>
          <div className="get-ready-section">
            <label>Instructions:</label>
            <div className="instructions-grid">
              {instructionOptions.map((instruction) => (
                <div key={instruction} className="instruction-item">
                  <input
                    type="checkbox"
                    id={`standalone-get-ready-${instruction}`}
                    checked={formData.instructions.includes(instruction)}
                    onChange={() => handleInstructionChange(instruction)}
                  />
                  <label htmlFor={`standalone-get-ready-${instruction}`}>{instruction}</label>
                </div>
              ))}
            </div>
          </div>
          <div className="get-ready-section">
            <label htmlFor="comments">Comments:</label>
            <textarea id="comments" name="comments" value={formData.comments} onChange={handleChange} rows="3" />
          </div>
          <GetReadyAcknowledgment acknowledgment={getReadyAcknowledgment} id="standalone-get-ready-understood" />
          <div className="form-buttons">
            <button type="submit" className="save-button" disabled={isSending}>
              {isSending ? 'Sending Get Ready...' : 'Send Get Ready'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StandaloneGetReady;
