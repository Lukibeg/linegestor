#!/usr/bin/env bash
# Manda um aviso usando o que está configurado em Administração › Ajustes › Avisos.
#
#   ./scripts/avisar.sh "o sistema não respondeu"
#
# Não sabe nada de banco nem de senha: lê a cópia pronta que o sistema grava em config/avisos.json
# toda vez que os ajustes são salvos. É de propósito — assim o aviso funciona mesmo quando
# o sistema está fora do ar, que é justamente quando ele mais importa.
set -uo pipefail
cd "$(dirname "$0")/.."
MSG="${1:-aviso sem texto}"
CFG="./config/avisos.json"

[[ -f "$CFG" ]] || { echo "avisos desligados (não existe $CFG)"; exit 0; }
command -v python3 >/dev/null || { echo "python3 não encontrado; não deu para avisar" >&2; exit 0; }

python3 - "$CFG" "$MSG" <<'PY'
import json, sys, urllib.request, urllib.error
cfg_path, mensagem = sys.argv[1], sys.argv[2]
try:
    cfg = json.load(open(cfg_path))
except Exception as e:
    print(f'ajustes de aviso ilegíveis: {e}'); raise SystemExit(0)

url = (cfg.get('url') or '').replace('{{mensagem}}', mensagem)
if not url:
    print('sem endereço de aviso configurado'); raise SystemExit(0)
metodo = cfg.get('metodo', 'POST')
corpo = cfg.get('corpo')
dados = corpo.replace('{{mensagem}}', mensagem).encode() if (corpo and metodo != 'GET') else None
req = urllib.request.Request(url, data=dados, method=metodo)
for k, v in (cfg.get('cabecalhos') or {}).items():
    req.add_header(k, str(v).replace('{{mensagem}}', mensagem))
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        print(f'aviso enviado ({r.status}): {mensagem}')
except urllib.error.HTTPError as e:
    print(f'a API de avisos respondeu {e.code}: {e.read()[:200]!r}')
except Exception as e:
    print(f'não deu para avisar: {e}')
PY
