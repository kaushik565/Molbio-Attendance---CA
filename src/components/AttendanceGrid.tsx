import { useEffect, useState, useMemo } from 'react';
import { Check, X, Search, CheckSquare, Square, Save, AlertCircle, Sparkles, Menu, AlertTriangle } from 'lucide-react';
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
  const [recordRemarks, setRecordRemarks] = useState<Record<string, string>>({});
  const [savedRecords, setSavedRecords] = useState<Set<string>>(new Set());
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [selectedShift, setSelectedShift] = useState<'A' | 'B' | 'C' | 'General' | 'All'>('A');
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Biometric state variables
  const [showBiometricPanel, setShowBiometricPanel] = useState(false);
  const [biometricInput, setBiometricInput] = useState('');

  // Review Modal state variables
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [missingEmployees, setMissingEmployees] = useState<Employee[]>([]);
  const [crossShiftEmployees, setCrossShiftEmployees] = useState<Employee[]>([]);
  const [duplicateEmployees, setDuplicateEmployees] = useState<Employee[]>([]);
  const [deactivatedEmployees, setDeactivatedEmployees] = useState<Employee[]>([]);
  const [reviewStatusMap, setReviewStatusMap] = useState<Record<string, 'Approved Leave' | 'Unapproved Leave'>>({});
  const [reviewShiftChangeMap, setReviewShiftChangeMap] = useState<Record<string, string>>({});
  const [pendingPastedPresent, setPendingPastedPresent] = useState<string[]>([]);

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
      const loadedMarks: Record<string, 'P' | 'A'> = {};
      const loadedRemarks: Record<string, any> = {};
      const savedSet = new Set<string>();
      existingLogs.forEach((log) => {
        loadedMarks[log.employee_id] = log.status as 'P' | 'A';
        if (log.remarks) {
          loadedRemarks[log.employee_id] = log.remarks;
        }
        savedSet.add(log.employee_id);
      });
      setMarkedRecords(loadedMarks);
      setRecordRemarks(loadedRemarks);
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

  // 1. All Base Roster for this tab
  const baseEmployees = useMemo(() => {
    return employees.filter(emp => selectedShift === 'All' || emp.shift === selectedShift);
  }, [employees, selectedShift]);

  // 2. Outgoing (Base roster members who have shifted OUT to another shift today)
  const outgoingIds = useMemo(() => {
    if (selectedShift === 'All') return new Set<string>();
    return new Set(baseEmployees.filter(emp => {
      const remark = recordRemarks[emp.id] || '';
      return remark.includes('Shift Change') && remark.includes('(to Shift ') && !remark.includes(`to Shift ${selectedShift}`);
    }).map(e => e.id));
  }, [baseEmployees, recordRemarks, selectedShift]);

  // 3. Incoming (Employees from OTHER shifts who shifted INTO this shift today)
  const incomingEmployees = useMemo(() => {
    if (selectedShift === 'All') return [];
    return employees.filter(emp => {
      if (emp.shift === selectedShift) return false;
      const remark = recordRemarks[emp.id] || '';
      return remark.includes(`to Shift ${selectedShift}`);
    });
  }, [employees, selectedShift, recordRemarks]);

  // 4. Final Display List (Base Roster + Incoming)
  const shiftEmployees = useMemo(() => {
    return [...baseEmployees, ...incomingEmployees];
  }, [baseEmployees, incomingEmployees]);

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
  const shiftTotalCount = baseEmployees.length - outgoingIds.size + incomingEmployees.length;
  
  const activeInShiftIds = useMemo(() => new Set([
    ...baseEmployees.map(e => e.id).filter(id => !outgoingIds.has(id)),
    ...incomingEmployees.map(e => e.id)
  ]), [baseEmployees, outgoingIds, incomingEmployees]);

  const shiftMarkedCount = shiftEmployees.filter(emp => activeInShiftIds.has(emp.id) && markedRecords[emp.id]).length;
  const shiftPresentCount = shiftEmployees.filter(emp => activeInShiftIds.has(emp.id) && markedRecords[emp.id] === 'P').length;
  const shiftAbsentCount = shiftEmployees.filter(emp => activeInShiftIds.has(emp.id) && markedRecords[emp.id] === 'A').length;
  const shiftChangedCount = incomingEmployees.length + outgoingIds.size;
  const shiftPercent = shiftMarkedCount > 0 ? Math.round((shiftPresentCount / shiftMarkedCount) * 100) : 0;
  const unsavedMarkedCount = shiftEmployees.filter(emp => markedRecords[emp.id] && !savedRecords.has(emp.id)).length;

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
    // Clear remark if manually overwritten by simple toggle
    setRecordRemarks(prev => {
      const next = { ...prev };
      delete next[empId];
      return next;
    });
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
    setRecordRemarks(prev => {
      const next = { ...prev };
      selectedEmpIds.forEach(id => { delete next[id]; });
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
    setRecordRemarks(prev => {
      const next = { ...prev };
      filteredEmployees.forEach(emp => {
        if (currentUser.role !== 'admin' && savedRecords.has(emp.id)) return;
        delete next[emp.id];
      });
      return next;
    });
  };

  // Biometric Processing Logic
  const handleProcessBiometric = () => {
    if (!canMarkCurrentTab || !biometricInput.trim()) return;

    // Parse pasted IDs, splitting by whitespace (spaces, newlines, tabs) or commas
    const pastedIds = biometricInput.split(/[\s,]+/).filter(id => id.trim() !== '');

    const missing: Employee[] = [];
    const crossShift: Employee[] = [];
    const duplicate: Employee[] = [];
    const deactivated: Employee[] = [];
    const presentInShift: string[] = [];

    // Map through all employees globally (not just filteredEmployees) to find cross-shift
    const pastedEmpObjs = pastedIds.map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[];

    pastedEmpObjs.forEach(emp => {
      if (!emp.is_active) {
        deactivated.push(emp);
      } else if (markedRecords[emp.id] === 'P' && savedRecords.has(emp.id)) {
        // Prevent double shifts: Check if they are already saved as Present today
        duplicate.push(emp);
      } else if (emp.shift === selectedShift || selectedShift === 'All') {
        presentInShift.push(emp.id);
      } else {
        crossShift.push(emp);
      }
    });

    shiftEmployees.forEach(emp => {
      if (currentUser.role !== 'admin' && savedRecords.has(emp.id)) return;
      if (!presentInShift.includes(emp.id)) {
        missing.push(emp);
      }
    });

    setPendingPastedPresent(presentInShift);
    setMissingEmployees(missing);
    setCrossShiftEmployees(crossShift);
    setDuplicateEmployees(duplicate);
    setDeactivatedEmployees(deactivated);

    if (duplicate.length > 0) {
      dbService.sendAdminNotification(`Double-shift punch attempted by ${currentUser.username} (${currentUser.role}) for ${duplicate.length} employee(s) on ${attendanceDate}.`);
      setMessage({ type: 'error', text: `Warning: ${duplicate.length} duplicate punches blocked. Admin notified.` });
    }

    // Initialize defaults for modal
    const initialStatusMap: Record<string, 'Approved Leave' | 'Unapproved Leave'> = {};
    missing.forEach(emp => {
      initialStatusMap[emp.id] = 'Unapproved Leave'; // default to absent (unapproved)
    });
    setReviewStatusMap(initialStatusMap);

    const initialShiftChangeMap: Record<string, string> = {};
    crossShift.forEach(emp => {
      initialShiftChangeMap[emp.id] = `Approved Shift Change (to Shift ${selectedShift})`;
    });
    setReviewShiftChangeMap(initialShiftChangeMap);

    setShowReviewModal(true);
  };

  const confirmBiometricReview = async () => {
    // Note: We no longer permanently update the employee's shift in DB.
    // They are just marked present, with a note that they changed shifts.

    setMarkedRecords(prev => {
      const next = { ...prev };
      
      // Mark originally present in shift
      pendingPastedPresent.forEach(id => {
        next[id] = 'P';
      });

      // Mark missing (A)
      missingEmployees.forEach(emp => {
        next[emp.id] = 'A';
      });

      // Mark cross-shift (P)
      crossShiftEmployees.forEach(emp => {
        next[emp.id] = 'P';
      });

      return next;
    });

    setRecordRemarks(prev => {
      const next = { ...prev };

      missingEmployees.forEach(emp => {
        next[emp.id] = reviewStatusMap[emp.id];
      });

      crossShiftEmployees.forEach(emp => {
        next[emp.id] = reviewShiftChangeMap[emp.id];
      });

      return next;
    });

    setMessage({ type: 'success', text: `Biometric attendance processed successfully!` });
    setTimeout(() => setMessage(null), 5000);
    setShowReviewModal(false);
    setShowBiometricPanel(false);
    setBiometricInput('');
  };

  const handleRequestReactivation = async (emp: Employee) => {
    try {
      await dbService.requestReactivation(emp.id, currentUser.username, attendanceDate);
      await dbService.sendAdminNotification(`Supervisor ${currentUser.username} requested reactivation for ${emp.name} (${emp.id}) from Shift ${selectedShift}.`);
      setMessage({ type: 'success', text: `Reactivation requested for ${emp.name}.` });
      setDeactivatedEmployees(prev => prev.filter(e => e.id !== emp.id));
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to request reactivation.' });
    }
  };

  // Save changes to database
  const handleSaveAttendance = async () => {
    if (!canMarkCurrentTab) return;
    setSaveLoading(true);
    setMessage(null);

    try {
      // Build log items specifically for the employees in the current shift tab,
      // as well as any cross-shift employees processed during this session.
      const crossShiftIds = crossShiftEmployees.map(e => e.id);
      const recordsToSave = employees
        .filter(emp => (emp.shift === selectedShift || crossShiftIds.includes(emp.id)) && markedRecords[emp.id])
        .map(emp => ({
          employee_id: emp.id,
          status: markedRecords[emp.id],
          remarks: recordRemarks[emp.id]
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
            <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Shift Changed</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f97316' }}>{shiftChangedCount}</strong>
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
            disabled={saveLoading || shiftMarkedCount === 0 || unsavedMarkedCount === 0}
            style={{ minWidth: '150px' }}
          >
            <Save size={16} />
            <span>{saveLoading ? 'Saving...' : (unsavedMarkedCount === 0 && shiftMarkedCount > 0 ? 'All Saved' : 'Save Attendance')}</span>
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
              onClick={() => setShowBiometricPanel(!showBiometricPanel)}
              style={{ fontSize: '0.8rem', padding: '6px 12px', height: '38px', backgroundColor: showBiometricPanel ? 'var(--bg-tertiary)' : 'var(--bg-secondary)' }}
              title="Paste employee IDs from biometric"
            >
              <Sparkles size={16} style={{ marginRight: '6px', color: 'var(--accent-color)' }} />
              Auto-Fill (Paste IDs)
            </button>
            <span style={{ borderLeft: '1px solid var(--border-color)', margin: '0 8px', height: '24px' }}></span>
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

      {/* Biometric Auto-Fill Panel */}
      {showBiometricPanel && canMarkCurrentTab && (
        <div className="glass-card" style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="var(--accent-color)" />
            Auto-Fill from Biometric System
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Paste the list of <strong>Present</strong> employee IDs below. They will be marked as Present, and all other unlisted employees in this shift will be marked as Absent.
          </p>
          <textarea
            className="form-input"
            value={biometricInput}
            onChange={(e) => setBiometricInput(e.target.value)}
            placeholder="e.g. 120019&#10;120356&#10;120368"
            style={{ width: '100%', minHeight: '120px', padding: '12px', fontFamily: 'monospace', resize: 'vertical', marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowBiometricPanel(false);
                setBiometricInput('');
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleProcessBiometric}
              disabled={!biometricInput.trim()}
            >
              <CheckSquare size={16} />
              <span>Process Attendance</span>
            </button>
          </div>
        </div>
      )}

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {status === 'P' ? (
                            <span className="badge badge-present">Present</span>
                          ) : status === 'A' ? (
                            <span className="badge badge-absent">Absent</span>
                          ) : (
                            <span className="badge badge-unmarked">Unmarked</span>
                          )}
                          {outgoingIds.has(emp.id) && (
                            <span className="badge" style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)', color: '#f97316' }}>
                              {recordRemarks[emp.id]?.match(/\(to (Shift [A-C]|Shift General)\)/)?.[1] ? `Shift Changed ${recordRemarks[emp.id]?.match(/\(to (Shift [A-C]|Shift General)\)/)?.[0]}` : 'Shift Changed'}
                            </span>
                          )}
                          {incomingEmployees.some(e => e.id === emp.id) && (
                            <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                              Cross-Shift (from {emp.shift})
                            </span>
                          )}
                          {recordRemarks[emp.id] && recordRemarks[emp.id].includes('Leave') && (
                            <span className="badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>Leave</span>
                          )}
                        </div>
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
                                  width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border-color)',
                                  background: status === 'P' ? 'var(--color-present)' : 'var(--bg-primary)',
                                  color: status === 'P' ? 'white' : 'var(--text-secondary)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all var(--transition-fast)'
                                }}
                                title="Mark Present"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => markSingleStatus(emp.id, 'A')}
                                style={{
                                  width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border-color)',
                                  background: status === 'A' ? 'var(--color-absent)' : 'var(--bg-primary)',
                                  color: status === 'A' ? 'white' : 'var(--text-secondary)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all var(--transition-fast)'
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
            disabled={saveLoading || shiftMarkedCount === 0 || unsavedMarkedCount === 0}
            style={{ width: '100%', maxWidth: '240px', padding: '12px 24px', fontSize: '0.95rem' }}
          >
            <Save size={18} />
            <span>{saveLoading ? 'Submitting...' : (unsavedMarkedCount === 0 && shiftMarkedCount > 0 ? 'All Submitted' : 'Submit Register')}</span>
          </button>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              Biometric Attendance Review
            </h2>
            
            {missingEmployees.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', color: 'var(--color-absent)' }}>
                  Missing Employees ({missingEmployees.length})
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  These employees did not punch in. Mark them as Unapproved Absence (A) or Approved Leave (L).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {missingEmployees.map(emp => (
                    <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div>
                        <span style={{ fontWeight: 600, display: 'block', fontSize: '0.9rem' }}>{emp.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.id}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setReviewStatusMap(p => ({ ...p, [emp.id]: 'Unapproved Leave' }))}
                          style={{
                            padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                            background: reviewStatusMap[emp.id] === 'Unapproved Leave' ? 'var(--color-absent)' : 'var(--bg-primary)',
                            color: reviewStatusMap[emp.id] === 'Unapproved Leave' ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                          }}
                        >
                          Unapproved Leave
                        </button>
                        <button
                          onClick={() => setReviewStatusMap(p => ({ ...p, [emp.id]: 'Approved Leave' }))}
                          style={{
                            padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                            background: reviewStatusMap[emp.id] === 'Approved Leave' ? '#eab308' : 'var(--bg-primary)',
                            color: reviewStatusMap[emp.id] === 'Approved Leave' ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                          }}
                        >
                          Approved Leave
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {crossShiftEmployees.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', color: '#f97316' }}>
                  Cross-Shift Punches ({crossShiftEmployees.length})
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  These employees punched in but belong to a different shift. Approve them to permanently move them to this shift, or Reject them (marks as USC).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {crossShiftEmployees.map(emp => (
                    <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div>
                        <span style={{ fontWeight: 600, display: 'block', fontSize: '0.9rem' }}>{emp.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.id} (Shift {emp.shift})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setReviewShiftChangeMap(p => ({ ...p, [emp.id]: `Approved Shift Change (to Shift ${selectedShift})` }))}
                          style={{
                            padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                            background: reviewShiftChangeMap[emp.id] === `Approved Shift Change (to Shift ${selectedShift})` ? 'var(--color-present)' : 'var(--bg-primary)',
                            color: reviewShiftChangeMap[emp.id] === `Approved Shift Change (to Shift ${selectedShift})` ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                          }}
                        >
                          Approved Change
                        </button>
                        <button
                          onClick={() => setReviewShiftChangeMap(p => ({ ...p, [emp.id]: `Unapproved Shift Change (to Shift ${selectedShift})` }))}
                          style={{
                            padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                            background: reviewShiftChangeMap[emp.id] === `Unapproved Shift Change (to Shift ${selectedShift})` ? '#f97316' : 'var(--bg-primary)',
                            color: reviewShiftChangeMap[emp.id] === `Unapproved Shift Change (to Shift ${selectedShift})` ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                          }}
                        >
                          Unapproved Change
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {duplicateEmployees.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', color: 'var(--color-absent)' }}>
                  Duplicate Punches Ignored ({duplicateEmployees.length})
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  These employees are already marked Present in another shift. Double shifts are not permitted.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {duplicateEmployees.map(emp => (
                    <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div>
                        <span style={{ fontWeight: 600, display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{emp.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.id} (Shift {emp.shift})</span>
                      </div>
                      <span className="badge badge-present" style={{ opacity: 0.5 }}>Already Present</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deactivatedEmployees.length > 0 && (
              <div style={{ marginBottom: '24px', background: 'rgba(239, 68, 68, 0.05)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h4 style={{ color: '#ef4444', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} />
                  Deactivated Employees Detected ({deactivatedEmployees.length})
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  These employees exist but are currently marked as inactive/resigned. They cannot be marked present until an Admin reactivates them.
                </p>
                {deactivatedEmployees.map(emp => (
                  <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{emp.id}</div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{emp.name}</div>
                    </div>
                    <button 
                      className="btn"
                      style={{ background: '#ef4444', color: '#fff', fontSize: '0.8rem', padding: '6px 12px' }}
                      onClick={() => handleRequestReactivation(emp)}
                    >
                      Request Reactivation
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-secondary" onClick={() => setShowReviewModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmBiometricReview}>Confirm Attendance</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
