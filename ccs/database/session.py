from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession # For async operations if needed later

from ccs.core.config import settings
from ccs.database.db_models import Base # To create tables

# Synchronous engine (can be used for Alembic migrations or simple scripts)
# Added connect_args for a shorter connection timeout
sync_engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={'connect_timeout': 5} # Timeout in seconds
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

# Asynchronous engine (for FastAPI async endpoints)
# Ensure your DATABASE_URL is compatible with async drivers e.g. postgresql+asyncpg://
async_engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.DEBUG,
    connect_args={'timeout': 5} # For asyncpg, timeout is a top-level param in connect_args for create_async_engine
)
AsyncSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False, # Good default for FastAPI
)

def init_db():
    """
    Initializes the database by creating all tables defined in db_models.
    This is suitable for development/testing. For production, use Alembic migrations.
    """
    print("Attempting to initialize the database and create tables...")
    try:
        Base.metadata.create_all(bind=sync_engine)
        print("Tables created successfully (if they didn't exist).")
    except Exception as e:
        print(f"Error creating tables: {e}")
        print("Please ensure the database server is running and the DATABASE_URL is correct.")
        print(f"DATABASE_URL used: {settings.DATABASE_URL}")

async def get_db_session() -> AsyncSession:
    """
    Dependency to get an async database session.
    Ensures the session is closed after the request.
    """
    if AsyncSessionLocal is None: # Should not happen if async_engine is initialized
        raise RuntimeError("AsyncSessionLocal is not initialized.")
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# If you need a synchronous session for some specific background tasks or scripts:
def get_sync_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# For manual testing of table creation:
# if __name__ == "__main__":
#     print(f"Database URL: {settings.DATABASE_URL}")
#     print("Attempting to create database tables directly using session.py...")
#     # Make sure your database server is running and the database specified in DATABASE_URL exists.
#     init_db()
#     print("Table creation process finished. Check server logs for details.")
