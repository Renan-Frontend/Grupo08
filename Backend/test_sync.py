#!/usr/bin/env python3
"""Script para testar sincronização de contatos"""
import json
import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTROS_FILE = os.path.join(BACKEND_DIR, "registros.json")
CONTATOS_FILE = os.path.join(BACKEND_DIR, "contatos.json")

def load_json(filepath):
    if not os.path.exists(filepath):
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# Carrega registros
registros = load_json(REGISTROS_FILE)
print(f"[INFO] Carregados {len(registros)} registros")

# Filtra contatos
contatos_registros = [r for r in registros if r.get("papelNegocio") == "contato"]
print(f"[INFO] {len(contatos_registros)} registros são de contato")

# Sincroniza
contatos = []
for reg in contatos_registros:
    print(f"\n[SYNC] Sincronizando registro id={reg.get('id')}, titulo={reg.get('titulo')}")
    
    contato = {
        "id": len(contatos) + 1,
        "nome": reg.get("titulo", ""),
        "cargo": "",
        "email": "",
        "telefone": "",
        "empresa": "",
        "descricao": "",
        "notas": "",
        "isPrimary": False,
        "entidadeId": reg.get("entidadeId"),
        "entidadeNome": reg.get("entidadeNome"),
        "opportunityId": reg.get("dados", {}).get("oportunidadeId"),
        "opportunityName": "",
        "registro_id": reg.get("id"),
        "ativo": True,
        "created_at": reg.get("created_at"),
        "updated_at": reg.get("updated_at"),
        "criadoPor": reg.get("criadoPor", "registro_sync"),
    }
    contatos.append(contato)
    print(f"  → Contato criado: id={contato['id']}, nome={contato['nome']}")

# Salva contatos
contatos_data = {"contatos_store": contatos}
save_json(CONTATOS_FILE, contatos_data)
print(f"\n[OK] Salvos {len(contatos)} contatos em {CONTATOS_FILE}")
