import { useState, useEffect } from 'react';
import { LayoutDashboard, CheckSquare, Users, FileSpreadsheet, LogOut, Sun, Moon, Database, ChevronLeft } from 'lucide-react';
import { isSupabaseConfigured, dbService } from './lib/supabase';
import type { Profile } from './lib/supabase';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { AttendanceGrid } from './components/AttendanceGrid';
import { RosterManager } from './components/RosterManager';
import { ReportExporter } from './components/ReportExporter';

import './styles/variables.css';
import './styles/main.css';

function App() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(true);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true);

  // Sync offline records on load and listen to network transitions
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      try {
        const count = await dbService.syncOfflineRecords();
        if (count > 0) {
          alert(`Online: Successfully synchronized ${count} offline attendance register(s) with the database!`);
        }
      } catch (err) {
        console.error('Offline synchronization failed:', err);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof window !== 'undefined' && window.navigator.onLine) {
      dbService.syncOfflineRecords();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);


  // Load current supervisor directory
  const fetchSupervisors = async () => {
    try {
      const list = await dbService.getSupervisors();
      setSupervisors(list);
    } catch (err) {
      console.error('Failed to load shift supervisors:', err);
    }
  };

  // Initialize theme and current logged-in user
  useEffect(() => {
    // 1. Theme initialization
    const savedTheme = localStorage.getItem('cartridge_theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);

    // 2. User authentication verification
    const verifyUser = async () => {
      try {
        const user = await dbService.getCurrentUser();
        setCurrentUser(user);
        if (user) {
          await fetchSupervisors();
        }
      } catch (err) {
        console.error('Session verify failed:', err);
      } finally {
        setLoading(false);
      }
    };
    verifyUser();
  }, []);

  // Refresh supervisors when active user logins change
  useEffect(() => {
    if (currentUser) {
      fetchSupervisors();
    }
  }, [currentUser]);

  // Auto-collapse sidebar whenever the active view/tab changes to keep the screen clean and wide
  useEffect(() => {
    setSidebarHidden(true);
  }, [currentView]);

  // Handle Theme Toggle
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('cartridge_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await dbService.logout();
      setCurrentUser(null);
      setCurrentView('dashboard');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Get active shift label with supervisor name dynamically
  const getShiftLabel = (shiftCode: string) => {
    const sup = supervisors.find(s => s.assigned_shift === shiftCode);
    const name = sup ? sup.supervisor_name : '';
    if (shiftCode === 'All') return 'All Shifts';
    return `Shift ${shiftCode}${name ? ` (${name})` : ''}`;
  };

  // Loading state skeleton
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#090d16',
        color: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '8px' }}>Molbio Roster Desk</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading floor database...</p>
        </div>
      </div>
    );
  }

  // Auth Guard: Direct to login if session does not exist
  if (!currentUser) {
    return (
      <>
        {!isOnline && (
          <div className="demo-banner" style={{ backgroundColor: 'var(--color-absent)', color: 'white' }}>
            <Database size={16} />
            <span>Offline Mode: Attendance registers will be saved locally and synchronized once network is restored.</span>
          </div>
        )}
        {!isSupabaseConfigured && isOnline && (
          <div className="demo-banner">
            <Database size={16} />
            <span>Running in Local Demo Mode (Browser Storage). Connect Supabase database in <code>.env</code> file for cloud sync.</span>
          </div>
        )}
        <Login onLoginSuccess={(user) => setCurrentUser(user)} />
      </>
    );
  }

  const isAdmin = currentUser.role === 'admin';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="demo-banner" style={{ backgroundColor: 'var(--color-absent)', color: 'white' }}>
          <Database size={14} />
          <span>Offline Mode: Attendance registers will be saved locally and synchronized once network is restored.</span>
        </div>
      )}
      {/* Demo banner at the top of the entire screen */}
      {!isSupabaseConfigured && isOnline && (
        <div className="demo-banner">
          <Database size={14} />
          <span>Local Demo Mode (Offline). Credentials and attendance logs are saved in this browser.</span>
        </div>
      )}

      <div className="app-container">
        {/* SIDEBAR NAVIGATION */}
        <aside className={`sidebar ${sidebarHidden ? 'hidden' : ''}`}>
          <div className="logo-container" style={{ padding: '0px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '100%', gap: '4px' }}>
            <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'flex-end', minHeight: '28px' }}>
              <button
                onClick={() => setSidebarHidden(true)}
                className="sidebar-collapse-btn"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px'
                }}
                title="Collapse Sidebar"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
            <img 
              src="/logo.png" 
              alt="Logo" 
              style={{ 
                maxHeight: '72px', 
                maxWidth: '212px', 
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto 8px auto'
              }} 
            />
          </div>

          <nav className="nav-links">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            >
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </button>

            {currentUser.role !== 'viewer' && (
              <button
                onClick={() => setCurrentView('attendance')}
                className={`nav-item ${currentView === 'attendance' ? 'active' : ''}`}
              >
                <CheckSquare size={20} />
                <span>Attendance Grid</span>
              </button>
            )}

            {(isAdmin || currentUser.role === 'supervisor') && (
              <button
                onClick={() => setCurrentView('roster')}
                className={`nav-item ${currentView === 'roster' ? 'active' : ''}`}
              >
                <Users size={20} />
                <span>Roster Registry</span>
              </button>
            )}

            <button
              onClick={() => setCurrentView('reports')}
              className={`nav-item ${currentView === 'reports' ? 'active' : ''}`}
            >
              <FileSpreadsheet size={20} />
              <span>Report Panel</span>
            </button>
          </nav>

          {/* SIDEBAR FOOTER */}
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <p className="user-name" title={currentUser.username}>{currentUser.username}</p>
                <p className="user-role">
                  {currentUser.role}
                  {currentUser.assigned_shift !== 'All' ? ` • ${getShiftLabel(currentUser.assigned_shift)}` : ''}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={toggleTheme}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem', height: '36px' }}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <button
                onClick={handleLogout}
                className="btn btn-secondary"
                style={{ flex: 2, padding: '8px', fontSize: '0.8rem', height: '36px', color: 'var(--color-absent)' }}
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN BODY WINDOW */}
        <main className={`main-content ${sidebarHidden ? 'full-width' : ''}`}>
          <div style={{ display: currentView === 'dashboard' ? 'block' : 'none' }}>
            <Dashboard
              onNavigate={(view) => {
                if (view === 'roster' && !isAdmin && currentUser.role !== 'supervisor') return;
                if (view === 'attendance' && currentUser.role === 'viewer') return;
                setCurrentView(view);
              }}
              currentUser={currentUser}
              supervisors={supervisors}
              isActive={currentView === 'dashboard'}
              sidebarHidden={sidebarHidden}
              onToggleSidebar={() => setSidebarHidden(false)}
            />
          </div>

          {currentUser.role !== 'viewer' && (
            <div style={{ display: currentView === 'attendance' ? 'block' : 'none' }}>
              <AttendanceGrid 
                currentUser={currentUser} 
                supervisors={supervisors}
                isActive={currentView === 'attendance'}
                sidebarHidden={sidebarHidden}
                onToggleSidebar={() => setSidebarHidden(false)}
              />
            </div>
          )}

          {(isAdmin || currentUser.role === 'supervisor') && (
            <div style={{ display: currentView === 'roster' ? 'block' : 'none' }}>
              <RosterManager 
                supervisors={supervisors} 
                onSupervisorsUpdate={fetchSupervisors}
                isActive={currentView === 'roster'}
                sidebarHidden={sidebarHidden}
                onToggleSidebar={() => setSidebarHidden(false)}
                currentUser={currentUser}
              />
            </div>
          )}

          <div style={{ display: currentView === 'reports' ? 'block' : 'none' }}>
            <ReportExporter 
              supervisors={supervisors}
              isActive={currentView === 'reports'}
              sidebarHidden={sidebarHidden}
              onToggleSidebar={() => setSidebarHidden(false)}
            />
          </div>

          <footer style={{
            textAlign: 'center',
            padding: '24px 0 12px 0',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            fontWeight: 500,
            borderTop: '1px solid var(--card-border)',
            marginTop: '40px',
            letterSpacing: '0.5px'
          }}>
            Designed & Developed by QA Team Site -III
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
