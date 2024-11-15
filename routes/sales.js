const express = require('express');
const router = express.Router();
const { authenticate, checkPermission } = require('../middleware/auth');
const db = require('../db');

// Get all sales
router.get('/', authenticate, async (req, res) => {
  try {
    // Simple query to get ALL sales
    const [results] = await db.query('SELECT * FROM vehicle_sales ORDER BY deliveryDate DESC');
    
    console.log('Query results:', {
      totalSales: results.length,
      uniqueAdvisors: [...new Set(results.map(sale => sale.advisor))]
    });
    
    res.json(results);
  } catch (error) {
    console.error('Error in sales route:', error);
    res.status(500).json({ message: 'Error fetching sales data' });
  }
});

// Add new sale
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('Received new sale data:', req.body);
    
    const {
      clientName,
      stockNumber,
      year,
      make,
      model,
      color,
      advisor,
      delivered,
      deliveryDate,
      type
    } = req.body;

    // Validate required fields
    if (!clientName || !stockNumber || !year || !make || !model) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['clientName', 'stockNumber', 'year', 'make', 'model'],
        received: req.body 
      });
    }

    const query = `
      INSERT INTO vehicle_sales 
      (clientName, stockNumber, year, make, model, color, advisor, delivered, deliveryDate, type, user_id, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      clientName,
      stockNumber,
      year,
      make,
      model,
      color,
      advisor,
      delivered ? 1 : 0,
      deliveryDate,
      type,
      req.auth.userId,
      req.auth.organizationId
    ];

    console.log('Executing query with values:', values);

    const [result] = await db.query(query, values);

    console.log('Insert result:', result);

    res.status(201).json({
      message: 'Sale created successfully',
      id: result.insertId,
      ...req.body
    });

  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({ 
      message: 'Error creating sale', 
      error: error.message,
      details: error.sqlMessage 
    });
  }
});

// Update sale
router.put('/:id', authenticate, async (req, res) => {
  const saleId = req.params.id;
  const updates = req.body;
  
  console.log('Received PUT request for sale:', saleId);
  console.log('Update payload:', updates);

  try {
    // First check if sale exists
    const [results] = await db.query('SELECT * FROM vehicle_sales WHERE id = ?', [saleId]);
    
    if (results.length === 0) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Remove non-database fields from updates
    const { id, user_id, organization_id, ...updateData } = updates;
    
    console.log('Executing update with:', updateData);

    const [updateResult] = await db.query(
      'UPDATE vehicle_sales SET ? WHERE id = ?',
      [updateData, saleId]
    );

    console.log('Update result:', updateResult);

    if (updateResult.affectedRows === 0) {
      return res.status(500).json({ message: 'Error updating sale' });
    }

    // Return the updated sale data
    const [updatedSale] = await db.query(
      'SELECT * FROM vehicle_sales WHERE id = ?',
      [saleId]
    );
    
    console.log('Update successful, returning:', updatedSale[0]);
    res.json(updatedSale[0]);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Error updating sale', error: error.message });
  }
});

// Delete sale
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const saleId = req.params.id;

    // Check if sale exists
    const [results] = await db.query('SELECT * FROM vehicle_sales WHERE id = ?', [saleId]);
    
    if (results.length === 0) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Perform delete
    const [deleteResult] = await db.query('DELETE FROM vehicle_sales WHERE id = ?', [saleId]);

    if (deleteResult.affectedRows === 0) {
      return res.status(500).json({ message: 'Error deleting sale' });
    }

    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      message: 'Error deleting sale',
      error: error.message 
    });
  }
});

// Get pending sales
router.get('/pending-sales', authenticate, async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT * FROM vehicle_sales 
      WHERE delivered = 0 
      ORDER BY deliveryDate ASC
    `);
    res.json(results);
  } catch (error) {
    console.error('Error fetching pending sales:', error);
    res.status(500).json({ message: 'Error fetching pending sales' });
  }
});

module.exports = router;
