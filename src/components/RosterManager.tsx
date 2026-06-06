import React, { useEffect, useState, useMemo } from 'react';
import { UserPlus, Edit2, Trash2, Upload, Check, AlertTriangle, RefreshCw, X, Download, ShieldAlert, FileSpreadsheet, Menu, UserCheck, UserMinus, ArrowRightLeft } from 'lucide-react';
import { dbService, isSupabaseConfigured } from '../lib/supabase';
import type { Employee, Profile, AttendanceRecord } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface RosterManagerProps {
  supervisors?: Profile[];
  onSupervisorsUpdate?: () => void;
  isActive?: boolean;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
  currentUser: Profile;
}

export const RosterManager: React.FC<RosterManagerProps> = ({ supervisors = [], onSupervisorsUpdate, isActive, sidebarHidden, onToggleSidebar, currentUser }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShift, setFilterShift] = useState<string>('All');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  
  // Role & Shift Helper Checks
  const isAdmin = currentUser.role === 'admin';
  const isSupervisor = currentUser.role === 'supervisor';
  const supervisorShift = currentUser.assigned_shift;

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  // Form states
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empShift, setEmpShift] = useState<'A' | 'B' | 'C' | 'General'>('A');
  const [empRole, setEmpRole] = useState('Operator');
  const [empActive, setEmpActive] = useState(true);

  // Transfer States
  const [transferEmpId, setTransferEmpId] = useState('');
  const [transferTargetShift, setTransferTargetShift] = useState<'A' | 'B' | 'C' | 'General'>('A');
  const [transferLoading, setTransferLoading] = useState(false);

  // Consecutive Absence Alerts States
  const [absenteeAlerts, setAbsenteeAlerts] = useState<{ employee: Employee; consecutiveDays: number; lastDates: string[] }[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // CSV/Excel Import States
  const [importType, setImportType] = useState<'excel' | 'csv'>('excel');
  const [csvText, setCsvText] = useState('');
  const [importPreview, setImportPreview] = useState<Employee[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Notification States
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  // Pre-fill shift filters for supervisors
  useEffect(() => {
    if (isSupervisor && supervisorShift !== 'All') {
      setFilterShift(supervisorShift);
      setEmpShift(supervisorShift as any);
      setTransferTargetShift(supervisorShift as any);
    } else {
      setFilterShift('All');
    }
  }, [currentUser]);

  // Reset pagination on filter or query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterShift]);

  // Supervisor Editing & Rotation States
  const [editingSupervisor, setEditingSupervisor] = useState<Profile | null>(null);
  const [supName, setSupName] = useState('');
  const [supPassword, setSupPassword] = useState('');
  const [isRotatingShifts, setIsRotatingShifts] = useState(false);

  const getShiftLabel = (shiftCode: string) => {
    const sup = supervisors.find(s => s.assigned_shift === shiftCode);
    const name = sup ? sup.supervisor_name : '';
    if (shiftCode === 'All') return 'All Shifts';
    return `Shift ${shiftCode}${name ? ` (${name})` : ''}`;
  };

  const handleEditSupervisor = (sup: Profile) => {
    setEditingSupervisor(sup);
    setSupName(sup.supervisor_name || '');
    setSupPassword(sup.password || '');
  };

  const handleSupervisorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupervisor) return;
    try {
      await dbService.updateSupervisor(editingSupervisor.id, supName, supPassword);
      showToast('success', `Supervisor credentials updated for ${getShiftLabel(editingSupervisor.assigned_shift)}.`);
      setEditingSupervisor(null);
      if (onSupervisorsUpdate) onSupervisorsUpdate();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to update supervisor settings.');
    }
  };

  const handleRotateShifts = async () => {
    if (!window.confirm("Are you sure you want to rotate all employee shifts? Shift A employees will move to Shift B, Shift B to Shift C, and Shift C to Shift A. General shift remains unchanged.")) {
      return;
    }
    setIsRotatingShifts(true);
    try {
      await dbService.rotateShifts();
      showToast('success', 'Employee and supervisor shifts rotated successfully (A ➔ B ➔ C ➔ A).');
      loadEmployees();
      if (onSupervisorsUpdate) onSupervisorsUpdate();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to rotate shifts.');
    } finally {
      setIsRotatingShifts(false);
    }
  };

  // Calculate Streak of Absent Logs (> 3 consecutive absences)
  const loadAbsenteeAlerts = async (activeEmployees: Employee[]) => {
    setAlertsLoading(true);
    try {
      const toDateStr = new Date().toISOString().split('T')[0];
      const fromDateObj = new Date();
      fromDateObj.setDate(fromDateObj.getDate() - 30); // scan past 30 days
      const fromDateStr = fromDateObj.toISOString().split('T')[0];
      
      const logs = await dbService.getAttendanceRange(fromDateStr, toDateStr);
      
      const logsByEmp: Record<string, AttendanceRecord[]> = {};
      logs.forEach(log => {
        if (!logsByEmp[log.employee_id]) {
          logsByEmp[log.employee_id] = [];
        }
        logsByEmp[log.employee_id].push(log);
      });

      Object.keys(logsByEmp).forEach(empId => {
        logsByEmp[empId].sort((a, b) => b.date.localeCompare(a.date));
      });

      const alerts: { employee: Employee; consecutiveDays: number; lastDates: string[] }[] = [];

      activeEmployees.forEach(emp => {
        // Enforce shift filter for supervisors
        if (isSupervisor && supervisorShift !== 'All' && emp.shift !== supervisorShift) {
          return;
        }

        // Only active (not resigned) employees are relevant
        if (!emp.is_active) return;

        const empLogs = logsByEmp[emp.id] || [];
        let consecutiveAbsences = 0;
        const dates: string[] = [];

        for (let i = 0; i < empLogs.length; i++) {
          if (empLogs[i].status === 'A') {
            consecutiveAbsences++;
            dates.push(empLogs[i].date);
          } else if (empLogs[i].status === 'P') {
            break;
          }
        }

        if (consecutiveAbsences >= 3) {
          alerts.push({
            employee: emp,
            consecutiveDays: consecutiveAbsences,
            lastDates: dates
          });
        }
      });

      alerts.sort((a, b) => b.consecutiveDays - a.consecutiveDays);
      setAbsenteeAlerts(alerts);
    } catch (err) {
      console.error('Failed to load consecutive absences:', err);
    } finally {
      setAlertsLoading(false);
    }
  };

  const loadEmployees = async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const data = await dbService.getEmployees();
      setEmployees(data);
      await loadAbsenteeAlerts(data);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Failed to retrieve employee roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (isActive) {
      loadEmployees(true);
    }
  }, [isActive]);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferEmpId) {
      showToast('error', 'Please select an employee to transfer.');
      return;
    }

    setTransferLoading(true);
    try {
      const emp = employees.find(e => e.id === transferEmpId);
      if (!emp) throw new Error('Employee not found');

      const updated = {
        ...emp,
        shift: transferTargetShift
      };

      await dbService.updateEmployee(updated);
      showToast('success', `${emp.name} transferred to ${getShiftLabel(transferTargetShift)} successfully.`);
      setIsTransferOpen(false);
      setTransferEmpId('');
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to transfer employee.');
    } finally {
      setTransferLoading(false);
    }
  };

  const toggleResignStatus = async (emp: Employee) => {
    const nextStatus = !emp.is_active;
    const confirmMsg = nextStatus 
      ? `Are you sure you want to reactivate ${emp.name}?` 
      : `Are you sure you want to mark ${emp.name} as RESIGNED? This marks them as inactive in the daily attendance list.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const updated = {
        ...emp,
        is_active: nextStatus
      };
      await dbService.updateEmployee(updated);
      showToast('success', nextStatus ? `${emp.name} reactivated.` : `${emp.name} marked as resigned.`);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to change employee status.');
    }
  };

  // Filter and search computation
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            emp.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const activeFilterShift = isSupervisor && supervisorShift !== 'All' ? supervisorShift : filterShift;
      const matchesShift = activeFilterShift === 'All' || emp.shift === activeFilterShift;
      
      return matchesSearch && matchesShift;
    });
  }, [employees, searchQuery, filterShift, isSupervisor, supervisorShift]);

  // Paginated employees slice
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const delta = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  // Compute list of employees eligible for shift transfer (active, and in a different shift)
  const transferableEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (!emp.is_active) return false;
      if (isSupervisor && supervisorShift !== 'All') {
        return emp.shift !== supervisorShift;
      }
      return true; // admin can select any employee
    });
  }, [employees, isSupervisor, supervisorShift]);

  // Form Submit: Add Employee
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empId || !empName || !empRole) {
      showToast('error', 'Please fill in all employee fields.');
      return;
    }

    try {
      await dbService.addEmployee({
        id: empId.trim().toUpperCase(),
        name: empName.trim(),
        shift: empShift,
        role: empRole.trim(),
      });
      showToast('success', `Employee ${empName} added successfully.`);
      setIsAddOpen(false);
      
      // Reset Form
      setEmpId('');
      setEmpName('');
      setEmpShift('A');
      setEmpRole('Operator');

      loadEmployees();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to register employee.');
    }
  };

  // Form Submit: Edit Employee
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !empName || !empRole) {
      showToast('error', 'Please fill in all employee fields.');
      return;
    }

    try {
      const updated = {
        ...selectedEmp,
        name: empName.trim(),
        shift: empShift,
        role: empRole.trim(),
        is_active: empActive
      };

      await dbService.updateEmployee(updated);
      showToast('success', `Employee ${empName} details updated.`);
      setIsEditOpen(false);
      setSelectedEmp(null);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to update employee details.');
    }
  };

  // Delete Employee Roster Row
  const handleDeleteEmployee = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name} (ID: ${id}) from the database? This will permanently delete their attendance records.`)) {
      return;
    }

    try {
      await dbService.deleteEmployee(id);
      showToast('success', `Employee ${name} deleted successfully.`);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Failed to remove employee record.');
    }
  };

  // Parse Copy-Pasted CSV Roster text
  const parseCSVText = () => {
    setImportError(null);
    setImportPreview([]);

    if (!csvText.trim()) {
      setImportError('Please paste CSV text to import.');
      return;
    }

    const lines = csvText.split('\n');
    const parsed: Employee[] = [];
    const idSet = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty rows

      // Handle split by Comma, Semicolon, or Tab
      const parts = line.split(/[,\t;]/).map(part => part.trim().replace(/^["']|["']$/g, ''));
      
      // Expect: ID, Name, Shift, Designation/Role
      if (parts.length < 4) {
        setImportError(`Row ${i + 1} has insufficient columns. Required format: EmployeeID, Name, Shift (A/B/C/General), Role.`);
        return;
      }

      const id = parts[0].toUpperCase();
      const name = parts[1];
      const shift = parts[2] as any;
      const role = parts[3];

      // Validations
      if (!id || !name || !shift || !role) {
        setImportError(`Row ${i + 1} contains blank cells.`);
        return;
      }

      if (!['A', 'B', 'C', 'General'].includes(shift)) {
        setImportError(`Row ${i + 1} has invalid shift '${shift}'. Must be A, B, C, or General.`);
        return;
      }

      if (idSet.has(id)) {
        setImportError(`Row ${i + 1} contains duplicate Employee ID '${id}' in the import text.`);
        return;
      }

      idSet.add(id);
      parsed.push({
        id,
        name,
        shift,
        role,
        is_active: true
      });
    }

    setImportPreview(parsed);
  };

  // Parse Uploaded Excel File containing Shift tabs
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    setImportPreview([]);

    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileReader = new FileReader();

    fileReader.readAsArrayBuffer(file);
    fileReader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        if (!buffer) return;

        const workbook = XLSX.read(buffer, { type: 'array' });
        const parsed: Employee[] = [];
        const idSet = new Set<string>();
        let infoMsg = '';
        let totalCount = 0;

        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          // Read row data as 2D array
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          if (!jsonData || jsonData.length < 2) return; // Skip if empty or only headers

          // Smart shift guess based on tab sheetName
          let shift: 'A' | 'B' | 'C' | 'General' = 'General';
          const normName = sheetName.trim().toUpperCase();

          if (normName === 'A' || normName === '1' || normName.includes('SHIFT A') || normName.includes('SHIFT_A') || normName.includes('A SHIFT') || normName.includes('A-SHIFT') || normName.includes('SHIFT 1')) {
            shift = 'A';
          } else if (normName === 'B' || normName === '2' || normName.includes('SHIFT B') || normName.includes('SHIFT_B') || normName.includes('B SHIFT') || normName.includes('B-SHIFT') || normName.includes('SHIFT 2')) {
            shift = 'B';
          } else if (normName === 'C' || normName === '3' || normName.includes('SHIFT C') || normName.includes('SHIFT_C') || normName.includes('C SHIFT') || normName.includes('C-SHIFT') || normName.includes('SHIFT 3')) {
            shift = 'C';
          } else if (normName.includes('GENERAL') || normName === 'G' || normName.includes('GEN') || normName.includes('GEN-SHIFT') || normName.includes('SHIFT G')) {
            shift = 'General';
          } else {
            // Default shift when sheet names are generic (Sheet1, Sheet2, etc.)
            // We can match index: Sheet 1 -> A, Sheet 2 -> B, Sheet 3 -> C, Sheet 4 -> General
            const sheetIdx = workbook.SheetNames.indexOf(sheetName);
            if (sheetIdx === 0) shift = 'A';
            else if (sheetIdx === 1) shift = 'B';
            else if (sheetIdx === 2) shift = 'C';
            else shift = 'General';
          }

          let sheetParsedCount = 0;
          
          // Row loop (starting at row 1 to skip header row)
          for (let r = 1; r < jsonData.length; r++) {
            const row = jsonData[r];
            if (!row || row.length === 0) continue;

            const id = String(row[0] || '').trim();
            const name = String(row[1] || '').trim();

            if (!id || !name) continue;

            const cleanId = id.toUpperCase();
            if (idSet.has(cleanId)) continue; // avoid duplicates

            idSet.add(cleanId);
            parsed.push({
              id: cleanId,
              name: name,
              shift: shift,
              role: 'Operator', // Default designation
              is_active: true
            });
            sheetParsedCount++;
            totalCount++;
          }
          
          if (sheetParsedCount > 0) {
            infoMsg += `Parsed ${sheetParsedCount} employees from tab '${sheetName}' (Assigned to Shift ${shift}). `;
          }
        });

        if (parsed.length === 0) {
          setImportError('No valid employee records found in the spreadsheet tabs. Please ensure columns are: Column A = ID, Column B = Name.');
        } else {
          setImportPreview(parsed);
          setImportSuccess(`Successfully loaded ${totalCount} employees from Excel! ${infoMsg}`);
        }
      } catch (err) {
        console.error(err);
        setImportError('Failed to read and parse Excel file. Please check file formatting.');
      }
    };
  };

  // Commit CSV Roster imports to Database
  const commitCSVImport = async () => {
    if (importPreview.length === 0) return;
    setLoading(true);
    setImportError(null);
    try {
      await dbService.importEmployeesBulk(importPreview);
      setImportSuccess(`Successfully imported/synced ${importPreview.length} employee records!`);
      setCsvText('');
      setImportPreview([]);
      
      setTimeout(() => {
        setImportSuccess(null);
        setIsImportOpen(false);
      }, 3000);

      loadEmployees();
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || 'Failed to submit batch records.');
    } finally {
      setLoading(false);
    }
  };

  // Open Modals helper
  const openEditModal = (emp: Employee) => {
    setSelectedEmp(emp);
    setEmpName(emp.name);
    setEmpShift(emp.shift);
    setEmpRole(emp.role);
    setEmpActive(emp.is_active);
    setIsEditOpen(true);
  };

  // Database backups (Mock Database JSON)
  const downloadDatabaseBackup = () => {
    const employeesData = localStorage.getItem('cartridge_roster_employees');
    const attendanceData = localStorage.getItem('cartridge_roster_attendance');
    const usersData = localStorage.getItem('cartridge_roster_users');

    const backup = {
      employees: employeesData ? JSON.parse(employeesData) : [],
      attendance: attendanceData ? JSON.parse(attendanceData) : [],
      users: usersData ? JSON.parse(usersData) : {},
      exported_at: new Date().toISOString()
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `cartridge_attendance_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Upload database JSON backup
  const handleDatabaseRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    fileReader.readAsText(files[0], 'UTF-8');
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.employees && Array.isArray(parsed.employees) && parsed.attendance && Array.isArray(parsed.attendance)) {
          localStorage.setItem('cartridge_roster_employees', JSON.stringify(parsed.employees));
          localStorage.setItem('cartridge_roster_attendance', JSON.stringify(parsed.attendance));
          if (parsed.users) localStorage.setItem('cartridge_roster_users', JSON.stringify(parsed.users));
          
          showToast('success', 'Roster and attendance database restored successfully!');
          loadEmployees();
        } else {
          showToast('error', 'Invalid backup file format. Missing core datasets.');
        }
      } catch (err) {
        showToast('error', 'Failed to parse JSON backup file.');
      }
    };
  };

  const handleResetDatabase = () => {
    if (window.confirm('WARNING: This will clear ALL attendance registers and reset the system with 680+ default mock employees. Are you sure?')) {
      dbService.resetMockDatabase();
      showToast('success', 'Database reset to default settings.');
      loadEmployees();
    }
  };

  return (
    <div>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '12px 24px',
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
          fontWeight: 600,
          animation: 'scaleUp var(--transition-fast)'
        }}>
          {toast.text}
        </div>
      )}

      {/* Header section */}
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
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.75px', marginBottom: '6px' }}>Roster Registry</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Manage employee databases, shifts, roles, and load databases via CSV.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {isAdmin && (
            <button className="btn btn-secondary" onClick={() => setIsImportOpen(true)}>
              <Upload size={16} />
              <span>CSV Import</span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setIsTransferOpen(true)}>
            <ArrowRightLeft size={16} />
            <span>Transfer Operator</span>
          </button>
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
            <UserPlus size={16} />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Supervisor Configuration & Shift Rotation Controls */}
      {(isAdmin || isSupervisor) && (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--bg-secondary)', borderLeft: '4px solid var(--accent-color)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Shift Supervisor Configuration & Rotation Controls</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Assign supervisors, manage fixed passwords, and execute weekly shift rotations.
              </p>
            </div>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleRotateShifts}
              disabled={isRotatingShifts}
              style={{ 
                backgroundColor: 'var(--accent-glow)', 
                color: 'var(--accent-color)', 
                borderColor: 'var(--accent-color)',
                fontWeight: 700
              }}
            >
              <RefreshCw size={14} className={isRotatingShifts ? "animate-spin" : ""} style={{ marginRight: '6px', animation: isRotatingShifts ? 'spin 1.5s linear infinite' : 'none' }} />
              <span>{isRotatingShifts ? "Rotating..." : "Rotate Shifts (A ➔ B ➔ C)"}</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {supervisors.filter(s => s.role === 'supervisor').map((sup) => (
              <div 
                key={sup.id} 
                style={{ 
                  background: 'var(--bg-primary)', 
                  border: '1px solid var(--card-border)', 
                  borderRadius: 'var(--radius-sm)', 
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div>
                  <span className="badge badge-info" style={{ marginBottom: '6px', display: 'inline-block' }}>{getShiftLabel(sup.assigned_shift)}</span>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Login: <strong style={{ color: 'var(--text-primary)' }}>{sup.username}</strong>
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Supervisor: <strong style={{ color: 'var(--text-primary)' }}>{sup.supervisor_name || 'Not Set'}</strong>
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Password: <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{sup.password}</span>
                  </p>
                </div>
                {isAdmin && (
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '4px 10px', fontSize: '0.75rem', alignSelf: 'flex-start' }}
                    onClick={() => handleEditSupervisor(sup)}
                  >
                    <Edit2 size={12} style={{ marginRight: '4px' }} />
                    <span>Assign Supervisor</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Absenteeism Alerts */}
      {absenteeAlerts.length > 0 && (
        <div className="glass-card" style={{ 
          padding: '20px 24px', 
          marginBottom: '24px', 
          background: 'var(--bg-secondary)', 
          borderLeft: '4px solid var(--color-absent)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <ShieldAlert size={20} style={{ color: 'var(--color-absent)' }} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--color-absent)' }}>
                Critical Absenteeism Alerts {alertsLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: '6px' }}>(updating...)</span>}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Operators absent for 3 or more consecutive recorded workdays.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {absenteeAlerts.map(({ employee, consecutiveDays, lastDates }) => (
              <div 
                key={employee.id} 
                style={{ 
                  background: 'var(--bg-primary)', 
                  border: '1px solid var(--card-border)', 
                  borderRadius: 'var(--radius-sm)', 
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>{employee.name}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{employee.id} • {getShiftLabel(employee.shift)}</span>
                  </div>
                  <span className="badge badge-absent" style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--color-absent)' }}>
                    {consecutiveDays} Days Absent
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <strong>Recent Absent Dates:</strong>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {lastDates.slice(0, 3).map(d => (
                      <span key={d} style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                        {d}
                      </span>
                    ))}
                    {lastDates.length > 3 && <span>+{lastDates.length - 3} more</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="glass-card" style={{
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        background: 'var(--bg-secondary)'
      }}>
        <div style={{ display: 'flex', gap: '12px', flex: 1, maxWidth: '500px' }}>
          {/* Search */}
          <input
            type="text"
            className="form-input"
            placeholder="Search employee ID or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, height: '38px' }}
          />

          {/* Shift Filter */}
          <select
            className="form-select"
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
            style={{ width: '150px', height: '38px', padding: '6px 12px' }}
          >
            <option value="All">All Shifts</option>
            <option value="A">{getShiftLabel('A')}</option>
            <option value="B">{getShiftLabel('B')}</option>
            <option value="C">{getShiftLabel('C')}</option>
            <option value="General">{getShiftLabel('General')}</option>
          </select>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Showing <strong>{filteredEmployees.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</strong> to <strong>{Math.min(filteredEmployees.length, currentPage * itemsPerPage)}</strong> of <strong>{filteredEmployees.length}</strong> matching operators (<strong>{employees.length}</strong> total)
        </div>
      </div>

      {/* Main Roster Grid */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div className="skeleton" style={{ width: '100px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '180px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '80px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '60px', height: '22px', borderRadius: 'var(--radius-xs)' }}></div>
                <div className="skeleton" style={{ width: '60px', height: '28px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto' }}></div>
              </div>
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
            No registered employees found matching filter options.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '16px 20px', width: '140px' }}>Employee ID</th>
                  <th style={{ padding: '16px 20px' }}>Name</th>
                  <th style={{ padding: '16px 20px', width: '120px' }}>Shift</th>
                  <th style={{ padding: '16px 20px' }}>Designation / Role</th>
                  <th style={{ padding: '16px 20px', width: '120px' }}>Status</th>
                  <th style={{ padding: '16px 20px', width: '120px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      opacity: emp.is_active ? 1 : 0.5
                    }}
                  >
                    <td style={{ padding: '12px 20px', fontWeight: 700, fontSize: '0.9rem' }}>{emp.id}</td>
                    <td style={{ padding: '12px 20px', fontSize: '0.95rem', fontWeight: 500 }}>{emp.name}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span className="badge badge-info">{getShiftLabel(emp.shift)}</span>
                    </td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{emp.role}</td>
                    <td style={{ padding: '12px 20px' }}>
                      {emp.is_active ? (
                        <span className="badge badge-present">Active</span>
                      ) : (
                        <span className="badge badge-absent" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-absent)' }}>Resigned</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-icon"
                          style={{ width: '28px', height: '28px', color: emp.is_active ? 'var(--color-absent)' : '#10b981' }}
                          onClick={() => toggleResignStatus(emp)}
                          title={emp.is_active ? "Mark as Resigned" : "Reactivate Operator"}
                        >
                          {emp.is_active ? <UserMinus size={12} /> : <UserCheck size={12} />}
                        </button>
                        <button
                          className="btn btn-secondary btn-icon"
                          style={{ width: '28px', height: '28px' }}
                          onClick={() => openEditModal(emp)}
                          title="Edit Details"
                        >
                          <Edit2 size={12} />
                        </button>
                        {isAdmin && (
                          <button
                            className="btn btn-secondary btn-icon"
                            style={{ width: '28px', height: '28px', color: 'var(--color-absent)' }}
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            title="Delete Employee"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {filteredEmployees.length > itemsPerPage && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(filteredEmployees.length, currentPage * itemsPerPage)}</strong> of <strong>{filteredEmployees.length}</strong> matching operators
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '6px 12px', height: '32px', fontSize: '0.8rem' }}
                  >
                    Previous
                  </button>
                  
                  {getPageNumbers().map((pageNum, idx) => {
                    if (pageNum === '...') {
                      return <span key={`ellipsis_${idx}`} style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0 4px' }}>...</span>;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        className={`btn ${currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setCurrentPage(pageNum as number)}
                        style={{
                          width: '32px',
                          height: '32px',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: currentPage === pageNum ? 700 : 500
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: '6px 12px', height: '32px', fontSize: '0.8rem' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Database Maintenance Panel (Only in Demo/LocalStorage Mode) */}
      {!isSupabaseConfigured && (
        <div className="glass-card" style={{ marginTop: '32px', borderLeft: '4px solid #f59e0b', background: 'var(--bg-secondary)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', marginBottom: '12px' }}>
            <ShieldAlert size={20} />
            <span>Database Cockpit Maintenance (Local Demo Mode Only)</span>
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Since Supabase is not connected, data is stored locally in your browser. Use these buttons to backup, restore, or wipe changes.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={downloadDatabaseBackup}>
              <Download size={14} />
              <span>Backup Database JSON</span>
            </button>
            <label className="btn btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              <Upload size={14} />
              <span>Restore Database JSON</span>
              <input type="file" accept=".json" onChange={handleDatabaseRestore} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-secondary" style={{ color: 'var(--color-absent)' }} onClick={handleResetDatabase}>
              <RefreshCw size={14} />
              <span>Reset to Defaults</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL: SHIFT TRANSFER DESK */}
      {isTransferOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {isSupervisor ? `Bring Operator to ${getShiftLabel(supervisorShift)}` : 'Shift Transfer Desk'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setIsTransferOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleTransferSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="transfer-emp-select">Select Operator to Transfer</label>
                  <select
                    id="transfer-emp-select"
                    className="form-select"
                    value={transferEmpId}
                    onChange={(e) => setTransferEmpId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Operator --</option>
                    {transferableEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.id}) - Current: {getShiftLabel(emp.shift)}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Target Shift Assignment</label>
                  <select
                    className="form-select"
                    value={transferTargetShift}
                    onChange={(e) => setTransferTargetShift(e.target.value as any)}
                    disabled={isSupervisor}
                  >
                    <option value="A">{getShiftLabel('A')}</option>
                    <option value="B">{getShiftLabel('B')}</option>
                    <option value="C">{getShiftLabel('C')}</option>
                    <option value="General">{getShiftLabel('General')}</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsTransferOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={transferLoading}>
                  {transferLoading ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD EMPLOYEE */}
      {isAddOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Register Employee</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setIsAddOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-emp-id">Employee ID (Must be unique)</label>
                  <input
                    id="new-emp-id"
                    type="text"
                    className="form-input"
                    placeholder="EMP001"
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-emp-name">Full Name</label>
                  <input
                    id="new-emp-name"
                    type="text"
                    className="form-input"
                    placeholder="John Doe"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-emp-shift">Shift Assignment</label>
                  <select
                    id="new-emp-shift"
                    className="form-select"
                    value={empShift}
                    onChange={(e) => setEmpShift(e.target.value as any)}
                    disabled={isSupervisor}
                  >
                    <option value="A">Shift A</option>
                    <option value="B">Shift B</option>
                    <option value="C">Shift C</option>
                    <option value="General">General Shift</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-emp-role">Designation / Role</label>
                  <input
                    id="new-emp-role"
                    type="text"
                    className="form-input"
                    placeholder="Operator"
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT EMPLOYEE */}
      {isEditOpen && selectedEmp && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Edit Employee: {selectedEmp.id}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setIsEditOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-emp-name">Full Name</label>
                  <input
                    id="edit-emp-name"
                    type="text"
                    className="form-input"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-emp-shift">Shift Assignment</label>
                  <select
                    id="edit-emp-shift"
                    className="form-select"
                    value={empShift}
                    onChange={(e) => setEmpShift(e.target.value as any)}
                    disabled={isSupervisor}
                  >
                    <option value="A">Shift A</option>
                    <option value="B">Shift B</option>
                    <option value="C">Shift C</option>
                    <option value="General">General Shift</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-emp-role">Designation / Role</label>
                  <input
                    id="edit-emp-role"
                    type="text"
                    className="form-input"
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    id="edit-active-status"
                    checked={empActive}
                    onChange={(e) => setEmpActive(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="edit-active-status" style={{ fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600 }}>
                    Active Status (Uncheck to mark as RESIGNED)
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CSV BULK IMPORT */}
      {isImportOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Bulk Import Employees</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setIsImportOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {/* Import Type Switcher */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    backgroundColor: importType === 'excel' ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                    color: importType === 'excel' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    borderColor: importType === 'excel' ? 'var(--accent-color)' : 'var(--border-color)',
                  }}
                  onClick={() => {
                    setImportType('excel');
                    setImportError(null);
                    setImportSuccess(null);
                    setImportPreview([]);
                  }}
                >
                  <FileSpreadsheet size={16} />
                  <span>Upload Excel File</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    backgroundColor: importType === 'csv' ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                    color: importType === 'csv' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    borderColor: importType === 'csv' ? 'var(--accent-color)' : 'var(--border-color)',
                  }}
                  onClick={() => {
                    setImportType('csv');
                    setImportError(null);
                    setImportSuccess(null);
                    setImportPreview([]);
                  }}
                >
                  <Upload size={16} />
                  <span>Paste CSV Text</span>
                </button>
              </div>

              {importType === 'excel' ? (
                <div style={{
                  backgroundColor: 'var(--bg-primary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  border: '1px solid var(--border-color)',
                  marginBottom: '16px',
                  lineHeight: '1.6'
                }}>
                  <strong>Excel Import Guidelines:</strong>
                  <ul style={{ paddingLeft: '16px', marginTop: '6px' }}>
                    <li>Create an Excel file (<code>.xlsx</code> or <code>.xls</code>).</li>
                    <li>Add separate tabs/sheets for each shift (e.g. name tabs: <code>Shift A</code>, <code>Shift B</code>, <code>Shift C</code>, <code>General</code>).</li>
                    <li>In each tab:
                      <ul style={{ paddingLeft: '14px', marginTop: '4px' }}>
                        <li><strong>Column A (First Column):</strong> Employee ID (e.g. <code>EMP001</code>)</li>
                        <li><strong>Column B (Second Column):</strong> Employee Name</li>
                      </ul>
                    </li>
                    <li>Row 1 will be skipped automatically as the header row.</li>
                  </ul>
                </div>
              ) : (
                <div style={{
                  backgroundColor: 'var(--bg-primary)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  border: '1px solid var(--border-color)',
                  marginBottom: '16px',
                  lineHeight: '1.5'
                }}>
                  <strong>CSV Format Guidelines:</strong>
                  <p>Paste lines formatted as: <code>EmployeeID, Name, Shift, Role</code></p>
                  <p>Valid Shift values: <code>A</code>, <code>B</code>, <code>C</code>, or <code>General</code></p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span>Example row: <code>EMP092, James Smith, B, Operator</code></span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                      onClick={() => setCsvText("EMP-A-0001, Rajesh Sharma, A, Operator\nEMP-B-0002, Priya Sen, B, Line Inspector\nEMP-C-0003, Robert Williams, C, Supervisor\nEMP-G-0004, John Doe, General, floor assistant")}
                    >
                      Load Sample Text
                    </button>
                  </div>
                </div>
              )}

              {importError && (
                <div style={{ backgroundColor: 'var(--bg-absent)', color: 'var(--color-absent)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div style={{ backgroundColor: 'var(--bg-present)', color: 'var(--color-present)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={16} />
                  <span style={{ whiteSpace: 'pre-line' }}>{importSuccess}</span>
                </div>
              )}

              {importType === 'excel' ? (
                <div className="form-group">
                  <label className="form-label">Upload Employee Excel File:</label>
                  <div style={{
                    border: '2px dashed var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '32px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'var(--bg-secondary)',
                    transition: 'all var(--transition-fast)'
                  }}
                  onClick={() => document.getElementById('excel-import-file-input')?.click()}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <FileSpreadsheet size={36} style={{ color: 'var(--accent-color)', marginBottom: '12px' }} />
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '4px' }}>Click to select Excel spreadsheet</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Supports .xlsx and .xls file formats</p>
                    <input
                      id="excel-import-file-input"
                      type="file"
                      accept=".xlsx, .xls"
                      style={{ display: 'none' }}
                      onChange={handleExcelUpload}
                    />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="csv-input-area">Paste Employee Data (one per line):</label>
                  <textarea
                    id="csv-input-area"
                    className="form-input"
                    rows={8}
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    placeholder="EMP092, James Smith, B, Operator"
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                  />
                </div>
              )}

              {importPreview.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Import Preview ({importPreview.length} Employees):</h4>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead style={{ background: 'var(--bg-tertiary)', position: 'sticky', top: 0 }}>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '8px 12px' }}>ID</th>
                          <th style={{ padding: '8px 12px' }}>Name</th>
                          <th style={{ padding: '8px 12px' }}>Shift</th>
                          <th style={{ padding: '8px 12px' }}>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((item, index) => (
                          <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '6px 12px', fontWeight: 700 }}>{item.id}</td>
                            <td style={{ padding: '6px 12px' }}>{item.name}</td>
                            <td style={{ padding: '6px 12px' }}>{item.shift}</td>
                            <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{item.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsImportOpen(false)}>Cancel</button>
              {importPreview.length > 0 ? (
                <button type="button" className="btn btn-primary" onClick={commitCSVImport}>
                  Commit Import
                </button>
              ) : importType === 'csv' ? (
                <button type="button" className="btn btn-primary" onClick={parseCSVText}>
                  Parse Text
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SUPERVISOR */}
      {editingSupervisor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Configure Shift {editingSupervisor.assigned_shift} Supervisor</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditingSupervisor(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSupervisorSubmit}>
              <div className="modal-body">
                <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  You are configuring the account with fixed login: <strong>{editingSupervisor.username}</strong>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-supervisor-name">Supervisor Name</label>
                  <input
                    id="edit-supervisor-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Rajesh Kumar"
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-supervisor-password">Account Password</label>
                  <input
                    id="edit-supervisor-password"
                    type="text"
                    className="form-input"
                    placeholder="Password"
                    value={supPassword}
                    onChange={(e) => setSupPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingSupervisor(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
