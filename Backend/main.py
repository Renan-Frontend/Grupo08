import os
import uuid
import requests
from datetime import datetime, timedelta
from typing import Any
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
USERS_TABLE = "users_store"
ENTIDADES_TABLE = "entidades_store"
OPORTUNIDADES_TABLE = "oportunidades_store"
BPMN_EDITOR_STATE_TABLE = "bpmn_editor_state_store"

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

    return db_driver.connect(db_url, connect_timeout=10)


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

    if not row or not isinstance(row[0], dict):
        return fallback

    return row[0]


def save_bpmn_editor_state(file_path, state_payload):
    safe_payload = state_payload if isinstance(state_payload, dict) else {}
    if not USE_SUPABASE_DB:
        save_json(file_path, safe_payload)
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
                ("default", json_adapter(safe_payload)),
            )
        conn.commit()


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
    origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    return [origin.strip() for origin in origins_raw.split(",") if origin.strip()]


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
    save_oportunidades_data(fake_oportunidades)
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

init_supabase_storage()

# --- Load persisted data or use defaults ---
fake_entidades = load_entidades_data()
bpmn_editor_state = load_bpmn_editor_state(
    BPMN_EDITOR_STATE_FILE,
    {
        "name": "Novo BPMN",
        "nodes": [],
        "connections": [],
        "updated_at": "",
    },
)

fake_oportunidades = load_oportunidades_data()
if not isinstance(fake_oportunidades, list):
    fake_oportunidades = []
# Endpoint para listar oportunidades (fake)
@app.get("/oportunidades")
def get_oportunidades(page: int = 1, limit: int = 10):
    global fake_oportunidades
    fake_oportunidades = load_oportunidades_data()
    normalized = [normalize_oportunidade(item) for item in fake_oportunidades]
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
            save_oportunidades_data(fake_oportunidades)
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
    fake_entidades = load_entidades_data()
    idx = next((i for i, e in enumerate(fake_entidades) if e["id"] == entidade_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Entidade não encontrada")
    fake_entidades.pop(idx)
    save_entidades_data(fake_entidades)
    return
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
    users = load_users_data()
    user = next((u for u in users if u["id"] == user_id), None)
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

    bpmn_editor_state = next_state
    save_bpmn_editor_state(BPMN_EDITOR_STATE_FILE, bpmn_editor_state)
    return bpmn_editor_state

@app.get("/users")
def get_users(page: int = 1, limit: int = 8):
    users = load_users_data()
    if not isinstance(users, list):
        return paginated_users_response([], 0, page, limit)

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
    users = load_users_data()
    user = next((u for u in users if u["email"] == auth.email), None)
    senha_hash = hash_password(auth.senha)
    if not user or user["senha"] != senha_hash:
        raise HTTPException(status_code=400, detail="Email ou senha inválidos")
    return {
        "access_token": f"fake-token-{user['id']}",
        "token_type": "bearer"
    }

@app.put("/users/{user_id}")
def update_user(user_id: int, user: UserUpdate):
    users = load_users_data()
    idx = next((i for i, u in enumerate(users) if u["id"] == user_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
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
def delete_user(user_id: int):
    users = load_users_data()
    idx = next((i for i, u in enumerate(users) if u["id"] == user_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

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