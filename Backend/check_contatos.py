#!/usr/bin/env python3
"""Script para testar se contatos estão salvos corretamente"""
import json
import os

CONTATOS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "contatos.json"
)

def load_collection(filepath, collection_key, default):
    """Carrega uma coleção de um arquivo JSON"""
    if not os.path.exists(filepath):
        return default
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict) and collection_key in data:
            return data[collection_key]
        return default
    except Exception as e:
        print(f"Erro ao carregar {filepath}: {e}")
        return default

# Testa contatos.json
contatos = load_collection(CONTATOS_FILE, "contatos_store", [])
print(f"✅ Arquivo contatos.json existe")
print(f"📊 Total de contatos: {len(contatos)}")

if contatos:
    print(f"\n📋 Contatos:")
    for c in contatos:
        print(f"  - ID {c.get('id')}: {c.get('nome')} (registro_id: {c.get('registro_id')})")
        print(f"    Entidade: {c.get('entidadeNome')} (ID {c.get('entidadeId')})")
        print(f"    Oportunidade: {c.get('opportunityId')}")
else:
    print("⚠️  Nenhum contato encontrado!")
