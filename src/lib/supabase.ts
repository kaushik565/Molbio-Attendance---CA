import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase configuration is present
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project-id.supabase.co');

// Initialize Supabase Client (if credentials exist)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Types
export interface Profile {
  id: string; // 'admin', 'shift_a', 'shift_b', 'shift_c', 'shift_general'
  username: string; // Login Username (e.g. 'Shift 1')
  supervisor_name?: string; // Supervisor Name (e.g. 'Rajesh Patel')
  password?: string; // Add password field for editing
  role: 'admin' | 'supervisor' | 'viewer';
  assigned_shift: 'A' | 'B' | 'C' | 'General' | 'All';
}


export interface Employee {
  id: string;
  name: string;
  shift: 'A' | 'B' | 'C' | 'General';
  role: string;
  is_active: boolean;
  created_at?: string;
}

export interface AttendanceRecord {
  id?: number;
  employee_id: string;
  date: string;
  status: 'P' | 'A';
  remarks?: string; // e.g., 'Approved Leave', 'Approved Shift Change (to Shift X)'
  marked_by?: string;
  marked_at?: string;
}

export interface AppNotification {
  id: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// ----------------------------------------------------
// LOCAL STORAGE MOCK DB (For Demo/Offline-First)
// ----------------------------------------------------
const MOCK_STORAGE_KEYS = {
  EMPLOYEES: 'cartridge_roster_employees',
  ATTENDANCE: 'cartridge_roster_attendance',
  USERS: 'cartridge_roster_users_v2', // version update for schema shift
  CURRENT_USER: 'cartridge_roster_current_user_v2',
  NOTIFICATIONS: 'cartridge_roster_notifications',
};

// Seed initial mock employees if empty (680 members across shifts)
function seedMockEmployees(): Employee[] {
  const existing = localStorage.getItem(MOCK_STORAGE_KEYS.EMPLOYEES);
  if (existing) return JSON.parse(existing);

  const shifts: ('A' | 'B' | 'C' | 'General')[] = ['A', 'B', 'C', 'General'];
  const roles = [
    'Operator', 'Senior Operator', 'Technician', 'Senior Technician',
    'Line Inspector', 'Quality Control Inspector', 'Packer', 'Supervisor', 'Floor Assistant'
  ];
  const firstNames = [
    'Rajesh', 'Sanjay', 'Amit', 'Vijay', 'Rahul', 'Anil', 'Sunil', 'Karan', 'Deepak', 'Manish',
    'Kaushik', 'Vikram', 'Priya', 'Anjali', 'Kiran', 'Pooja', 'Ritu', 'Jyoti', 'Neha', 'Sunita',
    'Ramesh', 'Suresh', 'Naresh', 'Dinesh', 'Harish', 'Ganesh', 'Mahesh', 'Umesh', 'Rakesh', 'Lokesh',
    'James', 'Robert', 'John', 'Michael', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Charles'
  ];
  const lastNames = [
    'Sharma', 'Verma', 'Gupta', 'Patel', 'Kumar', 'Singh', 'Joshi', 'Mehra', 'Yadav', 'Reddy',
    'Nair', 'Pillai', 'Rao', 'Choudhary', 'Mishra', 'Pandey', 'Sen', 'Das', 'Roy', 'Banerjee',
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson'
  ];

  const employees: Employee[] = [];
  let empCounter = 1;

  shifts.forEach((shift) => {
    const count = 170;
    for (let i = 0; i < count; i++) {
      const empId = `EMP-${shift}-${String(empCounter).padStart(4, '0')}`;
      const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const role = roles[Math.floor(Math.random() * roles.length)];
      
      employees.push({
        id: empId,
        name: `${fName} ${lName}`,
        shift: shift,
        role: role,
        is_active: true,
      });
      empCounter++;
    }
  });

  localStorage.setItem(MOCK_STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
  return employees;
}

// Seed initial mock users for authentication
function seedMockUsers(): Profile[] {
  const existing = localStorage.getItem(MOCK_STORAGE_KEYS.USERS);
  if (existing) return JSON.parse(existing);

  const mockUsers: Profile[] = [
    {
      id: 'admin',
      username: 'admin',
      password: 'Molbio@qa',
      supervisor_name: 'Administrator',
      role: 'admin',
      assigned_shift: 'All',
    },
    {
      id: 'shift_a',
      username: 'Shift 1',
      password: 'Molbio1',
      supervisor_name: 'Supervisor Shift A',
      role: 'supervisor',
      assigned_shift: 'A',
    },
    {
      id: 'shift_b',
      username: 'Shift 2',
      password: 'Molbio2',
      supervisor_name: 'Supervisor Shift B',
      role: 'supervisor',
      assigned_shift: 'B',
    },
    {
      id: 'shift_c',
      username: 'Shift 3',
      password: 'Molbio3',
      supervisor_name: 'Supervisor Shift C',
      role: 'supervisor',
      assigned_shift: 'C',
    },
    {
      id: 'shift_general',
      username: 'Shift G',
      password: 'Molbio0',
      supervisor_name: 'Supervisor General',
      role: 'supervisor',
      assigned_shift: 'General',
    },
  ];

  localStorage.setItem(MOCK_STORAGE_KEYS.USERS, JSON.stringify(mockUsers));
  return mockUsers;
}

// Seed attendance with mock logs for the past 7 days to show graphs
function seedMockAttendance(employees: Employee[]) {
  const existing = localStorage.getItem(MOCK_STORAGE_KEYS.ATTENDANCE);
  if (existing) return;

  const logs: AttendanceRecord[] = [];
  const today = new Date();
  
  for (let d = 7; d > 0; d--) {
    const logDate = new Date();
    logDate.setDate(today.getDate() - d);
    const dateStr = logDate.toISOString().split('T')[0];

    employees.forEach((emp) => {
      const attendanceChance = Math.random();
      const status = attendanceChance > 0.08 ? ('P' as const) : ('A' as const);
      
      logs.push({
        employee_id: emp.id,
        date: dateStr,
        status: status,
        marked_by: 'admin',
        marked_at: new Date(logDate.getTime() + 28800000).toISOString(),
      });
    });
  }

  localStorage.setItem(MOCK_STORAGE_KEYS.ATTENDANCE, JSON.stringify(logs));
}

// Execute seeds on load
const mockEmployees = seedMockEmployees();
seedMockUsers();
seedMockAttendance(mockEmployees);

// ----------------------------------------------------
// DATABASE SERVICES (Routing Supabase vs Local Mock)
// ----------------------------------------------------

export const dbService = {
  // --- AUTH SERVICES ---
  async getCurrentUser(): Promise<Profile | null> {
    const userJSON = localStorage.getItem(MOCK_STORAGE_KEYS.CURRENT_USER);
    if (!userJSON) return null;
    const localUser = JSON.parse(userJSON) as Profile;

    if (isSupabaseConfigured && supabase) {
      // Re-verify against database in case admin modified credentials
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', localUser.id)
        .single();
      if (error || !data) {
        localStorage.removeItem(MOCK_STORAGE_KEYS.CURRENT_USER);
        return null;
      }
      return data as Profile;
    }
    return localUser;
  },

  async login(usernameInput: string, passwordInput: string): Promise<Profile> {
    if (isSupabaseConfigured && supabase) {
      let { data: profiles, error } = await supabase
        .from('profiles')
        .select('*');

      if (error) {
        throw new Error(`Database error: ${error.message} (${error.code})`);
      }

      // Auto-seed if database profiles table is empty
      if (!profiles || profiles.length === 0) {
        const defaultProfiles: Profile[] = [
          {
            id: 'admin',
            username: 'admin',
            password: 'Molbio@qa',
            supervisor_name: 'Administrator',
            role: 'admin',
            assigned_shift: 'All',
          },
          {
            id: 'shift_a',
            username: 'Shift 1',
            password: 'Molbio1',
            supervisor_name: 'Supervisor Shift A',
            role: 'supervisor',
            assigned_shift: 'A',
          },
          {
            id: 'shift_b',
            username: 'Shift 2',
            password: 'Molbio2',
            supervisor_name: 'Supervisor Shift B',
            role: 'supervisor',
            assigned_shift: 'B',
          },
          {
            id: 'shift_c',
            username: 'Shift 3',
            password: 'Molbio3',
            supervisor_name: 'Supervisor Shift C',
            role: 'supervisor',
            assigned_shift: 'C',
          },
          {
            id: 'shift_general',
            username: 'Shift G',
            password: 'Molbio0',
            supervisor_name: 'Supervisor General',
            role: 'supervisor',
            assigned_shift: 'General',
          },
        ];
        
        const { error: seedError } = await supabase
          .from('profiles')
          .insert(defaultProfiles);
          
        if (seedError) {
          throw new Error(`Auto-seeding database profiles failed: ${seedError.message}`);
        }
        profiles = defaultProfiles;
      }

      const matched = profiles.find(
        p => (p.username.toLowerCase() === usernameInput.toLowerCase() || 
             (p.supervisor_name && p.supervisor_name.toLowerCase() === usernameInput.toLowerCase())) && 
             p.password === passwordInput
      );

      if (!matched) {
        throw new Error('Invalid username or password.');
      }

      localStorage.setItem(MOCK_STORAGE_KEYS.CURRENT_USER, JSON.stringify(matched));
      return matched as Profile;
    } else {
      // Mock Client Login
      const users = seedMockUsers();
      const matched = users.find(
        u => (u.username.toLowerCase() === usernameInput.toLowerCase() || 
             (u.supervisor_name && u.supervisor_name.toLowerCase() === usernameInput.toLowerCase())) && 
             u.password === passwordInput
      );
      if (!matched) throw new Error('Invalid username or password.');

      localStorage.setItem(MOCK_STORAGE_KEYS.CURRENT_USER, JSON.stringify(matched));
      return matched;
    }
  },

  async logout(): Promise<void> {
    localStorage.removeItem(MOCK_STORAGE_KEYS.CURRENT_USER);
  },

  // --- SUPERVISOR MANAGEMENT SERVICES ---
  async getSupervisors(): Promise<Profile[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        let { data: profiles, error } = await supabase
          .from('profiles')
          .select('*')
          .order('id', { ascending: true });
          
        if (error) throw error;

        // Auto-seed if database profiles table is empty
        if (!profiles || profiles.length === 0) {
          const defaultProfiles: Profile[] = [
            {
              id: 'admin',
              username: 'admin',
              password: 'Molbio@qa',
              supervisor_name: 'Administrator',
              role: 'admin',
              assigned_shift: 'All',
            },
            {
              id: 'shift_a',
              username: 'Shift 1',
              password: 'Molbio1',
              supervisor_name: 'Supervisor Shift A',
              role: 'supervisor',
              assigned_shift: 'A',
            },
            {
              id: 'shift_b',
              username: 'Shift 2',
              password: 'Molbio2',
              supervisor_name: 'Supervisor Shift B',
              role: 'supervisor',
              assigned_shift: 'B',
            },
            {
              id: 'shift_c',
              username: 'Shift 3',
              password: 'Molbio3',
              supervisor_name: 'Supervisor Shift C',
              role: 'supervisor',
              assigned_shift: 'C',
            },
            {
              id: 'shift_general',
              username: 'Shift G',
              password: 'Molbio0',
              supervisor_name: 'Supervisor General',
              role: 'supervisor',
              assigned_shift: 'General',
            },
          ];

          const { error: seedError } = await supabase
            .from('profiles')
            .insert(defaultProfiles);

          if (seedError) {
            console.error('Auto-seed failed:', seedError);
          } else {
            profiles = defaultProfiles;
          }
        }

        localStorage.setItem('cartridge_roster_cached_supervisors', JSON.stringify(profiles));
        return profiles as Profile[];
      } catch (err) {
        console.warn('Supabase getSupervisors failed, returning cached supervisors:', err);
        const cached = localStorage.getItem('cartridge_roster_cached_supervisors');
        if (cached) return JSON.parse(cached);
        return seedMockUsers();
      }
    } else {
      return seedMockUsers();
    }
  },

  async updateSupervisor(id: string, newSupervisorName: string, newPassword: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('profiles')
        .update({ supervisor_name: newSupervisorName, password: newPassword })
        .eq('id', id);
      if (error) throw error;
    } else {
      const users = seedMockUsers();
      const matched = users.find(u => u.id === id);
      if (matched) {
        matched.supervisor_name = newSupervisorName;
        matched.password = newPassword;
        localStorage.setItem(MOCK_STORAGE_KEYS.USERS, JSON.stringify(users));
      }
    }
  },

  // --- EMPLOYEE SERVICES ---
  async getEmployees(): Promise<Employee[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .order('id', { ascending: true });
        if (error) throw error;
        localStorage.setItem('cartridge_roster_cached_employees', JSON.stringify(data));
        return data as Employee[];
      } catch (err) {
        console.warn('Supabase getEmployees failed, loading cached data...', err);
        const cached = localStorage.getItem('cartridge_roster_cached_employees');
        return cached ? JSON.parse(cached) : [];
      }
    } else {
      const data = localStorage.getItem(MOCK_STORAGE_KEYS.EMPLOYEES);
      return data ? JSON.parse(data) : [];
    }
  },

  async addEmployee(emp: Omit<Employee, 'is_active'>): Promise<Employee> {
    const newEmp: Employee = {
      ...emp,
      is_active: true,
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('employees')
        .insert([newEmp])
        .select()
        .single();
      if (error) throw error;
      return data as Employee;
    } else {
      const employees = await this.getEmployees();
      if (employees.some(e => e.id === emp.id)) {
        throw new Error(`Employee with ID ${emp.id} already exists`);
      }
      employees.push(newEmp);
      localStorage.setItem(MOCK_STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      return newEmp;
    }
  },

  async updateEmployee(emp: Employee): Promise<Employee> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('employees')
        .update(emp)
        .eq('id', emp.id)
        .select()
        .single();
      if (error) throw error;
      return data as Employee;
    } else {
      const employees = await this.getEmployees();
      const idx = employees.findIndex(e => e.id === emp.id);
      if (idx === -1) throw new Error('Employee not found');
      employees[idx] = emp;
      localStorage.setItem(MOCK_STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      return emp;
    }
  },

  async deleteEmployee(id: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } else {
      let employees = await this.getEmployees();
      employees = employees.filter(e => e.id !== id);
      localStorage.setItem(MOCK_STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      
      let attendance = localStorage.getItem(MOCK_STORAGE_KEYS.ATTENDANCE);
      if (attendance) {
        const records: AttendanceRecord[] = JSON.parse(attendance);
        const filtered = records.filter(r => r.employee_id !== id);
        localStorage.setItem(MOCK_STORAGE_KEYS.ATTENDANCE, JSON.stringify(filtered));
      }
    }
  },

  async importEmployeesBulk(newEmployees: Employee[]): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const chunkSize = 100;
      for (let i = 0; i < newEmployees.length; i += chunkSize) {
        const chunk = newEmployees.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('employees')
          .upsert(chunk, { onConflict: 'id' });
        if (error) throw error;
      }
    } else {
      const employees = await this.getEmployees();
      const empMap = new Map(employees.map(e => [e.id, e]));
      newEmployees.forEach(emp => {
        empMap.set(emp.id, emp);
      });
      localStorage.setItem(MOCK_STORAGE_KEYS.EMPLOYEES, JSON.stringify(Array.from(empMap.values())));
    }
  },

  // --- ATTENDANCE SERVICES ---
  async getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('date', date);
        if (error) throw error;
        this.cacheAttendanceRecords(data as AttendanceRecord[]);
        return data as AttendanceRecord[];
      } catch (err) {
        console.warn(`Supabase getAttendanceByDate failed for date ${date}, loading cached data...`, err);
        return this.getCachedAttendanceByDate(date);
      }
    } else {
      const data = localStorage.getItem(MOCK_STORAGE_KEYS.ATTENDANCE);
      if (!data) return [];
      const records: AttendanceRecord[] = JSON.parse(data);
      return records.filter(r => r.date === date);
    }
  },

  async getAttendanceRange(startDate: string, endDate: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate);
        if (error) throw error;
        this.cacheAttendanceRecords(data as AttendanceRecord[]);
        return data as AttendanceRecord[];
      } catch (err) {
        console.warn('Supabase getAttendanceRange failed, loading cached data...', err);
        return this.getCachedAttendanceRange(startDate, endDate);
      }
    } else {
      const data = localStorage.getItem(MOCK_STORAGE_KEYS.ATTENDANCE);
      if (!data) return [];
      const records: AttendanceRecord[] = JSON.parse(data);
      return records.filter(r => r.date >= startDate && r.date <= endDate);
    }
  },

  async getAttendanceByEmployee(employeeId: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('employee_id', employeeId)
          .order('date', { ascending: false });
        if (error) throw error;
        this.cacheAttendanceRecords(data as AttendanceRecord[]);
        return data as AttendanceRecord[];
      } catch (err) {
        console.warn('Supabase getAttendanceByEmployee failed, loading cached data...', err);
        return this.getCachedAttendanceByEmployee(employeeId);
      }
    } else {
      const data = localStorage.getItem(MOCK_STORAGE_KEYS.ATTENDANCE);
      if (!data) return [];
      const records: AttendanceRecord[] = JSON.parse(data);
      return records
        .filter(r => r.employee_id === employeeId)
        .sort((a, b) => b.date.localeCompare(a.date));
    }
  },

  async saveAttendanceBulk(date: string, records: Omit<AttendanceRecord, 'date'>[], userId: string): Promise<void> {
    const formattedRecords: AttendanceRecord[] = records.map(r => ({
      ...r,
      date,
      marked_by: userId || undefined,
      marked_at: new Date().toISOString(),
    }));

    // Cache locally immediately to ensure instant UI responsiveness offline
    this.cacheAttendanceRecords(formattedRecords);

    const isOnline = typeof window !== 'undefined' && window.navigator && window.navigator.onLine;

    if (isSupabaseConfigured && supabase) {
      if (!isOnline) {
        this.enqueueSyncItem(date, records, userId);
        throw new Error('OFFLINE: Roster saved locally and will sync when network is restored.');
      }

      try {
        const chunkSize = 100;
        for (let i = 0; i < formattedRecords.length; i += chunkSize) {
          const chunk = formattedRecords.slice(i, i + chunkSize);
          const { error } = await supabase
            .from('attendance')
            .upsert(chunk, { onConflict: 'employee_id,date' });
          if (error) throw error;
        }
      } catch (err) {
        console.warn('Supabase saveAttendanceBulk failed, queuing offline sync...', err);
        this.enqueueSyncItem(date, records, userId);
        throw new Error('OFFLINE: Network connection error. Attendance saved locally and queued for synchronization.');
      }
    } else {
      const allData = localStorage.getItem(MOCK_STORAGE_KEYS.ATTENDANCE);
      let list: AttendanceRecord[] = allData ? JSON.parse(allData) : [];
      
      const empIds = new Set(records.map(r => r.employee_id));
      list = list.filter(item => !(item.date === date && empIds.has(item.employee_id)));
      
      list.push(...formattedRecords);
      localStorage.setItem(MOCK_STORAGE_KEYS.ATTENDANCE, JSON.stringify(list));
    }
  },

  async rotateShifts(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      // Fetch all employees
      const { data: employees, error } = await supabase
        .from('employees')
        .select('*');
      if (error) throw error;
      
      // Cycle shifts for A, B, C. General remains unchanged.
      const updates = employees
        .filter(emp => ['A', 'B', 'C'].includes(emp.shift))
        .map(emp => {
          let newShift = emp.shift;
          if (emp.shift === 'A') newShift = 'B';
          else if (emp.shift === 'B') newShift = 'C';
          else if (emp.shift === 'C') newShift = 'A';
          return {
            ...emp,
            shift: newShift
          };
        });
      
      // Save changes chunked
      const chunkSize = 100;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const { error: updateError } = await supabase
          .from('employees')
          .upsert(chunk);
        if (updateError) throw updateError;
      }

      // Rotate Supervisors
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*');
      if (profileError) throw profileError;

      const profileUpdates = profiles
        .filter(p => ['A', 'B', 'C'].includes(p.assigned_shift))
        .map(p => {
          let newShift = p.assigned_shift;
          if (p.assigned_shift === 'A') newShift = 'B';
          else if (p.assigned_shift === 'B') newShift = 'C';
          else if (p.assigned_shift === 'C') newShift = 'A';
          return {
            ...p,
            assigned_shift: newShift
          };
        });

      if (profileUpdates.length > 0) {
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .upsert(profileUpdates);
        if (profileUpdateError) throw profileUpdateError;
      }
    } else {
      // Local Mock DB
      const data = localStorage.getItem(MOCK_STORAGE_KEYS.EMPLOYEES);
      if (data) {
        const employees: Employee[] = JSON.parse(data);
        const updated = employees.map(emp => {
          let newShift = emp.shift;
          if (emp.shift === 'A') newShift = 'B';
          else if (emp.shift === 'B') newShift = 'C';
          else if (emp.shift === 'C') newShift = 'A';
          return { ...emp, shift: newShift };
        });
        localStorage.setItem(MOCK_STORAGE_KEYS.EMPLOYEES, JSON.stringify(updated));
      }

      // Rotate Supervisors in Mock DB
      const usersData = localStorage.getItem(MOCK_STORAGE_KEYS.USERS);
      if (usersData) {
        const users: Profile[] = JSON.parse(usersData);
        const updatedUsers = users.map(user => {
          if (['A', 'B', 'C'].includes(user.assigned_shift)) {
            let newShift = user.assigned_shift;
            if (user.assigned_shift === 'A') newShift = 'B';
            else if (user.assigned_shift === 'B') newShift = 'C';
            else if (user.assigned_shift === 'C') newShift = 'A';
            return { ...user, assigned_shift: newShift as any };
          }
          return user;
        });
        localStorage.setItem(MOCK_STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
      }
    }
  },

  // --- OFFLINE CACHE HELPERS ---
  cacheAttendanceRecords(newRecords: AttendanceRecord[]) {
    try {
      const key = 'cartridge_roster_cached_attendance';
      const existing = localStorage.getItem(key);
      let list: AttendanceRecord[] = existing ? JSON.parse(existing) : [];
      
      const recordMap = new Map<string, AttendanceRecord>();
      list.forEach(r => recordMap.set(`${r.employee_id}_${r.date}`, r));
      newRecords.forEach(r => recordMap.set(`${r.employee_id}_${r.date}`, r));
      
      localStorage.setItem(key, JSON.stringify(Array.from(recordMap.values())));
    } catch (e) {
      console.error('Error caching attendance records:', e);
    }
  },

  getCachedAttendanceByDate(date: string): AttendanceRecord[] {
    try {
      const key = 'cartridge_roster_cached_attendance';
      const data = localStorage.getItem(key);
      if (!data) return [];
      const records: AttendanceRecord[] = JSON.parse(data);
      return records.filter(r => r.date === date);
    } catch (e) {
      return [];
    }
  },

  getCachedAttendanceRange(startDate: string, endDate: string): AttendanceRecord[] {
    try {
      const key = 'cartridge_roster_cached_attendance';
      const data = localStorage.getItem(key);
      if (!data) return [];
      const records: AttendanceRecord[] = JSON.parse(data);
      return records.filter(r => r.date >= startDate && r.date <= endDate);
    } catch (e) {
      return [];
    }
  },

  getCachedAttendanceByEmployee(employeeId: string): AttendanceRecord[] {
    try {
      const key = 'cartridge_roster_cached_attendance';
      const data = localStorage.getItem(key);
      if (!data) return [];
      const records: AttendanceRecord[] = JSON.parse(data);
      return records
        .filter(r => r.employee_id === employeeId)
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch (e) {
      return [];
    }
  },

  enqueueSyncItem(date: string, records: Omit<AttendanceRecord, 'date'>[], userId: string) {
    try {
      const key = 'cartridge_roster_sync_queue';
      const existing = localStorage.getItem(key);
      const queue = existing ? JSON.parse(existing) : [];
      
      // Override previous queued offline records for the same date to avoid conflicts
      const cleanQueue = queue.filter((item: any) => !(item.date === date));
      
      cleanQueue.push({
        id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date,
        records,
        userId
      });
      
      localStorage.setItem(key, JSON.stringify(cleanQueue));
    } catch (e) {
      console.error('Failed to enqueue offline sync item:', e);
    }
  },

  async syncOfflineRecords(): Promise<number> {
    if (!isSupabaseConfigured || !supabase) return 0;
    
    const key = 'cartridge_roster_sync_queue';
    const existing = localStorage.getItem(key);
    if (!existing) return 0;

    const queue = JSON.parse(existing);
    if (queue.length === 0) return 0;

    console.log(`Attempting to synchronize ${queue.length} offline attendance logs...`);
    let syncCount = 0;
    const remainingQueue = [];

    for (const item of queue) {
      try {
        const formattedRecords: AttendanceRecord[] = item.records.map((r: any) => ({
          ...r,
          date: item.date,
          marked_by: item.userId || undefined,
          marked_at: new Date().toISOString(),
        }));

        const chunkSize = 100;
        for (let i = 0; i < formattedRecords.length; i += chunkSize) {
          const chunk = formattedRecords.slice(i, i + chunkSize);
          const { error } = await supabase
            .from('attendance')
            .upsert(chunk, { onConflict: 'employee_id,date' });
          if (error) throw error;
        }
        syncCount++;
      } catch (err) {
        console.error(`Failed to sync record for date ${item.date}, leaving in queue:`, err);
        remainingQueue.push(item);
      }
    }

    if (remainingQueue.length > 0) {
      localStorage.setItem(key, JSON.stringify(remainingQueue));
    } else {
      localStorage.removeItem(key);
    }

    return syncCount;
  },

  // --- NOTIFICATION SERVICES ---
  async sendAdminNotification(message: string): Promise<void> {
    const notification: AppNotification = {
      id: crypto.randomUUID(),
      message,
      timestamp: new Date().toISOString(),
      read: false
    };
    const existing = localStorage.getItem(MOCK_STORAGE_KEYS.NOTIFICATIONS);
    const list: AppNotification[] = existing ? JSON.parse(existing) : [];
    list.push(notification);
    localStorage.setItem(MOCK_STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  },

  async getAdminNotifications(): Promise<AppNotification[]> {
    const existing = localStorage.getItem(MOCK_STORAGE_KEYS.NOTIFICATIONS);
    return existing ? JSON.parse(existing) : [];
  },
  
  async markNotificationsRead(): Promise<void> {
    const existing = localStorage.getItem(MOCK_STORAGE_KEYS.NOTIFICATIONS);
    if (!existing) return;
    const list: AppNotification[] = JSON.parse(existing);
    list.forEach(n => n.read = true);
    localStorage.setItem(MOCK_STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  },

  resetMockDatabase(): void {
    if (isSupabaseConfigured) return;
    localStorage.removeItem(MOCK_STORAGE_KEYS.EMPLOYEES);
    localStorage.removeItem(MOCK_STORAGE_KEYS.ATTENDANCE);
    localStorage.removeItem(MOCK_STORAGE_KEYS.USERS);
    localStorage.removeItem(MOCK_STORAGE_KEYS.CURRENT_USER);
    const mock = seedMockEmployees();
    seedMockUsers();
    seedMockAttendance(mock);
  }
};
