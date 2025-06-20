from passlib.context import CryptContext

# Use bcrypt for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class PasswordSecurity:
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verifies a plain password against a hashed password."""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        """Hashes a plain password."""
        return pwd_context.hash(password)

# Example Usage:
# from ccs.core.security import PasswordSecurity
#
# hashed_pw = PasswordSecurity.get_password_hash("mysecretpassword")
# print(f"Hashed: {hashed_pw}")
# print(f"Verification successful: {PasswordSecurity.verify_password('mysecretpassword', hashed_pw)}")
# print(f"Verification failure: {PasswordSecurity.verify_password('wrongpassword', hashed_pw)}")
