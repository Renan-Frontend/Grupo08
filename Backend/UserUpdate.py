from pydantic import BaseModel
from typing import Optional

class UserUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    senha: Optional[str] = None
    ativo: Optional[bool] = None
    admin: Optional[bool] = None
    role: Optional[str] = None
    nivel: Optional[str] = None
