#!/usr/bin/env python3
"""Script para sincronizar registros contato para array contacts das oportunidades"""
import json
import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTROS_FILE = os.path.join(BACKEND_DIR, "registros.json")
OPPS_FILE = os.path.join(BACKEND_DIR, "oportunidades.json")

# Lê registros
with open(REGISTROS_FILE, encoding='utf-8') as f:
    registros = json.load(f)

# Lê oportunidades
with open(OPPS_FILE, encoding='utf-8') as f:
    data = json.load(f)

opps = data if isinstance(data, list) else data.get('oportunidades_store', [])
print(f"[INFO] {len(registros)} registros, {len(opps)} oportunidades")

synced = 0
for reg in registros:
    if reg.get('papelNegocio') != 'contato':
        continue
    dados = reg.get('dados', {}) or {}
    opp_id_raw = dados.get('oportunidadeId')
    try:
        opp_id = int(opp_id_raw)
    except:
        print(f"  [SKIP] registro id={reg.get('id')} sem oportunidadeId válido: {opp_id_raw!r}")
        continue
    
    contato = {
        'id': f'reg_{reg["id"]}',
        'nome': reg.get('titulo', ''),
        'cargo': '',
        'email': '',
        'telefone': '',
        'isPrimary': False,
        'entidadeId': reg.get('entidadeId'),
        'entidadeNome': reg.get('entidadeNome'),
        'registro_id': reg['id'],
    }
    
    found = False
    for opp in opps:
        if int(opp.get('id', -1)) == opp_id:
            contacts = opp.get('contacts') or []
            contacts = [c for c in contacts if c.get('registro_id') != reg['id']]
            contacts.append(contato)
            opp['contacts'] = contacts
            print(f"  [OK] Adicionado '{contato['nome']}' na oportunidade id={opp_id}")
            synced += 1
            found = True
            break
    
    if not found:
        print(f"  [WARN] Oportunidade id={opp_id} não encontrada")

if isinstance(data, list):
    data_to_save = opps
else:
    data_to_save = data

with open(OPPS_FILE, 'w', encoding='utf-8') as f:
    json.dump(data_to_save, f, indent=2, ensure_ascii=False)

print(f"\n[OK] {synced} contatos sincronizados para oportunidades.json")
