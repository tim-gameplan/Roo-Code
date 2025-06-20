from fastapi import FastAPI
from ccs.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    # version="0.1.0", # Optional: if you want to version your API
)

@app.on_event("startup")
async def startup_event():
    """
    Actions to perform on application startup.
    For example, initializing database connections, loading ML models, etc.
    """
    print("Application startup...")
    # Initialize database (create tables if they don't exist)
    # In a production environment, you'd typically use Alembic for migrations.
    # from ccs.database.session import init_db
    # if settings.DEBUG: # Optionally restrict table creation to debug mode
    #     print("DEBUG mode: Initializing database...")
    #     init_db() # <--- TEMPORARILY COMMENTED OUT FOR TESTING
    # else:
    #     print("PRODUCTION mode: Skipping automatic database initialization.")
    print("Skipping database initialization for testing.") # Added test message

    print(f"Running in {'DEBUG' if settings.DEBUG else 'PRODUCTION'} mode.")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Actions to perform on application shutdown.
    For example, closing database connections.
    """
    print("Application shutdown...")
    # Here you might close database connections
    # from ccs.database.session import engine
    # await engine.dispose() # If using an async engine that supports dispose


@app.get("/", tags=["Health Check"])
async def root():
    """
    Root endpoint for health check.
    """
    return {"message": f"Welcome to {settings.APP_NAME}"}

# Placeholder for future routers
# from ccs.auth import auth_routes
# from ccs.users import user_routes # If you create separate user HTTP routes
# from ccs.messaging import websocket_routes
#
# app.include_router(auth_routes.router, prefix="/auth", tags=["Authentication"])
# app.include_router(websocket_routes.router) # WebSocket router might not have a prefix

if __name__ == "__main__":
    import uvicorn
    # This is for development purposes only.
    # In production, you would run Uvicorn directly or via a process manager.
    # Example: uvicorn ccs.main:app --host 0.0.0.0 --port 8000 --reload
    uvicorn.run(app, host="0.0.0.0", port=8000)
