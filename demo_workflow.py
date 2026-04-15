"""
Demonstração completa do Workflow Engine
=========================================
Este script mostra o ciclo de vida completo de um workflow BPMN:
1. Cria uma oportunidade
2. Inicia o workflow
3. Lista tarefas geradas automaticamente
4. Completa tarefas
5. Mostra avanço automático
6. Verifica SLA e métricas
"""
import urllib.request, json, time, sys

BASE = "http://localhost:8000"
TOKEN = None

def api(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        return {"_error": e.code, "_detail": err}

def p(title, data):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")
    if isinstance(data, dict):
        print(json.dumps(data, indent=2, ensure_ascii=False)[:1500])
    else:
        print(data)

# ── PASSO 0: Login ───────────────────────────────────
print("DEMO DO WORKFLOW ENGINE")
print("="*60)
r = api("POST", "/auth/login", {"email": "renan1395@hotmail.com", "senha": "123456"})
if "_error" in r:
    print(f"Erro no login: {r}")
    sys.exit(1)
TOKEN = r["access_token"]
p("PASSO 0 - Login OK", f"Usuário: {r['user']['nome']} ({r['user']['email']})")

# ── PASSO 1: Ver workflows existentes ────────────────
r = api("GET", "/workflows")
items = r.get("data", r) if isinstance(r, dict) else r
p("PASSO 1 - Workflows existentes", f"Total: {len(items)} workflows")
for w in (items[:3] if isinstance(items, list) else []):
    print(f"  • Op#{w.get('opportunityId')} - {w.get('opportunityName','')} [{w.get('status')}]")

# ── PASSO 2: Ver estado de um workflow ────────────────
op_id = items[0]["opportunityId"] if items else 1
r = api("GET", f"/workflow/{op_id}/state")
p(f"PASSO 2 - Estado do workflow (Op#{op_id})", r)

# ── PASSO 3: Listar tarefas ──────────────────────────
r = api("GET", "/workflow/tasks?status=pending")
tasks = r.get("data", r) if isinstance(r, dict) else r
p("PASSO 3 - Tarefas pendentes", f"Total: {len(tasks) if isinstance(tasks, list) else '?'}")
if isinstance(tasks, list):
    for t in tasks[:5]:
        print(f"  • Task {t.get('taskId',t.get('id','?'))}: {t.get('label','?')} [assignee={t.get('assignee','ninguém')}]")

# ── PASSO 4: Completar uma tarefa (se houver) ────────
if isinstance(tasks, list) and len(tasks) > 0:
    task = tasks[0]
    tid = task.get("taskId", task.get("id"))
    p(f"PASSO 4 - Completando tarefa {tid}", f"'{task.get('label','?')}'")
    r = api("POST", f"/workflow/tasks/{tid}/complete", {"formData": {}})
    p("Resultado da conclusão", r)
else:
    p("PASSO 4 - Nenhuma tarefa pendente para completar", "Pulando...")

# ── PASSO 5: Ver tarefas após avanço ─────────────────
r = api("GET", "/workflow/tasks?status=pending")
tasks2 = r.get("data", r) if isinstance(r, dict) else r
p("PASSO 5 - Tarefas após avanço", f"Total pendentes: {len(tasks2) if isinstance(tasks2, list) else '?'}")
if isinstance(tasks2, list):
    for t in tasks2[:5]:
        print(f"  • Task {t.get('taskId',t.get('id','?'))}: {t.get('label','?')}")

# ── PASSO 6: Métricas ────────────────────────────────
r = api("GET", "/metrics/dashboard")
p("PASSO 6 - Dashboard de Métricas", r)

# ── PASSO 7: SLA ─────────────────────────────────────
r = api("GET", "/sla/overdue-tasks")
p("PASSO 7 - Tarefas com SLA estourado", r)

# ── PASSO 8: Eventos emitidos ────────────────────────
r = api("GET", "/events?limit=5")
events = r.get("data", r) if isinstance(r, dict) else r
p("PASSO 8 - Últimos eventos do sistema", f"Total: {len(events) if isinstance(events, list) else '?'}")
if isinstance(events, list):
    for e in events[:5]:
        print(f"  • [{e.get('event_type')}] op={e.get('opportunity_id')} @ {e.get('created_at','')[:19]}")

print(f"\n{'='*60}")
print("  DEMO CONCLUÍDA!")
print(f"{'='*60}")
print("""
RESUMO DO QUE ACONTECEU:
1. Autenticou via JWT
2. Listou workflows em execução
3. Viu o estado atual do workflow (nó atual, progresso)  
4. Listou tarefas automáticas geradas pelo BPMN
5. Completou uma tarefa → workflow avançou automaticamente
6. Verificou métricas de performance
7. Verificou SLA (prazos)
8. Viu eventos emitidos (webhook triggers)

Tudo isso é gerado AUTOMATICAMENTE a partir do diagrama BPMN!
""")
