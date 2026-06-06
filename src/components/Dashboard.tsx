import React, { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Percent, Calendar, RefreshCw, Menu } from 'lucide-react';
import { dbService } from '../lib/supabase';
import type { Employee, AttendanceRecord } from '../lib/supabase';

interface DashboardProps {
  onNavigate: (view: string) => void;
  currentUser: any;
  supervisors?: any[];
  isActive?: boolean;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}

interface ShiftStat {
  total: number;
  present: number;
  absent: number;
  unmarked: number;
  rate: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, currentUser, supervisors, isActive, sidebarHidden, onToggleSidebar }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; rate: number }[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getShiftLabel = (shiftCode: string) => {
    const sup = (supervisors || []).find(s => s.assigned_shift === shiftCode);
    const name = sup ? sup.supervisor_name : '';
    return `Shift ${shiftCode}${name ? ` (${name})` : ''}`;
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);
    try {
      // 1. Fetch active employees
      const empList = await dbService.getEmployees();
      const activeEmps = empList.filter(e => e.is_active);
      setEmployees(activeEmps);

      // 2. Fetch today's attendance
      const todayLogs = await dbService.getAttendanceByDate(todayStr);
      setTodayAttendance(todayLogs);

      // 3. Fetch past 7 days of attendance
      const past7DaysData: { date: string; rate: number }[] = [];
      const today = new Date();
      
      for (let i = 7; i >= 1; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const logs = await dbService.getAttendanceByDate(dateStr);
        const activeIds = new Set(activeEmps.map(e => e.id));
        const relevantLogs = logs.filter(l => activeIds.has(l.employee_id));

        if (relevantLogs.length > 0) {
          const presentCount = relevantLogs.filter(l => l.status === 'P').length;
          const rate = Math.round((presentCount / relevantLogs.length) * 100);
          
          // Display short date format (e.g. "Jun 04")
          const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          past7DaysData.push({ date: label, rate });
        } else {
          // If no logs, set default or skip. Let's set 90% mock rate or 0 if pure demo. 
          // For nice visual representation, if it is local storage mock it will already be seeded.
          const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          past7DaysData.push({ date: label, rate: 0 });
        }
      }
      setTrendData(past7DaysData);

      // 4. Fetch admin notifications if admin
      if (currentUser.role === 'admin') {
        const notifs = await dbService.getAdminNotifications();
        setAdminNotifications(notifs.filter(n => !n.read));
      }

    } catch (err: any) {
      console.error(err);
      setError('Failed to load dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (isActive) {
      fetchDashboardData(true);
    }
  }, [isActive]);

  // Compute Overall Stats
  const totalCount = employees.length;
  const markedMap = new Map(todayAttendance.map(a => [a.employee_id, a.status]));
  
  const presentCount = employees.filter(e => markedMap.get(e.id) === 'P').length;
  const absentCount = employees.filter(e => markedMap.get(e.id) === 'A').length;
  const unmarkedCount = totalCount - (presentCount + absentCount);
  const overallRate = totalCount > 0 && (presentCount + absentCount) > 0
    ? Math.round((presentCount / (presentCount + absentCount)) * 100)
    : 0;

  // Compute Shift Stats
  const shifts: ('A' | 'B' | 'C' | 'General')[] = ['A', 'B', 'C', 'General'];
  const shiftStats: Record<string, ShiftStat> = {};

  shifts.forEach(shift => {
    const shiftEmps = employees.filter(e => e.shift === shift);
    const shiftTotal = shiftEmps.length;
    
    let shiftPresent = 0;
    let shiftAbsent = 0;
    let shiftUnmarked = 0;

    shiftEmps.forEach(emp => {
      const status = markedMap.get(emp.id);
      if (status === 'P') shiftPresent++;
      else if (status === 'A') shiftAbsent++;
      else shiftUnmarked++;
    });

    const shiftMarked = shiftPresent + shiftAbsent;
    const shiftRate = shiftTotal > 0 && shiftMarked > 0 
      ? Math.round((shiftPresent / shiftMarked) * 100) 
      : 0;

    shiftStats[shift] = {
      total: shiftTotal,
      present: shiftPresent,
      absent: shiftAbsent,
      unmarked: shiftUnmarked,
      rate: shiftRate
    };
  });

  // SVG Chart rendering helper calculations
  const chartHeight = 160;
  const chartWidth = 500;
  const padding = 30;
  const points = trendData.filter(d => d.rate > 0).map((d, index) => {
    const x = padding + (index * (chartWidth - padding * 2)) / (trendData.length - 1 || 1);
    // Invert Y coordinate since SVG (0,0) is top-left
    const y = chartHeight - padding - (d.rate * (chartHeight - padding * 2)) / 100;
    return { x, y, label: d.date, value: d.rate };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`
    : '';

  if (loading) {
    return (
      <div>
        {/* Header Skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <div className="skeleton" style={{ width: '220px', height: '32px', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ width: '320px', height: '16px', borderRadius: 'var(--radius-xs)' }}></div>
          </div>
          <div className="skeleton skeleton-btn" style={{ width: '120px' }}></div>
        </div>

        {/* KPI Row Skeleton */}
        <div className="grid-stats">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card skeleton" style={{ height: '96px' }}></div>
          ))}
        </div>

        {/* Charts & Actions Row Skeleton */}
        <div className="grid-charts">
          <div className="glass-card skeleton" style={{ height: '260px' }}></div>
          <div className="glass-card skeleton" style={{ height: '260px' }}></div>
        </div>

        {/* Shift Standings Skeleton */}
        <div className="skeleton" style={{ width: '240px', height: '24px', borderRadius: 'var(--radius-xs)', marginBottom: '20px' }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card skeleton" style={{ height: '130px' }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Dashboard Header */}
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
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.75px', marginBottom: '6px' }}>Dashboard</h1>
            <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={16} />
              <span>Attendance tracking for today: <strong>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
            </p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => fetchDashboardData()}>
          <RefreshCw size={16} />
          <span>Sync Data</span>
        </button>
      </div>

      {error && (
        <div className="glass-card" style={{ borderLeft: '4px solid var(--color-absent)', marginBottom: '24px', color: 'var(--color-absent)' }}>
          {error}
        </div>
      )}

      {/* Admin Notifications */}
      {currentUser.role === 'admin' && adminNotifications.length > 0 && (
        <div className="glass-card" style={{ borderLeft: '4px solid var(--color-absent)', marginBottom: '24px', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-absent)' }}>System Alerts ({adminNotifications.length})</h3>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              onClick={async () => {
                await dbService.markNotificationsRead();
                setAdminNotifications([]);
              }}
            >
              Dismiss All
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {adminNotifications.map(n => (
              <div key={n.id} style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginRight: '8px' }}>{new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                {n.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid-stats">
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-info)', color: 'var(--color-info)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
            <Users size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Roster</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{totalCount}</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Registered employees</span>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-present)', color: 'var(--color-present)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Present Today</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{presentCount}</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-present)', fontWeight: 600 }}>
              {totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0}% of roster
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-absent)', color: 'var(--color-absent)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
            <UserX size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Absent Today</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{absentCount}</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-absent)', fontWeight: 600 }}>
              {totalCount > 0 ? Math.round((absentCount / totalCount) * 100) : 0}% of roster
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent-color)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
            <Percent size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Attendance Rate</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{overallRate}%</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {unmarkedCount} employees left unmarked
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts & Actions Row */}
      <div className="grid-charts">
        {/* Trend Area */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>Weekly Floor Attendance Trend</h3>
          <div style={{ flex: 1, position: 'relative', minHeight: '200px' }}>
            {points.length > 0 ? (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="100%" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* Grid Lines */}
                {[0, 25, 50, 75, 100].map((gridVal) => {
                  const y = chartHeight - padding - (gridVal * (chartHeight - padding * 2)) / 100;
                  return (
                    <g key={gridVal}>
                      <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="var(--card-border)" strokeWidth="1" strokeDasharray="4 4" />
                      <text x={padding - 8} y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">{gridVal}%</text>
                    </g>
                  );
                })}

                {/* Area path */}
                <path d={areaPath} fill="url(#chartGlow)" />

                {/* Line path */}
                <path d={linePath} fill="none" stroke="var(--accent-color)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Dots & Labels */}
                {points.map((p, index) => (
                  <g key={index}>
                    <circle cx={p.x} cy={p.y} r="5" fill="var(--bg-secondary)" stroke="var(--accent-color)" strokeWidth="3" />
                    <text x={p.x} y={chartHeight - 8} fill="var(--text-secondary)" fontSize="9" textAnchor="middle" fontWeight="500">{p.label}</text>
                    <text x={p.x} y={p.y - 10} fill="var(--text-primary)" fontSize="10" fontWeight="700" textAnchor="middle">{p.value}%</text>
                  </g>
                ))}
              </svg>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No historical logs available yet. Complete attendance records to view trends.
              </div>
            )}
          </div>
        </div>

        {/* Quick Marking Shortcuts */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>Quick Entry Desk</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Mark or modify roster attendance for today's floor shifts.
          </p>

          {currentUser.role !== 'viewer' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              {shifts.map((shift) => {
                const isAssigned = currentUser.role === 'admin' || currentUser.assigned_shift === 'All' || currentUser.assigned_shift === shift;
                const stats = shiftStats[shift];

                return (
                  <div
                    key={shift}
                    style={{
                      border: '1px solid var(--card-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: isAssigned ? 1 : 0.6,
                      background: 'var(--bg-primary)'
                    }}
                  >
                    <div>
                      <h4 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{getShiftLabel(shift)}</h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {stats.present} Present / {stats.absent} Absent
                      </span>
                    </div>
                    {isAssigned ? (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          localStorage.setItem('temp_selected_shift', shift);
                          onNavigate('attendance');
                        }}
                      >
                        {stats.unmarked > 0 ? `Mark (${stats.unmarked})` : 'Update'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Locked</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center', alignItems: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                Viewer account role. Access the Report Panel to compile Excel sheets.
              </p>
              <button className="btn btn-primary" onClick={() => onNavigate('reports')}>
                Go to Reports
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Shift Overview Grid */}
      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px' }}>Shift-wise Floor Standing</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {shifts.map((shift) => {
          const stats = shiftStats[shift];
          return (
            <div key={shift} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{getShiftLabel(shift)}</h4>
                <span className={`badge ${stats.unmarked === 0 ? 'badge-present' : 'badge-unmarked'}`}>
                  {stats.unmarked === 0 ? 'Fully Marked' : `${stats.unmarked} Open`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* Simple Circular Progress Bar in SVG */}
                <div style={{ width: '64px', height: '64px', position: 'relative' }}>
                  <svg width="64" height="64" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="var(--bg-tertiary)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke={stats.rate > 85 ? 'var(--color-present)' : stats.rate > 0 ? 'var(--color-absent)' : 'var(--color-unmarked)'}
                      strokeWidth="3"
                      strokeDasharray={`${stats.rate}, 100`}
                      strokeLinecap="round"
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '0.8rem',
                    fontWeight: 800
                  }}>
                    {stats.rate}%
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Shift Headcount: <strong>{stats.total}</strong></p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-present)' }}>Present: <strong>{stats.present}</strong></p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-absent)' }}>Absent: <strong>{stats.absent}</strong></p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* CSS Spin Keyframes */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
