from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update as sqlalchemy_update, delete as sqlalchemy_delete
from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union

from ccs.database.db_models import Base

ModelType = TypeVar("ModelType", bound=Base)

class CRUDBase(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]):
        """
        CRUD object with default methods to Create, Read, Update, Delete (CRUD).

        **Parameters**

        * `model`: A SQLAlchemy model class
        """
        self.model = model

    async def get(self, db: AsyncSession, id: Any) -> Optional[ModelType]:
        statement = select(self.model).where(self.model.id == id)
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[ModelType]:
        statement = select(self.model).offset(skip).limit(limit)
        result = await db.execute(statement)
        return result.scalars().all()

    async def create(self, db: AsyncSession, *, obj_in: Dict[str, Any]) -> ModelType:
        db_obj = self.model(**obj_in)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: ModelType, obj_in: Union[Dict[str, Any]]
    ) -> ModelType:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else: # Pydantic model
            update_data = obj_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: int) -> Optional[ModelType]:
        obj = await self.get(db, id=id)
        if obj:
            await db.delete(obj)
            await db.commit()
        return obj

# Example of how to use it for a specific model:
# from .db_models import User
# from .schemas import UserCreate, UserUpdate # Assuming you have Pydantic schemas
#
# class CRUDUser(CRUDBase[User]):
#     async def get_by_username(self, db: AsyncSession, *, username: str) -> Optional[User]:
#         statement = select(self.model).where(self.model.username == username)
#         result = await db.execute(statement)
#         return result.scalar_one_or_none()
#
#     # Add more specific methods for the User model here
#
# user_crud = CRUDUser(User)

# This file will contain CRUD (Create, Read, Update, Delete) operations
# for your SQLAlchemy models.
# For each model, you might have a class that inherits from CRUDBase
# or implements its own specific CRUD methods.
#
# Example:
# from .db_models import User
# from .schemas import UserCreateSchema, UserUpdateSchema # You'll need Pydantic schemas
#
# async def get_user(db: AsyncSession, user_id: int):
#     return await db.get(User, user_id)
#
# async def create_user(db: AsyncSession, user: UserCreateSchema):
#     db_user = User(username=user.username, email=user.email, hashed_password=user.hashed_password)
#     db.add(db_user)
#     await db.commit()
#     await db.refresh(db_user)
#     return db_user
#
# ... and so on for update, delete, and other specific queries.
#
# The CRUDBase class provides a generic way to handle most common operations.
# Specific CRUD classes for each model can inherit from it and add model-specific methods.
# For example, `class CRUDUser(CRUDBase[User]): ...`
# This helps in keeping the database interaction logic organized and reusable.
