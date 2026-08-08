import React, { useMemo, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Totals from './Totals';
import Chip from './Chip';
import './ChipTable.css';

/**
 * ChipTable Component
 */
function ChipTable({ sales = [], onEdit }) {
  const { auth } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Add responsive handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isManagerOrAdmin = auth?.user?.role === 'Admin' || auth?.user?.role === 'Manager';

  console.log('ChipTable Debug:', {
    isManagerOrAdmin,
    userRole: auth?.user?.role,
    hasAuth: !!auth,
    hasSales: sales.length,
    isMobile
  });

  const sortedAdvisors = useMemo(() => {
    const advisorStats = sales.reduce((acc, sale) => {
      if (!acc[sale.advisor]) {
        acc[sale.advisor] = { 
          name: sale.advisor, 
          delivered: 0, 
          pending: 0,
          isHouse: (sale.advisor || '').toLowerCase().includes('house'),
          isCurrentUser: sale.advisor === auth?.user?.name
        };
      }
      if (sale.type !== 'Wholesale') {
        if (sale.delivered) {
          acc[sale.advisor].delivered++;
        } else {
          acc[sale.advisor].pending++;
        }
      }
      return acc;
    }, {});

    return Object.values(advisorStats).sort((a, b) => {
      // If user is a salesperson, put them at the top
      if (auth?.user?.role === 'Salesperson') {
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;
      }
      
      // Always put house at the bottom
      if (a.isHouse) return 1;
      if (b.isHouse) return -1;
      
      // Sort others by total sales
      return (b.delivered + b.pending) - (a.delivered + a.pending);
    });
  }, [sales, auth?.user?.name, auth?.user?.role]);

  return (
    <div className={`chip-table ${isMobile ? 'mobile-view' : ''}`}>
      {isManagerOrAdmin && (
        <Totals sales={sales} />
      )}
      
      {sortedAdvisors.map(({ name }) => (
        <div key={name} className="advisor-section">
          <div className="advisor-name">
            <h3>
              <div className="advisor-name-with-badges">
                <span>{name}</span>
              </div>
            </h3>
          </div>
          <div className="chips">
            {sales
              .filter(sale => sale.advisor === name)
              .sort((a, b) => {
                // Wholesale always last
                if (a.type === 'Wholesale' && b.type !== 'Wholesale') return 1;
                if (a.type !== 'Wholesale' && b.type === 'Wholesale') return -1;
                if (a.delivered === b.delivered) {
                  return new Date(b.deliveryDate) - new Date(a.deliveryDate);
                }
                return a.delivered ? -1 : 1;
              })
              .map(sale => (
                <Chip
                  key={sale.id}
                  sale={sale}
                  onEdit={() => onEdit(sale)}
                  isEditable={true}
                />
              ))}
          </div>
        </div>
      ))}
      
      {isMobile && (
        <div className="mobile-info">
          <div className="legend">
            <div className="legend-item">
              <span className="legend-color delivered"></span> Delivered
            </div>
            <div className="legend-item">
              <span className="legend-color pending"></span> Pending
            </div>
          </div>
        </div>
      )}
      
      <div style={{ height: '60px' }} aria-hidden="true"></div>
    </div>
  );
}

export default ChipTable;
