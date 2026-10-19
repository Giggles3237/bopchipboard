import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import EditSaleForm from './EditSaleForm';

function StandaloneGetReady() {
  const { auth } = useContext(AuthContext);
  const navigate = useNavigate();
  const [inventoryUnit] = useState(() => ({
    clientName: 'Inventory Unit',
    stockNumber: '',
    year: new Date().getFullYear(),
    make: '',
    model: '',
    color: '',
    chassis: '',
    advisor: auth?.user?.name || '',
    delivered: false,
    deliveryDate: new Date().toISOString().split('T')[0],
    type: ''
  }));

  return (
    <EditSaleForm
      sale={inventoryUnit}
      inventoryOnly
      onCancel={() => navigate('/')}
    />
  );
}

export default StandaloneGetReady;
