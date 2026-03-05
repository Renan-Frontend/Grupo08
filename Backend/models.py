from typing import Any, Optional

from pydantic import BaseModel, Field


class Oportunidade(BaseModel):
    nome: str
    name: str | None = None
    valor: float | None = None
    etapa: str | None = None
    empresa: str | None = None
    responsavel: str | None = None
    descricao: str | None = None
    ativo: bool = True
    created_at: str | None = None
    criadoPor: str | None = None
    owner: str | None = None
    assignedTo: str | None = None
    createdDate: str | None = None
    endDate: str | None = None
    status: str | None = None
    stages: list[dict[str, Any]] | None = None
    infoRows: list[dict[str, Any]] | None = None
    timelineItems: list[dict[str, Any]] | None = None
    showPipeline: bool | None = None
    showTopico: bool | None = None
    showTimeline: bool | None = None
    pipelineTitle: str | None = None
    pipelineSubtitle: str | None = None
    bpmn: dict[str, Any] | None = None
    stageIndex: int | None = None
    currentNodeId: str | None = None
    activeNodeId: str | None = None
    bpmnNodeId: str | None = None
    bpmnCurrentNodeId: str | None = None
    sourceNodeId: str | None = None


class UserOut(BaseModel):
    id: int
    nome: str
    email: str
    ativo: bool
    created_at: str
    admin: bool = False
    role: str = "user"
    nivel: str = "1"
    cargo: str = ""


class User(BaseModel):
    nome: str
    email: str
    senha: str
    ativo: bool = True
    admin: bool = False
    role: str = "user"
    nivel: str = "1"
    cargo: str = ""


class UserUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    senha: Optional[str] = None
    ativo: Optional[bool] = None
    admin: Optional[bool] = None
    role: Optional[str] = None
    nivel: Optional[str] = None
    cargo: Optional[str] = None


class Entidade(BaseModel):
    categoria: str
    id: int | None = None
    nome: str
    descricao: str
    tipoEntidade: str | None = None
    isPrimaryEntity: bool | None = None
    atributoChave: str | None = None
    campos: list[dict[str, Any]] = Field(default_factory=list)
    numeroRelacionamentos: int | None = None
    bpmnUsageCount: int | None = None
    ativo: bool = True
    created_at: str | None = None
    updated_at: str | None = None
    criadoPor: str | None = None


class AuthRequest(BaseModel):
    email: str
    senha: str
