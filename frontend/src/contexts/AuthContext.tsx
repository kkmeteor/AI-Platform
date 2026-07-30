import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchCurrentUser, login as apiLogin, logout as apiLogout, type UserInfo, type LoginRequest } from '../services/api';

interface AuthContextType {
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  canEdit: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        // Verify token is still valid
        fetchCurrentUser()
          .then((freshUser) => {
            setUser(freshUser);
            localStorage.setItem('user', JSON.stringify(freshUser));
          })
          .catch(() => {
            // Token invalid, clear
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
          })
          .finally(() => setIsLoading(false));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const response = await apiLogin(data);
    localStorage.setItem('token', response.access_token);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('role', response.user.role);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore logout errors
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'admin';
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, isAdmin, canEdit }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
