from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    sent_messages = relationship("Message", foreign_keys="[Message.sender_id]", back_populates="sender")
    received_messages = relationship("Message", foreign_keys="[Message.recipient_id]", back_populates="recipient")
    # groups_created = relationship("Group", back_populates="creator")
    # group_memberships = relationship("GroupMember", back_populates="user")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Nullable for group messages
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)    # Nullable for one-to-one messages
    content = Column(Text, nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    is_read = Column(Boolean, default=False)

    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="received_messages")
    group = relationship("Group", back_populates="messages")

    __table_args__ = (
        # Ensure either recipient_id or group_id is set, but not both (or neither for system messages?)
        # For now, this logic might be better handled at the application level or via more complex SQL check constraints.
        # Basic check that not both are null if we enforce one or the other.
        # CheckConstraint('(recipient_id IS NOT NULL AND group_id IS NULL) OR (recipient_id IS NULL AND group_id IS NOT NULL)', name='chk_message_target'),
    )


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User") #, back_populates="groups_created") # Add back_populates to User if this relation is kept bi-directional
    messages = relationship("Message", back_populates="group")
    members = relationship("GroupMember", back_populates="group")


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User") #, back_populates="group_memberships") # Add back_populates to User if this relation is kept bi-directional
    group = relationship("Group", back_populates="members")

    __table_args__ = (UniqueConstraint('user_id', 'group_id', name='uq_user_group'),)


# Example of how to create tables (typically done in a main script or Alembic migration)
# from sqlalchemy import create_engine
# from ccs.core.config import settings
#
# if __name__ == "__main__":
#     engine = create_engine(settings.DATABASE_URL)
#     Base.metadata.create_all(bind=engine) # This creates tables if they don't exist
#     print("Database tables defined (if not existing, they would be created by uncommenting create_all).")

# Note: Relationships in User model for groups and group_memberships are commented out
# to avoid circular dependency errors until all models are fully defined and potentially
# to simplify. They can be added back if direct back-population from User is desired.
# For now, Group.creator, Group.members, GroupMember.user, and GroupMember.group provide
# the necessary relationships. Message relationships are set up.
