# Frontend Architecture - DeDato

## Обзор

Frontend DeDato построен на React 18 с использованием современного стека технологий. Архитектура следует принципам компонентного дизайна, разделения ответственности и переиспользования кода.

## Технологический стек

### Основные технологии
- **React 18.2.0** - UI библиотека с hooks
- **Vite 6.3.5** - Build tool и dev server
- **TailwindCSS 3.x** - Utility-first CSS framework
- **React Router 6.x** - Клиентская маршрутизация
- **Axios** - HTTP клиент для API

### Дополнительные библиотеки
- **Chart.js** - Графики и визуализация данных
- **React Hook Form** - Управление формами
- **React Query** - Управление состоянием сервера (планируется)
- **Framer Motion** - Анимации (планируется)

## Архитектурные принципы

### 1. Component-Based Architecture
- Переиспользуемые компоненты
- Единая ответственность
- Props drilling минимизирован
- Context для глобального состояния

### 2. Separation of Concerns
- UI компоненты отделены от бизнес-логики
- API вызовы вынесены в отдельные сервисы
- Утилиты для переиспользования
- Четкое разделение по слоям

### 3. Performance Optimization
- Code splitting по маршрутам
- Lazy loading компонентов
- Memoization для дорогих вычислений
- Оптимизация re-renders

## Структура проекта

```
frontend/src/
├── components/          # Переиспользуемые компоненты
│   ├── calendars/       # Календарные компоненты
│   ├── charts/          # Графики и диаграммы
│   ├── forms/           # Формы
│   ├── modals/          # Модальные окна
│   └── ui/              # Базовые UI компоненты
├── contexts/            # React Context провайдеры
├── hooks/               # Кастомные React hooks
├── layouts/             # Layout компоненты
├── pages/               # Страницы приложения
├── routes/              # Конфигурация маршрутов
├── utils/               # Утилиты и хелперы
├── services/            # API сервисы
├── assets/              # Статические ресурсы
├── styles/              # Глобальные стили
└── types/               # TypeScript типы (планируется)
```

## Слои архитектуры

### 1. Presentation Layer (UI Components)

#### Базовые UI компоненты
```javascript
// components/ui/Button.jsx
const Button = ({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  onClick,
  disabled = false,
  ...props 
}) => {
  const baseClasses = 'font-medium rounded-lg transition-colors focus:outline-none focus:ring-2';
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
  };
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
```

#### Специализированные компоненты
```javascript
// components/calendars/MasterScheduleCalendar.jsx
const MasterScheduleCalendar = ({ 
  masterId, 
  selectedDate, 
  onDateSelect,
  onBookingSelect 
}) => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBookings();
  }, [masterId, selectedDate]);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/master/bookings?date=${selectedDate}`);
      setBookings(data);
    } catch (error) {
      console.error('Ошибка загрузки записей:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Календарная сетка */}
      <div className="grid grid-cols-7 gap-1 p-4">
        {/* Временные слоты */}
      </div>
    </div>
  );
};
```

### 2. Layout Layer

#### Master Layout
```javascript
// layouts/MasterLayout.jsx
const MasterLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();

  const navigation = [
    { name: 'Дашборд', href: '/master/dashboard', icon: HomeIcon },
    { name: 'Услуги', href: '/master/services', icon: ServiceIcon },
    { name: 'Расписание', href: '/master/schedule', icon: CalendarIcon },
    { name: 'Записи', href: '/master/bookings', icon: BookingIcon },
    { name: 'Финансы', href: '/master/accounting', icon: MoneyIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar 
        navigation={navigation}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      {/* Main content */}
      <div className="lg:pl-64">
        <Header 
          user={user}
          onLogout={logout}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
```

### 3. Page Layer

#### Master Dashboard
```javascript
// pages/MasterDashboard.jsx
const MasterDashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, bookingsData] = await Promise.all([
        apiGet('/master/dashboard/stats'),
        apiGet('/master/bookings?limit=5')
      ]);
      
      setStats(statsData);
      setRecentBookings(bookingsData.bookings);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <StatsGrid stats={stats} />
      
      {/* Недавние записи */}
      <RecentBookings bookings={recentBookings} />
      
      {/* Графики */}
      <ChartsSection />
    </div>
  );
};
```

### 4. Service Layer

#### API Service
```javascript
// services/api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor для добавления токена
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor для обработки ошибок
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Попытка обновить токен
          const refreshed = await this.refreshToken();
          if (refreshed) {
            // Повторить запрос
            return this.client.request(error.config);
          } else {
            // Редирект на логин
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async refreshToken() {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return false;

      const response = await this.client.post('/auth/refresh', {
        refresh_token: refreshToken
      });

      const { access_token } = response.data;
      localStorage.setItem('access_token', access_token);
      return true;
    } catch (error) {
      return false;
    }
  }

  // HTTP методы
  async get(url, params = {}) {
    const response = await this.client.get(url, { params });
    return response.data;
  }

  async post(url, data = {}) {
    const response = await this.client.post(url, data);
    return response.data;
  }

  async put(url, data = {}) {
    const response = await this.client.put(url, data);
    return response.data;
  }

  async delete(url) {
    const response = await this.client.delete(url);
    return response.data;
  }
}

export const apiService = new ApiService();
```

#### Auth Service
```javascript
// services/auth.js
class AuthService {
  async login(credentials) {
    try {
      const response = await apiService.post('/auth/login', credentials);
      
      // Сохраняем токены
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      localStorage.setItem('user_data', JSON.stringify(response.user));
      
      return response.user;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Ошибка входа');
    }
  }

  async logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
  }

  getCurrentUser() {
    const userData = localStorage.getItem('user_data');
    return userData ? JSON.parse(userData) : null;
  }

  isAuthenticated() {
    return !!localStorage.getItem('access_token');
  }

  getToken() {
    return localStorage.getItem('access_token');
  }
}

export const authService = new AuthService();
```

### 5. State Management

#### Context Providers
```javascript
// contexts/AuthContext.jsx
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверяем сохраненную сессию при загрузке
    const savedUser = authService.getCurrentUser();
    if (savedUser && authService.isAuthenticated()) {
      setUser(savedUser);
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      const userData = await authService.login(credentials);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

#### Custom Hooks
```javascript
// hooks/useBookings.js
export const useBookings = (masterId, filters = {}) => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = { master_id: masterId, ...filters };
      const data = await apiService.get('/master/bookings', params);
      setBookings(data.bookings || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [masterId, filters]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const createBooking = async (bookingData) => {
    try {
      const newBooking = await apiService.post('/bookings', bookingData);
      setBookings(prev => [newBooking, ...prev]);
      return newBooking;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateBooking = async (id, updates) => {
    try {
      const updatedBooking = await apiService.put(`/bookings/${id}`, updates);
      setBookings(prev => 
        prev.map(booking => 
          booking.id === id ? updatedBooking : booking
        )
      );
      return updatedBooking;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    bookings,
    loading,
    error,
    loadBookings,
    createBooking,
    updateBooking
  };
};
```

## Маршрутизация

### React Router Configuration
```javascript
// routes/index.jsx
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/master',
    element: (
      <ProtectedRoute>
        <RoleRoute allowedRoles={['master', 'admin']}>
          <MasterLayout />
        </RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <MasterDashboard />,
      },
      {
        path: 'services',
        element: <MasterServices />,
      },
      {
        path: 'schedule',
        element: <MasterSchedule />,
      },
      {
        path: 'bookings',
        element: <MasterBookings />,
      },
      {
        path: 'accounting',
        element: <MasterAccounting />,
      },
    ],
  },
  {
    path: '/client',
    element: (
      <ProtectedRoute>
        <RoleRoute allowedRoles={['client', 'admin']}>
          <ClientLayout />
        </RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <ClientDashboard />,
      },
      {
        path: 'bookings',
        element: <ClientBookings />,
      },
      {
        path: 'notes',
        element: <ClientNotes />,
      },
    ],
  },
  {
    path: '/salon',
    element: (
      <ProtectedRoute>
        <RoleRoute allowedRoles={['salon', 'admin']}>
          <SalonLayout />
        </RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <SalonDashboard />,
      },
      {
        path: 'branches',
        element: <SalonBranches />,
      },
      {
        path: 'masters',
        element: <SalonMasters />,
      },
    ],
  },
]);
```

### Protected Routes
```javascript
// routes/ProtectedRoute.jsx
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// routes/RoleRoute.jsx
const RoleRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};
```

## Стилизация

### TailwindCSS Configuration
```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        secondary: {
          50: '#f8fafc',
          500: '#64748b',
          600: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
```

### Component Styling Patterns
```javascript
// Utility classes для переиспользования
const buttonVariants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
};

const inputVariants = {
  default: 'block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500',
  error: 'block w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500',
};

// CSS-in-JS для динамических стилей
const getStatusColor = (status) => {
  const colors = {
    created: 'bg-blue-100 text-blue-800',
    awaiting_confirmation: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};
```

## Производительность

### Code Splitting
```javascript
// Lazy loading страниц
const MasterDashboard = lazy(() => import('../pages/MasterDashboard'));
const ClientDashboard = lazy(() => import('../pages/ClientDashboard'));
const SalonDashboard = lazy(() => import('../pages/SalonDashboard'));

// Lazy loading с Suspense
<Suspense fallback={<LoadingSpinner />}>
  <MasterDashboard />
</Suspense>
```

### Memoization
```javascript
// React.memo для предотвращения лишних re-renders
const BookingCard = React.memo(({ booking, onEdit, onDelete }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* Booking content */}
    </div>
  );
});

// useMemo для дорогих вычислений
const filteredBookings = useMemo(() => {
  return bookings.filter(booking => 
    booking.status === statusFilter || statusFilter === 'all'
  );
}, [bookings, statusFilter]);

// useCallback для стабильных функций
const handleBookingEdit = useCallback((bookingId) => {
  setEditingBooking(bookingId);
}, []);
```

### Virtual Scrolling (для больших списков)
```javascript
// Пример виртуализации для больших списков
import { FixedSizeList as List } from 'react-window';

const VirtualizedBookingList = ({ bookings }) => {
  const Row = ({ index, style }) => (
    <div style={style}>
      <BookingCard booking={bookings[index]} />
    </div>
  );

  return (
    <List
      height={600}
      itemCount={bookings.length}
      itemSize={120}
    >
      {Row}
    </List>
  );
};
```

## Тестирование

### Unit Tests (Jest + React Testing Library)
```javascript
// components/__tests__/Button.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies correct variant classes', () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByText('Delete');
    expect(button).toHaveClass('bg-red-600');
  });
});
```

### Integration Tests
```javascript
// pages/__tests__/MasterDashboard.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { MasterDashboard } from '../MasterDashboard';

const renderWithProviders = (component) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('MasterDashboard', () => {
  it('loads and displays dashboard data', async () => {
    // Mock API responses
    jest.spyOn(apiService, 'get').mockResolvedValue({
      stats: { total_bookings: 10 },
      bookings: []
    });

    renderWithProviders(<MasterDashboard />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });
});
```

## Сборка и развертывание

### Vite Configuration
```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['chart.js'],
        },
      },
    },
  },
});
```

### Environment Variables
```bash
# .env.development
REACT_APP_API_URL=http://localhost:8000/api/v1
REACT_APP_ENVIRONMENT=development

# .env.production
REACT_APP_API_URL=https://api.dedato.com/api/v1
REACT_APP_ENVIRONMENT=production
```

## Мониторинг и аналитика

### Error Boundary
```javascript
// components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Отправка ошибки в систему мониторинга
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Что-то пошло не так
            </h1>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Performance Monitoring
```javascript
// utils/performance.js
export const measurePerformance = (name, fn) => {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  
  console.log(`${name} took ${end - start} milliseconds`);
  return result;
};

// Использование
const expensiveCalculation = measurePerformance('data processing', () => {
  return processLargeDataset(data);
});
```

## Связанные документы

- [ADR-0001: Выбор технологического стека](../adr/0001-tech-stack.md)
- [C4 Model: Frontend Components](../c4/04-component-frontend.md)
- [API Design](api-design.md)
- [Getting Started Guide](../guides/getting-started.md)


