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
from datetime import datetime, timedelta
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
    is_valid_email,
    paginated_users_response,
    load_json,
    save_json,
)
from models import Oportunidade, UserOut, User, UserUpdate, Entidade, AuthRequest


SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "").strip()
USE_SUPABASE_DB = bool(SUPABASE_DB_URL and psycopg2 is not None)
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "3"))
USERS_TABLE = "users_store"
ENTIDADES_TABLE = "entidades_store"
OPORTUNIDADES_TABLE = "oportunidades_store"
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

# Lock to serialise read-modify-write cycles on JSON files.
_data_lock = threading.Lock()
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
            "descricao": str(payload.get("descricao") or "Entidade gerada por IA").strip(),
            "tipoEntidade": str(payload.get("tipoEntidade") or "Processo"),
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
            "nome": str(payload.get("nome") or "Oportunidade IA").strip(),
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
        return "Avalia a condicao para decidir o proximo caminho do fluxo."

    first = clean_name[:1].lower()
    remainder = clean_name[1:] if len(clean_name) > 1 else ""
    return f"Verifica se {first}{remainder}."


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
            return "Avalia a condição para decidir o próximo caminho do fluxo."
        return "Executa a atividade para avançar o processo."

    summary_tokens = {token for token in normalized_summary.split() if token}
    detail_tokens = {token for token in normalized_detail.split() if token}
    overlap = len(summary_tokens.intersection(detail_tokens))
    min_size = min(len(summary_tokens), len(detail_tokens)) if summary_tokens and detail_tokens else 0

    # If summary and detail are semantically almost the same, keep only detail.
    if min_size > 0 and overlap >= min_size:
        if normalized_type == "condicional":
            return "Avalia a condição para decidir o próximo caminho do fluxo."
        return "Executa a atividade para avançar o processo."

    return f"{summary}. {detail}"


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
                "tipoEntidade": "apoio",
                "x": max_x + (added_count * 240),
                "y": 120,
                "info": "id",
                "subtitle": "Entidade de dados",
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


def _infer_data_entity_type(stage_name: str, participant: str = "", default: str = "apoio") -> str:
    text = _normalize_ai_text(f"{stage_name} {participant}")
    if not text:
        return default

    external_hints = ("fornecedor", "cliente", "parceiro", "terceiro", "extern", "api", "erp", "banco")
    if any(hint in text for hint in external_hints):
        return "externa"

    associative_hints = ("item", "vincul", "relacion", "ligacao", "associ")
    if any(hint in text for hint in associative_hints):
        return "associativa"

    principal_hints = ("solicit", "pedido", "processo", "cadastro", "proposta", "contrato")
    if any(hint in text for hint in principal_hints):
        return "principal"

    support_hints = ("historico", "log", "anexo", "document", "observa", "auditoria")
    if any(hint in text for hint in support_hints):
        return "apoio"

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
            "tipoEntidade": "principal" if entity_counter == 1 else "apoio",
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

    # Se todos os nodes já têm posições pré-calculadas, respeita-as (layout direto pelo flowOrder)
    if all("x" in n and "y" in n for n in nodes):
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
    MAX_PER_COL = 5       # nodes por coluna antes de quebrar para a próxima
    X_MAIN_BASE = 160
    X_COL_GAP = 380       # espaço horizontal entre colunas do fluxo principal
    X_NAO_OFFSET = 320    # quanto à direita fica o ramo "nao"
    Y_START = 80
    Y_STEP = 220          # espaço vertical entre nodes

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
            cond_descricao = str(raw_node.get("condicionalDescricao") or raw_node.get("subtitle") or "").strip()

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
            raw_subtitle = str(raw_node.get("subtitle") or "").strip()
            if raw_subtitle:
                node_payload["subtitle"] = raw_subtitle
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
                node_payload["subtitle"] = stage_name
                node_payload["entidadeNome"] = _sanitize_node_name_by_type(
                    stage_participant or stage_name,
                    "entidade",
                    index,
                )
                node_payload["tipoEntidade"] = _normalize_entity_type(
                    stage.get("tipoEntidade"),
                    default=_infer_data_entity_type(stage_name, stage_participant, default="principal" if index == 1 else "apoio"),
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
                node_payload["subtitle"] = desc
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
                node_payload["subtitle"] = desc
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
            str((conditional_node or {}).get("condicionalDescricao") or (conditional_node or {}).get("subtitle") or ""),
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
        payload = {
            "categoria": str(payload.get("categoria") or "IA"),
            "nome": entity_name,
            "descricao": str(payload.get("descricao") or "Entidade sugerida por IA").strip(),
            "tipoEntidade": _entity_type_label(str(payload.get("tipoEntidade") or ""), fallback_id),
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

    entity_type = str(raw_value.get("entityType") or "apoio").strip().lower()
    if entity_type not in {"principal", "apoio", "associativa", "externa"}:
        entity_type = "apoio"

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
            "descricao": str(new_entity.get("descricao") or "").strip(),
            "atributoChave": str(new_entity.get("atributoChave") or "").strip(),
        },
        "task": {
            "nome": _sanitize_node_name_by_type(task.get("nome") or "", "task", 1),
            "descricao": str(task.get("descricao") or "").strip(),
        },
        "conditional": {
            "nome": _sanitize_node_name_by_type(
                conditional.get("nome") or "",
                "condicional",
                1,
            ),
            "descricao": str(conditional.get("descricao") or "").strip(),
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


def _normalize_entity_type(value: Any, default: str = "apoio") -> str:
    normalized = _normalize_ai_text(value)
    if not normalized:
        return default

    if normalized in {"principal", "core", "main", "primaria", "processo", "process"}:
        return "principal"
    if normalized in {"apoio", "support", "secundaria", "secundario", "auxiliar"}:
        return "apoio"
    if normalized in {"associativa", "associativo", "junction", "pivot", "relacao", "relacional", "vinculo"}:
        return "associativa"
    if normalized in {"externa", "externo", "external", "fornecedor", "cliente_externo", "terceiro"}:
        return "externa"

    return default


def _entity_type_label(normalized_type: str, fallback_index: int) -> str:
    normalized = _normalize_entity_type(normalized_type, default="")
    if normalized == "principal":
        return "Principal"
    if normalized == "associativa":
        return "Associativa"
    if normalized == "externa":
        return "Externa"
    if normalized == "apoio":
        return "Apoio"
    return "Principal" if fallback_index == 1 else "Apoio"


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
        r"[-•*]\s*([^\n\r\-\(\)]+?)\s*\((principal|apoio|associativa|externa|primaria|secundaria|auxiliar|externo)\)",
        text,
        flags=re.IGNORECASE,
    ):
        add_entity(match.group(1), match.group(2))

    # In-text format: "entidade externa Fornecedor" / "entidade Aprovação"
    for match in re.finditer(
        r"entidade\s+(principal|associativa|apoio|externa)?\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9\s\-_/]{1,80})",
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
    if source_type in {"principal", "apoio", "associativa", "externa"}:
        return source_type

    fk_count = 0
    for field in fields:
        key_type = str(field.get("keyType") or "").strip().upper()
        if key_type == "FK":
            fk_count += 1
    if fk_count >= 2:
        return "associativa"

    text = _normalize_ai_text(" ".join([process_name, entity_name, goal]))

    external_hints = (
        "extern",
        "fornecedor",
        "parceiro",
        "terceiro",
        "api",
        "integracao",
        "integracao",
        "erp",
        "banco",
    )
    if any(hint in text for hint in external_hints):
        return "externa"

    associative_hints = (
        "associ",
        "vincul",
        "relacion",
        "ligacao",
        "ligacao",
        "item",
    )
    if any(hint in text for hint in associative_hints):
        return "associativa"

    principal_hints = (
        "principal",
        "processo",
        "solicitacao",
        "pedido",
        "cadastro",
    )
    if any(hint in text for hint in principal_hints):
        return "principal"

    return "apoio"


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
                "tipoEntidade": str(item.get("tipoEntidade") or "Apoio").strip(),
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
    full_reference_list = _dedupe_preserve_order([*existing_create_entities, *candidate_entities])

    for candidate_name in candidate_entities:
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
                    "descricao": f"Representa a etapa de entidade do processo: {process_name}",
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
            node_payload["subtitle"] = cond_desc
        else:
            task_desc = _activity_description_from_text(raw_label, len(nodes) + 1)
            node_payload["taskNome"] = label
            node_payload["taskDescricao"] = task_desc
            node_payload["subtitle"] = task_desc

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
        "Nomes de atividade, condicional e entidade devem ser resumidos e completos, sem reticencias. "
        "Quando houver condicional (XOR), gere ramos com sentido de negocio (sim/nao) e evite decisao sem bifurcacao real. "
        "Sempre inclua acoes para oportunidade e update_bpmn_state com payload completo (nodes, connections, stages). "
        "Use somente tipos suportados no BPMN: task, condicional e entidade."
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
            "maxActions": 4,
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
        cond_interval = max(1, len(acts) // (len(conds) + 1)) if conds else len(acts)
        cond_idx = 0
        for i, act in enumerate(acts):
            items.append(act)
            if conds and cond_idx < len(conds) and (i + 1) % cond_interval == 0:
                items.append(conds[cond_idx])
                cond_idx += 1
        items.extend(conds[cond_idx:])  # condicionais restantes
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

    typed_flow_order = []
    for raw_item in flow_order_raw:
        name = _fo_name(raw_item)
        if not name:
            continue
        fo_type = _fo_type(raw_item) or _classify_flow_item(name)
        desc = _fo_desc(raw_item)
        entry: dict[str, Any] = {"name": name, "type": fo_type}
        if desc:
            entry["desc"] = desc
        typed_flow_order.append(entry)

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
            {"id": "c5", "from": "n5", "to": "n6", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c6", "from": "n4", "to": "n7", "fromHandle": "right", "toHandle": "left", "decision": "sim"},
            {"id": "c7", "from": "n7", "to": "n8", "fromHandle": "right", "toHandle": "left", "decision": ""},
            {"id": "c8", "from": "n8", "to": "n9", "fromHandle": "right", "toHandle": "left", "decision": ""},
        ],
    }, ensure_ascii=False)

    system_prompt = (
        "Voce e um gerador de BPMN. Gere os nodes e connections do diagrama BPMN. Retorne APENAS JSON valido, sem markdown.\n\n"

        "REGRAS FUNDAMENTAIS:\n"
        "- 'flowOrder' é uma lista de objetos {name, type} que define EXATAMENTE a sequência e o tipo de cada node.\n"
        "- Crie UM node por item de flowOrder. Use item.name como label e item.type como nodeType. NAO invente nomes.\n\n"

        "PASSO 1 - GERACAO DOS NODES:\n"
        "1. Para cada item em flowOrder, crie um node: label=item.name, nodeType=item.type.\n"
        "2. NUNCA altere os nomes. NUNCA crie nodes com label 'Sim' ou 'Nao'.\n\n"

        "PASSO 2 - CONEXOES:\n"
        "3. Conecte os nodes em ordem baseada no flowOrder: fromHandle='right', toHandle='left', decision='', label=''.\n"
        "4. Quando nodeType='condicional', crie DUAS conexoes de saida:\n"
        "   - Caminho aprovado: decision='sim', label='\u2714', fromHandle='right', toHandle='left'\n"
        "   - Caminho reprovado: decision='nao', label='\u2718', fromHandle='bottom', toHandle='left'\n"
        "5. O proximo node na sequencia recebe o caminho SIM (\u2714). O node alternativo recebe o caminho NAO (\u2718).\n\n"

        "PASSO 3 - ENTIDADES:\n"
        "6. Nodes com nodeType='entidade' DEVEM ter 'campos' com 3-5 campos.\n"
        "7. Formato de campo: {nome, tipo (texto|numero|email|booleano|data), obrigatorio (bool), keyType (PK|FK|NORMAL), relacionamento (null|nomeEntidade)}\n\n"

        "FORMATO:\n"
        "8. IDs de nodes: 'n1','n2',...; de connections: 'c1','c2',...\n"
        "9. Retorne: {\"nodes\": [...], \"connections\": [...]}\n\n"

        f"EXEMPLO INPUT:\n{_fs_input}\n\n"
        f"EXEMPLO OUTPUT:\n{_fs_output}"
    )

    # Para o fallback (flowOrder vazio), monta typed_flow_order a partir das listas separadas
    if not typed_flow_order and (suggested_activities or suggested_conditionals):
        acts = suggested_activities
        conds = suggested_conditionals
        fallback_items: list[str] = []
        ci2 = 0
        interval2 = max(1, len(acts) // (len(conds) + 1)) if conds else len(acts)
        for i2, a2 in enumerate(acts):
            fallback_items.append(a2)
            if ci2 < len(conds) and (i2 + 1) % interval2 == 0:
                fallback_items.append(conds[ci2])
                ci2 += 1
        fallback_items.extend(conds[ci2:])
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
        Se um condicional tem `branches: {sim: name, nao: name}`, usa isso diretamente.
        Caso contrário, usa fallback posicional (item+1 = nao, item+2 = sim).
        Itens que são destino de um ramo NAO não geram conexão sequencial para o próximo.
        """
        result: list[dict[str, Any]] = []
        n = len(fo_list)

        # Monta índice nome→posição para resolução de branches por nome
        name_to_idx: dict[str, int] = {fo["name"]: i for i, fo in enumerate(fo_list)}

        # Identifica índices que são destinos de ramo NAO — não participam da sequência principal
        nao_target_indices: set[int] = set()
        for i, fo in enumerate(fo_list):
            if fo.get("type") != "condicional":
                continue
            br = fo.get("branches") or {}
            nao_name = br.get("nao") or ""
            if nao_name and nao_name in name_to_idx:
                nao_target_indices.add(name_to_idx[nao_name])
            elif not nao_name and i + 1 < n:
                # fallback posicional: item imediatamente após é NAO
                nao_target_indices.add(i + 1)

        for i, fo in enumerate(fo_list):
            ntype = fo.get("type", "task")
            cur = f"n{i + 1}"

            if ntype == "condicional":
                br = fo.get("branches") or {}
                sim_name = br.get("sim") or ""
                nao_name = br.get("nao") or ""

                # Resolve SIM — sai pela alça inferior (continua o fluxo para baixo)
                sim_idx = name_to_idx.get(sim_name, i + 2) if sim_name else (i + 2 if i + 2 < n else None)
                if sim_idx is not None and sim_idx < n:
                    result.append({"id": f"c{i + 1}b", "from": cur, "to": f"n{sim_idx + 1}",
                                   "fromHandle": "bottom", "toHandle": "top",
                                   "decision": "sim", "label": "\u2714"})

                # Resolve NAO — sai pela alça direita (ramo lateral)
                nao_idx = name_to_idx.get(nao_name, i + 1) if nao_name else (i + 1 if i + 1 < n else None)
                if nao_idx is not None and nao_idx < n:
                    result.append({"id": f"c{i + 1}a", "from": cur, "to": f"n{nao_idx + 1}",
                                   "fromHandle": "right", "toHandle": "left",
                                   "decision": "nao", "label": "\u2718"})
            elif i not in nao_target_indices:
                # Conexão sequencial normal — de baixo para cima do próximo
                if i + 1 < n:
                    result.append({"id": f"c{i + 1}", "from": cur, "to": f"n{i + 2}",
                                   "fromHandle": "bottom", "toHandle": "top",
                                   "decision": "", "label": ""})
        return result

    def _build_node_from_fo(idx: int, fo: dict[str, Any]) -> dict[str, Any]:
        """Cria um node garantido com nome/tipo correto a partir de um item do typed_flow_order."""
        label = fo["name"]
        ntype = fo["type"]
        desc = fo.get("desc", "")
        node: dict[str, Any] = {"id": f"n{idx + 1}", "label": label, "nodeType": ntype}
        if ntype == "entidade":
            node["campos"] = _default_entity_campos(label)
            node["entidadeNome"] = label
            node.setdefault("subtitle", label)
            node.setdefault("info", "id")
        elif ntype == "task":
            node["taskNome"] = label
            node["taskDescricao"] = desc
            node.setdefault("subtitle", "")
            node.setdefault("info", "")
        elif ntype == "condicional":
            node["condicionalNome"] = label
            node["condicionalDescricao"] = desc
            node.setdefault("subtitle", "")
            node.setdefault("gatewayType", "exclusivo")
        return node

    if typed_flow_order:
        # Nodes sempre corretos — construídos diretamente do flowOrder do frontend
        definitive_nodes = [_build_node_from_fo(i, fo) for i, fo in enumerate(typed_flow_order)]
        definitive_node_ids = {f"n{i + 1}" for i in range(len(typed_flow_order))}

        # Conexões construídas DIRETAMENTE do typed_flow_order — branching garantido correto.
        # Groq e Python fallback ignorados: IDs e ordering deles não são confiáveis.
        base_conns = _build_direct_connections_from_fo(typed_flow_order)

        # Layout serpentina (snake): colunas pares descem ↓, colunas ímpares sobem ↑.
        # Isso garante que conexões entre colunas tenham sempre a mesma Y nos dois lados,
        # produzindo linhas horizontais limpas que não cruzam nenhum retângulo.
        _MAX_PER_COL = 5
        _CARD_W      = 220.0
        _CARD_H      = 110.0
        _GAP_X       = 80.0    # canal livre à direita do ramo NAO, antes da próxima coluna
        _GAP_NAO     = 60.0    # espaço entre card principal e card do ramo NAO
        _GAP_Y       = 60.0    # espaço vertical entre nós da mesma coluna
        _X_START     = 60.0
        _Y_START     = 80.0
        _X_STEP      = _CARD_W + _GAP_NAO + _CARD_W + _GAP_X   # 580 px por coluna
        _Y_STEP      = _CARD_H + _GAP_Y                          # 170 px por linha

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
            _cross_col = abs(_fx - _tx) > _CARD_W / 2
            if _cross_col:
                if _dec == "sim":
                    # SIM cruzando colunas: mantém bottom→top.
                    # O frontend roteia a linha ABAIXO do ramo NAO (midY = y1 + CARD_H),
                    # evitando atravessar o retângulo NAO que fica na mesma Y do condicional.
                    pass
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
        for _ci2, _fo2 in enumerate(typed_flow_order):
            if _fo2.get("type") != "condicional":
                continue
            _cid2 = f"n{_ci2 + 1}"
            _n2   = len(typed_flow_order)
            if _cid2 not in _cond_has_nao:
                _nao_fb = _ci2 + 1
                if _nao_fb < _n2:
                    base_conns.append({"id": f"c{_ci2 + 1}a_fb",
                                       "from": _cid2, "to": f"n{_nao_fb + 1}",
                                       "fromHandle": "right", "toHandle": "left",
                                       "decision": "nao", "label": "\u2718"})
            if _cid2 not in _cond_has_sim:
                _sim_fb = _ci2 + 2
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
        _tipo = _normalize_entity_type(_tipo_raw, default="apoio") if _tipo_raw else _entity_type_label("", _ei)
        entity_actions_groq.append({
            "id": f"a{len(entity_actions_groq) + 1}",
            "type": "create_entidade",
            "label": f"Criar entidade {_cname}",
            "risk": "medium",
            "requiresApproval": True,
            "payload": {
                "nome": _cname,
                "descricao": f"Entidade do processo: {process_name}",
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
            "subtitle": description,
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
                    "descricao": f"Representa a etapa de entidade do processo: {process_name}",
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
            "descricao": str(payload.get("descricao") or "Entidade gerada por IA").strip(),
            "tipoEntidade": str(payload.get("tipoEntidade") or "Processo"),
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
            "nome": str(payload.get("nome") or "Oportunidade IA").strip(),
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
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {ENTIDADES_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {OPORTUNIDADES_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {BPMN_EDITOR_STATE_TABLE} (
                        state_key TEXT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {AI_AUDIT_TABLE} (
                        id BIGINT PRIMARY KEY,
                        payload JSONB NOT NULL
                    )
                    """
                )

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
        print(f"[OK] Oportunidade criada: id={new_id}, nome={oportunidade_dict.get('nome')}, total={len(fake_oportunidades)}")
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
def get_oportunidades(page: int = 1, limit: int = 10, search: str = ""):
    global fake_oportunidades
    fake_oportunidades = load_oportunidades_data()
    normalized = [normalize_oportunidade(item) for item in fake_oportunidades]
    if search.strip():
        search_lower = search.strip().lower()
        normalized = [
            item for item in normalized
            if search_lower in (item.get("nome") or item.get("name") or "").lower()
        ]
    start = (page - 1) * limit
    end = start + limit
    total = len(normalized)
    return {
        "data": normalized[start:end],
        "total": total,
        "page": page,
        "limit": limit
    }

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

            fake_oportunidades[idx] = merged
            try:
                save_oportunidades_data(fake_oportunidades)
            except Exception as e:
                print(f"[ERRO] Falha ao salvar oportunidades (update): {e}")
                raise HTTPException(status_code=500, detail=f"Falha ao persistir: {e}")
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
        fake_oportunidades.pop(idx)
        save_oportunidades_data(fake_oportunidades)
    return

@app.get("/entidades")
def get_entidades():
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
        new_id = max([e["id"] for e in fake_entidades], default=0) + 1
        now = now_iso()
        entidade_dict = entidade.dict()
        if not isinstance(entidade_dict.get("campos"), list):
            entidade_dict["campos"] = []
        entidade_dict["id"] = new_id
        entidade_dict["created_at"] = now
        entidade_dict["updated_at"] = now
        entidade_dict["criadoPor"] = entidade_dict.get("criadoPor") or "admin"
        fake_entidades.append(entidade_dict)
        save_entidades_data(fake_entidades)
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
                entidade_dict["id"] = entidade_id
                entidade_dict["created_at"] = e["created_at"]
                entidade_dict["updated_at"] = now_iso()
                entidade_dict["criadoPor"] = e["criadoPor"]
                fake_entidades[idx] = entidade_dict
                save_entidades_data(fake_entidades)
                return entidade_dict
    raise HTTPException(status_code=404, detail="Entidade não encontrada")


@app.delete("/entidades/{entidade_id}", status_code=204)
def delete_entidade(entidade_id: int):
    global fake_entidades
    with _data_lock:
        fake_entidades = load_entidades_data()
        idx = next((i for i, e in enumerate(fake_entidades) if e["id"] == entidade_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Entidade não encontrada")
        fake_entidades.pop(idx)
        save_entidades_data(fake_entidades)
    return


@app.put("/entidades/batch/sync")
def batch_sync_entidades(payload: dict = Body(...)):
    """Sync multiple entities in a single request (one lock acquisition, one disk write)."""
    global fake_entidades
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items deve ser uma lista")

    results = []
    with _data_lock:
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
                        data["id"] = int(entity_id)
                        data["created_at"] = e.get("created_at", now_iso())
                        data["updated_at"] = now_iso()
                        data["criadoPor"] = e.get("criadoPor", "admin")
                        fake_entidades[idx] = data
                        results.append(data)
                        changed = True
                        found = True
                        break
                if not found:
                    results.append({"id": entity_id, "error": "not_found"})

            elif action == "upsert" and entity_id is None:
                # Create new
                new_id = max([e["id"] for e in fake_entidades], default=0) + 1
                now = now_iso()
                if not isinstance(data.get("campos"), list):
                    data["campos"] = []
                data["id"] = new_id
                data["created_at"] = now
                data["updated_at"] = now
                data["criadoPor"] = data.get("criadoPor") or "admin"
                fake_entidades.append(data)
                results.append(data)
                changed = True

        if changed:
            save_entidades_data(fake_entidades)

    return {"items": results}


# Função mock para extrair user_id do token fake
def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.split()[1]
    # Token fake: fake-token-<id>
    if not token.startswith("fake-token-"):
        raise HTTPException(status_code=401, detail="Token inválido")
    try:
        user_id = int(token.replace("fake-token-", ""))
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Token inválido")
    user_dict = {k: v for k, v in user.items() if k != "senha"}
    # Garante que role e admin venham do users.json
    user_dict["admin"] = user.get("admin", False)
    user_dict["role"] = user.get("role", "user")
    return user_dict

# Endpoint para retornar o usuário autenticado
@app.get("/users/me", response_model=UserOut)
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
    }



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

    with _data_lock:
        bpmn_editor_state = next_state
        save_bpmn_editor_state(BPMN_EDITOR_STATE_FILE, bpmn_editor_state)
    return bpmn_editor_state


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
        "Regras obrigatórias:\n"
        "- 'entities': lista de objetos com {\"name\": string, \"tipoEntidade\": string}. "
        "Inclua TODOS os substantivos relevantes: objetos de dados, documentos E participantes/atores nomeados "
        "(ex: Pedido, Nota Fiscal, Cliente, Fornecedor, Aprovacao). "
        "Para tipoEntidade use EXATAMENTE um destes valores:\n"
        "  - 'principal': entidade central do processo (geralmente o objeto que o processo transforma, ex: Pedido)\n"
        "  - 'apoio': entidades secundárias que participam mas não são o foco (ex: Aprovacao, OrdemDeCompra)\n"
        "  - 'externa': atores/participantes externos, fornecedores e clientes (ex: Cliente, Fornecedor)\n"
        "  - 'associativa': entidade de relacionamento entre outras duas entidades\n"
        "- 'activities': lista de strings com tarefas (verbos no infinitivo, ex: Analisar Pedido).\n"
        "- 'conditionals': lista de strings com decisões exclusivas, SEMPRE terminam com '?' (ex: Pedido aprovado?).\n"
        "- 'flowOrder': sequência ordenada de TODOS os elementos acima — inclua todas as entidades, atividades e condicionais, "
        "sem omitir nenhum. Cada item é {\"name\": string, \"type\": \"task\"|\"condicional\"|\"entidade\", \"tipoEntidade\": string (só para entidades)}.\n"
        "  Para condicionais em flowOrder, adicione 'branches': {\"sim\": \"<próximo elemento se verdadeiro>\", \"nao\": \"<próximo elemento se falso>\"}.\n"
        "- Retorne JSON válido com exatamente estas chaves: processName, entities, activities, conditionals, flowOrder.\n"
        "- Não inclua explicações, apenas o JSON."
    )

    user_prompt = f"Nome do processo: {process_name}\n\nDescrição:\n{description}"

    # Usa modelo menor (8b) para extração estruturada: limite muito mais alto (6000 RPM)
    # e qualidade suficiente para essa tarefa simples vs 70b (30 RPM).
    _PARSE_MODEL = "llama-3.1-8b-instant"
    groq_payload = {
        "model": _PARSE_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
    }
    groq_headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=groq_headers,
            json=groq_payload,
            timeout=AI_LLM_TIMEOUT_SECONDS,
        )
        # Retry único com backoff quando o Groq sinalizar rate limit temporário
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("retry-after", 5))
            wait = min(retry_after, 10)
            time.sleep(wait)
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=groq_headers,
                json=groq_payload,
                timeout=AI_LLM_TIMEOUT_SECONDS,
            )
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Limite de requisições da IA atingido. Aguarde alguns instantes e tente novamente.")
        if not resp.ok:
            raise RuntimeError(f"Groq HTTP {resp.status_code}")

        raw_json = resp.json()
        content  = raw_json.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed   = json.loads(content)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[parse-description] Groq falhou: {exc}")
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
                flow_order.append(fo_item)

    # entities como lista de objetos {name, tipoEntidade}
    entities_out = [
        {"name": name, "tipoEntidade": entity_tipo_map.get(name.lower(), "apoio")}
        for name in parsed_entities_names
    ]

    return {
        "processName":  str(parsed.get("processName") or process_name).strip(),
        "entities":     entities_out,
        "activities":   _to_str_list(parsed.get("activities")),
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
    actions_to_execute = [
        action for action in all_actions
        if isinstance(action, dict) and str(action.get("id", "")).strip() in selected_ids
    ]

    if not actions_to_execute:
        raise HTTPException(status_code=400, detail="Nenhuma acao valida foi selecionada para execucao.")

    results = []
    for action in actions_to_execute:
        result = _execute_ai_action(action, current_user)
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

    principal_admin_id = get_principal_admin_id(users)

    total = len(users)
    start = (page - 1) * limit
    end = start + limit
    paginated = [
        {
            "id": user.get("id", index + 1),
            "nome": user.get("nome", user.get("username", "")),
            "email": user.get("email", ""),
            "nivel": str(user.get("nivel", "1")),
            "cargo": user.get("cargo", ""),
            "data": user.get("created_at", user.get("data", "")),
            "admin": user.get("admin", False),
            "role": "admin" if user.get("admin", False) else "user",
            "is_principal_admin": int(user.get("id", index + 1)) == principal_admin_id,
        }
        for index, user in enumerate(users[start:end], start)
    ]
    return paginated_users_response(paginated, total, page, limit)

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
    senha_hash = hash_password(auth.senha)
    if not user or user["senha"] != senha_hash:
        raise HTTPException(status_code=400, detail="Email ou senha inválidos")

    safe_user = {k: v for k, v in user.items() if k != "senha"}
    return {
        "access_token": f"fake-token-{user['id']}",
        "token_type": "bearer",
        "user": safe_user,
    }

@app.put("/users/{user_id}")
def update_user(user_id: int, user: UserUpdate, current_user: dict = Depends(get_current_user)):
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
def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
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