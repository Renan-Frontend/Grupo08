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
    contacts: list[dict[str, Any]] | None = None
    products: list[dict[str, Any]] | None = None
    quotes: list[dict[str, Any]] | None = None
    probabilidade: Any | None = None
    origemLead: str | None = None
    motivoFechamento: str | None = None
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
    papelNegocio: str | None = None  # "contato" | "processo" | None
    isPrimaryEntity: bool | None = None
    atributoChave: str | None = None
    campos: list[dict[str, Any]] = Field(default_factory=list)
    numeroRelacionamentos: int | None = None
    bpmnUsageCount: int | None = None
    ativo: bool = True
    created_at: str | None = None
    updated_at: str | None = None
    criadoPor: str | None = None


class Registro(BaseModel):
    id: int | None = None
    entidadeId: Any = None
    entidadeNome: str
    papelNegocio: str  # "contato" | "processo"
    titulo: str | None = None
    dados: dict[str, Any] = Field(default_factory=dict)
    ativo: bool = True
    created_at: str | None = None


class Contato(BaseModel):
    nome: str
    cargo: str | None = None
    email: str | None = None
    telefone: str | None = None
    empresa: str | None = None
    descricao: str | None = None
    notas: str | None = None
    isPrimary: bool = False
    entidadeId: int | None = None
    entidadeNome: str | None = None
    opportunityId: int | None = None
    opportunityName: str | None = None
    ativo: bool = True
    created_at: str | None = None
    updated_at: str | None = None
    criadoPor: str | None = None


class AuthRequest(BaseModel):
    email: str
    senha: str


class Lead(BaseModel):
    nome: str
    email: str
    telefone: str | None = None
    empresa: str | None = None
    cargo: str | None = None
    origem: str | None = None
    stage: str | None = "novo"
    valor_estimado: float | None = None
    descricao: str | None = None
    responsavel: str | None = None
    data_criacao: str | None = None
    data_contato: str | None = None
    notas: list[dict[str, Any]] | None = None
    ativo: bool = True
    opp_id: str | None = None


class Activity(BaseModel):
    titulo: str
    referencia: str | None = None
    descricao: str | None = None
    tipo: str = "nota"  # call, email, meeting, task, note
    data_atividade: str | None = None  # data/hora do evento
    responsavel: str | None = None
    usuario_criador: str | None = None
    entidade_tipo: str | None = None  # prospecto, contato, oportunidade
    entidade_id: str | None = None
    status: str = "planejado"  # planejado, concluido, cancelado
    resultado: str | None = None  # para calls/meetings
    proximos_passos: str | None = None
    duracao_minutos: int | None = None
    local: str | None = None  # para meetings
    participantes: list[str] | None = None
    data_criacao: str | None = None
    data_atualizacao: str | None = None
    anexos: list[str] | None = None
    tags: list[str] | None = None
    extra: dict | None = None
