# Central Communication Server (CCS) - Detailed Design

## 1. Introduction

This document outlines the detailed design for the Central Communication Server (CCS). The CCS is a core component responsible for managing real-time communication, user authentication, presence, and message persistence.

## 2. Technology Stack

*   **Programming Language:** Python 3.9+
*   **Web Framework:** FastAPI
*   **Asynchronous Server Gateway Interface (ASGI):** Uvicorn
*   **Real-time Communication Protocol:** WebSockets
*   **Database:** PostgreSQL
*   **Authentication:** JSON Web Tokens (JWT)
*   **Caching (Optional, for future scalability):** Redis (e.g., for presence status, session management)

## 3. System Architecture Overview

The CCS will expose WebSocket endpoints for real-time communication and HTTP endpoints for authentication and user management. It will interact with the PostgreSQL database for persistent storage.

```
+-------------------+      +------------------------+      +-------------------+
|      Clients      |<---->|          CCS           |<---->|    PostgreSQL     |
| (Web, Mobile, CLI)|      | (FastAPI, WebSockets)  |      |     Database      |
+-------------------+      +------------------------+      +-------------------+
                             |
                             | (Future Enhancement)
                             |
                             v
                         +-------+
                         | Redis |
                         +-------+
```

## 4. Module Structure

The CCS will be organized into the following primary modules:

*   **`main.py`**: Entry point of the application. Initializes FastAPI app, database connections, and routes.
*   **`auth/`**: Handles user authentication and JWT management.
    *   `auth_service.py`: Logic for user registration, login, password hashing, JWT generation and validation.
    *   `auth_routes.py`: HTTP API endpoints for `/register`, `/login`.
*   **`users/`**: Manages user profiles and presence.
    *   `user_models.py`: Pydantic models for user data.
    *   `user_service.py`: Logic for fetching user details, updating profiles.
    *   `presence_service.py`: Manages user online/offline status and broadcasts updates.
*   **`messaging/`**: Handles real-time message routing and persistence.
    *   `connection_manager.py`: Manages active WebSocket connections. Stores connections per user or per group.
    *   `message_router.py`: Routes incoming messages to appropriate recipients (one-to-one, group).
    *   `message_service.py`: Handles storage and retrieval of messages from the database.
    *   `websocket_routes.py`: WebSocket endpoints for establishing connections and message exchange.
*   **`database/`**: Manages database interactions.
    *   `db_config.py`: Database connection settings.
    *   `db_models.py`: SQLAlchemy ORM models for database tables.
    *   `crud.py`: Create, Read, Update, Delete operations for database models.
*   **`core/`**: Core utilities and configurations.
    *   `config.py`: Application settings (e.g., JWT secret, database URL).
    *   `security.py`: Password hashing utilities.
*   **`tests/`**: Unit and integration tests for all modules.

## 5. Key Classes and Functions

### 5.1. `auth/auth_service.py`

*   `class AuthService`:
    *   `async def register_user(user_data: UserCreateSchema) -> UserSchema`: Registers a new user. Hashes password. Stores in DB.
    *   `async def authenticate_user(username: str, password: str) -> Optional[UserSchema]`: Authenticates a user.
    *   `def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str`: Creates a JWT.
    *   `async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserSchema`: Decodes JWT and retrieves user.

### 5.2. `users/presence_service.py`

*   `class PresenceService`:
    *   `active_users: set[str] = set()`: Stores user IDs of currently online users.
    *   `async def user_connected(user_id: str)`: Marks user as online, broadcasts presence.
    *   `async def user_disconnected(user_id: str)`: Marks user as offline, broadcasts presence.
    *   `async def broadcast_presence_update(user_id: str, status: str)`

### 5.3. `messaging/connection_manager.py`

*   `class ConnectionManager`:
    *   `active_connections: dict[str, WebSocket] = {}`: Maps user_id to WebSocket connection.
    *   `async def connect(user_id: str, websocket: WebSocket)`: Accepts and stores a new connection.
    *   `def disconnect(user_id: str)`: Removes a connection.
    *   `async def send_personal_message(message: str, user_id: str)`
    *   `async def broadcast(message: str)`: Sends a message to all connected clients (e.g., for system-wide announcements or group chats if not handled separately).
    *   `async def send_to_group(group_id: str, message: str)`: (If group chat is implemented) Sends message to all members of a group.

### 5.4. `messaging/message_router.py`

*   `class MessageRouter`:
    *   `def __init__(self, connection_manager: ConnectionManager, message_service: MessageService)`
    *   `async def route_message(sender_id: str, raw_message: dict)`: Parses message type (e.g., one-to-one, group, system), validates, and forwards to `ConnectionManager` or `MessageService`.

### 5.5. `messaging/message_service.py`

*   `class MessageService`:
    *   `async def store_message(sender_id: str, recipient_id: str, content: str, timestamp: datetime) -> MessageSchema`: Stores a message in the database.
    *   `async def get_message_history(user_id1: str, user_id2: str, limit: int = 100, offset: int = 0) -> list[MessageSchema]`: Retrieves chat history between two users.
    *   `async def get_group_message_history(group_id: str, limit: int = 100, offset: int = 0) -> list[MessageSchema]`: Retrieves group message history.

## 6. Database Schema (PostgreSQL)

*   **`users` table:**
    *   `id`: SERIAL PRIMARY KEY
    *   `username`: VARCHAR(50) UNIQUE NOT NULL
    *   `email`: VARCHAR(100) UNIQUE NOT NULL
    *   `hashed_password`: VARCHAR(255) NOT NULL
    *   `full_name`: VARCHAR(100)
    *   `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    *   `last_login_at`: TIMESTAMP WITH TIME ZONE

*   **`messages` table:**
    *   `id`: SERIAL PRIMARY KEY
    *   `sender_id`: INTEGER REFERENCES `users`(`id`) NOT NULL
    *   `recipient_id`: INTEGER REFERENCES `users`(`id`) NULL (for one-to-one messages)
    *   `group_id`: INTEGER REFERENCES `groups`(`id`) NULL (for group messages)
    *   `content`: TEXT NOT NULL
    *   `sent_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    *   `is_read`: BOOLEAN DEFAULT FALSE

*   **`groups` table:** (For group chat functionality)
    *   `id`: SERIAL PRIMARY KEY
    *   `name`: VARCHAR(100) NOT NULL
    *   `description`: TEXT
    *   `created_by`: INTEGER REFERENCES `users`(`id`) NOT NULL
    *   `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

*   **`group_members` table:** (Many-to-many relationship between users and groups)
    *   `id`: SERIAL PRIMARY KEY
    *   `user_id`: INTEGER REFERENCES `users`(`id`) NOT NULL
    *   `group_id`: INTEGER REFERENCES `groups`(`id`) NOT NULL
    *   `joined_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    *   UNIQUE (`user_id`, `group_id`)

*   **Constraints/Indexes:**
    *   Indexes on `users.username`, `users.email`.
    *   Indexes on `messages.sender_id`, `messages.recipient_id`, `messages.group_id`, `messages.sent_at`.
    *   Indexes on `groups.name`.
    *   Foreign key constraints as defined above.

## 7. Error Handling Strategy

*   **HTTP API Endpoints:**
    *   Use standard HTTP status codes (e.g., 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error).
    *   FastAPI's `HTTPException` will be used for standard error responses.
    *   Response body for errors: `{"detail": "Error message or description"}`.
*   **WebSocket Communication:**
    *   Define a standard message format for errors, e.g., `{"type": "error", "payload": {"code": <error_code>, "message": "<description>"}}`.
    *   `1xxx` series WebSocket close codes will be used where appropriate.
    *   Examples of error codes:
        *   `1001`: Authentication failed
        *   `1002`: Invalid message format
        *   `1003`: Target user offline (if not queuing messages)
        *   `1004`: Rate limit exceeded
*   **Server-Side Errors:**
    *   All unexpected errors will be caught at a global level and logged.
    *   A generic error message will be sent to the client to avoid exposing sensitive details.

## 8. Logging Strategy

*   **Library:** Standard Python `logging` module, configured by FastAPI/Uvicorn.
*   **Log Levels:**
    *   `DEBUG`: Detailed information, typically of interest only when diagnosing problems. (e.g., raw incoming/outgoing messages, connection attempts).
    *   `INFO`: Confirmation that things are working as expected. (e.g., user login, message sent, server startup).
    *   `WARNING`: An indication that something unexpected happened, or indicative of some problem in the near future (e.g., 'disk space low'). (e.g., failed login attempt, message delivery retry).
    *   `ERROR`: Due to a more serious problem, the software has not been able to perform some function. (e.g., database connection failure, unhandled exception in a request).
    *   `CRITICAL`: A serious error, indicating that the program itself may be unable to continue running.
*   **Log Format:**
    *   `%(asctime)s - %(name)s - %(levelname)s - %(module)s.%(funcName)s:%(lineno)d - %(message)s`
    *   Example: `2023-10-27 10:00:00,000 - uvicorn.access - INFO - main.handle_request:123 - GET /users/me HTTP/1.1 200 OK`
*   **Log Output:**
    *   Console (stdout/stderr) during development.
    *   File-based logging in production (e.g., `/var/log/ccs/ccs.log`) with log rotation.
*   **Key Information to Log:**
    *   Application startup and shutdown.
    *   Incoming requests (HTTP and WebSocket connections) with relevant metadata (IP, user_id if authenticated).
    *   Authentication successes and failures.
    *   Message processing details (sender, receiver/group, timestamp) - potentially at DEBUG level for content.
    *   Database queries (optional, can be verbose, usually enabled at DEBUG level).
    *   All errors and exceptions with stack traces.
    *   Presence updates (user connected/disconnected).

## 9. Security Considerations (Initial Thoughts)

*   **Input Validation:** All incoming data (HTTP request bodies, WebSocket messages) will be strictly validated using Pydantic models.
*   **Password Hashing:** `passlib` library with a strong hashing algorithm (e.g., bcrypt, Argon2).
*   **JWT Security:**
    *   Use HTTPS for all communication.
    *   Strong, secret key for JWT signing.
    *   Short-lived access tokens, implement refresh token mechanism if needed.
*   **WebSocket Security:**
    *   `wss://` (WebSocket Secure) in production.
    *   Authenticate WebSocket connections promptly after establishment.
*   **Rate Limiting:** Consider implementing rate limiting on API endpoints and WebSocket messages to prevent abuse.
*   **Dependency Management:** Keep dependencies up-to-date to patch known vulnerabilities.

## 10. Scalability Considerations (Initial Thoughts)

*   **Statelessness:** Design services to be as stateless as possible to allow horizontal scaling. User session/connection info might need a shared store (e.g., Redis) if scaling beyond one server instance.
*   **Asynchronous Operations:** Leverage Python's `asyncio` and FastAPI's async capabilities to handle many concurrent connections efficiently.
*   **Database Optimization:** Proper indexing, connection pooling. Consider read replicas for the database in the future.
*   **Load Balancing:** A load balancer will be needed if deploying multiple CCS instances.
*   **Message Queues (Advanced):** For very high throughput or to decouple services further, a message queue (e.g., RabbitMQ, Kafka) could be introduced between message reception and processing/delivery.

This document provides a foundational design. Further details will be elaborated during the implementation phase of each module.
