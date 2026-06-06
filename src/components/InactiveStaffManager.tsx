import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { dbService } from '../lib/supabase';
import type { Employee, ReactivationRequest } from '../lib/supabase';

interface InactiveStaffManagerProps {
  currentUser: any;
}

export const InactiveStaffManager: React.FC<InactiveStaffManagerProps> = ({ currentUser }) => {
  const [inactiveStaff, setInactiveStaff] = useState<Employee[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ReactivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<Employee | null>(null);
  const [selectedShift, setSelectedShift] = useState<'A' | 'B' | 'C' | 'General'>('A');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadInactiveStaff = async () => {
    setLoading(true);
    try {
      const allEmps = await dbService.getEmployees();
      setInactiveStaff(allEmps.filter(e => !e.is_active));
      const reqs = await dbService.getPendingReactivations();
      setPendingRequests(reqs);
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Failed to load inactive staff.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInactiveStaff();
  }, []);

  const handleReactivate = async () => {
    if (!selectedStaff) return;
    try {
      const updatedEmp: Employee = {
        ...selectedStaff,
        is_active: true,
        shift: selectedShift
      };
      await dbService.updateEmployee(updatedEmp);
      
      // Process pending retroactive attendance
      const req = pendingRequests.find(r => r.employee_id === selectedStaff.id);
      if (req && req.requested_dates.length > 0) {
        for (const date of req.requested_dates) {
          const retroactiveRecord = [{
            employee_id: selectedStaff.id,
            status: 'P' as const,
            remarks: 'Retroactive Reactivation'
          }];
          await dbService.saveAttendanceBulk(date, retroactiveRecord, currentUser.username);
        }
        await dbService.resolveReactivation(selectedStaff.id);
      }

      setActionMessage({ type: 'success', text: `${selectedStaff.name} has been reactivated and assigned to Shift ${selectedShift}.` });
      setSelectedStaff(null);
      loadInactiveStaff();
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Failed to reactivate employee.' });
    }
  };

  const filteredStaff = inactiveStaff.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    emp.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (currentUser.role !== 'admin') {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-absent)' }}>
        <ShieldAlert size={48} style={{ margin: '0 auto 16px' }} />
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={24} color="#f97316" />
            Deactivated / Resigned Staff
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>Manage employees who were removed from active rosters.</p>
        </div>
        <button className="btn btn-secondary" onClick={loadInactiveStaff} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {actionMessage && (
        <div style={{ padding: '12px', marginBottom: '20px', borderRadius: 'var(--radius-sm)', background: actionMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: actionMessage.type === 'success' ? '#10b981' : '#ef4444', border: `1px solid ${actionMessage.type === 'success' ? '#10b981' : '#ef4444'}` }}>
          {actionMessage.text}
        </div>
      )}

      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="form-input"
          placeholder="Search by ID or Name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ paddingLeft: '40px', maxWidth: '400px' }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
      ) : filteredStaff.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
          <CheckCircle size={40} style={{ margin: '0 auto 16px', color: 'var(--color-present)' }} />
          <h3>No Inactive Staff</h3>
          <p>There are no deactivated employees matching your search.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="roster-table">
            <thead>
              <tr>
                <th>Emp ID</th>
                <th>Name</th>
                <th>Last Known Shift</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map(emp => (
                <tr key={emp.id}>
                  <td style={{ fontWeight: 600 }}>{emp.id}</td>
                  <td>{emp.name}</td>
                  <td>Shift {emp.shift}</td>
                  <td>{emp.role}</td>
                  <td>
                    <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '4px', display: 'inline-block' }}>
                      Deactivated
                    </span>
                    {(() => {
                      const req = pendingRequests.find(r => r.employee_id === emp.id);
                      if (req) {
                        return (
                          <div style={{ fontSize: '0.75rem', marginTop: '4px', color: '#f97316', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                            <strong>Pending Req:</strong> {req.requested_dates.join(', ')}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </td>
                  <td>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      onClick={() => {
                        setSelectedStaff(emp);
                        setSelectedShift(emp.shift); // default to last known shift
                      }}
                    >
                      Reactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reactivation Modal */}
      {selectedStaff && (
        <div className="modal-overlay" onClick={() => setSelectedStaff(null)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Reactivate Employee</h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Assign <strong>{selectedStaff.name} ({selectedStaff.id})</strong> to an active shift.
            </p>

            {(() => {
              const req = pendingRequests.find(r => r.employee_id === selectedStaff.id);
              if (req && req.requested_dates.length > 0) {
                return (
                  <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ color: '#10b981', fontSize: '0.9rem', marginBottom: '8px' }}>Retroactive Attendance</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      Supervisors tried to mark this employee present on: <strong>{req.requested_dates.join(', ')}</strong>.
                      Upon reactivation, they will be automatically marked <strong>Present</strong> for these dates.
                    </p>
                  </div>
                );
              }
              return null;
            })()}
            
            <div style={{ marginBottom: '24px' }}>
              <label className="form-label">Assign to Shift:</label>
              <select 
                className="form-select" 
                value={selectedShift} 
                onChange={(e) => setSelectedShift(e.target.value as any)}
              >
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
                <option value="C">Shift C</option>
                <option value="General">General Shift</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedStaff(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleReactivate}>Confirm Reactivation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
