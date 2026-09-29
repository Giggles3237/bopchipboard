import React, { useState, useContext, useRef, useMemo, useEffect } from 'react';
import Tooltip from './Tooltip'; // Import the Tooltip component
import { AuthContext } from '../contexts/AuthContext';
import './Chip.css';

function Chip({ sale, onEdit, onStatusUpdate }) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({});
  const chipRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const { auth } = useContext(AuthContext);
  
  // Determine if the current user is a manager or admin
  const isManagerOrAdmin = useMemo(() => {
    return auth?.user?.role === 'Admin' || auth?.user?.role === 'Manager';
  }, [auth]);

  // Determine if the current user can edit this chip
  const isEditable = useMemo(() => {
    if (!auth?.user) return false;
    if (isManagerOrAdmin) return true;
    return auth.user.name === sale?.advisor;
  }, [auth, sale, isManagerOrAdmin]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  if (!sale) {
    return null;
  }

  const getChipClass = () => {
    const baseClass = (() => {
      switch (sale.type) {
        case 'New BMW':
          return 'new-bmw';
        case 'New MINI':
          return 'new-mini';
        case 'CPO BMW':
        case 'CPO MINI':
        case 'Used BMW':
        case 'Used MINI':
          return 'used-cpo';
        case 'Wholesale':
          return 'wholesale';
        default:
          return 'default';
      }
    })();

    return `chip-component ${baseClass} ${sale.delivered ? 'delivered' : 'pending'}`;
  };

  const formatClientName = (name) => {
    if (!name) return '';
    if (!isManagerOrAdmin && sale.advisor !== auth?.user?.name) {
      return '***';
    }
    return name;
  };

  const formatDateTime = (value) => {
    if (!value) return 'No date set';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'No date set';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getRelativeStatus = () => {
    if (sale.delivered) {
      return 'Delivered';
    }

    const deliveryDate = new Date(sale.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) {
      return 'Pending';
    }

    const diffMs = deliveryDate.getTime() - Date.now();
    const absMinutes = Math.abs(Math.round(diffMs / 60000));
    const days = Math.floor(absMinutes / 1440);
    const hours = Math.floor((absMinutes % 1440) / 60);

    if (diffMs < 0) {
      return `${days ? `${days}d ` : ''}${hours}h late`;
    }

    return `${days ? `${days}d ` : ''}${hours}h until delivery`;
  };

  const handleStatusChange = async (event) => {
    event.stopPropagation();

    if (!onStatusUpdate) {
      return;
    }

    const delivered = event.target.value === 'delivered';
    if (delivered === Boolean(sale.delivered)) {
      return;
    }

    try {
      await onStatusUpdate({
        ...sale,
        delivered
      });
    } catch (error) {
      console.error('Error updating vehicle status:', error);
      alert(`Error updating vehicle status: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleMouseEnter = () => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Set tooltip position immediately
    if (chipRef.current) {
      const rect = chipRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + (rect.width / 2) + window.scrollX
      });
    }
    
    // Delay showing the tooltip by 500ms
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    // Clear the timeout if mouse leaves before delay completes
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
  };

  // Format vehicle info for mobile view
  const vehicleInfo = [sale.year, sale.make, sale.model, sale.color].filter(Boolean).join(' ');
  const clientInfo = formatClientName(sale.clientName);
  const statusLabel = sale.delivered ? 'Delivered' : 'Pending';
  const cardTypeLabel = sale.type || 'Customer Delivery';
  const vinOrChassis = sale.vin || sale.VIN || sale.chassis || sale.Chassis || '';

  return (
    <div 
      className={getChipClass()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={isEditable ? () => onEdit(sale) : undefined}
      ref={chipRef}
      style={{ cursor: isEditable ? 'pointer' : 'default' }}
      data-vehicle-info={vehicleInfo}
      data-client-info={clientInfo}
      data-hovered={isHovered}
    >
      <div className="chip-card-header">
        <div>
          <span className="stock-number">
            {sale.stockNumber}
            {(sale.type === 'CPO BMW' || sale.type === 'CPO MINI') && <span className="gold-star">★</span>}
          </span>
          <span className="chip-card-type">{cardTypeLabel}</span>
        </div>
        <label className="chip-status-control" onClick={(event) => event.stopPropagation()}>
          <span className="sr-only">Vehicle status</span>
          <select
            value={sale.delivered ? 'delivered' : 'pending'}
            onChange={handleStatusChange}
            disabled={!isEditable || !onStatusUpdate}
            aria-label={`Change status for ${sale.stockNumber}`}
          >
            <option value="pending">Pending</option>
            <option value="delivered">Delivered</option>
          </select>
        </label>
      </div>
      <div className="chip-card-title">{vehicleInfo || 'Vehicle details needed'}</div>
      {vinOrChassis && (
        <div className="chip-card-vin">VIN {vinOrChassis}</div>
      )}
      <div className="chip-card-status">Status: {statusLabel}</div>
      <div className="chip-card-details">
        <div>
          <span>Client</span>
          <strong>{clientInfo || 'No client'}</strong>
        </div>
        <div>
          <span>Advisor</span>
          <strong>{sale.advisor || 'Unassigned'}</strong>
        </div>
      </div>
      <div className="chip-card-footer">
        <span className={`chip-due-pill ${sale.delivered ? 'is-delivered' : 'is-pending'}`}>
          {getRelativeStatus()}
        </span>
        <span className="chip-card-date">{formatDateTime(sale.deliveryDate)}</span>
      </div>
      <Tooltip visible={isHovered} position={tooltipPosition}>
        <p>{vehicleInfo}</p>
        <p>{clientInfo}</p>
      </Tooltip>
    </div>
  );
}

export default Chip;
