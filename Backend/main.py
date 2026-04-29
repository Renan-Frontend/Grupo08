import os
try:
    dotenv_module = __import__("dotenv", fromlist=["load_dotenv"])
    load_dotenv = getattr(dotenv_module, "load_dotenv", None)
    if callable(load_dotenv):
        load_dotenv()
except Exception:
    pass
import json
import re
import uuid
import threading
import time
import requests
from datetime import datetime, timedelta, timezone
from collections import defaultdict, deque
from typing import Any, cast
try:
    import psycopg2  # type: ignore[reportMissingModuleSource]
    from psycopg2.extras import Json  # type: ignore[reportMissingModuleSource]
except Exception:
    psycopg2 = None
    Json = None
from fastapi import FastAPI, HTTPException, Depends, Header, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from app_utils import (
    now_iso,
    hash_password,
    hash_password_bcrypt,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_jwt,
    is_valid_email,
    paginated_users_response,
    load_json,
    save_json,
    get_role_permissions,
    ROLE_PERMISSIONS,
)
from models import Oportunidade, UserOut, User, UserUpdate, Entidade, AuthRequest, Lead, Activity, Registro, Contato


SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "").strip()
USE_SUPABASE_DB = bool(SUPABASE_DB_URL and psycopg2 is not None)
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "3"))
USERS_TABLE = "users_store"
ENTIDADES_TABLE = "entidades_store"
OPORTUNIDADES_TABLE = "oportunidades_store"
DOCUMENTOS_TABLE = "documentos_store"
AI_AUDIT_TABLE = "ai_audit_store"
AI_MAX_ACTIONS_PER_MINUTE = int(os.getenv("AI_MAX_ACTIONS_PER_MINUTE", "20"))
AI_PROVIDER = os.getenv("AI_PROVIDER", "groq").strip().lower() or "groq"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
AI_LLM_TIMEOUT_SECONDS = int(os.getenv("AI_LLM_TIMEOUT_SECONDS", "20"))
BPMN_IA_BASE_URL = os.getenv("BPMN_IA_BASE_URL", "http://127.0.0.1:8080").strip().rstrip("/")
BPMN_IA_MODEL = os.getenv("BPMN_IA_MODEL", "gpt-4.1").strip() or "gpt-4.1"
AI_ENTITY_NAME_MAX_LENGTH = 48
AI_ACTIVITY_NAME_MAX_LENGTH = 56
AI_CONDITIONAL_NAME_MAX_LENGTH = 56

# Reentrant lock avoids self-deadlocks when a code path re-enters persistence helpers.
_data_lock = threading.RLock()
BPMN_EDITOR_STATE_TABLE = "bpmn_editor_state_store"
_ai_action_timestamps: dict[int, deque[float]] = defaultdict(deque)

if SUPABASE_DB_URL and psycopg2 is None:
    print("[WARN] SUPABASE_DB_URL configurada, mas psycopg2 não está disponível. Usando JSON local.")


def _require_db_dependencies():
    if psycopg2 is None or Json is None:
        raise RuntimeError("Dependencias do banco nao estao disponiveis")
    return psycopg2, Json


def get_db_connection():
    if not USE_SUPABASE_DB:
        raise RuntimeError("Supabase DB não está habilitado")

    db_driver, _ = _require_db_dependencies()

    db_url = SUPABASE_DB_URL
    if "sslmode=" not in db_url.lower():
        separator = "&" if "?" in db_url else "?"
        db_url = f"{db_url}{separator}sslmode=require"

    return db_driver.connect(db_url, connect_timeout=DB_CONNECT_TIMEOUT)


def _merge_record_payload(record_id, payload):
    payload_dict = payload if isinstance(payload, dict) else {}
    return {
        **payload_dict,
        "id": int(record_id),
    }


def load_collection(file_path, table_name, fallback):
    if not USE_SUPABASE_DB:
        return load_json(file_path, fallback)

    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT id, payload FROM {table_name} ORDER BY id ASC"
            )
            rows = cursor.fetchall()

    return [_merge_record_payload(row[0], row[1]) for row in rows]


def save_collection(file_path, table_name, rows):
    safe_rows = rows if isinstance(rows, list) else []
    if not USE_SUPABASE_DB:
        save_json(file_path, safe_rows)
        return

    _, json_adapter = _require_db_dependencies()

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(f"DELETE FROM {table_name}")

                for item in safe_rows:
                    if not isinstance(item, dict):
                        continue

                    raw_id = item.get("id")
                    if raw_id is None:
                        continue

                    try:
                        item_id = int(raw_id)
                    except Exception:
                        continue

                    payload = {**item, "id": item_id}
                    cursor.execute(
                        f"INSERT INTO {table_name} (id, payload) VALUES (%s, %s)",
                        (item_id, json_adapter(payload)),
                    )

            conn.commit()
    except Exception as exc:
        _supabase_save_failed(exc)
        save_json(file_path, safe_rows)


def _supabase_save_failed(exc):
    """Mark Supabase as unavailable and log the failure."""
    global USE_SUPABASE_DB
    print(f"[WARN] Falha ao salvar no Supabase ({exc}). Usando JSON local.")
    USE_SUPABASE_DB = False


def load_bpmn_editor_state(file_path, fallback):
    if not USE_SUPABASE_DB:
        return load_json(file_path, fallback)

    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT payload FROM {BPMN_EDITOR_STATE_TABLE} WHERE state_key = %s",
                ("default",),
            )
            row = cursor.fetchone()

    if not row:
        return fallback

    payload = row[0]
    return payload if isinstance(payload, dict) else fallback


def save_bpmn_editor_state(file_path, state):
    safe_state = state if isinstance(state, dict) else {}
    if not USE_SUPABASE_DB:
        save_json(file_path, safe_state)
        return

    _, json_adapter = _require_db_dependencies()
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    INSERT INTO {BPMN_EDITOR_STATE_TABLE} (state_key, payload)
                    VALUES (%s, %s)
                    ON CONFLICT (state_key)
                    DO UPDATE SET payload = EXCLUDED.payload
                    """,
                    ("default", json_adapter(safe_state)),
                )
            conn.commit()
    except Exception as exc:
        _supabase_save_failed(exc)
        save_json(file_path, safe_state)


def load_ai_audit_data(file_path):
    return load_collection(file_path, AI_AUDIT_TABLE, [])


def save_ai_audit_data(file_path, rows):
    save_collection(file_path, AI_AUDIT_TABLE, rows)


def _is_read_only_user(current_user: dict[str, Any]) -> bool:
    user = current_user if isinstance(current_user, dict) else {}
    if bool(user.get("admin", False) or user.get("role") == "admin"):
        return False

    nivel = str(user.get("nivel", "1")).strip()
    return nivel == "1"


def _rate_limit_ai_actions(user_id: int):
    now_ts = time.time()
    window_start = now_ts - 60
    queue = _ai_action_timestamps[user_id]

    while queue and queue[0] < window_start:
        queue.popleft()

    if len(queue) >= AI_MAX_ACTIONS_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="Limite de ações de IA por minuto excedido.",
        )

    queue.append(now_ts)


def _execute_ai_action(action: dict[str, Any], current_user: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(action, dict):
        raise HTTPException(status_code=400, detail="Ação inválida para execução.")

    action_type = str(action.get("type") or "").strip()
    payload_raw = action.get("payload")
    payload = payload_raw if isinstance(payload_raw, dict) else {}

    if action_type == "no_write_preview":
        return {
            "type": action_type,
            "status": "skipped",
            "result": payload,
        }

    if _is_read_only_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="Seu nivel de acesso permite apenas visualizacao. Execucao da IA bloqueada.",
        )

    if action_type == "create_entidade":
        entidade_data = {
            "categoria": str(payload.get("categoria") or "IA"),
            "nome": str(payload.get("nome") or "Entidade IA").strip(),
            "descricao": str(payload.get("descricao") or "").strip(),
            "tipoEntidade": _normalize_entity_type(str(payload.get("tipoEntidade") or ""), default="processo"),
            "campos": payload.get("campos") if isinstance(payload.get("campos"), list) else [],
            "criadoPor": current_user.get("nome") or "IA",
        }
        created = create_entidade(Entidade(**entidade_data))
        return {
            "type": action_type,
            "status": "ok",
            "result": created,
        }

    if action_type == "create_oportunidade":
        oportunidade_data = {
            "nome": _unique_opportunity_name(str(payload.get("nome") or "Oportunidade IA").strip()),
            "descricao": str(payload.get("descricao") or "Gerada por IA").strip(),
            "etapa": str(payload.get("etapa") or "Mapeamento"),
            "responsavel": str(payload.get("responsavel") or current_user.get("nome") or "IA"),
            "status": str(payload.get("status") or "Em andamento"),
            "criadoPor": current_user.get("nome") or "IA",
        }
        created = create_oportunidade(Oportunidade(**oportunidade_data))
        return {
            "type": action_type,
            "status": "ok",
            "result": created,
        }

    if action_type == "update_bpmn_state":
        created = update_bpmn_editor_state(payload)
        synced_opportunity = _sync_bpmn_state_to_opportunity_table(created, current_user)
        return {
            "type": action_type,
            "status": "ok",
            "result": created,
            "syncedOpportunity": synced_opportunity,
        }

    raise HTTPException(status_code=400, detail=f"Tipo de acao nao suportado: {action_type}")

def _extract_json_object(raw_text: str) -> dict[str, Any] | None:
    text = str(raw_text or "").strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None

    candidate = text[start : end + 1]
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _normalize_bpmn_stage_type(raw_value: Any, default: str = "task") -> str:
    normalized = str(raw_value or "").strip().lower()
    if not normalized:
        return default

    if normalized in {"task", "tarefa", "atividade", "activity"}:
        return "task"
    if normalized in {"condicional", "gateway", "decision", "decisao", "decisão"}:
        return "condicional"
    if normalized in {"dados", "dado", "data", "entidade", "entity", "informacao", "informação"}:
        return "dados"
    return default


def _stage_type_to_node_type(stage_type: Any) -> str:
    normalized = _normalize_bpmn_stage_type(stage_type)
    if normalized == "condicional":
        return "condicional"
    if normalized == "dados":
        return "entidade"
    return "task"


def _looks_like_data_stage(stage_name: str) -> bool:
    normalized = str(stage_name or "").strip().lower()
    if not normalized:
        return False

    # Action-oriented steps should default to activity, not data.
    action_hints = (
        "cria",
        "criar",
        "registra",
        "registrar",
        "analisa",
        "analisar",
        "aprova",
        "aprovar",
        "valida",
        "validar",
        "finaliza",
        "finalizar",
        "encerra",
        "encerrar",
        "envia",
        "enviar",
        "recebe",
        "receber",
        "revisa",
        "revisar",
        "altera",
        "alterar",
        "atualiza",
        "atualizar",
        "consulta",
        "consultar",
    )
    if any(hint in normalized for hint in action_hints):
        return False

    data_hints = (
        "cadastro",
        "registr",
        "preench",
        "formulario",
        "formulário",
        "dados",
        "dado",
        "anexo",
        "arquivo",
        "document",
        "campo",
        "campos",
        "tabela",
        "planilha",
        "schema",
        "estrutura",
        "orcamento",
        "orçamento",
        "base de dados",
        "banco de dados",
    )
    return any(hint in normalized for hint in data_hints)


def _looks_like_activity_stage(stage_name: str) -> bool:
    normalized = str(stage_name or "").strip().lower()
    if not normalized:
        return False

    action_hints = (
        "cria",
        "criar",
        "registra",
        "registrar",
        "analisa",
        "analisar",
        "aprova",
        "aprovar",
        "valida",
        "validar",
        "finaliza",
        "finalizar",
        "encerra",
        "encerrar",
        "envia",
        "enviar",
        "recebe",
        "receber",
        "revisa",
        "revisar",
        "altera",
        "alterar",
        "atualiza",
        "atualizar",
        "executa",
        "executar",
        "processa",
        "processar",
    )
    return any(hint in normalized for hint in action_hints)


def _extract_participant_activity_pairs(goal: str) -> list[dict[str, str]]:
    text = str(goal or "")
    if not text:
        return []

    pairs: list[dict[str, str]] = []
    seen: set[str] = set()

    for match in re.finditer(
        r"(?:^|\n)\s*[-•*]?\s*([A-Za-zÀ-ÿ][^:\n\r]{1,40})\s*:\s*([^\n\r]+)",
        text,
        flags=re.IGNORECASE,
    ):
        participante = " ".join(str(match.group(1) or "").strip().split())
        descricao = " ".join(str(match.group(2) or "").strip().split())
        if not participante or not descricao:
            continue

        normalized_participant = _normalize_ai_text(participante)
        if normalized_participant in {"sim", "nao", "não", "yes", "no"}:
            continue

        key = f"{_normalize_ai_text(participante)}::{_normalize_ai_text(descricao)}"
        if key in seen:
            continue
        seen.add(key)

        pairs.append({"participante": participante, "descricao": descricao})

    return pairs


def _split_stage_participant_activity(stage_text: str) -> tuple[str, str]:
    text = " ".join(str(stage_text or "").strip().split())
    if not text:
        return "", ""

    match = re.match(r"^([A-Za-zÀ-ÿ][^:]{1,40})\s*:\s*(.+)$", text)
    if not match:
        return "", ""

    participante = " ".join(str(match.group(1) or "").strip().split())
    descricao = " ".join(str(match.group(2) or "").strip().split())

    normalized_participant = _normalize_ai_text(participante)
    if normalized_participant in {"sim", "nao", "não", "yes", "no"}:
        return "", text

    return participante, descricao


def _activity_name_from_description(description: str, index: int) -> str:
    text = _normalize_stage_label_text(description)
    if not text:
        return f"Atividade {index}"

    first_token_match = re.match(r"^([A-Za-zÀ-ÿ]+)", text)
    first_token = str(first_token_match.group(1) or "").strip() if first_token_match else ""
    normalized_token = _normalize_ai_text(first_token)

    verb_map = {
        "cria": "Criar",
        "registra": "Registrar",
        "analisa": "Analisar",
        "decide": "Decidir",
        "valida": "Validar",
        "recebe": "Receber",
        "envia": "Enviar",
        "gera": "Gerar",
        "solicita": "Solicitar",
        "aprova": "Aprovar",
        "rejeita": "Rejeitar",
        "cancela": "Cancelar",
        "verifica": "Verificar",
        "processa": "Processar",
    }

    if normalized_token in verb_map:
        return verb_map[normalized_token]

    summarized = _summarize_name(text, 28, f"Atividade {index}")
    return summarized[:1].upper() + summarized[1:] if summarized else f"Atividade {index}"


def _activity_description_from_text(description: str, index: int) -> str:
    text = _normalize_stage_label_text(description)
    if not text:
        return f"Executa a atividade {index}."
    return text[:1].upper() + text[1:]


def _looks_like_decision_stage(stage_name: str) -> bool:
    normalized = str(stage_name or "").strip().lower()
    if not normalized:
        return False

    if "?" in normalized:
        return True

    decision_hints = (
        "decisao",
        "decisão",
        "gateway",
        "xor",
        "sim ou nao",
        "sim ou não",
        "aprovado",
        "reprovado",
        "aprovar",
        "reprovar",
        "defer",
        "indefer",
        "validacao e decisao",
        "validação e decisão",
    )
    if any(hint in normalized for hint in decision_hints):
        return True

    return bool(re.search(r"\b(se|caso)\b", normalized))


def _build_non_data_stage_name(stage_type: str, stage_name: str, index: int) -> str:
    normalized_type = _normalize_bpmn_stage_type(stage_type, default="task")
    raw_text = _normalize_stage_label_text(stage_name)

    if not raw_text:
        if normalized_type == "condicional":
            return f"Decisao {index}"
        return f"Atividade {index}"

    base = re.sub(r"^\d+[\.)]\s*", "", raw_text)
    base = re.sub(r"^(decis[aã]o(\s*xor)?|condicional|gateway)\s*:?\s*", "", base, flags=re.IGNORECASE).strip()
    base = re.sub(r"\s*\(xor\)\s*", " ", base, flags=re.IGNORECASE).strip()
    base = base.strip(" .;,-")

    if normalized_type == "condicional" and "?" in base:
        question_head = base.split("?", 1)[0].strip(" .;,-")
        candidate = f"{question_head}?" if question_head else ""
    else:
        candidate = base or raw_text

    if normalized_type == "condicional":
        normalized_candidate = _normalize_ai_text(re.sub(r"[^a-zA-Z0-9\s]", " ", candidate))
        generic_decision_names = {
            "decisao",
            "condicional",
            "gateway",
            "xor",
            "decisao xor",
            "validacao decisao",
            "validacao",
            "avaliacao",
        }

        if not candidate or normalized_candidate in generic_decision_names:
            cleaned = re.sub(
                r"\b(decis[aã]o|condicional|gateway|xor|valida[cç][aã]o|avaliac[aã]o|etapa)\b",
                " ",
                raw_text,
                flags=re.IGNORECASE,
            )
            cleaned = re.sub(r"\s+", " ", cleaned).strip(" .;,:-")

            if cleaned:
                candidate = cleaned if "?" in cleaned else f"{cleaned}?"
            else:
                candidate = "Avaliar condicao?"

    candidate = candidate.strip(" .;,-")
    if candidate:
        candidate = candidate[:1].upper() + candidate[1:]

    if not candidate:
        candidate = f"Decisao {index}" if normalized_type == "condicional" else f"Atividade {index}"

    return _sanitize_node_name_by_type(candidate, _stage_type_to_node_type(normalized_type), index)


def _fit_words_with_limit(words: list[str], max_length: int) -> str:
    selected: list[str] = []
    current_size = 0
    for word in words:
        token = str(word or "").strip()
        if not token:
            continue

        next_size = current_size + (1 if selected else 0) + len(token)
        if next_size > max_length:
            break

        selected.append(token)
        current_size = next_size

    return " ".join(selected).strip()


def _normalize_stage_label_text(value: Any) -> str:
    text = " ".join(str(value or "").strip().split())
    if not text:
        return ""

    # Remove prompt/instruction artifacts that should not appear as stage names.
    text = re.sub(r"\b(?:o\s+)?bpmn\s+deve\s+incluir\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bdeve\s+incluir\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bfluxos?\s+de\b.*$", "", text, flags=re.IGNORECASE)

    clauses = [part.strip(" -;,\t") for part in re.split(r"[.;:]+", text) if str(part).strip()]
    if clauses:
        preferred = [part for part in clauses if "bpmn" not in part.lower()]
        text = preferred[0] if preferred else clauses[0]

    text = re.sub(r"^[-*\u2022]+\s*", "", text).strip(" .;,-")
    return text


def _is_generic_conditional_label(value: Any) -> bool:
    normalized = _normalize_ai_text(re.sub(r"[^a-zA-Z0-9\s]", " ", str(value or "")))
    generic_names = {
        "decisao",
        "decisao xor",
        "condicional",
        "gateway",
        "xor",
        "avaliar condicao",
        "avaliar condicao xor",
        "caminho",
    }
    return not normalized or normalized in generic_names


def _normalize_gateway_type(value: Any, default: str = "xor") -> str:
    normalized = _normalize_ai_text(value)
    if not normalized:
        return default

    xor_aliases = {
        "xor",
        "exclusive",
        "exclusivo",
        "decisao exclusiva",
        "gateway exclusivo",
    }
    and_aliases = {
        "and",
        "paralelo",
        "parallel",
        "gateway paralelo",
        "conjuntivo",
        "todos",
    }
    or_aliases = {
        "or",
        "inclusivo",
        "inclusive",
        "gateway inclusivo",
        "alternativo",
        "qualquer",
    }

    if normalized in xor_aliases:
        return "xor"
    if normalized in and_aliases:
        return "and"
    if normalized in or_aliases:
        return "or"
    return default


def _conditional_description_from_name(name: str) -> str:
    clean_name = " ".join(str(name or "").strip().strip("?").split())
    if not clean_name:
        return "Ponto de decisao do processo."

    # Extrair o assunto da decisão sem explicar caminhos SIM/NAO
    # (o próprio BPMN já mostra os caminhos)
    normalized = clean_name[:1].upper() + clean_name[1:] if clean_name else ""
    return f"Decisao: {normalized}."


def _infer_gateway_type_from_text(
    conditional_name: str,
    conditional_description: str,
    outgoing_count: int,
    explicit_gateway: Any = "",
) -> str:
    explicit = _normalize_gateway_type(explicit_gateway, default="")
    if explicit in {"xor", "and", "or"}:
        return explicit

    text = _normalize_ai_text(f"{conditional_name} {conditional_description}")

    and_hints = (
        "paralel",
        "simultane",
        "ao mesmo tempo",
        "todos",
        "ambos",
        "conjunt",
    )
    or_hints = (
        " ou ",
        "qualquer",
        "uma das",
        "pelo menos",
        "alternativ",
        "inclusiv",
    )

    if any(hint in text for hint in and_hints):
        return "and"
    if any(hint in text for hint in or_hints):
        return "or"
    if outgoing_count >= 3:
        return "or"
    return "xor"


def _summarize_name(value: Any, max_length: int, fallback: str) -> str:
    text = _normalize_stage_label_text(value)
    if not text:
        return fallback

    if len(text) <= max_length:
        return text

    words = [item for item in re.split(r"\s+", text) if item]
    if not words:
        return fallback

    stopwords = {
        "de",
        "da",
        "do",
        "das",
        "dos",
        "e",
        "em",
        "para",
        "com",
        "por",
        "na",
        "no",
        "nas",
        "nos",
        "a",
        "o",
        "as",
        "os",
        "the",
        "of",
        "to",
        "for",
        "and",
    }

    key_words = [
        word
        for word in words
        if _normalize_ai_text(re.sub(r"[^a-zA-Z0-9]", "", word)) not in stopwords
    ]

    summary_from_key_words = _fit_words_with_limit(key_words, max_length)
    if summary_from_key_words:
        return summary_from_key_words

    summary_from_original = _fit_words_with_limit(words, max_length)
    if summary_from_original:
        return summary_from_original

    # Edge case: single giant token without spaces.
    return str(words[0])[:max_length].strip() or fallback


def _sanitize_node_name_by_type(value: Any, node_type: str, index: int) -> str:
    value = _normalize_stage_label_text(value)
    normalized_node_type = str(node_type or "").strip().lower()
    if normalized_node_type == "condicional":
        summarized = _summarize_name(value, AI_CONDITIONAL_NAME_MAX_LENGTH, "Validar condicao?")
        if _is_generic_conditional_label(summarized):
            return "Validar condicao?"
        return summarized
    if normalized_node_type == "task":
        return _summarize_name(value, AI_ACTIVITY_NAME_MAX_LENGTH, f"Atividade {index}")
    return _summarize_name(value, AI_ENTITY_NAME_MAX_LENGTH, f"Entidade {index}")


def _build_non_data_stage_description(stage_type: str, stage_name: str, summary_name: str) -> str:
    normalized_type = _normalize_bpmn_stage_type(stage_type, default="task")
    summary = " ".join(str(summary_name or "").strip().split())
    detail = " ".join(str(stage_name or "").strip().split())

    if not detail and not summary:
        return ""
    if not detail:
        return summary
    if not summary:
        return detail

    normalized_summary = _normalize_ai_text(re.sub(r"[^a-zA-Z0-9\s]", " ", summary))
    normalized_detail = _normalize_ai_text(re.sub(r"[^a-zA-Z0-9\s]", " ", detail))

    if normalized_summary == normalized_detail:
        if normalized_type == "condicional":
            return f"Decisao: {summary}."
        return "Executa a atividade para avançar o processo."

    summary_tokens = {token for token in normalized_summary.split() if token}
    detail_tokens = {token for token in normalized_detail.split() if token}
    overlap = len(summary_tokens.intersection(detail_tokens))
    min_size = min(len(summary_tokens), len(detail_tokens)) if summary_tokens and detail_tokens else 0

    # If summary and detail are semantically almost the same, keep only detail.
    if min_size > 0 and overlap >= min_size:
        if normalized_type == "condicional":
            return f"Decisao: {summary}."
        return "Executa a atividade para avançar o processo."

    return f"{summary}. {detail}"


def _default_entity_description(entity_name: str, entity_type: str = "", process_name: str = "") -> str:
    """Gera uma descrição de fallback sensata para uma entidade quando o LLM não fornece uma."""
    name = str(entity_name or "").strip()
    etype = str(entity_type or "").strip().lower()
    proc = str(process_name or "").strip()

    if not name:
        return "Participa do processo como elemento de suporte."

    norm = _normalize_ai_text(name)

    # Entidades externas conhecidas
    if norm in ("cliente", "clientes"):
        return f"Pessoa ou empresa que solicita o serviço{f' no processo de {proc}' if proc else ''}."
    if norm in ("fornecedor", "fornecedores"):
        return f"Empresa responsável pelo fornecimento de itens{f' para o processo de {proc}' if proc else ''}."
    if norm in ("parceiro", "parceiros"):
        return f"Empresa ou pessoa parceira que participa{f' do processo de {proc}' if proc else ''}."
    if norm in ("usuario", "usuarios"):
        return f"Usuário que interage com o sistema{f' no contexto de {proc}' if proc else ''}."
    if norm in ("funcionario", "funcionarios", "colaborador", "colaboradores"):
        return f"Colaborador responsável por executar etapas{f' no processo de {proc}' if proc else ''}."
    if norm in ("gestor", "gestores", "aprovador", "aprovadores"):
        return f"Responsável por aprovar ou validar etapas{f' no processo de {proc}' if proc else ''}."

    # Por tipo de entidade
    if etype == "principal":
        return f"Objeto central do processo{f' de {proc}' if proc else ''}; inicia e conduz o fluxo principal."
    if etype == "associativa":
        return f"Relaciona entidades do processo{f' de {proc}' if proc else ''}."
    if etype == "externa":
        return f"Entidade externa que interage com o processo{f' de {proc}' if proc else ''}."

    # Fallback genérico
    return f"Participa do processo{f' de {proc}' if proc else ''} como elemento de suporte."


def _build_default_entity_fields(entity_name: str) -> list[dict[str, Any]]:
    normalized = re.sub(r"[^a-z0-9]+", "_", _normalize_ai_text(entity_name)).strip("_")
    if not normalized:
        normalized = "registro"
    normalized = normalized[:24]

    return [
        {
            "nome": f"id_{normalized}",
            "tipo": "INT",
            "obrigatorio": True,
            "keyType": "PK",
            "referencia": "",
        },
        {
            "nome": "nome",
            "tipo": "VARCHAR(100)",
            "obrigatorio": True,
            "keyType": "NORMAL",
            "referencia": "",
        },
        {
            "nome": "descricao",
            "tipo": "TEXT",
            "obrigatorio": False,
            "keyType": "NORMAL",
            "referencia": "",
        },
    ]


def _build_default_entity_fields_with_references(
    entity_name: str,
    entity_index: int,
    all_entity_names: list[str],
) -> list[dict[str, Any]]:
    fields = _build_default_entity_fields(entity_name)
    if entity_index <= 1:
        return fields

    reference_target_name = str((all_entity_names or [""])[0] or "").strip()
    if not reference_target_name:
        return fields

    normalized_current = re.sub(r"[^a-z0-9]+", "_", _normalize_ai_text(entity_name)).strip("_")
    normalized_target = re.sub(r"[^a-z0-9]+", "_", _normalize_ai_text(reference_target_name)).strip("_")
    if not normalized_target:
        return fields
    if normalized_current and normalized_current == normalized_target:
        return fields

    target_pk_field = f"id_{normalized_target[:24]}"
    fk_field_name = target_pk_field

    existing_field_names = {
        normalizeText
        for normalizeText in (
            _normalize_ai_text(str(item.get("nome") or "")) for item in fields if isinstance(item, dict)
        )
        if normalizeText
    }
    if _normalize_ai_text(fk_field_name) in existing_field_names:
        return fields

    fields.append(
        {
            "nome": fk_field_name,
            "tipo": "INT",
            "obrigatorio": False,
            "keyType": "FK",
            "referencia": f"{reference_target_name}.{target_pk_field}",
        }
    )
    return fields


def _sanitize_entity_fields(
    fields_raw: Any,
    entity_name: str,
    fallback_fields: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    raw_fields: list[Any] = fields_raw if isinstance(fields_raw, list) else []
    safe_fields: list[dict[str, Any]] = []
    seen: set[str] = set()

    for field in raw_fields:
        if not isinstance(field, dict):
            continue

        nome = " ".join(str(field.get("nome") or "").strip().split())
        if not nome:
            continue

        key = _normalize_ai_text(nome)
        if not key or key in seen:
            continue
        seen.add(key)

        key_type = str(field.get("keyType") or "NORMAL").strip().upper()
        if key_type not in {"PK", "FK", "NORMAL"}:
            key_type = "NORMAL"

        safe_fields.append(
            {
                "nome": nome,
                "tipo": str(field.get("tipo") or "TEXT").strip() or "TEXT",
                "obrigatorio": bool(field.get("obrigatorio") is True),
                "keyType": key_type,
                "referencia": str(field.get("referencia") or "").strip(),
            }
        )

    if safe_fields:
        return safe_fields

    defaults = fallback_fields if isinstance(fallback_fields, list) and fallback_fields else _build_default_entity_fields(entity_name)
    return [
        {
            "nome": str(item.get("nome") or "campo").strip(),
            "tipo": str(item.get("tipo") or "TEXT").strip() or "TEXT",
            "obrigatorio": bool(item.get("obrigatorio") is True),
            "keyType": str(item.get("keyType") or "NORMAL").strip().upper(),
            "referencia": str(item.get("referencia") or "").strip(),
        }
        for item in defaults
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    ]


def _ensure_bpmn_entity_nodes(
    payload: dict[str, Any],
    entity_names: list[str],
    fallback_id: int,
) -> dict[str, Any]:
    base_payload = payload if isinstance(payload, dict) else {}
    raw_nodes_value = base_payload.get("nodes")
    raw_stages_value = base_payload.get("stages")
    nodes_raw: list[Any] = cast(list[Any], raw_nodes_value) if isinstance(raw_nodes_value, list) else []
    stages_raw: list[Any] = cast(list[Any], raw_stages_value) if isinstance(raw_stages_value, list) else []

    nodes = [dict(item) for item in nodes_raw if isinstance(item, dict)]
    stages = [dict(item) for item in stages_raw if isinstance(item, dict)]

    existing_entity_names = {
        _normalize_ai_text(
            str(node.get("entidadeNome") or node.get("label") or "")
        )
        for node in nodes
        if _stage_type_to_node_type(node.get("nodeType") or "") == "entidade"
    }

    max_x = 120.0
    if nodes:
        try:
            max_x = max(float(node.get("x") or 120.0) for node in nodes)
        except Exception:
            max_x = 120.0

    added_count = 0
    for entity_name in entity_names:
        normalized = _normalize_ai_text(entity_name)
        if not normalized or normalized in existing_entity_names:
            continue

        added_count += 1
        node_index = len(nodes) + 1
        node_id = f"ai-entity-{fallback_id}-{node_index}"
        nodes.append(
            {
                "id": node_id,
                "label": entity_name,
                "nodeType": "entidade",
                "entidadeNome": entity_name,
                "tipoEntidade": "",
                "x": max_x + (added_count * 240),
                "y": 120,
                "info": "id",
                "descricao": "Entidade de dados",
            }
        )
        stages.append(
            {
                "id": node_id,
                "nome": entity_name,
                "tipo": "dados",
                "participante": "Sistema",
            }
        )
        existing_entity_names.add(normalized)

    merged_payload = {
        **base_payload,
        "nodes": nodes,
        "stages": stages,
    }
    return _sanitize_bpmn_payload(merged_payload, fallback_id)


def _infer_data_entity_type(stage_name: str, participant: str = "", default: str = "processo") -> str:
    text = _normalize_ai_text(f"{stage_name} {participant}")
    if not text:
        return default

    # Pessoas ou organizacoes -> contato
    person_org_hints = ("fornecedor", "cliente", "parceiro", "terceiro", "funcionario",
                        "gestor", "colaborador", "prestador", "usuario", "operador",
                        "responsavel", "pessoa", "empresa", "organizacao")
    if any(hint in text for hint in person_org_hints):
        return "contato"

    # Objetos, documentos, artefatos -> processo
    return default


def _inject_entity_nodes_into_bpmn(
    nodes: list[dict[str, Any]],
    connections: list[dict[str, Any]],
    entity_names: list[str],
    fallback_id: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Garante que cada entidade identificada aparece como node verde no BPMN,
    conectada à task mais relevante."""
    if not entity_names:
        return nodes, connections

    existing_entity_labels = {
        _normalize_ai_text(n.get("label") or "")
        for n in nodes
        if str(n.get("nodeType") or "") == "entidade"
    }

    task_nodes = [n for n in nodes if str(n.get("nodeType") or "") == "task"]

    injected_connections = list(connections)
    injected_nodes = list(nodes)
    entity_counter = 0

    for entity_name in entity_names:
        norm_name = _normalize_ai_text(entity_name)
        if not norm_name or norm_name in existing_entity_labels:
            continue

        entity_counter += 1
        entity_id = f"ai-entity-injected-{fallback_id}-{entity_counter}"

        # Encontra a task mais relacionada (pelo nome)
        best_task = None
        best_score = 0
        entity_words = set(norm_name.split())
        for task in task_nodes:
            task_label = _normalize_ai_text(task.get("label") or "")
            task_words = set(task_label.split())
            score = len(entity_words & task_words)
            if score > best_score:
                best_score = score
                best_task = task

        # Se nenhuma task relacionada, usa a primeira task do fluxo
        if not best_task and task_nodes:
            best_task = task_nodes[min(1, len(task_nodes) - 1)]  # segunda task (pós-início)

        entity_node: dict[str, Any] = {
            "id": entity_id,
            "label": entity_name,
            "nodeType": "entidade",
            "entidadeNome": entity_name,
            "tipoEntidade": "",
            "x": float(best_task.get("x") or 100) if best_task else float(100 + entity_counter * 300),
            "y": float(best_task.get("y") or 200) if best_task else 200.0,
            "campos": [
                {"nome": f"id_{_normalize_ai_text(entity_name).replace(' ', '_')}", "tipo": "numero", "obrigatorio": True, "keyType": "PK", "relacionamento": None},
                {"nome": "nome", "tipo": "texto", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
                {"nome": "descricao", "tipo": "texto", "obrigatorio": False, "keyType": "NORMAL", "relacionamento": None},
                {"nome": "data_criacao", "tipo": "data", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
            ],
        }

        injected_nodes.append(entity_node)
        existing_entity_labels.add(norm_name)

        if best_task:
            conn_id = f"ai-conn-entity-{fallback_id}-{entity_counter}"
            injected_connections.append({
                "id": conn_id,
                "from": str(best_task.get("id") or ""),
                "to": entity_id,
                "fromHandle": "right",
                "toHandle": "left",
                "decision": "",
            })

    return injected_nodes, injected_connections


def _auto_layout_bpmn_nodes(
    nodes: list[dict[str, Any]],
    connections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Recalcula x/y dos nodes com row-wrapping: no máximo MAX_PER_ROW por linha."""
    if not nodes:
        return nodes

    # Se todos os nodes já têm posições pré-calculadas, resolve sobreposições e retorna
    if all("x" in n and "y" in n for n in nodes):
        _CARD_W_OL = 220.0
        _CARD_H_OL = 110.0
        _PAD_X_OL  = 20.0
        _PAD_Y_OL  = 20.0
        _all = [n for n in nodes if str(n.get("id") or "")]
        for _rnd in range(10):
            _moved = False
            _all.sort(key=lambda n: (round(float(n.get("x", 0)) / 50), float(n.get("y", 0))))
            for _i in range(len(_all)):
                for _j in range(_i + 1, len(_all)):
                    _na, _nb = _all[_i], _all[_j]
                    _ax, _ay = float(_na.get("x", 0)), float(_na.get("y", 0))
                    _bx, _by = float(_nb.get("x", 0)), float(_nb.get("y", 0))
                    if (abs(_ax - _bx) < _CARD_W_OL + _PAD_X_OL) and (abs(_ay - _by) < _CARD_H_OL + _PAD_Y_OL):
                        _nb["y"] = _ay + _CARD_H_OL + _PAD_Y_OL
                        _moved = True
            if not _moved:
                break
        return nodes

    node_ids = [str(n.get("id") or "") for n in nodes]
    node_map = {str(n.get("id") or ""): n for n in nodes}
    all_ids = [nid for nid in node_ids if nid]

    # Grafo de fluxo
    outgoing: dict[str, list[tuple[str, str]]] = {nid: [] for nid in all_ids}
    incoming: dict[str, list[str]] = {nid: [] for nid in all_ids}
    for conn in connections:
        src = str(conn.get("from") or "")
        dst = str(conn.get("to") or "")
        decision = str(conn.get("decision") or "")
        if src in outgoing and dst in outgoing:
            outgoing[src].append((dst, decision))
            incoming[dst].append(src)

    # Raiz = nodes sem predecessores
    roots = [nid for nid in all_ids if not incoming.get(nid)]
    if not roots:
        roots = all_ids[:1]

    # Longest-path BFS: col = posição sequencial máxima alcançable a partir da raiz
    col_by_id: dict[str, int] = {}
    branch_by_id: dict[str, str] = {}
    queue: list[tuple[str, int, str]] = [(roots[0], 0, "sim")]
    max_iter = max(len(all_ids) ** 2, 256)
    iterations = 0
    while queue and iterations < max_iter:
        iterations += 1
        nid, col, branch = queue.pop(0)
        if col <= col_by_id.get(nid, -1):
            continue
        col_by_id[nid] = col
        branch_by_id[nid] = branch
        for child_id, decision in outgoing.get(nid, []):
            child_branch = "nao" if decision == "nao" else branch
            queue.append((child_id, col + 1, child_branch))

    # Nodes desconectados ficam ao final
    max_col = max(col_by_id.values(), default=0)
    for nid in all_ids:
        if nid not in col_by_id:
            max_col += 1
            col_by_id[nid] = max_col
            branch_by_id[nid] = "sim"

    # Resolve colisões
    from collections import Counter
    used: Counter = Counter()
    for nid in sorted(all_ids, key=lambda n: col_by_id.get(n, 0)):
        col = col_by_id[nid]
        br = branch_by_id[nid]
        key = (col, br)
        while used[key] > 0:
            col += 1
            col_by_id[nid] = col
            key = (col, br)
        used[key] += 1

    # Constantes de layout — fluxo de CIMA para BAIXO
    MAX_PER_COL = 7       # nodes por coluna antes de quebrar para a próxima
    X_MAIN_BASE = 160
    X_COL_GAP = 420       # espaço horizontal entre colunas do fluxo principal
    X_NAO_OFFSET = 340    # quanto à direita fica o ramo "nao"
    Y_START = 80
    Y_STEP = 240          # espaço vertical entre nodes

    # Primeiro passo: calcula posições base para todos os nodes
    pos: dict[str, tuple[float, float]] = {}
    for nid in all_ids:
        col = col_by_id[nid]
        branch = branch_by_id.get(nid, "sim")
        page_col = col // MAX_PER_COL
        row_in_col = col % MAX_PER_COL
        x_main = X_MAIN_BASE + page_col * X_COL_GAP
        x = x_main + (X_NAO_OFFSET if branch == "nao" else 0)
        y = Y_START + row_in_col * Y_STEP
        pos[nid] = (x, y)

    # Segundo passo: alinha nodes NAO ao Y do seu condicional de origem
    # para que fiquem lado a lado e não distantes verticalmente
    for conn in connections:
        if str(conn.get("decision") or "") == "nao":
            src = str(conn.get("from") or "")
            dst = str(conn.get("to") or "")
            if src in pos and dst in pos:
                # mesma altura (Y) que o condicional, X já foi calculado à direita
                pos[dst] = (pos[dst][0], pos[src][1])

    # Terceiro passo: resolve sobreposições reais de retângulos.
    # Agrupa nodes por X aproximado e, dentro de cada grupo, empurra para baixo
    # qualquer node que se sobreponha ao anterior (ordenados por Y).
    CARD_W = 220.0   # largura real do card (deve bater com CARD_WIDTH no frontend)
    CARD_H = 110.0   # altura real do card
    PAD_X = 20.0     # espaço mínimo horizontal entre cards
    PAD_Y = 20.0     # espaço mínimo vertical entre cards

    def overlaps(ax: float, ay: float, bx: float, by: float) -> bool:
        return (abs(ax - bx) < CARD_W + PAD_X) and (abs(ay - by) < CARD_H + PAD_Y)

    # Itera várias vezes até não haver mais sobreposições (max 10 rounds)
    for _ in range(10):
        changed = False
        # Ordena por Y para processar de cima para baixo
        sorted_ids = sorted(all_ids, key=lambda n: (round(pos[n][0] / 50), pos[n][1]))
        for i in range(len(sorted_ids)):
            for j in range(i + 1, len(sorted_ids)):
                na, nb = sorted_ids[i], sorted_ids[j]
                ax, ay = pos[na]
                bx, by = pos[nb]
                if overlaps(ax, ay, bx, by):
                    # Empurra nb para baixo (ou para a direita se mesmo Y)
                    if abs(ax - bx) < PAD_X:
                        # Mesmo X: empurra para baixo
                        new_by = ay + CARD_H + PAD_Y
                        pos[nb] = (bx, new_by)
                    else:
                        # X diferente mas sobreposição horizontal: empurra X para direita
                        new_bx = ax + CARD_W + PAD_X
                        pos[nb] = (new_bx, by)
                    changed = True
        if not changed:
            break

    for nid in all_ids:
        node = node_map[nid]
        node["x"], node["y"] = pos[nid]

    return nodes


def _break_consecutive_entity_nodes(
    nodes: list[dict[str, Any]],
    connections: list[dict[str, Any]],
    stages: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Insert bridging task nodes between consecutive entity nodes.

    When the AI places two or more entity (data) nodes in sequence without
    any activity between them the resulting BPMN looks incorrect — entities
    should be separated by at least one task/activity.  This pass walks the
    connection graph and, for every edge A→B where both A and B are entity
    nodes, inserts a synthetic task node between them.
    """
    if not nodes or not connections:
        return nodes, connections, stages

    node_type_map: dict[str, str] = {
        str(n.get("id") or ""): str(n.get("nodeType") or "").strip().lower()
        for n in nodes
    }
    node_map: dict[str, dict[str, Any]] = {
        str(n.get("id") or ""): n for n in nodes
    }

    new_nodes: list[dict[str, Any]] = []
    new_conns: list[dict[str, Any]] = []
    new_stages: list[dict[str, Any]] = []
    bridge_counter = 0

    for conn in connections:
        from_id = str(conn.get("from") or "")
        to_id = str(conn.get("to") or "")
        from_type = node_type_map.get(from_id, "")
        to_type = node_type_map.get(to_id, "")

        if from_type == "entidade" and to_type == "entidade":
            bridge_counter += 1
            from_node = node_map.get(from_id, {})
            to_node = node_map.get(to_id, {})
            from_label = str(from_node.get("entidadeNome") or from_node.get("label") or "").strip()
            to_label = str(to_node.get("entidadeNome") or to_node.get("label") or "").strip()

            bridge_id = f"ai-bridge-task-{bridge_counter}"
            bridge_label = f"Processar {from_label}" if from_label else f"Atividade intermediaria {bridge_counter}"
            bridge_desc = f"Atividade que processa {from_label} antes de {to_label}" if from_label and to_label else "Atividade intermediaria gerada automaticamente"

            from_x = float(from_node.get("x") or 0)
            to_x = float(to_node.get("x") or 0)
            from_y = float(from_node.get("y") or 140)
            to_y = float(to_node.get("y") or 140)

            bridge_node: dict[str, Any] = {
                "id": bridge_id,
                "label": bridge_label,
                "nodeType": "task",
                "taskNome": bridge_label,
                "taskDescricao": bridge_desc,
                "x": (from_x + to_x) / 2,
                "y": (from_y + to_y) / 2,
                "info": str(from_node.get("info") or "").strip(),
            }
            new_nodes.append(bridge_node)
            new_stages.append({
                "id": bridge_id,
                "nome": bridge_label,
                "tipo": "task",
                "participante": "",
            })

            # Replace original A→B connection with A→bridge and bridge→B
            new_conns.append({
                **conn,
                "id": f"{conn.get('id', '')}-a",
                "to": bridge_id,
            })
            new_conns.append({
                "id": f"{conn.get('id', '')}-b",
                "from": bridge_id,
                "to": to_id,
                "fromHandle": "right",
                "toHandle": str(conn.get("toHandle") or "left"),
                "decision": "",
            })
        else:
            new_conns.append(conn)

    if not new_nodes:
        return nodes, connections, stages

    return nodes + new_nodes, new_conns, stages + new_stages


def _sanitize_bpmn_payload(payload: dict[str, Any], fallback_id: int) -> dict[str, Any]:
    name = str(payload.get("name") or "BPMN gerado por IA").strip()

    raw_stages_value = payload.get("stages")
    raw_stages: list[Any] = raw_stages_value if isinstance(raw_stages_value, list) else []
    stages: list[dict[str, Any]] = []
    for index, stage in enumerate(raw_stages, 1):
        if isinstance(stage, str):
            stage_name = stage.strip()
            stage_type = "task"
            stage_id = f"stage-{index}"
            stage_participant = ""
        elif isinstance(stage, dict):
            stage_name = str(stage.get("nome") or stage.get("name") or stage.get("label") or "").strip()
            stage_type = _normalize_bpmn_stage_type(stage.get("tipo") or stage.get("type") or "task")
            stage_id = str(stage.get("id") or f"stage-{index}").strip() or f"stage-{index}"
            stage_participant = str(
                stage.get("participante")
                or stage.get("participant")
                or stage.get("lane")
                or stage.get("pool")
                or stage.get("responsavel")
                or ""
            ).strip()
        else:
            continue

        if not stage_name:
            continue

        sanitized_stage_name = _sanitize_node_name_by_type(
            stage_name,
            _stage_type_to_node_type(stage_type),
            index,
        )

        stages.append(
            {
                "id": stage_id,
                "nome": sanitized_stage_name,
                "tipo": stage_type,
                "participante": stage_participant,
            }
        )

    stages_by_id: dict[str, dict[str, Any]] = {
        str(stage.get("id") or "").strip().lower(): stage
        for stage in stages
        if str(stage.get("id") or "").strip()
    }
    stages_by_name: dict[str, dict[str, Any]] = {
        str(stage.get("nome") or "").strip().lower(): stage
        for stage in stages
        if str(stage.get("nome") or "").strip()
    }

    raw_nodes_value = payload.get("nodes")
    raw_nodes: list[Any] = raw_nodes_value if isinstance(raw_nodes_value, list) else []
    nodes: list[dict[str, Any]] = []
    node_ids: set[str] = set()

    for index, raw_node in enumerate(raw_nodes, 1):
        if not isinstance(raw_node, dict):
            continue

        node_id = str(raw_node.get("id") or f"ai-node-{fallback_id}-{index}").strip()
        if not node_id or node_id in node_ids:
            continue

        # Remove nodes que a IA gera incorretamente com nomes de ramo de decisão
        _DECISION_ONLY_LABELS = {
            "sim", "nao", "não", "yes", "no",
            "caminho sim", "caminho nao", "caminho não",
            "ramo sim", "ramo nao", "ramo não",
            "path sim", "path nao", "path não",
        }
        raw_label_check = str(raw_node.get("label") or raw_node.get("nome") or raw_node.get("name") or "").strip().lower()
        if raw_label_check in _DECISION_ONLY_LABELS:
            continue
        # Remove nós sintéticos de encerramento gerados incorretamente pelo fallback
        if re.match(r"^encerrar\s*[\(\[]", raw_label_check) or re.match(r"^fim\s*[\(\[]", raw_label_check):
            continue

        node_type_candidate = str(raw_node.get("nodeType") or raw_node.get("type") or "").strip().lower()
        node_type = _stage_type_to_node_type(node_type_candidate) if node_type_candidate else "task"

        raw_label = str(
            raw_node.get("label") or raw_node.get("nome") or raw_node.get("name") or ""
        ).strip()

        label = _sanitize_node_name_by_type(raw_label, node_type, index)

        x_raw = raw_node.get("x")
        y_raw = raw_node.get("y")
        try:
            x = float(x_raw) if x_raw is not None else 140 + (index - 1) * 230
        except Exception:
            x = 140 + (index - 1) * 230
        try:
            y = float(y_raw) if y_raw is not None else 140
        except Exception:
            y = 140

        node_payload = {
            "id": node_id,
            "label": label,
            "nodeType": node_type,
            "x": x,
            "y": y,
        }

        node_info = str(raw_node.get("info") or "").strip()
        stage_match = stages_by_id.get(node_id.lower()) or stages_by_name.get(label.lower())
        stage_participant = str(stage_match.get("participante") or "").strip() if stage_match else ""
        if stage_match and node_type != "entidade":
            if stage_participant and f"Raia: {stage_participant}" not in node_info:
                node_info = f"{node_info} | Raia: {stage_participant}".strip(" |")
        if node_info:
            node_payload["info"] = node_info

        if node_type == "task":
            task_name_source = str(raw_node.get("taskNome") or raw_label or label).strip()
            task_desc_source = str(raw_node.get("taskDescricao") or raw_label or label).strip()
            task_name = _sanitize_node_name_by_type(
                _activity_name_from_description(task_name_source, index),
                "task",
                index,
            )
            task_description = _activity_description_from_text(task_desc_source, index)
            node_payload["label"] = task_name
            node_payload["taskNome"] = task_name
            node_payload["taskDescricao"] = task_description
        elif node_type == "condicional":
            raw_cond_name = str(raw_node.get("condicionalNome") or raw_label or label).strip()
            cond_name = _sanitize_node_name_by_type(raw_cond_name, "condicional", index)
            cond_descricao = str(raw_node.get("condicionalDescricao") or raw_node.get("descricao") or raw_node.get("subtitle") or "").strip()

            if _is_generic_conditional_label(cond_name):
                cond_name = _sanitize_node_name_by_type(
                    cond_descricao or raw_cond_name or "Caminho do fluxo",
                    "condicional",
                    index,
                )

            if "?" not in cond_name and _looks_like_decision_stage(raw_cond_name or cond_name):
                cond_name = _sanitize_node_name_by_type(f"{cond_name}?", "condicional", index)

            if not cond_descricao:
                cond_descricao = _conditional_description_from_name(cond_name)

            gateway_type = _infer_gateway_type_from_text(
                cond_name,
                cond_descricao,
                outgoing_count=2,
                explicit_gateway=raw_node.get("gatewayType"),
            )

            node_payload["label"] = cond_name
            node_payload["condicionalNome"] = cond_name
            node_payload["condicionalDescricao"] = cond_descricao
            node_payload["gatewayType"] = gateway_type
        else:
            node_payload["entidadeNome"] = label
            inferred_type = _infer_data_entity_type(label, stage_participant)
            node_payload["tipoEntidade"] = _normalize_entity_type(
                raw_node.get("tipoEntidade"),
                default=inferred_type,
            )
            raw_desc = str(raw_node.get("descricao") or raw_node.get("subtitle") or "").strip()
            if not raw_desc:
                raw_desc = _default_entity_description(label, node_payload.get("tipoEntidade", ""), "")
            node_payload["descricao"] = raw_desc
            # Preserva campos gerados pela IA
            raw_campos = raw_node.get("campos")
            if isinstance(raw_campos, list) and raw_campos:
                sanitized_campos = []
                for fi, field in enumerate(raw_campos, 1):
                    if not isinstance(field, dict):
                        continue
                    field_name = str(field.get("nome") or "").strip()
                    if not field_name:
                        continue
                    sanitized_campos.append({
                        "nome": field_name,
                        "tipo": str(field.get("tipo") or "texto").strip().lower(),
                        "obrigatorio": field.get("obrigatorio") is True or str(field.get("obrigatorio") or "").lower() == "sim",
                        "keyType": str(field.get("keyType") or field.get("chave") or "NORMAL").strip().upper(),
                        "relacionamento": str(field.get("relacionamento") or "").strip() or None,
                    })
                if sanitized_campos:
                    node_payload["campos"] = sanitized_campos

        nodes.append(node_payload)
        node_ids.add(node_id)

    if not nodes and stages:
        for index, stage in enumerate(stages, 1):
            stage_name = str(stage.get("nome") or f"Etapa {index}").strip() or f"Etapa {index}"
            stage_type = _normalize_bpmn_stage_type(stage.get("tipo") or "task")
            node_type_resolved = _stage_type_to_node_type(stage_type)
            stage_name = _sanitize_node_name_by_type(stage_name, node_type_resolved, index)

            node_payload = {
                "id": f"ai-stage-{index}",
                "label": stage_name,
                "nodeType": node_type_resolved,
                "x": 140 + (index - 1) * 230,
                "y": 140,
            }
            stage_participant = str(stage.get("participante") or "").strip()
            if stage_type == "dados":
                node_payload["info"] = "id"
                node_payload["entidadeNome"] = _sanitize_node_name_by_type(
                    stage_participant or stage_name,
                    "entidade",
                    index,
                )
                node_payload["tipoEntidade"] = _normalize_entity_type(
                    stage.get("tipoEntidade"),
                    default=_infer_data_entity_type(stage_name, stage_participant, default="processo"),
                )
            elif stage_type == "condicional":
                if stage_participant:
                    node_payload["info"] = f"Raia: {stage_participant}"
                cond_name = _build_non_data_stage_name("condicional", stage_name, index)
                desc = _build_non_data_stage_description("condicional", stage_name, cond_name)
                if _is_generic_conditional_label(cond_name):
                    cond_name = _sanitize_node_name_by_type(
                        desc or stage_name or "Caminho do fluxo",
                        "condicional",
                        index,
                    )
                node_payload["descricao"] = desc
                node_payload["condicionalNome"] = cond_name
                node_payload["condicionalDescricao"] = desc
                node_payload["gatewayType"] = _infer_gateway_type_from_text(
                    cond_name,
                    desc,
                    outgoing_count=2,
                )
            else:
                if stage_participant:
                    node_payload["info"] = f"Raia: {stage_participant}"
                task_name = _build_non_data_stage_name("task", stage_name, index)
                desc = _build_non_data_stage_description("task", stage_name, task_name)
                node_payload["descricao"] = desc
                node_payload["taskNome"] = task_name
                node_payload["taskDescricao"] = desc

            nodes.append(node_payload)
            node_ids.add(str(node_payload["id"]))

    raw_connections_value = payload.get("connections")
    raw_connections: list[Any] = raw_connections_value if isinstance(raw_connections_value, list) else []
    connections: list[dict[str, Any]] = []
    for index, raw_connection in enumerate(raw_connections, 1):
        if not isinstance(raw_connection, dict):
            continue

        from_id = str(raw_connection.get("from") or "").strip()
        to_id = str(raw_connection.get("to") or "").strip()
        if not from_id or not to_id:
            continue
        if from_id not in node_ids or to_id not in node_ids:
            continue

        connections.append(
            {
                "id": str(raw_connection.get("id") or f"ai-conn-{fallback_id}-{index}").strip()
                or f"ai-conn-{fallback_id}-{index}",
                "from": from_id,
                "to": to_id,
                "fromHandle": str(raw_connection.get("fromHandle") or "right").strip() or "right",
                "toHandle": str(raw_connection.get("toHandle") or "left").strip() or "left",
                "decision": str(raw_connection.get("decision") or "").strip(),
            }
        )

    if not connections and len(nodes) > 1:
        for index in range(len(nodes) - 1):
            connections.append(
                {
                    "id": f"ai-conn-{fallback_id}-{index + 1}",
                    "from": str(nodes[index].get("id") or "").strip(),
                    "to": str(nodes[index + 1].get("id") or "").strip(),
                    "fromHandle": "right",
                    "toHandle": "left",
                    "decision": "",
                }
            )

    conditional_node_ids = {
        str(node.get("id") or "").strip()
        for node in nodes
        if str(node.get("nodeType") or "").strip().lower() == "condicional"
    }

    def normalize_decision_value(raw_value: Any) -> str:
        raw = str(raw_value or "").strip()
        if not raw:
            return ""

        normalized = raw.lower()
        if normalized in {"sim", "yes", "true", "ok", "aprovado"} or raw in {"✓", "✔"}:
            return "sim"
        if normalized in {"nao", "não", "no", "false", "reprovado"} or raw in {"✕", "✖", "x", "X"}:
            return "nao"
        return ""

    outgoing_by_conditional: dict[str, list[dict[str, Any]]] = {}
    for connection in connections:
        from_id = str(connection.get("from") or "").strip()
        if from_id in conditional_node_ids:
            outgoing_by_conditional.setdefault(from_id, []).append(connection)

    node_lookup = {
        str(node.get("id") or "").strip(): node
        for node in nodes
        if str(node.get("id") or "").strip()
    }

    def safe_float(value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except Exception:
            return default

    collapsed_conditional_ids: set[str] = set()

    for conditional_node_id, conditional_outgoing in outgoing_by_conditional.items():
        if not conditional_outgoing:
            continue

        unique_targets = {
            str(connection.get("to") or "").strip()
            for connection in conditional_outgoing
            if str(connection.get("to") or "").strip()
        }

        conditional_node = node_lookup.get(conditional_node_id)
        gateway_type = _infer_gateway_type_from_text(
            str((conditional_node or {}).get("condicionalNome") or (conditional_node or {}).get("label") or ""),
            str((conditional_node or {}).get("condicionalDescricao") or (conditional_node or {}).get("descricao") or (conditional_node or {}).get("subtitle") or ""),
            outgoing_count=len(unique_targets),
            explicit_gateway=(conditional_node or {}).get("gatewayType") if conditional_node else "",
        )
        if conditional_node is not None:
            conditional_node["gatewayType"] = gateway_type

        if len(unique_targets) <= 1:
            collapsed_conditional_ids.add(conditional_node_id)
            for connection in conditional_outgoing:
                connection["decision"] = ""
                connection["fromHandle"] = "right"
                connection["toHandle"] = str(connection.get("toHandle") or "left").strip() or "left"
            continue

        if gateway_type in {"and", "or"}:
            for branch_index, connection in enumerate(conditional_outgoing, start=1):
                source_node = node_lookup.get(str(connection.get("from") or "").strip())
                target_node = node_lookup.get(str(connection.get("to") or "").strip())
                source_y = safe_float(source_node.get("y") if source_node else 0.0)
                target_y = safe_float(target_node.get("y") if target_node else 0.0)

                decision_label = str(connection.get("decision") or "").strip()
                if not decision_label:
                    decision_label = f"Paralelo {branch_index}" if gateway_type == "and" else f"Ramo {branch_index}"

                connection["decision"] = decision_label
                connection["fromHandle"] = "right" if branch_index % 2 == 1 else "bottom"
                if target_node and target_y >= source_y - 10:
                    connection["toHandle"] = "top"
                else:
                    connection["toHandle"] = str(connection.get("toHandle") or "left").strip() or "left"
            continue

        for connection in conditional_outgoing:
            canonical_decision = normalize_decision_value(connection.get("decision"))
            if not canonical_decision:
                inferred_by_handle = str(connection.get("fromHandle") or "").strip().lower()
                if inferred_by_handle == "right":
                    canonical_decision = "sim"
                elif inferred_by_handle == "bottom":
                    canonical_decision = "nao"
            connection["decision"] = canonical_decision

        yes_connection = next(
            (conn for conn in conditional_outgoing if str(conn.get("decision") or "") == "sim"),
            None,
        )
        if not yes_connection:
            yes_connection = conditional_outgoing[0]

        no_connection = next(
            (
                conn
                for conn in conditional_outgoing
                if conn is not yes_connection and str(conn.get("decision") or "") == "nao"
            ),
            None,
        )
        if not no_connection and len(conditional_outgoing) > 1:
            no_connection = next(
                (conn for conn in conditional_outgoing if conn is not yes_connection),
                None,
            )

        for connection in conditional_outgoing:
            if connection is yes_connection:
                connection["decision"] = "sim"
            elif no_connection is not None and connection is no_connection:
                connection["decision"] = "nao"
            else:
                connection["decision"] = ""

        for connection in conditional_outgoing:
            decision = str(connection.get("decision") or "").strip().lower()
            source_node = node_lookup.get(str(connection.get("from") or "").strip())
            target_node = node_lookup.get(str(connection.get("to") or "").strip())
            source_y = safe_float(source_node.get("y") if source_node else 0.0)
            target_y = safe_float(target_node.get("y") if target_node else 0.0)

            if decision == "sim":
                connection["fromHandle"] = "right"
                if target_node and target_y >= source_y - 6:
                    connection["toHandle"] = "top"
                else:
                    connection["toHandle"] = str(connection.get("toHandle") or "left").strip() or "left"
            elif decision == "nao":
                connection["fromHandle"] = "bottom"
                if target_node and target_y >= source_y - 12:
                    connection["toHandle"] = "top"
                else:
                    connection["toHandle"] = str(connection.get("toHandle") or "left").strip() or "left"

    if collapsed_conditional_ids:
        for index, node in enumerate(nodes, 1):
            node_id = str(node.get("id") or "").strip()
            if node_id not in collapsed_conditional_ids:
                continue
            if str(node.get("nodeType") or "").strip().lower() != "condicional":
                continue

            task_name_source = (
                node.get("condicionalNome")
                or node.get("taskNome")
                or node.get("label")
                or f"Atividade {index}"
            )
            task_name = _sanitize_node_name_by_type(task_name_source, "task", index)
            task_description = str(
                node.get("taskDescricao")
                or node.get("condicionalDescricao")
                or node.get("descricao")
                or node.get("subtitle")
                or ""
            ).strip()

            node["nodeType"] = "task"
            node["label"] = task_name
            node["taskNome"] = task_name
            if task_description:
                node["taskDescricao"] = task_description
            node.pop("condicionalNome", None)
            node.pop("condicionalDescricao", None)
            node.pop("gatewayType", None)

        for stage in stages:
            stage_id = str(stage.get("id") or "").strip()
            if stage_id in collapsed_conditional_ids:
                stage["tipo"] = "task"

    if not stages and nodes:
        for index, node in enumerate(nodes, 1):
            stage_name = str(node.get("label") or "").strip()
            if not stage_name:
                continue
            stage_type = str(node.get("nodeType") or "task").strip().lower()
            if stage_type not in {"task", "condicional", "entidade"}:
                stage_type = "task"
            participant = str(
                node.get("participante")
                or node.get("participant")
                or node.get("lane")
                or node.get("pool")
                or ""
            ).strip()
            stages.append(
                {
                    "id": str(node.get("id") or f"stage-{index}").strip() or f"stage-{index}",
                    "nome": stage_name,
                    "tipo": stage_type,
                    "participante": participant,
                }
            )

    nodes, connections = _ensure_terminal_end_node(nodes, connections, fallback_id)
    nodes, connections, stages = _break_consecutive_entity_nodes(nodes, connections, stages)
    nodes = _auto_layout_bpmn_nodes(nodes, connections)

    return {
        "name": name,
        "nodes": nodes,
        "connections": connections,
        "stages": stages,
    }


def _looks_like_terminal_task_name(value: Any) -> bool:
    normalized = _normalize_ai_text(value)
    if not normalized:
        return False

    terminal_hints = (
        "fim",
        "final",
        "finaliz",
        "encerr",
        "conclu",
        "fech",
        "arquiv",
    )
    return any(hint in normalized for hint in terminal_hints)


def _ensure_terminal_end_node(
    nodes: list[dict[str, Any]],
    connections: list[dict[str, Any]],
    fallback_id: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not nodes:
        return nodes, connections

    safe_nodes = [node for node in nodes if isinstance(node, dict)]
    safe_connections = [conn for conn in connections if isinstance(conn, dict)]
    if not safe_nodes:
        return safe_nodes, safe_connections

    node_lookup = {
        str(node.get("id") or "").strip(): node
        for node in safe_nodes
        if str(node.get("id") or "").strip()
    }
    if not node_lookup:
        return safe_nodes, safe_connections

    outgoing_counts: dict[str, int] = {node_id: 0 for node_id in node_lookup.keys()}
    for connection in safe_connections:
        from_id = str(connection.get("from") or "").strip()
        if from_id in outgoing_counts:
            outgoing_counts[from_id] += 1

    process_node_ids = {
        node_id
        for node_id, node in node_lookup.items()
        if str(node.get("nodeType") or "").strip().lower() in {"task", "condicional"}
    }
    if not process_node_ids:
        return safe_nodes, safe_connections

    leaf_process_nodes = [node_lookup[node_id] for node_id in process_node_ids if outgoing_counts.get(node_id, 0) == 0]
    if not leaf_process_nodes:
        return safe_nodes, safe_connections

    if all(_looks_like_terminal_task_name(node.get("label") or node.get("taskNome") or "") for node in leaf_process_nodes):
        return safe_nodes, safe_connections

    existing_terminal_node = next(
        (
            node
            for node in safe_nodes
            if str(node.get("nodeType") or "").strip().lower() == "task"
            and _looks_like_terminal_task_name(node.get("label") or node.get("taskNome") or "")
        ),
        None,
    )

    if existing_terminal_node is None:
        x_values = [float(node.get("x") or 0.0) for node in safe_nodes]
        y_values = [float(node.get("y") or 0.0) for node in leaf_process_nodes]
        end_node_id = f"ai-node-end-{fallback_id}"
        suffix = 1
        while end_node_id in node_lookup:
            end_node_id = f"ai-node-end-{fallback_id}-{suffix}"
            suffix += 1

        end_node = {
            "id": end_node_id,
            "label": "Fim do processo",
            "nodeType": "task",
            "taskNome": "Fim do processo",
            "taskDescricao": "Encerramento do fluxo.",
            "x": (max(x_values) if x_values else 0.0) + 240,
            "y": (sum(y_values) / len(y_values)) if y_values else 140.0,
        }
        safe_nodes.append(end_node)
        node_lookup[end_node_id] = end_node
        existing_terminal_node = end_node

    terminal_id = str(existing_terminal_node.get("id") or "").strip()
    if not terminal_id:
        return safe_nodes, safe_connections

    connection_ids = {
        str(connection.get("id") or "").strip()
        for connection in safe_connections
        if str(connection.get("id") or "").strip()
    }
    leaf_ids = [str(node.get("id") or "").strip() for node in leaf_process_nodes]
    for leaf_id in leaf_ids:
        if not leaf_id or leaf_id == terminal_id:
            continue

        already_connected = any(
            str(connection.get("from") or "").strip() == leaf_id
            and str(connection.get("to") or "").strip() == terminal_id
            for connection in safe_connections
        )
        if already_connected:
            continue

        conn_id = f"ai-conn-end-{fallback_id}-{len(safe_connections) + 1}"
        suffix = 1
        while conn_id in connection_ids:
            conn_id = f"ai-conn-end-{fallback_id}-{len(safe_connections) + 1}-{suffix}"
            suffix += 1

        safe_connections.append(
            {
                "id": conn_id,
                "from": leaf_id,
                "to": terminal_id,
                "fromHandle": "right",
                "toHandle": "left",
                "decision": "",
            }
        )
        connection_ids.add(conn_id)

    return safe_nodes, safe_connections


def _descricao_fallback(nome: str, tipo: str) -> str:
    """Gera descrição mínima quando a IA não preencheu o campo."""
    nome = nome.strip()
    if tipo == "entidade":
        return f"Entidade utilizada no processo para registrar e gerenciar as informações de {nome.lower()}."
    if tipo == "task":
        return f"Etapa responsável por executar a ação de {nome.lower()} dentro do fluxo do processo."
    if tipo == "condicional":
        return f"Ponto de decisão que avalia a condição '{nome.rstrip('?')}' e direciona o fluxo conforme o resultado."
    return f"Elemento do processo relacionado a {nome.lower()}."


def _sanitize_llm_action(raw_action: Any, fallback_id: int, current_user: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(raw_action, dict):
        return None

    action_type = str(raw_action.get("type") or "").strip()
    allowed_types = {"create_entidade", "create_oportunidade", "update_bpmn_state"}
    if action_type not in allowed_types:
        return None

    payload_raw = raw_action.get("payload")
    payload = payload_raw if isinstance(payload_raw, dict) else {}

    if action_type == "create_entidade":
        entity_name = _sanitize_node_name_by_type(
            payload.get("nome") or f"Entidade IA {fallback_id}",
            "entidade",
            fallback_id,
        )
        sanitized_fields = _sanitize_entity_fields(
            payload.get("campos"),
            entity_name,
        )
        _BAD_DESC_PREFIXES = (
            "entidade do processo",
            "entidade de ",
            "representa a entidade",
            "entidade responsavel",
            "entidade que representa",
        )
        raw_desc = str(payload.get("descricao") or "").strip()
        raw_tipo_entidade = str(payload.get("tipoEntidade") or "").strip()
        if not raw_tipo_entidade:
            raw_tipo_entidade = f"{entity_name} {raw_desc}".strip()
        entity_type_raw = _entity_type_label(raw_tipo_entidade, fallback_id)
        clean_desc = raw_desc if not any(raw_desc.lower().startswith(p) for p in _BAD_DESC_PREFIXES) else ""
        # Rejeita descrição que é igual ou contida no nome da entidade (ex: nome='Cliente', desc='Cliente')
        if clean_desc and _normalize_ai_text(clean_desc) == _normalize_ai_text(entity_name):
            clean_desc = ""
        # Rejeita descrições muito curtas (menos de 20 chars) pois são insuficientes
        if clean_desc and len(clean_desc) < 20:
            clean_desc = ""
        if not clean_desc:
            clean_desc = _default_entity_description(
                entity_name,
                entity_type_raw,
                str(payload.get("categoria") or ""),
            )
        payload = {
            "categoria": str(payload.get("categoria") or "IA"),
            "nome": entity_name,
            "descricao": clean_desc,
            "tipoEntidade": entity_type_raw,
            "campos": sanitized_fields,
        }
    elif action_type == "create_oportunidade":
        payload = {
            "nome": str(payload.get("nome") or f"Oportunidade IA {fallback_id}").strip(),
            "descricao": str(payload.get("descricao") or "Oportunidade sugerida por IA").strip(),
            "etapa": str(payload.get("etapa") or "Mapeamento"),
            "responsavel": str(payload.get("responsavel") or current_user.get("nome") or "IA"),
            "status": str(payload.get("status") or "Em andamento"),
        }
    elif action_type == "update_bpmn_state":
        payload = _sanitize_bpmn_payload(payload, fallback_id)

    risk = str(raw_action.get("risk") or "medium").strip().lower()
    if risk not in {"low", "medium", "high"}:
        risk = "medium"

    return {
        "id": str(raw_action.get("id") or f"a{fallback_id}").strip() or f"a{fallback_id}",
        "type": action_type,
        "label": str(raw_action.get("label") or f"Ação {fallback_id}").strip() or f"Ação {fallback_id}",
        "risk": risk,
        "requiresApproval": True,
        "payload": payload,
    }


def _sanitize_context_panel_suggestion(raw_value: Any) -> dict[str, Any] | None:
    if not isinstance(raw_value, dict):
        return None

    stage_category = _normalize_bpmn_stage_type(raw_value.get("stageCategory") or "dados", default="dados")

    entity_type = _normalize_entity_type(raw_value.get("entityType"), default="processo")

    entity_mode = str(raw_value.get("entityMode") or "nova").strip().lower()
    if entity_mode not in {"nova", "existente"}:
        entity_mode = "nova"

    new_entity_raw = raw_value.get("newEntity")
    new_entity = new_entity_raw if isinstance(new_entity_raw, dict) else {}

    task_raw = raw_value.get("task")
    task = task_raw if isinstance(task_raw, dict) else {}

    conditional_raw = raw_value.get("conditional")
    conditional = conditional_raw if isinstance(conditional_raw, dict) else {}

    raw_fields_value = raw_value.get("fields")
    raw_fields: list[Any] = raw_fields_value if isinstance(raw_fields_value, list) else []
    fields = []
    for field in raw_fields:
        if not isinstance(field, dict):
            continue
        nome = str(field.get("nome") or "").strip()
        if not nome:
            continue
        tipo = str(field.get("tipo") or "Texto").strip()
        key_type = str(field.get("keyType") or "NORMAL").strip().upper()
        if key_type not in {"PK", "FK", "NORMAL"}:
            key_type = "NORMAL"
        fields.append(
            {
                "nome": nome,
                "tipo": tipo,
                "obrigatorio": field.get("obrigatorio") is True,
                "keyType": key_type,
                "referencia": str(field.get("referencia") or "").strip(),
            }
        )

    return {
        "stageCategory": stage_category,
        "stageConfigMode": "condicional" if stage_category == "condicional" else "entidade",
        "entityType": entity_type,
        "entityMode": entity_mode,
        "newEntity": {
            "nome": _sanitize_node_name_by_type(
                new_entity.get("nome") or "",
                "entidade",
                1,
            ),
            "descricao": str(new_entity.get("descricao") or "").strip() or _descricao_fallback(
                new_entity.get("nome") or "entidade", "entidade"
            ),
            "atributoChave": str(new_entity.get("atributoChave") or "").strip(),
        },
        "task": {
            "nome": _sanitize_node_name_by_type(task.get("nome") or "", "task", 1),
            "descricao": str(task.get("descricao") or "").strip() or _descricao_fallback(
                task.get("nome") or "atividade", "task"
            ),
        },
        "conditional": {
            "nome": _sanitize_node_name_by_type(
                conditional.get("nome") or "",
                "condicional",
                1,
            ),
            "descricao": str(conditional.get("descricao") or "").strip() or _descricao_fallback(
                conditional.get("nome") or "condicao", "condicional"
            ),
        },
        "fields": fields,
    }


def _normalize_ai_text(value: Any) -> str:
    return (
        str(value or "")
        .strip()
        .lower()
        .replace("ç", "c")
        .replace("ã", "a")
        .replace("á", "a")
        .replace("à", "a")
        .replace("â", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
    )


def _normalize_entity_type(value: Any, default: str = "processo") -> str:
    normalized = _normalize_ai_text(value)
    if not normalized:
        return default

    tokens = set(part for part in re.split(r"[^a-z0-9]+", normalized) if part)

    # Pessoas / organizacoes -> contato
    contato_exact = {
        "contato", "contact", "cliente", "fornecedor", "parceiro",
        "funcionario", "gestor", "colaborador", "prestador",
        "usuario", "operador", "responsavel", "pessoa", "empresa",
        "organizacao", "terceiro", "solicitante", "aprovador",
        # Compatibilidade com taxonomia antiga da IA
        "apoio", "support", "auxiliar", "secundaria", "secundario",
        "externa", "externo", "external",
    }
    contato_hints = {
        "cliente", "fornecedor", "parceir", "funcionar", "gestor",
        "colaborador", "prestador", "usuario", "operador", "responsavel",
        "pessoa", "empresa", "organiz", "terceir", "solicitante",
        "aprovador",
    }
    if normalized in contato_exact or any(hint in normalized for hint in contato_hints) or any(
        token in contato_exact for token in tokens
    ):
        return "contato"
    # Objetos / documentos / artefatos -> processo
    processo_exact = {
        "processo", "process", "principal", "core", "main",
        "primaria", "associativa", "associativo", "junction", "pivot",
        "pedido", "contrato",
        "proposta", "solicitacao", "nota", "fiscal", "relatorio",
        "documento", "item", "cadastro", "registro", "aprovacao",
        "orcamento", "ordem",
    }
    processo_hints = {
        "process", "pedido", "contrat", "propost", "solicit",
        "nota", "fiscal", "relatori", "document", "item", "cadastro",
        "registro", "aprovaca", "orcament", "ordem",
    }
    if normalized in processo_exact or any(hint in normalized for hint in processo_hints) or any(
        token in processo_exact for token in tokens
    ):
        return "processo"

    return default


def _entity_type_label(normalized_type: str, fallback_index: int) -> str:
    normalized = _normalize_entity_type(normalized_type, default="")
    if normalized == "contato":
        return "Contato"
    return "Processo"


def _normalize_papel_negocio(value: Any, tipo_entidade: Any = "", default: str = "") -> str:
    normalized = _normalize_ai_text(value)
    if normalized in {"contato", "contact"}:
        return "contato"
    if normalized in {"processo", "process"}:
        return "processo"

    inferred = _normalize_entity_type(tipo_entidade, default=default or "processo")
    if inferred in {"contato", "processo"}:
        return inferred

    return default


def _extract_goal_data_entities(goal: str) -> list[dict[str, str]]:
    text = str(goal or "")
    if not text:
        return []

    parsed: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_entity(name_raw: Any, type_raw: Any = ""):
        name = " ".join(str(name_raw or "").strip().split())
        if not name:
            return
        if len(name) < 2:
            return
        key = _normalize_ai_text(name)
        if not key or key in seen:
            return
        seen.add(key)
        parsed.append(
            {
                "nome": name,
                "tipo": _normalize_entity_type(type_raw, default=""),
            }
        )

    # Preferred format: "- Nome da Entidade (Tipo)"
    for match in re.finditer(
        r"[-•*]\s*([^\n\r\-\(\)]+?)\s*\((contato|processo|principal|apoio|associativa|externa|primaria|secundaria|auxiliar|externo)\)",
        text,
        flags=re.IGNORECASE,
    ):
        add_entity(match.group(1), match.group(2))

    # In-text format: "entidade externa Fornecedor" / "entidade Aprovação"
    for match in re.finditer(
        r"entidade\s+(contato|processo|principal|associativa|apoio|externa)?\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9\s\-_/]{1,80})",
        text,
        flags=re.IGNORECASE,
    ):
        entity_type = match.group(1) or ""
        entity_name = str(match.group(2) or "").split(",", 1)[0].split(".", 1)[0].strip()
        add_entity(entity_name, entity_type)

    return parsed


def _infer_entity_type(
    process_name: str,
    entity_name: str,
    goal: str,
    source_entity_payload: dict[str, Any],
    fields: list[dict[str, Any]],
) -> str:
    source_type = _normalize_entity_type(source_entity_payload.get("tipoEntidade"), default="")
    if source_type in {"contato", "processo"}:
        return source_type

    text = _normalize_ai_text(" ".join([process_name, entity_name, goal]))

    # Entidades que representam pessoas ou organizacoes -> contato
    person_org_hints = (
        "cliente", "fornecedor", "parceiro", "funcionario", "gestor",
        "colaborador", "prestador", "usuario", "operador", "responsavel",
        "terceiro", "pessoa", "empresa", "organizacao",
    )
    if any(hint in text for hint in person_org_hints):
        return "contato"

    # Entidades que representam objetos, documentos ou artefatos -> processo
    return "processo"


def _extract_existing_entities_context(context: dict[str, Any]) -> list[dict[str, Any]]:
    raw_value = context.get("existingEntities") if isinstance(context, dict) else []
    raw_entities: list[Any] = raw_value if isinstance(raw_value, list) else []
    existing_entities: list[dict[str, Any]] = []

    for item in raw_entities:
        if not isinstance(item, dict):
            continue

        nome = str(item.get("nome") or item.get("name") or "").strip()
        if not nome:
            continue

        raw_fields_value = item.get("campos")
        raw_fields: list[Any] = raw_fields_value if isinstance(raw_fields_value, list) else []
        fields: list[dict[str, Any]] = []
        for field in raw_fields:
            if not isinstance(field, dict):
                continue
            field_name = str(field.get("nome") or "").strip()
            if not field_name:
                continue
            fields.append(
                {
                    "nome": field_name,
                    "tipo": str(field.get("tipo") or "Texto").strip(),
                    "keyType": str(field.get("keyType") or "NORMAL").strip().upper(),
                }
            )

        existing_entities.append(
            {
                "id": item.get("id"),
                "nome": nome,
                "descricao": str(item.get("descricao") or "").strip(),
                "tipoEntidade": _normalize_entity_type(str(item.get("tipoEntidade") or ""), default="processo"),
                "campos": fields,
            }
        )

    return existing_entities[:50]


def _find_matching_existing_entity(
    entity_candidates: list[str],
    existing_entities: list[dict[str, Any]],
) -> dict[str, Any] | None:
    normalized_candidates = [
        _normalize_ai_text(candidate)
        for candidate in entity_candidates
        if str(candidate or "").strip()
    ]
    if not normalized_candidates:
        return None

    for existing_entity in existing_entities:
        existing_name = _normalize_ai_text(existing_entity.get("nome"))
        if not existing_name:
            continue
        for candidate in normalized_candidates:
            if candidate == existing_name:
                return existing_entity
            if candidate and existing_name and (candidate in existing_name or existing_name in candidate):
                return existing_entity
    return None


def _has_exact_existing_entity_name(candidate_name: str, existing_entities: list[dict[str, Any]]) -> bool:
    candidate_normalized = _normalize_ai_text(candidate_name)
    if not candidate_normalized:
        return False

    for existing_entity in existing_entities:
        existing_name = _normalize_ai_text(existing_entity.get("nome"))
        if existing_name and existing_name == candidate_normalized:
            return True

    return False


def _extract_entity_names_from_bpmn_payload(payload: dict[str, Any]) -> list[str]:
    if not isinstance(payload, dict):
        return []

    names: list[str] = []

    raw_nodes_value = payload.get("nodes")
    raw_nodes: list[Any] = raw_nodes_value if isinstance(raw_nodes_value, list) else []
    for node in raw_nodes:
        if not isinstance(node, dict):
            continue
        node_type = _stage_type_to_node_type(node.get("nodeType") or "")
        if node_type != "entidade":
            continue
        candidate = str(node.get("entidadeNome") or node.get("label") or "").strip()
        if candidate:
            names.append(candidate)

    raw_stages_value = payload.get("stages")
    raw_stages: list[Any] = raw_stages_value if isinstance(raw_stages_value, list) else []
    for stage in raw_stages:
        if not isinstance(stage, dict):
            continue
        stage_type = _normalize_bpmn_stage_type(stage.get("tipo") or stage.get("type") or "", default="task")
        if stage_type not in {"dados", "entidade"}:
            continue
        candidate = str(stage.get("nome") or stage.get("name") or "").strip()
        if candidate:
            names.append(candidate)

    return _dedupe_preserve_order(names)


def _ensure_entity_actions(
    actions: list[dict[str, Any]],
    process_name: str,
    suggested_entities: list[str],
    existing_entities: list[dict[str, Any]],
    entity_type_by_name: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    sanitized_actions = [item for item in actions if isinstance(item, dict)]
    existing_create_entities: list[str] = []
    bpmn_entities: list[str] = []

    for raw_action in sanitized_actions:
        if not isinstance(raw_action, dict):
            continue

        action: dict[str, Any] = raw_action
        action_type = str(action.get("type") or "").strip()
        payload_raw = action.get("payload")
        payload: dict[str, Any] = payload_raw if isinstance(payload_raw, dict) else {}

        if action_type == "create_entidade":
            entity_name = str(payload.get("nome") or "").strip()
            if entity_name:
                existing_create_entities.append(entity_name)
        elif action_type == "update_bpmn_state":
            bpmn_entities.extend(_extract_entity_names_from_bpmn_payload(payload))

    existing_create_entities = _dedupe_preserve_order(existing_create_entities)
    candidate_entities = _dedupe_preserve_order(
        [
            str(name or "").strip()
            for name in [*suggested_entities, *bpmn_entities, process_name]
            if str(name or "").strip()
        ]
    )

    entity_actions_to_add: list[dict[str, Any]] = []
    max_entities = len(suggested_entities)
    if len(existing_create_entities) >= max_entities:
        for index, action in enumerate(sanitized_actions, start=1):
            action["id"] = f"a{index}"
        return sanitized_actions

    needed = max_entities - len(existing_create_entities)
    candidate_entities_limited = [c for c in suggested_entities if str(c or "").strip()][:needed]
    full_reference_list = _dedupe_preserve_order([*existing_create_entities, *candidate_entities_limited])

    for candidate_name in candidate_entities_limited:
        if _normalize_ai_text(candidate_name) in {
            _normalize_ai_text(name) for name in existing_create_entities
        }:
            continue

        entity_index = len(existing_create_entities) + len(entity_actions_to_add) + 1
        normalized_candidate = _normalize_ai_text(candidate_name)
        preferred_type = (
            str((entity_type_by_name or {}).get(normalized_candidate) or "").strip()
            if normalized_candidate
            else ""
        )
        entity_kind = _entity_type_label(preferred_type, entity_index)
        entity_actions_to_add.append(
            {
                "type": "create_entidade",
                "label": f"Criar entidade {candidate_name}",
                "risk": "medium",
                "requiresApproval": True,
                "payload": {
                    "nome": candidate_name,
                    "descricao": _default_entity_description(candidate_name, entity_kind, process_name),
                    "categoria": process_name,
                    "tipoEntidade": entity_kind,
                    "campos": _sanitize_entity_fields(
                        [],
                        candidate_name,
                        _build_default_entity_fields_with_references(
                            candidate_name,
                            entity_index,
                            full_reference_list,
                        ),
                    ),
                },
            }
        )

    if not entity_actions_to_add:
        for index, action in enumerate(sanitized_actions, start=1):
            action["id"] = f"a{index}"
        return sanitized_actions

    insert_at = next(
        (
            index
            for index, action in enumerate(sanitized_actions)
            if str(action.get("type") or "").strip() != "create_entidade"
        ),
        len(sanitized_actions),
    )
    merged_actions = [
        *sanitized_actions[:insert_at],
        *entity_actions_to_add,
        *sanitized_actions[insert_at:],
    ]

    for index, action in enumerate(merged_actions, start=1):
        action["id"] = f"a{index}"

    return merged_actions


def _is_effective_bpmn_payload(payload: dict[str, Any] | None) -> bool:
    if not isinstance(payload, dict):
        return False

    raw_nodes = payload.get("nodes")
    raw_connections = payload.get("connections")
    nodes = raw_nodes if isinstance(raw_nodes, list) else []
    connections = raw_connections if isinstance(raw_connections, list) else []

    # Minimal viability for editor rendering and branch semantics.
    return len(nodes) >= 2 and len(connections) >= 1


def _build_default_opportunity_payload(goal: str, process_name: str, current_user: dict[str, Any]) -> dict[str, Any]:
    return {
        "nome": process_name,
        "descricao": str(goal or "").strip(),
        "etapa": "Mapeamento",
        "responsavel": str(current_user.get("nome") or "Usuario IA"),
        "status": "Em andamento",
    }


def _ensure_core_plan_actions(
    actions: list[dict[str, Any]],
    goal: str,
    process_name: str,
    current_user: dict[str, Any],
    fallback_bpmn_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    safe_actions = [item for item in actions if isinstance(item, dict)]

    has_opportunity = any(str(action.get("type") or "").strip() == "create_oportunidade" for action in safe_actions)
    bpmn_action_index = next(
        (
            index
            for index, action in enumerate(safe_actions)
            if str(action.get("type") or "").strip() == "update_bpmn_state"
        ),
        -1,
    )

    if not has_opportunity:
        safe_actions.append(
            {
                "type": "create_oportunidade",
                "label": "Criar oportunidade inicial para o fluxo",
                "risk": "medium",
                "requiresApproval": True,
                "payload": _build_default_opportunity_payload(goal, process_name, current_user),
            }
        )

    if bpmn_action_index < 0:
        safe_actions.append(
            {
                "type": "update_bpmn_state",
                "label": "Atualizar rascunho completo do editor BPMN",
                "risk": "low",
                "requiresApproval": True,
                "payload": fallback_bpmn_payload,
            }
        )
    else:
        bpmn_action = safe_actions[bpmn_action_index]
        payload_raw = bpmn_action.get("payload")
        payload = payload_raw if isinstance(payload_raw, dict) else {}
        if _is_effective_bpmn_payload(payload):
            bpmn_action["payload"] = _sanitize_bpmn_payload(payload, bpmn_action_index + 1)
        else:
            bpmn_action["payload"] = fallback_bpmn_payload

    # Stable ordering improves UX: entities -> opportunity -> bpmn.
    type_rank = {
        "create_entidade": 0,
        "create_oportunidade": 1,
        "update_bpmn_state": 2,
    }
    safe_actions.sort(key=lambda action: type_rank.get(str(action.get("type") or "").strip(), 99))

    for index, action in enumerate(safe_actions, start=1):
        action["id"] = f"a{index}"

    return safe_actions


def _build_context_panel_suggestion_from_actions(
    actions: list[dict[str, Any]],
    process_name: str,
    entity_name: str,
    goal: str,
    existing_entity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entity_payload = {}
    for action in actions:
        if not isinstance(action, dict):
            continue
        if str(action.get("type") or "").strip() == "create_entidade":
            payload = action.get("payload")
            if isinstance(payload, dict):
                entity_payload = payload
                break

    source_entity_payload = existing_entity if isinstance(existing_entity, dict) else entity_payload

    raw_fields_value = source_entity_payload.get("campos")
    raw_fields: list[Any] = raw_fields_value if isinstance(raw_fields_value, list) else []
    fields = []
    for field in raw_fields:
        if not isinstance(field, dict):
            continue
        nome = str(field.get("nome") or "").strip()
        if not nome:
            continue
        fields.append(
            {
                "nome": nome,
                "tipo": str(field.get("tipo") or "Texto").strip(),
                "obrigatorio": field.get("obrigatorio") is True,
                "keyType": str(field.get("keyType") or "NORMAL").strip().upper(),
                "referencia": str(field.get("referencia") or field.get("relacionamento") or "").strip(),
            }
        )

    inferred_entity_type = _infer_entity_type(
        process_name,
        entity_name,
        goal,
        source_entity_payload,
        fields,
    )

    return {
        "stageCategory": "dados",
        "stageConfigMode": "entidade",
        "entityType": inferred_entity_type,
        "entityMode": "existente" if existing_entity else "nova",
        "newEntity": {
            "nome": _sanitize_node_name_by_type(
                source_entity_payload.get("nome") or entity_name or process_name,
                "entidade",
                1,
            ),
            "descricao": str(source_entity_payload.get("descricao") or goal).strip(),
            "atributoChave": str(source_entity_payload.get("atributoChave") or "id").strip(),
        },
        "task": {
            "nome": _sanitize_node_name_by_type(process_name or "Atividade IA", "task", 1),
            "descricao": str(goal).strip(),
        },
        "conditional": {
            "nome": _sanitize_node_name_by_type("Validacao", "condicional", 1),
            "descricao": "Decisao sugerida pela IA",
        },
        "fields": fields,
    }


def _normalize_bpmn_ia_decision_label(value: Any, fallback_index: int) -> str:
    raw = " ".join(str(value or "").strip().split())
    normalized = _normalize_ai_text(raw)
    if normalized in {"yes", "sim", "true", "aprovado", "deferido"}:
        return "sim"
    if normalized in {"no", "nao", "não", "false", "reprovado", "indeferido"}:
        return "nao"
    if raw:
        return raw[:28]
    return "sim" if fallback_index == 1 else "nao"


def _normalize_bpmn_ia_node_type(raw_type: Any) -> str:
    normalized = str(raw_type or "").strip().lower()
    if normalized in {"exclusivegateway", "inclusivegateway", "parallelgateway"}:
        return "condicional"
    return "task"


def _gateway_type_from_bpmn_ia_type(raw_type: Any) -> str:
    normalized = str(raw_type or "").strip().lower()
    if normalized == "parallelgateway":
        return "and"
    if normalized == "inclusivegateway":
        return "or"
    return "xor"


def _build_bpmn_payload_from_bpmn_ia_process(process_name: str, process_elements: list[dict[str, Any]]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    connections: list[dict[str, Any]] = []
    stages: list[dict[str, Any]] = []
    seen_nodes: set[str] = set()
    connection_keys: set[tuple[str, str, str]] = set()

    lane_counter = 0

    def ensure_node(element: dict[str, Any], depth: int, lane: int) -> str:
        nonlocal lane_counter
        element_id = str(element.get("id") or f"bpmn-ia-node-{len(nodes) + 1}").strip()
        if not element_id:
            element_id = f"bpmn-ia-node-{len(nodes) + 1}"

        if element_id in seen_nodes:
            return element_id

        raw_type = str(element.get("type") or "task").strip()
        node_type = _normalize_bpmn_ia_node_type(raw_type)

        raw_label = str(element.get("label") or "").strip()
        if not raw_label and raw_type == "startEvent":
            raw_label = "Inicio"
        if not raw_label and raw_type == "endEvent":
            raw_label = "Fim do processo"
        if not raw_label and node_type == "condicional":
            raw_label = "Decisao"
        if not raw_label:
            raw_label = "Atividade"

        label = _sanitize_node_name_by_type(raw_label, node_type, len(nodes) + 1)
        x = 140 + (depth * 240)
        y = 120 + (lane * 170)

        node_payload: dict[str, Any] = {
            "id": element_id,
            "label": label,
            "nodeType": node_type,
            "x": x,
            "y": y,
        }

        if node_type == "condicional":
            cond_desc = _conditional_description_from_name(label)
            node_payload["condicionalNome"] = label
            node_payload["condicionalDescricao"] = cond_desc
            node_payload["gatewayType"] = _gateway_type_from_bpmn_ia_type(raw_type)
            node_payload["descricao"] = cond_desc
        else:
            task_desc = _activity_description_from_text(raw_label, len(nodes) + 1)
            node_payload["taskNome"] = label
            node_payload["taskDescricao"] = task_desc
            node_payload["descricao"] = task_desc

        nodes.append(node_payload)
        stages.append(
            {
                "id": element_id,
                "nome": label,
                "tipo": "condicional" if node_type == "condicional" else "task",
                "participante": "",
            }
        )
        seen_nodes.add(element_id)
        lane_counter = max(lane_counter, lane)
        return element_id

    def add_connection(from_id: str, to_id: str, decision: str = "") -> None:
        if not from_id or not to_id or from_id == to_id:
            return
        normalized_decision = str(decision or "").strip()
        key = (from_id, to_id, normalized_decision.lower())
        if key in connection_keys:
            return
        connection_keys.add(key)

        decision_lower = normalized_decision.lower()
        from_handle = "right"
        if decision_lower == "nao":
            from_handle = "bottom"

        connections.append(
            {
                "id": f"bpmn-ia-conn-{len(connections) + 1}",
                "from": from_id,
                "to": to_id,
                "fromHandle": from_handle,
                "toHandle": "left",
                "decision": normalized_decision,
            }
        )

    def walk_sequence(
        elements: list[dict[str, Any]],
        previous_ids: list[str],
        depth: int,
        lane: int,
        first_decision: str = "",
    ) -> list[str]:
        current_previous = [item for item in previous_ids if item]
        first_link = True

        for element in elements:
            if not isinstance(element, dict):
                continue

            node_id = ensure_node(element, depth, lane)
            for previous_id in current_previous:
                add_connection(previous_id, node_id, first_decision if first_link else "")

            first_link = False

            element_type = str(element.get("type") or "").strip().lower()
            if element_type in {"exclusivegateway", "inclusivegateway", "parallelgateway"}:
                branches_raw = element.get("branches")
                branch_elements: list[Any]
                if isinstance(branches_raw, list):
                    branch_elements = branches_raw
                else:
                    branch_elements = []

                branch_endpoints: list[str] = []
                for branch_index, branch in enumerate(branch_elements, start=1):
                    if element_type == "parallelgateway" and isinstance(branch, list):
                        path = [item for item in branch if isinstance(item, dict)]
                        decision_label = f"Ramo {branch_index}"
                    elif isinstance(branch, dict):
                        path_raw = branch.get("path")
                        path = [item for item in path_raw if isinstance(item, dict)] if isinstance(path_raw, list) else []
                        decision_label = _normalize_bpmn_ia_decision_label(branch.get("condition"), branch_index)
                    else:
                        continue

                    branch_lane = lane + branch_index
                    branch_end_ids = walk_sequence(
                        path,
                        [node_id],
                        depth + 1,
                        branch_lane,
                        first_decision=decision_label,
                    )
                    branch_endpoints.extend(branch_end_ids)

                current_previous = _dedupe_preserve_order(branch_endpoints) if branch_endpoints else [node_id]
                continue

            current_previous = [node_id]

        return current_previous

    walk_sequence(process_elements, [], depth=0, lane=0)

    payload = {
        "name": str(process_name or "").strip() or "BPMN gerado por BPMN-IA",
        "nodes": nodes,
        "connections": connections,
        "stages": stages,
    }
    return _sanitize_bpmn_payload(payload, 3)


def _extract_bpmn_ia_process(raw_bpmn_json: Any) -> list[dict[str, Any]]:
    if isinstance(raw_bpmn_json, list):
        return [item for item in raw_bpmn_json if isinstance(item, dict)]

    if isinstance(raw_bpmn_json, dict):
        raw_process = raw_bpmn_json.get("process")
        if isinstance(raw_process, list):
            return [item for item in raw_process if isinstance(item, dict)]

    return []


def _build_bpmn_ia_api_keys() -> dict[str, str]:
    keys: dict[str, str] = {}

    openai_key = str(os.getenv("OPENAI_API_KEY") or "").strip()
    anthropic_key = str(os.getenv("ANTHROPIC_API_KEY") or "").strip()
    google_key = str(os.getenv("GEMINI_API_KEY") or "").strip()
    fireworks_key = str(os.getenv("FIREWORKS_AI_API_KEY") or "").strip()

    if openai_key:
        keys["openai_api_key"] = openai_key
    if anthropic_key:
        keys["anthropic_api_key"] = anthropic_key
    if google_key:
        keys["google_api_key"] = google_key
    if fireworks_key:
        keys["fireworks_api_key"] = fireworks_key

    return keys


def _build_ai_plan_via_bpmn_ia(
    goal: str,
    current_user: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any] | None:
    if AI_PROVIDER not in {"bpmn_ia", "auto", "hybrid"}:
        return None

    process_name = str(context.get("processName") or "Processo sugerido pela IA").strip()
    goal_entities = _extract_goal_data_entities(goal)
    goal_entity_names = [
        str(item.get("nome") or "").strip()
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    ]
    goal_entity_type_by_name = {
        _normalize_ai_text(item.get("nome")): str(item.get("tipo") or "")
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    }

    suggested_entities = _dedupe_preserve_order([
        *_extract_suggested_entity_names(context),
        *[str(name or "").strip() for name in goal_entity_names],
    ])
    entity_name = str((suggested_entities[0] if suggested_entities else process_name) or "Entidade IA").strip()
    general_analysis = _build_general_process_analysis(goal, process_name, entity_name)
    existing_entities = _extract_existing_entities_context(context)

    message_history = [
        {
            "role": "user",
            "content": goal,
        }
    ]

    request_payload = {
        "message_history": message_history,
        "process": None,
        "model": BPMN_IA_MODEL,
    }

    bpmn_ia_api_keys = _build_bpmn_ia_api_keys()
    if bpmn_ia_api_keys:
        request_payload["api_keys"] = bpmn_ia_api_keys

    response = requests.post(
        f"{BPMN_IA_BASE_URL}/modify",
        json=request_payload,
        timeout=AI_LLM_TIMEOUT_SECONDS,
    )
    if not response.ok:
        raise RuntimeError(f"Falha BPMN-IA: HTTP {response.status_code}")

    response_payload = response.json()
    process_elements = _extract_bpmn_ia_process(response_payload.get("bpmn_json") if isinstance(response_payload, dict) else None)
    if not process_elements:
        return None

    bpmn_payload = _build_bpmn_payload_from_bpmn_ia_process(process_name, process_elements)
    bpmn_payload = _ensure_bpmn_entity_nodes(
        bpmn_payload,
        _dedupe_preserve_order([*goal_entity_names]),
        3,
    )

    actions: list[dict[str, Any]] = [
        {
            "id": "a1",
            "type": "create_oportunidade",
            "label": "Criar oportunidade inicial para o fluxo",
            "risk": "medium",
            "requiresApproval": True,
            "payload": _build_default_opportunity_payload(goal, process_name, current_user),
        },
        {
            "id": "a2",
            "type": "update_bpmn_state",
            "label": "Atualizar rascunho completo do editor BPMN",
            "risk": "low",
            "requiresApproval": True,
            "payload": bpmn_payload,
        },
    ]

    actions = _ensure_entity_actions(
        actions,
        process_name,
        _dedupe_preserve_order([*suggested_entities, *goal_entity_names]),
        existing_entities,
        goal_entity_type_by_name,
    )

    actions = _ensure_core_plan_actions(
        actions,
        goal,
        process_name,
        current_user,
        bpmn_payload,
    )

    matched_existing_entity = _find_matching_existing_entity(
        [entity_name, process_name, goal],
        existing_entities,
    )
    context_panel = _build_context_panel_suggestion_from_actions(
        actions,
        process_name,
        entity_name,
        goal,
        matched_existing_entity,
    )

    return {
        "goal": goal,
        "mode": "supervised",
        "requiresHumanApproval": True,
        "generatedAt": now_iso(),
        "provider": "bpmn_ia",
        "model": BPMN_IA_MODEL,
        "generalAnalysis": general_analysis,
        "actions": actions,
        "contextPanelSuggestion": context_panel,
    }


def _build_ai_plan_via_openai(goal: str, current_user: dict[str, Any], context: dict[str, Any]) -> dict[str, Any] | None:
    if AI_PROVIDER != "openai" or not OPENAI_API_KEY:
        return None

    process_name = str(context.get("processName") or "Processo sugerido pela IA").strip()
    goal_entities = _extract_goal_data_entities(goal)
    goal_entity_names = [
        str(item.get("nome") or "").strip()
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    ]
    goal_entity_type_by_name = {
        _normalize_ai_text(item.get("nome")): str(item.get("tipo") or "")
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    }
    suggested_entities = _dedupe_preserve_order([
        *_extract_suggested_entity_names(context),
        *[str(name or "").strip() for name in goal_entity_names],
    ])
    entity_name = str((suggested_entities[0] if suggested_entities else process_name) or "Entidade IA").strip()
    general_analysis = _build_general_process_analysis(goal, process_name, entity_name)
    existing_entities = _extract_existing_entities_context(context)
    fallback_bpmn_payload, fallback_entities = _build_local_bpmn_payload(
        goal,
        process_name,
        entity_name,
        general_analysis,
    )

    system_prompt = (
        "Voce e um planejador operacional para um CRM/BPMN. "
        "Antes de gerar o diagrama, execute uma analise geral do processo e use essa analise para definir o melhor modelo BPMN. "
        "Modele com regras estritas: atividade=task (amarelo), decisao=condicional XOR (azul), dados=entidade (verde). "
        "Todo elemento de fluxo deve estar conectado por setas de fluxo, sem blocos isolados. "
        "Entidades de dados nao entram na sequencia principal do fluxo; elas devem ser associadas as atividades que usam ou produzem os dados. "
        "Nao crie entidades soltas sem associacao. "
        "Cada gateway XOR deve ter exatamente dois ramos principais com semantica Sim/Nao e destinos coerentes. "
        "Retorne SOMENTE JSON valido com este formato: "
        "{\"actions\":[{\"id\":\"a1\",\"type\":\"create_entidade|create_oportunidade|update_bpmn_state\","
        "\"label\":\"...\",\"risk\":\"low|medium|high\",\"payload\":{...}}]}. "
        "Nao inclua markdown, comentarios ou texto fora do JSON. "
        "As acoes devem ser concretas, curtas e executaveis no sistema. "
        "NOMES OBRIGATORIAMENTE CURTOS: atividades com no maximo 2 palavras (ex: 'Aprovar', 'Enviar NF', 'Revisar'), entidades com no maximo 2 palavras (ex: 'Pedido', 'NF Fiscal', 'Aprovacao'), condicionais com no maximo 4 palavras + '?'. "
        "NUNCA use nomes longos como 'Registrar Solicitacao de Compra' — use 'Registrar Solicitacao'. "
        "DESCRICAO — REGRAS ABSOLUTAS PARA TODOS OS ELEMENTOS (entidade, atividade e condicional): "
        "(1) O campo 'descricao' e OBRIGATORIO em todo elemento — jamais deixe vazio, nulo ou use 'Gerada por IA'. "
        "(2) ENTIDADE: descreva quem usa a entidade, quando ela e criada/atualizada e qual papel ela cumpre no processo (minimo 1 frase completa). "
        "(3) ATIVIDADE: descreva o que acontece neste passo, quem executa e qual o resultado esperado (minimo 1 frase completa). "
        "(4) CONDICIONAL: descreva qual criterio e avaliado e quem decide (minimo 1 frase completa). NAO explique os caminhos SIM/NAO, o diagrama ja mostra isso. "
        "(5) NUNCA repita nem parafraseie o nome na descricao. "
        "(6) PROIBIDO iniciar com: 'Entidade do processo:', 'Entidade de', 'Representa a entidade', 'Atividade que', 'Condicional que'. "
        "Exemplo ERRADO: nome='Cliente', descricao='Cliente'. "
        "Exemplo ERRADO: nome='Analisar Pedido', descricao='Analise do pedido'. "
        "Exemplo ERRADO: nome='Aprovado?', descricao='Verifica aprovacao'. "
        "Exemplo CORRETO (entidade): nome='Cliente', descricao='Pessoa ou empresa que solicita o servico; seus dados sao registrados no inicio do processo e consultados em cada etapa de aprovacao'. "
        "Exemplo CORRETO (atividade): nome='Analisar Pedido', descricao='Responsavel verifica se o pedido atende as politicas internas de prazo e orcamento antes de seguir para aprovacao'. "
        "Exemplo CORRETO (condicional): nome='Aprovado?', descricao='Gestor avalia se o pedido atende aos criterios financeiros e de prazo'. "
        "TIPO DA ENTIDADE (campo tipoEntidade): existem apenas dois tipos possiveis — 'contato' e 'processo'. "
        "  - 'contato': use para entidades que representam PESSOAS ou ORGANIZACOES envolvidas no processo — quem executa, solicita, aprova ou e afetado. "
        "    Exemplos: Cliente, Fornecedor, Funcionario, Gestor, Parceiro, Colaborador, Prestador. "
        "    Na plataforma, Contatos sao vinculados a Oportunidades e possuem campos como nome, cargo, email e telefone. "
        "    Use 'contato' quando a entidade responde a perguntas como: Quem solicitou? Quem aprova? Quem fornece? "
        "  - 'processo': use para entidades que representam OBJETOS, DOCUMENTOS ou ARTEFATOS que fluem pelo processo — o que e processado, criado ou transformado. "
        "    Exemplos: Pedido, Contrato, Solicitacao, Nota Fiscal, Proposta, Orcamento, Item, Aprovacao, Relatorio. "
        "    Na plataforma, Processos sao registros estruturados com campos personalizados definidos pela entidade. "
        "    Use 'processo' quando a entidade responde a perguntas como: O que esta sendo processado? O que e criado? O que e aprovado? "
        "  REGRA: nunca use 'contato' para documentos ou objetos; nunca use 'processo' para pessoas ou empresas. "
        "Identifique o tipo correto com base no papel da entidade no processo descrito. "
        "Quando houver condicional (XOR), gere ramos com sentido de negocio (sim/nao) e evite decisao sem bifurcacao real. "
        "NUNCA coloque duas condicionais consecutivas no flowOrder — sempre insira pelo menos uma atividade (task) entre duas condicionais. "
        "Sempre inclua acoes para oportunidade e update_bpmn_state com payload completo (nodes, connections, stages). "
        "Use somente tipos suportados no BPMN: task, condicional e entidade. "
        "IMPORTANTE: gere uma acao create_entidade para CADA entidade sugerida pelo usuario (suggestedEntityNames) — nao omita nenhuma. "
        "No BPMN (update_bpmn_state), inclua nodes do tipo entidade para as entidades sugeridas pelo usuario."
    )

    user_prompt = {
        "goal": goal,
        "context": {
            "processName": process_name,
            "entityName": entity_name,
            "suggestedEntityNames": suggested_entities,
            "currentUserName": current_user.get("nome"),
            "currentUserRole": current_user.get("role"),
            "existingEntities": [
                {
                    "nome": item.get("nome"),
                    "tipoEntidade": item.get("tipoEntidade"),
                    "campos": item.get("campos"),
                }
                for item in existing_entities[:20]
            ],
            "goalDataEntities": [
                {
                    "nome": item.get("nome"),
                    "tipoEntidade": item.get("tipo"),
                }
                for item in goal_entities[:20]
            ],
            "generalAnalysis": general_analysis,
            "allowedActionTypes": [
                "create_entidade",
                "create_oportunidade",
                "update_bpmn_state",
            ],
        },
        "constraints": {
            "maxActions": 2 + len(suggested_entities),
            "requiresHumanApproval": True,
            "nameMaxLengths": {
                "entityName": AI_ENTITY_NAME_MAX_LENGTH,
                "taskName": AI_ACTIVITY_NAME_MAX_LENGTH,
                "conditionalName": AI_CONDITIONAL_NAME_MAX_LENGTH,
            },
            "avoidIncompleteNames": True,
            "decisionRules": {
                "useMeaningfulQuestionLabels": True,
                "requireBusinessSemanticsInBranches": True,
                "avoidDecisionWithSingleEffectivePath": True,
                "allowConvergingBranchesAfterDifferentSteps": True,
            },
        },
    }

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENAI_MODEL,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
            ],
        },
        timeout=AI_LLM_TIMEOUT_SECONDS,
    )

    if not response.ok:
        raise RuntimeError(f"Falha LLM OpenAI: HTTP {response.status_code}")

    response_payload = response.json()
    payload = response_payload if isinstance(response_payload, dict) else {}
    choices = payload.get("choices") if isinstance(payload, dict) else []
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("Resposta LLM sem choices")

    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message") if isinstance(first, dict) else {}
    content = message.get("content") if isinstance(message, dict) else ""
    parsed = _extract_json_object(str(content or ""))
    if not parsed:
        raise RuntimeError("Resposta LLM sem JSON valido")

    raw_actions_value = parsed.get("actions")
    raw_actions: list[Any] = raw_actions_value if isinstance(raw_actions_value, list) else []
    sanitized_actions: list[dict[str, Any]] = []
    for index, raw_action in enumerate(raw_actions, 1):
        action = _sanitize_llm_action(raw_action, index, current_user)
        if action:
            sanitized_actions.append(action)

    # Dedup create_entidade por nome (sem limite de quantidade)
    _seen_entity_names: set[str] = set()
    filtered_actions: list[dict[str, Any]] = []
    for _a in sanitized_actions:
        if str(_a.get("type") or "") == "create_entidade":
            _ename = (_a.get("payload") or {}).get("nome") or ""
            _ekey = str(_ename).strip().lower()
            if _ekey and _ekey in _seen_entity_names:
                continue
            if _ekey:
                _seen_entity_names.add(_ekey)
        filtered_actions.append(_a)
    sanitized_actions = filtered_actions

    sanitized_actions = _ensure_entity_actions(
        sanitized_actions,
        process_name,
        _dedupe_preserve_order([*suggested_entities, *fallback_entities]),
        existing_entities,
        goal_entity_type_by_name,
    )

    sanitized_actions = _ensure_core_plan_actions(
        sanitized_actions,
        goal,
        process_name,
        current_user,
        fallback_bpmn_payload,
    )

    bpmn_action = next(
        (
            action
            for action in sanitized_actions
            if str(action.get("type") or "").strip() == "update_bpmn_state"
            and isinstance(action.get("payload"), dict)
        ),
        None,
    )
    if bpmn_action is not None:
        bpmn_payload = bpmn_action.get("payload")
        bpmn_action["payload"] = _sanitize_bpmn_payload(
            bpmn_payload if isinstance(bpmn_payload, dict) else {},
            3,
        )

    if not sanitized_actions:
        return None

    matched_existing_entity = _find_matching_existing_entity(
        [entity_name, process_name, goal],
        existing_entities,
    )

    context_panel = _sanitize_context_panel_suggestion(parsed.get("contextPanelSuggestion"))
    if not context_panel:
        context_panel = _build_context_panel_suggestion_from_actions(
            sanitized_actions,
            process_name,
            entity_name,
            goal,
            matched_existing_entity,
        )

    return {
        "goal": goal,
        "mode": "supervised",
        "requiresHumanApproval": True,
        "generatedAt": now_iso(),
        "provider": "openai",
        "model": OPENAI_MODEL,
        "generalAnalysis": general_analysis,
        "actions": sanitized_actions,
        "contextPanelSuggestion": context_panel,
    }


def _default_entity_campos(entity_label: str) -> list[dict[str, Any]]:
    norm = re.sub(r"[^a-z0-9]", "_", _normalize_ai_text(entity_label)).strip("_")
    return [
        {"nome": f"id_{norm}", "tipo": "numero", "obrigatorio": True, "keyType": "PK", "relacionamento": None},
        {"nome": "nome", "tipo": "texto", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
        {"nome": "descricao", "tipo": "texto", "obrigatorio": False, "keyType": "NORMAL", "relacionamento": None},
        {"nome": "data_criacao", "tipo": "data", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
    ]


def _normalize_goal_for_bpmn_parse(goal: str) -> str:
    """Extrai e normaliza o fluxo do goal para que _build_bpmn_from_flow_steps e o Groq
    recebam cada parte '->' em sua própria linha, com Sim/Nao em linhas indentadas.
    Remove os prefixos 'Nome do processo:' e 'Fluxo do processo:'.
    """
    text = str(goal or "").strip()

    # Extrai só o texto depois de 'Fluxo do processo:' se presente
    m = re.search(r'Fluxo do processo:\s*', text, re.IGNORECASE)
    if m:
        text = text[m.end():]

    # Remove prefixo 'Nome do processo: X' no início se restar
    text = re.sub(r'^Nome do processo:[^\n]*\n?', '', text, flags=re.IGNORECASE).strip()

    # Insere newline antes de ramos Sim/Nao que estão no meio da linha
    text = re.sub(r'\s+(Sim\s*->)', r'\n  Sim ->', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+(N[aã]o\s*->)', r'\n  Nao ->', text, flags=re.IGNORECASE)

    return text.strip()



def _build_bpmn_from_flow_steps(
    goal: str,
    entity_names: list[str],
    process_name: str,
    fallback_id: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Gera nodes e connections diretamente do formato '->' sem depender de LLM.
    Regras:
    - Cada parte separada por '->' vira um node.
    - Linha começando com 'Sim ->' ou 'Nao ->' inicia um ramo do condicional mais recente.
    - Condicional detectado por label terminando em '?'.
    - Entidade detectada quando label normalizado bate com entity_names.
    - Resto é task.
    """
    entity_norm_map: dict[str, str] = {_normalize_ai_text(e): e for e in (entity_names or [])}
    nodes: list[dict[str, Any]] = []
    connections: list[dict[str, Any]] = []
    node_counter = 0
    conn_counter = 0

    def add_conn(from_id: str, to_id: str, decision: str = "") -> None:
        nonlocal conn_counter
        conn_counter += 1
        connections.append({
            "id": f"c{fallback_id}_{conn_counter}",
            "from": from_id,
            "to": to_id,
            "fromHandle": "bottom" if decision == "nao" else "right",
            "toHandle": "left",
            "decision": decision,
        })

    def classify(label: str) -> tuple[str, str]:
        """Returns (nodeType, canonical_label)."""
        norm = _normalize_ai_text(label)
        if label.rstrip().endswith("?"):
            return "condicional", label
        if norm in entity_norm_map:
            return "entidade", entity_norm_map[norm]
        return "task", label

    # cond_stack: list of {id, sim_done, nao_done}
    cond_stack: list[dict[str, Any]] = []
    prev_id: str | None = None

    for raw_line in (goal or "").split("\n"):
        stripped = raw_line.strip()
        if not stripped or re.match(r"^(fluxo|entidade|nome do processo)", stripped, re.IGNORECASE):
            continue

        branch = ""
        m = re.match(r"^(Sim|Nao|N\u00e3o)\s*->\s*", stripped, re.IGNORECASE)
        if m:
            token = m.group(1).strip().lower()
            branch = "sim" if token == "sim" else "nao"
            stripped = stripped[m.end():]

        parts = [p.strip() for p in stripped.split("->") if p.strip()]
        line_first = True

        for part in parts:
            node_counter += 1
            node_id = f"n{fallback_id}_{node_counter}"
            ntype, canonical_label = classify(part)

            node: dict[str, Any] = {
                "id": node_id,
                "label": canonical_label,
                "nodeType": ntype,
                "x": 100.0,
                "y": 200.0,
            }
            if ntype == "entidade":
                node["campos"] = _default_entity_campos(canonical_label)
            nodes.append(node)

            # Build connection
            if line_first and branch:
                # First node in a Sim/Nao branch → connect from right conditional
                target_cond: dict[str, Any] | None = None
                for c in reversed(cond_stack):
                    key = f"{branch}_done"
                    if not c.get(key):
                        target_cond = c
                        c[key] = True
                        break
                if target_cond:
                    add_conn(target_cond["id"], node_id, branch)
                prev_id = node_id
            else:
                if prev_id is not None:
                    add_conn(prev_id, node_id, "")
                prev_id = node_id

            if ntype == "condicional":
                cond_stack.append({"id": node_id, "sim_done": False, "nao_done": False})

            line_first = False

    return nodes, connections


def _parse_goal_to_flow_steps(
    goal: str,
    entity_names: list[str],
) -> list[dict[str, str]]:
    """Parse '->'/indent flow notation into an ordered typed step list for the LLM.
    Each '->' separator becomes a separate node. Lines starting with 'Sim ->' or 'Nao ->'
    are tagged with the corresponding branch.
    """
    entity_norm_map: dict[str, str] = {_normalize_ai_text(e): e for e in (entity_names or [])}
    steps: list[dict[str, str]] = []

    for raw_line in (goal or "").split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if re.match(r"^(fluxo|entidade)", line, re.IGNORECASE):
            continue

        branch = ""
        m = re.match(r"^(Sim|Nao|N\u00e3o)\s*->\s*", line, re.IGNORECASE)
        if m:
            token = m.group(1).strip().lower()
            branch = "sim" if token == "sim" else "nao"
            line = line[m.end():]

        for part in [p.strip() for p in line.split("->") if p.strip()]:
            norm = _normalize_ai_text(part)
            if part.rstrip().endswith("?"):
                ntype = "condicional"
                canonical = part
            elif norm in entity_norm_map:
                ntype = "entidade"
                canonical = entity_norm_map[norm]
            else:
                ntype = "task"
                canonical = part

            step: dict[str, str] = {"label": canonical, "nodeType": ntype}
            if branch:
                step["branch"] = branch
            steps.append(step)

    return steps


def _build_ai_plan_via_groq(goal: str, current_user: dict[str, Any], context: dict[str, Any]) -> dict[str, Any] | None:
    if AI_PROVIDER != "groq" or not GROQ_API_KEY:
        return None

    process_name = str(context.get("processName") or "Processo sugerido pela IA").strip()
    goal_entities = _extract_goal_data_entities(goal)
    goal_entity_names = [
        str(item.get("nome") or "").strip()
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    ]
    goal_entity_type_by_name = {
        _normalize_ai_text(item.get("nome")): str(item.get("tipo") or "")
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    }
    suggested_entities = _dedupe_preserve_order([
        *_extract_suggested_entity_names(context),
        *[str(name or "").strip() for name in goal_entity_names],
    ])
    entity_name = str((suggested_entities[0] if suggested_entities else process_name) or "Entidade IA").strip()
    general_analysis = _build_general_process_analysis(goal, process_name, entity_name)
    existing_entities = _extract_existing_entities_context(context)
    fallback_bpmn_payload, fallback_entities = _build_local_bpmn_payload(
        goal,
        process_name,
        entity_name,
        general_analysis,
    )

    # Atividades e condicionais informadas pelo usuário via frontend
    raw_activities = context.get("suggestedActivities")
    suggested_activities: list[str] = [
        str(a).strip() for a in (raw_activities if isinstance(raw_activities, list) else [])
        if str(a).strip()
    ]
    raw_conditionals = context.get("suggestedConditionals")
    suggested_conditionals: list[str] = [
        str(c).strip() if str(c).strip().endswith("?") else str(c).strip() + "?"
        for c in (raw_conditionals if isinstance(raw_conditionals, list) else [])
        if str(c).strip()
    ]

    # Normaliza o goal inserindo newlines antes de Sim/Nao e cabeçalhos
    normalized_flow = _normalize_goal_for_bpmn_parse(goal)

    # flowOrder: lista de nomes na sequência definida pelo usuário via UI
    # Items podem ser strings (legado) ou objetos {name, type, desc}
    raw_flow_order = context.get("flowOrder")
    flow_order_raw = raw_flow_order if isinstance(raw_flow_order, list) else []

    def _fo_name(item: Any) -> str:
        if isinstance(item, dict):
            return str(item.get("name") or "").strip()
        return str(item or "").strip()

    def _fo_desc(item: Any) -> str:
        if isinstance(item, dict):
            return str(item.get("desc") or "").strip()
        return ""

    flow_order: list[str] = [_fo_name(i) for i in flow_order_raw if _fo_name(i)]
    flow_order_descs: dict[str, str] = {
        _fo_name(i): _fo_desc(i) for i in flow_order_raw if _fo_name(i) and _fo_desc(i)
    }

    # Fallback Python: usa flowOrder se disponível, depois synthetic de activities, depois normalized_flow
    synthetic_flow: str = ""
    if flow_order:
        synthetic_flow = " -> ".join(flow_order)
        python_nodes, python_connections = _build_bpmn_from_flow_steps(synthetic_flow, suggested_entities, process_name, 3)
        print(f"[GROQ] flow_order ({len(flow_order)} items): {synthetic_flow[:120]}")
    elif suggested_activities and "->" not in normalized_flow:
        # Intercala activities e conditionals em ordem sequencial
        acts = list(suggested_activities)
        conds = list(suggested_conditionals)
        items: list[str] = []
        if conds and acts:
            cond_interval = max(2, len(acts) // (len(conds) + 1))
            cond_idx = 0
            for i, act in enumerate(acts):
                items.append(act)
                if conds and cond_idx < len(conds) and (i + 1) % cond_interval == 0 and i < len(acts) - 1:
                    items.append(conds[cond_idx])
                    cond_idx += 1
            # Condicionais restantes: intercalar nas posições centrais, NUNCA no final
            remaining = conds[cond_idx:]
            if remaining:
                total = len(items)
                gap = max(2, total // (len(remaining) + 1))
                offset = 0
                for ri, rc in enumerate(remaining):
                    pos = min((ri + 1) * gap + offset, total + offset - 1)
                    items.insert(pos, rc)
                    offset += 1
        else:
            items = acts or conds
        synthetic_flow = " -> ".join(items)
        python_nodes, python_connections = _build_bpmn_from_flow_steps(synthetic_flow, suggested_entities, process_name, 3)
        print(f"[GROQ] synthetic_flow: {synthetic_flow[:120]}")
    else:
        python_nodes, python_connections = _build_bpmn_from_flow_steps(normalized_flow, suggested_entities, process_name, 3)
    print(f"[GROQ] python_nodes={len(python_nodes)} | flow_preview: {normalized_flow[:120]}")

    # Constrói flowOrder tipado: cada item tem {name, type} para Groq usar diretamente
    _cond_norm_set = {_normalize_ai_text(c) for c in suggested_conditionals if c}
    _entity_norm_set_pre = {_normalize_ai_text(e) for e in suggested_entities if e}

    def _classify_flow_item(name: str) -> str:
        norm = _normalize_ai_text(name)
        if norm in _cond_norm_set:
            return "condicional"
        if norm in _entity_norm_set_pre:
            return "entidade"
        if name.rstrip().endswith("?"):
            return "condicional"
        return "task"

    # Usa o type vindo do frontend diretamente (confiável), com _classify_flow_item como fallback
    def _fo_type(raw_item: Any) -> str:
        if isinstance(raw_item, dict):
            t = str(raw_item.get("type") or "").strip()
            if t in ("task", "condicional", "entidade"):
                return t
        return ""

    # Nomes proibidos: nunca devem aparecer como nodes autônomos
    _FORBIDDEN_NAMES = {"sim", "nao", "não", "yes", "no", "true", "false"}

    typed_flow_order = []
    for raw_item in flow_order_raw:
        name = _fo_name(raw_item)
        if not name:
            continue
        if name.lower().strip() in _FORBIDDEN_NAMES:
            continue
        fo_type = _fo_type(raw_item) or _classify_flow_item(name)
        desc = _fo_desc(raw_item)
        entry: dict[str, Any] = {"name": name, "type": fo_type}
        if desc:
            entry["desc"] = desc
        # Preserva tipoEntidade para itens do tipo entidade
        if fo_type == "entidade" and isinstance(raw_item, dict):
            raw_tipo = raw_item.get("tipoEntidade") or ""
            entry["tipoEntidade"] = _normalize_entity_type(raw_tipo, default="apoio")
        # Preserva branches (sim/nao) se a IA/plan forneceu
        if isinstance(raw_item, dict) and isinstance(raw_item.get("branches"), dict):
            entry["branches"] = {
                "sim": str(raw_item["branches"].get("sim") or "").strip(),
                "nao": str(raw_item["branches"].get("nao") or "").strip(),
            }
        typed_flow_order.append(entry)

    # ---------------------------------------------------------------
    # Garante que toda condicional tenha um nó NAO dedicado no flowOrder.
    # Se a IA não incluiu, cria automaticamente baseado no contexto.
    # O nó NAO é inserido logo após o nó SIM (próximo item após a condicional).
    # ---------------------------------------------------------------
    _existing_names = {it["name"].lower() for it in typed_flow_order}
    _insertions: list[tuple[int, dict]] = []  # (insert_after_index, new_item)
    for _ci, _cfo in enumerate(typed_flow_order):
        if _cfo.get("type") != "condicional":
            continue
        _br = _cfo.get("branches") or {}
        _nao_name = (_br.get("nao") or "").strip()
        # Verifica se o NAO target já existe no flowOrder
        if _nao_name and _nao_name.lower() in _existing_names:
            continue
        # Gera nome descritivo para o nó NAO
        _cond_label = _cfo["name"].rstrip("?").strip()
        _nao_label = _nao_name if _nao_name else ""
        # Se vazio ou genérico, cria com base no contexto da condicional
        if not _nao_label:
            # Tenta extrair contexto: "Pedido aprovado?" → "Rejeitar Pedido"
            _cond_words = [w for w in _cond_label.split() if w.lower() not in ("é", "está", "foi", "o", "a", "os", "as")]
            if len(_cond_words) >= 2:
                _nao_label = f"Rejeitar {_cond_words[0]}"
            elif _cond_words:
                _nao_label = f"Tratar {_cond_words[0]}"
            else:
                _nao_label = "Tratar rejeição"
        # Evita duplicatas
        if _nao_label.lower() in _existing_names:
            _nao_label = f"{_nao_label} (NAO)"
        # Insere logo após o SIM (que é o próximo item depois da condicional)
        _insert_pos = _ci + 2 if _ci + 1 < len(typed_flow_order) else _ci + 1
        _nao_item: dict[str, Any] = {"name": _nao_label, "type": "task", "desc": f"Caminho alternativo quando a condição '{_cfo['name']}' não é atendida."}
        _insertions.append((_insert_pos, _nao_item))
        # Atualiza branches da condicional
        _cfo.setdefault("branches", {})
        _cfo["branches"]["nao"] = _nao_label
        _existing_names.add(_nao_label.lower())

    # Aplica as inserções de trás para frente (para não invalidar índices)
    for _ins_pos, _ins_item in reversed(_insertions):
        typed_flow_order.insert(_ins_pos, _ins_item)

    # Few-shot example: ensina o Groq com um exemplo concreto de input → output
    _fs_input = json.dumps({
        "processName": "Pedido de Servico",
        "entityNames": ["Funcionario", "Pedido", "Entrega"],
        "activityNames": ["Registrar pedido", "Rejeitar pedido", "Executar pedido", "Confirmar entrega"],
        "conditionalNames": ["Pedido aprovado?"],
        "flowOrder": [
            {"name": "Funcionario", "type": "entidade"},
            {"name": "Registrar pedido", "type": "task"},
            {"name": "Pedido", "type": "entidade"},
            {"name": "Pedido aprovado?", "type": "condicional"},
            {"name": "Rejeitar pedido", "type": "task"},
            {"name": "Executar pedido", "type": "task"},
            {"name": "Entrega", "type": "entidade"},
            {"name": "Confirmar entrega", "type": "task"},
        ],
    }, ensure_ascii=False)
    _fs_output = json.dumps({
        "nodes": [
            {"id": "n1", "label": "Funcionario", "nodeType": "entidade", "campos": [
                {"nome": "id_funcionario", "tipo": "numero", "obrigatorio": True, "keyType": "PK", "relacionamento": None},
                {"nome": "nome", "tipo": "texto", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
                {"nome": "email", "tipo": "email", "obrigatorio": False, "keyType": "NORMAL", "relacionamento": None},
            ]},
            {"id": "n2", "label": "Registrar pedido", "nodeType": "task"},
            {"id": "n3", "label": "Pedido", "nodeType": "entidade", "campos": [
                {"nome": "id_pedido", "tipo": "numero", "obrigatorio": True, "keyType": "PK", "relacionamento": None},
                {"nome": "id_funcionario", "tipo": "numero", "obrigatorio": True, "keyType": "FK", "relacionamento": "Funcionario"},
                {"nome": "status", "tipo": "texto", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
            ]},
            {"id": "n4", "label": "Pedido aprovado?", "nodeType": "condicional"},
            {"id": "n5", "label": "Rejeitar pedido", "nodeType": "task"},
            {"id": "n6", "label": "Funcionario", "nodeType": "entidade", "campos": [
                {"nome": "id_funcionario", "tipo": "numero", "obrigatorio": True, "keyType": "PK", "relacionamento": None},
                {"nome": "nome", "tipo": "texto", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
            ]},
            {"id": "n7", "label": "Executar pedido", "nodeType": "task"},
            {"id": "n8", "label": "Entrega", "nodeType": "entidade", "campos": [
                {"nome": "id_entrega", "tipo": "numero", "obrigatorio": True, "keyType": "PK", "relacionamento": None},
                {"nome": "id_pedido", "tipo": "numero", "obrigatorio": True, "keyType": "FK", "relacionamento": "Pedido"},
                {"nome": "data_entrega", "tipo": "data", "obrigatorio": True, "keyType": "NORMAL", "relacionamento": None},
            ]},
            {"id": "n9", "label": "Confirmar entrega", "nodeType": "task"},
        ],
        "connections": [
            {"id": "c1", "from": "n1", "to": "n2", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c2", "from": "n2", "to": "n3", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c3", "from": "n3", "to": "n4", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c4", "from": "n4", "to": "n5", "fromHandle": "bottom", "toHandle": "left", "decision": "nao"},
            {"id": "c5", "from": "n5", "to": "n7", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c6", "from": "n4", "to": "n7", "fromHandle": "right", "toHandle": "left", "decision": "sim"},
            {"id": "c7", "from": "n7", "to": "n8", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c8", "from": "n8", "to": "n9", "fromHandle": "right", "toHandle": "left", "decision": ""},
        ],
    }, ensure_ascii=False)

    system_prompt = (
        "Voce e um gerador de BPMN. Gere os nodes e connections do diagrama BPMN. Retorne APENAS JSON valido, sem markdown.\n\n"

        "REGRAS FUNDAMENTAIS:\n"
        "- 'flowOrder' é uma lista de objetos {name, type, desc} que define EXATAMENTE a sequência e o tipo de cada node.\n"
        "- Crie UM node por item de flowOrder. Use item.name como label e item.type como nodeType. NAO invente nomes.\n"
        "- CADA node DEVE ter uma descricao contextual obrigatoria:\n"
        "  * tasks: campo 'taskDescricao' — descreva o que a atividade faz no processo.\n"
        "  * condicionais: campo 'condicionalDescricao' — descreva brevemente O QUE esta sendo avaliado (ex: 'Analise do valor e prazo do pedido'). NAO explique os caminhos SIM/NAO, o diagrama ja mostra isso.\n"
        "  * entidades: campo 'descricao' — descreva o que o dado representa no processo.\n"
        "- A descricao NUNCA deve repetir o nome do node. Descreva o proposito ou funcao do elemento.\n"
        "- Se item.desc existir no flowOrder, use-o. Se nao, INVENTE uma descricao curta e relevante baseada no contexto do processo.\n\n"

        "PASSO 1 - GERACAO DOS NODES:\n"
        "1. Para cada item em flowOrder, crie um node: label=item.name, nodeType=item.type.\n"
        "2. NUNCA altere os nomes. NUNCA crie nodes com label 'Sim' ou 'Nao'.\n"
        "   NUNCA coloque duas condicionais consecutivas — sempre deve haver pelo menos uma task entre condicionais.\n\n"

        "PASSO 2 - CONEXOES:\n"
        "3. Conecte os nodes em ordem baseada no flowOrder: fromHandle='right', toHandle='left', decision='', label=''.\n"
        "4. Quando nodeType='condicional', crie DUAS conexoes de saida:\n"
        "   - Caminho aprovado: decision='sim', label='\u2714', fromHandle='right', toHandle='left'\n"
        "   - Caminho reprovado: decision='nao', label='\u2718', fromHandle='bottom', toHandle='left'\n"
        "5. O proximo node na sequencia recebe o caminho SIM (\u2714). O node alternativo recebe o caminho NAO (\u2718).\n"
        "6. IMPORTANTE: O caminho NAO NUNCA deve ser um beco sem saida. Apos o(s) node(s) do caminho NAO, crie uma conexao de volta ao proximo node do caminho SIM (merge/convergencia). Assim ambos os caminhos continuam o processo.\n\n"

        "PASSO 3 - ENTIDADES:\n"
        "7. Nodes com nodeType='entidade' representam dados produzidos/consumidos por uma tarefa. Inclua NO MAXIMO 1 node de entidade no diagrama — apenas o objeto central do processo.\n"
        "8. Formato de campo: {nome, tipo (texto|numero|email|booleano|data), obrigatorio (bool), keyType (PK|FK|NORMAL), relacionamento (null|nomeEntidade)}\n\n"

        "FORMATO:\n"
        "9. IDs de nodes: 'n1','n2',...; de connections: 'c1','c2',...\n"
        "10. Retorne: {\"nodes\": [...], \"connections\": [...]}\n\n"

        f"EXEMPLO INPUT:\n{_fs_input}\n\n"
        f"EXEMPLO OUTPUT:\n{_fs_output}"
    )

    # Para o fallback (flowOrder vazio), monta typed_flow_order a partir das listas separadas
    if not typed_flow_order and (suggested_activities or suggested_conditionals):
        acts = list(suggested_activities)
        conds = list(suggested_conditionals)
        fallback_items: list[str] = []
        if conds and acts:
            # Distribui condicionais uniformemente entre atividades (nunca ficam no final)
            interval2 = max(2, len(acts) // (len(conds) + 1))
            ci2 = 0
            for i2, a2 in enumerate(acts):
                fallback_items.append(a2)
                if ci2 < len(conds) and (i2 + 1) % interval2 == 0 and i2 < len(acts) - 1:
                    fallback_items.append(conds[ci2])
                    ci2 += 1
            # Condicionais restantes: intercalar nas posições centrais, NUNCA no final
            remaining = conds[ci2:]
            if remaining:
                total = len(fallback_items)
                gap = max(2, total // (len(remaining) + 1))
                offset = 0
                for ri, rc in enumerate(remaining):
                    pos = min((ri + 1) * gap + offset, total + offset - 1)
                    fallback_items.insert(pos, rc)
                    offset += 1
        else:
            fallback_items = acts or conds
        typed_flow_order = [
            {"name": n, "type": _classify_flow_item(n), **( {"desc": flow_order_descs[n]} if n in flow_order_descs else {})}
            for n in fallback_items
        ]
    user_prompt = {
        "processName": process_name,
        # flowOrder tipado: [{name, type}] — Groq usa diretamente sem precisar classificar
        "flowOrder": typed_flow_order,
    }

    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": GROQ_MODEL,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
            ],
        },
        timeout=AI_LLM_TIMEOUT_SECONDS,
    )

    # 429 = rate limit: não propaga exceção, cai no python fallback abaixo
    print(f"[GROQ] HTTP {response.status_code} | ok={response.ok}")
    if not response.ok and response.status_code != 429:
        raise RuntimeError(f"Falha LLM Groq: HTTP {response.status_code}")

    # Valida a estrutura BPMN retornada pelo Groq (few-shot)
    groq_nodes: list[dict[str, Any]] = []
    groq_connections: list[dict[str, Any]] = []
    parsed: dict[str, Any] | None = None
    if response.ok:
        response_payload = response.json()
        payload = response_payload if isinstance(response_payload, dict) else {}
        choices = payload.get("choices") if isinstance(payload, dict) else []
        first = (choices[0] if isinstance(choices[0], dict) else {}) if isinstance(choices, list) and choices else {}
        message = first.get("message") if isinstance(first, dict) else {}
        content = message.get("content") if isinstance(message, dict) else ""
        print(f"[GROQ] content (first 300 chars): {str(content or '')[:300]}")
        parsed = _extract_json_object(str(content or ""))
        if parsed and isinstance(parsed, dict):
            raw_nodes = parsed.get("nodes") or []
            raw_conns = parsed.get("connections") or []
            print(f"[GROQ] raw_nodes={len(raw_nodes)}, raw_conns={len(raw_conns)}")
            if isinstance(raw_nodes, list) and len(raw_nodes) >= 2:
                node_ids = {str(n.get("id") or "") for n in raw_nodes if isinstance(n, dict)}
                valid_nodes = [
                    n for n in raw_nodes
                    if isinstance(n, dict) and n.get("id") and n.get("label") and n.get("nodeType")
                ]
                valid_conns = [
                    c for c in (raw_conns if isinstance(raw_conns, list) else [])
                    if isinstance(c, dict)
                    and str(c.get("from") or "") in node_ids
                    and str(c.get("to") or "") in node_ids
                ]
                print(f"[GROQ] valid_nodes={len(valid_nodes)}, valid_conns={len(valid_conns)}")
                if len(valid_nodes) >= 2:
                    groq_nodes = valid_nodes
                    groq_connections = valid_conns
        else:
            print(f"[GROQ] parsed=None ou nao dict. parsed type: {type(parsed)}")

    # Pós-processamento: forçar labels/types do typed_flow_order por posição — SEMPRE.
    # Groq ignora os nomes e gera "Atividade 2", "Condicional 5" etc.
    # Solução: construímos os nodes DIRETAMENTE do typed_flow_order, sem depender do Groq para nomes.
    flow_desc_by_norm = {_normalize_ai_text(item["name"]): item.get("desc", "") for item in typed_flow_order}

    def _build_direct_connections_from_fo(fo_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Constrói conexões a partir do typed_flow_order.

        Padrão BPMN: condicional → SIM segue o fluxo sequencial, NAO vai para um nó lateral.
        O nó lateral (NAO) é extraído do flowOrder e reconecta (merge) ao próximo nó do fluxo principal.

        Regra fundamental: o elemento LOGO APÓS a condicional no flowOrder é o caminho SIM,
        NUNCA o caminho NAO. O caminho NAO é buscado por branches.nao ou, em fallback,
        é o SEGUNDO não-condicional após a condicional.
        """
        result: list[dict[str, Any]] = []
        n = len(fo_list)
        conn_id = 0

        def next_conn_id():
            nonlocal conn_id
            conn_id += 1
            return f"c{conn_id}"

        # ---------------------------------------------------------------
        # 1. Identifica NAO targets para cada condicional
        # ---------------------------------------------------------------
        # Estratégia: para cada condicional, o NAO target é:
        #   a) branches.nao se especificado pela IA e válido
        #   b) Fallback: segundo nó não-condicional após a condicional
        #      (o primeiro é o SIM, que fica no fluxo principal)
        # ---------------------------------------------------------------
        cond_nao_map: dict[int, int] = {}  # cond_idx → nao_target_idx
        claimed_nao: set[int] = set()
        name_to_idx_global = {f["name"]: j for j, f in enumerate(fo_list)}

        for i, fo in enumerate(fo_list):
            if fo.get("type") != "condicional":
                continue

            br = fo.get("branches") or {}
            nao_name = (br.get("nao") or "").strip()

            # Tenta usar branches.nao da IA (match exato e normalizado)
            if nao_name:
                nao_name_norm = _normalize_ai_text(nao_name)
                target = name_to_idx_global.get(nao_name)
                # Fallback: match normalizado
                if target is None:
                    for _ni, _nfo in enumerate(fo_list):
                        if _normalize_ai_text(_nfo.get("name", "")) == nao_name_norm:
                            target = _ni
                            break
                if target is not None and fo_list[target].get("type") != "condicional" and target not in claimed_nao:
                    cond_nao_map[i] = target
                    claimed_nao.add(target)
                    print(f"  [NAO-MAP] cond[{i}] '{fo.get('name')}' → NAO[{target}] '{fo_list[target].get('name')}' (branches.nao)")
                    continue

            # Fallback por posição: o PRIMEIRO nó task logo após a condicional
            # é o caminho NAO (conforme instrução do prompt IA).
            # O prompt diz: "A atividade do caminho NÃO deve vir IMEDIATAMENTE
            # após o condicional no flowOrder"
            nao_candidate = None
            for j in range(i + 1, n):
                jtype = fo_list[j].get("type", "")
                if jtype == "condicional":
                    break  # Chegou na próxima condicional sem achar task
                if jtype == "task" and j not in claimed_nao:
                    nao_candidate = j
                    break  # Primeiro task = NAO

            if nao_candidate is not None:
                # Verifica se há pelo menos mais um nó após o NAO para ser o SIM
                has_more_after = False
                for j2 in range(nao_candidate + 1, n):
                    if j2 not in claimed_nao and fo_list[j2].get("type") != "condicional":
                        has_more_after = True
                        break
                if has_more_after:
                    cond_nao_map[i] = nao_candidate
                    claimed_nao.add(nao_candidate)
                    print(f"  [NAO-MAP] cond[{i}] '{fo.get('name')}' → NAO[{nao_candidate}] '{fo_list[nao_candidate].get('name')}' (position fallback)")
                else:
                    print(f"  [NAO-MAP] cond[{i}] '{fo.get('name')}' → no NAO (no SIM path after candidate)")
            else:
                print(f"  [NAO-MAP] cond[{i}] '{fo.get('name')}' → no NAO candidate found")

        all_nao_indices = set(cond_nao_map.values())

        # ---------------------------------------------------------------
        # 2. Main flow = todos os índices EXCETO os NAO targets
        # ---------------------------------------------------------------
        main_flow = [i for i in range(n) if i not in all_nao_indices]

        # ---------------------------------------------------------------
        # 3. Conexões sequenciais no main flow
        # ---------------------------------------------------------------
        for pos in range(len(main_flow) - 1):
            cur_idx = main_flow[pos]
            nxt_idx = main_flow[pos + 1]
            cur_type = fo_list[cur_idx].get("type", "task")

            if cur_type == "condicional":
                # SIM goes to next in main flow (skip NAO node)
                result.append({
                    "id": next_conn_id(), "from": f"n{cur_idx + 1}", "to": f"n{nxt_idx + 1}",
                    "fromHandle": "bottom", "toHandle": "top",
                    "decision": "sim", "label": "\u2714"
                })
                # NAO goes to dedicated target
                nao_idx = cond_nao_map.get(cur_idx)
                if nao_idx is not None:
                    result.append({
                        "id": next_conn_id(), "from": f"n{cur_idx + 1}", "to": f"n{nao_idx + 1}",
                        "fromHandle": "right", "toHandle": "left",
                        "decision": "nao", "label": "\u2718"
                    })

                    # Merge: preferir convergir no nó APÓS o passo de SIM
                    # quando existir, evitando forçar NAO -> SIM.
                    merge_idx = nxt_idx
                    if pos + 2 < len(main_flow):
                        merge_idx = main_flow[pos + 2]

                    result.append({
                        "id": next_conn_id(), "from": f"n{nao_idx + 1}", "to": f"n{merge_idx + 1}",
                        "fromHandle": "bottom", "toHandle": "right",
                        "decision": "merge", "label": ""
                    })
            else:
                result.append({
                    "id": next_conn_id(), "from": f"n{cur_idx + 1}", "to": f"n{nxt_idx + 1}",
                    "fromHandle": "bottom", "toHandle": "top",
                    "decision": "", "label": ""
                })

        # Handle last conditional in main flow (if it's the last node)
        if main_flow:
            last_idx = main_flow[-1]
            if fo_list[last_idx].get("type") == "condicional":
                last_name = fo_list[last_idx].get("name", "")
                last_branches = fo_list[last_idx].get("branches", {})
                print(f"  [LAST-COND] '{last_name}' branches={last_branches} nao_map={cond_nao_map.get(last_idx)} all_nao={all_nao_indices}")
                # SIM: conectar ao branch sim — somente se aponta PARA FRENTE (índice > last_idx)
                sim_connected = False
                sim_target = (last_branches.get("sim") or "").strip()
                if sim_target:
                    sim_target_norm = _normalize_ai_text(sim_target)
                    for _si in range(n):
                        _si_name = fo_list[_si].get("name", "").strip()
                        if _si_name.lower() == sim_target.lower() or _normalize_ai_text(_si_name) == sim_target_norm:
                            # Só conecta se o alvo está À FRENTE no flowOrder (evita setas para trás)
                            if _si > last_idx:
                                result.append({
                                    "id": next_conn_id(), "from": f"n{last_idx + 1}", "to": f"n{_si + 1}",
                                    "fromHandle": "bottom", "toHandle": "top",
                                    "decision": "sim", "label": "\u2714"
                                })
                                sim_connected = True
                                print(f"  [LAST-COND] SIM→'{_si_name}' (branches match, forward)")
                            else:
                                print(f"  [LAST-COND] SIM branches.sim='{_si_name}' is BACKWARDS (idx {_si} <= {last_idx}), skipping")
                            break

                # Fallback SIM: próximo nó sequencial no fo_list (não-NAO) após a condicional
                if not sim_connected:
                    for _fi in range(last_idx + 1, n):
                        if _fi not in all_nao_indices:
                            result.append({
                                "id": next_conn_id(), "from": f"n{last_idx + 1}", "to": f"n{_fi + 1}",
                                "fromHandle": "bottom", "toHandle": "top",
                                "decision": "sim", "label": "\u2714"
                            })
                            sim_connected = True
                            print(f"  [LAST-COND] SIM→'{fo_list[_fi].get('name','')}' (next non-NAO)")
                            break

                # Fallback SIM: se tem NAO target, SIM vai para o nó logo após o NAO (se for pra frente)
                if not sim_connected:
                    nao_idx_fb = cond_nao_map.get(last_idx)
                    if nao_idx_fb is not None and nao_idx_fb + 1 < n:
                        after_nao = nao_idx_fb + 1
                        if after_nao > last_idx:
                            result.append({
                                "id": next_conn_id(), "from": f"n{last_idx + 1}", "to": f"n{after_nao + 1}",
                                "fromHandle": "bottom", "toHandle": "top",
                                "decision": "sim", "label": "\u2714"
                            })
                            sim_connected = True
                            print(f"  [LAST-COND] SIM→'{fo_list[after_nao].get('name','')}' (after NAO)")

                if not sim_connected:
                    print(f"  [LAST-COND] No forward SIM target for '{last_name}' — last conditional has only NAO path")

                # NAO: conectar ao branch nao
                nao_idx = cond_nao_map.get(last_idx)
                if nao_idx is not None:
                    result.append({
                        "id": next_conn_id(), "from": f"n{last_idx + 1}", "to": f"n{nao_idx + 1}",
                        "fromHandle": "right", "toHandle": "left",
                        "decision": "nao", "label": "\u2718"
                    })

        return result

    def _build_node_from_fo(idx: int, fo: dict[str, Any]) -> dict[str, Any]:
        """Cria um node garantido com nome/tipo correto a partir de um item do typed_flow_order."""
        label = fo["name"]
        ntype = fo["type"]
        desc = str(fo.get("desc") or "").strip()
        node: dict[str, Any] = {"id": f"n{idx + 1}", "label": label, "nodeType": ntype}
        if ntype == "entidade":
            node["campos"] = _default_entity_campos(label)
            node["entidadeNome"] = label
            node.setdefault("descricao", desc if desc and desc.lower() != label.lower() else "")
            node.setdefault("info", "id")
        elif ntype == "task":
            node["taskNome"] = label
            node["taskDescricao"] = desc if desc and desc.lower() != label.lower() else ""
            node.setdefault("descricao", "")
            node.setdefault("info", "")
        elif ntype == "condicional":
            node["condicionalNome"] = label
            node["condicionalDescricao"] = desc if desc and desc.lower() != label.lower() else ""
            node.setdefault("descricao", "")
            node.setdefault("gatewayType", "exclusivo")
        return node

    # ── Validação estrutural do typed_flow_order antes de construir nós/conexões ──
    if typed_flow_order:
        # Coletar nomes NAO referenciados por condicionais
        _plan_nao_names: set[str] = set()
        for _vfo in typed_flow_order:
            if _vfo.get("type") == "condicional":
                _vn = (_vfo.get("branches", {}).get("nao") or "").strip().lower()
                if _vn:
                    _plan_nao_names.add(_vn)

        # 0) Garantir que condicional→condicional tenha atividade ponte entre elas
        _plan_fixed: list[dict] = []
        for _fi, _ffo in enumerate(typed_flow_order):
            _plan_fixed.append(_ffo)
            if _ffo.get("type") == "condicional":
                _next_main = None
                for _nj in range(_fi + 1, len(typed_flow_order)):
                    _nj_name = typed_flow_order[_nj].get("name", "").strip().lower()
                    if _nj_name in _plan_nao_names:
                        continue
                    if typed_flow_order[_nj].get("type") == "entidade":
                        continue
                    _next_main = typed_flow_order[_nj]
                    break
                if _next_main is not None and _next_main.get("type") == "condicional":
                    _bridge = f"Processar {_ffo.get('name', '').replace('?', '').strip()}"
                    _plan_fixed.append({"name": _bridge, "type": "task", "desc": f"Processamento após '{_ffo.get('name', '')}'."})
                    _ffo.setdefault("branches", {})
                    _ffo["branches"]["sim"] = _bridge
                    print(f"  [FO-FIX] Ponte '{_bridge}' entre '{_ffo.get('name','')}' e '{_next_main.get('name','')}'")
        typed_flow_order = _plan_fixed

        # Se último é NAO, mover para logo após sua condicional
        if typed_flow_order[-1].get("name", "").strip().lower() in _plan_nao_names:
            _nao_item = typed_flow_order.pop()
            _moved = False
            for _ri in range(len(typed_flow_order) - 1, -1, -1):
                if typed_flow_order[_ri].get("type") == "condicional":
                    _br_nao = (typed_flow_order[_ri].get("branches", {}).get("nao") or "").strip().lower()
                    if _br_nao == _nao_item.get("name", "").strip().lower():
                        typed_flow_order.insert(_ri + 1, _nao_item)
                        _moved = True
                        print(f"  [FO-FIX] Movido NAO '{_nao_item['name']}' para posição {_ri + 1}")
                        break
            if not _moved:
                typed_flow_order.insert(max(0, len(typed_flow_order) - 1), _nao_item)

        # Se último é condicional OU último é NAO de condicional (sem atividade principal depois),
        # adicionar atividade de conclusão
        _last_type = typed_flow_order[-1].get("type", "")
        _last_name_lc = typed_flow_order[-1].get("name", "").strip().lower()
        _needs_conclusion = False
        _target_cond = None

        if _last_type == "condicional":
            _needs_conclusion = True
            _target_cond = typed_flow_order[-1]
        elif _last_name_lc in _plan_nao_names:
            # Último é NAO — a condicional antes dele precisa de conclusão
            for _ri in range(len(typed_flow_order) - 2, -1, -1):
                if typed_flow_order[_ri].get("type") == "condicional":
                    _needs_conclusion = True
                    _target_cond = typed_flow_order[_ri]
                    break

        if _needs_conclusion and _target_cond is not None:
            _cond_label = _target_cond.get("name", "").rstrip("?").strip()
            _conc_name = f"Concluir {_cond_label}"
            typed_flow_order.append({"name": _conc_name, "type": "task", "desc": f"Conclusão do fluxo após '{_target_cond['name']}'."})
            _target_cond.setdefault("branches", {})
            _target_cond["branches"]["sim"] = _conc_name
            print(f"  [FO-FIX] Adicionado '{_conc_name}' após última condicional")

    if typed_flow_order:
        # Nodes sempre corretos — construídos diretamente do flowOrder do frontend
        definitive_nodes = [_build_node_from_fo(i, fo) for i, fo in enumerate(typed_flow_order)]
        definitive_node_ids = {f"n{i + 1}" for i in range(len(typed_flow_order))}

        # Enriquecer: mescla descrições geradas pelo Groq nos nós definitivos (sem duplicar nomes).
        if groq_nodes:
            _groq_by_norm: dict[str, dict[str, Any]] = {}
            for _gn in groq_nodes:
                _gl = _normalize_ai_text(str(_gn.get("label") or ""))
                if _gl:
                    _groq_by_norm[_gl] = _gn
            for _dn in definitive_nodes:
                _dl = _normalize_ai_text(str(_dn.get("label") or ""))
                _label = str(_dn.get("label") or "")
                _gn_match = _groq_by_norm.get(_dl)
                if not _gn_match:
                    continue
                _nt = _dn.get("nodeType")
                if _nt == "entidade":
                    _cur = str(_dn.get("descricao") or "").strip()
                    if not _cur or _cur.startswith("DESCREVA:"):
                        _groq_val = str(_gn_match.get("descricao") or _gn_match.get("subtitle") or "").strip()
                        if _groq_val and not _groq_val.startswith("DESCREVA:") and _groq_val.lower() != _label.lower():
                            _dn["descricao"] = _groq_val
                        else:
                            _dn["descricao"] = ""
                elif _nt == "task":
                    _cur = str(_dn.get("taskDescricao") or "").strip()
                    if not _cur or _cur.startswith("DESCREVA:"):
                        _groq_val = str(_gn_match.get("taskDescricao") or "").strip()
                        if _groq_val and not _groq_val.startswith("DESCREVA:") and _groq_val.lower() != _label.lower():
                            _dn["taskDescricao"] = _groq_val
                        else:
                            _dn["taskDescricao"] = ""
                elif _nt == "condicional":
                    _cur = str(_dn.get("condicionalDescricao") or "").strip()
                    if not _cur or _cur.startswith("DESCREVA:"):
                        _groq_val = str(_gn_match.get("condicionalDescricao") or "").strip()
                        if _groq_val and not _groq_val.startswith("DESCREVA:") and _groq_val.lower() != _label.lower():
                            _dn["condicionalDescricao"] = _groq_val
                        else:
                            _dn["condicionalDescricao"] = ""

        # Fallback: garantir que TODO node tenha uma descrição, mesmo que IA tenha omitido.
        for _dn in definitive_nodes:
            _nt = _dn.get("nodeType")
            _label = str(_dn.get("label") or "")
            if _nt == "entidade":
                if not str(_dn.get("descricao") or "").strip():
                    _dn["descricao"] = _default_entity_description(_label, _dn.get("tipoEntidade", ""), process_name)
            elif _nt == "task":
                if not str(_dn.get("taskDescricao") or "").strip():
                    _dn["taskDescricao"] = _activity_description_from_text(_label, 0)
            elif _nt == "condicional":
                if not str(_dn.get("condicionalDescricao") or "").strip():
                    _dn["condicionalDescricao"] = _conditional_description_from_name(_label)

        # Conexões construídas DIRETAMENTE do typed_flow_order — branching garantido correto.
        # Groq e Python fallback ignorados: IDs e ordering deles não são confiáveis.
        # DEBUG: show typed_flow_order for connection building
        for _di, _dfo in enumerate(typed_flow_order):
            _dbr = _dfo.get("branches", {})
            _dbr_str = f"  branches: sim={_dbr.get('sim','-')} nao={_dbr.get('nao','-')}" if _dbr else ""
            print(f"  [FO {_di}] {_dfo['name']:35s} ({_dfo['type']}){_dbr_str}")
        base_conns = _build_direct_connections_from_fo(typed_flow_order)

        # Layout serpentina (snake): colunas pares descem ↓, colunas ímpares sobem ↑.
        # Isso garante que conexões entre colunas tenham sempre a mesma Y nos dois lados,
        # produzindo linhas horizontais limpas que não cruzam nenhum retângulo.
        _MAX_PER_COL = 7
        _CARD_W      = 220.0
        _CARD_H      = 110.0
        _GAP_X       = 120.0   # canal livre à direita do ramo NAO, antes da próxima coluna
        _GAP_NAO     = 80.0    # espaço entre card principal e card do ramo NAO
        _GAP_Y       = 80.0    # espaço vertical entre nós da mesma coluna
        _X_START     = 60.0
        _Y_START     = 80.0
        _X_STEP      = _CARD_W + _GAP_NAO + _CARD_W + _GAP_X   # 640 px por coluna
        _Y_STEP      = _CARD_H + _GAP_Y                          # 190 px por linha

        # Mapa id → id do pai para ramos NAO
        _nao_parent: dict[str, str] = {
            str(c.get("to") or ""): str(c.get("from") or "")
            for c in base_conns if c.get("decision") == "nao"
        }

        # Separa nós em fluxo principal vs. ramos NAO
        _nao_ids    = set(_nao_parent.keys())
        _main_nodes = [n for n in definitive_nodes if str(n.get("id") or "") not in _nao_ids]
        _nao_nodes  = [n for n in definitive_nodes if str(n.get("id") or "") in _nao_ids]

        _pos: dict[str, tuple[float, float]] = {}

        # Fluxo principal: snake por colunas (par → desce, ímpar → sobe)
        for _seq, _node in enumerate(_main_nodes):
            _nid        = str(_node.get("id") or "")
            _col        = _seq // _MAX_PER_COL
            _row_in_col = _seq % _MAX_PER_COL
            # Colunas pares: linha 0 no topo; ímpares: linha 0 na base (invertido)
            _row = _row_in_col if _col % 2 == 0 else (_MAX_PER_COL - 1 - _row_in_col)
            _pos[_nid] = (_X_START + _col * _X_STEP, _Y_START + _row * _Y_STEP)

        # Ramos NAO: mesmo Y que o condicional pai, X à direita dele
        for _node in _nao_nodes:
            _nid = str(_node.get("id") or "")
            _pid = _nao_parent[_nid]
            _px, _py = _pos.get(_pid, (_X_START, _Y_START))
            _pos[_nid] = (_px + _CARD_W + _GAP_NAO, _py)

        # Aplica posições aos nós
        for _node in definitive_nodes:
            _nid = str(_node.get("id") or "")
            _node["x"], _node["y"] = _pos.get(_nid, (_X_START, _Y_START))

        # --- Resolução de sobreposições pós-snake ---
        # Segurança: empurra qualquer nó que se sobreponha a outro para baixo.
        _PAD_X = 20.0
        _PAD_Y = 20.0
        def _rects_overlap(ax: float, ay: float, bx: float, by: float) -> bool:
            return (abs(ax - bx) < _CARD_W + _PAD_X) and (abs(ay - by) < _CARD_H + _PAD_Y)

        for _round in range(10):
            _moved = False
            _sorted_nodes = sorted(definitive_nodes, key=lambda n: (round(float(n.get("x", 0)) / 50), float(n.get("y", 0))))
            for _i in range(len(_sorted_nodes)):
                for _j in range(_i + 1, len(_sorted_nodes)):
                    _na, _nb = _sorted_nodes[_i], _sorted_nodes[_j]
                    _ax, _ay = float(_na.get("x", 0)), float(_na.get("y", 0))
                    _bx, _by = float(_nb.get("x", 0)), float(_nb.get("y", 0))
                    if _rects_overlap(_ax, _ay, _bx, _by):
                        # Empurra _nb para baixo
                        _new_by = _ay + _CARD_H + _PAD_Y
                        _nb["y"] = _new_by
                        _moved = True
            if not _moved:
                break
        # Atualiza _pos após resolução de sobreposições
        for _node in definitive_nodes:
            _nid = str(_node.get("id") or "")
            _pos[_nid] = (float(_node.get("x", 0)), float(_node.get("y", 0)))

        # Pós-processamento de handles: ajusta entrada/saída de cada conexão
        # baseado na posição real dos nós para eliminar cruzamentos.
        #   – Mesma coluna descendo  → bottom → top
        #   – Mesma coluna subindo   → top    → bottom
        #   – Cruzamento de coluna   → right  → left  (linha horizontal, mesma Y)
        #   – Ramo NAO               → mantém right → left (já definido)
        _id_to_pos: dict[str, tuple[float, float]] = {
            str(n.get("id") or ""): (float(n.get("x", 0)), float(n.get("y", 0)))
            for n in definitive_nodes
        }
        for _conn in base_conns:
            _dec = _conn.get("decision")
            if _dec == "nao":
                # Ramo NAO: sempre right→left (já definido); não alterar.
                continue
            _fid = str(_conn.get("from") or "")
            _tid = str(_conn.get("to") or "")
            _fx, _fy = _id_to_pos.get(_fid, (0.0, 0.0))
            _tx, _ty = _id_to_pos.get(_tid, (0.0, 0.0))

            if _dec == "merge":
                # Merge: NAO node reconecta ao fluxo principal.
                # toHandle = "right" para entrar pelo lado direito do alvo,
                # evitando sobrepor a seta SIM (que entra por top/bottom).
                # fromHandle depende se o alvo está abaixo ou acima.
                _conn["toHandle"] = "right"
                if _ty >= _fy:
                    _conn["fromHandle"] = "bottom"
                else:
                    _conn["fromHandle"] = "top"
                continue

            _cross_col = abs(_fx - _tx) > _CARD_W / 2
            if _cross_col:
                if _dec == "sim":
                    # SIM cruzando colunas: bottom→top
                    # O frontend obstacle-aware router desvia automaticamente dos retângulos
                    _conn["fromHandle"] = "bottom"
                    _conn["toHandle"]   = "top"
                else:
                    # Sequencial cruzando colunas → horizontal right→left (mesma Y na junção snake)
                    _conn["fromHandle"] = "right"
                    _conn["toHandle"]   = "left"
            elif _ty < _fy:
                # Mesma coluna, alvo acima (coluna ímpar — sobe): sai pelo topo, entra pela base
                _conn["fromHandle"] = "top"
                _conn["toHandle"]   = "bottom"
            else:
                # Mesma coluna, alvo abaixo (coluna par — desce): sai pela base, entra pelo topo
                _conn["fromHandle"] = "bottom"
                _conn["toHandle"]   = "top"

        # Garantia: toda condição precisa ter pelo menos um ramo SIM e um NAO.
        # Se o flowOrder estiver incompleto ou o nome do alvo não existir, adiciona fallback posicional.
        _cond_has_sim: set[str] = set()
        _cond_has_nao: set[str] = set()
        for _c in base_conns:
            if _c.get("decision") == "sim":
                _cond_has_sim.add(str(_c.get("from") or ""))
            elif _c.get("decision") == "nao":
                _cond_has_nao.add(str(_c.get("from") or ""))
        _fo_nao_set: set[int] = set()  # índices que são alvo de NAO (para fallback)
        # Reconstrói conjunto de índices NAO a partir das conexões geradas
        _nao_target_idx_set: set[int] = set()
        for _c in base_conns:
            if _c.get("decision") == "nao":
                _tid_str = str(_c.get("to") or "")
                if _tid_str.startswith("n"):
                    try:
                        _nao_target_idx_set.add(int(_tid_str[1:]) - 1)
                    except ValueError:
                        pass
        for _ci2, _fo2 in enumerate(typed_flow_order):
            if _fo2.get("type") != "condicional":
                continue
            _cid2 = f"n{_ci2 + 1}"
            _n2   = len(typed_flow_order)
            if _cid2 not in _cond_has_nao:
                # NAO fallback: pula condicionais
                _nao_fb = _ci2 + 1
                while _nao_fb < _n2 and typed_flow_order[_nao_fb].get("type") == "condicional":
                    _nao_fb += 1
                if _nao_fb < _n2:
                    base_conns.append({"id": f"c{_ci2 + 1}a_fb",
                                       "from": _cid2, "to": f"n{_nao_fb + 1}",
                                       "fromHandle": "right", "toHandle": "left",
                                       "decision": "nao", "label": "\u2718"})
                    _nao_target_idx_set.add(_nao_fb)
            if _cid2 not in _cond_has_sim:
                # Encontra o próximo nó que não seja destino de NAO
                _sim_fb = _ci2 + 1
                while _sim_fb < _n2 and _sim_fb in _nao_target_idx_set:
                    _sim_fb += 1
                if _sim_fb < _n2:
                    base_conns.append({"id": f"c{_ci2 + 1}b_fb",
                                       "from": _cid2, "to": f"n{_sim_fb + 1}",
                                       "fromHandle": "bottom", "toHandle": "top",
                                       "decision": "sim", "label": "\u2714"})

        base_nodes = definitive_nodes
        print(f"[GROQ] Nodes definitivos: {len(base_nodes)} | Conexões: {len(base_conns)}")
    else:
        # Sem flowOrder: usa Groq completo ou fallback Python
        if groq_nodes:
            base_nodes = groq_nodes
            base_conns = groq_connections
            print(f"[GROQ] Usando Groq: {len(base_nodes)} nodes, {len(base_conns)} conns")
        else:
            base_nodes = python_nodes if len(python_nodes) >= 2 else (fallback_bpmn_payload.get("nodes") or [])
            base_conns = python_connections if len(python_nodes) >= 2 else (fallback_bpmn_payload.get("connections") or [])
            print(f"[GROQ] Usando fallback Python: {len(base_nodes)} nodes, {len(base_conns)} conns")
    final_nodes = _auto_layout_bpmn_nodes(base_nodes, base_conns)

    # --- Validação de grafo ---

    # 1. Remove nós duplicados (mesmo label+nodeType → mantém o primeiro)
    _seen_node_keys: set[str] = set()
    _deduped_nodes: list[dict[str, Any]] = []
    _removed_node_ids: set[str] = set()
    for _n in final_nodes:
        _nkey = f"{str(_n.get('label') or '').strip().lower()}|{str(_n.get('nodeType') or '').strip().lower()}"
        if _nkey in _seen_node_keys:
            _removed_node_ids.add(str(_n.get("id") or ""))
            continue
        _seen_node_keys.add(_nkey)
        _deduped_nodes.append(_n)
    final_nodes = _deduped_nodes

    # 2. Remove conexões inválidas
    # 2. Remove conexões inválidas
    _seen_conns: set[str] = set()
    _valid_node_ids = {str(n.get("id") or "") for n in final_nodes}
    _cleaned_conns: list[dict[str, Any]] = []
    for _c in base_conns:
        _cfrom = str(_c.get("from") or "")
        _cto = str(_c.get("to") or "")
        # Remove conexões para nós inexistentes ou removidos por dedup
        if _cfrom not in _valid_node_ids or _cto not in _valid_node_ids:
            continue
        if _cfrom in _removed_node_ids or _cto in _removed_node_ids:
            continue
        # Remove auto-loops
        if _cfrom == _cto:
            continue
        # Remove duplicatas (mesma from→to com mesmo decision)
        _ckey = f"{_cfrom}|{_cto}|{_c.get('decision', '')}"
        if _ckey in _seen_conns:
            continue
        _seen_conns.add(_ckey)
        _cleaned_conns.append(_c)
    base_conns = _cleaned_conns

    # 3. Reparo de nós desconectados: garante que todo nó tenha pelo menos
    #    uma conexão de entrada E uma de saída (exceto o primeiro e o último).
    #    Isso previne nós "soltos" causados por falhas do LLM na geração de conexões.
    _node_order = [str(n.get("id") or "") for n in final_nodes]
    _outgoing:  dict[str, list[str]] = {nid: [] for nid in _node_order}
    _incoming:  dict[str, list[str]] = {nid: [] for nid in _node_order}
    for _c in base_conns:
        _cf = str(_c.get("from") or "")
        _ct = str(_c.get("to")   or "")
        if _cf in _outgoing:
            _outgoing[_cf].append(_ct)
        if _ct in _incoming:
            _incoming[_ct].append(_cf)
    _repair_id = len(base_conns)
    for _ri, _nid in enumerate(_node_order):
        # Nó sem saída (exceto o último) → conectar ao próximo nó do fluxo
        if _ri < len(_node_order) - 1 and not _outgoing[_nid]:
            # Procura o próximo nó que AINDA não está conectado de volta
            _next_nid = _node_order[_ri + 1]
            _repair_id += 1
            _rep_conn = {
                "id": f"c_repair_{_repair_id}",
                "from": _nid, "to": _next_nid,
                "fromHandle": "bottom", "toHandle": "top",
                "decision": "", "label": "",
            }
            base_conns.append(_rep_conn)
            _outgoing[_nid].append(_next_nid)
            _incoming[_next_nid].append(_nid)
            print(f"  [REPAIR] Adicionada conexão faltante: {_nid} → {_next_nid}")
        # Nó sem entrada (exceto o primeiro) → conectar do nó anterior no fluxo
        if _ri > 0 and not _incoming[_nid]:
            _prev_nid = _node_order[_ri - 1]
            # Só adiciona se já não existe saída do anterior para este
            already = any(
                str(c.get("from") or "") == _prev_nid and str(c.get("to") or "") == _nid
                for c in base_conns
            )
            if not already:
                _repair_id += 1
                _rep_conn = {
                    "id": f"c_repair_{_repair_id}",
                    "from": _prev_nid, "to": _nid,
                    "fromHandle": "bottom", "toHandle": "top",
                    "decision": "", "label": "",
                }
                base_conns.append(_rep_conn)
                _outgoing[_prev_nid].append(_nid)
                _incoming[_nid].append(_prev_nid)
                print(f"  [REPAIR] Adicionada conexão faltante (sem entrada): {_prev_nid} → {_nid}")

    final_bpmn_payload = {
        "name": process_name,
        "nodes": final_nodes,
        "connections": base_conns,
    }

    # Monta mapa nome → tipoEntidade a partir do typed_flow_order
    fo_entity_tipo: dict[str, str] = {}
    for _fo_item in typed_flow_order:
        if _fo_item.get("type") == "entidade":
            _fo_n = str(_fo_item.get("name") or "").strip()
            _fo_t = str(_fo_item.get("tipoEntidade") or "").strip()
            if _fo_n and _fo_t:
                fo_entity_tipo[_fo_n.lower()] = _normalize_entity_type(_fo_t, default="apoio")

    # Candidatos a criar: suggested_entities filtrados pelas já existentes
    candidate_entities_groq = _dedupe_preserve_order([
        str(n or "").strip()
        for n in suggested_entities
        if str(n or "").strip()
    ])
    entity_actions_groq: list[dict[str, Any]] = []
    for _ei, _cname in enumerate(candidate_entities_groq, start=1):
        _tipo_raw = fo_entity_tipo.get(_cname.lower()) or goal_entity_type_by_name.get(_normalize_ai_text(_cname), "")
        _desc_fo = next((str(i.get("desc") or "").strip() for i in typed_flow_order if i.get("name") == _cname and i.get("desc")), "")
        _tipo = _normalize_entity_type(_tipo_raw, default="apoio") if _tipo_raw else "apoio"
        entity_actions_groq.append({
            "id": f"a{len(entity_actions_groq) + 1}",
            "type": "create_entidade",
            "label": f"Criar entidade {_cname}",
            "risk": "medium",
            "requiresApproval": True,
            "payload": {
                "nome": _cname,
                "descricao": _desc_fo,
                "categoria": process_name,
                "tipoEntidade": _tipo,
                "campos": _sanitize_entity_fields(
                    [],
                    _cname,
                    _build_default_entity_fields_with_references(
                        _cname,
                        _ei,
                        candidate_entities_groq,
                    ),
                ),
            },
        })

    _base = len(entity_actions_groq)

    # Monta sanitized_actions com create_entidade + create_oportunidade + update_bpmn_state
    sanitized_actions: list[dict[str, Any]] = [
        *entity_actions_groq,
        {
            "id": f"a{_base + 1}",
            "type": "create_oportunidade",
            "label": "Criar oportunidade inicial para o fluxo",
            "risk": "medium",
            "requiresApproval": True,
            "payload": _build_default_opportunity_payload(goal, process_name, current_user),
        },
        {
            "id": f"a{_base + 2}",
            "type": "update_bpmn_state",
            "label": "Atualizar rascunho do editor BPMN",
            "risk": "low",
            "requiresApproval": True,
            "payload": final_bpmn_payload,
        },
    ]

    if not sanitized_actions:
        return None

    matched_existing_entity = _find_matching_existing_entity(
        [entity_name, process_name, goal],
        existing_entities,
    )

    context_panel = _sanitize_context_panel_suggestion(parsed.get("contextPanelSuggestion") if parsed else None)
    if not context_panel:
        context_panel = _build_context_panel_suggestion_from_actions(
            sanitized_actions,
            process_name,
            entity_name,
            goal,
            matched_existing_entity,
        )

    return {
        "goal": goal,
        "mode": "supervised",
        "requiresHumanApproval": True,
        "generatedAt": now_iso(),
        "provider": "groq",
        "model": GROQ_MODEL,
        "generalAnalysis": general_analysis,
        "actions": sanitized_actions,
        "contextPanelSuggestion": context_panel,
    }


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        normalized = " ".join(str(item or "").strip().split())
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def _extract_suggested_entity_names(context: dict[str, Any] | None) -> list[str]:
    payload = context if isinstance(context, dict) else {}
    names: list[str] = []

    raw_list = payload.get("suggestedEntityNames")
    if isinstance(raw_list, list):
        for item in raw_list:
            normalized = " ".join(str(item or "").strip().split())
            if normalized:
                names.append(normalized)

    fallback_raw = payload.get("entityName")
    if isinstance(fallback_raw, str):
        for item in re.split(r"[;,\n\r]+", fallback_raw):
            normalized = " ".join(str(item or "").strip().split())
            if normalized:
                names.append(normalized)

    return _dedupe_preserve_order(names)


def _extract_goal_participants(goal: str) -> list[str]:
    text = str(goal or "")
    if not text:
        return []

    block_match = re.search(
        r"participantes?.*?:\s*(.+?)(?:fluxo do processo|$)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    block = block_match.group(1) if block_match else ""

    participants: list[str] = []
    if block:
        numbered = re.findall(r"\d+\.\s*([^\d\n\r]+?)(?=(?:\d+\.|$))", block)
        if numbered:
            participants.extend([str(item).strip(" -;,.\n\r\t") for item in numbered])
        else:
            fragments = re.split(r"[,;\n\r]+", block)
            participants.extend([fragment.strip(" -;,.\t") for fragment in fragments])

    if not participants:
        inline_hits = re.findall(
            r"\b(solicitante|gestor|financeiro|sistema(?:\s+de\s+compras)?|fornecedor|cliente|analista|aprovador)\b",
            text,
            flags=re.IGNORECASE,
        )
        participants.extend(inline_hits)

    activity_pairs = _extract_participant_activity_pairs(text)
    participants.extend([item.get("participante") or "" for item in activity_pairs])

    return _dedupe_preserve_order(participants)[:10]


def _split_flow_into_atomic_candidates(flow_text: str) -> list[str]:
    normalized_flow = re.sub(r"\s+", " ", str(flow_text or "")).strip()
    if not normalized_flow:
        return []

    numbered_matches = list(
        re.finditer(r"(?:^|\s)(\d{1,2})\.\s*(.+?)(?=(?:\s\d{1,2}\.\s)|$)", normalized_flow)
    )
    chunks: list[str] = []
    if numbered_matches:
        for match in numbered_matches:
            chunk = _normalize_stage_label_text(match.group(2) or "")
            if chunk:
                chunks.append(chunk)
    else:
        sentence_candidates = re.split(r"(?<=[\.!?])\s+", normalized_flow)
        for sentence in sentence_candidates:
            chunk = _normalize_stage_label_text(sentence)
            if len(chunk) >= 6:
                chunks.append(chunk)

    atomic: list[str] = []
    for chunk in chunks:
        for fragment in re.split(r"\s*(?:;|\|)\s*", chunk):
            piece = _normalize_stage_label_text(fragment)
            if len(piece) >= 4:
                atomic.append(piece)

    return _dedupe_preserve_order(atomic)


def _extract_explicit_branches_from_text(step_text: str) -> tuple[str, str, str] | None:
    text = " ".join(str(step_text or "").strip().split())
    if not text:
        return None

    patterns = [
        re.compile(
            r"(?:^|\b)(?:se|caso|quando)\s+(.+?)\s*,?\s*(?:entao|então)?\s*(.+?)\s*(?:sen[aã]o|caso contr[aá]rio|do contr[aá]rio)\s*(.+)$",
            flags=re.IGNORECASE,
        ),
        re.compile(
            r"(.+?)\s*\?\s*(?:sim|aprovad[oa]?|deferid[oa]?)\s*[:\-]\s*(.+?)\s*(?:n[aã]o|reprovad[oa]?|indeferid[oa]?)\s*[:\-]\s*(.+)$",
            flags=re.IGNORECASE,
        ),
    ]

    for pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue

        cond = _normalize_stage_label_text(match.group(1) or "")
        yes_step = _normalize_stage_label_text(match.group(2) or "")
        no_step = _normalize_stage_label_text(match.group(3) or "")
        if cond and yes_step and no_step:
            if "?" not in cond:
                cond = f"{cond}?"
            return cond, yes_step, no_step

    return None


def _normalize_decision_prefix(step: str) -> str:
    cleaned = _normalize_stage_label_text(step)
    if not cleaned:
        return ""

    if re.match(r"^(sim|aprovad[oa]?|deferid[oa]?)\s*[:\-]", cleaned, flags=re.IGNORECASE):
        return re.sub(r"^(sim|aprovad[oa]?|deferid[oa]?)\s*[:\-]\s*", "Sim: ", cleaned, flags=re.IGNORECASE)

    if re.match(r"^(n[aã]o|reprovad[oa]?|indeferid[oa]?)\s*[:\-]", cleaned, flags=re.IGNORECASE):
        return re.sub(r"^(n[aã]o|reprovad[oa]?|indeferid[oa]?)\s*[:\-]\s*", "Nao: ", cleaned, flags=re.IGNORECASE)

    return cleaned


def _extract_goal_steps(goal: str) -> list[str]:
    text = str(goal or "")
    if not text:
        return []

    activity_pairs = _extract_participant_activity_pairs(text)
    activity_steps = [
        f"{str(item.get('participante') or '').strip()}: {str(item.get('descricao') or '').strip()}"
        for item in activity_pairs
        if str(item.get("participante") or "").strip()
        and str(item.get("descricao") or "").strip()
    ]

    flow_match = re.search(
        r"fluxo do processo\s*:\s*(.+?)(?:\n\s*entidades?\s+de\s+dados\s*:|\n\s*dados\s+do\s+processo\s*:|$)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not flow_match and activity_steps:
        return _dedupe_preserve_order(activity_steps)[:28]

    flow_text = flow_match.group(1) if flow_match else text
    flow_text = re.split(
        r"\n\s*(?:entidades?\s+de\s+dados|dados\s+do\s+processo|entidades?)\s*:\s*",
        flow_text,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    atomic_candidates = _split_flow_into_atomic_candidates(flow_text)

    exploded_steps: list[str] = []
    for step in atomic_candidates:
        decision_triplet = _extract_explicit_branches_from_text(step)
        if decision_triplet:
            condition_text, yes_text, no_text = decision_triplet
            exploded_steps.append(condition_text)
            exploded_steps.append(f"Sim: {yes_text}")
            exploded_steps.append(f"Nao: {no_text}")
            continue

        decision_match = re.search(r'decis[aã]o\s*:\s*([^\"]+\?|\"[^\"]+\")', step, flags=re.IGNORECASE)
        if decision_match:
            prefix = re.sub(r"decis[aã]o\s*:\s*.*$", "", step, flags=re.IGNORECASE).strip(" -;,.\t")
            decision_text = str(decision_match.group(1) or "").strip().strip('"')
            if prefix:
                exploded_steps.append(prefix)
            if decision_text:
                if "?" not in decision_text:
                    decision_text = f"{decision_text}?"
                exploded_steps.append(decision_text)
            continue

        exploded_steps.append(_normalize_decision_prefix(step))

    return _dedupe_preserve_order([item for item in exploded_steps if item])[:28]


def _build_general_process_analysis(goal: str, process_name: str, entity_name: str) -> dict[str, Any]:
    participants = _extract_goal_participants(goal)
    steps = _extract_goal_steps(goal)
    goal_entities = _extract_goal_data_entities(goal)

    entity_names = _dedupe_preserve_order(
        [
            *[
                str(item.get("nome") or "").strip()
                for item in goal_entities
                if isinstance(item, dict) and str(item.get("nome") or "").strip()
            ],
            str(entity_name or "").strip(),
        ]
    )

    decision_steps = [step for step in steps if _looks_like_decision_stage(step)]
    activity_steps = [step for step in steps if _looks_like_activity_stage(step)]
    data_steps = [step for step in steps if _looks_like_data_stage(step)]

    explicit_yes_no = sum(
        1
        for step in steps
        if re.match(
            r"^(sim|aprovad[oa]?|deferid[oa]?|n[aã]o|nao|reprovad[oa]?|indeferid[oa]?)\s*[:\-]",
            str(step),
            flags=re.IGNORECASE,
        )
    )

    model_type = "linear"
    if decision_steps:
        model_type = "com_decisoes"
    if len(decision_steps) >= 2:
        model_type = "multiplas_decisoes"

    analysis_notes: list[str] = []
    if not participants:
        analysis_notes.append("Nao foram identificados participantes explicitos; a IA vai inferir raias pelo contexto.")
    if not entity_names:
        analysis_notes.append("Nao foram identificadas entidades explicitas; a IA vai sugerir entidades base do processo.")
    if decision_steps and explicit_yes_no < 1:
        analysis_notes.append("Foram detectadas decisoes sem ramos explicitos Sim/Nao; a IA vai completar bifurcacoes validas.")
    if len(activity_steps) < 2:
        analysis_notes.append("Poucas atividades detectadas; a IA vai expandir etapas para manter fluxo executavel.")

    return {
        "processName": str(process_name or "").strip() or "Processo sugerido pela IA",
        "participants": participants,
        "steps": steps,
        "entityNames": entity_names,
        "modelType": model_type,
        "decisionCount": len(decision_steps),
        "activityCount": len(activity_steps),
        "dataStageCount": len(data_steps),
        "hasExplicitYesNoBranches": explicit_yes_no >= 1,
        "notes": analysis_notes,
    }


def _resolve_stage_participant(stage_name: str, participants: list[str], fallback_index: int) -> str:
    stage_lower = str(stage_name or "").lower()
    for participant in participants:
        if str(participant).lower() in stage_lower:
            return participant
    if not participants:
        return ""
    return participants[fallback_index % len(participants)]


def _build_local_bpmn_payload(
    goal: str,
    process_name: str,
    entity_name: str,
    general_analysis: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    analysis = general_analysis if isinstance(general_analysis, dict) else {}

    analysis_participants_raw = analysis.get("participants")
    analysis_steps_raw = analysis.get("steps")

    participants = (
        [str(item).strip() for item in analysis_participants_raw if str(item).strip()]
        if isinstance(analysis_participants_raw, list)
        else _extract_goal_participants(goal)
    )
    steps = (
        [str(item).strip() for item in analysis_steps_raw if str(item).strip()]
        if isinstance(analysis_steps_raw, list)
        else _extract_goal_steps(goal)
    )

    if not steps:
        steps = [
            "Mapeamento inicial",
            "Analise da solicitacao",
            "Validacao e decisao",
            "Finalizacao do processo",
        ]

    stages: list[dict[str, Any]] = []
    for index, step in enumerate(steps, 1):
        normalized_step = " ".join(str(step or "").strip().split())
        if not normalized_step:
            continue

        if _looks_like_decision_stage(normalized_step):
            stage_type = "condicional"
        elif _looks_like_activity_stage(normalized_step):
            stage_type = "task"
        elif _looks_like_data_stage(normalized_step):
            stage_type = "dados"
        else:
            stage_type = "task"
        stages.append(
            {
                "id": f"stage-{index}",
                "nome": normalized_step,
                "tipo": stage_type,
                "participante": _resolve_stage_participant(normalized_step, participants, index - 1),
            }
        )

    participant_lane_index: dict[str, int] = {}
    for index, participant in enumerate(participants):
        participant_lane_index[str(participant).lower()] = index

    nodes: list[dict[str, Any]] = []
    data_stage_counter = 0
    for index, stage in enumerate(stages, 1):
        stage_name = str(stage.get("nome") or f"Etapa {index}").strip()
        stage_type = str(stage.get("tipo") or "task").strip().lower()
        participant = str(stage.get("participante") or "").strip()
        pair_participant, pair_activity_description = _split_stage_participant_activity(stage_name)
        if pair_participant:
            participant = pair_participant
        effective_activity_description = pair_activity_description or stage_name

        lane_index = participant_lane_index.get(participant.lower(), 0)
        y = 120 + (lane_index * 170)
        x = 120 + ((index - 1) * 240)

        node_type_resolved = _stage_type_to_node_type(stage_type)

        if node_type_resolved == "condicional":
            node_label = _build_non_data_stage_name("condicional", stage_name, index)
            description = _build_non_data_stage_description("condicional", stage_name, node_label)
        elif node_type_resolved == "task":
            activity_name = _activity_name_from_description(effective_activity_description, index)
            node_label = _sanitize_node_name_by_type(activity_name, "task", index)
            description = _activity_description_from_text(effective_activity_description, index)
        else:
            data_stage_counter += 1
            node_label = _sanitize_node_name_by_type(participant or stage_name, "entidade", index)
            description = stage_name

        node = {
            "id": f"ai-node-{index}",
            "label": node_label,
            "nodeType": node_type_resolved,
            "x": x,
            "y": y,
            "info": "id" if node_type_resolved == "entidade" else (f"Raia: {participant}" if participant else ""),
            "descricao": description,
        }
        if node_type_resolved == "condicional":
            node["condicionalNome"] = node_label
            node["condicionalDescricao"] = description
            node["gatewayType"] = _infer_gateway_type_from_text(
                node_label,
                description,
                outgoing_count=2,
            )
        elif node_type_resolved == "task":
            node["taskNome"] = node_label
            node["taskDescricao"] = description
        else:
            node["entidadeNome"] = node_label
            node["tipoEntidade"] = _infer_data_entity_type(
                stage_name,
                participant,
                default="principal" if data_stage_counter == 1 else "apoio",
            )

        nodes.append(node)

    def is_negative_stage(stage_name: str) -> bool:
        raw_text = str(stage_name or "").strip()
        if re.match(r"^(n[aã]o|nao)\s*[:\-]", raw_text, flags=re.IGNORECASE):
            return True

        normalized = _normalize_ai_text(raw_text)
        negative_hints = (
            "nao",
            "não",
            "rejeit",
            "cancel",
            "negad",
            "indefer",
            "encerr",
            "finaliz",
            "devolver",
            "corrigir",
        )
        return any(hint in normalized for hint in negative_hints)

    def is_positive_stage(stage_name: str) -> bool:
        raw_text = str(stage_name or "").strip()
        if re.match(r"^(sim|aprovad[oa]?|deferid[oa]?)\s*[:\-]", raw_text, flags=re.IGNORECASE):
            return True

        normalized = _normalize_ai_text(raw_text)
        positive_hints = (
            "sim",
            "aprov",
            "defer",
            "seguir",
            "prosseguir",
            "emit",
            "gera",
            "gerar",
            "enviar",
        )
        return any(hint in normalized for hint in positive_hints)

    def find_branch_target_index(start_index: int, prefer_negative: bool) -> int | None:
        scored_candidates: list[tuple[int, int]] = []
        for probe_index in range(start_index, len(stages)):
            stage_name = str(stages[probe_index].get("nome") or "").strip()
            if not stage_name:
                continue

            score = 0
            if prefer_negative:
                if re.match(r"^(n[aã]o|nao)\s*[:\-]", stage_name, flags=re.IGNORECASE):
                    score += 5
                if is_negative_stage(stage_name):
                    score += 3
                if is_positive_stage(stage_name):
                    score -= 2
            else:
                if re.match(r"^(sim|aprovad[oa]?|deferid[oa]?)\s*[:\-]", stage_name, flags=re.IGNORECASE):
                    score += 5
                if is_positive_stage(stage_name):
                    score += 3
                if is_negative_stage(stage_name):
                    score -= 2

            if str(stages[probe_index].get("tipo") or "") == "dados":
                score -= 1

            scored_candidates.append((score, probe_index))

        if not scored_candidates:
            return None

        scored_candidates.sort(key=lambda item: (-item[0], item[1]))
        best_score, best_index = scored_candidates[0]
        if best_score <= 0:
            if prefer_negative:
                return None
            return start_index if start_index < len(stages) else None
        return best_index

    synthetic_nodes: list[dict[str, Any]] = []
    connections: list[dict[str, Any]] = []
    conn_counter = 1

    for index, node in enumerate(nodes):
        current_id = str(node.get("id") or "").strip()
        if not current_id:
            continue

        if index + 1 >= len(nodes):
            continue

        is_decision = str(node.get("nodeType") or "").strip().lower() == "condicional"
        if not is_decision:
            connections.append(
                {
                    "id": f"ai-conn-{conn_counter}",
                    "from": current_id,
                    "to": str(nodes[index + 1].get("id") or "").strip(),
                    "fromHandle": "right",
                    "toHandle": "left",
                }
            )
            conn_counter += 1
            continue

        yes_target_index = find_branch_target_index(index + 1, prefer_negative=False)
        if yes_target_index is None:
            yes_target_index = index + 1 if index + 1 < len(nodes) else None

        no_target_index = find_branch_target_index(index + 1, prefer_negative=True)
        if no_target_index is not None and no_target_index == yes_target_index:
            no_target_index = next(
                (
                    probe_index
                    for probe_index in range(index + 1, len(stages))
                    if probe_index != yes_target_index and is_negative_stage(str(stages[probe_index].get("nome") or ""))
                ),
                None,
            )
        if no_target_index is None:
            no_target_index = None

        yes_target_id = (
            str(nodes[yes_target_index].get("id") or "").strip()
            if yes_target_index is not None and yes_target_index < len(nodes)
            else ""
        )
        no_target_id = str(nodes[no_target_index].get("id") or "").strip() if no_target_index is not None else ""

        if yes_target_id:
            connections.append(
                {
                    "id": f"ai-conn-{conn_counter}",
                    "from": current_id,
                    "to": yes_target_id,
                    "fromHandle": "right",
                    "toHandle": "left",
                    "decision": "sim",
                }
            )
            conn_counter += 1

        if not no_target_id:
            synthetic_id = f"ai-node-no-end-{index + 1}"
            no_target_id = synthetic_id
            synthetic_nodes.append(
                {
                    "id": synthetic_id,
                    "label": "Encerrar (Nao)",
                    "nodeType": "task",
                    "taskNome": "Encerrar (Nao)",
                    "x": (float(node.get("x") or 120) + 240),
                    "y": (float(node.get("y") or 120) + 170),
                    "info": str(node.get("info") or "").strip(),
                }
            )

        connections.append(
            {
                "id": f"ai-conn-{conn_counter}",
                "from": current_id,
                "to": no_target_id,
                "fromHandle": "bottom",
                "toHandle": "left",
                "decision": "nao",
            }
        )
        conn_counter += 1

    if synthetic_nodes:
        nodes.extend(synthetic_nodes)

    entities: list[str] = []
    for node in nodes:
        if str(node.get("nodeType") or "").strip().lower() != "entidade":
            continue
        candidate_name = str(node.get("entidadeNome") or node.get("label") or "").strip()
        if candidate_name:
            entities.append(candidate_name)

    # Keep order and avoid duplicate entity creations when names repeat across stages.
    entities = _dedupe_preserve_order(entities)
    if not entities:
        fallback_entity_name = str(entity_name or process_name or "Entidade IA").strip()
        if fallback_entity_name:
            entities = [fallback_entity_name]

    payload = _sanitize_bpmn_payload(
        {
            "name": process_name,
            "stages": stages,
            "nodes": nodes,
            "connections": connections,
        },
        3,
    )
    return payload, entities


# ---------------------------------------------------------------------------
# Revisão de plano: garante que TODA ação de entidade tenha descricao e campos,
# e que os nodes do BPMN tenham descrições preenchidas.
# ---------------------------------------------------------------------------
def _review_plan_fill_missing_content(plan: dict[str, Any], process_name: str = "") -> dict[str, Any]:
    """Analisa o plano e preenche conteúdo faltante em entidades e nodes BPMN."""
    actions = plan.get("actions")
    if not isinstance(actions, list):
        return plan

    # Coleta nomes de todas as entidades no plano para referências FK
    all_entity_names: list[str] = []
    for action in actions:
        if not isinstance(action, dict):
            continue
        if action.get("type") == "create_entidade":
            p = action.get("payload")
            if isinstance(p, dict):
                name = str(p.get("nome") or "").strip()
                if name:
                    all_entity_names.append(name)

    all_entity_names = _dedupe_preserve_order(all_entity_names) if all_entity_names else []

    patched_count = 0
    for action in actions:
        if not isinstance(action, dict):
            continue

        # --- Revisão de ações create_entidade ---
        if action.get("type") == "create_entidade":
            p = action.get("payload")
            if not isinstance(p, dict):
                continue

            entity_name = str(p.get("nome") or "").strip()
            entity_kind = _normalize_entity_type(str(p.get("tipoEntidade") or ""), default="processo")

            # Preencher descricao vazia
            if not str(p.get("descricao") or "").strip():
                p["descricao"] = _default_entity_description(
                    entity_name, entity_kind, process_name
                )
                patched_count += 1

            # Preencher campos vazios ou ausentes
            existing_campos = p.get("campos")
            if not isinstance(existing_campos, list) or len(existing_campos) == 0:
                entity_index = (
                    all_entity_names.index(entity_name) + 1
                    if entity_name in all_entity_names
                    else 1
                )
                p["campos"] = _sanitize_entity_fields(
                    [],
                    entity_name,
                    _build_default_entity_fields_with_references(
                        entity_name, entity_index, all_entity_names
                    ),
                )
                patched_count += 1

        # --- Revisão do BPMN state: nodes sem descrição ---
        if action.get("type") == "update_bpmn_state":
            p = action.get("payload")
            if not isinstance(p, dict):
                continue
            nodes = p.get("nodes")
            if not isinstance(nodes, list):
                continue
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                nt = str(node.get("nodeType") or "").strip()
                label = str(node.get("label") or "").strip()
                if nt == "entidade":
                    if not str(node.get("descricao") or "").strip():
                        node["descricao"] = _default_entity_description(
                            label, node.get("tipoEntidade", ""), process_name
                        )
                        patched_count += 1
                elif nt == "task":
                    if not str(node.get("taskDescricao") or "").strip():
                        node["taskDescricao"] = _activity_description_from_text(label, 0)
                        patched_count += 1
                    if not str(node.get("descricao") or "").strip():
                        node["descricao"] = node.get("taskDescricao") or _activity_description_from_text(label, 0)
                elif nt == "condicional":
                    if not str(node.get("condicionalDescricao") or "").strip():
                        node["condicionalDescricao"] = _conditional_description_from_name(label)
                        patched_count += 1
                    if not str(node.get("descricao") or "").strip():
                        node["descricao"] = node.get("condicionalDescricao") or _conditional_description_from_name(label)

    if patched_count > 0:
        plan["_reviewPatched"] = patched_count

    return plan


def _build_ai_plan(goal: str, current_user: dict[str, Any], context: dict[str, Any] | None = None):
    normalized_goal = " ".join(str(goal or "").strip().split())
    if len(normalized_goal) < 8:
        raise HTTPException(status_code=400, detail="Descreva um objetivo mais detalhado para a IA.")

    context_payload = context if isinstance(context, dict) else {}
    process_name = str(context_payload.get("processName") or "Processo sugerido pela IA").strip()
    goal_entities = _extract_goal_data_entities(normalized_goal)
    goal_entity_names = [str(item.get("nome") or "").strip() for item in goal_entities if isinstance(item, dict)]
    goal_entity_type_by_name = {
        _normalize_ai_text(item.get("nome")): str(item.get("tipo") or "")
        for item in goal_entities
        if isinstance(item, dict) and str(item.get("nome") or "").strip()
    }

    suggested_entities = _dedupe_preserve_order([
        *_extract_suggested_entity_names(context_payload),
        *goal_entity_names,
    ])
    entity_name = str((suggested_entities[0] if suggested_entities else process_name) or "Entidade IA").strip()
    general_analysis = _build_general_process_analysis(normalized_goal, process_name, entity_name)
    existing_entities = _extract_existing_entities_context(context_payload)

    local_bpmn_payload, local_entities = _build_local_bpmn_payload(
        normalized_goal,
        process_name,
        entity_name,
        general_analysis,
    )
    local_bpmn_payload = _ensure_bpmn_entity_nodes(
        local_bpmn_payload,
        _dedupe_preserve_order([*goal_entity_names, *local_entities]),
        3,
    )

    matched_existing_entity = _find_matching_existing_entity(
        [*suggested_entities, entity_name, process_name, *local_entities],
        existing_entities,
    )

    entity_actions: list[dict[str, Any]] = []
    candidate_entities = _dedupe_preserve_order(
        [
            str(name or "").strip()
            for name in ([*suggested_entities, *local_entities] or [entity_name, process_name])
            if str(name or "").strip()
        ]
    )

    for entity_index, candidate_name in enumerate(candidate_entities, start=1):
        entity_kind = _entity_type_label(
            goal_entity_type_by_name.get(_normalize_ai_text(candidate_name), ""),
            entity_index,
        )
        entity_actions.append(
            {
                "id": f"a{len(entity_actions) + 1}",
                "type": "create_entidade",
                "label": f"Criar entidade {candidate_name}",
                "risk": "medium",
                "requiresApproval": True,
                "payload": {
                    "nome": candidate_name,
                    "descricao": _default_entity_description(candidate_name, entity_kind, process_name),
                    "categoria": process_name,
                    "tipoEntidade": entity_kind,
                    "campos": _sanitize_entity_fields(
                        [],
                        candidate_name,
                        _build_default_entity_fields_with_references(
                            candidate_name,
                            entity_index,
                            candidate_entities,
                        ),
                    ),
                },
            }
        )

    opportunity_action_id = f"a{len(entity_actions) + 1}"
    bpmn_action_id = f"a{len(entity_actions) + 2}"

    actions = [
        *entity_actions,
        {
            "id": opportunity_action_id,
            "type": "create_oportunidade",
            "label": "Criar oportunidade inicial para o fluxo",
            "risk": "medium",
            "requiresApproval": True,
            "payload": {
                "nome": process_name,
                "descricao": normalized_goal,
                "etapa": "Mapeamento",
                "responsavel": current_user.get("nome", "Usuario IA"),
                "status": "Em andamento",
            },
        },
        {
            "id": bpmn_action_id,
            "type": "update_bpmn_state",
            "label": "Atualizar rascunho completo do editor BPMN",
            "risk": "low",
            "requiresApproval": True,
            "payload": local_bpmn_payload,
        },
    ]

    if _is_read_only_user(current_user):
        actions = [
            {
                "id": "a0",
                "type": "no_write_preview",
                "label": "Usuário com acesso de visualização: plano apenas consultivo",
                "risk": "low",
                "requiresApproval": False,
                "payload": {
                    "summary": "Seu perfil atual permite sugerir, mas nao executar alteracoes.",
                    "recommendedActions": [
                        "Solicitar permissao de edicao (nivel 2 ou 3)",
                        "Reexecutar o plano com um usuario editor/admin",
                    ],
                },
            }
        ]

    context_panel_suggestion = _build_context_panel_suggestion_from_actions(
        actions,
        process_name,
        entity_name,
        normalized_goal,
        matched_existing_entity,
    )

    if not _is_read_only_user(current_user):
        try:
            bpmn_ia_plan = _build_ai_plan_via_bpmn_ia(
                normalized_goal,
                current_user,
                context_payload,
            )
            if bpmn_ia_plan:
                if not isinstance(bpmn_ia_plan.get("generalAnalysis"), dict):
                    bpmn_ia_plan["generalAnalysis"] = general_analysis
                return bpmn_ia_plan
        except Exception as error:
            print(f"[WARN] BPMN-IA indisponivel, usando fallback de IA existente: {error}")

        try:
            groq_plan = _build_ai_plan_via_groq(normalized_goal, current_user, context_payload)
            if groq_plan:
                if not isinstance(groq_plan.get("generalAnalysis"), dict):
                    groq_plan["generalAnalysis"] = general_analysis
                return groq_plan
        except Exception as error:
            print(f"[WARN] Groq indisponivel, tentando OpenAI: {error}")

        try:
            llm_plan = _build_ai_plan_via_openai(normalized_goal, current_user, context_payload)
            if llm_plan:
                if not isinstance(llm_plan.get("generalAnalysis"), dict):
                    llm_plan["generalAnalysis"] = general_analysis
                return llm_plan
        except Exception as error:
            print(f"[WARN] IA LLM indisponivel, usando fallback local: {error}")

    return {
        "goal": normalized_goal,
        "mode": "supervised",
        "requiresHumanApproval": True,
        "generatedAt": now_iso(),
        "generalAnalysis": general_analysis,
        "actions": actions,
        "contextPanelSuggestion": context_panel_suggestion,
    }


def _append_ai_audit_log(record: dict[str, Any]):
    with _data_lock:
        rows = load_ai_audit_data(AI_AUDIT_FILE)
        current = rows if isinstance(rows, list) else []
        next_id = max([int(item.get("id", 0)) for item in current if isinstance(item, dict)], default=0) + 1
        payload = {
            "id": next_id,
            **record,
            "created_at": now_iso(),
        }
        current.append(payload)
        save_ai_audit_data(AI_AUDIT_FILE, current)
        return payload


def _build_flow_stages_from_bpmn_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    safe_nodes = [item for item in (nodes or []) if isinstance(item, dict)]
    ordered_nodes = sorted(
        [item for item in safe_nodes if item.get("active") is not False],
        key=lambda item: (
            float(item.get("x") or 0),
            float(item.get("y") or 0),
            str(item.get("id") or ""),
        ),
    )

    flow_stages: list[dict[str, Any]] = []
    for index, node in enumerate(ordered_nodes):
        node_type = _stage_type_to_node_type(node.get("nodeType") or "dados")
        if node_type == "task":
            label = _sanitize_node_name_by_type(
                node.get("taskNome") or node.get("label") or "Atividade",
                "task",
                index + 1,
            )
            stage_type = "task"
        elif node_type == "condicional":
            label = _sanitize_node_name_by_type(
                node.get("condicionalNome") or node.get("label") or "Decisao",
                "condicional",
                index + 1,
            )
            stage_type = "condicional"
        else:
            label = _sanitize_node_name_by_type(
                node.get("entidadeNome") or node.get("label") or "Entidade",
                "entidade",
                index + 1,
            )
            stage_type = "dados"

        info = str(node.get("info") or "").strip()
        participant = ""
        if "Raia:" in info:
            participant = str(info.split("Raia:", 1)[1]).strip()

        flow_stages.append(
            {
                "id": str(node.get("id") or f"stage-{index + 1}").strip() or f"stage-{index + 1}",
                "index": index,
                "nome": label,
                "tipo": stage_type,
                "participante": participant,
            }
        )

    return flow_stages


def _sync_bpmn_state_to_opportunity_table(
    bpmn_state: dict[str, Any],
    current_user: dict[str, Any],
) -> dict[str, Any] | None:
    if not isinstance(bpmn_state, dict):
        return None

    target_name = str(bpmn_state.get("name") or "").strip()
    raw_nodes_value = bpmn_state.get("nodes")
    raw_nodes: list[Any] = raw_nodes_value if isinstance(raw_nodes_value, list) else []
    safe_nodes: list[dict[str, Any]] = [
        item for item in raw_nodes if isinstance(item, dict)
    ]

    raw_connections_value = bpmn_state.get("connections")
    raw_connections: list[Any] = (
        raw_connections_value if isinstance(raw_connections_value, list) else []
    )
    safe_connections: list[dict[str, Any]] = [
        item for item in raw_connections if isinstance(item, dict)
    ]

    raw_stages_value = bpmn_state.get("stages")
    raw_stages: list[Any] = raw_stages_value if isinstance(raw_stages_value, list) else []
    safe_stages: list[dict[str, Any]] = [
        item for item in raw_stages if isinstance(item, dict)
    ]

    flow_stages: list[dict[str, Any]] = (
        safe_stages if safe_stages else _build_flow_stages_from_bpmn_nodes(safe_nodes)
    )
    if not flow_stages:
        return None

    first_stage_id = str(flow_stages[0].get("id") or "").strip() if flow_stages else ""

    with _data_lock:
        oportunidades = load_oportunidades_data()
        if not isinstance(oportunidades, list) or not oportunidades:
            return None

        normalized_target_name = normalize_oportunidade({"name": target_name}).get("name", "").strip().lower()
        user_name = str(current_user.get("nome") or "").strip().lower()

        candidate_indexes: list[int] = []
        for index, item in enumerate(oportunidades):
            if not isinstance(item, dict):
                continue
            item_name = str(item.get("name") or item.get("nome") or "").strip().lower()
            item_owner = str(item.get("owner") or item.get("criadoPor") or "").strip().lower()
            if normalized_target_name and item_name == normalized_target_name:
                candidate_indexes.append(index)
                continue
            if not normalized_target_name and user_name and item_owner == user_name:
                candidate_indexes.append(index)

        if candidate_indexes:
            target_index = candidate_indexes[-1]
        else:
            target_index = len(oportunidades) - 1

        existing_raw = oportunidades[target_index]
        existing: dict[str, Any] = existing_raw if isinstance(existing_raw, dict) else {}
        existing_bpmn_raw = existing.get("bpmn")
        existing_bpmn: dict[str, Any] = (
            existing_bpmn_raw if isinstance(existing_bpmn_raw, dict) else {}
        )

        merged = {
            **existing,
            "name": target_name or existing.get("name") or existing.get("nome") or "",
            "nome": target_name or existing.get("nome") or existing.get("name") or "",
            "stages": flow_stages,
            "currentNodeId": first_stage_id,
            "activeNodeId": first_stage_id,
            "bpmnNodeId": first_stage_id,
            "bpmnCurrentNodeId": first_stage_id,
            "sourceNodeId": first_stage_id,
            "updated_at": now_iso(),
            "bpmn": {
                **existing_bpmn,
                "name": target_name or existing_bpmn.get("name") or "",
                "nodes": safe_nodes,
                "connections": safe_connections,
                "stages": flow_stages,
                "currentNodeId": first_stage_id,
                "activeNodeId": first_stage_id,
                "updated_at": now_iso(),
            },
        }

        normalized = normalize_oportunidade(merged)
        oportunidades[target_index] = normalized
        save_oportunidades_data(oportunidades)
        return normalized

    if action_type == "no_write_preview":
        return {
            "type": action_type,
            "status": "skipped",
            "result": payload,
        }

    if _is_read_only_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="Seu nivel de acesso permite apenas visualizacao. Execucao da IA bloqueada.",
        )

    if action_type == "create_entidade":
        entidade_data = {
            "categoria": str(payload.get("categoria") or "IA"),
            "nome": str(payload.get("nome") or "Entidade IA").strip(),
            "descricao": str(payload.get("descricao") or "").strip(),
            "tipoEntidade": _normalize_entity_type(str(payload.get("tipoEntidade") or ""), default="processo"),
            "campos": payload.get("campos") if isinstance(payload.get("campos"), list) else [],
            "criadoPor": current_user.get("nome") or "IA",
        }
        created = create_entidade(Entidade(**entidade_data))
        return {
            "type": action_type,
            "status": "ok",
            "result": created,
        }

    if action_type == "create_oportunidade":
        oportunidade_data = {
            "nome": _unique_opportunity_name(str(payload.get("nome") or "Oportunidade IA").strip()),
            "descricao": str(payload.get("descricao") or "Gerada por IA").strip(),
            "etapa": str(payload.get("etapa") or "Mapeamento"),
            "responsavel": str(payload.get("responsavel") or current_user.get("nome") or "IA"),
            "status": str(payload.get("status") or "Em andamento"),
            "criadoPor": current_user.get("nome") or "IA",
        }
        created = create_oportunidade(Oportunidade(**oportunidade_data))
        return {
            "type": action_type,
            "status": "ok",
            "result": created,
        }

    if action_type == "update_bpmn_state":
        created = update_bpmn_editor_state(payload)
        synced_opportunity = _sync_bpmn_state_to_opportunity_table(created, current_user)
        return {
            "type": action_type,
            "status": "ok",
            "result": created,
            "syncedOpportunity": synced_opportunity,
        }

    raise HTTPException(status_code=400, detail=f"Tipo de acao nao suportado: {action_type}")


def init_supabase_storage():
    global USE_SUPABASE_DB
    if not USE_SUPABASE_DB:
        return

    _, json_adapter = _require_db_dependencies()

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {USERS_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {USERS_TABLE} ENABLE ROW LEVEL SECURITY")
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {ENTIDADES_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {ENTIDADES_TABLE} ENABLE ROW LEVEL SECURITY")
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {OPORTUNIDADES_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {OPORTUNIDADES_TABLE} ENABLE ROW LEVEL SECURITY")
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {BPMN_EDITOR_STATE_TABLE} (
                        state_key TEXT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {BPMN_EDITOR_STATE_TABLE} ENABLE ROW LEVEL SECURITY")
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {AI_AUDIT_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {AI_AUDIT_TABLE} ENABLE ROW LEVEL SECURITY")

                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {WORKFLOW_INSTANCES_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {WORKFLOW_INSTANCES_TABLE} ENABLE ROW LEVEL SECURITY")

                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {WORKFLOW_TASKS_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(f"ALTER TABLE {WORKFLOW_TASKS_TABLE} ENABLE ROW LEVEL SECURITY")

                # Secondary tables (webhooks, event_log, delivery_log, sla_violations)
                for _sec_table in ["webhooks_store", "event_log_store", "delivery_log_store", "sla_violations_store"]:
                    cursor.execute(f"""
                        CREATE TABLE IF NOT EXISTS {_sec_table} (
                            id BIGINT PRIMARY KEY,
                            payload JSONB NOT NULL
                        )
                    """)
                    cursor.execute(f"ALTER TABLE {_sec_table} ENABLE ROW LEVEL SECURITY")

                cursor.execute(f"SELECT COUNT(*) FROM {USERS_TABLE}")
                users_row = cursor.fetchone()
                users_count = int((users_row[0] if users_row else 0) or 0)
                if users_count == 0:
                    for item in load_json(USERS_FILE, []):
                        if not isinstance(item, dict):
                            continue
                        raw_id = item.get("id")
                        if raw_id is None:
                            continue
                        try:
                            item_id = int(raw_id)
                        except Exception:
                            continue
                        cursor.execute(
                            f"INSERT INTO {USERS_TABLE} (id, payload) VALUES (%s, %s)",
                            (item_id, json_adapter({**item, "id": item_id})),
                        )

                cursor.execute(f"SELECT COUNT(*) FROM {ENTIDADES_TABLE}")
                entidades_row = cursor.fetchone()
                entidades_count = int((entidades_row[0] if entidades_row else 0) or 0)
                if entidades_count == 0:
                    for item in load_json(ENTIDADES_FILE, []):
                        if not isinstance(item, dict):
                            continue
                        raw_id = item.get("id")
                        if raw_id is None:
                            continue
                        try:
                            item_id = int(raw_id)
                        except Exception:
                            continue
                        cursor.execute(
                            f"INSERT INTO {ENTIDADES_TABLE} (id, payload) VALUES (%s, %s)",
                            (item_id, json_adapter({**item, "id": item_id})),
                        )

                cursor.execute(f"SELECT COUNT(*) FROM {OPORTUNIDADES_TABLE}")
                oportunidades_row = cursor.fetchone()
                oportunidades_count = int((oportunidades_row[0] if oportunidades_row else 0) or 0)
                if oportunidades_count == 0:
                    for item in load_json(OPORTUNIDADES_FILE, []):
                        if not isinstance(item, dict):
                            continue
                        raw_id = item.get("id")
                        if raw_id is None:
                            continue
                        try:
                            item_id = int(raw_id)
                        except Exception:
                            continue
                        cursor.execute(
                            f"INSERT INTO {OPORTUNIDADES_TABLE} (id, payload) VALUES (%s, %s)",
                            (item_id, json_adapter({**item, "id": item_id})),
                        )

                cursor.execute(
                    f"SELECT COUNT(*) FROM {BPMN_EDITOR_STATE_TABLE} WHERE state_key = %s",
                    ("default",),
                )
                bpmn_state_row = cursor.fetchone()
                bpmn_state_count = int((bpmn_state_row[0] if bpmn_state_row else 0) or 0)
                if bpmn_state_count == 0:
                    initial_state = load_json(
                        BPMN_EDITOR_STATE_FILE,
                        {
                            "name": "Novo BPMN",
                            "nodes": [],
                            "connections": [],
                            "updated_at": "",
                        },
                    )
                    if not isinstance(initial_state, dict):
                        initial_state = {
                            "name": "Novo BPMN",
                            "nodes": [],
                            "connections": [],
                            "updated_at": "",
                        }
                    cursor.execute(
                        f"INSERT INTO {BPMN_EDITOR_STATE_TABLE} (state_key, payload) VALUES (%s, %s)",
                        ("default", json_adapter(initial_state)),
                    )

            conn.commit()
    except Exception as exc:
        # Keep API online even when Supabase is temporarily unreachable.
        print(f"[WARN] Falha ao conectar no Supabase ({exc}). Usando JSON local.")
        USE_SUPABASE_DB = False


def load_users_data():
    return load_collection(USERS_FILE, USERS_TABLE, [])


def get_user_by_id(user_id: int):
    if USE_SUPABASE_DB:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT id, payload FROM {USERS_TABLE} WHERE id = %s",
                    (int(user_id),),
                )
                row = cursor.fetchone()
                if row:
                    return _merge_record_payload(row[0], row[1])
        return None

    users = load_users_data()
    return next((u for u in users if int(u.get("id", -1)) == int(user_id)), None)


def get_user_by_email(email: str):
    normalized_email = str(email or "").strip().lower()

    if USE_SUPABASE_DB:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT id, payload
                    FROM {USERS_TABLE}
                    WHERE LOWER(payload->>'email') = %s
                    LIMIT 1
                    """,
                    (normalized_email,),
                )
                row = cursor.fetchone()
                if row:
                    return _merge_record_payload(row[0], row[1])
        return None

    users = load_users_data()
    return next(
        (
            u
            for u in users
            if str(u.get("email", "")).strip().lower() == normalized_email
        ),
        None,
    )


def update_user_password_hash(user_id: int, senha_hash: str) -> None:
    """Update only one user's password hash, avoiding full-table rewrites."""
    if USE_SUPABASE_DB:
        _, json_adapter = _require_db_dependencies()
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT payload FROM {USERS_TABLE} WHERE id = %s",
                    (int(user_id),),
                )
                row = cursor.fetchone()
                if not row:
                    return
                payload = row[0] if isinstance(row[0], dict) else {}
                payload["senha"] = str(senha_hash)
                cursor.execute(
                    f"UPDATE {USERS_TABLE} SET payload = %s WHERE id = %s",
                    (json_adapter(payload), int(user_id)),
                )
            conn.commit()
        return

    with _data_lock:
        users = load_users_data()
        changed = False
        for u in users:
            if int(u.get("id", -1)) == int(user_id):
                u["senha"] = str(senha_hash)
                changed = True
                break
        if changed:
            save_users_data(users)


def _is_admin_user(user: dict[str, Any]) -> bool:
    return bool(user.get("admin", False) or user.get("role") == "admin")


def _parse_user_created_at(value: Any) -> datetime:
    if not value:
        return datetime.max

    value_str = str(value).strip()
    if not value_str:
        return datetime.max

    normalized = value_str.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except Exception:
        return datetime.max


def get_principal_admin_id(users: list[dict[str, Any]]) -> int | None:
    admin_candidates: list[tuple[datetime, int]] = []

    for candidate in users:
        if not isinstance(candidate, dict) or not _is_admin_user(candidate):
            continue

        raw_id = candidate.get("id")
        if raw_id is None:
            continue
        try:
            candidate_id = int(raw_id)
        except Exception:
            continue

        created_at = _parse_user_created_at(
            candidate.get("created_at", candidate.get("data", ""))
        )
        admin_candidates.append((created_at, candidate_id))

    if not admin_candidates:
        return None

    admin_candidates.sort(key=lambda item: (item[0], item[1]))
    return admin_candidates[0][1]


def save_users_data(rows):
    save_collection(USERS_FILE, USERS_TABLE, rows)


def load_entidades_data():
    return load_collection(ENTIDADES_FILE, ENTIDADES_TABLE, [])


def save_entidades_data(rows):
    save_collection(ENTIDADES_FILE, ENTIDADES_TABLE, rows)


def load_oportunidades_data():
    return load_collection(OPORTUNIDADES_FILE, OPORTUNIDADES_TABLE, [])


def save_oportunidades_data(rows):
    save_collection(OPORTUNIDADES_FILE, OPORTUNIDADES_TABLE, rows)


def load_documentos_data():
    return load_collection(DOCUMENTOS_FILE, DOCUMENTOS_TABLE, [])


def save_documentos_data(rows):
    save_collection(DOCUMENTOS_FILE, DOCUMENTOS_TABLE, rows)


def load_registros_data():
    return load_json(REGISTROS_FILE, [])


def save_registros_data(rows):
    save_json(REGISTROS_FILE, rows)


def load_leads_data():
    return load_collection(LEADS_FILE, "leads_store", [])


def save_leads_data(rows):
    save_collection(LEADS_FILE, "leads_store", rows)


def load_contatos_data():
    return load_collection(CONTATOS_FILE, "contatos_store", [])


def save_contatos_data(rows):
    save_collection(CONTATOS_FILE, "contatos_store", rows)


def _sync_opportunity_contacts_to_independent_table(opportunity: dict[str, Any]) -> None:
    """Sincroniza contatos de uma oportunidade para contatos.json"""
    if not isinstance(opportunity, dict):
        return
    
    opp_id = opportunity.get("id")
    opp_name = opportunity.get("nome") or opportunity.get("name") or ""
    contacts = opportunity.get("contacts")
    
    if not opp_id or not isinstance(contacts, list):
        return
    
    with _data_lock:
        contatos = load_contatos_data()
        
        # Remove contatos antigos dessa oportunidade (soft delete)
        for c in contatos:
            if c.get("opportunityId") == opp_id:
                c["ativo"] = False
                c["updated_at"] = now_iso()
        
        # Adiciona/atualiza contatos da oportunidade
        next_id = max([int(c.get("id", 0)) for c in contatos if c.get("ativo", True)], default=0) + 1
        
        for contact in contacts:
            if not contact or not isinstance(contact, dict):
                continue
            
            contact_nome = str(contact.get("nome") or "").strip()
            if not contact_nome:
                continue
            
            # Procura contato existente por nome+opp
            existing = next(
                (c for c in contatos 
                 if c.get("opportunityId") == opp_id 
                 and (c.get("nome") or "").strip().lower() == contact_nome.lower()
                 and c.get("ativo", True)),
                None
            )
            
            contato_dict = {
                "id": existing.get("id") if existing else next_id,
                "nome": contact_nome,
                "cargo": contact.get("cargo") or "",
                "email": contact.get("email") or "",
                "telefone": contact.get("telefone") or "",
                "empresa": contact.get("empresa") or "",
                "descricao": contact.get("descricao") or "",
                "notas": contact.get("notas") or "",
                "isPrimary": contact.get("isPrimary", False),
                "entidadeId": contact.get("entidadeId"),
                "entidadeNome": contact.get("entidadeNome"),
                "opportunityId": opp_id,
                "opportunityName": opp_name,
                "ativo": True,
                "created_at": existing.get("created_at") if existing else now_iso(),
                "updated_at": now_iso(),
                "criadoPor": contact.get("criadoPor") or "oportunidade_sync",
            }
            
            if existing:
                # Atualiza contato existente
                idx = contatos.index(existing)
                contatos[idx] = contato_dict
            else:
                # Adiciona novo contato
                contatos.append(contato_dict)
                next_id += 1
        
        save_contatos_data(contatos)


def _sync_registro_contato_to_independent_table(registro: dict[str, Any]) -> None:
    """Sincroniza registros de papelNegocio='contato' para contatos.json e para oportunidade.contacts"""
    if not isinstance(registro, dict):
        return
    
    # Só sincroniza registros de contato
    if registro.get("papelNegocio") != "contato":
        return
    
    registro_id = registro.get("id")
    if not registro_id:
        return
    
    titulo = registro.get("titulo", "")
    dados = registro.get("dados", {}) if isinstance(registro.get("dados"), dict) else {}
    opp_id_raw = dados.get("oportunidadeId")
    
    # Normaliza opp_id para int se possível
    try:
        opp_id = int(opp_id_raw) if opp_id_raw is not None else None
    except (ValueError, TypeError):
        opp_id = None
    
    # Monta dict do contato
    contato_base = {
        "nome": titulo,
        "cargo": "",
        "email": "",
        "telefone": "",
        "isPrimary": False,
        "entidadeId": registro.get("entidadeId"),
        "entidadeNome": registro.get("entidadeNome"),
        "registro_id": registro_id,
    }
    
    with _data_lock:
        # 1. Salva em contatos.json
        contatos = load_contatos_data()
        existing = next((c for c in contatos if c.get("registro_id") == registro_id), None)
        new_id = (max([int(c.get("id", 0)) for c in contatos], default=0) + 1) if not existing else existing.get("id")
        
        contato_dict = {
            "id": new_id,
            "opportunityId": str(opp_id) if opp_id else "",
            "opportunityName": "",
            "empresa": "",
            "descricao": "",
            "notas": "",
            "ativo": True,
            "created_at": existing.get("created_at") if existing else now_iso(),
            "updated_at": now_iso(),
            "criadoPor": registro.get("criadoPor", "registro_sync"),
            **contato_base,
        }
        
        if existing:
            idx = contatos.index(existing)
            contatos[idx] = contato_dict
        else:
            contatos.append(contato_dict)
        
        save_contatos_data(contatos)
        
        # 2. Adiciona/atualiza no array contacts da oportunidade correspondente
        if opp_id:
            opps = load_oportunidades_data()
            for opp in opps:
                if int(opp.get("id", -1)) == opp_id:
                    existing_contacts = opp.get("contacts") if isinstance(opp.get("contacts"), list) else []
                    # Remove entrada anterior com mesmo registro_id
                    existing_contacts = [c for c in existing_contacts if c.get("registro_id") != registro_id]
                    existing_contacts.append({
                        **contato_base,
                        "id": f"reg_{registro_id}",
                    })
                    opp["contacts"] = existing_contacts
                    break
            save_oportunidades_data(opps)


def _delete_registro_contato_from_independent_table(registro: dict[str, Any]) -> None:
    """Marca contato como inativo quando registro é deletado e remove da oportunidade"""
    if not isinstance(registro, dict):
        return
    
    registro_id = registro.get("id")
    if not registro_id:
        return
    
    dados = registro.get("dados", {}) if isinstance(registro.get("dados"), dict) else {}
    opp_id_raw = dados.get("oportunidadeId")
    try:
        opp_id = int(opp_id_raw) if opp_id_raw is not None else None
    except (ValueError, TypeError):
        opp_id = None
    
    with _data_lock:
        # Remove de contatos.json
        contatos = load_contatos_data()
        for c in contatos:
            if c.get("registro_id") == registro_id:
                c["ativo"] = False
                c["updated_at"] = now_iso()
        save_contatos_data(contatos)
        
        # Remove do array contacts da oportunidade
        if opp_id:
            opps = load_oportunidades_data()
            for opp in opps:
                if int(opp.get("id", -1)) == opp_id:
                    existing_contacts = opp.get("contacts") if isinstance(opp.get("contacts"), list) else []
                    opp["contacts"] = [c for c in existing_contacts if c.get("registro_id") != registro_id]
                    break
            save_oportunidades_data(opps)




def load_activities_data():
    return load_collection(ACTIVITIES_FILE, "activities_store", [])


def save_activities_data(rows):
    save_collection(ACTIVITIES_FILE, "activities_store", rows)


def load_bpmn_tasks_catalog():
    return load_collection(BPMN_TASKS_CATALOG_FILE, "bpmn_tasks_catalog", [])


def save_bpmn_tasks_catalog(rows):
    save_collection(BPMN_TASKS_CATALOG_FILE, "bpmn_tasks_catalog", rows)


def load_bpmn_condicionais_catalog():
    return load_collection(BPMN_CONDICIONAIS_CATALOG_FILE, "bpmn_condicionais_catalog", [])


def save_bpmn_condicionais_catalog(rows):
    save_collection(BPMN_CONDICIONAIS_CATALOG_FILE, "bpmn_condicionais_catalog", rows)


def get_allowed_origins():
    origins_raw = os.getenv("ALLOWED_ORIGINS", "")
    frontend_url = os.getenv("FRONTEND_URL", "")

    # Keep local dev working even when production env vars are set.
    allowed = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    }

    for value in (origins_raw, frontend_url):
        for origin in value.split(","):
            cleaned = origin.strip().rstrip("/")
            if cleaned:
                allowed.add(cleaned)

    return sorted(allowed)


def normalize_oportunidade(oportunidade: dict):
    def format_date_only(value):
        if not value:
            return ""
        value_str = str(value)
        if "T" in value_str:
            value_str = value_str.split("T")[0]
        parts = value_str.split("-")
        if len(parts) == 3 and len(parts[0]) == 4:
            year, month, day = parts
            return f"{day}/{month}/{year}"
        return value_str

    created_at = oportunidade.get("created_at") or oportunidade.get("createdDate") or ""
    created_date = format_date_only(oportunidade.get("createdDate") or created_at)
    end_date_raw = (
        oportunidade.get("endDate")
        or oportunidade.get("end_date")
        or oportunidade.get("dataFinal")
        or oportunidade.get("data_encerramento")
        or ""
    )
    end_date = format_date_only(end_date_raw)
    normalized_status = (
        oportunidade.get("status")
        or oportunidade.get("etapa")
        or ""
    )
    return {
        **oportunidade,
        "name": oportunidade.get("name") or oportunidade.get("nome") or "",
        "nome": oportunidade.get("nome") or oportunidade.get("name") or "",
        "status": normalized_status,
        "owner": oportunidade.get("owner") or oportunidade.get("criadoPor") or "Nome da conta",
        "assignedTo": oportunidade.get("assignedTo") or oportunidade.get("responsavel") or "N/A",
        "createdDate": created_date,
        "endDate": end_date,
        "criadoPor": oportunidade.get("criadoPor") or oportunidade.get("owner") or "Nome da conta",
        "responsavel": oportunidade.get("responsavel") or oportunidade.get("assignedTo") or "N/A",
    }

# Função utilitária para envio de email via Mailgun
def send_mailgun_email(to, subject, body, sender=None):
    MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY", "")
    MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN", "")
    SENDER_EMAIL = sender or f"Mailgun Sandbox <postmaster@{MAILGUN_DOMAIN}>"
    if not MAILGUN_API_KEY or not MAILGUN_DOMAIN:
        return False
    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
            auth=("api", MAILGUN_API_KEY),
            data={
                "from": SENDER_EMAIL,
                "to": to,
                "subject": subject,
                "text": body
            }
        )
        print(f"[DEBUG] Mailgun response: {response.status_code} {response.text}")
        response.raise_for_status()
        return True
    except Exception as e:
        import traceback
        print(f"[ERRO] Falha ao enviar email via Mailgun: {e}")
        traceback.print_exc()
        return False

# Criação única do app
def get_app():
    app = FastAPI()
    # Configurar CORS para todas as rotas
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app

app = get_app()


# ─────────────────────────────────────────────────────────────────────────────
# Proactive SLA background checker + auto-reassignment
# ─────────────────────────────────────────────────────────────────────────────
_sla_checker_started = False


async def _sla_background_loop():
    """Periodically check SLA violations, send email alerts, and auto-reassign
    tasks that exceed 2x their SLA deadline."""
    import asyncio
    while True:
        try:
            check_sla_violations()
            _sla_notify_and_reassign()
        except Exception as e:
            print(f"[SLA-BG] Erro no loop SLA: {e}")
        await asyncio.sleep(int(os.getenv("SLA_CHECK_INTERVAL_SECONDS", "300")))


def _sla_notify_and_reassign():
    """Check overdue tasks: send email alert, auto-reassign if 2x past SLA."""
    now = datetime.now()
    tasks = load_workflow_tasks()
    for t in tasks:
        if t.get("status") != "pending":
            continue
        due = _parse_iso(t.get("dueAt"))
        if not due or now <= due:
            continue

        overdue_secs = (now - due).total_seconds()
        sla_hours = t.get("slaHours") or 0

        # Send email alert if not already notified
        if not t.get("_slaNotified"):
            assignee_name = t.get("assignee") or ""
            if assignee_name:
                email = _find_user_email_by_name(assignee_name)
                if email:
                    label = t.get("label") or "Tarefa"
                    send_mailgun_email(
                        email,
                        f"⚠️ SLA expirado: {label}",
                        f"Olá {assignee_name},\n\n"
                        f"A tarefa '{label}' (#{t.get('taskId')}) excedeu o prazo SLA.\n"
                        f"Prazo: {t.get('dueAt')}\n\n"
                        f"Por favor, conclua a tarefa o mais rápido possível."
                    )
            with _data_lock:
                all_tasks = load_workflow_tasks()
                for at in all_tasks:
                    if at.get("taskId") == t.get("taskId"):
                        at["_slaNotified"] = True
                        break
                save_workflow_tasks(all_tasks)

        # Auto-reassign if overdue > 2x SLA duration
        if sla_hours and overdue_secs > (sla_hours * 3600 * 2) and not t.get("_autoReassigned"):
            _auto_reassign_task(t)


def _auto_reassign_task(task: dict):
    """Try to reassign overdue task to another available user with same role or admin."""
    users = load_users_data()
    current_assignee = (task.get("assignee") or "").strip().lower()

    # Find another active user (prefer same role, then any admin)
    candidates = [
        u for u in users
        if u.get("ativo", True)
        and (u.get("nome") or "").strip().lower() != current_assignee
    ]
    if not candidates:
        return

    # Prefer users with matching role
    assigned_role = task.get("assignedRole") or ""
    role_matches = [u for u in candidates if u.get("role") == assigned_role] if assigned_role else []
    new_user = (role_matches or candidates)[0]
    new_name = new_user.get("nome", "")

    with _data_lock:
        tasks = load_workflow_tasks()
        for t in tasks:
            if t.get("taskId") == task.get("taskId"):
                t["assignee"] = new_name
                t["assigneeId"] = new_user.get("id")
                t["_autoReassigned"] = True
                t["updatedAt"] = now_iso()
                break
        save_workflow_tasks(tasks)

    emit_event("task_assigned", {
        "taskId": task.get("taskId"),
        "opportunityId": task.get("opportunityId"),
        "assignee": new_name,
        "reason": "auto_reassignment_sla",
    })

    # Notify new assignee
    email = _find_user_email_by_name(new_name)
    if email:
        label = task.get("label") or "Tarefa"
        send_mailgun_email(
            email,
            f"Tarefa reatribuída automaticamente: {label}",
            f"Olá {new_name},\n\n"
            f"A tarefa '{label}' (#{task.get('taskId')}) foi reatribuída a você "
            f"automaticamente porque o responsável anterior não concluiu dentro do prazo SLA.\n\n"
            f"Por favor, verifique e conclua a tarefa."
        )


@app.on_event("startup")
async def _start_sla_checker():
    global _sla_checker_started
    if not _sla_checker_started:
        _sla_checker_started = True
        import asyncio
        asyncio.ensure_future(_sla_background_loop())


def _unique_opportunity_name(base_name: str) -> str:
    """Returns base_name, or base_name (1), base_name (2) ... if already taken."""
    existing = load_oportunidades_data()
    existing_names = {str(o.get("nome") or "").strip().lower() for o in existing}
    candidate = base_name.strip()
    if candidate.lower() not in existing_names:
        return candidate
    counter = 1
    while True:
        candidate = f"{base_name.strip()} ({counter})"
        if candidate.lower() not in existing_names:
            return candidate
        counter += 1


# Endpoint para criar oportunidade
@app.post("/oportunidades", status_code=201)
def create_oportunidade(oportunidade: Oportunidade):
    global fake_oportunidades
    with _data_lock:
        fake_oportunidades = load_oportunidades_data()
        new_id = max([o["id"] for o in fake_oportunidades], default=0) + 1
        now = now_iso()
        oportunidade_dict = normalize_oportunidade(oportunidade.dict())
        oportunidade_dict["id"] = new_id
        oportunidade_dict["created_at"] = oportunidade_dict.get("created_at") or now
        oportunidade_dict["createdDate"] = normalize_oportunidade(
            {"createdDate": oportunidade_dict.get("createdDate") or oportunidade_dict["created_at"]}
        )["createdDate"]
        oportunidade_dict["criadoPor"] = oportunidade_dict.get("criadoPor") or "admin"
        fake_oportunidades.append(oportunidade_dict)
        try:
            save_oportunidades_data(fake_oportunidades)
        except Exception as e:
            print(f"[ERRO] Falha ao salvar oportunidades: {e}")
            raise HTTPException(status_code=500, detail=f"Falha ao persistir: {e}")

        # Auto-version: snapshot version 1 if BPMN has nodes
        bpmn = oportunidade_dict.get("bpmn")
        if isinstance(bpmn, dict) and bpmn.get("nodes"):
            ver = _create_bpmn_version(new_id, bpmn)
            oportunidade_dict["bpmn_current_version"] = ver

        print(f"[OK] Oportunidade criada: id={new_id}, nome={oportunidade_dict.get('nome')}, total={len(fake_oportunidades)}")
    
    # Sincroniza contatos para contatos.json
    try:
        _sync_opportunity_contacts_to_independent_table(oportunidade_dict)
    except Exception as e:
        print(f"[WARN] Falha ao sincronizar contatos: {e}")
    
    return oportunidade_dict

# Armazenamento temporário de tokens de recuperação (em memória)
password_reset_tokens = {}

@app.post("/auth/password-lost")
async def password_lost(request: Request):
    data = await request.json()
    email = data.get("login")
    base_url = data.get("url") or os.getenv("FRONTEND_URL", "http://localhost:5173/")
    if not email:
        raise HTTPException(status_code=400, detail="Email obrigatório")

    # Gerar token único e expiração (exemplo: 1 hora)
    token = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(hours=1)
    password_reset_tokens[token] = {"email": email, "expires_at": expires_at.isoformat()}

    # Montar link de recuperação
    recovery_link = f"{base_url}?key={token}&login={email}"

    subject = "Recuperação de senha - BP Company"
    body = f"Olá,\n\nRecebemos uma solicitação de recuperação de senha para este email.\nSe foi você, acesse o link para redefinir sua senha: {recovery_link}\n\nSe não foi você, ignore esta mensagem.\n\nAtenciosamente,\nEquipe BP Company"
    send_mailgun_email(email, subject, body)
    return {"msg": "Se existir, um email foi enviado para recuperação de senha."}

# Endpoint para redefinir senha usando token
@app.post("/auth/password-reset")
async def password_reset(
    login: str = Body(...),
    key: str = Body(...),
    password: str = Body(...)
):
    token_data = password_reset_tokens.get(key)
    if not token_data:
        raise HTTPException(status_code=400, detail="Token de redefinição inválido ou expirado.")
    if token_data["email"].strip().lower() != login.strip().lower():
        raise HTTPException(status_code=400, detail="Token não corresponde ao usuário.")
    expires_at = datetime.fromisoformat(token_data["expires_at"])
    if datetime.utcnow() > expires_at:
        del password_reset_tokens[key]
        raise HTTPException(status_code=400, detail="Token expirado. Solicite nova recuperação.")

    users = load_users_data()
    user_found = False
    for user in users:
        if user["email"].strip().lower() == login.strip().lower():
            user["senha"] = hash_password(password)
            user_found = True
            break
    if not user_found:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    save_users_data(users)
    del password_reset_tokens[key]
    return {"msg": "Senha redefinida com sucesso."}

ENTIDADES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "entidades.json")
USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "users.json")
OPORTUNIDADES_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "oportunidades.json"
)
BPMN_EDITOR_STATE_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bpmn_editor_state.json"
)
AI_AUDIT_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "ai_audit_logs.json"
)
DOCUMENTOS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "documentos.json"
)
LEADS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "leads.json"
)
CONTATOS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "contatos.json"
)
ACTIVITIES_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "activities.json"
)
BPMN_TASKS_CATALOG_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bpmn_tasks_catalog.json"
)
BPMN_CONDICIONAIS_CATALOG_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bpmn_condicionais_catalog.json"
)
REGISTROS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "registros.json"
)
REGISTROS_TABLE = "registros_store"

init_supabase_storage()

# --- Load persisted data or use defaults ---
bpmn_editor_state = {
    "name": "Novo BPMN",
    "nodes": [],
    "connections": [],
    "updated_at": "",
}

fake_entidades = []
fake_oportunidades = []
# Endpoint para listar oportunidades (fake)
@app.get("/oportunidades")
def get_oportunidades(page: int = 1, limit: int = 10, search: str = "", owner: str = "", shared: str = ""):
    global fake_oportunidades
    fake_oportunidades = load_oportunidades_data()
    normalized = [normalize_oportunidade(item) for item in fake_oportunidades]
    if search.strip():
        search_lower = search.strip().lower()
        normalized = [
            item for item in normalized
            if search_lower in (item.get("nome") or item.get("name") or "").lower()
        ]
    if owner.strip():
        owner_lower = owner.strip().lower()
        normalized = [
            item for item in normalized
            if (item.get("criadoPor") or item.get("owner") or "").lower() == owner_lower
        ]
    if shared == "true":
        normalized = [item for item in normalized if item.get("shared")]
    start = (page - 1) * limit
    end = start + limit
    total = len(normalized)
    return {
        "data": normalized[start:end],
        "total": total,
        "page": page,
        "limit": limit
    }


@app.put("/oportunidades/{oportunidade_id}/share")
def toggle_share_oportunidade(oportunidade_id: int, body: dict = Body(...)):
    """Toggle shared flag on an opportunity."""
    global fake_oportunidades
    with _data_lock:
        fake_oportunidades = load_oportunidades_data()
        for opp in fake_oportunidades:
            if opp.get("id") == oportunidade_id:
                opp["shared"] = bool(body.get("shared", False))
                save_oportunidades_data(fake_oportunidades)
                return {"ok": True, "shared": opp["shared"]}
        raise HTTPException(404, "Oportunidade não encontrada")

@app.put("/oportunidades/{oportunidade_id}")
def update_oportunidade(oportunidade_id: int, oportunidade: Oportunidade):
    global fake_oportunidades
    with _data_lock:
        return _update_oportunidade_locked(oportunidade_id, oportunidade)

def _update_oportunidade_locked(oportunidade_id: int, oportunidade: Oportunidade):
    global fake_oportunidades
    fake_oportunidades = load_oportunidades_data()
    oportunidade_payload = oportunidade.dict(exclude_unset=True)
    oportunidade_dict = normalize_oportunidade(oportunidade_payload)

    def merge_bpmn_payload(existing_bpmn, incoming_bpmn, incoming_raw_payload):
        base = existing_bpmn if isinstance(existing_bpmn, dict) else {}

        if incoming_bpmn is None:
            return base

        if not isinstance(incoming_bpmn, dict):
            return base

        merged = {**base, **incoming_bpmn}

        if "nodes" not in incoming_bpmn and "nodes" in base:
            merged["nodes"] = base.get("nodes", [])
        if "connections" not in incoming_bpmn and "connections" in base:
            merged["connections"] = base.get("connections", [])

        if isinstance(incoming_raw_payload, dict) and "bpmn" in incoming_raw_payload:
            raw_bpmn = incoming_raw_payload.get("bpmn")
            if isinstance(raw_bpmn, dict):
                if "nodes" in raw_bpmn:
                    merged["nodes"] = incoming_bpmn.get("nodes", [])
                if "connections" in raw_bpmn:
                    merged["connections"] = incoming_bpmn.get("connections", [])

        return merged

    for idx, existing in enumerate(fake_oportunidades):
        if existing["id"] == oportunidade_id:
            merged = {**existing, **oportunidade_dict}

            merged["id"] = oportunidade_id
            merged["created_at"] = (
                merged.get("created_at")
                or existing.get("created_at")
                or now_iso()
            )
            merged["createdDate"] = (
                merged.get("createdDate")
                or existing.get("createdDate")
                or merged["created_at"]
            )
            merged["createdDate"] = normalize_oportunidade(
                {"createdDate": merged["createdDate"]}
            )["createdDate"]

            existing_bpmn = existing.get("bpmn")
            incoming_bpmn = oportunidade_dict.get("bpmn")
            merged["bpmn"] = merge_bpmn_payload(
                existing_bpmn,
                incoming_bpmn,
                oportunidade_payload,
            )

            # Auto-version: if BPMN nodes/connections changed, snapshot a new version
            _bpmn_changed = False
            if incoming_bpmn and isinstance(incoming_bpmn, dict):
                old_nodes = (existing_bpmn or {}).get("nodes") if isinstance(existing_bpmn, dict) else []
                old_conns = (existing_bpmn or {}).get("connections") if isinstance(existing_bpmn, dict) else []
                new_nodes = merged["bpmn"].get("nodes") or []
                new_conns = merged["bpmn"].get("connections") or []
                if json.dumps(old_nodes, sort_keys=True) != json.dumps(new_nodes, sort_keys=True) or \
                   json.dumps(old_conns, sort_keys=True) != json.dumps(new_conns, sort_keys=True):
                    _bpmn_changed = True

            fake_oportunidades[idx] = merged
            try:
                save_oportunidades_data(fake_oportunidades)
            except Exception as e:
                print(f"[ERRO] Falha ao salvar oportunidades (update): {e}")
                raise HTTPException(status_code=500, detail=f"Falha ao persistir: {e}")
            
            # Sincroniza contatos para contatos.json
            try:
                _sync_opportunity_contacts_to_independent_table(merged)
            except Exception as e:
                print(f"[WARN] Falha ao sincronizar contatos: {e}")

            # Create version snapshot after save (outside main lock to avoid deadlock)
            if _bpmn_changed and merged.get("bpmn"):
                ver = _create_bpmn_version(oportunidade_id, merged["bpmn"])
                merged["bpmn_current_version"] = ver
                print(f"[OK] BPMN versão {ver} criada para oportunidade {oportunidade_id}")
                _new_node_count = len(merged["bpmn"].get("nodes") or [])
                _new_conn_count = len(merged["bpmn"].get("connections") or [])
                _append_opportunity_timeline(oportunidade_id, [{
                    "title": "BPMN atualizado",
                    "description": f"Estrutura do BPMN foi alterada (versão {ver}, {_new_node_count} nós, {_new_conn_count} conexões)",
                    "actionType": "update",
                    "elementType": "bpmn",
                    "itemName": "BPMN",
                }])

            print(f"[OK] Oportunidade atualizada: id={oportunidade_id}, nome={merged.get('nome')}")
            return merged

    oportunidade_dict["id"] = oportunidade_id
    oportunidade_dict["created_at"] = oportunidade_dict.get("created_at") or now_iso()
    oportunidade_dict["createdDate"] = (
        oportunidade_dict.get("createdDate")
        or oportunidade_dict["created_at"]
    )
    oportunidade_dict["createdDate"] = normalize_oportunidade(
        {"createdDate": oportunidade_dict["createdDate"]}
    )["createdDate"]
    fake_oportunidades.append(oportunidade_dict)
    save_oportunidades_data(fake_oportunidades)
    
    # Sincroniza contatos para contatos.json
    try:
        _sync_opportunity_contacts_to_independent_table(oportunidade_dict)
    except Exception as e:
        print(f"[WARN] Falha ao sincronizar contatos: {e}")
    
    return oportunidade_dict

@app.delete("/oportunidades/{oportunidade_id}", status_code=204)
def delete_oportunidade(oportunidade_id: int):
    global fake_oportunidades
    with _data_lock:
        fake_oportunidades = load_oportunidades_data()
        idx = next(
            (i for i, oportunidade in enumerate(fake_oportunidades) if oportunidade["id"] == oportunidade_id),
            None,
        )
        if idx is None:
            raise HTTPException(status_code=404, detail="Oportunidade não encontrada")

        # ── Preservar nós de task e condicional no catálogo antes de deletar ──
        opp = fake_oportunidades[idx]
        opp_name = opp.get("name") or opp.get("nome") or ""
        bpmn_nodes = []
        bpmn_data = opp.get("bpmn")
        if isinstance(bpmn_data, dict):
            bpmn_nodes = bpmn_data.get("nodes") or []
        elif isinstance(opp.get("stages"), list):
            bpmn_nodes = opp.get("stages") or []

        tasks_catalog = load_bpmn_tasks_catalog()
        condicionais_catalog = load_bpmn_condicionais_catalog()

        # Índice por (opp_name, node_nome) para dedup
        existing_tasks_keys = {
            (str(t.get("_oppName") or "").strip(), str(t.get("taskNome") or t.get("label") or "").strip())
            for t in tasks_catalog
        }
        existing_cond_keys = {
            (str(c.get("_oppName") or "").strip(), str(c.get("condicionalNome") or c.get("label") or "").strip())
            for c in condicionais_catalog
        }

        for node in bpmn_nodes:
            node_type = str(node.get("nodeType") or node.get("type") or "").strip()
            if node_type == "task":
                nome = str(node.get("taskNome") or node.get("label") or "").strip()
                key = (opp_name.strip(), nome)
                if nome and key not in existing_tasks_keys:
                    tasks_catalog.append({**node, "_oppName": opp_name, "_oppId": opp.get("id"), "_preserved": True})
                    existing_tasks_keys.add(key)
            elif node_type == "condicional":
                nome = str(node.get("condicionalNome") or node.get("label") or "").strip()
                key = (opp_name.strip(), nome)
                if nome and key not in existing_cond_keys:
                    condicionais_catalog.append({**node, "_oppName": opp_name, "_oppId": opp.get("id"), "_preserved": True})
                    existing_cond_keys.add(key)

        save_bpmn_tasks_catalog(tasks_catalog)
        save_bpmn_condicionais_catalog(condicionais_catalog)
        # ─────────────────────────────────────────────────────────────────────

        fake_oportunidades.pop(idx)
        save_oportunidades_data(fake_oportunidades)
    return


# ─────────────────────────────────────────────────────────────────────────────
# Leads CRUD Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/leads")
async def get_leads(page: int = 1, limit: int = 50, search: str = ""):
    """Retorna lista de leads com paginação opcional"""
    leads = load_leads_data()

    for lead in leads:
        if "bpmn_generated" not in lead:
            lead["bpmn_generated"] = False
        if "bpmn_generated_at" not in lead:
            lead["bpmn_generated_at"] = None
        if "bpmn_analysis" not in lead:
            lead["bpmn_analysis"] = None
    
    if search:
        search_lower = search.lower()
        leads = [l for l in leads if 
                 search_lower in l.get("nome", "").lower() or
                 search_lower in l.get("email", "").lower() or
                 search_lower in l.get("empresa", "").lower()]
    
    total = len(leads)
    start = (page - 1) * limit
    paginated = leads[start:start + limit]
    
    return {
        "leads": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@app.post("/api/leads")
async def create_lead(lead: Lead):
    """Cria um novo lead"""
    leads = load_leads_data()
    
    new_lead = {
        "id": str(uuid.uuid4()),
        "nome": lead.nome,
        "email": lead.email,
        "telefone": lead.telefone,
        "empresa": lead.empresa,
        "cargo": lead.cargo,
        "origem": lead.origem or "website",
        "stage": "novo",
        "valor_estimado": lead.valor_estimado,
        "descricao": lead.descricao,
        "responsavel": lead.responsavel,
        "data_criacao": datetime.now(timezone.utc).isoformat(),
        "data_contato": None,
        "notas": [],
        "ativo": True,
        "opp_id": None,
        "bpmn_generated": False,
        "bpmn_generated_at": None,
        "bpmn_analysis": None,
    }
    
    leads.append(new_lead)
    save_leads_data(leads)
    
    return {"success": True, "lead": new_lead}


@app.get("/api/leads/{lead_id}")
async def get_lead(lead_id: str):
    """Retorna um lead específico"""
    leads = load_leads_data()
    lead = next((l for l in leads if l["id"] == lead_id), None)
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    
    return {"lead": lead}


@app.put("/api/leads/{lead_id}")
async def update_lead(lead_id: str, lead: Lead):
    """Atualiza um lead"""
    leads = load_leads_data()
    lead_obj = next((l for l in leads if l["id"] == lead_id), None)
    
    if not lead_obj:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    
    lead_obj.update({
        "nome": lead.nome or lead_obj.get("nome"),
        "email": lead.email or lead_obj.get("email"),
        "telefone": lead.telefone or lead_obj.get("telefone"),
        "empresa": lead.empresa or lead_obj.get("empresa"),
        "cargo": lead.cargo or lead_obj.get("cargo"),
        "origem": lead.origem or lead_obj.get("origem"),
        "stage": lead.stage or lead_obj.get("stage"),
        "valor_estimado": lead.valor_estimado or lead_obj.get("valor_estimado"),
        "descricao": lead.descricao or lead_obj.get("descricao"),
        "responsavel": lead.responsavel or lead_obj.get("responsavel"),
    })
    
    save_leads_data(leads)
    return {"success": True, "lead": lead_obj}


@app.delete("/api/leads/{lead_id}")
async def delete_lead(lead_id: str):
    """Deleta um lead"""
    leads = load_leads_data()
    leads = [l for l in leads if l["id"] != lead_id]
    save_leads_data(leads)
    
    return {"success": True}


@app.post("/api/leads/{lead_id}/convert-to-opp")
async def convert_lead_to_opportunity(lead_id: str):
    """Converte um lead em oportunidade"""
    leads = load_leads_data()
    lead = next((l for l in leads if l["id"] == lead_id), None)
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    
    if lead.get("stage") == "convertido":
        raise HTTPException(status_code=400, detail="Lead já foi convertido")

    if not bool(lead.get("bpmn_generated")):
        raise HTTPException(
            status_code=400,
            detail="Gere o BPMN com IA para este prospecto antes de converter para oportunidade.",
        )
    
    # Cria oportunidade baseada no lead
    fake_oportunidades = load_oportunidades_data()
    
    new_opp = {
        "id": len(fake_oportunidades) + 1,
        "nome": f"Oportunidade - {lead['nome']}",
        "empresa": lead.get("empresa"),
        "valor": lead.get("valor_estimado"),
        "etapa": "qualificação",
        "responsavel": lead.get("responsavel"),
        "descricao": f"Convertido do lead: {lead['nome']}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_lead_id": lead_id,
        "ativo": True,
        "owner": lead.get("responsavel"),
        "lead_bpmn": lead.get("bpmn_analysis"),
    }
    
    fake_oportunidades.append(new_opp)
    save_oportunidades_data(fake_oportunidades)
    
    # Atualiza lead como convertido
    lead["stage"] = "convertido"
    lead["opp_id"] = str(new_opp["id"])
    save_leads_data(leads)
    
    return {"success": True, "lead": lead, "opportunity": new_opp}


@app.post("/api/leads/{lead_id}/generate-bpmn")
async def generate_lead_bpmn(lead_id: str):
    """Gera um BPMN orientado por IA para o prospecto antes da conversão."""
    leads = load_leads_data()
    lead = next((l for l in leads if l["id"] == lead_id), None)

    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    lead_nome = str(lead.get("nome") or "Prospecto").strip()
    lead_empresa = str(lead.get("empresa") or "Empresa não informada").strip()
    lead_stage = str(lead.get("stage") or "novo").strip()
    lead_descricao = str(lead.get("descricao") or "").strip()
    lead_origem = str(lead.get("origem") or "website").strip()

    base_context = (
        f"Prospecto: {lead_nome}\n"
        f"Empresa: {lead_empresa}\n"
        f"Stage atual: {lead_stage}\n"
        f"Origem: {lead_origem}\n"
        f"Descrição: {lead_descricao or 'Sem descrição detalhada'}"
    )

    if AI_PROVIDER != "groq" or not GROQ_API_KEY:
        fallback_bpmn = {
            "processo": f"Conversão de Prospecto - {lead_nome}",
            "etapas": [
                "Receber lead",
                "Qualificar lead",
                "Realizar contato inicial",
                "Validar interesse",
                "Converter para oportunidade",
            ],
            "riscos": ["Contato sem retorno", "Baixa aderência de perfil"],
            "proximo_passo": "Agendar reunião de qualificação",
            "fonte": "fallback",
        }
        lead["bpmn_generated"] = True
        lead["bpmn_generated_at"] = datetime.now(timezone.utc).isoformat()
        lead["bpmn_analysis"] = fallback_bpmn
        save_leads_data(leads)
        return {"success": True, "lead": lead, "bpmn": fallback_bpmn}

    system_prompt = (
        "Você é especialista em BPMN comercial para pré-vendas. "
        "A partir do contexto de um prospecto, gere um fluxo BPMN textual objetivo. "
        "Retorne JSON válido com as chaves: processo, etapas (array de strings em ordem), "
        "riscos (array de strings), proximo_passo (string curta)."
    )

    user_prompt = (
        f"Contexto do prospecto:\n{base_context}\n\n"
        "Monte um fluxo BPMN comercial desde qualificação até decisão de conversão para oportunidade."
    )

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
            timeout=AI_LLM_TIMEOUT_SECONDS,
        )

        if resp.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Limite de requisições da IA atingido. Tente novamente em alguns instantes.",
            )
        if not resp.ok:
            raise RuntimeError(f"Groq HTTP {resp.status_code}")

        raw_json = resp.json()
        content = raw_json.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            parsed = {}

        bpmn_payload = {
            "processo": str(parsed.get("processo") or f"Conversão de Prospecto - {lead_nome}").strip()[:120],
            "etapas": [
                str(item).strip()[:90]
                for item in (parsed.get("etapas") or [])
                if isinstance(item, str) and str(item).strip()
            ][:12],
            "riscos": [
                str(item).strip()[:90]
                for item in (parsed.get("riscos") or [])
                if isinstance(item, str) and str(item).strip()
            ][:8],
            "proximo_passo": str(parsed.get("proximo_passo") or "Validar critérios de qualificação").strip()[:140],
            "fonte": "groq",
        }

        if not bpmn_payload["etapas"]:
            bpmn_payload["etapas"] = [
                "Receber lead",
                "Qualificar lead",
                "Realizar contato inicial",
                "Definir próximos passos",
                "Converter para oportunidade",
            ]

        lead["bpmn_generated"] = True
        lead["bpmn_generated_at"] = datetime.now(timezone.utc).isoformat()
        lead["bpmn_analysis"] = bpmn_payload
        save_leads_data(leads)

        return {"success": True, "lead": lead, "bpmn": bpmn_payload}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível gerar BPMN com IA: {exc}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# CONTATOS CRUD Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/contatos")
async def list_contatos(page: int = 1, limit: int = 50, search: str = "", empresa: str = ""):
    """Lista contatos com paginação e filtros"""
    contatos = load_contatos_data()
    
    # Filtro por busca de texto (nome, email, telefone)
    if search.strip():
        search_lower = search.lower()
        contatos = [
            c for c in contatos
            if search_lower in (c.get("nome") or "").lower()
            or search_lower in (c.get("email") or "").lower()
            or search_lower in (c.get("telefone") or "").lower()
        ]
    
    # Filtro por empresa
    if empresa.strip():
        empresa_lower = empresa.lower()
        contatos = [
            c for c in contatos
            if empresa_lower in (c.get("empresa") or "").lower()
        ]
    
    # Filtrar apenas ativos
    contatos = [c for c in contatos if c.get("ativo", True)]
    
    # Paginação
    total = len(contatos)
    start = (page - 1) * limit
    paginated = contatos[start:start + limit]
    
    return {
        "contatos": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@app.post("/api/contatos", status_code=201)
async def create_contato(contato: Contato):
    """Cria um novo contato"""
    contatos = load_contatos_data()
    
    new_contato = {
        "id": max([int(c.get("id", 0)) for c in contatos], default=0) + 1,
        "nome": contato.nome,
        "cargo": contato.cargo or "",
        "email": contato.email or "",
        "telefone": contato.telefone or "",
        "empresa": contato.empresa or "",
        "descricao": contato.descricao or "",
        "notas": contato.notas or "",
        "isPrimary": contato.isPrimary,
        "entidadeId": contato.entidadeId,
        "entidadeNome": contato.entidadeNome,
        "opportunityId": contato.opportunityId,
        "opportunityName": contato.opportunityName,
        "ativo": contato.ativo,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "criadoPor": "API",
    }
    
    contatos.append(new_contato)
    save_contatos_data(contatos)
    
    return {"success": True, "contato": new_contato}


@app.get("/api/contatos/{contato_id}")
async def get_contato(contato_id: int):
    """Retorna um contato específico"""
    contatos = load_contatos_data()
    contato = next((c for c in contatos if c.get("id") == contato_id), None)
    
    if not contato:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    return {"contato": contato}


@app.put("/api/contatos/{contato_id}")
async def update_contato(contato_id: int, contato: Contato):
    """Atualiza um contato"""
    contatos = load_contatos_data()
    contato_obj = next((c for c in contatos if c.get("id") == contato_id), None)
    
    if not contato_obj:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    # Atualizar apenas campos fornecidos
    contato_obj.update({
        "nome": contato.nome or contato_obj.get("nome"),
        "cargo": contato.cargo or contato_obj.get("cargo"),
        "email": contato.email or contato_obj.get("email"),
        "telefone": contato.telefone or contato_obj.get("telefone"),
        "empresa": contato.empresa or contato_obj.get("empresa"),
        "descricao": contato.descricao or contato_obj.get("descricao"),
        "notas": contato.notas or contato_obj.get("notas"),
        "isPrimary": contato.isPrimary if contato.isPrimary is not None else contato_obj.get("isPrimary"),
        "entidadeId": contato.entidadeId if contato.entidadeId is not None else contato_obj.get("entidadeId"),
        "entidadeNome": contato.entidadeNome or contato_obj.get("entidadeNome"),
        "opportunityId": contato.opportunityId if contato.opportunityId is not None else contato_obj.get("opportunityId"),
        "opportunityName": contato.opportunityName or contato_obj.get("opportunityName"),
        "ativo": contato.ativo if contato.ativo is not None else contato_obj.get("ativo"),
        "updated_at": now_iso(),
    })
    
    save_contatos_data(contatos)
    return {"success": True, "contato": contato_obj}


@app.delete("/api/contatos/{contato_id}", status_code=204)
async def delete_contato(contato_id: int):
    """Deleta um contato (soft delete - marca como inativo)"""
    contatos = load_contatos_data()
    contato_obj = next((c for c in contatos if c.get("id") == contato_id), None)
    
    if not contato_obj:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    # Soft delete
    contato_obj["ativo"] = False
    contato_obj["updated_at"] = now_iso()
    
    save_contatos_data(contatos)


@app.post("/api/contatos/{contato_id}/restore", status_code=200)
async def restore_contato(contato_id: int):
    """Restaura um contato deletado (inativo)"""
    contatos = load_contatos_data()
    contato_obj = next((c for c in contatos if c.get("id") == contato_id), None)
    
    if not contato_obj:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    contato_obj["ativo"] = True
    contato_obj["updated_at"] = now_iso()
    
    save_contatos_data(contatos)
    return {"success": True, "contato": contato_obj}


@app.get("/api/contatos/by-entidade/{entidade_id}")
async def get_contatos_by_entidade(entidade_id: int):
    """Retorna todos os contatos de uma entidade"""
    contatos = load_contatos_data()
    filtered = [c for c in contatos if c.get("entidadeId") == entidade_id and c.get("ativo", True)]
    
    return {
        "contatos": filtered,
        "total": len(filtered)
    }


@app.get("/api/contatos/by-opportunity/{opportunity_id}")
async def get_contatos_by_opportunity(opportunity_id: int):
    """Retorna todos os contatos de uma oportunidade"""
    contatos = load_contatos_data()
    filtered = [c for c in contatos if c.get("opportunityId") == opportunity_id and c.get("ativo", True)]
    
    return {
        "contatos": filtered,
        "total": len(filtered)
    }


# ─────────────────────────────────────────────────────────────────────────────
# BPMN TASKS / CONDICIONAIS CATALOG (preserved after BPMN deletion)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/bpmn-catalog/tasks")
def get_bpmn_tasks_catalog():
    """Retorna catálogo de nós de atividade preservados após deleção de BPMNs."""
    return load_bpmn_tasks_catalog()


@app.delete("/api/bpmn-catalog/tasks/{node_id}", status_code=204)
def delete_bpmn_task_catalog_entry(node_id: str):
    """Remove uma entrada do catálogo de atividades."""
    catalog = load_bpmn_tasks_catalog()
    catalog = [n for n in catalog if str(n.get("id") or "") != node_id]
    save_bpmn_tasks_catalog(catalog)
    return


@app.get("/api/bpmn-catalog/condicionais")
def get_bpmn_condicionais_catalog():
    """Retorna catálogo de nós de condicional preservados após deleção de BPMNs."""
    return load_bpmn_condicionais_catalog()


@app.delete("/api/bpmn-catalog/condicionais/{node_id}", status_code=204)
def delete_bpmn_condicional_catalog_entry(node_id: str):
    """Remove uma entrada do catálogo de condicionais."""
    catalog = load_bpmn_condicionais_catalog()
    catalog = [n for n in catalog if str(n.get("id") or "") != node_id]
    save_bpmn_condicionais_catalog(catalog)
    return


# ─────────────────────────────────────────────────────────────────────────────
# ATIVIDADES (Timeline/Activities)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/activities")
async def get_activities(page: int = 1, limit: int = 50, entity_type: str = "", entity_id: str = ""):
    """Retorna lista de atividades com filtros opcionais"""
    activities = load_activities_data()
    
    if entity_type and entity_id:
        activities = [a for a in activities if 
                     a.get("entidade_tipo") == entity_type and 
                     a.get("entidade_id") == entity_id]
    
    # Ordena por data mais recente
    activities.sort(key=lambda x: x.get("data_atividade", x.get("data_criacao", "")), reverse=True)
    
    total = len(activities)
    start = (page - 1) * limit
    paginated = activities[start:start + limit]
    
    return {
        "activities": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@app.post("/api/activities")
async def create_activity(activity: Activity):
    """Cria uma nova atividade"""
    activities = load_activities_data()
    
    new_activity = {
        "id": str(uuid.uuid4()),
        "titulo": activity.titulo,
        "referencia": activity.referencia,
        "descricao": activity.descricao,
        "tipo": activity.tipo or "nota",
        "data_atividade": activity.data_atividade or datetime.now(timezone.utc).isoformat(),
        "responsavel": activity.responsavel,
        "usuario_criador": activity.usuario_criador,
        "entidade_tipo": activity.entidade_tipo,
        "entidade_id": activity.entidade_id,
        "status": activity.status or "planejado",
        "resultado": activity.resultado,
        "proximos_passos": activity.proximos_passos,
        "duracao_minutos": activity.duracao_minutos,
        "local": activity.local,
        "participantes": activity.participantes or [],
        "data_criacao": datetime.now(timezone.utc).isoformat(),
        "data_atualizacao": datetime.now(timezone.utc).isoformat(),
        "anexos": activity.anexos or [],
        "tags": activity.tags or []
    }
    
    activities.append(new_activity)
    save_activities_data(activities)
    
    return {"success": True, "activity": new_activity}


@app.get("/api/activities/{activity_id}")
async def get_activity(activity_id: str):
    """Retorna uma atividade específica"""
    activities = load_activities_data()
    activity = next((a for a in activities if a["id"] == activity_id), None)
    
    if not activity:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    
    return {"activity": activity}


@app.put("/api/activities/{activity_id}")
async def update_activity(activity_id: str, activity: Activity):
    """Atualiza uma atividade"""
    activities = load_activities_data()
    activity_obj = next((a for a in activities if a["id"] == activity_id), None)
    
    if not activity_obj:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    
    activity_obj.update({
        "titulo": activity.titulo or activity_obj.get("titulo"),
        "referencia": activity.referencia if activity.referencia is not None else activity_obj.get("referencia"),
        "descricao": activity.descricao or activity_obj.get("descricao"),
        "tipo": activity.tipo or activity_obj.get("tipo"),
        "data_atividade": activity.data_atividade or activity_obj.get("data_atividade"),
        "responsavel": activity.responsavel or activity_obj.get("responsavel"),
        "status": activity.status or activity_obj.get("status"),
        "resultado": activity.resultado or activity_obj.get("resultado"),
        "proximos_passos": activity.proximos_passos or activity_obj.get("proximos_passos"),
        "duracao_minutos": activity.duracao_minutos or activity_obj.get("duracao_minutos"),
        "local": activity.local or activity_obj.get("local"),
        "participantes": activity.participantes or activity_obj.get("participantes"),
        "tags": activity.tags or activity_obj.get("tags"),
        "data_atualizacao": datetime.now(timezone.utc).isoformat()
    })
    
    save_activities_data(activities)
    return {"success": True, "activity": activity_obj}


@app.delete("/api/activities/{activity_id}")
async def delete_activity(activity_id: str):
    """Deleta uma atividade"""
    activities = load_activities_data()
    activities = [a for a in activities if a["id"] != activity_id]
    save_activities_data(activities)
    
    return {"success": True}


@app.get("/api/activities/entity/{entity_type}/{entity_id}")
async def get_entity_activities(entity_type: str, entity_id: str, limit: int = 20):
    """Retorna timeline de atividades de uma entidade específica"""
    activities = load_activities_data()
    
    entity_activities = [a for a in activities if 
                        a.get("entidade_tipo") == entity_type and 
                        a.get("entidade_id") == entity_id]
    
    # Ordena por data mais recente
    entity_activities.sort(key=lambda x: x.get("data_atividade", x.get("data_criacao", "")), reverse=True)
    
    return {
        "activities": entity_activities[:limit],
        "total": len(entity_activities)
    }


# ─────────────────────────────────────────────────────────────────────────────
# SLA & Metrics System
# ─────────────────────────────────────────────────────────────────────────────

# Default SLA (hours) when a BPMN node does not specify one
_DEFAULT_SLA_HOURS = 24

SLA_LOG_TABLE = "sla_violations_store"
SLA_LOG_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "sla_violations.json"
)


def load_sla_violations() -> list[dict]:
    return load_collection(SLA_LOG_FILE, SLA_LOG_TABLE, [])


def save_sla_violations(rows: list[dict]):
    save_collection(SLA_LOG_FILE, SLA_LOG_TABLE, rows)


def _parse_iso(s: str | None) -> datetime | None:
    """Parse an ISO-8601 string (with or without microseconds)."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _compute_sla_hours(node: dict) -> float | None:
    """Extract SLA hours from a BPMN node definition.

    Looks for slaHours / sla_hours / sla in the node dict.
    Returns None if no SLA set (infinite time allowed).
    """
    for key in ("slaHours", "sla_hours", "sla"):
        val = node.get(key)
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                continue
    return None


def _compute_due_at(created_at: str, sla_hours: float | None) -> str | None:
    """Given a creation timestamp and SLA hours, return the deadline ISO string."""
    if sla_hours is None:
        return None
    dt = _parse_iso(created_at)
    if not dt:
        return None
    return (dt + timedelta(hours=sla_hours)).isoformat()


def _task_duration_seconds(task: dict) -> float | None:
    """Compute duration in seconds between createdAt and completedAt."""
    start = _parse_iso(task.get("createdAt"))
    end = _parse_iso(task.get("completedAt"))
    if start and end:
        return (end - start).total_seconds()
    return None


def _record_sla_violation(task: dict, now_str: str):
    """Record an SLA violation for a task."""
    with _data_lock:
        violations = load_sla_violations()
        # Avoid duplicates
        if any(v.get("taskId") == task.get("taskId") for v in violations):
            return
        violations.append({
            "id": max((v.get("id", 0) for v in violations), default=0) + 1,
            "taskId": task.get("taskId"),
            "opportunityId": task.get("opportunityId"),
            "nodeId": task.get("nodeId"),
            "label": task.get("label"),
            "dueAt": task.get("dueAt"),
            "detectedAt": now_str,
            "assignee": task.get("assignee"),
            "slaHours": task.get("slaHours"),
            "status": "open",  # open | resolved | dismissed
        })
        save_sla_violations(violations)
    emit_event("sla_violation", {
        "taskId": task.get("taskId"),
        "opportunityId": task.get("opportunityId"),
        "label": task.get("label"),
        "dueAt": task.get("dueAt"),
    })


def check_sla_violations():
    """Scan pending tasks and record violations for any past-due items.

    Called lazily from SLA endpoints (no background scheduler needed).
    """
    now = datetime.now()
    now_str = now.isoformat()
    tasks = load_workflow_tasks()
    for t in tasks:
        if t.get("status") != "pending":
            continue
        due = _parse_iso(t.get("dueAt"))
        if due and now > due:
            _record_sla_violation(t, now_str)


# ─────────────────────────────────────────────────────────────────────────────
# Task Queue Abstraction (local + Celery/Redis)
# ─────────────────────────────────────────────────────────────────────────────

class _LocalQueue:
    """Synchronous in-process task queue (default — no external deps)."""

    def enqueue(self, func, *args, **kwargs):
        """Execute func immediately in a daemon thread."""
        t = threading.Thread(target=func, args=args, kwargs=kwargs, daemon=True)
        t.start()
        return {"queue": "local", "thread": t.name}


class _CeleryQueue:
    """Celery-backed distributed task queue (activated when CELERY_BROKER_URL is set)."""

    def __init__(self, broker_url: str):
        try:
            from celery import Celery  # type: ignore[import-not-found]
            self.celery_app = Celery("bp_company", broker=broker_url)
            self.celery_app.conf.update(
                task_serializer="json",
                result_serializer="json",
                accept_content=["json"],
                timezone="America/Sao_Paulo",
                enable_utc=True,
                task_track_started=True,
                task_acks_late=True,
                worker_prefetch_multiplier=1,
            )
            self._available = True
            print(f"[QUEUE] Celery conectado ao broker: {broker_url}")
        except Exception as exc:
            print(f"[QUEUE] Falha ao conectar Celery: {exc}. Usando fila local.")
            self._available = False
            self._fallback = _LocalQueue()

    def enqueue(self, func, *args, **kwargs):
        if not self._available:
            return self._fallback.enqueue(func, *args, **kwargs)
        task_name = f"bp_company.{func.__name__}"
        # Register the function as a Celery task (idempotent)
        if task_name not in self.celery_app.tasks:
            self.celery_app.task(name=task_name)(func)
        result = self.celery_app.send_task(task_name, args=args, kwargs=kwargs)
        return {"queue": "celery", "task_id": result.id}


def _init_task_queue():
    """Initialize the task queue based on environment configuration."""
    broker = os.environ.get("CELERY_BROKER_URL", "").strip()
    if broker:
        return _CeleryQueue(broker)
    return _LocalQueue()


task_queue = _init_task_queue()


# ─────────────────────────────────────────────────────────────────────────────
# Workflow Execution Service (decoupled from HTTP layer)
# ─────────────────────────────────────────────────────────────────────────────

class WorkflowExecutor:
    """Encapsulates workflow execution logic independently of FastAPI.

    Can be invoked from HTTP endpoints, Celery tasks, CLI scripts, or tests.
    """

    @staticmethod
    def start(op_id: int, context: dict | None = None) -> dict:
        """Start a workflow for the given opportunity. Returns engine result."""
        opp = _find_opportunity(op_id)
        current_version = _get_current_bpmn_version(opp)
        bpmn = _get_bpmn(opp)
        engine = WorkflowEngine(bpmn)

        start_id = engine.find_start_node()
        if not start_id:
            raise ValueError("BPMN não possui nó de início")

        if not (opp.get("bpmn_versions") or []):
            current_version = _create_bpmn_version(op_id, bpmn)

        _cancel_tasks_for_workflow(op_id)

        ctx = context or {}
        result = engine.run(start_id, ctx)

        _save_workflow_state(op_id, {
            "currentNodeId": result.get("currentNodeId"),
            "executed": result.get("executed", []),
            "context": ctx,
            "status": result["status"],
            "bpmn_version": current_version,
            "startedAt": now_iso(),
        })

        emit_event("workflow_started", {
            "opportunityId": op_id,
            "bpmnVersion": current_version,
            "status": result["status"],
        })

        current = result.get("currentNodeId")
        if current and result.get("paused_reason") == "user_input":
            node = engine.nodes.get(current, {})
            _create_user_task(op_id, current, node)

        return {
            "engine": engine,
            "result": result,
            "bpmn_version": current_version,
        }

    @staticmethod
    def advance(op_id: int, node_id: str | None = None,
                decision: str | None = None, completed: bool = False,
                form_data: dict | None = None) -> dict:
        """Advance a workflow from its current paused state."""
        opp = _find_opportunity(op_id)
        state = _load_workflow_state(op_id)
        if not state:
            raise ValueError("Workflow não foi iniciado.")

        inst_version = state.get("bpmn_version")
        bpmn = _get_bpmn(opp, inst_version)

        if completed and node_id:
            pending = _get_pending_task(op_id, node_id)
            if pending:
                form_schema = pending.get("formSchema") or []
                if form_schema and form_data:
                    validation_errors = _validate_form_data(form_data, form_schema)
                    if validation_errors:
                        raise ValueError(f"Dados inválidos: {validation_errors}")
                _complete_user_task(pending["taskId"], form_data=form_data)

        context = dict(state.get("context") or {})
        if decision:
            context[f"decision_{node_id}"] = decision
        if completed:
            context[f"completed_{node_id}"] = True
        if form_data:
            context.update(form_data)
            form_responses = context.get("form_responses") or {}
            form_responses[node_id] = form_data
            context["form_responses"] = form_responses

        engine = WorkflowEngine(bpmn)
        start_id = engine.find_start_node()
        result = engine.run(start_id, context)

        _save_workflow_state(op_id, {
            "currentNodeId": result.get("currentNodeId"),
            "executed": result.get("executed", []),
            "context": context,
            "status": result["status"],
            "startedAt": state.get("startedAt"),
        })

        current = result.get("currentNodeId")
        if current and result.get("paused_reason") == "user_input":
            existing = _get_pending_task(op_id, current)
            if not existing:
                node = engine.nodes.get(current, {})
                _create_user_task(op_id, current, node)

        stage_index = engine.node_index(current) if current else len(engine.active_node_ids_in_order())
        with _data_lock:
            opps = load_oportunidades_data()
            for o in opps:
                if o.get("id") == op_id:
                    o["stageIndex"] = stage_index
                    o["currentNodeId"] = current
                    o["bpmnCurrentNodeId"] = current
                    o["activeNodeId"] = current
                    if result["status"] == "completed":
                        o["status"] = "Concluído"
                    break
            save_oportunidades_data(opps)

        if result["status"] == "completed":
            emit_event("workflow_completed", {
                "opportunityId": op_id,
                "bpmnVersion": inst_version,
                "executedCount": len(result.get("executed", [])),
            })
        elif result.get("paused_reason"):
            emit_event("workflow_paused", {
                "opportunityId": op_id,
                "currentNodeId": current,
                "pausedReason": result.get("paused_reason"),
            })
        else:
            emit_event("workflow_advanced", {
                "opportunityId": op_id,
                "currentNodeId": current,
                "status": result["status"],
            })

        return {
            "engine": engine,
            "result": result,
            "bpmn_version": inst_version,
        }


workflow_executor = WorkflowExecutor()


# ─────────────────────────────────────────────────────────────────────────────
# Event System & Webhooks
# ─────────────────────────────────────────────────────────────────────────────

WEBHOOKS_TABLE = "webhooks_store"
WEBHOOKS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "webhooks.json"
)

EVENT_LOG_TABLE = "event_log_store"
EVENT_LOG_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "event_log.json"
)

DELIVERY_LOG_TABLE = "delivery_log_store"
DELIVERY_LOG_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "webhook_deliveries.json"
)

# Maximum event log entries kept in storage
_EVENT_LOG_MAX = 500
_DELIVERY_LOG_MAX = 1000

# Default retry config (can be overridden per-webhook)
_DEFAULT_RETRY_MAX = 3
_DEFAULT_RETRY_DELAY = 2       # seconds (base for exponential backoff)
_DEFAULT_RETRY_BACKOFF = 2.0   # multiplier


def load_webhooks() -> list[dict]:
    return load_collection(WEBHOOKS_FILE, WEBHOOKS_TABLE, [])


def save_webhooks(rows: list[dict]):
    save_collection(WEBHOOKS_FILE, WEBHOOKS_TABLE, rows)


def load_event_log() -> list[dict]:
    return load_collection(EVENT_LOG_FILE, EVENT_LOG_TABLE, [])


def save_event_log(rows: list[dict]):
    save_collection(EVENT_LOG_FILE, EVENT_LOG_TABLE, rows)


def load_delivery_log() -> list[dict]:
    return load_collection(DELIVERY_LOG_FILE, DELIVERY_LOG_TABLE, [])


def save_delivery_log(rows: list[dict]):
    save_collection(DELIVERY_LOG_FILE, DELIVERY_LOG_TABLE, rows)


def _next_delivery_id() -> int:
    log = load_delivery_log()
    return max((d.get("id", 0) for d in log), default=0) + 1


def _record_delivery(delivery: dict):
    """Append a delivery record and trim to max."""
    with _data_lock:
        log = load_delivery_log()
        # Update existing or append
        existing = next((d for d in log if d.get("id") == delivery["id"]), None)
        if existing:
            existing.update(delivery)
        else:
            log.append(delivery)
        if len(log) > _DELIVERY_LOG_MAX:
            log = log[-_DELIVERY_LOG_MAX:]
        save_delivery_log(log)


def _deliver_webhook(url: str, secret: str, payload: dict,
                     webhook_id: int = 0,
                     max_retries: int = _DEFAULT_RETRY_MAX,
                     retry_delay: float = _DEFAULT_RETRY_DELAY,
                     retry_backoff: float = _DEFAULT_RETRY_BACKOFF,
                     delivery_id: int | None = None):
    """POST to a webhook URL with automatic retry and delivery tracking."""
    import hashlib, hmac, time as _time

    if delivery_id is None:
        delivery_id = _next_delivery_id()

    headers = {"Content-Type": "application/json"}
    body_bytes = json.dumps(payload, default=str).encode()
    if secret:
        sig = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        headers["X-Webhook-Signature"] = sig

    delivery = {
        "id": delivery_id,
        "webhook_id": webhook_id,
        "event_id": payload.get("id"),
        "event_type": payload.get("event", ""),
        "url": url,
        "status": "pending",
        "attempts": 0,
        "max_retries": max_retries,
        "last_status_code": None,
        "last_error": None,
        "created_at": now_iso(),
        "completed_at": None,
    }
    _record_delivery(delivery)

    delay = retry_delay
    for attempt in range(1, max_retries + 1):
        delivery["attempts"] = attempt
        delivery["last_attempt_at"] = now_iso()
        try:
            resp = requests.post(url, data=body_bytes, headers=headers, timeout=15)
            delivery["last_status_code"] = resp.status_code
            if resp.ok:
                delivery["status"] = "success"
                delivery["completed_at"] = now_iso()
                delivery["last_error"] = None
                _record_delivery(delivery)
                print(f"[WEBHOOK] {url} → {resp.status_code} (attempt {attempt})")
                return
            else:
                delivery["last_error"] = f"HTTP {resp.status_code}: {resp.text[:200]}"
                delivery["status"] = "retrying"
                _record_delivery(delivery)
                print(f"[WEBHOOK] {url} → {resp.status_code} (attempt {attempt}/{max_retries})")
        except Exception as exc:
            delivery["last_status_code"] = None
            delivery["last_error"] = str(exc)[:300]
            delivery["status"] = "retrying"
            _record_delivery(delivery)
            print(f"[WEBHOOK] {url} → FAILED (attempt {attempt}/{max_retries}): {exc}")

        # Wait before retry (except on last attempt)
        if attempt < max_retries:
            _time.sleep(delay)
            delay *= retry_backoff

    # All retries exhausted
    delivery["status"] = "failed"
    delivery["completed_at"] = now_iso()
    _record_delivery(delivery)
    print(f"[WEBHOOK] {url} → PERMANENTLY FAILED after {max_retries} attempts")


def emit_event(event_type: str, data: dict | None = None):
    """Emit a workflow event: log it and dispatch to matching webhooks.

    Supported event types:
        workflow_started, workflow_advanced, workflow_completed, workflow_paused,
        task_created, task_completed, task_assigned, task_cancelled
    """
    timestamp = now_iso()

    # Persist to event log (trim to _EVENT_LOG_MAX)
    with _data_lock:
        log = load_event_log()
        event_id = max((e.get("id", 0) for e in log), default=0) + 1
        event = {
            "id": event_id,
            "event": event_type,
            "data": data or {},
            "timestamp": timestamp,
        }
        log.append(event)
        if len(log) > _EVENT_LOG_MAX:
            log = log[-_EVENT_LOG_MAX:]
        save_event_log(log)

    # Dispatch to matching webhooks in background threads
    webhooks = load_webhooks()
    for wh in webhooks:
        if not wh.get("active", True):
            continue
        wh_events = wh.get("events") or []
        if wh_events and event_type not in wh_events and "*" not in wh_events:
            continue
        url = wh.get("url", "").strip()
        if not url:
            continue
        secret = wh.get("secret", "")
        wh_id = wh.get("id", 0)
        retry_cfg = wh.get("retry_config") or {}
        t = threading.Thread(
            target=_deliver_webhook,
            args=(url, secret, event),
            kwargs={
                "webhook_id": wh_id,
                "max_retries": retry_cfg.get("max_retries", _DEFAULT_RETRY_MAX),
                "retry_delay": retry_cfg.get("retry_delay", _DEFAULT_RETRY_DELAY),
                "retry_backoff": retry_cfg.get("retry_backoff", _DEFAULT_RETRY_BACKOFF),
            },
            daemon=True,
        )
        t.start()

    return event


# ─────────────────────────────────────────────────────────────────────────────
# Workflow Engine endpoints
# ─────────────────────────────────────────────────────────────────────────────
from workflow_engine import WorkflowEngine, canonical_node_type

WORKFLOW_INSTANCES_TABLE = "workflow_instances_store"
WORKFLOW_INSTANCES_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "workflow_instances.json"
)

WORKFLOW_TASKS_TABLE = "workflow_tasks_store"
WORKFLOW_TASKS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "workflow_tasks.json"
)


def load_workflow_instances() -> list[dict]:
    return load_collection(WORKFLOW_INSTANCES_FILE, WORKFLOW_INSTANCES_TABLE, [])


def save_workflow_instances(rows: list[dict]):
    save_collection(WORKFLOW_INSTANCES_FILE, WORKFLOW_INSTANCES_TABLE, rows)


def _load_workflow_state(op_id: int) -> dict | None:
    """Load persisted workflow state for an opportunity."""
    instances = load_workflow_instances()
    return next(
        (inst for inst in instances if inst.get("id") == op_id),
        None,
    )


def _save_workflow_state(op_id: int, state: dict):
    """Persist workflow state for an opportunity."""
    record = {
        "id": op_id,
        "currentNodeId": state.get("currentNodeId"),
        "executed": state.get("executed", []),
        "context": state.get("context", {}),
        "status": state.get("status", "not_started"),
        "bpmn_version": state.get("bpmn_version"),
        "startedAt": state.get("startedAt") or now_iso(),
        "updatedAt": now_iso(),
    }
    with _data_lock:
        instances = load_workflow_instances()
        found = False
        for i, inst in enumerate(instances):
            if inst.get("id") == op_id:
                # Preserve bpmn_version from original run if not set
                if record["bpmn_version"] is None:
                    record["bpmn_version"] = inst.get("bpmn_version")
                instances[i] = record
                found = True
                break
        if not found:
            instances.append(record)
        save_workflow_instances(instances)


def _delete_workflow_state(op_id: int):
    """Remove persisted workflow state for an opportunity."""
    with _data_lock:
        instances = load_workflow_instances()
        instances = [inst for inst in instances if inst.get("id") != op_id]
        save_workflow_instances(instances)


# ─── Workflow Tasks (UserTask registry) ──────────────────────────────────────

def load_workflow_tasks() -> list[dict]:
    return load_collection(WORKFLOW_TASKS_FILE, WORKFLOW_TASKS_TABLE, [])


def save_workflow_tasks(rows: list[dict]):
    save_collection(WORKFLOW_TASKS_FILE, WORKFLOW_TASKS_TABLE, rows)


_task_id_counter_lock = threading.Lock()


def _next_task_id() -> int:
    """Generate a monotonically increasing task ID."""
    with _task_id_counter_lock:
        tasks = load_workflow_tasks()
        max_id = max((t.get("taskId", 0) for t in tasks), default=0)
        return max_id + 1


def _extract_form_schema(node: dict) -> list:
    """Extract a normalized formSchema from a BPMN node definition.

    Looks for ``formSchema`` (explicit), ``selectedEntityFields``, or
    ``campos`` in the node dict and normalises every entry to:
    ``{nome, tipo, obrigatorio, label, opcoes, placeholder}``.
    """
    raw = node.get("formSchema") or node.get("selectedEntityFields") or node.get("campos") or []
    schema: list[dict] = []
    for f in raw:
        if not isinstance(f, dict):
            continue
        entry: dict = {
            "nome": f.get("nome") or f.get("name") or "",
            "tipo": f.get("tipo") or f.get("type") or "texto",
            "obrigatorio": bool(f.get("obrigatorio", f.get("required", False))),
            "label": f.get("label") or f.get("nome") or f.get("name") or "",
            "opcoes": f.get("opcoes") or f.get("options") or [],
            "placeholder": f.get("placeholder") or f.get("descricao") or "",
        }
        schema.append(entry)
    return schema


def _validate_form_data(form_data: dict, form_schema: list) -> list[str]:
    """Validate *form_data* against *form_schema*.

    Returns a list of human-readable error strings (empty == valid).
    """
    errors: list[str] = []
    for field in form_schema:
        nome = field.get("nome", "")
        tipo = field.get("tipo", "texto")
        obrigatorio = field.get("obrigatorio", False)
        opcoes = field.get("opcoes") or []
        value = form_data.get(nome)

        # Required check
        if obrigatorio and (value is None or str(value).strip() == ""):
            errors.append(f"Campo '{field.get('label') or nome}' é obrigatório.")
            continue

        if value is None or str(value).strip() == "":
            continue  # optional and empty – skip type checks

        # Type checks
        if tipo in ("numero", "number"):
            try:
                float(value)
            except (ValueError, TypeError):
                errors.append(f"Campo '{field.get('label') or nome}' deve ser numérico.")
        elif tipo in ("data", "date"):
            if not isinstance(value, str) or len(value) < 8:
                errors.append(f"Campo '{field.get('label') or nome}' deve ser uma data válida.")
        elif tipo in ("email",):
            if not isinstance(value, str) or "@" not in value:
                errors.append(f"Campo '{field.get('label') or nome}' deve ser um e-mail válido.")
        elif tipo in ("boolean", "checkbox"):
            if not isinstance(value, bool) and str(value).lower() not in ("true", "false", "0", "1"):
                errors.append(f"Campo '{field.get('label') or nome}' deve ser verdadeiro/falso.")

        # Options check (select / enum)
        if opcoes and str(value) not in [str(o) for o in opcoes]:
            errors.append(f"Campo '{field.get('label') or nome}' deve ser uma das opções: {', '.join(str(o) for o in opcoes)}.")

    return errors


def _find_user_email_by_name(name: str) -> str | None:
    """Resolve a user name to their email address."""
    if not name:
        return None
    normalized = name.strip().lower()
    users = load_users_data()
    for u in users:
        if str(u.get("nome") or "").strip().lower() == normalized:
            return u.get("email")
        if str(u.get("email") or "").strip().lower() == normalized:
            return u.get("email")
    return None


def _notify_task_email(task: dict, event: str = "created"):
    """Send email notification for task creation or assignment (fire-and-forget)."""
    assignee_name = task.get("assignee") or ""
    if not assignee_name:
        return
    email = _find_user_email_by_name(assignee_name)
    if not email:
        return
    label = task.get("label") or "Tarefa"
    task_id = task.get("taskId", "")
    op_id = task.get("opportunityId", "")
    due = task.get("dueAt") or ""
    if event == "created":
        subject = f"Nova tarefa atribuída: {label}"
        body = (
            f"Olá {assignee_name},\n\n"
            f"Uma nova tarefa foi criada e atribuída a você:\n\n"
            f"  • Tarefa: {label} (#{task_id})\n"
            f"  • Oportunidade: #{op_id}\n"
            f"  • Prazo: {due or 'Sem prazo definido'}\n\n"
            f"Acesse o sistema para mais detalhes."
        )
    else:
        subject = f"Tarefa reatribuída: {label}"
        body = (
            f"Olá {assignee_name},\n\n"
            f"A tarefa abaixo foi atribuída a você:\n\n"
            f"  • Tarefa: {label} (#{task_id})\n"
            f"  • Oportunidade: #{op_id}\n"
            f"  • Prazo: {due or 'Sem prazo definido'}\n\n"
            f"Acesse o sistema para mais detalhes."
        )
    try:
        send_mailgun_email(email, subject, body)
    except Exception as e:
        print(f"[WARN] Falha ao enviar email de notificação: {e}")


def _create_user_task(
    op_id: int,
    node_id: str,
    node: dict,
    assignee: str | None = None,
    assignee_id: int | None = None,
) -> dict:
    """Create a pending UserTask record when engine pauses at a task node."""
    task_id = _next_task_id()
    label = (
        node.get("label")
        or node.get("taskNome")
        or node.get("condicionalNome")
        or node.get("entidadeNome")
        or node_id
    )
    description = node.get("descricao") or node.get("description") or ""
    participant = node.get("participante") or node.get("participant") or ""
    assigned_role = node.get("assignedRole") or node.get("role") or None
    form_schema = _extract_form_schema(node)
    sla_hours = _compute_sla_hours(node)
    created_at = now_iso()
    due_at = _compute_due_at(created_at, sla_hours)

    # Fallback: se nó não tem participante, usa o responsável da oportunidade
    resolved_assignee = assignee or participant or None
    if not resolved_assignee:
        try:
            opp = _find_opportunity(op_id)
            resolved_assignee = (
                str(opp.get("responsavel") or opp.get("assignedTo") or "").strip()
                or None
            )
        except Exception:
            pass

    record = {
        "taskId": task_id,
        "opportunityId": op_id,
        "nodeId": node_id,
        "nodeType": node.get("nodeType", "task"),
        "label": label,
        "description": description,
        "status": "pending",          # pending | completed | cancelled
        "assignee": resolved_assignee,
        "assigneeId": assignee_id,
        "assignedRole": assigned_role,
        "formSchema": form_schema,
        "formData": {},
        "slaHours": sla_hours,
        "dueAt": due_at,
        "durationSeconds": None,
        "completedBy": None,
        "completedAt": None,
        "createdAt": created_at,
        "updatedAt": created_at,
    }
    with _data_lock:
        tasks = load_workflow_tasks()
        tasks.append(record)
        save_workflow_tasks(tasks)
    emit_event("task_created", {
        "taskId": task_id,
        "opportunityId": op_id,
        "nodeId": node_id,
        "label": label,
        "assignee": record["assignee"],
        "assignedRole": assigned_role,
    })

    # Email notification on task creation
    _notify_task_email(record, event="created")

    return record


def _complete_user_task(task_id: int, completed_by: str | None = None, form_data: dict | None = None) -> dict | None:
    """Mark a UserTask as completed and return it."""
    with _data_lock:
        tasks = load_workflow_tasks()
        task = None
        for t in tasks:
            if t.get("taskId") == task_id:
                task = t
                break
        if not task:
            return None
        if task["status"] != "pending":
            return task  # already done
        task["status"] = "completed"
        task["completedBy"] = completed_by
        task["completedAt"] = now_iso()
        task["updatedAt"] = now_iso()
        task["durationSeconds"] = _task_duration_seconds(task)
        if form_data:
            task["formData"] = form_data
        # Resolve SLA violation if any
        was_overdue = False
        due = _parse_iso(task.get("dueAt"))
        if due and _parse_iso(task["completedAt"]) and _parse_iso(task["completedAt"]) > due:
            was_overdue = True
        task["slaBreached"] = was_overdue
        save_workflow_tasks(tasks)
    if task and task["status"] == "completed":
        # Resolve open SLA violation
        if was_overdue:
            with _data_lock:
                violations = load_sla_violations()
                for v in violations:
                    if v.get("taskId") == task_id and v.get("status") == "open":
                        v["status"] = "resolved"
                        v["resolvedAt"] = task["completedAt"]
                        v["durationSeconds"] = task["durationSeconds"]
                save_sla_violations(violations)
        emit_event("task_completed", {
            "taskId": task_id,
            "opportunityId": task.get("opportunityId"),
            "nodeId": task.get("nodeId"),
            "label": task.get("label"),
            "completedBy": completed_by,
            "durationSeconds": task.get("durationSeconds"),
            "slaBreached": was_overdue,
        })
        # Eager SLA check: scan remaining pending tasks for new violations
        check_sla_violations()
    return task


def _cancel_tasks_for_workflow(op_id: int):
    """Cancel all pending tasks for a workflow (e.g. on restart)."""
    changed = False
    with _data_lock:
        tasks = load_workflow_tasks()
        for t in tasks:
            if t.get("opportunityId") == op_id and t.get("status") == "pending":
                t["status"] = "cancelled"
                t["updatedAt"] = now_iso()
                changed = True
        if changed:
            save_workflow_tasks(tasks)
    if changed:
        emit_event("task_cancelled", {"opportunityId": op_id})


def _get_pending_task(op_id: int, node_id: str) -> dict | None:
    """Find existing pending task for a specific node in a workflow."""
    tasks = load_workflow_tasks()
    return next(
        (t for t in tasks
         if t.get("opportunityId") == op_id
         and t.get("nodeId") == node_id
         and t.get("status") == "pending"),
        None,
    )


def _find_opportunity(op_id: int) -> dict:
    """Find opportunity by id or raise 404."""
    global fake_oportunidades
    fake_oportunidades = load_oportunidades_data()
    opp = next((o for o in fake_oportunidades if o.get("id") == op_id), None)
    if not opp:
        raise HTTPException(status_code=404, detail="Oportunidade não encontrada")
    return opp


def _append_opportunity_timeline(op_id: int, entries: list[dict]):
    """Append timeline entries to an opportunity's timelineItems array."""
    if not entries:
        return
    ts = now_iso()
    fmt = datetime.now().strftime("%d/%m/%Y, %H:%M")
    base_id = int(datetime.now().timestamp() * 1000)
    for i, entry in enumerate(entries):
        entry.setdefault("id", base_id + i)
        entry.setdefault("autoGenerated", True)
        entry.setdefault("source", "backend")
        entry.setdefault("timestamp", ts)
        entry.setdefault("time", fmt)
        entry.setdefault("actor", "Sistema")
        entry.setdefault("actorId", "system")
    with _data_lock:
        opps = load_oportunidades_data()
        for idx, opp in enumerate(opps):
            if opp.get("id") == op_id:
                timeline = opp.get("timelineItems") or []
                opp["timelineItems"] = entries + timeline
                opps[idx] = opp
                save_oportunidades_data(opps)
                return


def _find_opportunities_for_entity(entity: dict) -> list[int]:
    """Find opportunity IDs whose BPMN references this entity."""
    eid = entity.get("id")
    nome = (entity.get("nome") or "").strip().lower()
    cat = (entity.get("categoria") or "").strip().lower()
    opps = load_oportunidades_data()
    result = []
    for opp in opps:
        opp_nome = (opp.get("nome") or opp.get("titulo") or "").strip().lower()
        if cat and opp_nome and opp_nome == cat:
            result.append(opp["id"])
            continue
        bpmn = opp.get("bpmn") or {}
        nodes = bpmn.get("nodes") or []
        for node in nodes:
            if node.get("entidadeId") == eid:
                result.append(opp["id"])
                break
            if nome and (node.get("entidadeNome") or node.get("label") or "").strip().lower() == nome:
                if node.get("nodeType") == "entidade":
                    result.append(opp["id"])
                    break
    return result


def _get_bpmn(opp: dict, version: int | None = None) -> dict:
    """Extract bpmn dict from opportunity, optionally for a specific version.

    If *version* is given, look up the snapshot in ``bpmn_versions``.
    Otherwise return the current (latest) BPMN.
    """
    if version is not None:
        versions = opp.get("bpmn_versions") or []
        ver = next((v for v in versions if v.get("version") == version), None)
        if ver:
            bpmn = ver.get("bpmn") or {}
            if isinstance(bpmn, dict) and bpmn.get("nodes"):
                return bpmn
        # Fallback to current if version not found (backward compat)
    bpmn = opp.get("bpmn")
    if not bpmn or not isinstance(bpmn, dict):
        raise HTTPException(status_code=400, detail="Oportunidade não possui BPMN definido")
    nodes = bpmn.get("nodes") or []
    if not nodes:
        raise HTTPException(status_code=400, detail="BPMN não possui nós definidos")
    return bpmn


def _get_current_bpmn_version(opp: dict) -> int:
    """Return the latest BPMN version number for an opportunity."""
    versions = opp.get("bpmn_versions") or []
    if versions:
        return max(v.get("version", 0) for v in versions)
    return 1  # First implicit version


def _create_bpmn_version(opp_id: int, bpmn: dict, author: str = "") -> int:
    """Snapshot the current BPMN into bpmn_versions and return the new version number."""
    with _data_lock:
        opps = load_oportunidades_data()
        opp = next((o for o in opps if o.get("id") == opp_id), None)
        if not opp:
            return 0
        versions = opp.get("bpmn_versions") or []
        new_version = max((v.get("version", 0) for v in versions), default=0) + 1
        versions.append({
            "version": new_version,
            "bpmn": json.loads(json.dumps(bpmn)),  # deep copy
            "created_at": now_iso(),
            "author": author,
        })
        opp["bpmn_versions"] = versions
        opp["bpmn_current_version"] = new_version
        save_oportunidades_data(opps)
    return new_version


def _get_bpmn_safe(opp: dict, version: int | None = None) -> dict:
    """Like _get_bpmn but returns empty dict instead of raising on missing BPMN."""
    try:
        return _get_bpmn(opp, version)
    except HTTPException:
        return opp.get("bpmn") or {}


def _build_response(engine: WorkflowEngine, result: dict, op_id: int, bpmn_version: int | None = None) -> dict:
    """Normalize workflow engine result to the shape the frontend expects."""
    total_nodes = len(engine.active_node_ids_in_order())
    current = result.get("currentNodeId")
    stage_index = engine.node_index(current) if current else total_nodes

    # Include pending task info if paused at a user task
    pending_task = None
    if current and result.get("paused_reason") == "user_input":
        pending_task = _get_pending_task(op_id, current)

    resp = {
        "status": result["status"],
        "workflowStatus": result["status"],
        "paused_reason": result.get("paused_reason"),
        "workflowPausedReason": result.get("paused_reason"),
        "currentNodeId": current,
        "bpmnVersion": bpmn_version,
        "stageIndex": stage_index,
        "totalNodes": total_nodes,
        "executed": result.get("executed", []),
    }
    if pending_task:
        resp["pendingTask"] = {
            "taskId": pending_task["taskId"],
            "nodeId": pending_task["nodeId"],
            "label": pending_task["label"],
            "description": pending_task.get("description", ""),
            "assignee": pending_task.get("assignee"),
            "assigneeId": pending_task.get("assigneeId"),
            "status": pending_task["status"],
            "createdAt": pending_task.get("createdAt"),
            "formSchema": pending_task.get("formSchema") or [],
        }
    return resp


@app.get("/workflows")
def list_workflows(status: str | None = None, owner: str | None = None, shared: str | None = None):
    """List all workflow instances joined with opportunity metadata."""
    instances = load_workflow_instances()
    oportunidades = load_oportunidades_data()
    opp_map = {o.get("id"): o for o in oportunidades if isinstance(o, dict)}

    result = []
    for inst in instances:
        op_id = inst.get("id")
        wf_status = inst.get("status", "not_started")
        if status and wf_status != status:
            continue
        opp = opp_map.get(op_id) or {}
        # Filter by owner
        if owner:
            opp_owner = (opp.get("criadoPor") or opp.get("owner") or "").lower()
            if opp_owner != owner.lower():
                continue
        # Filter by shared flag
        if shared == "true" and not opp.get("shared"):
            continue
        inst_version = inst.get("bpmn_version")
        bpmn = _get_bpmn_safe(opp, inst_version)
        nodes = bpmn.get("nodes") or []
        executed = inst.get("executed") or []

        # Current node info
        current_node_id = inst.get("currentNodeId")
        current_node = next((n for n in nodes if n.get("id") == current_node_id), None)

        total_active = len([n for n in nodes if n.get("active") is not False])
        completed_count = len([e for e in executed if e.get("status") == "completed"])
        # If workflow is completed, force 100% (branches not taken inflate total_active)
        if wf_status == "completed" and total_active:
            calc_progress = 100
        else:
            calc_progress = round(completed_count / total_active * 100) if total_active else 0

        result.append({
            "opportunityId": op_id,
            "opportunityName": opp.get("nome") or opp.get("name") or f"Oportunidade #{op_id}",
            "opportunitySlug": opp.get("slug") or "",
            "owner": opp.get("criadoPor") or opp.get("owner") or "",
            "shared": bool(opp.get("shared")),
            "status": wf_status,
            "bpmnVersion": inst_version,
            "currentNodeId": current_node_id,
            "currentNodeLabel": current_node.get("label", "") if current_node else "",
            "currentNodeType": current_node.get("nodeType", "") if current_node else "",
            "totalNodes": total_active,
            "completedNodes": completed_count,
            "progress": calc_progress,
            "startedAt": inst.get("startedAt"),
            "updatedAt": inst.get("updatedAt"),
        })

    # Sort: running/paused first, then by updatedAt desc
    status_order = {"running": 0, "paused": 0, "not_started": 1, "completed": 2, "stopped": 3}
    result.sort(key=lambda w: (status_order.get(w["status"], 9), w.get("updatedAt") or "", ), reverse=False)
    # Reverse updatedAt within same status group
    result.sort(key=lambda w: (status_order.get(w["status"], 9),))

    return {"data": result, "total": len(result)}


@app.post("/workflow/{op_id}/run")
async def workflow_run(op_id: int, request: Request):
    """Start (or restart) workflow execution for an opportunity."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    # Validate context is a dict if provided
    context = body.get("context") or {}
    if not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="'context' deve ser um objeto (dict).")

    opp = _find_opportunity(op_id)
    # Lock to current BPMN version so instance survives future edits
    current_version = _get_current_bpmn_version(opp)
    bpmn = _get_bpmn(opp)
    engine = WorkflowEngine(bpmn)

    start_id = engine.find_start_node()
    if not start_id:
        raise HTTPException(status_code=400, detail="BPMN não possui nó de início")

    # Ensure a version snapshot exists for this BPMN
    if not (opp.get("bpmn_versions") or []):
        current_version = _create_bpmn_version(op_id, bpmn)

    # Cancel any existing pending tasks from previous run
    _cancel_tasks_for_workflow(op_id)

    result = engine.run(start_id, context)

    _save_workflow_state(op_id, {
        "currentNodeId": result.get("currentNodeId"),
        "executed": result.get("executed", []),
        "context": context,
        "status": result["status"],
        "bpmn_version": current_version,
        "startedAt": now_iso(),
    })

    # Emit workflow_started event
    emit_event("workflow_started", {
        "opportunityId": op_id,
        "bpmnVersion": current_version,
        "status": result["status"],
    })

    # Append workflow start to opportunity timeline
    _append_opportunity_timeline(op_id, [{
        "title": "Workflow iniciado",
        "description": f"Execução do workflow foi iniciada (versão BPMN {current_version})",
        "actionType": "create",
        "elementType": "workflow",
        "itemName": "Workflow",
    }])

    # If paused at a UserTask, create a pending task record
    current = result.get("currentNodeId")
    if current and result.get("paused_reason") == "user_input":
        node = engine.nodes.get(current, {})
        _create_user_task(op_id, current, node)

    return _build_response(engine, result, op_id, current_version)


@app.post("/workflow/{op_id}/advance")
async def workflow_advance(op_id: int, request: Request):
    """Advance workflow from the current paused node."""
    body = await request.json()
    node_id = body.get("nodeId")
    decision = body.get("decision")
    completed = body.get("completed", False)
    form_data = body.get("formData") or {}

    opp = _find_opportunity(op_id)

    state = _load_workflow_state(op_id)
    if not state:
        raise HTTPException(status_code=400, detail="Workflow não foi iniciado. Use /workflow/{id}/run primeiro.")

    # Block advance on terminal states
    wf_status = state.get("status", "")
    if wf_status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail=f"Workflow está com status '{wf_status}' e não pode avançar.",
        )

    # Use the BPMN version locked at instance start
    inst_version = state.get("bpmn_version")
    bpmn = _get_bpmn(opp, inst_version)

    # Validate node_id exists in BPMN
    if node_id:
        bpmn_nodes = bpmn.get("nodes") or []
        valid_ids = {str(n.get("id") or "") for n in bpmn_nodes}
        if str(node_id) not in valid_ids:
            raise HTTPException(
                status_code=400,
                detail=f"nodeId '{node_id}' não existe no BPMN desta oportunidade.",
            )

    # If completing a UserTask, validate and mark the task record as completed
    if completed and node_id:
        pending = _get_pending_task(op_id, node_id)
        if pending:
            form_schema = pending.get("formSchema") or []
            if form_schema and form_data:
                validation_errors = _validate_form_data(form_data, form_schema)
                if validation_errors:
                    raise HTTPException(status_code=422, detail={
                        "message": "Dados do formulário inválidos",
                        "errors": validation_errors,
                    })
            _complete_user_task(pending["taskId"], form_data=form_data)

    # Build context from previous state + new input
    context = dict(state.get("context") or {})

    if decision:
        context[f"decision_{node_id}"] = decision
    if completed:
        context[f"completed_{node_id}"] = True
    if form_data:
        context.update(form_data)
        # Store form_responses per node for structured access
        form_responses = context.get("form_responses") or {}
        form_responses[node_id] = form_data
        context["form_responses"] = form_responses

    # Re-run engine from start with full accumulated context
    engine = WorkflowEngine(bpmn)
    start_id = engine.find_start_node()
    result = engine.run(start_id, context)

    _save_workflow_state(op_id, {
        "currentNodeId": result.get("currentNodeId"),
        "executed": result.get("executed", []),
        "context": context,
        "status": result["status"],
        "startedAt": state.get("startedAt"),
    })

    # If paused at a new UserTask, create a pending task record
    current = result.get("currentNodeId")
    if current and result.get("paused_reason") == "user_input":
        existing = _get_pending_task(op_id, current)
        if not existing:
            node = engine.nodes.get(current, {})
            _create_user_task(op_id, current, node)

    # Update opportunity stageIndex and currentNodeId
    stage_index = engine.node_index(current) if current else len(engine.active_node_ids_in_order())
    with _data_lock:
        fake_oportunidades = load_oportunidades_data()
        for o in fake_oportunidades:
            if o.get("id") == op_id:
                o["stageIndex"] = stage_index
                o["currentNodeId"] = current
                o["bpmnCurrentNodeId"] = current
                o["activeNodeId"] = current
                if result["status"] == "completed":
                    o["status"] = "Concluído"
                break
        save_oportunidades_data(fake_oportunidades)

    # Emit workflow event based on result status
    # Resolve labels for timeline entries
    _adv_node_label = ""
    if node_id:
        _adv_node = engine.nodes.get(node_id) or engine.nodes.get(str(node_id)) or {}
        _adv_node_label = _adv_node.get("label") or _adv_node.get("taskNome") or _adv_node.get("entidadeNome") or str(node_id)
    _adv_current_label = ""
    if current:
        _adv_cur_node = engine.nodes.get(current) or engine.nodes.get(str(current)) or {}
        _adv_current_label = _adv_cur_node.get("label") or _adv_cur_node.get("taskNome") or _adv_cur_node.get("entidadeNome") or str(current)

    if result["status"] == "completed":
        emit_event("workflow_completed", {
            "opportunityId": op_id,
            "bpmnVersion": inst_version,
            "executedCount": len(result.get("executed", [])),
        })
        _tl = [{"title": "Workflow concluído", "description": f"Todas as etapas foram finalizadas ({len(result.get('executed', []))} etapas executadas)", "actionType": "update", "elementType": "workflow", "itemName": "Workflow"}]
        if _adv_node_label:
            _tl.insert(0, {"title": f"Etapa concluída: {_adv_node_label}", "description": f"A etapa '{_adv_node_label}' foi finalizada", "actionType": "update", "elementType": "workflow", "itemName": _adv_node_label})
        _append_opportunity_timeline(op_id, _tl)
    elif result.get("paused_reason"):
        emit_event("workflow_paused", {
            "opportunityId": op_id,
            "currentNodeId": current,
            "pausedReason": result.get("paused_reason"),
        })
        _tl = []
        if _adv_node_label:
            _tl.append({"title": f"Etapa concluída: {_adv_node_label}", "description": f"A etapa '{_adv_node_label}' foi finalizada", "actionType": "update", "elementType": "workflow", "itemName": _adv_node_label})
        _tl.append({"title": f"Aguardando: {_adv_current_label}", "description": f"Workflow pausado na etapa '{_adv_current_label}'", "actionType": "update", "elementType": "workflow", "itemName": _adv_current_label})
        _append_opportunity_timeline(op_id, _tl)
    else:
        emit_event("workflow_advanced", {
            "opportunityId": op_id,
            "currentNodeId": current,
            "status": result["status"],
        })
        _tl = []
        if _adv_node_label:
            _tl.append({"title": f"Etapa concluída: {_adv_node_label}", "description": f"A etapa '{_adv_node_label}' foi finalizada", "actionType": "update", "elementType": "workflow", "itemName": _adv_node_label})
        _append_opportunity_timeline(op_id, _tl)

    return _build_response(engine, result, op_id, inst_version)


@app.get("/workflow/{op_id}/state")
def workflow_state(op_id: int):
    """Get current workflow state for an opportunity. Auto-resumes from persisted state."""
    opp = _find_opportunity(op_id)
    state = _load_workflow_state(op_id)

    if not state:
        return {
            "status": "not_started",
            "workflowStatus": "not_started",
            "paused_reason": None,
            "workflowPausedReason": None,
            "currentNodeId": None,
            "stageIndex": 0,
            "totalNodes": 0,
            "executed": [],
        }

    # Re-run engine with saved context to rehydrate paused_reason
    inst_version = state.get("bpmn_version")
    bpmn = _get_bpmn(opp, inst_version)
    engine = WorkflowEngine(bpmn)
    start_id = engine.find_start_node()
    context = state.get("context") or {}
    result = engine.run(start_id, context) if start_id else {}

    paused_reason = result.get("paused_reason") if result else None
    current_node = state.get("currentNodeId")

    # Include pending task if paused at a UserTask
    pending_task = None
    if current_node and paused_reason == "user_input":
        pt = _get_pending_task(op_id, current_node)
        if pt:
            pending_task = {
                "taskId": pt["taskId"],
                "nodeId": pt["nodeId"],
                "label": pt["label"],
                "description": pt.get("description", ""),
                "assignee": pt.get("assignee"),
                "assigneeId": pt.get("assigneeId"),
                "status": pt["status"],
                "createdAt": pt.get("createdAt"),
                "formSchema": pt.get("formSchema") or [],
            }

    resp = {
        "status": state["status"],
        "workflowStatus": state["status"],
        "paused_reason": paused_reason,
        "workflowPausedReason": paused_reason,
        "currentNodeId": current_node,
        "bpmnVersion": inst_version,
        "stageIndex": engine.node_index(current_node) if current_node else 0,
        "totalNodes": len(engine.active_node_ids_in_order()),
        "executed": state.get("executed", []),
    }
    if pending_task:
        resp["pendingTask"] = pending_task
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# Workflow Cancel / Pause / Resume / History
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/workflow/{op_id}/cancel")
def workflow_cancel(op_id: int):
    """Cancel a running or paused workflow. Cancels all pending tasks."""
    _find_opportunity(op_id)
    state = _load_workflow_state(op_id)
    if not state:
        raise HTTPException(status_code=400, detail="Workflow não foi iniciado.")
    if state.get("status") in ("completed", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail=f"Workflow já está com status '{state['status']}'.",
        )

    _cancel_tasks_for_workflow(op_id)

    _save_workflow_state(op_id, {
        **state,
        "status": "cancelled",
        "cancelledAt": now_iso(),
    })

    emit_event("workflow_cancelled", {
        "opportunityId": op_id,
        "previousStatus": state.get("status"),
    })

    _append_opportunity_timeline(op_id, [{
        "title": "Workflow cancelado",
        "description": f"Execução do workflow foi cancelada (status anterior: {state.get('status', '?')})",
        "actionType": "delete",
        "elementType": "workflow",
        "itemName": "Workflow",
    }])

    return {"status": "cancelled", "opportunityId": op_id}


@app.post("/workflow/{op_id}/pause")
def workflow_pause(op_id: int):
    """Explicitly pause a running workflow (not waiting on a user task)."""
    _find_opportunity(op_id)
    state = _load_workflow_state(op_id)
    if not state:
        raise HTTPException(status_code=400, detail="Workflow não foi iniciado.")
    current_status = state.get("status", "")
    if current_status not in ("running", "paused"):
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível pausar workflows em execução. Status atual: '{current_status}'.",
        )
    if current_status == "paused":
        return {"status": "paused", "opportunityId": op_id, "message": "Workflow já está pausado."}

    _save_workflow_state(op_id, {
        **state,
        "status": "paused",
        "pausedAt": now_iso(),
        "pausedManually": True,
    })

    emit_event("workflow_paused", {
        "opportunityId": op_id,
        "currentNodeId": state.get("currentNodeId"),
        "pausedReason": "manual",
    })

    _append_opportunity_timeline(op_id, [{
        "title": "Workflow pausado manualmente",
        "description": "O workflow foi pausado manualmente pelo usuário",
        "actionType": "update",
        "elementType": "workflow",
        "itemName": "Workflow",
    }])

    return {"status": "paused", "opportunityId": op_id}


@app.post("/workflow/{op_id}/resume")
def workflow_resume(op_id: int):
    """Resume a manually paused workflow."""
    _find_opportunity(op_id)
    state = _load_workflow_state(op_id)
    if not state:
        raise HTTPException(status_code=400, detail="Workflow não foi iniciado.")
    if state.get("status") != "paused":
        raise HTTPException(
            status_code=400,
            detail=f"Workflow não está pausado. Status atual: '{state.get('status')}'.",
        )

    previous_status = "running"
    _save_workflow_state(op_id, {
        **state,
        "status": previous_status,
        "resumedAt": now_iso(),
        "pausedManually": False,
    })

    emit_event("workflow_resumed", {
        "opportunityId": op_id,
        "currentNodeId": state.get("currentNodeId"),
    })

    _append_opportunity_timeline(op_id, [{
        "title": "Workflow retomado",
        "description": "O workflow pausado foi retomado",
        "actionType": "update",
        "elementType": "workflow",
        "itemName": "Workflow",
    }])

    return {"status": previous_status, "opportunityId": op_id}


@app.get("/workflow/{op_id}/history")
def workflow_history(op_id: int, limit: int = 100):
    """Return the full execution audit trail for a workflow (events + task changes)."""
    _find_opportunity(op_id)

    # Collect all events related to this opportunity
    event_log = load_event_log()
    related_events = [
        e for e in event_log
        if isinstance(e.get("data"), dict)
        and e["data"].get("opportunityId") == op_id
    ]

    # Collect task history for this workflow
    tasks = load_workflow_tasks()
    related_tasks = [t for t in tasks if t.get("opportunityId") == op_id]

    # Build unified timeline
    timeline: list[dict] = []

    for event in related_events:
        timeline.append({
            "type": "event",
            "event": event.get("event"),
            "data": event.get("data"),
            "timestamp": event.get("timestamp"),
        })

    for task in related_tasks:
        timeline.append({
            "type": "task_created",
            "taskId": task.get("taskId"),
            "nodeId": task.get("nodeId"),
            "label": task.get("label"),
            "assignee": task.get("assignee"),
            "status": task.get("status"),
            "timestamp": task.get("createdAt"),
        })
        if task.get("completedAt"):
            timeline.append({
                "type": "task_completed",
                "taskId": task.get("taskId"),
                "label": task.get("label"),
                "completedBy": task.get("completedBy"),
                "durationSeconds": task.get("durationSeconds"),
                "slaBreached": task.get("slaBreached", False),
                "timestamp": task.get("completedAt"),
            })

    # Sort by timestamp ascending
    timeline.sort(key=lambda x: x.get("timestamp") or "")

    # Workflow state summary
    state = _load_workflow_state(op_id)
    summary = {
        "status": state.get("status", "not_started") if state else "not_started",
        "startedAt": state.get("startedAt") if state else None,
        "updatedAt": state.get("updatedAt") if state else None,
        "executedCount": len(state.get("executed", [])) if state else 0,
        "totalTasks": len(related_tasks),
        "completedTasks": len([t for t in related_tasks if t.get("status") == "completed"]),
        "pendingTasks": len([t for t in related_tasks if t.get("status") == "pending"]),
        "cancelledTasks": len([t for t in related_tasks if t.get("status") == "cancelled"]),
    }

    return {
        "opportunityId": op_id,
        "summary": summary,
        "timeline": timeline[-limit:],
        "total": len(timeline),
    }


# ─────────────────────────────────────────────────────────────────────────────
# BPMN Versioning endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/oportunidades/{op_id}/versions")
def list_bpmn_versions(op_id: int):
    """List all BPMN version snapshots for an opportunity."""
    opp = _find_opportunity(op_id)
    versions = opp.get("bpmn_versions") or []
    current = opp.get("bpmn_current_version")

    # Return metadata only (no full BPMN payload to keep response small)
    items = []
    for v in versions:
        bpmn_snap = v.get("bpmn") or {}
        items.append({
            "version": v.get("version"),
            "created_at": v.get("created_at", ""),
            "author": v.get("author", ""),
            "nodeCount": len(bpmn_snap.get("nodes") or []),
            "connectionCount": len(bpmn_snap.get("connections") or []),
            "isCurrent": v.get("version") == current,
        })
    items.sort(key=lambda x: x["version"], reverse=True)
    return {"data": items, "currentVersion": current}


@app.get("/oportunidades/{op_id}/versions/{version}")
def get_bpmn_version(op_id: int, version: int):
    """Return the full BPMN snapshot for a specific version."""
    opp = _find_opportunity(op_id)
    versions = opp.get("bpmn_versions") or []
    ver = next((v for v in versions if v.get("version") == version), None)
    if not ver:
        raise HTTPException(status_code=404, detail=f"Versão {version} não encontrada")
    return {
        "version": ver["version"],
        "bpmn": ver.get("bpmn", {}),
        "created_at": ver.get("created_at", ""),
        "author": ver.get("author", ""),
        "isCurrent": ver["version"] == opp.get("bpmn_current_version"),
    }


@app.post("/oportunidades/{op_id}/versions")
def create_bpmn_version_manual(op_id: int, request_body: dict = Body(default={})):
    """Manually create a BPMN version snapshot of the current BPMN."""
    opp = _find_opportunity(op_id)
    bpmn = opp.get("bpmn")
    if not bpmn or not isinstance(bpmn, dict) or not bpmn.get("nodes"):
        raise HTTPException(status_code=400, detail="Oportunidade não possui BPMN com nós para versionar")
    author = request_body.get("author", "")
    new_ver = _create_bpmn_version(op_id, bpmn, author)
    return {"version": new_ver, "message": f"Versão {new_ver} criada com sucesso"}


@app.post("/oportunidades/{op_id}/versions/{version}/restore")
def restore_bpmn_version(op_id: int, version: int):
    """Restore a previous BPMN version as the current BPMN (creates a new version)."""
    opp = _find_opportunity(op_id)
    versions = opp.get("bpmn_versions") or []
    ver = next((v for v in versions if v.get("version") == version), None)
    if not ver:
        raise HTTPException(status_code=404, detail=f"Versão {version} não encontrada")

    old_bpmn = ver.get("bpmn") or {}
    if not old_bpmn.get("nodes"):
        raise HTTPException(status_code=400, detail="Versão não possui nós BPMN")

    # Update current BPMN to the old version's snapshot
    with _data_lock:
        opps = load_oportunidades_data()
        target = next((o for o in opps if o.get("id") == op_id), None)
        if target:
            target["bpmn"] = json.loads(json.dumps(old_bpmn))
            save_oportunidades_data(opps)

    # Create a new version for this restoration
    new_ver = _create_bpmn_version(op_id, old_bpmn, f"restaurado da v{version}")
    return {
        "version": new_ver,
        "restoredFrom": version,
        "message": f"BPMN restaurado da versão {version}. Nova versão {new_ver} criada.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Webhook CRUD & Event Log endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/webhooks")
def list_webhooks():
    """List all registered webhooks."""
    return {"data": load_webhooks()}


@app.post("/webhooks", status_code=201)
def create_webhook(body: dict = Body(...)):
    """Register a new webhook.

    Body: { url, events?: string[], secret?: string, description?: string,
            retry_config?: { max_retries?: int, retry_delay?: float, retry_backoff?: float } }
    """
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url é obrigatório")

    events = body.get("events") or ["*"]
    secret = body.get("secret") or ""
    description = body.get("description") or ""
    retry_config = body.get("retry_config") or {
        "max_retries": _DEFAULT_RETRY_MAX,
        "retry_delay": _DEFAULT_RETRY_DELAY,
        "retry_backoff": _DEFAULT_RETRY_BACKOFF,
    }

    with _data_lock:
        hooks = load_webhooks()
        new_id = max((h.get("id", 0) for h in hooks), default=0) + 1
        record = {
            "id": new_id,
            "url": url,
            "events": events,
            "secret": secret,
            "description": description,
            "active": True,
            "retry_config": retry_config,
            "created_at": now_iso(),
        }
        hooks.append(record)
        save_webhooks(hooks)
    return record


@app.put("/webhooks/{webhook_id}")
def update_webhook(webhook_id: int, body: dict = Body(...)):
    """Update a webhook (url, events, secret, active, description, retry_config)."""
    with _data_lock:
        hooks = load_webhooks()
        hook = next((h for h in hooks if h.get("id") == webhook_id), None)
        if not hook:
            raise HTTPException(status_code=404, detail="Webhook não encontrado")
        for key in ("url", "events", "secret", "active", "description", "retry_config"):
            if key in body:
                hook[key] = body[key]
        hook["updated_at"] = now_iso()
        save_webhooks(hooks)
    return hook


@app.delete("/webhooks/{webhook_id}", status_code=204)
def delete_webhook(webhook_id: int):
    """Delete a webhook registration."""
    with _data_lock:
        hooks = load_webhooks()
        idx = next((i for i, h in enumerate(hooks) if h.get("id") == webhook_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Webhook não encontrado")
        hooks.pop(idx)
        save_webhooks(hooks)
    return


@app.post("/webhooks/{webhook_id}/test")
def test_webhook(webhook_id: int):
    """Send a test event to a webhook to verify connectivity."""
    hooks = load_webhooks()
    hook = next((h for h in hooks if h.get("id") == webhook_id), None)
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook não encontrado")
    test_event = {
        "id": 0,
        "event": "webhook_test",
        "data": {"message": "Teste de conectividade do webhook", "webhookId": webhook_id},
        "timestamp": now_iso(),
    }
    url = hook.get("url", "").strip()
    secret = hook.get("secret", "")
    # Synchronous delivery for test so we can report the result
    import hashlib, hmac
    headers = {"Content-Type": "application/json"}
    body_bytes = json.dumps(test_event, default=str).encode()
    if secret:
        sig = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        headers["X-Webhook-Signature"] = sig
    try:
        resp = requests.post(url, data=body_bytes, headers=headers, timeout=10)
        return {"success": resp.ok, "status_code": resp.status_code, "body": resp.text[:500]}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@app.get("/events")
def list_events(event_type: str | None = None, limit: int = 50):
    """List recent events from the event log."""
    log = load_event_log()
    if event_type:
        log = [e for e in log if e.get("event") == event_type]
    log.sort(key=lambda e: e.get("id", 0), reverse=True)
    return {"data": log[:limit], "total": len(log)}


@app.get("/events/types")
def list_event_types():
    """Return all supported event types."""
    return {"types": [
        "workflow_started",
        "workflow_advanced",
        "workflow_paused",
        "workflow_resumed",
        "workflow_completed",
        "workflow_cancelled",
        "task_created",
        "task_completed",
        "task_assigned",
        "task_cancelled",
        "sla_violation",
        "webhook_test",
    ]}


# ─── Delivery log & manual retry ─────────────────────────────────────────────

@app.get("/webhooks/{webhook_id}/deliveries")
def list_webhook_deliveries(webhook_id: int, status: str | None = None, limit: int = 50):
    """List delivery attempts for a specific webhook.

    Optional ?status=failed|success|retrying|pending to filter.
    """
    hooks = load_webhooks()
    if not any(h.get("id") == webhook_id for h in hooks):
        raise HTTPException(status_code=404, detail="Webhook não encontrado")
    log = load_delivery_log()
    results = [d for d in log if d.get("webhook_id") == webhook_id]
    if status:
        results = [d for d in results if d.get("status") == status]
    results.sort(key=lambda d: d.get("id", 0), reverse=True)
    return {"data": results[:limit], "total": len(results)}


@app.get("/deliveries")
def list_all_deliveries(status: str | None = None, webhook_id: int | None = None,
                        event_type: str | None = None, limit: int = 50):
    """List all delivery attempts across all webhooks, with optional filters."""
    log = load_delivery_log()
    if status:
        log = [d for d in log if d.get("status") == status]
    if webhook_id is not None:
        log = [d for d in log if d.get("webhook_id") == webhook_id]
    if event_type:
        log = [d for d in log if d.get("event_type") == event_type]
    log.sort(key=lambda d: d.get("id", 0), reverse=True)
    return {"data": log[:limit], "total": len(log)}


@app.get("/deliveries/stats")
def delivery_stats():
    """Return aggregated delivery statistics."""
    log = load_delivery_log()
    total = len(log)
    by_status = {}
    for d in log:
        s = d.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
    return {"total": total, "by_status": by_status}


@app.post("/deliveries/{delivery_id}/retry")
def retry_delivery(delivery_id: int):
    """Manually retry a specific failed delivery."""
    log = load_delivery_log()
    delivery = next((d for d in log if d.get("id") == delivery_id), None)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery não encontrada")
    if delivery.get("status") not in ("failed", "retrying"):
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível reprocessar deliveries com status 'failed' ou 'retrying'. "
                   f"Status atual: {delivery.get('status')}",
        )

    # Retrieve webhook config for retry params
    hooks = load_webhooks()
    hook = next((h for h in hooks if h.get("id") == delivery.get("webhook_id")), None)
    retry_cfg = (hook.get("retry_config") if hook else None) or {}

    # Reconstruct the event payload from the event log
    event_log = load_event_log()
    event = next((e for e in event_log if e.get("id") == delivery.get("event_id")), None)
    if not event:
        raise HTTPException(
            status_code=404,
            detail="Evento original não encontrado no log (pode ter sido removido por rotação).",
        )

    url = delivery.get("url", "").strip()
    secret = (hook.get("secret", "") if hook else "")

    # Reset delivery status and re-dispatch in background
    delivery["status"] = "retrying"
    delivery["last_error"] = None
    _record_delivery(delivery)

    t = threading.Thread(
        target=_deliver_webhook,
        args=(url, secret, event),
        kwargs={
            "webhook_id": delivery.get("webhook_id", 0),
            "max_retries": retry_cfg.get("max_retries", _DEFAULT_RETRY_MAX),
            "retry_delay": retry_cfg.get("retry_delay", _DEFAULT_RETRY_DELAY),
            "retry_backoff": retry_cfg.get("retry_backoff", _DEFAULT_RETRY_BACKOFF),
            "delivery_id": delivery_id,
        },
        daemon=True,
    )
    t.start()
    return {"message": "Reprocessamento iniciado", "delivery_id": delivery_id, "status": "retrying"}


@app.post("/events/{event_id}/retry")
def retry_event_deliveries(event_id: int):
    """Retry all failed deliveries for a specific event."""
    log = load_delivery_log()
    failed = [d for d in log if d.get("event_id") == event_id and d.get("status") in ("failed", "retrying")]
    if not failed:
        raise HTTPException(status_code=404, detail="Nenhuma delivery falhada encontrada para este evento")

    retried = []
    hooks = {h["id"]: h for h in load_webhooks()}
    event_log = load_event_log()
    event = next((e for e in event_log if e.get("id") == event_id), None)
    if not event:
        raise HTTPException(
            status_code=404,
            detail="Evento original não encontrado no log (pode ter sido removido por rotação).",
        )

    for delivery in failed:
        hook = hooks.get(delivery.get("webhook_id"))
        retry_cfg = (hook.get("retry_config") if hook else None) or {}
        url = delivery.get("url", "").strip()
        secret = (hook.get("secret", "") if hook else "")

        delivery["status"] = "retrying"
        delivery["last_error"] = None
        _record_delivery(delivery)

        t = threading.Thread(
            target=_deliver_webhook,
            args=(url, secret, event),
            kwargs={
                "webhook_id": delivery.get("webhook_id", 0),
                "max_retries": retry_cfg.get("max_retries", _DEFAULT_RETRY_MAX),
                "retry_delay": retry_cfg.get("retry_delay", _DEFAULT_RETRY_DELAY),
                "retry_backoff": retry_cfg.get("retry_backoff", _DEFAULT_RETRY_BACKOFF),
                "delivery_id": delivery["id"],
            },
            daemon=True,
        )
        t.start()
        retried.append(delivery["id"])

    return {"message": f"{len(retried)} deliveries em reprocessamento", "delivery_ids": retried}


# ─────────────────────────────────────────────────────────────────────────────
# SLA & Metrics Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/sla/alerts")
def sla_alerts(status: str | None = "open"):
    """Return SLA violation alerts.

    ?status=open (default) | resolved | dismissed | all
    """
    # Lazily scan for new violations
    check_sla_violations()

    violations = load_sla_violations()
    if status and status != "all":
        violations = [v for v in violations if v.get("status") == status]
    violations.sort(key=lambda v: v.get("id", 0), reverse=True)

    # Enrich with current task info
    tasks = {t["taskId"]: t for t in load_workflow_tasks()}
    enriched = []
    for v in violations:
        t = tasks.get(v.get("taskId"), {})
        entry = {**v}
        entry["taskStatus"] = t.get("status")
        entry["assignee"] = t.get("assignee") or v.get("assignee")
        due = _parse_iso(v.get("dueAt"))
        if due:
            overdue_secs = (datetime.now() - due).total_seconds()
            entry["overdueSeconds"] = max(0, overdue_secs)
            entry["overdueHuman"] = _format_duration(max(0, overdue_secs))
        enriched.append(entry)
    return {"data": enriched, "total": len(enriched)}


@app.post("/sla/alerts/{violation_id}/dismiss")
def dismiss_sla_alert(violation_id: int):
    """Dismiss an SLA alert (acknowledge but don't resolve)."""
    with _data_lock:
        violations = load_sla_violations()
        v = next((v for v in violations if v.get("id") == violation_id), None)
        if not v:
            raise HTTPException(status_code=404, detail="Violação não encontrada")
        v["status"] = "dismissed"
        v["dismissedAt"] = now_iso()
        save_sla_violations(violations)
    return v


@app.get("/sla/overdue-tasks")
def sla_overdue_tasks():
    """List all pending tasks that are currently past their SLA deadline."""
    now = datetime.now()
    tasks = load_workflow_tasks()
    overdue = []
    for t in tasks:
        if t.get("status") != "pending":
            continue
        due = _parse_iso(t.get("dueAt"))
        if not due:
            continue
        if now > due:
            overdue_secs = (now - due).total_seconds()
            overdue.append({
                "taskId": t.get("taskId"),
                "opportunityId": t.get("opportunityId"),
                "nodeId": t.get("nodeId"),
                "label": t.get("label"),
                "assignee": t.get("assignee"),
                "assignedRole": t.get("assignedRole"),
                "slaHours": t.get("slaHours"),
                "dueAt": t.get("dueAt"),
                "createdAt": t.get("createdAt"),
                "overdueSeconds": overdue_secs,
                "overdueHuman": _format_duration(overdue_secs),
            })
    overdue.sort(key=lambda x: x["overdueSeconds"], reverse=True)
    return {"data": overdue, "total": len(overdue)}


@app.get("/metrics/tasks")
def metrics_tasks(opportunity_id: int | None = None):
    """Per-task time metrics: duration, SLA compliance, etc."""
    tasks = load_workflow_tasks()
    if opportunity_id is not None:
        tasks = [t for t in tasks if t.get("opportunityId") == opportunity_id]

    completed = [t for t in tasks if t.get("status") == "completed"]
    pending = [t for t in tasks if t.get("status") == "pending"]

    durations = [t.get("durationSeconds") for t in completed if t.get("durationSeconds") is not None]
    sla_set = [t for t in completed if t.get("slaHours") is not None]
    sla_breached = [t for t in sla_set if t.get("slaBreached")]

    now = datetime.now()
    at_risk = []
    for t in pending:
        due = _parse_iso(t.get("dueAt"))
        if due:
            remaining = (due - now).total_seconds()
            # At risk if < 25% of SLA time remains
            sla_secs = (t.get("slaHours") or 0) * 3600
            if sla_secs > 0 and remaining < sla_secs * 0.25:
                at_risk.append(t.get("taskId"))

    return {
        "totalTasks": len(tasks),
        "completed": len(completed),
        "pending": len(pending),
        "cancelled": len([t for t in tasks if t.get("status") == "cancelled"]),
        "avgDurationSeconds": round(sum(durations) / len(durations), 1) if durations else None,
        "avgDurationHuman": _format_duration(sum(durations) / len(durations)) if durations else None,
        "minDurationSeconds": round(min(durations), 1) if durations else None,
        "maxDurationSeconds": round(max(durations), 1) if durations else None,
        "slaCompliance": {
            "total": len(sla_set),
            "breached": len(sla_breached),
            "onTime": len(sla_set) - len(sla_breached),
            "complianceRate": round((len(sla_set) - len(sla_breached)) / len(sla_set) * 100, 1) if sla_set else None,
        },
        "atRiskTaskIds": at_risk,
    }


@app.get("/metrics/workflows")
def metrics_workflows():
    """Aggregated workflow-level performance metrics."""
    instances = load_workflow_instances()
    tasks = load_workflow_tasks()

    total = len(instances)
    by_status = {}
    durations = []

    for inst in instances:
        s = inst.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1

        if s == "completed":
            started = _parse_iso(inst.get("startedAt"))
            updated = _parse_iso(inst.get("updatedAt"))
            if started and updated:
                durations.append((updated - started).total_seconds())

    # Per-step average durations across all tasks
    step_durations: dict[str, list[float]] = {}
    for t in tasks:
        if t.get("status") == "completed" and t.get("durationSeconds"):
            label = t.get("label") or t.get("nodeId") or "unknown"
            step_durations.setdefault(label, []).append(t["durationSeconds"])

    step_avg = {}
    for label, durs in step_durations.items():
        avg = sum(durs) / len(durs)
        step_avg[label] = {
            "avgSeconds": round(avg, 1),
            "avgHuman": _format_duration(avg),
            "count": len(durs),
            "minSeconds": round(min(durs), 1),
            "maxSeconds": round(max(durs), 1),
        }

    return {
        "totalWorkflows": total,
        "byStatus": by_status,
        "completedWorkflows": {
            "count": len(durations),
            "avgDurationSeconds": round(sum(durations) / len(durations), 1) if durations else None,
            "avgDurationHuman": _format_duration(sum(durations) / len(durations)) if durations else None,
            "minDurationSeconds": round(min(durations), 1) if durations else None,
            "maxDurationSeconds": round(max(durations), 1) if durations else None,
        },
        "stepPerformance": step_avg,
    }


@app.get("/metrics/dashboard")
def metrics_dashboard():
    """Combined performance dashboard with all key indicators."""
    check_sla_violations()

    tasks_metrics = metrics_tasks()
    workflow_metrics = metrics_workflows()
    violations = load_sla_violations()
    open_violations = [v for v in violations if v.get("status") == "open"]

    now = datetime.now()
    pending_tasks = [t for t in load_workflow_tasks() if t.get("status") == "pending"]
    overdue_count = 0
    at_risk_count = 0
    for t in pending_tasks:
        due = _parse_iso(t.get("dueAt"))
        if due:
            if now > due:
                overdue_count += 1
            else:
                remaining = (due - now).total_seconds()
                sla_secs = (t.get("slaHours") or 0) * 3600
                if sla_secs > 0 and remaining < sla_secs * 0.25:
                    at_risk_count += 1

    return {
        "tasks": tasks_metrics,
        "workflows": workflow_metrics,
        "sla": {
            "openViolations": len(open_violations),
            "overdueTasks": overdue_count,
            "atRiskTasks": at_risk_count,
            "totalViolations": len(violations),
        },
        "generatedAt": now_iso(),
    }


@app.get("/metrics/task/{task_id}")
def metrics_single_task(task_id: int):
    """Detailed metrics for a single task."""
    tasks = load_workflow_tasks()
    task = next((t for t in tasks if t.get("taskId") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")

    now = datetime.now()
    elapsed = None
    remaining = None
    sla_status = "no_sla"

    created = _parse_iso(task.get("createdAt"))
    completed = _parse_iso(task.get("completedAt"))
    due = _parse_iso(task.get("dueAt"))

    if created:
        end = completed or now
        elapsed = (end - created).total_seconds()

    if due:
        if task.get("status") == "completed":
            sla_status = "breached" if task.get("slaBreached") else "on_time"
        elif task.get("status") == "pending":
            remaining = (due - now).total_seconds()
            sla_secs = (task.get("slaHours") or 0) * 3600
            if remaining <= 0:
                sla_status = "overdue"
            elif sla_secs > 0 and remaining < sla_secs * 0.25:
                sla_status = "at_risk"
            else:
                sla_status = "on_track"

    return {
        "taskId": task_id,
        "label": task.get("label"),
        "status": task.get("status"),
        "assignee": task.get("assignee"),
        "slaHours": task.get("slaHours"),
        "dueAt": task.get("dueAt"),
        "createdAt": task.get("createdAt"),
        "completedAt": task.get("completedAt"),
        "elapsedSeconds": round(elapsed, 1) if elapsed else None,
        "elapsedHuman": _format_duration(elapsed) if elapsed else None,
        "remainingSeconds": round(remaining, 1) if remaining is not None else None,
        "remainingHuman": _format_duration(remaining) if remaining is not None and remaining > 0 else None,
        "durationSeconds": task.get("durationSeconds"),
        "durationHuman": _format_duration(task["durationSeconds"]) if task.get("durationSeconds") else None,
        "slaStatus": sla_status,
        "slaBreached": task.get("slaBreached", False),
    }


@app.put("/sla/config")
def update_sla_config(body: dict = Body(...)):
    """Update SLA hours for specific nodes in a BPMN (per opportunity).

    Body: { opportunityId: int, nodes: { nodeId: slaHours, ... } }
    """
    op_id = body.get("opportunityId")
    nodes_config = body.get("nodes") or {}
    if not op_id or not nodes_config:
        raise HTTPException(status_code=400, detail="opportunityId e nodes são obrigatórios")

    opp = _find_opportunity(op_id)
    bpmn = opp.get("nodes") or opp.get("bpmn", {}).get("nodes") or []

    updated = []
    with _data_lock:
        opps = load_oportunidades_data()
        for o in opps:
            if o.get("id") != op_id:
                continue
            nodes = o.get("nodes") or o.get("bpmn", {}).get("nodes") or []
            for n in nodes:
                nid = n.get("id")
                if nid in nodes_config:
                    n["slaHours"] = nodes_config[nid]
                    updated.append(nid)
            save_oportunidades_data(opps)
            break

    # Also update pending tasks with new SLA
    with _data_lock:
        tasks = load_workflow_tasks()
        for t in tasks:
            if t.get("opportunityId") == op_id and t.get("status") == "pending":
                nid = t.get("nodeId")
                if nid in nodes_config:
                    sla_h = nodes_config[nid]
                    t["slaHours"] = sla_h
                    t["dueAt"] = _compute_due_at(t["createdAt"], sla_h)
                    t["updatedAt"] = now_iso()
        save_workflow_tasks(tasks)

    return {"updated_nodes": updated, "message": f"SLA atualizado para {len(updated)} nó(s)"}


@app.get("/queue/status")
def queue_status():
    """Return current task queue backend status."""
    q_type = "celery" if isinstance(task_queue, _CeleryQueue) else "local"
    info = {"backend": q_type}
    if q_type == "celery":
        info["broker_url"] = os.environ.get("CELERY_BROKER_URL", "")[:50] + "..."
        info["available"] = getattr(task_queue, "_available", False)
    else:
        info["description"] = "Fila local em-processo (threads). Para produção, configure CELERY_BROKER_URL."
    return info


def _format_duration(seconds: float | None) -> str | None:
    """Convert seconds to human-readable duration string."""
    if seconds is None:
        return None
    seconds = abs(seconds)
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        m = int(seconds // 60)
        s = int(seconds % 60)
        return f"{m}min {s}s"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    if h >= 24:
        d = h // 24
        h = h % 24
        return f"{d}d {h}h {m}min"
    return f"{h}h {m}min"


@app.post("/workflow/{op_id}/generate-objective")
async def workflow_generate_objective(op_id: int):
    """Generate an AI objective summary after workflow completion."""
    opp = _find_opportunity(op_id)
    state = _load_workflow_state(op_id)
    if not state:
        return {"objective": "Workflow não iniciado."}

    executed = state.get("executed", [])
    labels = [s.get("label", "") for s in executed if s.get("status") == "completed"]
    opp_name = opp.get("nome") or opp.get("name") or "Oportunidade"

    return {
        "objective": f"Processo '{opp_name}' concluído com sucesso. "
                     f"Etapas executadas: {', '.join(labels) if labels else 'nenhuma'}."
    }


@app.post("/workflow/{op_id}/generate-report")
async def workflow_generate_report(op_id: int, request: Request):
    """Generate a structured report from executed workflow steps."""
    body = await request.json()
    executed = body.get("executed") or []
    opp = _find_opportunity(op_id)
    opp_name = opp.get("nome") or opp.get("name") or "Oportunidade"

    sections = []
    for step in executed:
        label = step.get("label", "Etapa")
        status = step.get("status", "")
        decision = step.get("decision", "")
        section_body = f"Status: {status}"
        if decision:
            section_body += f" | Decisão: {decision}"
        sections.append({"heading": label, "body": section_body})

    return {
        "documentTitle": f"Relatório — {opp_name}",
        "bpmnName": opp_name,
        "preamble": f"Relatório de execução do processo '{opp_name}'.",
        "sections": sections,
        "conclusion": f"O processo foi executado com {len(executed)} etapa(s).",
    }


@app.post("/workflow/{op_id}/generate-document")
async def workflow_generate_document(op_id: int, request: Request):
    """Generate a contextual document based on the BPMN process type using AI.

    Analyses the BPMN nodes and executed steps to produce a document that matches
    the business context (e.g. purchase order, enrollment form, approval report).
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    opp = _find_opportunity(op_id)
    opp_name = opp.get("nome") or opp.get("name") or "Oportunidade"

    # Load workflow state
    state = _load_workflow_state(op_id)
    executed = (state.get("executed") or []) if state else (body.get("executed") or [])
    wf_status = (state.get("status") if state else "not_started") or "not_started"

    # Load BPMN structure
    inst_version = state.get("bpmn_version") if state else None
    bpmn = _get_bpmn_safe(opp, inst_version)
    bpmn_name = bpmn.get("name") or opp_name
    nodes = bpmn.get("nodes") or []

    node_labels = [n.get("label", "") for n in nodes if n.get("active") is not False]
    node_types_summary = {}
    node_details = []
    for n in nodes:
        if n.get("active") is False:
            continue
        nt = n.get("nodeType", "task")
        node_types_summary[nt] = node_types_summary.get(nt, 0) + 1
        label = n.get("label", "")
        desc = (
            str(n.get("taskDescricao") or "").strip()
            or str(n.get("condicionalDescricao") or "").strip()
            or str(n.get("descricao") or "").strip()
        )
        detail = f"{label} [{nt}]"
        if desc and desc.lower() != label.lower():
            detail += f": {desc}"
        node_details.append(detail)

    executed_summary = []
    for step in executed:
        entry = f"- {step.get('label', 'Etapa')}: status={step.get('status', '')}"
        if step.get("decision"):
            entry += f", decisão={step['decision']}"
        if step.get("formData"):
            form_items = []
            for k, v in step["formData"].items():
                form_items.append(f"{k}={v}")
            if form_items:
                entry += f" [{', '.join(form_items[:8])}]"
        executed_summary.append(entry)

    # Build prompt for contextual document generation
    system_prompt = (
        "Você é um gerador de documentos empresariais detalhados e completos. "
        "Com base no processo BPMN descrito, gere um documento formal, contextual e RICO EM CONTEÚDO. "
        "O documento deve ser do TIPO correto para o processo: "
        "- Se for aprovação de pedido de compra → gere um Pedido de Compra ou Ordem de Compra. "
        "- Se for matrícula → gere um Formulário/Comprovante de Matrícula. "
        "- Se for contratação → gere um Termo de Contratação. "
        "- Se for aprovação de crédito → gere um Parecer de Crédito. "
        "- Se for onboarding → gere um Checklist de Onboarding. "
        "- Se for solicitação de serviço → gere uma Ordem de Serviço. "
        "- Para qualquer outro processo, gere o documento mais adequado ao contexto. "
        "REGRAS: "
        "(1) Retorne SOMENTE JSON válido, sem markdown. "
        "(2) O JSON deve ter este formato: "
        '{"documentType":"<tipo do documento>","documentTitle":"<título>","header":{"fields":[{"label":"<rótulo>","value":"<valor ou placeholder>"}]},'
        '"sections":[{"heading":"<título da seção>","body":"<conteúdo detalhado>"}],'
        '"footer":"<texto do rodapé>","signatureFields":["<nome do campo de assinatura>"]}. '
        "(3) Use dados reais das etapas executadas quando disponíveis. "
        "(4) Preencha campos com valores plausíveis baseados no contexto quando dados reais não existirem. "
        "(5) O documento deve parecer profissional e pronto para uso. "
        "(6) CADA SEÇÃO deve ter conteúdo DETALHADO com pelo menos 2-4 frases, "
        "descrevendo o que foi realizado, verificado ou decidido naquela etapa. "
        "Use as descrições das etapas fornecidas para enriquecer o texto. "
        "NÃO use texto genérico ou vago. "
        "(7) Inclua de 5 a 12 seções dependendo da complexidade do processo. "
        "Quanto mais etapas o processo tiver, mais seções o documento deve conter. "
        "(8) O body de cada seção deve refletir a descrição da etapa correspondente, "
        "expandindo com detalhes operacionais, resultados e observações relevantes."
    )

    user_prompt = json.dumps({
        "processName": bpmn_name,
        "opportunityName": opp_name,
        "workflowStatus": wf_status,
        "nodeLabels": node_labels[:30],
        "nodeDetails": node_details[:30],
        "nodeTypeCounts": node_types_summary,
        "executedSteps": executed_summary[:20],
        "totalNodes": len(nodes),
    }, ensure_ascii=False)

    # Try AI generation
    doc_data = None
    ai_error = None

    try:
        api_url = None
        api_key = None
        model = None
        headers = {}

        # Geração de documento precisa de modelo capaz para texto rico e detalhado
        _DOC_MODEL_GROQ = "openai/gpt-oss-120b"
        if AI_PROVIDER == "openai" and OPENAI_API_KEY:
            api_url = "https://api.openai.com/v1/chat/completions"
            api_key = OPENAI_API_KEY
            model = OPENAI_MODEL
        elif GROQ_API_KEY:
            api_url = "https://api.groq.com/openai/v1/chat/completions"
            api_key = GROQ_API_KEY
            model = _DOC_MODEL_GROQ

        if api_url and api_key:
            _DOC_MODELS = [model]
            # Add fallback models for Groq
            if "groq" in api_url:
                _DOC_MODELS = [
                    "openai/gpt-oss-120b",
                    "llama-3.3-70b-versatile",
                    "qwen/qwen3-32b",
                    "llama-3.1-8b-instant",
                ]

            MAX_RETRIES = 3
            for attempt_model in _DOC_MODELS:
                for attempt in range(MAX_RETRIES):
                    try:
                        response = requests.post(
                            api_url,
                            headers={
                                "Authorization": f"Bearer {api_key}",
                                "Content-Type": "application/json",
                            },
                            json={
                                "model": attempt_model,
                                "temperature": 0.3,
                                "response_format": {"type": "json_object"},
                                "messages": [
                                    {"role": "system", "content": system_prompt},
                                    {"role": "user", "content": user_prompt},
                                ],
                            },
                            timeout=AI_LLM_TIMEOUT_SECONDS,
                        )

                        if response.ok:
                            payload = response.json()
                            choices = payload.get("choices") or []
                            if choices:
                                first = choices[0] if isinstance(choices[0], dict) else {}
                                message = first.get("message") or {}
                                content = message.get("content", "")
                                try:
                                    doc_data = json.loads(content)
                                    ai_error = None
                                    break
                                except json.JSONDecodeError:
                                    ai_error = "Resposta da IA não é JSON válido"
                        elif response.status_code == 429:
                            import time as _time
                            wait = min(2 ** attempt * 2, 15)
                            _time.sleep(wait)
                            ai_error = f"LLM HTTP 429 (rate limit)"
                            continue
                        else:
                            ai_error = f"LLM HTTP {response.status_code}"
                            break
                    except Exception as exc:
                        ai_error = str(exc)
                        break
                if doc_data:
                    break
    except Exception as exc:
        ai_error = str(exc)

    # AI generation is required — return error if it failed
    if not doc_data:
        raise HTTPException(
            status_code=503,
            detail=f"Não foi possível gerar o documento com IA. Tente novamente em alguns segundos. Erro: {ai_error or 'desconhecido'}",
        )

    doc_data["_meta"] = {
        "aiGenerated": True,
        "aiError": ai_error,
        "processName": bpmn_name,
        "opportunityName": opp_name,
    }

    return doc_data


# ─────────────────────────────────────────────────────────────────────────────
# Documentos — CRUD for persisted generated documents
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/documentos")
def list_documentos(owner: str | None = None, opportunity_id: int | None = None):
    """List all saved documents, optionally filtered by owner and/or opportunityId."""
    docs = load_documentos_data()
    if owner:
        docs = [d for d in docs if str(d.get("owner", "")).lower() == owner.lower()]
    if opportunity_id is not None:
        docs = [d for d in docs if d.get("opportunityId") == opportunity_id]
    docs.sort(key=lambda d: d.get("createdAt", ""), reverse=True)
    return {"data": docs, "total": len(docs)}


@app.get("/documentos/{doc_id}")
def get_documento(doc_id: int):
    """Get a single document by ID."""
    docs = load_documentos_data()
    doc = next((d for d in docs if d.get("id") == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    return doc


@app.post("/documentos")
async def create_documento(request: Request):
    """Save a generated document."""
    body = await request.json()
    with _data_lock:
        docs = load_documentos_data()
        new_id = max((d.get("id", 0) for d in docs), default=0) + 1
        doc = {
            "id": new_id,
            "opportunityId": body.get("opportunityId"),
            "documentType": body.get("documentType", "Documento"),
            "documentTitle": body.get("documentTitle", "Sem título"),
            "header": body.get("header") or {},
            "sections": body.get("sections") or [],
            "footer": body.get("footer", ""),
            "signatureFields": body.get("signatureFields") or [],
            "owner": body.get("owner", ""),
            "processName": body.get("processName", ""),
            "aiGenerated": body.get("aiGenerated", False),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        docs.append(doc)
        save_documentos_data(docs)
    return doc


@app.delete("/documentos/{doc_id}")
def delete_documento(doc_id: int):
    """Delete a saved document."""
    with _data_lock:
        docs = load_documentos_data()
        idx = next((i for i, d in enumerate(docs) if d.get("id") == doc_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Documento não encontrado.")
        docs.pop(idx)
        save_documentos_data(docs)
    return {"msg": "Documento removido."}


@app.put("/documentos/{doc_id}")
async def update_documento(doc_id: int, request: Request):
    """Update an existing document."""
    body = await request.json()
    with _data_lock:
        docs = load_documentos_data()
        idx = next((i for i, d in enumerate(docs) if d.get("id") == doc_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Documento não encontrado.")
        doc = docs[idx]
        if "documentTitle" in body:
            doc["documentTitle"] = body["documentTitle"]
        if "documentType" in body:
            doc["documentType"] = body["documentType"]
        if "header" in body:
            doc["header"] = body["header"]
        if "sections" in body:
            doc["sections"] = body["sections"]
        if "footer" in body:
            doc["footer"] = body["footer"]
        if "signatureFields" in body:
            doc["signatureFields"] = body["signatureFields"]
        doc["updatedAt"] = datetime.now(timezone.utc).isoformat()
        docs[idx] = doc
        save_documentos_data(docs)
    return doc


@app.post("/workflow/{op_id}/suggest")
async def workflow_suggest(op_id: int, authorization: str = Header(...)):
    """Suggest next action for a workflow paused at a gateway/task node.

    Returns a recommendation based on the current node type, executed history,
    and SLA status.
    """
    # Lightweight auth check (get_current_user defined later in file)
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    opp = _find_opportunity(op_id)
    state = _load_workflow_state(op_id)
    if not state:
        raise HTTPException(status_code=404, detail="Workflow não iniciado")

    status = state.get("status", "")
    if status not in ("paused", "running"):
        return {"suggestion": None, "reason": f"Workflow está '{status}'."}

    current_node_id = state.get("current_node")
    bpmn = opp.get("bpmn") or {}
    nodes = bpmn.get("nodes") or []
    node = next((n for n in nodes if n.get("id") == current_node_id), None)

    if not node:
        return {"suggestion": None, "reason": "Nó atual não encontrado no BPMN."}

    node_type = node.get("nodeType", "")
    paused_reason = state.get("paused_reason", "")
    executed = state.get("executed") or []
    executed_labels = [s.get("label", "") for s in executed if s.get("status") == "completed"]

    # Build suggestion based on node type
    if node_type == "condicional":
        connections = bpmn.get("connections") or []
        outgoing = [c for c in connections if c.get("from") == current_node_id]
        options = []
        for c in outgoing:
            target = next((n for n in nodes if n.get("id") == c.get("to")), None)
            lbl = c.get("label") or (target.get("label") if target else "")
            if lbl:
                options.append(lbl)
        return {
            "suggestion": options[0] if options else "sim",
            "options": options,
            "reason": f"Gateway condicional '{node.get('label', '')}'. Opções: {', '.join(options) or 'sim/não'}.",
            "nodeType": node_type,
            "currentNode": node.get("label", current_node_id),
        }
    elif node_type == "task":
        # Check SLA urgency
        tasks = load_workflow_tasks()
        related = [t for t in tasks if t.get("opportunityId") == op_id and t.get("nodeId") == current_node_id and t.get("status") == "pending"]
        sla_warning = ""
        if related:
            from datetime import datetime as _dt
            for rt in related:
                due = _parse_iso(rt.get("dueAt"))
                if due and _dt.now() > due:
                    sla_warning = " ⚠️ ATENÇÃO: SLA expirado!"
                    break
        return {
            "suggestion": "complete",
            "reason": f"Tarefa '{node.get('label', '')}' aguardando conclusão.{sla_warning}",
            "nodeType": node_type,
            "currentNode": node.get("label", current_node_id),
        }
    elif node_type == "entidade":
        return {
            "suggestion": "complete",
            "reason": f"Preencha os dados da entidade '{node.get('label', '')}' para avançar.",
            "nodeType": node_type,
            "currentNode": node.get("label", current_node_id),
        }
    else:
        return {
            "suggestion": None,
            "reason": f"Nó '{node.get('label', current_node_id)}' do tipo '{node_type}'.",
            "nodeType": node_type,
            "currentNode": node.get("label", current_node_id),
        }


# ---------------------------------------------------------------------------
# Authentication helpers (JWT with fake-token backward-compatibility)
# ---------------------------------------------------------------------------
def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.split()[1]

    # --- Backward-compatible: accept legacy fake-token-<id> ---
    if token.startswith("fake-token-"):
        try:
            user_id = int(token.replace("fake-token-", ""))
        except Exception:
            raise HTTPException(status_code=401, detail="Token inválido")
        user = get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="Token inválido")
        user_dict = {k: v for k, v in user.items() if k != "senha"}
        user_dict["admin"] = user.get("admin", False)
        user_dict["role"] = user.get("role", "user")
        user_dict["permissions"] = get_role_permissions(user_dict["role"])
        return user_dict

    # --- JWT token ---
    payload = decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token expirado ou inválido")
    if payload.get("type") not in ("access", None):
        raise HTTPException(status_code=401, detail="Token inválido (use access token)")

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    user_dict = {k: v for k, v in user.items() if k != "senha"}
    user_dict["admin"] = user.get("admin", False)
    user_dict["role"] = user.get("role", "user")
    user_dict["permissions"] = get_role_permissions(user_dict["role"])
    return user_dict


def require_permission(*perms: str):
    """FastAPI dependency factory: check that the current user has ALL given permissions."""
    def _checker(current_user: dict = Depends(get_current_user)):
        user_perms = current_user.get("permissions") or get_role_permissions(current_user.get("role", "user"))
        missing = [p for p in perms if p not in user_perms]
        if missing:
            raise HTTPException(
                status_code=403,
                detail=f"Permissão insuficiente. Necessário: {', '.join(missing)}",
            )
        return current_user
    return _checker


def require_role(*roles: str):
    """FastAPI dependency factory: check that the current user has one of the given roles."""
    def _checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role", "user") not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Acesso restrito aos perfis: {', '.join(roles)}",
            )
        return current_user
    return _checker


# Endpoint para retornar o usuário autenticado
@app.get("/users/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "nome": current_user["nome"],
        "email": current_user["email"],
        "ativo": current_user.get("ativo", True),
        "created_at": current_user.get("created_at", ""),
        "admin": current_user.get("admin", False),
        "role": current_user.get("role", "user"),
        "nivel": str(current_user.get("nivel", "1")),
        "cargo": current_user.get("cargo", ""),
        "permissions": current_user.get("permissions", []),
    }


@app.get("/users/by-role/{role}")
def get_users_by_role(role: str, current_user: dict = Depends(get_current_user)):
    """Return users with a given role (for task assignment dropdowns)."""
    users = load_users_data()
    result = []
    for u in users:
        u_role = u.get("role", "user")
        if u_role == role and u.get("ativo", True):
            result.append({
                "id": u["id"],
                "nome": u.get("nome", ""),
                "email": u.get("email", ""),
                "role": u_role,
                "cargo": u.get("cargo", ""),
            })
    return {"data": result}


# ─────────────────────────────────────────────────────────────────────────────
# UserTask API endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/workflow/tasks")
def list_all_tasks(
    status: str | None = None,
    assignee: str | None = None,
    assigned_role: str | None = None,
    opportunity_id: int | None = None,
    my_tasks: bool = False,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """List workflow tasks, optionally filtered. Use my_tasks=true to see only tasks
    assigned to the current user (by name, id, or role)."""
    tasks = load_workflow_tasks()
    oportunidades = load_oportunidades_data()
    opp_map = {o.get("id"): o for o in oportunidades if isinstance(o, dict)}

    user_role = current_user.get("role", "user")
    user_name = current_user.get("nome", "")
    user_id = current_user.get("id")

    result = []
    for t in tasks:
        if status and t.get("status") != status:
            continue
        if assignee and (t.get("assignee") or "").lower() != assignee.lower():
            continue
        if assigned_role and (t.get("assignedRole") or "").lower() != assigned_role.lower():
            continue
        if opportunity_id is not None and t.get("opportunityId") != opportunity_id:
            continue
        # Filter to only tasks relevant to the current user
        if my_tasks:
            is_assigned_to_me = (
                (t.get("assignee") or "").lower() == user_name.lower()
                or t.get("assigneeId") == user_id
                or (t.get("assignedRole") and t["assignedRole"] == user_role)
                or (not t.get("assignee") and not t.get("assignedRole"))  # unassigned = visible to all
            )
            if not is_assigned_to_me:
                continue

        # Text search filter (label, assignee, opportunityName)
        if search:
            q = search.strip().lower()
            opp_name = (opp_map.get(t.get("opportunityId")) or {}).get("nome") or ""
            searchable = f"{t.get('label','')} {t.get('assignee','')} {opp_name}".lower()
            if q not in searchable:
                continue

        # Date range filter on createdAt
        if date_from:
            created = t.get("createdAt") or ""
            if created < date_from:
                continue
        if date_to:
            created = t.get("createdAt") or ""
            if created[:10] > date_to[:10]:
                continue

        opp = opp_map.get(t.get("opportunityId")) or {}
        task_entry = {
            **t,
            "opportunityName": opp.get("nome") or opp.get("name") or f"Oportunidade #{t.get('opportunityId')}",
        }
        # Backfill assignee from opportunity responsavel if missing
        if not task_entry.get("assignee") and not task_entry.get("assignedRole"):
            fallback = (
                str(opp.get("responsavel") or opp.get("assignedTo") or "").strip()
            )
            if fallback and fallback != "N/A":
                task_entry["assignee"] = fallback
        result.append(task_entry)

    # pending first, then by updatedAt desc
    status_order = {"pending": 0, "completed": 1, "cancelled": 2}
    result.sort(key=lambda x: (
        status_order.get(x.get("status"), 9),
        -(x.get("updatedAt") or x.get("createdAt") or "").count(""),
    ))

    return {"data": result, "total": len(result)}


@app.get("/workflow/tasks/{task_id}")
def get_task(task_id: int):
    """Get a single task by ID."""
    tasks = load_workflow_tasks()
    task = next((t for t in tasks if t.get("taskId") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    return task


@app.post("/workflow/tasks/{task_id}/complete")
async def complete_task(task_id: int, request: Request):
    """
    Complete a UserTask by its task ID. This:
    1. Validates formData against the task's formSchema
    2. Marks the task record as completed
    3. Advances the workflow engine past the completed node
    4. If engine pauses at a new UserTask, creates a new task record
    Returns the updated workflow state.
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    form_data = body.get("formData") or {}
    completed_by = body.get("completedBy") or body.get("userName") or None

    # 1. Find the task
    tasks = load_workflow_tasks()
    task = next((t for t in tasks if t.get("taskId") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    if task["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Task já está com status '{task['status']}'")

    # 1b. Validate formData against formSchema
    form_schema = task.get("formSchema") or []
    if form_schema:
        validation_errors = _validate_form_data(form_data, form_schema)
        if validation_errors:
            raise HTTPException(status_code=422, detail={
                "message": "Dados do formulário inválidos",
                "errors": validation_errors,
            })
    op_id = task["opportunityId"]
    node_id = task["nodeId"]

    # 2. Mark task as completed
    _complete_user_task(task_id, completed_by=completed_by, form_data=form_data)

    # 3. Advance the workflow
    opp = _find_opportunity(op_id)

    state = _load_workflow_state(op_id)
    if not state:
        raise HTTPException(status_code=400, detail="Workflow não foi iniciado")

    # Use the BPMN version locked at instance start
    _task_inst_version = state.get("bpmn_version")
    bpmn = _get_bpmn(opp, _task_inst_version)

    context = dict(state.get("context") or {})
    context[f"completed_{node_id}"] = True
    if form_data:
        context.update(form_data)
        # Store form_responses per node for structured access
        form_responses = context.get("form_responses") or {}
        form_responses[node_id] = form_data
        context["form_responses"] = form_responses

    engine = WorkflowEngine(bpmn)
    start_id = engine.find_start_node()
    result = engine.run(start_id, context)

    _save_workflow_state(op_id, {
        "currentNodeId": result.get("currentNodeId"),
        "executed": result.get("executed", []),
        "context": context,
        "status": result["status"],
        "startedAt": state.get("startedAt"),
    })

    # 4. If paused at a new UserTask, create task record
    current = result.get("currentNodeId")
    if current and result.get("paused_reason") == "user_input":
        existing = _get_pending_task(op_id, current)
        if not existing:
            node = engine.nodes.get(current, {})
            _create_user_task(op_id, current, node)

    # 5. Update opportunity metadata
    stage_index = engine.node_index(current) if current else len(engine.active_node_ids_in_order())
    with _data_lock:
        fake_oportunidades = load_oportunidades_data()
        for o in fake_oportunidades:
            if o.get("id") == op_id:
                o["stageIndex"] = stage_index
                o["currentNodeId"] = current
                o["bpmnCurrentNodeId"] = current
                o["activeNodeId"] = current
                if result["status"] == "completed":
                    o["status"] = "Concluído"
                break
        save_oportunidades_data(fake_oportunidades)

    # Emit workflow event for task-complete-driven advancement
    if result["status"] == "completed":
        emit_event("workflow_completed", {
            "opportunityId": op_id,
            "bpmnVersion": _task_inst_version,
            "executedCount": len(result.get("executed", [])),
        })
    elif result.get("paused_reason"):
        emit_event("workflow_paused", {
            "opportunityId": op_id,
            "currentNodeId": current,
            "pausedReason": result.get("paused_reason"),
        })

    return _build_response(engine, result, op_id, _task_inst_version)


@app.post("/workflow/tasks/{task_id}/assign")
async def assign_task(task_id: int, request: Request, current_user: dict = Depends(require_permission("tasks:assign"))):
    """Assign or reassign a UserTask to a user (by name/id) or to a role."""
    body = await request.json()
    assignee = body.get("assignee")
    assignee_id = body.get("assigneeId")
    assigned_role = body.get("assignedRole")  # NEW: role-based assignment

    with _data_lock:
        tasks = load_workflow_tasks()
        task = next((t for t in tasks if t.get("taskId") == task_id), None)
        if not task:
            raise HTTPException(status_code=404, detail="Task não encontrada")
        if task["status"] != "pending":
            raise HTTPException(status_code=400, detail="Só é possível atribuir tasks pendentes")
        task["assignee"] = assignee
        task["assigneeId"] = assignee_id
        task["assignedRole"] = assigned_role
        task["updatedAt"] = now_iso()
        save_workflow_tasks(tasks)

    emit_event("task_assigned", {
        "taskId": task_id,
        "opportunityId": task.get("opportunityId"),
        "assignee": assignee,
        "assignedRole": assigned_role,
    })

    # Email notification on task assignment
    _notify_task_email(task, event="assigned")

    return task


@app.delete("/workflow/tasks/{task_id}", status_code=204)
async def delete_task(task_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a workflow task."""
    with _data_lock:
        tasks = load_workflow_tasks()
        idx = next((i for i, t in enumerate(tasks) if t.get("taskId") == task_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Task não encontrada")
        removed = tasks.pop(idx)
        save_workflow_tasks(tasks)
    emit_event("task_deleted", {
        "taskId": task_id,
        "opportunityId": removed.get("opportunityId"),
        "label": removed.get("label"),
    })
    return


@app.post("/workflow/tasks/{task_id}/comment")
async def add_task_comment(task_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    """Add a comment/note to a task. Comments are stored as a list on the task record."""
    body = await request.json()
    text = str(body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto do comentário é obrigatório")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Comentário excede 2000 caracteres")

    with _data_lock:
        tasks = load_workflow_tasks()
        task = next((t for t in tasks if t.get("taskId") == task_id), None)
        if not task:
            raise HTTPException(status_code=404, detail="Task não encontrada")

        comments = task.get("comments") or []
        comment_id = max((c.get("id", 0) for c in comments), default=0) + 1
        comment = {
            "id": comment_id,
            "text": text,
            "author": current_user.get("nome") or "Anônimo",
            "authorId": current_user.get("id"),
            "createdAt": now_iso(),
        }
        comments.append(comment)
        task["comments"] = comments
        task["updatedAt"] = now_iso()
        save_workflow_tasks(tasks)

    return comment


@app.get("/workflow/tasks/{task_id}/comments")
def list_task_comments(task_id: int):
    """List all comments for a task."""
    tasks = load_workflow_tasks()
    task = next((t for t in tasks if t.get("taskId") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    comments = task.get("comments") or []
    return {"data": comments, "total": len(comments)}


@app.get("/entidades")
def get_entidades(owner: str = ""):
    global fake_entidades, fake_oportunidades
    fake_entidades = load_entidades_data()
    fake_oportunidades = load_oportunidades_data()
    usage_by_id = {}
    usage_by_name = {}

    for oportunidade in fake_oportunidades:
        bpmn = oportunidade.get("bpmn") if isinstance(oportunidade, dict) else None
        nodes = bpmn.get("nodes") if isinstance(bpmn, dict) else []
        if not isinstance(nodes, list):
            continue

        for node in nodes:
            if not isinstance(node, dict):
                continue
            if node.get("active") is False:
                continue
            node_type = str(node.get("nodeType") or "").strip().lower()
            if node_type and node_type != "entidade":
                continue

            raw_id = node.get("entidadeId")
            raw_name = str(node.get("entidadeNome") or node.get("label") or "").strip().lower()

            if raw_id is not None and str(raw_id).strip():
                key_id = str(raw_id).strip()
                usage_by_id[key_id] = usage_by_id.get(key_id, 0) + 1

            if raw_name:
                usage_by_name[raw_name] = usage_by_name.get(raw_name, 0) + 1

    enriched_entidades = []
    for entidade in fake_entidades:
        if not isinstance(entidade, dict):
            enriched_entidades.append(entidade)
            continue

        # Filter by owner if requested
        if owner.strip():
            ent_owner = (entidade.get("criadoPor") or "").lower()
            if ent_owner != owner.strip().lower():
                continue

        entidade_id = str(entidade.get("id") or "").strip()
        entidade_name = str(entidade.get("nome") or "").strip().lower()

        computed_usage = 0
        if entidade_id:
            computed_usage += usage_by_id.get(entidade_id, 0)
        if entidade_name:
            computed_usage += usage_by_name.get(entidade_name, 0)

        enriched_entidades.append(
            {
                **entidade,
                "bpmnUsageCount": computed_usage,
            }
        )

    return enriched_entidades

@app.post("/entidades", status_code=201)
def create_entidade(entidade: Entidade):
    global fake_entidades
    with _data_lock:
        fake_entidades = load_entidades_data()
        entidade_dict = entidade.dict()
        # Prevent duplicates: check if an entity with the same name already exists in the same category
        incoming_name = (entidade_dict.get("nome") or "").strip().lower()
        incoming_cat = (entidade_dict.get("categoria") or "").strip().lower()
        if incoming_name:
            existing = next(
                (e for e in fake_entidades
                 if (e.get("nome") or "").strip().lower() == incoming_name
                 and (e.get("categoria") or "").strip().lower() == incoming_cat),
                None,
            )
            if existing:
                # Return existing entity instead of creating a duplicate
                return existing
        new_id = max([e["id"] for e in fake_entidades], default=0) + 1
        now = now_iso()
        if not isinstance(entidade_dict.get("campos"), list):
            entidade_dict["campos"] = []
        entidade_dict["papelNegocio"] = _normalize_papel_negocio(
            entidade_dict.get("papelNegocio"),
            entidade_dict.get("tipoEntidade"),
            default="processo",
        )
        entidade_dict["id"] = new_id
        entidade_dict["created_at"] = now
        entidade_dict["updated_at"] = now
        entidade_dict["criadoPor"] = entidade_dict.get("criadoPor") or "admin"
        fake_entidades.append(entidade_dict)
        save_entidades_data(fake_entidades)
    # Log entity creation to related opportunity timelines
    _ent_name = entidade_dict.get("nome") or "Sem nome"
    for _oid in _find_opportunities_for_entity(entidade_dict):
        _append_opportunity_timeline(_oid, [{
            "title": f"Entidade criada: {_ent_name}",
            "description": f"A entidade '{_ent_name}' (categoria: {entidade_dict.get('categoria', '?')}) foi adicionada ao catálogo",
            "actionType": "create",
            "elementType": "entidade",
            "itemName": _ent_name,
        }])
    return entidade_dict


@app.put("/entidades/{entidade_id}")
def update_entidade(entidade_id: int, entidade: Entidade):
    global fake_entidades
    with _data_lock:
        fake_entidades = load_entidades_data()
        for idx, e in enumerate(fake_entidades):
            if e["id"] == entidade_id:
                entidade_dict = entidade.dict()
                incoming_campos = entidade_dict.get("campos")
                if not isinstance(incoming_campos, list):
                    entidade_dict["campos"] = (
                        e.get("campos") if isinstance(e.get("campos"), list) else []
                    )
                entidade_dict["papelNegocio"] = _normalize_papel_negocio(
                    entidade_dict.get("papelNegocio"),
                    entidade_dict.get("tipoEntidade"),
                    default=_normalize_papel_negocio(e.get("papelNegocio"), e.get("tipoEntidade"), default="processo"),
                )
                entidade_dict["id"] = entidade_id
                entidade_dict["created_at"] = e["created_at"]
                entidade_dict["updated_at"] = now_iso()
                entidade_dict["criadoPor"] = e["criadoPor"]
                fake_entidades[idx] = entidade_dict
                save_entidades_data(fake_entidades)
                # Log entity update to related opportunity timelines
                _ent_name = entidade_dict.get("nome") or "Sem nome"
                for _oid in _find_opportunities_for_entity(entidade_dict):
                    _append_opportunity_timeline(_oid, [{
                        "title": f"Entidade atualizada: {_ent_name}",
                        "description": f"A entidade '{_ent_name}' foi atualizada",
                        "actionType": "update",
                        "elementType": "entidade",
                        "itemName": _ent_name,
                    }])
                return entidade_dict
    raise HTTPException(status_code=404, detail="Entidade não encontrada")


@app.delete("/entidades/{entidade_id}", status_code=204)
def delete_entidade(entidade_id: int):
    global fake_entidades
    _deleted_entity = None
    with _data_lock:
        fake_entidades = load_entidades_data()
        idx = next((i for i, e in enumerate(fake_entidades) if e["id"] == entidade_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Entidade não encontrada")
        _deleted_entity = fake_entidades.pop(idx)
        save_entidades_data(fake_entidades)
    # Log entity deletion to related opportunity timelines
    if _deleted_entity:
        _ent_name = _deleted_entity.get("nome") or "Sem nome"
        for _oid in _find_opportunities_for_entity(_deleted_entity):
            _append_opportunity_timeline(_oid, [{
                "title": f"Entidade removida: {_ent_name}",
                "description": f"A entidade '{_ent_name}' foi removida do catálogo",
                "actionType": "delete",
                "elementType": "entidade",
                "itemName": _ent_name,
            }])
    return


@app.put("/entidades/batch/sync")
def batch_sync_entidades(payload: dict = Body(...)):
    """Sync multiple entities in a single request (one lock acquisition, one disk write)."""
    global fake_entidades
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items deve ser uma lista")

    results = []
    _batch_timeline_notes = []  # collect timeline notes for after lock release
    acquired = _data_lock.acquire(timeout=5)
    if not acquired:
        raise HTTPException(
            status_code=503,
            detail="Sistema ocupado no momento. Tente sincronizar novamente.",
        )

    try:
        fake_entidades = load_entidades_data()
        changed = False

        for item in items:
            if not isinstance(item, dict):
                continue
            action = item.get("action", "upsert")
            entity_id = item.get("id")
            data = item.get("data", {})
            nome = data.get("nome", "")

            if action == "upsert" and entity_id is not None:
                # Update existing
                found = False
                for idx, e in enumerate(fake_entidades):
                    if e["id"] == int(entity_id):
                        if not isinstance(data.get("campos"), list):
                            data["campos"] = e.get("campos") if isinstance(e.get("campos"), list) else []
                        data["papelNegocio"] = _normalize_papel_negocio(
                            data.get("papelNegocio"),
                            data.get("tipoEntidade"),
                            default=_normalize_papel_negocio(e.get("papelNegocio"), e.get("tipoEntidade"), default="processo"),
                        )
                        data["id"] = int(entity_id)
                        data["created_at"] = e.get("created_at", now_iso())
                        data["updated_at"] = now_iso()
                        data["criadoPor"] = e.get("criadoPor", "admin")
                        fake_entidades[idx] = data
                        results.append(data)
                        changed = True
                        found = True
                        _batch_timeline_notes.append(("update", data))
                        break
                if not found:
                    results.append({"id": entity_id, "error": "not_found"})

            elif action == "upsert" and entity_id is None:
                # Create new — but first check for existing with same name+category
                incoming_name = (data.get("nome") or "").strip().lower()
                incoming_cat = (data.get("categoria") or "").strip().lower()
                existing_match = None
                if incoming_name:
                    existing_match = next(
                        (e for e in fake_entidades
                         if (e.get("nome") or "").strip().lower() == incoming_name
                         and (e.get("categoria") or "").strip().lower() == incoming_cat),
                        None,
                    )
                if existing_match:
                    results.append(existing_match)
                else:
                    new_id = max([e["id"] for e in fake_entidades], default=0) + 1
                    now = now_iso()
                    if not isinstance(data.get("campos"), list):
                        data["campos"] = []
                    data["papelNegocio"] = _normalize_papel_negocio(
                        data.get("papelNegocio"),
                        data.get("tipoEntidade"),
                        default="processo",
                    )
                    data["id"] = new_id
                    data["created_at"] = now
                    data["updated_at"] = now
                    data["criadoPor"] = data.get("criadoPor") or "admin"
                    fake_entidades.append(data)
                    results.append(data)
                    changed = True
                    _batch_timeline_notes.append(("create", data))

        if changed:
            save_entidades_data(fake_entidades)
    finally:
        _data_lock.release()

    # Log batch entity changes to related opportunity timelines
    for _b_action, _b_ent in _batch_timeline_notes:
        _b_name = _b_ent.get("nome") or "Sem nome"
        _b_title = f"Entidade criada: {_b_name}" if _b_action == "create" else f"Entidade atualizada: {_b_name}"
        _b_desc = f"A entidade '{_b_name}' foi {'adicionada ao' if _b_action == 'create' else 'atualizada no'} catálogo (sync)"
        for _oid in _find_opportunities_for_entity(_b_ent):
            _append_opportunity_timeline(_oid, [{
                "title": _b_title,
                "description": _b_desc,
                "actionType": _b_action,
                "elementType": "entidade",
                "itemName": _b_name,
            }])

    return {"items": results}


# ─── REGISTROS (instâncias de entidades: contatos, processos) ─────────────────

@app.get("/registros")
def get_registros(papelNegocio: str = "", entidadeId: str = ""):
    registros = load_registros_data()
    if not isinstance(registros, list):
        registros = []
    result = registros
    if papelNegocio.strip():
        result = [r for r in result if str(r.get("papelNegocio", "")).lower() == papelNegocio.strip().lower()]
    if entidadeId.strip():
        result = [r for r in result if str(r.get("entidadeId", "")) == entidadeId.strip()]
    return result


@app.post("/registros/sync-contatos")
def sync_registros_contatos():
    """Sincroniza todos os registros com papelNegocio='contato' para contatos.json"""
    registros = load_registros_data()
    if not isinstance(registros, list):
        registros = []
    
    count = 0
    for registro in registros:
        if registro.get("papelNegocio") == "contato":
            try:
                _sync_registro_contato_to_independent_table(registro)
                count += 1
                print(f"[OK] Sincronizado contato de registro {registro.get('id')}")
            except Exception as e:
                print(f"[ERRO] Falha ao sincronizar registro {registro.get('id')}: {e}")
    
    print(f"[OK] Sincronizacao completa: {count} contatos")
    return {"message": f"Sincronizados {count} contatos", "count": count}


@app.post("/registros", status_code=201)
def create_registro(registro: Registro):
    with _data_lock:
        registros = load_registros_data()
        if not isinstance(registros, list):
            registros = []
        registro_dict = registro.dict()
        new_id = max((r["id"] for r in registros if isinstance(r.get("id"), int)), default=0) + 1
        now = now_iso()
        registro_dict["id"] = new_id
        registro_dict["created_at"] = now
        registro_dict["updated_at"] = now
        registro_dict["criadoPor"] = registro_dict.get("criadoPor") or "admin"
        registros.append(registro_dict)
        save_registros_data(registros)
    
    # Sincroniza registros de contato para contatos.json
    try:
        if registro_dict.get("papelNegocio") == "contato":
            _sync_registro_contato_to_independent_table(registro_dict)
    except Exception as e:
        print(f"[WARN] Falha ao sincronizar registro contato: {e}")
    
    return registro_dict


@app.put("/registros/{registro_id}")
def update_registro(registro_id: int, registro: Registro):
    with _data_lock:
        registros = load_registros_data()
        if not isinstance(registros, list):
            registros = []
        for idx, r in enumerate(registros):
            if r.get("id") == registro_id:
                registro_dict = registro.dict()
                registro_dict["id"] = registro_id
                registro_dict["created_at"] = r.get("created_at", now_iso())
                registro_dict["updated_at"] = now_iso()
                registro_dict["criadoPor"] = r.get("criadoPor", registro_dict.get("criadoPor", "admin"))
                registros[idx] = registro_dict
                save_registros_data(registros)
                
                # Sincroniza registros de contato para contatos.json
                try:
                    if registro_dict.get("papelNegocio") == "contato":
                        _sync_registro_contato_to_independent_table(registro_dict)
                except Exception as e:
                    print(f"[WARN] Falha ao sincronizar registro contato: {e}")
                
                return registro_dict
    raise HTTPException(status_code=404, detail="Registro não encontrado")


@app.delete("/registros/{registro_id}", status_code=204)
def delete_registro(registro_id: int):
    deleted_registro = None
    with _data_lock:
        registros = load_registros_data()
        if not isinstance(registros, list):
            registros = []
        idx = next((i for i, r in enumerate(registros) if r.get("id") == registro_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Registro não encontrado")
        deleted_registro = registros.pop(idx)
        save_registros_data(registros)
    
    # Sincroniza delete de registro contato para contatos.json
    try:
        if deleted_registro and deleted_registro.get("papelNegocio") == "contato":
            _delete_registro_contato_from_independent_table(deleted_registro)
    except Exception as e:
        print(f"[WARN] Falha ao sincronizar delete de registro contato: {e}")
    
    return


@app.get("/")
def read_root():
    return {"message": "API rodando com FastAPI!"}


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/bpmn-editor/state")
def get_bpmn_editor_state():
    global bpmn_editor_state
    bpmn_editor_state = load_bpmn_editor_state(
        BPMN_EDITOR_STATE_FILE,
        {
            "name": "Novo BPMN",
            "nodes": [],
            "connections": [],
            "updated_at": "",
        },
    )
    return bpmn_editor_state


@app.put("/bpmn-editor/state")
def update_bpmn_editor_state(payload: dict = Body(...)):
    global bpmn_editor_state

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload inválido")

    next_state = {
        "name": payload.get("name") or "Novo BPMN",
        "nodes": payload.get("nodes") if isinstance(payload.get("nodes"), list) else [],
        "connections": payload.get("connections") if isinstance(payload.get("connections"), list) else [],
        "updated_at": now_iso(),
    }

    acquired = _data_lock.acquire(timeout=5)
    if not acquired:
        raise HTTPException(
            status_code=503,
            detail="Sistema ocupado no momento. Tente salvar novamente.",
        )

    try:
        bpmn_editor_state = next_state
        save_bpmn_editor_state(BPMN_EDITOR_STATE_FILE, bpmn_editor_state)
    finally:
        _data_lock.release()
    return bpmn_editor_state


@app.post("/ai/detect-spreadsheet-tables")
def ai_detect_spreadsheet_tables(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Recebe dados brutos de uma planilha (2D array) e identifica tabelas empilhadas.
    Retorna as fronteiras de cada tabela (linha título, linha header, linhas de dados).
    """
    raw_rows = payload.get("rows") or []
    sheet_name = str(payload.get("sheetName") or "Planilha").strip()

    if not raw_rows or not isinstance(raw_rows, list):
        raise HTTPException(status_code=422, detail="Envie o campo 'rows' com os dados da planilha.")

    # Limita a amostra para não estourar o contexto da LLM
    sample = raw_rows[:80]

    if AI_PROVIDER != "groq" or not GROQ_API_KEY:
        return {"tables": []}

    system_prompt = (
        "Você é um especialista em análise de planilhas. "
        "Receba os dados brutos de uma aba de planilha Excel (linhas numeradas) e identifique TODAS as tabelas "
        "que existem empilhadas verticalmente na mesma aba.\n\n"
        "Cada tabela segue este padrão:\n"
        "1. Opcionalmente: uma linha de título (1 célula com texto, ex: 'Operação', 'Comercial', 'Financeiro')\n"
        "2. Uma linha de cabeçalho (múltiplas colunas com nomes das colunas)\n"
        "3. Várias linhas de dados\n"
        "4. Linhas em branco ou nova tabela\n\n"
        "Retorne JSON com:\n"
        "{\n"
        "  \"tables\": [\n"
        "    {\n"
        "      \"name\": \"Nome da tabela (do título ou inferido)\",\n"
        "      \"headerRow\": <índice 0-based da linha de cabeçalho>,\n"
        "      \"dataStartRow\": <índice 0-based da primeira linha de dados>,\n"
        "      \"dataEndRow\": <índice 0-based da última linha de dados (inclusive)>\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Regras:\n"
        "- Se há apenas 1 tabela, retorne 1 entrada.\n"
        "- Ignore linhas completamente vazias.\n"
        "- O nome da tabela deve vir da linha de título. Se não houver título, infira do conteúdo.\n"
        "- Retorne APENAS JSON, sem explicações."
    )

    # Formata linhas numeradas para a LLM
    rows_text = ""
    for i, row in enumerate(sample):
        cells = " | ".join(str(c) if c is not None and c != "" else "" for c in (row if isinstance(row, list) else [row]))
        rows_text += f"Linha {i}: {cells}\n"

    user_prompt = f"Aba: {sheet_name}\n\n{rows_text}"

    _MODEL = "llama-3.1-8b-instant"
    groq_payload = {
        "model": _MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    groq_headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

    try:
        resp = None
        _retry_waits = [2, 5, 10]
        for _attempt in range(len(_retry_waits) + 1):
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=groq_headers,
                json=groq_payload,
                timeout=AI_LLM_TIMEOUT_SECONDS,
            )
            if resp.status_code != 429 or _attempt >= len(_retry_waits):
                break
            wait = _retry_waits[_attempt]
            print(f"[detect-spreadsheet-tables] 429 rate limit, retry {_attempt + 1}/{len(_retry_waits)}, aguardando {wait}s")
            time.sleep(wait)
        if resp is not None and resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Limite de requisições da IA atingido.")
        if resp is None or not resp.ok:
            raise RuntimeError(f"Groq HTTP {resp.status_code if resp else 'no response'}")

        raw_json = resp.json()
        content = raw_json.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = json.loads(content)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[detect-spreadsheet-tables] Groq falhou: {exc}")
        return {"tables": []}

    tables = parsed.get("tables") or []
    # Sanitize
    sanitized = []
    for t in tables:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or f"Tabela {len(sanitized) + 1}").strip()
        header_row = t.get("headerRow")
        data_start = t.get("dataStartRow")
        data_end = t.get("dataEndRow")
        if header_row is None or data_start is None or data_end is None:
            continue
        try:
            header_row = int(header_row)
            data_start = int(data_start)
            data_end = int(data_end)
        except (ValueError, TypeError):
            continue
        if header_row < 0 or data_start <= header_row or data_end < data_start:
            continue
        sanitized.append({
            "name": name,
            "headerRow": header_row,
            "dataStartRow": data_start,
            "dataEndRow": data_end,
        })

    return {"tables": sanitized}


@app.post("/ai/parse-description")
def ai_parse_description(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Recebe nome do processo + descrição livre e retorna dados estruturados
    (entities, activities, conditionals, flowOrder) para pré-preencher o formulário da IA.
    """
    process_name = str(payload.get("processName") or "").strip()
    description  = str(payload.get("description") or "").strip()

    if not description and not process_name:
        raise HTTPException(status_code=422, detail="Informe ao menos o nome do processo ou a descrição.")

    if AI_PROVIDER != "groq" or not GROQ_API_KEY:
        # Fallback sem LLM: retorna listas vazias para o frontend deixar o usuário preencher
        return {"processName": process_name, "entities": [], "activities": [], "conditionals": [], "flowOrder": []}

    system_prompt = (
        "Você é um especialista em modelagem de processos de negócio (BPM). "
        "A partir da descrição recebida, extraia e classifique TODOS os elementos do processo.\n\n"
        "## REGRA #1 — ORDEM SEQUENCIAL (MAIS IMPORTANTE)\n"
        "O 'flowOrder' DEVE seguir EXATAMENTE a ordem em que os passos aparecem na descrição textual. "
        "Leia o texto de cima para baixo e mapeie cada passo na mesma sequência. "
        "NUNCA reorganize, agrupe ou reordene elementos por tipo. "
        "Se o texto diz 'primeiro A, depois B, então C', o flowOrder é [A, B, C] — nessa exata ordem.\n\n"
        "## REGRA #2 — INTERCALAÇÃO OBRIGATÓRIA\n"
        "NUNCA coloque mais de 3 atividades seguidas sem uma entidade ou condicional entre elas. "
        "Entidades devem aparecer LOGO APÓS a atividade que as cria ou utiliza pela primeira vez. "
        "Se houver uma sequência longa de atividades, insira a entidade relevante entre elas. "
        "Exemplo correto: [Solicitar Matrícula, Candidato, Preencher Dados, Formulário, Selecionar Curso, Curso]\n"
        "Exemplo ERRADO: [Solicitar Matrícula, Preencher Dados, Selecionar Curso, Emitir Carteirinha, Cadastrar Biblioteca]\n\n"
        "## REGRA #3 — CONDICIONAIS (PROIBIÇÃO ABSOLUTA DE CONDICIONAL→CONDICIONAL)\n"
        "NUNCA, em hipótese alguma, coloque uma condicional seguida de outra condicional no flowOrder. "
        "Entre duas condicionais SEMPRE deve haver pelo menos uma ATIVIDADE (task) do fluxo principal. "
        "Cada condicional DEVE ter 'branches': {\"sim\": \"<próximo se verdadeiro>\", \"nao\": \"<próximo se falso>\"}. "
        "O branch 'sim' DEVE apontar para uma ATIVIDADE, NUNCA para outra condicional. "
        "O branch 'nao' DEVE apontar para uma atividade de rejeição/alternativa. "
        "A atividade do caminho NÃO deve vir IMEDIATAMENTE após o condicional no flowOrder.\n"
        "Se o processo tem decisões consecutivas, CRIE uma atividade intermediária entre elas.\n"
        "Exemplo correto: [..., Docs Corretos?, Corrigir (NAO), Processar Resultado, Aprovado?, Rejeitar (NAO), ...]\n"
        "Exemplo ERRADO: [..., Docs Corretos?, Corrigir (NAO), Aprovado?, ...] (condicional→condicional SEM task entre elas)\n\n"
        "## REGRA #4 — EQUILÍBRIO DO DIAGRAMA\n"
        "O processo deve ter um bom equilíbrio entre atividades, entidades e condicionais. "
        "Para cada 2-3 atividades, inclua a entidade que é produzida ou consumida. "
        "Use condicionais para pontos de decisão reais mencionados no texto, não invente decisões artificiais.\n\n"
        "## REGRA #5 — FINALIZAÇÃO DO FLUXO (CRÍTICO)\n"
        "O flowOrder NUNCA pode terminar com uma condicional nem com a atividade NÃO de uma condicional. "
        "O ÚLTIMO item do flowOrder DEVE ser SEMPRE uma atividade de CONCLUSÃO do fluxo principal "
        "(ex: 'Finalizar Processo', 'Concluir Cadastro', 'Encerrar Atendimento'). "
        "Se a última decisão é uma condicional, ADICIONE ao menos uma atividade final após ela que represente "
        "a conclusão normal do processo. O caminho SIM da última condicional deve apontar para essa atividade final.\n"
        "Exemplo correto: [..., Pagamento Aprovado?, Rejeitar Pagamento (NAO), Emitir Recibo]\n"
        "Exemplo ERRADO: [..., Pagamento Aprovado?, Rejeitar Pagamento] (termina sem conclusão)\n"
        "Exemplo ERRADO: [..., Pagamento Aprovado?] (termina em condicional)\n\n"
        "## Formato de saída\n"
        "Retorne JSON com estas chaves:\n"
        "- 'processName': string\n"
        "- 'entities': [{\"name\": string, \"tipoEntidade\": \"contato\"|\"processo\"}]\n"
        "- 'activities': [string] — verbos no infinitivo, máx 3 palavras. NUNCA inclua 'Sim', 'Nao' ou 'Não'.\n"
        "- 'conditionals': [string] — SEMPRE terminam com '?', máx 5 palavras.\n"
        "- 'flowOrder': [{\"name\": string, \"type\": \"task\"|\"condicional\"|\"entidade\", "
        "\"desc\": string (OBRIGATÓRIO, mín 1 frase, NUNCA repita o nome), "
        "\"tipoEntidade\": string (só entidades), "
        "\"branches\": {\"sim\": string, \"nao\": string} (só condicionais)}]\n\n"
        "## Regras de qualidade para 'desc'\n"
        "- Entidade: descreva quem usa, quando é criada/atualizada e seu papel no processo.\n"
        "- Atividade: descreva o que acontece, quem executa e o resultado esperado.\n"
        "- Condicional: descreva o critério avaliado e quem decide. NÃO explique caminhos SIM/NÃO.\n"
        "- NUNCA repita ou parafraseie o nome no desc.\n\n"
        "## tipoEntidade\n"
        "- 'contato': pessoa ou organização envolvida no processo (quem solicita, aprova, fornece ou executa). Ex: Cliente, Fornecedor, Funcionario, Gestor.\n"
        "- 'processo': objeto, documento ou artefato que é processado, criado ou transformado. Ex: Pedido, Contrato, Nota Fiscal, Proposta, Relatorio.\n"
        "NUNCA use 'contato' para documentos; NUNCA use 'processo' para pessoas ou empresas.\n\n"
        "Retorne APENAS o JSON, sem explicações."
    )

    user_prompt = f"Nome do processo: {process_name}\n\nDescrição:\n{description}"

    # Modelos em ordem de preferência (cada um tem rate limit separado no Groq)
    _PARSE_MODELS = ["llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant"]
    groq_headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    _base_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    try:
        resp = None
        _used_model = _PARSE_MODELS[0]

        for _model_idx, _model in enumerate(_PARSE_MODELS):
            groq_payload = {
                "model": _model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": _base_messages,
            }
            _retry_waits = [2, 5] if _model_idx == 0 else [2, 5, 10]
            for _attempt in range(len(_retry_waits) + 1):
                try:
                    resp = requests.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=groq_headers,
                        json=groq_payload,
                        timeout=AI_LLM_TIMEOUT_SECONDS,
                    )
                except requests.exceptions.RequestException as req_err:
                    print(f"[parse-description] request error ({_model}): {req_err}")
                    resp = None
                    break
                if resp is None or resp.status_code != 429 or _attempt >= len(_retry_waits):
                    break
                wait = _retry_waits[_attempt]
                print(f"[parse-description] 429 ({_model}), retry {_attempt + 1}/{len(_retry_waits)}, aguardando {wait}s")
                time.sleep(wait)

            if resp is not None and resp.status_code != 429 and resp.ok:
                _used_model = _model
                break  # Sucesso — sai do loop de modelos
            # Falhou neste modelo (429 ou outro erro) — tenta o próximo
            _fail_code = resp.status_code if resp is not None else "no response"
            print(f"[parse-description] {_model} falhou (HTTP {_fail_code}), tentando próximo modelo...")

        print(f"[parse-description] modelo usado: {_used_model}")

        if resp is not None and resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Limite de requisições da IA atingido. Aguarde alguns instantes e tente novamente.")
        if resp is None or not resp.ok:
            _code = resp.status_code if resp is not None else "no response"
            raise RuntimeError(f"Groq HTTP {_code}")

        raw_json = resp.json()
        content  = raw_json.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        print(f"[parse-description] modelo={_used_model} status={resp.status_code} content_len={len(content)}")
        if not content or content.strip() in ("{}", ""):
            print(f"[parse-description] AVISO: Groq retornou conteúdo vazio!")
        parsed   = json.loads(content)
        if not parsed.get("flowOrder") and not parsed.get("activities"):
            print(f"[parse-description] AVISO: parsed sem flowOrder/activities. Keys={list(parsed.keys())}")
            print(f"[parse-description] content preview: {content[:500]}")
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        print(f"[parse-description] Groq falhou: {exc}")
        traceback.print_exc()
        parsed = {}

    # Monta mapa name -> tipoEntidade a partir de parsed["entities"] (lista de objetos ou strings)
    entity_tipo_map: dict[str, str] = {}
    raw_entities_list = parsed.get("entities") or []
    parsed_entities_names: list[str] = []
    if isinstance(raw_entities_list, list):
        for ent in raw_entities_list:
            if isinstance(ent, dict):
                name = str(ent.get("name") or "").strip()
                tipo = _normalize_entity_type(ent.get("tipoEntidade"), default="apoio")
                if name:
                    parsed_entities_names.append(name)
                    entity_tipo_map[name.lower()] = tipo
            elif isinstance(ent, str) and ent.strip():
                parsed_entities_names.append(ent.strip())

    def _to_str_list(val):
        if isinstance(val, list):
            return [str(v).strip() for v in val if isinstance(v, str) and str(v).strip()]
        return []

    raw_fo = parsed.get("flowOrder") or []
    flow_order = []
    if isinstance(raw_fo, list):
        for item in raw_fo:
            if isinstance(item, dict) and item.get("name"):
                fo_item: dict[str, Any] = {
                    "name": str(item["name"]).strip(),
                    "type": str(item.get("type") or "task").strip(),
                }
                if fo_item["type"] == "entidade":
                    key = fo_item["name"].lower()
                    # Prefere tipoEntidade do flowOrder, cai no mapa de entities
                    raw_tipo = item.get("tipoEntidade") or entity_tipo_map.get(key, "apoio")
                    fo_item["tipoEntidade"] = _normalize_entity_type(raw_tipo, default="apoio")
                if isinstance(item.get("branches"), dict):
                    fo_item["branches"] = {
                        "sim": str(item["branches"].get("sim") or "").strip(),
                        "nao": str(item["branches"].get("nao") or "").strip(),
                    }
                # Preserva desc se a IA retornou
                raw_desc = str(item.get("desc") or "").strip()
                if raw_desc:
                    fo_item["desc"] = raw_desc
                flow_order.append(fo_item)

    # Filtra nomes proibidos (Sim, Nao etc.) de todos os outputs
    _PARSE_FORBIDDEN = {"sim", "nao", "não", "yes", "no", "true", "false"}
    flow_order = [fo for fo in flow_order if fo.get("name", "").lower().strip() not in _PARSE_FORBIDDEN]

    # ── Validação pós-IA: corrigir problemas estruturais do flowOrder ──

    # 1) Garantir que condicional→condicional tenha atividade intermediária
    #    Verifica o próximo item não-NAO após cada condicional. Se for outra condicional,
    #    insere atividade ponte entre elas.
    _nao_refs_set: set[str] = set()
    for _fo_item in flow_order:
        if _fo_item.get("type") == "condicional":
            _nr = (_fo_item.get("branches", {}).get("nao") or "").strip().lower()
            if _nr:
                _nao_refs_set.add(_nr)

    _fixed_fo: list[dict] = []
    for _fi, _fo_item in enumerate(flow_order):
        _fixed_fo.append(_fo_item)
        if _fo_item.get("type") == "condicional":
            # Encontra o próximo item no fluxo principal (não-NAO) após esta condicional
            _next_main = None
            for _nj in range(_fi + 1, len(flow_order)):
                _nj_name = flow_order[_nj].get("name", "").strip().lower()
                if _nj_name in _nao_refs_set:
                    continue  # Pula nós NAO
                if flow_order[_nj].get("type") == "entidade":
                    continue  # Pula entidades intercaladas
                _next_main = flow_order[_nj]
                break
            if _next_main is not None and _next_main.get("type") == "condicional":
                _bridge_name = f"Processar {_fo_item.get('name', '').replace('?', '').strip()}"
                # Insere a atividade ponte ANTES da condicional que acabamos de adicionar?
                # Não — insere no final da _fixed_fo, ela aparecerá entre a cond atual e a próxima
                _fixed_fo.append({
                    "name": _bridge_name,
                    "type": "task",
                    "desc": f"Atividade de processamento após a decisão '{_fo_item.get('name', '')}'.",
                })
                # Atualizar branches.sim da condicional atual para apontar para a ponte
                _fo_item.setdefault("branches", {})
                _fo_item["branches"]["sim"] = _bridge_name
                print(f"[parse-description] Ponte '{_bridge_name}' inserida entre '{_fo_item.get('name','')}' e '{_next_main.get('name','')}'")
    flow_order = _fixed_fo

    # 2) Garantir que o último nó não seja uma atividade NAO (caminho de rejeição).
    #    Nós NAO devem ser seguidos por pelo menos um nó do fluxo principal.
    #    Identifica nós NAO: são referenciados em branches.nao de alguma condicional.
    #    IMPORTANTE: este step roda ANTES de verificar condicional no final,
    #    pois mover NAO pode revelar uma condicional como último item.
    _nao_names: set[str] = set()
    for _fo_item in flow_order:
        if _fo_item.get("type") == "condicional":
            _nao_ref = (_fo_item.get("branches", {}).get("nao") or "").strip().lower()
            if _nao_ref:
                _nao_names.add(_nao_ref)
    # Se o último nó é um NAO, mover para logo após sua condicional
    if flow_order and flow_order[-1].get("name", "").strip().lower() in _nao_names:
        _nao_item = flow_order.pop()
        # Encontrar a condicional que referencia este NAO e inserir logo após ela
        _inserted = False
        for _ri in range(len(flow_order) - 1, -1, -1):
            if flow_order[_ri].get("type") == "condicional":
                _br_nao = (flow_order[_ri].get("branches", {}).get("nao") or "").strip().lower()
                if _br_nao == _nao_item.get("name", "").strip().lower():
                    flow_order.insert(_ri + 1, _nao_item)
                    _inserted = True
                    print(f"[parse-description] Movido NAO '{_nao_item['name']}' para posição {_ri + 1} (após sua condicional)")
                    break
        if not _inserted:
            # Fallback: inserir antes do último item
            flow_order.insert(max(0, len(flow_order) - 1), _nao_item)

    # 3) Garantir que o flowOrder NÃO termine com uma condicional NEM com [Condicional, NAO].
    #    Agora que NAOs foram reposicionados (step 2), verificar se precisa de conclusão.
    _needs_conclusion = False
    _target_cond = None

    if flow_order and flow_order[-1].get("type") == "condicional":
        _needs_conclusion = True
        _target_cond = flow_order[-1]
    elif flow_order and flow_order[-1].get("name", "").strip().lower() in _nao_names:
        # Último é NAO — a condicional antes dele precisa de conclusão
        for _ri in range(len(flow_order) - 2, -1, -1):
            if flow_order[_ri].get("type") == "condicional":
                _needs_conclusion = True
                _target_cond = flow_order[_ri]
                break

    if _needs_conclusion and _target_cond is not None:
        _conclusion_name = f"Concluir {_target_cond.get('name', '').replace('?', '').strip()}"
        flow_order.append({
            "name": _conclusion_name,
            "type": "task",
            "desc": f"Atividade de conclusão após a decisão '{_target_cond.get('name', '')}'.",
        })
        if "branches" not in _target_cond:
            _target_cond["branches"] = {}
        _target_cond["branches"]["sim"] = _conclusion_name
        print(f"[parse-description] Adicionado '{_conclusion_name}' após última condicional")

    # entities como lista de objetos {name, tipoEntidade}
    entities_out = [
        {"name": name, "tipoEntidade": entity_tipo_map.get(name.lower(), "apoio")}
        for name in parsed_entities_names
        if name.lower().strip() not in _PARSE_FORBIDDEN
    ]

    activities_clean = [a for a in _to_str_list(parsed.get("activities")) if a.lower().strip() not in _PARSE_FORBIDDEN]

    return {
        "processName":  str(parsed.get("processName") or process_name).strip(),
        "entities":     entities_out,
        "activities":   activities_clean,
        "conditionals": _to_str_list(parsed.get("conditionals")),
        "flowOrder":    flow_order,
    }


@app.post("/ai/plan")
def ai_plan(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    context_raw = payload.get("context")
    context: dict[str, Any] = context_raw if isinstance(context_raw, dict) else {}

    raw_goal = str(payload.get("goal") or "").strip()
    context_process_name = str(context.get("processName") or "").strip()
    context_description = str(
        context.get("processDescription")
        or context.get("description")
        or context.get("descricao")
        or ""
    ).strip()

    goal_parts: list[str] = []
    lowered_raw_goal = raw_goal.lower()
    if context_process_name and context_process_name.lower() not in lowered_raw_goal:
        goal_parts.append(f"Nome do processo: {context_process_name}")
    if context_description and context_description.lower() not in lowered_raw_goal:
        goal_parts.append(f"Descricao do processo: {context_description}")
    if raw_goal:
        goal_parts.append(raw_goal)

    goal = "\n".join(goal_parts).strip() or context_description or context_process_name

    plan = _build_ai_plan(goal, current_user, context)

    # Segunda análise: preencher conteúdo faltante em entidades e nodes BPMN
    _review_plan_fill_missing_content(plan, context_process_name or str(plan.get("goal") or ""))

    audit_record = _append_ai_audit_log(
        {
            "user_id": current_user.get("id"),
            "user_nome": current_user.get("nome"),
            "event": "ai_plan_generated",
            "goal": plan.get("goal"),
            "actions_count": len(plan.get("actions") or []),
        }
    )
    return {
        "plan": plan,
        "audit": audit_record,
    }


@app.post("/ai/execute")
def ai_execute(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    _rate_limit_ai_actions(int(current_user.get("id", 0) or 0))

    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else None
    approved_actions = payload.get("approvedActions")
    if not isinstance(plan, dict):
        raise HTTPException(status_code=400, detail="Plano invalido para execucao.")
    if not isinstance(approved_actions, list) or not approved_actions:
        raise HTTPException(status_code=400, detail="Informe as acoes aprovadas para executar.")

    actions_raw = plan.get("actions")
    all_actions: list[Any] = actions_raw if isinstance(actions_raw, list) else []
    selected_ids = {str(item).strip() for item in approved_actions}
    actions_to_execute: list[dict] = [
        action for action in all_actions
        if isinstance(action, dict) and str(action.get("id", "")).strip() in selected_ids
    ]

    if not actions_to_execute:
        raise HTTPException(status_code=400, detail="Nenhuma acao valida foi selecionada para execucao.")

    # Análise final antes de executar: preencher conteúdo faltante
    _review_plan_fill_missing_content(
        {"actions": actions_to_execute},
        str(plan.get("goal") or ""),
    )

    # Pre-compute unique opportunity names so update_bpmn_state syncs to the right record
    opportunity_name_map: dict[str, str] = {}
    for action in actions_to_execute:
        if action.get("type") == "create_oportunidade":
            _raw_p = action.get("payload")
            p: dict = _raw_p if isinstance(_raw_p, dict) else {}
            original = str(p.get("nome") or "Oportunidade IA").strip()
            opportunity_name_map[original.lower()] = _unique_opportunity_name(original)

    results = []
    for action in actions_to_execute:
        action_to_run: dict = action
        if opportunity_name_map:
            atype = action.get("type")
            _raw_ap = action.get("payload")
            apayload: dict = _raw_ap if isinstance(_raw_ap, dict) else {}
            if atype == "update_bpmn_state":
                bpmn_name = str(apayload.get("name") or "").strip()
                mapped = opportunity_name_map.get(bpmn_name.lower())
                if mapped:
                    action_to_run = {**action, "payload": {**apayload, "name": mapped}}
            elif atype == "create_entidade":
                cat = str(apayload.get("categoria") or "").strip()
                mapped_cat = opportunity_name_map.get(cat.lower())
                if mapped_cat:
                    action_to_run = {**action, "payload": {**apayload, "categoria": mapped_cat}}
        result = _execute_ai_action(action_to_run, current_user)
        results.append({
            "id": action.get("id"),
            **result,
        })

    audit_record = _append_ai_audit_log(
        {
            "user_id": current_user.get("id"),
            "user_nome": current_user.get("nome"),
            "event": "ai_actions_executed",
            "goal": plan.get("goal"),
            "approved_action_ids": sorted(list(selected_ids)),
            "results": results,
        }
    )

    return {
        "executed": len(results),
        "results": results,
        "audit": audit_record,
    }


@app.post("/ai/analyze-lead")
def ai_analyze_lead(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Analisa prospecto usando IA: resumo do histórico, score de conversão, próxima ação."""
    lead = payload.get("lead") if isinstance(payload.get("lead"), dict) else {}
    activities = payload.get("activities") if isinstance(payload.get("activities"), list) else []
    
    if not lead.get("id"):
        raise HTTPException(status_code=400, detail="Lead inválido: falta ID")
    
    lead_nome = str(lead.get("nome", "Prospecto")).strip()
    lead_empresa = str(lead.get("empresa", "")).strip()
    lead_stage = str(lead.get("stage", "novo")).strip()
    
    # Formata histórico de atividades para o prompt
    activities_text = ""
    if activities:
        activity_lines = []
        for act in sorted(activities, key=lambda a: str(a.get("data_criacao", "")), reverse=True)[:10]:
            tipo = str(act.get("tipo", "nota")).upper()
            data = str(act.get("data_criacao", ""))[:10]
            descricao = str(act.get("descricao", "")).strip()[:100]
            activity_lines.append(f"- [{data}] {tipo}: {descricao}")
        activities_text = "\n".join(activity_lines)
    else:
        activities_text = "- Sem atividades registradas"
    
    system_prompt = """Você é um especialista em análise de prospectos de vendas. 
Analise o histórico do prospecto e forneça insights estruturados em JSON.

Retorne SEMPRE um JSON válido com estas chaves:
- "resumo": Resumo breve do relacionamento (1-2 linhas)
- "score_conversao": Número de 0 a 100 indicando probabilidade de conversão
- "proxima_acao": Recomendação específica do próximo passo (uma frase)
- "sentimento": "positivo", "neutro" ou "negativo"
- "urgencia": "baixa", "média" ou "alta"
- "motivo_inatividade": Se inativo, por que (uma frase)
"""
    
    user_prompt = f"""Prospecto: {lead_nome}
Empresa: {lead_empresa}
Stage Atual: {lead_stage}

Histórico de Atividades (últimas 10):
{activities_text}

Análise necessária: Avalie o potencial de conversão, sentimento, urgência de recontato e recomende próxima ação."""
    
    if AI_PROVIDER != "groq" or not GROQ_API_KEY:
        # Fallback sem IA: retorna análise simples baseada em dados
        return {
            "resumo": f"{lead_nome} de {lead_empresa} em estágio {lead_stage}",
            "score_conversao": 50,
            "proxima_acao": "Enviar email de reengajamento",
            "sentimento": "neutro",
            "urgencia": "média",
            "motivo_inatividade": "Sem atividades recentes",
            "fonte": "fallback"
        }
    
    groq_headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    groq_payload = {
        "model": GROQ_MODEL,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=groq_headers,
            json=groq_payload,
            timeout=AI_LLM_TIMEOUT_SECONDS,
        )
        
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Limite de requisições da IA atingido. Tente novamente em alguns instantes.")
        
        if not resp.ok:
            print(f"[analyze-lead] Groq HTTP {resp.status_code}: {resp.text[:200]}")
            raise RuntimeError(f"Groq HTTP {resp.status_code}")
        
        raw_json = resp.json()
        content = raw_json.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = json.loads(content)
        
        # Validação de resposta
        if not isinstance(parsed, dict):
            parsed = {}
        
        # Preenchimento de campos padrão se faltarem
        result = {
            "resumo": str(parsed.get("resumo", "Análise não disponível")).strip()[:200],
            "score_conversao": int(parsed.get("score_conversao", 50)) if isinstance(parsed.get("score_conversao"), int) else 50,
            "proxima_acao": str(parsed.get("proxima_acao", "Enviar email")).strip()[:150],
            "sentimento": str(parsed.get("sentimento", "neutro")).strip().lower(),
            "urgencia": str(parsed.get("urgencia", "média")).strip().lower(),
            "motivo_inatividade": str(parsed.get("motivo_inatividade", "")).strip()[:150],
            "fonte": "groq"
        }
        
        # Validação de ranges
        result["score_conversao"] = max(0, min(100, result["score_conversao"]))
        if result["sentimento"] not in ["positivo", "neutro", "negativo"]:
            result["sentimento"] = "neutro"
        if result["urgencia"] not in ["baixa", "média", "alta"]:
            result["urgencia"] = "média"
        
        _append_ai_audit_log({
            "user_id": current_user.get("id"),
            "user_nome": current_user.get("nome"),
            "event": "ai_analyze_lead",
            "lead_id": lead.get("id"),
            "lead_nome": lead_nome,
            "score_conversao": result["score_conversao"],
        })
        
        return result
        
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[analyze-lead] Erro: {exc}")
        import traceback
        traceback.print_exc()
        return {
            "resumo": f"{lead_nome} de {lead_empresa}",
            "score_conversao": 50,
            "proxima_acao": "Contactar manualmente",
            "sentimento": "neutro",
            "urgencia": "média",
            "motivo_inatividade": "Erro na análise de IA",
            "fonte": "erro",
            "erro": str(exc)
        }


@app.get("/ai/audit")
def ai_audit(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    if not _is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Apenas administradores podem consultar auditoria da IA.")

    rows = load_ai_audit_data(AI_AUDIT_FILE)
    safe_rows = rows if isinstance(rows, list) else []
    safe_rows.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
    return {
        "data": safe_rows[: max(1, min(limit, 200))],
        "total": len(safe_rows),
    }

@app.get("/users")
def get_users(page: int = 1, limit: int = 8):
    users = load_users_data()
    if not isinstance(users, list):
        return paginated_users_response([], 0, page, limit)

    # Filtra apenas usuários ativos (consistente com /users/by-role/{role})
    active_users = [u for u in users if u.get("ativo", True)]
    
    principal_admin_id = get_principal_admin_id(active_users)

    total = len(active_users)
    start = (page - 1) * limit
    end = start + limit
    paginated = []
    
    for user in active_users[start:end]:
        user_id = user.get("id")
        paginated.append({
            "id": user_id,
            "nome": user.get("nome", user.get("username", "")),
            "email": user.get("email", ""),
            "nivel": str(user.get("nivel", "1")),
            "cargo": user.get("cargo", ""),
            "data": user.get("created_at", user.get("data", "")),
            "admin": user.get("admin", False),
            "role": "admin" if user.get("admin", False) else "user",
            "is_principal_admin": user_id == principal_admin_id if user_id else False,
        })
    
    return paginated_users_response(paginated, total, page, limit)

@app.get("/users/debug/inactive")
def get_inactive_users(current_user: dict = Depends(require_permission("users:list"))):
    """Debug endpoint: mostra todos os usuários inativos (para diagnose)."""
    users = load_users_data()
    if not isinstance(users, list):
        return {"inactive_users": [], "total": 0}
    
    inactive = [
        {
            "id": u.get("id"),
            "nome": u.get("nome", ""),
            "email": u.get("email", ""),
            "ativo": u.get("ativo", True),
            "created_at": u.get("created_at", ""),
        }
        for u in users
        if not u.get("ativo", True)
    ]
    return {"inactive_users": inactive, "total": len(inactive)}

@app.post("/users", response_model=UserOut, status_code=201)
def create_user(user: User):
    users = load_users_data()
    # Validação obrigatória
    if not user.nome or not user.email or not user.senha:
        raise HTTPException(status_code=400, detail="Nome, email e senha são obrigatórios.")
    if not is_valid_email(user.email):
        raise HTTPException(status_code=400, detail="Email inválido.")
    if any(u["email"] == user.email for u in users):
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    now = now_iso()
    new_id = max([u["id"] for u in users], default=0) + 1
    senha_hash = hash_password(user.senha)
    new_user = {
        "id": new_id,
        "nome": user.nome,
        "email": user.email,
        "senha": senha_hash,
        "ativo": user.ativo if user.ativo is not None else True,
        "created_at": now,
        "admin": getattr(user, "admin", False),
        "role": getattr(user, "role", "user"),
        "nivel": str(getattr(user, "nivel", "1")),
        "cargo": getattr(user, "cargo", ""),
    }
    users.append(new_user)
    save_users_data(users)
    return {k: v for k, v in new_user.items() if k != "senha"}

@app.post("/auth/login")
def auth_login(auth: AuthRequest):
    user = get_user_by_email(auth.email)
    if not user:
        raise HTTPException(status_code=400, detail="Email ou senha inválidos")

    if not verify_password(auth.senha, user["senha"]):
        raise HTTPException(status_code=400, detail="Email ou senha inválidos")

    # Upgrade legacy SHA256 hash to bcrypt on successful login
    if not user["senha"].startswith(("$2b$", "$2a$", "$2y$")):
        new_hash = hash_password_bcrypt(auth.senha)
        update_user_password_hash(int(user["id"]), new_hash)
        user["senha"] = new_hash

    role = user.get("role", "user")
    token_data = {"sub": str(user["id"]), "role": role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    safe_user = {k: v for k, v in user.items() if k != "senha"}
    safe_user["permissions"] = get_role_permissions(role)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": safe_user,
    }


@app.post("/auth/refresh")
def auth_refresh(request_body: dict = Body(...)):
    """Exchange a valid refresh token for a new access token."""
    refresh = request_body.get("refresh_token") or ""
    payload = decode_jwt(refresh)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado")

    user_id = payload.get("sub")
    user = get_user_by_id(int(user_id)) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    role = user.get("role", "user")
    new_access = create_access_token({"sub": str(user["id"]), "role": role})
    return {"access_token": new_access, "token_type": "bearer"}


@app.get("/auth/roles")
def auth_roles():
    """Return all available roles and their permissions."""
    return {"roles": ROLE_PERMISSIONS}

@app.put("/users/{user_id}")
def update_user(user_id: int, user: UserUpdate, current_user: dict = Depends(require_permission("users:update"))):
    users = load_users_data()
    idx = next((i for i, u in enumerate(users) if u["id"] == user_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    principal_admin_id = get_principal_admin_id(users)
    current_user_id = int(current_user.get("id", -1))
    if (
        principal_admin_id is not None
        and int(user_id) == int(principal_admin_id)
        and current_user_id != int(principal_admin_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Não é permitido editar o administrador principal.",
        )

    update_data = user.dict(exclude_unset=True)
    # Validação de email se enviado
    if "email" in update_data:
        if not update_data["email"] or not is_valid_email(update_data["email"]):
            raise HTTPException(status_code=400, detail="Email inválido.")

    current_user = users[idx]
    current_is_admin = bool(
        current_user.get("admin", False) or current_user.get("role") == "admin"
    )

    target_admin = update_data.get("admin")
    target_role = update_data.get("role")

    if target_admin is not None:
        target_admin = bool(target_admin)
    if target_role is not None:
        target_role = str(target_role).strip().lower()

    should_be_admin = current_is_admin
    if target_admin is not None:
        should_be_admin = target_admin
    if target_role in {"admin", "user"}:
        should_be_admin = target_role == "admin"

    admins_count = sum(
        1
        for candidate in users
        if candidate.get("admin", False) or candidate.get("role") == "admin"
    )

    if current_is_admin and not should_be_admin and admins_count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Não é permitido remover o último administrador do sistema.",
        )

    update_data["admin"] = should_be_admin
    update_data["role"] = "admin" if should_be_admin else "user"

    # Corrige: sempre atualiza o campo 'nivel' como string
    if "nivel" in update_data:
        users[idx]["nivel"] = str(update_data["nivel"])
        update_data.pop("nivel")
    for key, value in update_data.items():
        users[idx][key] = value
    save_users_data(users)
    return {k: v for k, v in users[idx].items() if k != "senha"}

@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, current_user: dict = Depends(require_permission("users:delete"))):
    users = load_users_data()
    idx = next((i for i, u in enumerate(users) if u["id"] == user_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    principal_admin_id = get_principal_admin_id(users)
    if principal_admin_id is not None and int(user_id) == int(principal_admin_id):
        raise HTTPException(
            status_code=403,
            detail="Não é permitido excluir o administrador principal.",
        )

    target_user = users[idx]
    target_is_admin = bool(
        target_user.get("admin", False) or target_user.get("role") == "admin"
    )

    if target_is_admin:
        admins_count = sum(
            1
            for candidate in users
            if candidate.get("admin", False) or candidate.get("role") == "admin"
        )
        if admins_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Não é permitido remover o último administrador do sistema.",
            )

    users.pop(idx)
    save_users_data(users)
    return