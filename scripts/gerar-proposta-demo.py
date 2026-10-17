"""
Gera a proposta comercial de exemplo da PRÉVIA (Patch 2.0.1, o leitor de PDF dos anexos) e escreve
apps/web/src/api/proposta-demo-midia.ts. Só para a prévia: no sistema de verdade o Comercial anexa a
proposta que mandou ao cliente (colando o arquivo com Ctrl+V, arrastando ou pelo clipe).

  - o PDF da proposta revisada da Padaria Estrela (a negociação "PABX em nuvem — 40 ramais" do
    Comercial), em duas páginas: o resumo com o valor de cada produto e o total, e as condições.

Os valores batem com os da prévia (demo-atendimento-exemplos.ts): LinePBX R$ 9.800,00 e VoiceNet
R$ 2.700,00, total R$ 12.500,00, com 10% de desconto na implantação (a anotação da Camila).

  python3 scripts/gerar-proposta-demo.py      (precisa do Playwright)
"""
import base64, datetime, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
hoje = datetime.date.today()
dia = lambda n: (hoje - datetime.timedelta(days=n)).strftime('%d/%m/%Y')

ESTILO = """<style>
  @page{size:A4;margin:0}
  body{font-family:'Liberation Sans','DejaVu Sans',sans-serif;color:#111827;margin:0;font-size:13.5px}
  .folha{padding:46px 54px;height:1035px;box-sizing:border-box;position:relative;page-break-after:always}
  .folha:last-child{page-break-after:auto}
  .topo{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4b3df0;padding-bottom:12px}
  .marca{font-weight:bold;font-size:22px;letter-spacing:1px;color:#4b3df0} .marca small{display:block;font-size:11px;color:#64748b;letter-spacing:0;font-weight:normal}
  .num{text-align:right;font-size:12px;color:#475569} .num b{display:block;font-size:15px;color:#111827}
  h1{font-size:20px;margin:24px 0 4px} .sub{color:#475569;margin:0 0 18px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.6px;color:#4b3df0;margin:22px 0 8px}
  table.d{width:100%;border-collapse:collapse} table.d td{padding:3px 0;vertical-align:top} table.d td:first-child{width:130px;color:#475569}
  table.i{width:100%;border-collapse:collapse;margin:6px 0 4px} table.i th,table.i td{border-bottom:1px solid #cbd5e1;padding:8px 6px;text-align:left}
  table.i th{font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:2px solid #94a3b8}
  table.i td.v,table.i th.v{text-align:right;white-space:nowrap} table.i tr.total td{border-bottom:none;font-weight:bold;font-size:15px;padding-top:12px}
  ul{margin:4px 0 0 18px;padding:0} li{margin:5px 0;line-height:1.45}
  p{line-height:1.5;margin:6px 0}
  .nota{background:#eef2ff;border-radius:6px;padding:10px 12px;margin-top:14px}
  .rod{position:absolute;left:54px;right:54px;bottom:34px;font-size:10.5px;color:#94a3b8;display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:8px}
  .ass{margin-top:60px;display:flex;gap:40px} .ass div{flex:1;font-size:12px;color:#475569} .linha{border-top:1px solid #111827;padding-top:6px}
</style>"""


def proposta():
    validade = (hoje + datetime.timedelta(days=14)).strftime('%d/%m/%Y')
    topo = """<div class="topo"><div class="marca">INGLINE SYSTEMS<small>Telefonia IP · PABX em nuvem · atendimento</small></div>
      <div class="num">Proposta comercial<b>Nº 2026-0417 · revisão 2</b></div></div>"""
    rod = lambda n: f'<div class="rod"><span>Ingline Systems · proposta para a Padaria Estrela</span><span>Página {n} de 2</span></div>'
    return f"""<html><head><meta charset="utf-8">{ESTILO}</head><body>
    <div class="folha">{topo}
      <h1>PABX em nuvem — 40 ramais</h1>
      <p class="sub">Três lojas e a fábrica com o mesmo número, a fila do delivery e as ligações entre as unidades sem custo.</p>
      <table class="d"><tr><td>Cliente</td><td><b>Padaria Estrela</b></td></tr><tr><td>Contato</td><td>Rosa · (71) 99999-0214</td></tr>
      <tr><td>Data</td><td>{dia(1)}</td></tr><tr><td>Válida até</td><td>{validade}</td></tr><tr><td>Responsável</td><td>Camila Duarte (Comercial)</td></tr></table>
      <h2>O valor por produto</h2>
      <table class="i"><tr><th>Produto</th><th>O que entra</th><th class="v">Valor</th></tr>
        <tr><td><b>LinePBX</b></td><td>40 ramais em nuvem, URA, fila do delivery, gravação e o painel da recepção</td><td class="v">R$ 9.800,00</td></tr>
        <tr><td><b>VoiceNet</b></td><td>Tronco SIP com 10 canais e o número único para as quatro unidades</td><td class="v">R$ 2.700,00</td></tr>
        <tr class="total"><td colspan="2">Total</td><td class="v">R$ 12.500,00</td></tr></table>
      <div class="nota">Revisão 2: <b>10% de desconto na implantação</b>, como combinado com a Rosa. O total já está com o desconto.</div>
      <h2>Como fica</h2>
      <ul><li>As quatro unidades atendem pelo mesmo número; a URA leva o cliente para a loja certa ou para o delivery.</li>
      <li>A fila do delivery avisa a posição de quem espera e grava as ligações.</li>
      <li>As ligações entre as lojas e a fábrica são ramais: não pagam nada.</li></ul>
      {rod(1)}
    </div>
    <div class="folha">{topo}
      <h2>Condições</h2>
      <ul><li><b>Implantação</b> em até 10 dias úteis depois do aceite, com a configuração dos ramais e a URA gravada.</li>
      <li><b>Aparelhos</b>: os da Padaria continuam; os que faltarem podem vir em comodato (proposta à parte).</li>
      <li><b>Suporte</b> pelo WhatsApp e pelo telefone, de segunda a sábado, das 8h às 20h.</li>
      <li><b>Pagamento</b>: a implantação em até 3 vezes; a mensalidade no boleto, todo dia 10.</li>
      <li><b>Validade</b>: esta proposta vale até {validade}.</li></ul>
      <h2>Próximos passos</h2>
      <p>Com o aceite, o Comercial passa a negociação para o Suporte, que agenda a implantação com a Rosa.</p>
      <div class="ass"><div><div class="linha">Ingline Systems — Camila Duarte</div></div><div><div class="linha">Padaria Estrela — aceite</div></div></div>
      {rod(2)}
    </div></body></html>"""


def pdf(html):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-proxy-server'])
        pg = b.new_page()
        pg.set_content(html)
        dados = pg.pdf(format='A4', print_background=True, prefer_css_page_size=True)
        b.close()
    return dados


if __name__ == '__main__':
    arquivo = pdf(proposta())
    destino = os.path.join(RAIZ, 'apps/web/src/api/proposta-demo-midia.ts')
    with open(destino, 'w') as o:
        o.write('/**\n * A proposta comercial de exemplo da PRÉVIA (Patch 2.0.1, o leitor de PDF dos anexos): a proposta revisada\n'
                ' * da Padaria Estrela, anexada na negociação do Comercial. Gerado por scripts/gerar-proposta-demo.py — não edite à mão.\n */\n')
        o.write(f"export const PROPOSTA_PDF_DEMO = 'data:application/pdf;base64,{base64.b64encode(arquivo).decode()}';\n")
    print('pdf', len(arquivo), 'bytes ->', destino)
