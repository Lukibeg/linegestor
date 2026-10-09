"""
Gera os recibos de entrega de exemplo da PRÉVIA (Patch 1.9, decisão 0042) e escreve
apps/web/src/api/recibo-demo-midia.ts. Só para a prévia: no sistema de verdade a equipe anexa o
recibo assinado de cada entrega.

  - a FOTO do recibo do DP722 que foi para a Unidade Simões Filho do Hospital (como sai do celular:
    o papel meio torto em cima da mesa) — abre na tela;
  - o PDF do recibo da locação dos 8 GXP1610 da Distribuidora Norte — baixa.

Os dados batem com os da prévia (demo.ts): o N/S DP722SN0041, os MACs 00:0B:82:10:00:14 a :1B e as
datas (há 25 e há 20 dias, contadas do dia em que o script roda).

  python3 scripts/gerar-recibo-demo.py      (precisa de Pillow e Playwright)
"""
import base64, datetime, io, os, random, tempfile
from PIL import Image, ImageDraw, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
hoje = datetime.date.today()
dia = lambda n: (hoje - datetime.timedelta(days=n)).strftime('%d/%m/%Y')

ESTILO = """<style>
  body{font-family:'DejaVu Sans',sans-serif;color:#111827;margin:0;padding:44px 52px;background:#fff;font-size:14px}
  .topo{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4b3df0;padding-bottom:12px}
  .marca{font-weight:bold;font-size:22px;letter-spacing:1px;color:#4b3df0} .marca small{display:block;font-size:11px;color:#64748b;letter-spacing:0;font-weight:normal}
  .num{text-align:right;font-size:12px;color:#475569} .num b{display:block;font-size:15px;color:#111827}
  h1{font-size:19px;margin:22px 0 14px;text-transform:uppercase;letter-spacing:.5px}
  table.d{width:100%;border-collapse:collapse;margin-bottom:16px} table.d td{padding:4px 0;vertical-align:top} table.d td:first-child{width:120px;color:#475569}
  table.i{width:100%;border-collapse:collapse;margin:8px 0 18px} table.i th,table.i td{border:1px solid #94a3b8;padding:6px 8px;text-align:left;font-size:13px}
  table.i th{background:#eef2ff} .mono{font-family:'DejaVu Sans Mono',monospace}
  p.decl{line-height:1.5;text-align:justify}
  .ass{display:flex;justify-content:space-between;margin-top:46px;gap:40px} .ass div{flex:1;text-align:center;font-size:12px;color:#475569}
  .linha{border-top:1px solid #111827;padding-top:6px;margin-top:4px} .tinta{color:#1e3a8a;font-family:'DejaVu Serif',serif;font-style:italic;font-size:17px;height:24px}
  svg{display:block;margin:0 auto -6px}
  .rod{margin-top:34px;font-size:11px;color:#94a3b8;text-align:center}
</style>"""

ASSINATURA = """<svg width="190" height="46" viewBox="0 0 190 46"><path d="M6 34 C 18 6, 28 6, 26 30 S 40 40, 48 18 S 58 8, 60 30 C 62 40, 74 14, 82 22 S 92 38, 104 20 C 112 8, 118 30, 128 26 S 150 10, 160 22 C 166 30, 176 26, 186 14" fill="none" stroke="#1e3a8a" stroke-width="2.2" stroke-linecap="round"/></svg>"""
ASSINATURA_2 = """<svg width="170" height="46" viewBox="0 0 170 46"><path d="M8 30 C 20 4, 34 44, 46 20 C 52 8, 60 36, 70 24 S 84 6, 92 28 C 98 40, 112 12, 122 22 S 140 34, 162 16" fill="none" stroke="#1e3a8a" stroke-width="2" stroke-linecap="round"/><path d="M20 38 L 150 34" stroke="#1e3a8a" stroke-width="1.4" fill="none"/></svg>"""


def recibo(numero, cliente, unidade, endereco, modalidade, linhas, data, recebedor):
    itens = ''.join(f'<tr><td>{q}</td><td>{m}</td><td class="mono">{i}</td></tr>' for q, m, i in linhas)
    return f"""<html><head><meta charset="utf-8">{ESTILO}</head><body>
      <div class="topo"><div class="marca">INGLINE SYSTEMS<small>Telefonia IP · suporte e equipamentos</small></div>
      <div class="num">Recibo de entrega<b>Nº {numero}</b></div></div>
      <h1>Recibo de entrega de equipamentos</h1>
      <table class="d"><tr><td>Cliente</td><td><b>{cliente}</b></td></tr><tr><td>Unidade</td><td>{unidade}</td></tr>
      <tr><td>Endereço</td><td>{endereco}</td></tr><tr><td>Modalidade</td><td>{modalidade}</td></tr><tr><td>Data</td><td>{data}</td></tr></table>
      <table class="i"><tr><th style="width:50px">Qtd</th><th>Equipamento</th><th>Identificação</th></tr>{itens}</table>
      <p class="decl">Declaro que recebi os equipamentos acima, em perfeito estado de funcionamento, cedidos pela Ingline
      Systems na modalidade indicada, e que eles continuam sendo da Ingline: em caso de cancelamento, voltam para ela.</p>
      <div class="ass"><div>{ASSINATURA_2}<div class="linha">Ingline Systems — entregou</div></div>
      <div><div class="tinta">{recebedor}</div>{ASSINATURA}<div class="linha">Cliente — recebeu (nome e assinatura)</div></div></div>
      <div class="rod">Ingline Systems · uma via fica com o cliente, outra volta assinada para a Ingline</div></body></html>"""


def foto(html):
    """O papel fotografado: o recibo, meio torto, em cima da mesa, com sombra e um pouco de grão."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-proxy-server'])
        pg = b.new_page(viewport={'width': 794, 'height': 1050}, device_scale_factor=1.25)
        pg.set_content(html)
        png = pg.screenshot(full_page=True)
        b.close()
    papel = Image.open(io.BytesIO(png)).convert('RGB')
    # o papel não é branco de tela: fica levemente amarelado e com a luz caindo de um lado
    luz = Image.linear_gradient('L').rotate(-90).resize(papel.size)
    papel = Image.composite(papel, Image.new('RGB', papel.size, (232, 228, 214)), luz.point(lambda v: 210 + v // 6))
    W, H = int(papel.width * 1.16), int(papel.height * 1.1)
    mesa = Image.new('RGB', (W, H), (92, 84, 74))
    random.seed(7)
    d = ImageDraw.Draw(mesa)
    for _ in range(900):  # os veios da mesa
        x, y = random.randrange(W), random.randrange(H)
        d.line([(x, y), (x + random.randrange(60, 220), y + random.randrange(-3, 4))], fill=(random.randrange(80, 104), random.randrange(72, 94), random.randrange(62, 82)), width=1)
    mesa = mesa.filter(ImageFilter.GaussianBlur(1.2))
    girado = papel.rotate(-2.4, resample=Image.BICUBIC, expand=True, fillcolor=(0, 0, 0))
    mascara = Image.new('L', papel.size, 255).rotate(-2.4, resample=Image.BICUBIC, expand=True, fillcolor=0)
    sombra = Image.new('RGB', girado.size, (30, 26, 22))
    x, y = (W - girado.width) // 2, (H - girado.height) // 2
    mesa.paste(sombra, (x + 14, y + 18), mascara.filter(ImageFilter.GaussianBlur(10)))
    mesa.paste(girado, (x, y), mascara)
    ruido = Image.effect_noise(mesa.size, 10).convert('RGB')
    mesa = Image.blend(mesa, ruido, 0.035)
    mesa = mesa.resize((980, round(mesa.height * 980 / mesa.width)), Image.LANCZOS)
    saida = io.BytesIO()
    mesa.save(saida, 'JPEG', quality=68, optimize=True, progressive=True)
    return saida.getvalue()


def pdf(html):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-proxy-server'])
        pg = b.new_page()
        pg.set_content(html)
        dados = pg.pdf(format='A4', print_background=True)
        b.close()
    return dados


if __name__ == '__main__':
    dp722 = recibo('0142', 'Hospital Vale Verde', 'Unidade Simões Filho', 'Av. Eixo Urbano Central, 1200 — Simões Filho/BA',
                   'Comodato', [(1, 'Grandstream DP722 (telefone sem fio)', 'N/S DP722SN0041')], dia(25), 'Marcos A. Ribeiro')
    # os MACs da Distribuidora na prévia: n = 20 a 27 na conta de demo.ts (0x100000 + n)
    macs = [f'00:0B:82:10:00:{20 + i:02X}' for i in range(8)]
    distribuidora = recibo('0145', 'Distribuidora Norte', 'Matriz (e CD Feira de Santana)', 'Rua do Comércio, 310 — Salvador/BA',
                           'Locação', [(1, 'Grandstream GXP1610', m) for m in macs], dia(20), 'Juliana Prado')
    jpg, arquivo = foto(dp722), pdf(distribuidora)
    b64 = lambda b: base64.b64encode(b).decode()
    destino = os.path.join(RAIZ, 'apps/web/src/api/recibo-demo-midia.ts')
    with open(destino, 'w') as o:
        o.write('/**\n * Os recibos de entrega de exemplo da PRÉVIA (Patch 1.9, decisão 0042): a foto do recibo do DP722\n'
                ' * do Hospital e o PDF do recibo da Distribuidora. Gerado por scripts/gerar-recibo-demo.py — não edite à mão.\n */\n')
        o.write(f"export const RECIBO_FOTO_DEMO = 'data:image/jpeg;base64,{b64(jpg)}';\n")
        o.write(f"export const RECIBO_PDF_DEMO = 'data:application/pdf;base64,{b64(arquivo)}';\n")
    print('foto', len(jpg), 'bytes; pdf', len(arquivo), 'bytes ->', destino)
