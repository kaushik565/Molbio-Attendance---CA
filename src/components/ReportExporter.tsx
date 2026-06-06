import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, FileSpreadsheet, Search, ChevronDown, ChevronUp, Menu, X } from 'lucide-react';
import { dbService } from '../lib/supabase';
import type { Employee, AttendanceRecord } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface SummaryRow {
  id: string;
  name: string;
  shift: 'A' | 'B' | 'C' | 'General';
  role: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  approvedLeaveDays: number;
  unapprovedLeaveDays: number;
  approvedShiftChangeDays: number;
  unapprovedShiftChangeDays: number;
  unmarkedDays: number;
  rate: number;
}

interface ReportExporterProps {
  supervisors?: any[];
  isActive?: boolean;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}

export const ReportExporter: React.FC<ReportExporterProps> = ({ supervisors = [], isActive, sidebarHidden, onToggleSidebar }) => {
  const getShiftLabel = (shiftCode: string) => {
    const sup = (supervisors || []).find(s => s.assigned_shift === shiftCode);
    const name = sup ? sup.supervisor_name : '';
    if (shiftCode === 'All') return 'All Shifts';
    return `Shift ${shiftCode}${name ? ` (${name})` : ''}`;
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [employeeHistory, setEmployeeHistory] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadEmployeeHistory = async (emp: Employee) => {
    setHistoryEmployee(emp);
    setHistoryLoading(true);
    try {
      const data = await dbService.getAttendanceByEmployee(emp.id);
      setEmployeeHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };
  
  // Date range state
  const defaultFromDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default last 30 days
    return d.toISOString().split('T')[0];
  };
  const [fromDate, setFromDate] = useState<string>(defaultFromDate());
  const [toDate, setToDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<string>('All');

  // Sorting State
  const [sortField, setSortField] = useState<keyof SummaryRow>('id');
  const [sortAsc, setSortAsc] = useState(true);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, selectedShift, searchQuery]);

  // Load datasets
  const generateReport = async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const empList = await dbService.getEmployees();
      const attList = await dbService.getAttendanceRange(fromDate, toDate);
      
      setEmployees(empList);
      setAttendance(attList);
    } catch (err) {
      console.error(err);
      alert('Failed to compile report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateReport();
  }, [fromDate, toDate]);

  useEffect(() => {
    if (isActive) {
      generateReport(true);
    }
  }, [isActive]);

  // Aggregate stats per employee
  const reportRows = useMemo(() => {
    const markedMap: Record<string, Record<string, { status: string, remarks?: string }>> = {}; // employeeId -> date -> status/remarks
    attendance.forEach(att => {
      if (!markedMap[att.employee_id]) markedMap[att.employee_id] = {};
      markedMap[att.employee_id][att.date] = { status: att.status, remarks: (att as any).remarks };
    });

    // Get list of unique dates marked in range
    const uniqueDates = Array.from(new Set(attendance.map(a => a.date))).sort();
    const totalDatesCount = uniqueDates.length || 1;

    const rows: SummaryRow[] = employees
      .filter(emp => selectedShift === 'All' || emp.shift === selectedShift)
      .map(emp => {
        const empDates = markedMap[emp.id] || {};
        let present = 0;
        let absent = 0;
        let approvedLeave = 0;
        let unapprovedLeave = 0;
        let approvedShiftChange = 0;
        let unapprovedShiftChange = 0;
        let unmarked = 0;

        uniqueDates.forEach(date => {
          const record = empDates[date];
          if (!record) {
            unmarked++;
          } else {
            if (record.status === 'P') {
              present++;
              if (record.remarks?.startsWith('Approved Shift Change')) approvedShiftChange++;
              if (record.remarks?.startsWith('Unapproved Shift Change')) unapprovedShiftChange++;
            } else if (record.status === 'A') {
              absent++;
              if (record.remarks === 'Approved Leave') approvedLeave++;
              if (record.remarks === 'Unapproved Leave') unapprovedLeave++;
            }
          }
        });

        // "Present" rate calculation:
        // Out of all marked days (present + absent), what is their positive rate?
        // Let's say positive days = present + approved leave
        const markedCount = present + absent;
        const rate = markedCount > 0 ? Math.round(((present + approvedLeave) / markedCount) * 100) : 0;

        return {
          id: emp.id,
          name: emp.name,
          shift: emp.shift,
          role: emp.role,
          totalDays: totalDatesCount,
          presentDays: present,
          absentDays: absent,
          approvedLeaveDays: approvedLeave,
          unapprovedLeaveDays: unapprovedLeave,
          approvedShiftChangeDays: approvedShiftChange,
          unapprovedShiftChangeDays: unapprovedShiftChange,
          unmarkedDays: unmarked,
          rate
        };
      });

    return rows;
  }, [employees, attendance, selectedShift]);

  // Sort and Filter Rows
  const sortedAndFilteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    const filtered = reportRows.filter(row => 
      row.name.toLowerCase().includes(query) || row.id.toLowerCase().includes(query)
    );

    return filtered.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [reportRows, searchQuery, sortField, sortAsc]);

  // Paginated Rows for Preview
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAndFilteredRows.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAndFilteredRows, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedAndFilteredRows.length / itemsPerPage);
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

  useEffect(() => {
    if (sortedAndFilteredRows.length === 1) {
      const matchId = sortedAndFilteredRows[0].id;
      const singleMatch = employees.find(e => e.id === matchId);
      if (singleMatch && (!historyEmployee || historyEmployee.id !== singleMatch.id)) {
        loadEmployeeHistory(singleMatch);
      }
    }
  }, [sortedAndFilteredRows, employees]);

  const toggleSort = (field: keyof SummaryRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ field }: { field: keyof SummaryRow }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  // Compile and Download Excel Report using SheetJS
  const handleExportExcel = async () => {
    if (reportRows.length === 0) {
      alert('No data available to export.');
      return;
    }

    setExportLoading(true);

    try {
      const wb = XLSX.utils.book_new();

      // --- SHEET 1: SUMMARY SUMMARY STATS ---
      const summaryHeader = [
        ['PRODUCTION FLOOR ATTENDANCE ROSTER REPORT'],
        [`Date Range: ${fromDate} to ${toDate}`],
        [`Filtered Shift: ${selectedShift === 'All' ? 'All Shifts' : getShiftLabel(selectedShift)}`],
        [], // empty spacer row
        ['Employee ID', 'Name', 'Shift', 'Role', 'Total Registry Days', 'Present', 'Absent', 'Approved Leave', 'Unapproved Leave', 'Approved Shift Change', 'Unapproved Shift Change', 'Unmarked', 'Attendance Rate %']
      ];

      const summaryBody = reportRows.map(row => [
        row.id,
        row.name,
        getShiftLabel(row.shift),
        row.role,
        row.totalDays,
        row.presentDays,
        row.absentDays,
        row.approvedLeaveDays,
        row.unapprovedLeaveDays,
        row.approvedShiftChangeDays,
        row.unapprovedShiftChangeDays,
        row.unmarkedDays,
        `${row.rate}%`
      ]);

      // Calculate Averages for Summary Footer
      const totalPresent = reportRows.reduce((acc, r) => acc + r.presentDays, 0);
      const totalAbsent = reportRows.reduce((acc, r) => acc + r.absentDays, 0);
      const totalAppLeave = reportRows.reduce((acc, r) => acc + r.approvedLeaveDays, 0);
      const totalUnappLeave = reportRows.reduce((acc, r) => acc + r.unapprovedLeaveDays, 0);
      const totalAppSC = reportRows.reduce((acc, r) => acc + r.approvedShiftChangeDays, 0);
      const totalUnappSC = reportRows.reduce((acc, r) => acc + r.unapprovedShiftChangeDays, 0);
      const totalUnmarked = reportRows.reduce((acc, r) => acc + r.unmarkedDays, 0);
      const totalMarked = totalPresent + totalAbsent;
      const averageRate = totalMarked > 0 ? Math.round(((totalPresent + totalAppLeave) / totalMarked) * 100) : 0;

      const summaryFooter = [
        [], // empty
        ['TOTAL AVERAGE SUMMARY', '', '', '', '', totalPresent, totalAbsent, totalAppLeave, totalUnappLeave, totalAppSC, totalUnappSC, totalUnmarked, `${averageRate}%`]
      ];

      const wsSummaryData = [...summaryHeader, ...summaryBody, ...summaryFooter];
      const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData);

      // Auto Widths Calculation for Sheet 1
      const summaryCols = [
        { wch: 15 }, // ID
        { wch: 25 }, // Name
        { wch: 12 }, // Shift
        { wch: 20 }, // Role
        { wch: 20 }, // Total Registry Days
        { wch: 15 }, // Present
        { wch: 20 }, // Absent
        { wch: 20 }, // Leave
        { wch: 25 }, // USC
        { wch: 15 }, // Unmarked
        { wch: 20 }  // Rate
      ];
      wsSummary['!cols'] = summaryCols;

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Attendance Summary');

      // --- SHEET 2: REGISTRY MATRIX (GRID OVERVIEW) ---
      // Get all dates in range sorted ascending
      const dates = Array.from(new Set(attendance.map(a => a.date))).sort();
      
      const matrixHeaders = ['Employee ID', 'Name', 'Shift', 'Role', ...dates];
      const matrixHeaderRow = [matrixHeaders];

      const matrixMarkedMap: Record<string, Record<string, string>> = {};
      attendance.forEach(att => {
        if (!matrixMarkedMap[att.employee_id]) matrixMarkedMap[att.employee_id] = {};
        const remarks = (att as any).remarks;
        matrixMarkedMap[att.employee_id][att.date] = remarks ? `${att.status} (${remarks})` : att.status;
      });

      const matrixBody = reportRows.map(row => {
        const empDates = matrixMarkedMap[row.id] || {};
        const dateStatuses = dates.map(d => empDates[d] || '-');
        return [
          row.id,
          row.name,
          getShiftLabel(row.shift),
          row.role,
          ...dateStatuses
        ];
      });

      const wsMatrixData = [
        ['PRODUCTION FLOOR ATTENDANCE MATRIX REGISTER'],
        [`Date Range: ${fromDate} to ${toDate}`],
        [], // space
        ...matrixHeaderRow,
        ...matrixBody
      ];

      const wsMatrix = XLSX.utils.aoa_to_sheet(wsMatrixData);

      // Widths for Matrix Tab
      const matrixCols = [
        { wch: 15 }, // ID
        { wch: 25 }, // Name
        { wch: 12 }, // Shift
        { wch: 20 }, // Role
        ...dates.map(() => ({ wch: 12 })) // date columns
      ];
      wsMatrix['!cols'] = matrixCols;

      XLSX.utils.book_append_sheet(wb, wsMatrix, 'Daily Registry Grid');

      // --- SHEET 3: APPROVED LEAVES ---
      const appLeavesData = [
        ['APPROVED LEAVES LIST'],
        [`Date Range: ${fromDate} to ${toDate}`],
        [],
        ['Date', 'Employee ID', 'Name', 'Shift', 'Role']
      ];
      // --- SHEET 4: UNAPPROVED LEAVES ---
      const unappLeavesData = [
        ['UNAPPROVED LEAVES LIST (ABSENCES)'],
        [`Date Range: ${fromDate} to ${toDate}`],
        [],
        ['Date', 'Employee ID', 'Name', 'Shift', 'Role']
      ];
      // --- SHEET 5: APPROVED SHIFT CHANGES ---
      const appSCData = [
        ['APPROVED SHIFT CHANGES LIST'],
        [`Date Range: ${fromDate} to ${toDate}`],
        [],
        ['Date', 'Employee ID', 'Name', 'Expected Shift', 'Role']
      ];
      // --- SHEET 6: UNAPPROVED SHIFT CHANGES ---
      const unappSCData = [
        ['UNAPPROVED SHIFT CHANGES LIST'],
        [`Date Range: ${fromDate} to ${toDate}`],
        [],
        ['Date', 'Employee ID', 'Name', 'Expected Shift', 'Role']
      ];

      attendance.forEach(att => {
        const remarks = (att as any).remarks;
        if (remarks) {
          const emp = employees.find(e => e.id === att.employee_id);
          if (emp && (selectedShift === 'All' || emp.shift === selectedShift)) {
            const rowData = [att.date, emp.id, emp.name, emp.shift, emp.role];
            if (remarks === 'Approved Leave') appLeavesData.push(rowData);
            else if (remarks === 'Unapproved Leave') unappLeavesData.push(rowData);
            else if (remarks.startsWith('Approved Shift Change')) appSCData.push(rowData);
            else if (remarks.startsWith('Unapproved Shift Change')) unappSCData.push(rowData);
          }
        }
      });

      const colsArr = [{ wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 20 }];

      const wsAppLeaves = XLSX.utils.aoa_to_sheet(appLeavesData);
      wsAppLeaves['!cols'] = colsArr;
      XLSX.utils.book_append_sheet(wb, wsAppLeaves, 'Approved Leaves');

      const wsUnappLeaves = XLSX.utils.aoa_to_sheet(unappLeavesData);
      wsUnappLeaves['!cols'] = colsArr;
      XLSX.utils.book_append_sheet(wb, wsUnappLeaves, 'Unapproved Leaves');

      const wsAppSC = XLSX.utils.aoa_to_sheet(appSCData);
      wsAppSC['!cols'] = colsArr;
      XLSX.utils.book_append_sheet(wb, wsAppSC, 'Approved Shift Changes');

      const wsUnappSC = XLSX.utils.aoa_to_sheet(unappSCData);
      wsUnappSC['!cols'] = colsArr;
      XLSX.utils.book_append_sheet(wb, wsUnappSC, 'Unapproved Shift Changes');

      // Write Workbook to file
      XLSX.writeFile(wb, `Cartridge_Attendance_Report_${fromDate}_to_${toDate}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Failed to compile Excel spreadsheet.');
    } finally {
      setExportLoading(false);
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
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.75px', marginBottom: '6px' }}>Report Panel</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Compile data range statistics and download formatted spreadsheet summaries.
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleExportExcel}
          disabled={exportLoading || reportRows.length === 0}
          style={{ minWidth: '180px' }}
        >
          <FileSpreadsheet size={16} />
          <span>{exportLoading ? 'Compiling Excel...' : 'Export to Excel'}</span>
        </button>
      </div>

      {/* Date Range Selection Card */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--bg-secondary)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Calendar size={18} style={{ color: 'var(--accent-color)' }} />
          <span>Filter Report Boundary</span>
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="report-from-date">From Date</label>
            <input
              id="report-from-date"
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="report-to-date">To Date</label>
            <input
              id="report-to-date"
              type="date"
              className="form-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="report-shift-select">Shift</label>
            <select
              id="report-shift-select"
              className="form-select"
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
            >
              <option value="All">All Shifts</option>
              <option value="A">{getShiftLabel('A')}</option>
              <option value="B">{getShiftLabel('B')}</option>
              <option value="C">{getShiftLabel('C')}</option>
              <option value="General">{getShiftLabel('General')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Roster Live Preview List & History Panel */}
      <div className="grid-charts" style={{ marginBottom: '24px' }}>
        {/* Left Column: Preview Grid List */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Report Summary Preview</h3>
            
            <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
              <Search size={16} style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search ID or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '36px', height: '36px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '24px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div className="skeleton" style={{ width: '100px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                  <div className="skeleton" style={{ width: '180px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                  <div className="skeleton" style={{ width: '80px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                  <div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
                  <div className="skeleton" style={{ width: '60px', height: '16px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto' }}></div>
                </div>
              ))}
            </div>
          ) : sortedAndFilteredRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              No records found for the selected boundaries.
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => toggleSort('id')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Employee ID</span>
                        <SortIcon field="id" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Name</span>
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => toggleSort('shift')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Shift</span>
                        <SortIcon field="shift" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => toggleSort('role')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Role</span>
                        <SortIcon field="role" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleSort('totalDays')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        <span>Total Days</span>
                        <SortIcon field="totalDays" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleSort('presentDays')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        <span>Present</span>
                        <SortIcon field="presentDays" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleSort('absentDays')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        <span>Absent</span>
                        <SortIcon field="absentDays" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleSort('unmarkedDays')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        <span>Unmarked</span>
                        <SortIcon field="unmarkedDays" />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('rate')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        <span>Rate %</span>
                        <SortIcon field="rate" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr 
                      key={row.id} 
                      onClick={() => {
                        const emp = employees.find(e => e.id === row.id);
                        if (emp) loadEmployeeHistory(emp);
                      }}
                      style={{ 
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: historyEmployee?.id === row.id ? 'var(--accent-glow)' : 'transparent',
                        transition: 'background var(--transition-fast)'
                      }}
                    >
                      <td style={{ padding: '10px 16px', fontWeight: 700 }}>{row.id}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{row.name}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span className="badge badge-info">{getShiftLabel(row.shift)}</span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{row.role}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600 }}>{row.totalDays}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--color-present)', fontWeight: 600 }}>{row.presentDays}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--color-absent)', fontWeight: 600 }}>{row.absentDays}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.unmarkedDays}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: row.rate > 85 ? 'var(--color-present)' : 'var(--text-primary)' }}>
                        {row.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {sortedAndFilteredRows.length > itemsPerPage && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: 'auto'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(sortedAndFilteredRows.length, currentPage * itemsPerPage)}</strong> of <strong>{sortedAndFilteredRows.length}</strong> matching records
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '4px 10px', height: '32px', fontSize: '0.75rem' }}
                  >
                    Previous
                  </button>
                  
                  {getPageNumbers().map((pageNum, idx) => {
                    if (pageNum === '...') {
                      return <span key={`ellipsis_${idx}`} style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '0 4px' }}>...</span>;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        className={`btn ${currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setCurrentPage(pageNum as number)}
                        style={{
                          width: '30px',
                          height: '30px',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
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
                    style={{ padding: '4px 10px', height: '32px', fontSize: '0.75rem' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

        {/* Right Column: Detailed Employee History */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-secondary)', borderLeft: historyEmployee ? '4px solid var(--accent-color)' : 'none' }}>
          {historyEmployee ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>History Profile</h3>
                  <span className="badge badge-info" style={{ marginTop: '4px', display: 'inline-block' }}>{historyEmployee.id}</span>
                </div>
                <button 
                  className="btn btn-ghost btn-icon" 
                  onClick={() => setHistoryEmployee(null)}
                  style={{ width: '24px', height: '24px' }}
                >
                  <X size={14} />
                </button>
              </div>
              
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{historyEmployee.name}</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {historyEmployee.role} • {getShiftLabel(historyEmployee.shift)}
                </p>
              </div>

              {historyLoading ? (
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton" style={{ height: '32px', borderRadius: 'var(--radius-xs)' }}></div>
                  <div className="skeleton" style={{ height: '32px', borderRadius: 'var(--radius-xs)' }}></div>
                  <div className="skeleton" style={{ height: '32px', borderRadius: 'var(--radius-xs)' }}></div>
                </div>
              ) : employeeHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  No historical logs found.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '420px', paddingRight: '4px' }}>
                  {employeeHistory.map((record, index) => (
                    <div 
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--card-border)',
                        borderRadius: 'var(--radius-xs)'
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {new Date(record.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })}
                        </span>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Marked by: {record.marked_by || 'system'}
                        </p>
                      </div>
                      <span className={`badge ${record.status === 'P' ? 'badge-present' : 'badge-absent'}`}>
                        {record.status === 'P' ? 'Present' : 'Absent'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-muted)', textAlign: 'center', gap: '12px' }}>
              <FileSpreadsheet size={40} style={{ opacity: 0.5 }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Historical Log Viewer</h4>
                <p style={{ fontSize: '0.8rem', marginTop: '6px', maxWidth: '240px', lineHeight: '1.4' }}>
                  Select an employee row in the table, or search by ID/Name to load their complete historical record.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
