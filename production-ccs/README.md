# Roo Remote UI - Production Communication & Control Server (CCS)

A production-ready TypeScript/Node.js server that provides secure communication between the Roo VSCode extension and remote UI clients. This server implements enterprise-grade features including authentication, real-time messaging, comprehensive logging, and robust error handling.

## 🚀 Features

### Core Functionality

- **Real-time Communication**: WebSocket-based bidirectional messaging
- **RESTful API**: HTTP endpoints for authentication and data management
- **Extension Integration**: Unix socket communication with VSCode extension
- **Message Routing**: Intelligent message routing between clients and extension

### Security & Authentication

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Protection against abuse and DoS attacks
- **CORS Configuration**: Configurable cross-origin resource sharing
- **Input Validation**: Comprehensive request validation
- **Security Headers**: Helmet.js security middleware

### Production Features

- **Comprehensive Logging**: Structured logging with Winston
- **Health Monitoring**: Health check endpoints with metrics
- **Error Handling**: Centralized error handling with proper HTTP status codes
- **Graceful Shutdown**: Clean shutdown handling for production deployments
- **Configuration Management**: Environment-based configuration
- **TypeScript**: Full type safety and modern JavaScript features

### Infrastructure Support

- **Database Integration**: PostgreSQL support (ready for implementation)
- **Redis Caching**: Redis integration for session management and caching
- **Monitoring**: Built-in metrics and performance monitoring
- **Scalability**: Designed for horizontal scaling

## 📋 Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 8.x or higher
- **PostgreSQL**: Version 13.x or higher (for database features)
- **Redis**: Version 6.x or higher (for caching and sessions)

## 🛠️ Installation

1. **Clone and navigate to the project**:

   ```bash
   cd production-ccs
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

#### Server Configuration

```bash
NODE_ENV=development          # Environment: development, production, test
PORT=3000                    # Server port
HOST=0.0.0.0                # Server host
```

#### Security Configuration

```bash
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
BCRYPT_SALT_ROUNDS=12
```

#### Database Configuration

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=roo_remote_ui
DB_USER=postgres
DB_PASSWORD=your-database-password
DB_SSL=false
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
```

#### Redis Configuration

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                # Optional
REDIS_DB=0
REDIS_KEY_PREFIX=roo:
REDIS_MAX_RETRIES=3
```

#### Logging Configuration

```bash
LOG_LEVEL=info               # error, warn, info, debug
LOG_FORMAT=json              # json, simple
LOG_FILE_ENABLED=true
LOG_FILE_NAME=logs/app.log
LOG_FILE_MAX_SIZE=20m
LOG_FILE_MAX_FILES=5
LOG_CONSOLE_ENABLED=true
LOG_CONSOLE_COLORIZE=true
```

#### Extension Integration

```bash
EXTENSION_SOCKET_PATH=/tmp/roo-extension.sock
EXTENSION_SOCKET_TIMEOUT=5000
EXTENSION_SOCKET_RETRY_ATTEMPTS=3
EXTENSION_SOCKET_RETRY_DELAY=1000
```

## 🚀 Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Other Commands

```bash
npm run typecheck    # Type checking without compilation
npm run lint         # ESLint code analysis
npm run format       # Prettier code formatting
npm test            # Run tests (when implemented)
```

## 📡 API Endpoints

### Health Check

```http
GET /health
```

Returns server health status, uptime, and service connectivity.

### Authentication (To be implemented)

```http
POST /api/auth/login     # User login
POST /api/auth/logout    # User logout
POST /api/auth/refresh   # Token refresh
GET  /api/auth/profile   # User profile
```

### Messages (To be implemented)

```http
GET    /api/messages     # Get message history
POST   /api/messages     # Send message
DELETE /api/messages/:id # Delete message
```

## 🔌 WebSocket Communication

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Message Format

```json
{
  "type": "message_type",
  "payload": {
    "data": "message_data"
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "unique-request-id"
}
```

### Event Types

- `connection` - Client connected
- `message` - Chat message
- `command` - Extension command
- `response` - Command response
- `error` - Error notification
- `ack` - Acknowledgment

## 🏗️ Architecture

### Project Structure

```
production-ccs/
├── src/
│   ├── config/          # Configuration management
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions and helpers
│   ├── services/        # Business logic services (to be implemented)
│   ├── middleware/      # Express middleware (to be implemented)
│   ├── routes/          # API route handlers (to be implemented)
│   └── index.ts         # Application entry point
├── dist/                # Compiled JavaScript output
├── logs/                # Application logs
├── .env.example         # Environment variables template
├── package.json         # Project dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── .eslintrc.js         # ESLint configuration
└── .prettierrc          # Prettier configuration
```

### Core Components

1. **Application Server** (`src/index.ts`)

   - Express.js HTTP server
   - WebSocket server
   - Middleware setup
   - Route configuration
   - Error handling

2. **Configuration** (`src/config/`)

   - Environment variable management
   - Type-safe configuration
   - Validation and defaults

3. **Type Definitions** (`src/types/`)

   - TypeScript interfaces
   - API request/response types
   - Configuration types

4. **Utilities** (`src/utils/`)
   - Logging utilities
   - Helper functions
   - Common utilities

## 🔧 Development

### Code Quality

- **TypeScript**: Full type safety
- **ESLint**: Code linting and style enforcement
- **Prettier**: Code formatting
- **Strict Configuration**: Strict TypeScript and ESLint rules

### Development Workflow

1. Make changes to source code in `src/`
2. Run `npm run typecheck` to verify types
3. Run `npm run lint` to check code quality
4. Run `npm run format` to format code
5. Run `npm run build` to compile
6. Run `npm run dev` to test changes

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure secure JWT secret (32+ characters)
- [ ] Set up PostgreSQL database
- [ ] Configure Redis instance
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategies

### Docker Deployment (Future)

```dockerfile
# Dockerfile will be created in future iterations
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Monitoring

### Health Endpoint

The `/health` endpoint provides:

- Server status
- Uptime information
- Service connectivity status
- Performance metrics
- Version information

### Logging

- **Structured Logging**: JSON format for production
- **Log Levels**: Error, Warn, Info, Debug
- **File Rotation**: Automatic log file rotation
- **Request Logging**: HTTP request/response logging
- **Error Tracking**: Comprehensive error logging

## 🔒 Security

### Implemented Security Measures

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing control
- **Rate Limiting**: Request rate limiting
- **Input Validation**: Request validation
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt password hashing

### Security Best Practices

- Use HTTPS in production
- Regularly update dependencies
- Monitor for security vulnerabilities
- Implement proper access controls
- Use environment variables for secrets
- Enable audit logging

## 🤝 Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure TypeScript compilation passes
5. Run linting and formatting
6. Test thoroughly before submitting

## 📝 License

This project is part of the Roo Code project and follows the same licensing terms.

## 🆘 Support

For issues and questions:

1. Check the documentation
2. Review existing GitHub issues
3. Create a new issue with detailed information
4. Include logs and configuration (without secrets)

## 🗺️ Roadmap

### Phase 1: Core Infrastructure ✅

- [x] Basic server setup
- [x] TypeScript configuration
- [x] Logging system
- [x] Configuration management
- [x] Health monitoring

### Phase 2: Authentication & Security (Next)

- [ ] JWT authentication implementation
- [ ] User management
- [ ] Session handling
- [ ] Security middleware

### Phase 3: Database Integration

- [ ] PostgreSQL integration
- [ ] Redis caching
- [ ] Data models
- [ ] Migration system

### Phase 4: Extension Integration

- [ ] Unix socket communication
- [ ] Command routing
- [ ] Extension API
- [ ] Protocol implementation

### Phase 5: Advanced Features

- [ ] Real-time collaboration
- [ ] File synchronization
- [ ] Plugin system
- [ ] Advanced monitoring

---

**Built with ❤️ for the Roo Code project**
