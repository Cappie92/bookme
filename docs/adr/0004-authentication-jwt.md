# ADR-0004: Аутентификация и авторизация с JWT

**Дата:** 2024-10-21

**Статус:** Принято

**Контекст:** Команда разработки DeDato

---

## Контекст и проблема

Система бронирования требует механизм аутентификации и авторизации для:

- Разграничения доступа между ролями (клиент, мастер, владелец салона, администратор)
- Защиты API endpoints
- Безопасного хранения сессий
- Возможности длительных сессий (remember me)
- Интеграции с мобильными приложениями в будущем

### Требования

**Функциональные:**
- Регистрация с email и телефоном
- Аутентификация по email/телефону и паролю
- Система ролей (CLIENT, MASTER, SALON, ADMIN)
- Верификация email и телефона
- Сброс пароля
- Refresh tokens для продления сессии

**Нефункциональные:**
- Безопасное хранение паролей (hashing)
- Защита от CSRF
- Stateless аутентификация для масштабируемости
- Время жизни токена: 30 минут (access), 7 дней (refresh)

**Ограничения:**
- REST API (без WebSocket для аутентификации)
- Совместимость с React SPA
- Возможность интеграции с мобильными приложениями

## Рассмотренные варианты

### Вариант 1: Session-based authentication (Cookie Sessions)

**Описание:** Традиционная сессионная аутентификация с cookie

**Плюсы:**
- Простота реализации
- Автоматическое управление cookie браузером
- Легко инвалидировать сессию

**Минусы:**
- Stateful (требует хранилище сессий)
- Сложнее масштабирование (sticky sessions)
- Проблемы с CORS для SPA
- Не подходит для мобильных приложений

### Вариант 2: JWT (JSON Web Tokens)

**Описание:** Stateless токены с подписью, содержащие claims

**Плюсы:**
- Stateless - не требует хранилища сессий
- Горизонтальное масштабирование без проблем
- Подходит для SPA и мобильных приложений
- Декодируемые claims (user_id, role)
- Industry standard (RFC 7519)

**Минусы:**
- Сложнее инвалидация до истечения срока
- Размер токена больше session ID
- Необходимость refresh tokens для длительных сессий

### Вариант 3: OAuth 2.0 / OpenID Connect

**Описание:** Делегированная аутентификация через внешний провайдер

**Плюсы:**
- Можно использовать Google/Facebook/VK login
- Стандартизированный протокол
- Не нужно хранить пароли

**Минусы:**
- Оверкилл для текущих требований
- Зависимость от внешних сервисов
- Сложность реализации
- Все равно нужна своя аутентификация для части пользователей

## Принятое решение

**Выбран:** Вариант 2 (JWT) с Refresh Tokens

### Обоснование

JWT выбран как оптимальное решение для REST API:

1. **Stateless:** Не требует Redis/Memcached для хранения сессий
2. **Масштабируемость:** Любой backend сервер может валидировать токен
3. **SPA friendly:** Токены передаются в Authorization header
4. **Mobile ready:** Готово для будущих мобильных приложений
5. **Claims:** Встроенная информация (user_id, role) без запроса к БД

**Дополнительно:**
- Refresh tokens для продления сессии без повторного логина
- Bcrypt для хеширования паролей
- Email/Phone верификация для безопасности

## Последствия

### Положительные

- Stateless аутентификация - легкое масштабирование
- Готовность к мобильным приложениям
- Безопасность благодаря подписи токенов
- Декодируемые claims ускоряют авторизацию
- Industry standard - множество готовых библиотек

### Отрицательные

- Невозможно мгновенно инвалидировать токен (нужен blacklist)
- Токены больше по размеру чем session ID
- Необходимость хранения refresh tokens в БД
- Сложнее отладка (токены в headers, не в cookies)

### Риски

**Риск 1:** XSS атака может украсть токен из localStorage

**Митигация:**
- Короткое время жизни access token (30 мин)
- HttpOnly cookies для refresh token (опция)
- Content Security Policy headers
- Sanitization пользовательского ввода

**Риск 2:** Скомпрометированный SECRET_KEY раскроет все токены

**Митигация:**
- SECRET_KEY хранится в environment variables
- Регулярная ротация SECRET_KEY
- Сильный случайный ключ (256 бит)

**Риск 3:** Невозможно мгновенно заблокировать пользователя

**Митигация:**
- Проверка is_active при критичных операциях
- Token blacklist для немедленной инвалидации (опция)
- Короткое время жизни токенов

## Детали реализации

### JWT Configuration

```python
# backend/auth.py
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### User Model

```python
# backend/models.py
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String)  # client, master, salon, admin
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_phone_verified = Column(Boolean, default=False)
    full_name = Column(String, nullable=True)
```

### Password Hashing

```python
# backend/auth.py
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

### Authentication Flow

```python
# 1. Регистрация
@router.post("/register")
async def register(user_in: UserCreate, db: Session):
    # Проверка существования email/phone
    # Создание пользователя с хешированным паролем
    # Отправка верификационного email
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_verified=False
    )
    db.add(user)
    db.commit()
    
    # Создание токенов
    access_token = create_access_token({"sub": user.id, "role": user.role})
    refresh_token = create_refresh_token({"sub": user.id})
    
    return {"access_token": access_token, "refresh_token": refresh_token}

# 2. Логин
@router.post("/login")
async def login(credentials: LoginRequest, db: Session):
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    
    if not user.is_active:
        raise HTTPException(403, "User is inactive")
    
    access_token = create_access_token({"sub": user.id, "role": user.role})
    refresh_token = create_refresh_token({"sub": user.id})
    
    return {"access_token": access_token, "refresh_token": refresh_token}

# 3. Refresh Token
@router.post("/refresh")
async def refresh_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        
        user_id = payload.get("sub")
        # Создаем новый access token
        new_access_token = create_access_token({"sub": user_id, ...})
        return {"access_token": new_access_token}
    except JWTError:
        raise HTTPException(401, "Invalid token")
```

### Protected Endpoints

```python
# backend/auth.py
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(401, "Invalid token")
    except JWTError:
        raise HTTPException(401, "Invalid token")
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(404, "User not found")
    
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if not current_user.is_active:
        raise HTTPException(403, "Inactive user")
    return current_user

# Использование
@router.get("/protected")
async def protected_route(current_user: User = Depends(get_current_active_user)):
    return {"message": f"Hello {current_user.email}"}
```

### Role-Based Access Control

```python
# backend/auth.py
def require_role(*roles: List[str]):
    def decorator(func):
        async def wrapper(current_user: User = Depends(get_current_active_user), *args, **kwargs):
            if current_user.role not in roles:
                raise HTTPException(403, "Insufficient permissions")
            return await func(current_user=current_user, *args, **kwargs)
        return wrapper
    return decorator

# Использование
@router.get("/master/dashboard")
@require_role("master", "admin")
async def master_dashboard(current_user: User = Depends(get_current_active_user)):
    return {"data": "master specific data"}
```

### Frontend Integration

```javascript
// frontend/src/utils/api.js
const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const setTokens = (accessToken, refreshToken) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);

export const apiRequest = async (url, options = {}) => {
  const token = getAccessToken();
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status === 401) {
    // Попытка обновить токен
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Повторить запрос с новым токеном
      return apiRequest(url, options);
    } else {
      // Редирект на логин
      window.location.href = '/login';
    }
  }
  
  return response.json();
};

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (response.ok) {
      const { access_token } = await response.json();
      localStorage.setItem(TOKEN_KEY, access_token);
      return true;
    }
  } catch (error) {
    console.error('Refresh token failed:', error);
  }
  
  return false;
};
```

### Security Headers

```python
# backend/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response
```

## Связанные решения

- ADR-0001: Выбор технологического стека
- ADR-0003: Система статусов бронирований (требует авторизации)

## Примечания

**Система ролей:**
- `client`: Клиент (может создавать бронирования)
- `master`: Мастер (управление услугами, расписанием, подтверждение записей)
- `salon`: Владелец салона (управление мастерами, филиалами)
- `admin`: Администратор (полный доступ)

**Верификация:**
- Email верификация через ссылку в письме
- Phone верификация через SMS код (Zvonok API)
- Неверифицированные пользователи имеют ограниченный доступ

**Безопасность:**
- Пароли хешируются с bcrypt (cost factor 12)
- JWT подписываются HS256
- Refresh tokens хранятся в БД (опция blacklist)
- Rate limiting на эндпоинты аутентификации (будущая фича)

**Обновления:**
- 2024-10-21: Первоначальное решение



