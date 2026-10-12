"""
Grava o vídeo do patch (Patch 1.9, decisão 0046): o vídeo que abre no login, no lugar dos cartões
(os cartões continuam na página Novidades). Grava a PRÉVIA, com os dados de exemplo, com um cursor
visível, uma legenda numerada para cada mudança e uma capa no começo e no fim, e converte para MP4
(H.264, o que toca em todo navegador).

    1. pnpm --filter @gestor/web build:demo
    2. python3 -m http.server 4174 -d apps/web/dist-demo          (noutra janela)
    3. python3 scripts/gravar-video-do-patch.py docs/novidades/<versao>/o-que-mudou.mp4
    4. no cabeçalho de docs/novidades/<versao>.md:   video: <versao>/o-que-mudou.mp4
       e `pnpm novidades:demo` + `build:demo` de novo (a prévia passa a abrir com o vídeo)

Precisa do Playwright (Python) e do ffmpeg. **Cada patch tem o seu roteiro**: troque a função
`roteiro()` (e o `antes_do_roteiro()`, o que roda atrás da capa), a `PRIMEIRA_TELA` e os textos da
capa pelos do patch novo — o roteiro do 1.9 fica como
exemplo (`roteiro_1_9`). O jeito do vídeo
(o que o Luan aprovou em 10/10): uns 2 minutos, sem som (o que importa vai na legenda), os dados de
exemplo da prévia, e a capa e o fim falando com a equipe — nada de "prévia" nem de "quando você der
o ok": quem assiste é a equipe, no login, depois de publicado.

Por que assim:
  - o Chromium do Playwright não toca MP4 (H.264): o vídeo do tutorial do portal, na gravação, vai
    em WebM (convertido na hora, a partir do MP4 de exemplo da prévia);
  - a janela do login da própria prévia abre com o vídeo do patch, que aqui não toca: atrás da capa,
    o roteiro segue pelos cartões ("O vídeo não abre? Ler em texto");
  - o aviso "Novidades marcadas como lidas" dura 4 s: a capa só sai depois dele;
  - a gravação começa antes de a página carregar: o começo (entrar, a janela do login) fica atrás da
    capa e é cortado na conversão, deixando ~3 s de capa no começo do vídeo.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('PREVIA_URL', 'http://localhost:4174/')
SAIDA = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(RAIZ, 'o-que-mudou.mp4')

# ---------- os textos do patch (troque a cada patch) ----------
CAPA = ('Patch 1.10 — os chamados agora são do Gestor', 'Ingline Gestão · o módulo novo em 2 minutos, com dados de exemplo')
FIM = ('Os detalhes estão em Novidades', 'Cada mudança, com o texto e o print, fica no menu Novidades')
# a tela que fica atrás da capa (o roteiro começa nela)
PRIMEIRA_TELA = '/atendimento'
# quanto da capa fica no começo do vídeo, em segundos (a gravação começa com uns 0 a 2 s de
# diferença do relógio daqui: na prática a capa fica entre 2,5 e 4,5 s)
CAPA_NO_COMECO = 2.5

ASSETS = os.path.join(RAIZ, 'apps/web/dist-demo/assets')
SIMBOLO = next(n for n in os.listdir(ASSETS) if n.startswith('ingline-simbolo'))

INIT = r"""
(() => {
  const css = `
    #__cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
      background: rgba(255,255,255,.9); border: 3px solid #2563eb; box-shadow: 0 2px 6px rgba(0,0,0,.35);
      pointer-events: none; z-index: 2147483645; }
    .__onda { position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 3px solid #2563eb;
      pointer-events: none; z-index: 2147483644; animation: __onda .6s ease-out forwards; }
    @keyframes __onda { to { transform: scale(3.4); opacity: 0; } }
    #__capa { position: fixed; inset: 0; z-index: 2147483646; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 16px; background: radial-gradient(ellipse at top, #dbe4ff, #f8fafc 72%); transition: opacity .6s;
      font-family: 'Public Sans', 'Segoe UI', sans-serif; text-align: center; padding: 0 60px; pointer-events: none; }
    #__capa img { width: 84px; height: 84px; }
    #__capa .t { font-size: 46px; font-weight: 800; color: #0f172a; letter-spacing: -.5px; }
    #__capa .s { font-size: 21px; color: #475569; max-width: 900px; line-height: 1.45; }
    #__legenda { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 2147483643; display: flex; gap: 14px;
      align-items: center; max-width: 1000px; width: max-content; padding: 14px 22px 14px 16px; border-radius: 16px;
      background: rgba(15,23,42,.93); color: #fff; box-shadow: 0 12px 32px rgba(0,0,0,.28); opacity: 0; transition: opacity .35s;
      font-family: 'Public Sans', 'Segoe UI', sans-serif; pointer-events: none; }
    #__legenda .n { flex: none; width: 36px; height: 36px; border-radius: 50%; background: #2563eb; display: flex; align-items: center;
      justify-content: center; font-weight: 800; font-size: 17px; }
    #__legenda .t { font-weight: 800; font-size: 20px; }
    #__legenda .s { font-size: 16px; color: #cbd5e1; margin-top: 3px; }
  `;
  function pronto(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  pronto(() => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const cur = document.createElement('div'); cur.id = '__cursor'; cur.style.transform = 'translate(640px, 360px)'; document.body.appendChild(cur);
    document.addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__onda'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 650);
    }, true);
    // a capa fica POR CIMA do cursor (a ordem dos z-index), e não pega os cliques (pointer-events)
    const capa = document.createElement('div'); capa.id = '__capa';
    capa.innerHTML = '<img src="assets/__SIMBOLO__" alt=""><div class="t">__TITULO__</div><div class="s">__SUB__</div>';
    document.body.appendChild(capa);
    const leg = document.createElement('div'); leg.id = '__legenda'; document.body.appendChild(leg);
  });
  window.__capa = (t, s) => { const c = document.getElementById('__capa'); c.querySelector('.t').textContent = t; c.querySelector('.s').textContent = s; c.style.display = 'flex'; requestAnimationFrame(() => { c.style.opacity = '1'; }); };
  window.__semCapa = () => { const c = document.getElementById('__capa'); c.style.opacity = '0'; setTimeout(() => { c.style.display = 'none'; }, 650); };
  window.__legenda = (n, t, s) => {
    const l = document.getElementById('__legenda');
    l.innerHTML = '<span class="n"></span><div><div class="t"></div><div class="s"></div></div>';
    l.querySelector('.n').textContent = n; l.querySelector('.t').textContent = t; l.querySelector('.s').textContent = s;
    l.style.opacity = '1';
  };
  window.__semLegenda = () => { document.getElementById('__legenda').style.opacity = '0'; };
})();
""".replace('__SIMBOLO__', SIMBOLO).replace('__TITULO__', CAPA[0]).replace('__SUB__', CAPA[1])


# ---------- as peças de qualquer roteiro ----------

def esperar(page, ms):
    page.wait_for_timeout(ms)


def ir(page, h, ms=1200):
    # a tela nova começa do alto (a prévia mantém a rolagem da tela anterior)
    page.evaluate(f"location.hash = {json.dumps(h)}; window.scrollTo(0, 0)")
    esperar(page, ms)


def apontar(page, loc, ms=350):
    """Leva o cursor até o elemento, devagar (24 passos), para quem assiste acompanhar."""
    loc.scroll_into_view_if_needed()
    esperar(page, 200)
    b = loc.bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    page.mouse.move(x, y, steps=24)
    esperar(page, ms)
    return x, y


def clicar(page, loc, ms=350):
    x, y = apontar(page, loc, ms)
    page.mouse.click(x, y)


def digitar(page, loc, texto):
    clicar(page, loc, 200)
    page.keyboard.type(texto, delay=75)


def legenda(page, n, t, s, ms=900):
    page.evaluate('([n, t, s]) => window.__legenda(n, t, s)', [str(n), t, s])
    esperar(page, ms)


def legenda_no_alto(page, sim=True):
    """A legenda sobe para o alto da tela (e volta): quando o que se mostra está embaixo, como o cartão do aviso."""
    page.evaluate("(sim) => { const l = document.getElementById('__legenda'); l.style.top = sim ? '20px' : ''; l.style.bottom = sim ? 'auto' : ''; }", sim)


def rolar(page, dy, passos=12):
    for _ in range(passos):
        page.mouse.wheel(0, dy / passos)
        esperar(page, 45)


def topo(page):
    page.evaluate('window.scrollTo({ top: 0, behavior: "smooth" })')
    esperar(page, 600)


def video_do_portal_em_webm():
    """O vídeo de exemplo do portal (MP4, embutido na prévia) em WebM, que o Chromium daqui toca."""
    fonte = open(os.path.join(RAIZ, 'apps/web/src/api/portal-demo-midia.ts'), encoding='utf-8').read()
    mp4 = base64.b64decode(re.search(r"VIDEO_TRANSFERIR = 'data:video/mp4;base64,([^']+)'", fonte).group(1))
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, 'v.mp4'), 'wb').write(mp4)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(tmp, 'v.mp4'), '-c:v', 'libvpx-vp9', '-b:v', '0',
                        '-crf', '38', '-an', os.path.join(tmp, 'v.webm')], check=True)
        return 'data:video/webm;base64,' + base64.b64encode(open(os.path.join(tmp, 'v.webm'), 'rb').read()).decode()


def entrar_atras_da_capa(page):
    """
    Entra como admin e passa pela janela do login (pelos cartões: o vídeo do patch não toca aqui).
    O vídeo que não abre faz a janela cair sozinha nos cartões (o botão "Ler em texto" some no meio
    do clique), e pode haver mais de uma nota por ler: por isso a volta, e o clique que tolera sumir.
    """
    page.fill('#email', 'admin@gestor.local')
    page.fill('#password', 'demo')
    page.click('button:has-text("Entrar")')
    esperar(page, 2500)
    for _ in range(4):
        ler = page.get_by_role('button', name='O vídeo não abre? Ler em texto')
        if ler.count():
            try:
                ler.click(timeout=2000)
            except Exception:
                pass  # a janela já caiu sozinha nos cartões
            esperar(page, 300)
        bolinhas = page.locator('button[aria-label^="Ir para "]')
        caixa = page.locator('label:has-text("Li e entendi") input[type=checkbox]')
        if not bolinhas.count() and not caixa.count():
            break
        for i in range(bolinhas.count()):
            bolinhas.nth(i).click()
            esperar(page, 40)
        if caixa.count():
            caixa.check()
            page.get_by_role('button', name='Concluir').click()
            esperar(page, 900)


# ---------- o roteiro do Patch 1.10 (troque pelo do patch novo) ----------

# Os chamados do roteiro, pelo título: na prévia, os números depois do SUP-16 mudam conforme o dia
# em que ela abre (o agendado de toda segunda troca de lugar com os mais novos). O código de cada um
# sai do quadro do Suporte, atrás da capa (`antes_do_roteiro`).
CHAMADOS = {
    'mover': 'Fila do SAC sem música de espera',
    'ficha': 'Ligações para o hospital caindo e às vezes sem completar',
    'problema': 'Quedas no tronco da Algar em Salvador',
    'esperar': 'Firewall bloqueando o IP novo do CD de Feira de Santana',
    'ia': 'Chamado pelo WhatsApp',
}
COD = {}


def antes_do_roteiro(page):
    ir(page, '/atendimento/quadro?painel=painel-suporte', 1800)
    COD.update(page.evaluate("""(titulos) => Object.fromEntries(Object.entries(titulos).map(([k, t]) => {
        const li = [...document.querySelectorAll('li[data-codigo]')].find((x) => x.querySelector('a.line-clamp-2')?.textContent.trim() === t);
        return [k, li ? li.getAttribute('data-codigo') : null];
    }))""", CHAMADOS))
    faltam = [CHAMADOS[k] for k, v in COD.items() if not v]
    if faltam:
        raise SystemExit(f'Não achei no quadro do Suporte: {faltam}')
    print('os chamados do roteiro:', COD)


def roteiro(page):
    n = iter(range(1, 100))
    # o módulo novo: a tela dos painéis (a que já está aberta atrás da capa)
    legenda(page, next(n), 'Os chamados agora são do Gestor', 'Os chamados nascem, andam e fecham aqui. Os antigos ficam em Chamados do LineChat.', 1400)
    apontar(page, page.locator('nav a:has-text("Chamados")').first, 1300)
    apontar(page, page.locator('nav a:has-text("Chamados do LineChat")').first, 1700)
    suporte = page.locator('article[data-painel="SUP"]').first
    legenda(page, next(n), 'Os painéis', 'Cada painel com os números de agora e as etapas. Clique para abrir o quadro; Configurar abre as etapas e as regras.', 900)
    apontar(page, suporte.locator('a:has-text("Vencidos")').first, 1500)
    apontar(page, suporte.locator('ul a').first, 1300)
    apontar(page, suporte.locator('a:has-text("Configurar")').first, 1500)

    # o Meu dia (a aba ao lado)
    clicar(page, page.get_by_role('link', name='Meu dia', exact=True)); esperar(page, 1300)
    legenda(page, next(n), 'Meu dia', 'Os seus, os que estão vencendo e os sem dono na fila, com o botão Assumir.', 1200)
    rolar(page, 520); esperar(page, 1800)
    topo(page)

    # o sininho, o tema e o Sair: no rodapé do menu (no computador, a barra de cima saiu)
    legenda(page, next(n), 'O sininho, o tema e o Sair', 'A barra de cima saiu, para sobrar espaço: eles ficam no rodapé do menu, ao lado do seu nome.', 900)
    clicar(page, page.get_by_role('button', name='Avisos dos chamados').first); esperar(page, 2200)
    # o aviso que chega: o cartão perto do sininho (o Testar mostra), e a notificação do navegador
    legenda(page, next(n), 'O aviso que chega', 'Aparece num cartão perto do sininho, com Abrir o chamado. Ali embaixo, ligue também a notificação do navegador.', 600)
    apontar(page, page.get_by_role('switch', name='Notificação do navegador').first, 1400)
    # o cartão aparece embaixo, perto do sininho: a legenda sobe para não cobrir
    legenda_no_alto(page)
    clicar(page, page.get_by_role('button', name='Testar o aviso').first); esperar(page, 3400)
    clicar(page, page.get_by_role('button', name='Fechar o aviso').first); esperar(page, 500)
    legenda_no_alto(page, False)
    apontar(page, page.get_by_role('button', name='Tema claro/escuro').first, 900)
    apontar(page, page.get_by_role('button', name='Sair').first, 1200)

    # o quadro, aberto pelo painel: mover pelo Mover do cartão; subir de nível pede o motivo
    clicar(page, page.get_by_role('link', name='Painéis', exact=True).first); esperar(page, 1200)
    clicar(page, page.locator('article[data-painel="SUP"] a:has-text("Abrir o quadro")').first); esperar(page, 1600)
    legenda(page, next(n), 'O quadro', 'N1, N2 e N3 continuam como colunas. Arraste o cartão ou use Mover: escalonar pede o motivo.', 1600)
    cartao = page.locator(f'li[data-codigo="{COD["mover"]}"]').first
    clicar(page, cartao.get_by_role('button', name='Mover')); esperar(page, 900)
    clicar(page, cartao.locator('button:has(span:text-is("N2"))').first); esperar(page, 900)
    page.keyboard.type('Precisa de acesso ao servidor do cliente para trocar o áudio da fila', delay=40); esperar(page, 600)
    clicar(page, page.locator('[role="dialog"]').get_by_role('button', name='Escalonar')); esperar(page, 2000)
    clicar(page, page.get_by_role('button', name='Trocar')); esperar(page, 1600)
    page.keyboard.press('Escape'); esperar(page, 400)
    # os filtros ficam atrás do botão (o alto do quadro é uma linha só)
    clicar(page, page.locator('#quadro-botao-filtros')); esperar(page, 1500)
    clicar(page, page.locator('#quadro-botao-filtros')); esperar(page, 500)

    # 4. a ficha do chamado: clicar no cartão abre a janela grande, por cima do quadro
    clicar(page, page.locator(f'li[data-codigo="{COD["ficha"]}"] a.line-clamp-2').first); esperar(page, 1600)
    legenda(page, next(n), 'A ficha do chamado', 'Abre numa janela grande, por cima do quadro: o relato, a solução, a empresa e a classificação. Fechou, voltou.', 1800)
    rolar(page, 380); esperar(page, 1800)
    rolar(page, 420); esperar(page, 1600)

    # 5. a trajetória (o pedido do Miguel)
    linha = page.locator('section:has(h2:has-text("Linha do tempo"))').first
    linha.scroll_into_view_if_needed(); esperar(page, 500)
    legenda(page, next(n), 'A trajetória', 'Por onde o chamado passou, quanto tempo ficou em cada nível e o motivo de cada escalonamento.', 600)
    clicar(page, linha.get_by_role('tab', name='Trajetória')); esperar(page, 2600)

    # 6. o problema junta os incidentes; a ficha desenha as ligações (o link troca o chamado da janela)
    clicar(page, page.locator(f'[role="dialog"] a[href$="/{COD["problema"]}"]').first); esperar(page, 1500)
    legenda(page, next(n), 'Problema, pai e filhos', 'O problema junta os incidentes de clientes diferentes. O pai não fecha com filho aberto.', 900)
    ligacoes = page.locator('section:has(h2:has-text("Filhos e ligações")), section:has(h2:has-text("Incidentes"))').first
    ligacoes.scroll_into_view_if_needed(); esperar(page, 600)
    apontar(page, ligacoes.locator('svg').first, 2800)
    # fechar a janela volta para o quadro
    page.keyboard.press('Escape'); esperar(page, 1200)

    # 7. esperar o cliente: o prazo para
    ir(page, f'/atendimento/{COD["esperar"]}', 1500)
    legenda(page, next(n), 'Prazos que param', 'Em horas úteis, com os feriados. Esperando o cliente, o prazo para; esperando a operadora, corre.', 900)
    clicar(page, page.get_by_role('button', name='Esperar', exact=True)); esperar(page, 700)
    clicar(page, page.get_by_role('menuitem', name='Esperar o cliente')); esperar(page, 700)
    page.keyboard.type('O cliente vai liberar o IP novo no firewall e avisar', delay=40); esperar(page, 500)
    clicar(page, page.locator('[role="dialog"]').get_by_role('button', name='Marcar a espera')); esperar(page, 1500)
    prazos = page.locator('section:has(h2:has-text("Prazos"))').first
    prazos.scroll_into_view_if_needed(); esperar(page, 500)
    apontar(page, prazos, 2400)

    # 7b. avisar o cliente: pelo modelo aprovado do WhatsApp oficial, e a ficha mostra antes como chega (nada sai na prévia)
    ir(page, f'/atendimento/{COD["ficha"]}', 1500)
    legenda(page, next(n), 'A mensagem ao cliente', 'Sai pelo modelo aprovado do WhatsApp oficial. Antes de mandar, a ficha mostra como chega.', 600)
    clicar(page, page.get_by_role('button', name='Avisar o cliente').first); esperar(page, 800)
    page.keyboard.type('Trocamos a rota de saída. Pode testar uma ligação e nos dizer se completou?', delay=35); esperar(page, 600)
    apontar(page, page.locator('#ficha-como-chega'), 2600)
    page.keyboard.press('Escape'); esperar(page, 600)

    # 8. abrir chamado: os contatos do cliente (um clique preenche) e o cliente que volta com o mesmo problema reabre o de antes
    ir(page, '/atendimento/novo', 1400)
    legenda(page, next(n), 'Abrir, ou reabrir o de antes', 'Ao escolher o cliente, aparecem os contatos dele e os chamados recentes: é o mesmo problema? Reabra.', 800)
    clicar(page, page.locator('button#novo-cliente')); esperar(page, 500)
    page.keyboard.type('Supermercado', delay=60); esperar(page, 500)
    page.keyboard.press('Enter'); esperar(page, 1400)
    clicar(page, page.locator('#novo-contatos [role="radio"]', has_text='Fernanda Rocha')); esperar(page, 1400)
    recentes = page.locator('#novo-recentes')
    recentes.scroll_into_view_if_needed(); esperar(page, 400)
    apontar(page, recentes.get_by_role('button', name='Reabrir este em vez de abrir outro').first, 2600)

    # 8a. as etiquetas com cor: ao criar, escolhe a cor (trocar depois: Ajustes › Etiquetas)
    etiquetas = page.locator('#novo-etiquetas')
    etiquetas.scroll_into_view_if_needed(); esperar(page, 400)
    legenda(page, next(n), 'Etiquetas com cor', 'Ao criar a etiqueta, escolha a cor. Para trocar depois: Ajustes › Etiquetas.', 600)
    digitar(page, etiquetas, 'cliente vip'); esperar(page, 500)
    clicar(page, page.locator('#novo-etiquetas-cor [data-cor="bad"]')); esperar(page, 800)
    clicar(page, page.locator('#novo-etiquetas-criar')); esperar(page, 2000)

    # 8b. os contatos do cliente: a aba nova na ficha do cliente (o Abrir chamado puxa de lá)
    clicar(page, page.locator('nav a:has-text("Clientes")').first); esperar(page, 1200)
    clicar(page, page.locator('a[href*="/clientes/"]:has-text("Supermercado Bom Preço")').first); esperar(page, 1400)
    clicar(page, page.get_by_role('tab', name='Contatos')); esperar(page, 800)
    legenda(page, next(n), 'Os contatos do cliente', 'A aba nova na ficha do cliente: o nome, o WhatsApp, o e-mail e o cargo. O Abrir chamado puxa daqui.', 1800)
    clicar(page, page.locator('#contatos-novo')); esperar(page, 2000)
    page.keyboard.press('Escape'); esperar(page, 600)

    # 9. Preencher com IA
    ir(page, f'/atendimento/{COD["ia"]}', 1400)
    legenda(page, next(n), 'Preencher com IA', 'A IA lê a conversa do cliente no LineChat e sugere os campos. Nada entra sozinho.', 800)
    clicar(page, page.get_by_role('button', name='Preencher com IA')); esperar(page, 2600)
    janela = page.locator('[role="dialog"] > div.relative').first
    apontar(page, janela.locator('text=Sugerido').first, 1400)
    rolar(page, 300); esperar(page, 1200)
    clicar(page, janela.get_by_role('button', name='Aplicar os marcados')); esperar(page, 2000)

    # 10. os Ajustes do módulo: a janela do painel, com as etapas dentro (ao criar e ao editar)
    ir(page, '/atendimento/ajustes?aba=paineis', 1500)
    legenda(page, next(n), 'Os Ajustes do módulo', 'Tudo de um painel numa janela só: quem vê, as etapas e as regras. Ao criar e ao editar.', 900)
    clicar(page, page.locator('section[data-painel="SUP"]').get_by_role('button', name='Editar o painel Suporte')); esperar(page, 1500)
    clicar(page, page.locator('#painel-partes button', has_text='As etapas')); esperar(page, 2200)
    clicar(page, page.get_by_role('button', name='Editar N2')); esperar(page, 2200)
    page.keyboard.press('Escape'); esperar(page, 600)
    # a pergunta de fechar sem salvar só aparece com mudança (aqui não houve)
    if page.locator('[role="dialog"]').count():
        page.keyboard.press('Escape'); esperar(page, 400)

    # 11. os campos de cada painel: os do sistema ligam e desligam; os do painel, a equipe cria
    clicar(page, page.get_by_role('tab', name='Campos')); esperar(page, 1000)
    clicar(page, page.locator('#campos-painel button', has_text='Desenvolvimento')); esperar(page, 1200)
    legenda(page, next(n), 'Os campos de cada painel', 'Cada painel liga os campos do sistema que usa e cria os dele: texto, data, lista… obrigatórios para abrir ou numa etapa.', 900)
    apontar(page, page.locator('li[data-campo-sistema="assunto"] [role="switch"]'), 1800)
    apontar(page, page.locator('#campos-lista li').first, 1800)
    clicar(page, page.locator('#campos-novo')); esperar(page, 1200)
    apontar(page, page.locator('#campo-tipo'), 1600)
    apontar(page, page.locator('#campo-etapas'), 2000)
    page.keyboard.press('Escape'); esperar(page, 600)
    # a pergunta de fechar sem salvar só aparece com mudança (aqui não houve)
    if page.locator('#campo-nome').count():
        page.keyboard.press('Escape'); esperar(page, 600)
    legenda(page, next(n), 'E o resto dos Ajustes', 'Os prazos, os avisos e o WhatsApp, as respostas prontas, os agendados e a IA.', 600)
    clicar(page, page.get_by_role('tab', name='Avisos e WhatsApp')); esperar(page, 1600)
    # o modelo aprovado: o Buscar traz os aprovados do número oficial; cada variável recebe um valor do chamado
    modelo = page.locator('#avisos-modelo')
    modelo.scroll_into_view_if_needed(); esperar(page, 500)
    legenda(page, next(n), 'O modelo aprovado', 'Buscar traz os modelos aprovados do número oficial no LineChat; cada variável recebe um valor do chamado.', 600)
    # a lista e as variáveis ocupam a tela até embaixo: a legenda sobe
    legenda_no_alto(page)
    clicar(page, page.locator('#avisos-buscar-modelos')); esperar(page, 2400)
    rolar(page, 260); esperar(page, 600)
    apontar(page, page.locator('#avisos-variaveis'), 2400)


# ---------- o roteiro do Patch 1.9 (o exemplo de antes) ----------

def roteiro_1_9(page):
    webm = video_do_portal_em_webm()

    # 1. Inventário › Relatórios
    legenda(page, 1, 'Inventário › Relatórios', 'A aba nova: quem tem o quê, o estoque, quanto vale o parque, o vai e volta e o cadastro.', 2400)
    rolar(page, 260); esperar(page, 1200)
    clicar(page, page.locator('button[title="Ver os aparelhos"]').first); esperar(page, 2400)
    page.keyboard.press('Escape'); esperar(page, 600)
    topo(page)
    clicar(page, page.get_by_role('tab', name='Estoque e valor')); esperar(page, 2200)
    rolar(page, 420); esperar(page, 1600)
    topo(page)
    clicar(page, page.get_by_role('tab', name='Histórico e cadastro')); esperar(page, 2400)

    # 2. o recibo de entrega
    ir(page, '/inventario?aba=movimentacoes', 1500)
    legenda(page, 2, 'Recibo de entrega', 'Na movimentação para o cliente: PDF ou foto, na hora ou depois. A foto abre na tela.', 1500)
    cliente = page.locator('a:has-text("Hospital Vale Verde")').first.get_attribute('href').split('#')[-1].split('?')[0]
    clicar(page, page.locator('tbody tr:has-text("Unidade Simões Filho")').first.locator('td').nth(2)); esperar(page, 1600)
    clicar(page, page.locator('tbody tr.bg-surface-2 button:has-text("recibo-dp722")').first); esperar(page, 2600)
    page.keyboard.press('Escape'); esperar(page, 700)

    # 3. o DID sem titular
    ir(page, '/circuitos', 1200)
    legenda(page, 3, 'O DID sem titular', 'O titular fica só no circuito: a tabela de DIDs ficou mais limpa.', 1000)
    clicar(page, page.locator('main tbody tr').first); esperar(page, 1600)
    rolar(page, 320); esperar(page, 2200)

    # 4. os chamados do cliente: esta semana e este mês
    ir(page, f'{cliente}?aba=chamados', 1800)
    legenda(page, 4, 'Chamados do cliente', 'Os períodos ganharam Esta semana e Este mês.', 900)
    bloco = page.locator('div.card:has(h2:text-is("Chamados do LineChat"))').first
    clicar(page, bloco.locator('button:text-is("Esta semana")')); esperar(page, 1800)
    clicar(page, bloco.locator('button:text-is("Este mês")')); esperar(page, 1800)

    # 5. a lista de clientes do projeto ordena pela coluna
    ir(page, '/projetos', 1100)
    links = list(dict.fromkeys(a.get_attribute('href').split('#')[-1] for a in page.locator('a[href*="/projetos/"]').all() if a.get_attribute('href')))
    tabela = None
    for destino in links:
        ir(page, destino, 1300)
        tabela = page.locator('section.card:has(h2:has-text("Clientes")) table').first
        if tabela.count():
            break
    legenda(page, 5, 'Clientes do projeto', 'Clicar no título da coluna ordena; clicar de novo inverte.', 900)
    clicar(page, tabela.get_by_role('button', name='Cliente', exact=True)); esperar(page, 1500)
    clicar(page, tabela.get_by_role('button', name='Cliente', exact=True)); esperar(page, 1700)

    # 6. o portal: a equipe entra com o login do Gestor
    ir(page, '/portal/entrar', 1300)
    legenda(page, 6, 'Portal: a equipe entra com o login do Gestor', 'O mesmo e-mail e a mesma senha do Gestor, sem criar nada. A equipe vê todos os tutoriais.', 900)
    digitar(page, page.locator('#portal-login'), 'admin@gestor.local')
    digitar(page, page.locator('#portal-senha'), 'demo')
    clicar(page, page.get_by_role('button', name='Entrar', exact=True)); esperar(page, 1800)
    apontar(page, page.locator('text=Você entrou com o login da equipe').first, 2600)

    # 7. o suporte cria o login e a senha
    ir(page, '/portal-do-cliente?aba=acessos', 1300)
    legenda(page, 7, 'Portal: o suporte cria o login e a senha', 'O login pode ser o e-mail ou um nome. A senha fica guardada: dá para ver e trocar.', 900)
    clicar(page, page.get_by_role('link', name='Clínica Aurora').first); esperar(page, 1500)
    clicar(page, page.get_by_role('button', name='Dar acesso').first); esperar(page, 700)
    digitar(page, page.locator('#acesso-nome'), 'João Pereira'); esperar(page, 1200)
    apontar(page, page.locator('#acesso-login'), 900)
    clicar(page, page.get_by_role('button', name='Gerar')); esperar(page, 1000)
    clicar(page, page.locator('[role="dialog"]').get_by_role('button', name='Dar acesso')); esperar(page, 3200)
    clicar(page, page.get_by_role('button', name='Fechar').last); esperar(page, 800)
    clicar(page, page.locator('tr', has_text='João Pereira').locator('button[title^="Ver a senha"]')); esperar(page, 2600)

    # 8. o vídeo principal no topo do tutorial (o vídeo do tutorial, na gravação, em WebM)
    ir(page, '/portal/a/2', 1600)
    legenda(page, 8, 'Portal: o vídeo principal', 'Fica no topo do tutorial, logo acima do passo a passo.', 600)
    page.evaluate("""(src) => { const v = document.querySelector('main video'); v.muted = true; v.src = src; v.play().catch(() => {}); }""", webm)
    apontar(page, page.locator('main video').first, 4800)

    # 9. o "não ajudou" mostra o WhatsApp do suporte
    page.evaluate("document.querySelector('main video')?.pause()")
    legenda(page, 9, 'Portal: o “não ajudou”', 'Mostra o WhatsApp do suporte e abre a conversa já com o nome do tutorial.', 600)
    clicar(page, page.get_by_role('button', name='Não', exact=True)); esperar(page, 900)
    apontar(page, page.get_by_role('link', name='Falar no WhatsApp'), 2800)


# ---------- gravar e converter ----------

def gravar(pasta):
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-proxy-server', '--lang=pt-BR', '--autoplay-policy=no-user-gesture-required'], env={'LANG': 'pt_BR.UTF-8'})
        ctx = b.new_context(viewport={'width': 1280, 'height': 720}, locale='pt-BR', timezone_id='America/Sao_Paulo',
                            record_video_dir=pasta, record_video_size={'width': 1280, 'height': 720})
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        erros = []
        page.on('pageerror', lambda e: erros.append(str(e)))
        t0 = time.monotonic()
        page.goto(URL)
        esperar(page, 1200)
        entrar_atras_da_capa(page)
        antes_do_roteiro(page)
        # o aviso "Novidades marcadas como lidas" dura 4 s: a capa só sai depois dele
        ir(page, PRIMEIRA_TELA, 4600)
        page.mouse.move(700, 380)
        capa_sai = time.monotonic() - t0
        page.evaluate('window.__semCapa()')
        esperar(page, 800)

        roteiro(page)

        page.evaluate('window.__semLegenda()')
        page.evaluate('([t, s]) => window.__capa(t, s)', list(FIM))
        esperar(page, 3800)
        caminho = page.video.path()
        ctx.close()
        b.close()
    if erros:
        print('erros na página:', erros)
    return caminho, capa_sai


if __name__ == '__main__':
    pasta = tempfile.mkdtemp(prefix='video-do-patch-')
    try:
        gravado, capa_sai = gravar(pasta)
        os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
        # corta o começo (entrar e a janela do login, atrás da capa), deixando ~3 s de capa
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{max(0, capa_sai - CAPA_NO_COMECO):.2f}', '-i', gravado,
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', SAIDA],
                       check=True)
        duracao = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', SAIDA],
                                 check=True, capture_output=True, text=True).stdout.strip()
        print(f'{SAIDA}: {float(duracao):.0f} s, {os.path.getsize(SAIDA) / 1024 / 1024:.1f} MB')
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
