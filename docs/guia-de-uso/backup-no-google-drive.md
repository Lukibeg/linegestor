# Mandar o backup para o Google Drive da empresa

O backup diário fica no servidor **e** sobe para uma pasta do Google Drive da Ingline. Este é o
passo a passo de ligar isso — feito uma vez, na instalação.

O programa que faz a ponte chama-se **rclone**. Ele fala com o Drive pela conta Google da empresa,
como um aplicativo autorizado. A autorização é pedida uma vez; depois ele renova sozinha.

---

## 1. No Google Drive, crie a pasta

No Drive da empresa, crie uma pasta — por exemplo **Backups › Ingline Gestão**.

Deixe essa pasta **sem compartilhamento**: o arquivo tem os dados dos clientes em texto (as senhas
guardadas no cofre continuam cifradas, essas não abrem). Quem vê a pasta vê a base.

## 2. No servidor, instale o rclone

```bash
sudo apt-get install -y rclone
```

## 3. Autorize — a parte que tem um truque

O servidor não tem navegador, e o Google precisa de um para você fazer login. Então a autorização
acontece no **seu computador** e o resultado é colado no servidor.

**No servidor:**

```bash
rclone config
```

Responda assim:

| Pergunta | Resposta |
|---|---|
| `n/s/q` | `n` (new remote) |
| `name` | `drive` |
| `Storage` | procure `drive` (Google Drive) e escolha o número dele |
| `client_id` | deixe vazio (Enter) |
| `client_secret` | deixe vazio (Enter) |
| `scope` | escolha **`drive.file`** — assim o rclone só enxerga o que ele mesmo criou, nada do resto do Drive |
| `service_account_file` | vazio (Enter) |
| `Edit advanced config?` | `n` |
| `Use web browser to automatically authenticate?` | **`n`** ← importante |

Ele então mostra um comando parecido com este e fica esperando:

```
rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"
```

**No seu computador (Windows):** baixe o rclone em <https://rclone.org/downloads/>, descompacte,
abra o Prompt de Comando naquela pasta e cole **exatamente** o comando que o servidor mostrou.
O navegador abre, você entra com a conta Google da empresa e autoriza. O Prompt devolve um bloco
de texto entre chaves — `{"access_token":...}`.

**De volta no servidor:** cole esse bloco na pergunta que estava esperando, confirme com `y` e
saia com `q`.

## 4. Diga ao sistema para onde mandar

No `.env` do servidor:

```
BACKUP_REMOTO="drive:Backups/Ingline Gestao"
```

> Use o nome da pasta **sem acento** aqui, para não depender de codificação de caracteres no
> caminho. A pasta no Drive pode ter acento; o rclone cria a que faltar.

## 5. Teste na hora

```bash
cd /opt/gestao && ./scripts/backup.sh
rclone ls "drive:Backups/Ingline Gestao"
```

Se o arquivo aparecer na listagem (e na pasta, pelo navegador), está pronto. A partir daí ele sobe
sozinho todo dia às 3h.

---

## O que acontece depois, sozinho

- **Todo dia às 3h** o backup é gerado, comprimido e copiado para a pasta do Drive.
- **Passados 60 dias**, as cópias antigas são apagadas de lá (sem passar pela lixeira do Drive, para
  não ocupar espaço à toa). No servidor, a regra é outra: 14 diárias e 8 semanais.
- **Se a cópia falhar** — internet fora, autorização revogada, cota cheia — o backup local continua
  sendo feito e um aviso é enviado para o `ALERTA_URL`.
- **Toda segunda** o `verificar-backup.sh` restaura o arquivo mais novo num banco descartável e
  confere se veio conteúdo de verdade.

## Cuidados

- **A pasta não pode ser compartilhada.** É a base da empresa em texto.
- **Se alguém sair da empresa** e a conta Google usada aqui for a dela, a autorização morre junto.
  Use uma conta que fique — a do administrador do Workspace, ou uma conta de serviço da empresa.
- **A `SECRETS_MASTER_KEY` não está no backup** (ela mora no `.env`). Sem ela, as senhas guardadas
  no cofre não voltam nem com o backup em mãos — por isso a cópia dela no gerenciador de senhas é
  tão importante quanto o backup em si.
