import { useEffect, useState, useMemo } from 'react';
import { Check, X, Search, CheckSquare, Square, Save, AlertCircle, Sparkles, Menu } from 'lucide-react';
import { dbService } from '../lib/supabase';
import type { Employee } from '../lib/supabase';

interface AttendanceGridProps {
  currentUser: any;
  supervisors?: any[];
  isActive?: boolean;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({ currentUser, supervisors = [], isActive, sidebarHidden, onToggleSidebar }) => {
  const getShiftLabel = (shiftCode: string) => {
    const sup = (supervisors || []).find(s => s.assigned_shift === shiftCode);
    const name = sup ? sup.supervisor_name : '';
    return `Shift ${shiftCode}${name ? ` (${name})` : ''}`;
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [markedRecords, setMarkedRecords] = useState<Record<string, 'P' | 'A'>>({});
  const [savedRecords, setSavedRecords] = useState<Set<string>>(new Set());
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [selectedShift, setSelectedShift] = useState<'A' | 'B' | 'C' | 'General'>('A');
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check if supervisor's access is restricted to their assigned shift
  const canMarkAllShifts = currentUser.role === 'admin' || currentUser.assigned_shift === 'All';
  const supervisorShift = currentUser.assigned_shift;

  // Set initial shift based on user assignment or redirect storage
  useEffect(() => {
    const tempShift = localStorage.getItem('temp_selected_shift') as any;
    if (tempShift) {
      setSelectedShift(tempShift);
      localStorage.removeItem('temp_selected_shift');
    } else if (!canMarkAllShifts && supervisorShift !== 'All') {
      setSelectedShift(supervisorShift);
    }
  }, [supervisorShift, canMarkAllShifts]);

  // Load employees and attendance logs for the selected date
  const loadData = async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    setMessage(null);
    try {
      // 1. Fetch active employees
      const allEmps = await dbService.getEmployees();
      setEmployees(allEmps.filter(e => e.is_active));

      // 2. Fetch existing logs for the selected date
      const existingLogs = await dbService.getAttendanceByDate(attendanceDate);
      const recordsMap: Record<string, 'P' | 'A'> = {};
      const savedSet = new Set<string>();
      existingLogs.forEach((log) => {
        recordsMap[log.employee_id] = log.status;
        savedSet.add(log.employee_id);
      });
      setMarkedRecords(recordsMap);
      setSavedRecords(savedSet);
      setSelectedEmpIds(new Set());
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error fetching database records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [attendanceDate]);

  useEffect(() => {
    if (isActive) {
      loadData(true);
    }
  }, [isActive]);

  // Filter employees by selected shift
  const shiftEmployees = useMemo(() => {
    return employees.filter(emp => emp.shift === selectedShift);
  }, [employees, selectedShift]);

  // Filter shift employees by search query
  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return shiftEmployees;
    return shiftEmployees.filter(
      emp => emp.name.toLowerCase().includes(query) || emp.id.toLowerCase().includes(query)
    );
  }, [shiftEmployees, searchQuery]);

  // Check if supervisor can mark in the currently selected tab
  const canMarkCurrentTab = currentUser.role === 'admin' || supervisorShift === 'All' || supervisorShift === selectedShift;

  // Stats for the current shift list
  const shiftTotalCount = shiftEmployees.length;
  const shiftMarkedCount = shiftEmployees.filter(emp => markedRecords[emp.id]).length;
  const shiftPresentCount = shiftEmployees.filter(emp => markedRecords[emp.id] === 'P').length;
  const shiftAbsentCount = shiftEmployees.filter(emp => markedRecords[emp.id] === 'A').length;
  const shiftPercent = shiftMarkedCount > 0 ? Math.round((shiftPresentCount / shiftMarkedCount) * 100) : 0;

  // Selection toggle helpers
  const handleSelectToggle = (empId: string) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (selectedEmpIds.size === filteredEmployees.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(filteredEmployees.map(emp => emp.id)));
    }
  };

  // Status marking handlers
  const markSingleStatus = (empId: string, status: 'P' | 'A') => {
    if (!canMarkCurrentTab) return;
    if (currentUser.role !== 'admin' && savedRecords.has(empId)) return;
    setMarkedRecords(prev => ({
      ...prev,
      [empId]: status
    }));
  };

  const markSelectedStatus = (status: 'P' | 'A') => {
    if (!canMarkCurrentTab || selectedEmpIds.size === 0) return;
    setMarkedRecords(prev => {
      const next = { ...prev };
      selectedEmpIds.forEach(id => {
        if (currentUser.role !== 'admin' && savedRecords.has(id)) return;
        next[id] = status;
      });
      return next;
    });
    setSelectedEmpIds(new Set()); // Reset selections after action
  };

  const markAllStatus = (status: 'P' | 'A') => {
    if (!canMarkCurrentTab) return;
    setMarkedRecords(prev => {
      const next = { ...prev };
      filteredEmployees.forEach(emp => {
        if (currentUser.role !== 'admin' && savedRecords.has(emp.id)) return;
        // Only mark if they haven't been manually marked yet
        if (!prev[emp.id]) {
          next[emp.id] = status;
        }
      });
      return next;
    });
  };

  // Save changes to database
  const handleSaveAttendance = async () => {
    if (!canMarkCurrentTab) return;
    setSaveLoading(true);
    setMessage(null);

    try {
      // Build log items specifically for the employees in the current shift tab
      const recordsToSave = shiftEmployees
        .filter(emp => markedRecords[emp.id])
        .map(emp => ({
          employee_id: emp.id,
          status: markedRecords[emp.id]
        }));

      if (recordsToSave.length === 0) {
        setMessage({ type: 'error', text: 'No attendance records marked to save.' });
        setSaveLoading(false);
        return;
      }

      await dbService.saveAttendanceBulk(attendanceDate, recordsToSave, currentUser.id);
      setSavedRecords(prev => {
        const next = new Set(prev);
        recordsToSave.forEach(r => next.add(r.employee_id));
        return next;
      });
      setMessage({ type: 'success', text: `Roster for ${getShiftLabel(selectedShift)} saved successfully!` });
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Failed to submit attendance logs.' });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {sidebarHidden && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="floating-menu-btn"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '1px solid var(--card-border)',
                background: 'var(--card-bg)',
                backdropFilter: 'var(--glass-blur)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                flexShrink: 0
              }}
              title="Expand Sidebar"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.75px', marginBottom: '6px' }}>Attendance Desk</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Mark daily roster attendance for floor operators and inspectors.
            </p>
          </div>
        </div>

        {/* Date Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="attendance-date" className="form-label" style={{ marginBottom: 0 }}>Register Date:</label>
          <input
            id="attendance-date"
            type="date"
            className="form-input"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            style={{ width: '160px', padding: '8px 12px' }}
          />
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="glass-card" style={{
          borderLeft: `4px solid ${message.type === 'success' ? 'var(--color-present)' : 'var(--color-absent)'}`,
          color: message.type === 'success' ? 'var(--color-present)' : 'var(--color-absent)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          {message.type === 'success' ? <Sparkles size={20} /> : <AlertCircle size={20} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Shift Switcher Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '24px',
        gap: '4px',
        overflowX: 'auto'
      }}>
        {(['A', 'B', 'C', 'General'] as const).map((shift) => {
          const isEnabled = canMarkAllShifts || supervisorShift === shift;
          const isActive = selectedShift === shift;

          return (
            <button
              key={shift}
              onClick={() => isEnabled && setSelectedShift(shift)}
              disabled={!isEnabled && !canMarkAllShifts}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: isActive ? 'var(--bg-secondary)' : 'transparent',
                color: isActive ? 'var(--accent-color)' : isEnabled ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.95rem',
                borderTopLeftRadius: 'var(--radius-sm)',
                borderTopRightRadius: 'var(--radius-sm)',
                borderBottom: isActive ? '2px solid var(--accent-color)' : 'none',
                cursor: isEnabled ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-fast)'
              }}
            >
              {getShiftLabel(shift)} Roster
              {!isEnabled && <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '6px' }}>(Locked)</span>}
            </button>
          );
        })}
      </div>

      {/* Shift Statistics Summary Card */}
      <div className="glass-card" style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        marginBottom: '24px',
        background: 'var(--bg-secondary)'
      }}>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Shift Total</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800 }}>{shiftTotalCount}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Marked Checklist</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {shiftMarkedCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>/ {shiftTotalCount}</span>
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-present)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Present</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-present)' }}>{shiftPresentCount}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-absent)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Absent</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-absent)' }}>{shiftAbsentCount}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Attendance Rate</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800, color: shiftPercent > 85 ? 'var(--color-present)' : 'var(--text-primary)' }}>{shiftPercent}%</strong>
          </div>
        </div>

        {canMarkCurrentTab && (
          <button
            className="btn btn-primary"
            onClick={handleSaveAttendance}
            disabled={saveLoading || shiftMarkedCount === 0}
            style={{ minWidth: '150px' }}
          >
            <Save size={16} />
            <span>{saveLoading ? 'Saving...' : 'Save Attendance'}</span>
          </button>
        )}
      </div>

      {/* Grid Action Toolbar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search employee ID or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '38px', height: '38px' }}
          />
        </div>

        {/* Bulk Action Controls */}
        {canMarkCurrentTab && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => markSelectedStatus('P')}
              disabled={selectedEmpIds.size === 0}
              style={{ fontSize: '0.8rem', padding: '6px 12px', height: '38px' }}
            >
              Mark Selected Present ({selectedEmpIds.size})
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => markSelectedStatus('A')}
              disabled={selectedEmpIds.size === 0}
              style={{ fontSize: '0.8rem', padding: '6px 12px', height: '38px', color: 'var(--color-absent)' }}
            >
              Mark Selected Absent ({selectedEmpIds.size})
            </button>
            <span style={{ borderLeft: '1px solid var(--border-color)', margin: '0 8px', height: '24px' }}></span>
            <button
              className="btn btn-secondary"
              onClick={() => markAllStatus('P')}
              style={{ fontSize: '0.8rem', padding: '6px 12px', height: '38px' }}
              title="Mark all unmarked employees as Present"
            >
              Remaining Present
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => markAllStatus('A')}
              style={{ fontSize: '0.8rem', padding: '6px 12px', height: '38px', color: 'var(--color-absent)' }}
              title="Mark all unmarked employees as Absent"
            >
              Remaining Absent
            </button>
          </div>
        )}
      </div>

      {/* Main Checklist Directory */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div className="skeleton" style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '100px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '180px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '80px', height: '22px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto' }}></div>
              </div>
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
            No active employees found matching the criteria in {getShiftLabel(selectedShift)}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {canMarkCurrentTab && (
                    <th style={{ padding: '16px 20px', width: '50px' }}>
                      <button
                        onClick={handleSelectAllToggle}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}
                      >
                        {selectedEmpIds.size === filteredEmployees.length ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </th>
                  )}
                  <th style={{ padding: '16px 20px', width: '140px' }}>Employee ID</th>
                  <th style={{ padding: '16px 20px' }}>Name</th>
                  <th style={{ padding: '16px 20px' }}>Designation / Role</th>
                  <th style={{ padding: '16px 20px', width: '120px' }}>Status</th>
                  {canMarkCurrentTab && <th style={{ padding: '16px 20px', width: '180px', textAlign: 'right' }}>Quick Toggles</th>}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  const status = markedRecords[emp.id];
                  const isSelected = selectedEmpIds.has(emp.id);
                  const isLocked = currentUser.role !== 'admin' && savedRecords.has(emp.id);

                  return (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        background: isSelected ? 'var(--accent-glow)' : 'transparent',
                        transition: 'background var(--transition-fast)'
                      }}
                    >
                      {canMarkCurrentTab && (
                        <td style={{ padding: '12px 20px' }}>
                          <button
                            onClick={() => !isLocked && handleSelectToggle(emp.id)}
                            disabled={isLocked}
                            style={{ border: 'none', background: 'transparent', cursor: isLocked ? 'not-allowed' : 'pointer', display: 'flex', color: isLocked ? 'var(--text-muted)' : (isSelected ? 'var(--accent-color)' : 'var(--text-muted)'), opacity: isLocked ? 0.3 : 1 }}
                          >
                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                        </td>
                      )}
                      <td style={{ padding: '12px 20px', fontWeight: 700, fontSize: '0.9rem' }}>
                        {emp.id}
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: '0.95rem', fontWeight: 500 }}>
                        {emp.name}
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {emp.role}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        {status === 'P' ? (
                          <span className="badge badge-present">Present</span>
                        ) : status === 'A' ? (
                          <span className="badge badge-absent">Absent</span>
                        ) : (
                          <span className="badge badge-unmarked">Unmarked</span>
                        )}
                      </td>
                      {canMarkCurrentTab && (
                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                          {isLocked ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Locked</span>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => markSingleStatus(emp.id, 'P')}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                border: '1px solid var(--border-color)',
                                background: status === 'P' ? 'var(--color-present)' : 'var(--bg-primary)',
                                color: status === 'P' ? 'white' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all var(--transition-fast)'
                              }}
                              title="Mark Present"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => markSingleStatus(emp.id, 'A')}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                border: '1px solid var(--border-color)',
                                background: status === 'A' ? 'var(--color-absent)' : 'var(--bg-primary)',
                                color: status === 'A' ? 'white' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all var(--transition-fast)'
                              }}
                              title="Mark Absent"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Save Button floating on mobile bottom-right */}
      {canMarkCurrentTab && filteredEmployees.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveAttendance}
            disabled={saveLoading || shiftMarkedCount === 0}
            style={{ width: '100%', maxWidth: '240px', padding: '12px 24px', fontSize: '0.95rem' }}
          >
            <Save size={18} />
            <span>{saveLoading ? 'Submitting...' : 'Submit Register'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
