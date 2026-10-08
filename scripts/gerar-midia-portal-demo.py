"""
Gera o vídeo e o PDF de exemplo do portal do cliente na PRÉVIA (Patch 1.8) e escreve
apps/web/src/api/portal-demo-midia.ts. Só para a prévia: no sistema de verdade a equipe sobe
os próprios vídeos e arquivos.

  python3 scripts/gerar-midia-portal-demo.py      (precisa de Pillow, ffmpeg e Playwright)
"""
import base64, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
NEGRITO = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
W, H, FPS = 640, 360, 10
AZUL, TINTA, CINZA, VERDE = (29, 78, 216), (17, 24, 39), (100, 116, 139), (22, 163, 74)

def f(t, n=False): return ImageFont.truetype(NEGRITO if n else FONTE, t)

def quadro(t):
    im = Image.new('RGB', (W, H), (241, 245, 249)); d = ImageDraw.Draw(im)
    if t < 2.0:  # a capa
        d.rectangle([0, 0, W, H], fill=AZUL)
        d.text((40, 120), 'Como transferir', font=f(38, True), fill='white')
        d.text((40, 166), 'uma ligação', font=f(38, True), fill='white')
        d.text((40, 236), 'Central de ajuda Ingline · passo a passo em 10 segundos', font=f(15), fill=(191, 219, 254))
        return im
    # o telefone
    d.rounded_rectangle([30, 40, 330, 320], 22, fill=(226, 232, 240), outline=(148, 163, 184), width=2)
    d.rounded_rectangle([50, 60, 310, 170], 10, fill=(31, 41, 55))
    teclas = ['Espera', 'TRANSF', 'Conf', 'Encerrar']
    for i, k in enumerate(teclas):
        x = 50 + i * 66
        d.rounded_rectangle([x, 182, x + 58, 206], 6, fill=(203, 213, 225))
        d.text((x + 29, 194), k, font=f(11, k == 'TRANSF'), fill=TINTA, anchor='mm')
    for i, k in enumerate('123456789*0#'):
        cx, cy = 92 + (i % 3) * 88, 228 + (i // 3) * 22
        d.rounded_rectangle([cx - 30, cy - 9, cx + 30, cy + 9], 5, fill=(248, 250, 252))
        d.text((cx, cy), k, font=f(12), fill=TINTA, anchor='mm')
    passo, legenda, tela = 0, '', []
    pulso = 2 + 4 * abs(((t * 2) % 2) - 1)
    if t < 5.0:
        passo, legenda = 1, 'Aperte TRANSF'
        tela = [('Em ligação', f(14, True), 'white'), ('(71) 3020-0000', f(16), (226, 232, 240)), (f'00:{int(40 + t):02d}', f(13), (148, 163, 184))]
        d.rounded_rectangle([116 - pulso, 182 - pulso, 174 + pulso, 206 + pulso], 9, outline=(245, 158, 11), width=3)
    elif t < 8.0:
        passo, legenda = 2, 'Digite o ramal (ex.: 204)'
        digitos = '204'[: min(3, int((t - 5.0) / 0.8) + 1)]
        tela = [('Transferir para:', f(14, True), 'white'), (digitos + ('_' if len(digitos) < 3 else ''), f(26, True), (253, 230, 138))]
        ultimo = digitos[-1]
        i = '123456789*0#'.index(ultimo)
        cx, cy = 92 + (i % 3) * 88, 228 + (i // 3) * 22
        d.rounded_rectangle([cx - 32, cy - 11, cx + 32, cy + 11], 6, outline=(245, 158, 11), width=3)
    elif t < 10.0:
        passo, legenda = 3, 'Aperte TRANSF de novo'
        tela = [('Transferir para:', f(14, True), 'white'), ('204', f(26, True), (253, 230, 138))]
        d.rounded_rectangle([116 - pulso, 182 - pulso, 174 + pulso, 206 + pulso], 9, outline=(245, 158, 11), width=3)
    else:
        passo, legenda = 4, 'Pronto! A ligação está no 204'
        tela = [('Transferida', f(18, True), (134, 239, 172)), ('para o ramal 204', f(14), (226, 232, 240))]
    y = 76
    for txt, fonte, cor in tela:
        d.text((180, y + 10), txt, font=fonte, fill=cor, anchor='mm'); y += 34
    # a legenda e os passos
    d.text((360, 70), 'Passo a passo', font=f(13), fill=CINZA)
    for i in range(1, 4):
        cor = AZUL if i == passo else (VERDE if i < passo else (203, 213, 225))
        d.ellipse([360 + (i - 1) * 34, 96, 384 + (i - 1) * 34, 120], fill=cor)
        d.text((372 + (i - 1) * 34, 108), '✓' if i < passo else str(i), font=f(13, True), fill='white', anchor='mm')
    linhas, atual = [], ''
    for palavra in legenda.split():
        if len(atual + ' ' + palavra) > 18: linhas.append(atual); atual = palavra
        else: atual = (atual + ' ' + palavra).strip()
    linhas.append(atual)
    for k, l in enumerate(linhas):
        d.text((360, 140 + k * 34), l, font=f(25, True), fill=VERDE if passo == 4 else TINTA)
    d.text((360, 318), 'Ingline · Central de ajuda', font=f(12), fill=CINZA)
    return im

def video(destino):
    with tempfile.TemporaryDirectory() as pasta:
        total = int(11.5 * FPS)
        for i in range(total):
            quadro(i / FPS).save(os.path.join(pasta, f'q{i:04d}.png'))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(pasta, 'q%04d.png'),
                        '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
                        '-movflags', '+faststart', destino], check=True)

def pdf(destino):
    from playwright.sync_api import sync_playwright
    html = """<html><head><meta charset="utf-8"><style>
      body{font-family:'DejaVu Sans',sans-serif;color:#111827;margin:40px} h1{color:#1d4ed8;font-size:26px;margin:0 0 4px}
      .sub{color:#64748b;margin:0 0 24px} h2{font-size:16px;margin:22px 0 8px} li{margin:6px 0} .k{display:inline-block;border:1px solid #94a3b8;border-radius:5px;padding:1px 6px;font-weight:bold}
      table{border-collapse:collapse;width:100%} td{border:1px solid #cbd5e1;padding:6px 8px} td:first-child{width:28%;font-weight:bold}
      .rod{margin-top:30px;color:#64748b;font-size:12px}</style></head><body>
      <h1>Manual rápido do ramal</h1><p class="sub">Central de ajuda Ingline · telefones IP Grandstream</p>
      <h2>No dia a dia</h2><table>
      <tr><td>Transferir</td><td><span class="k">TRANSF</span> → número do ramal → <span class="k">TRANSF</span></td></tr>
      <tr><td>Pôr em espera</td><td><span class="k">Espera</span> (aperte de novo para voltar)</td></tr>
      <tr><td>Puxar ligação</td><td><span class="k">*8</span> + o ramal que está tocando</td></tr>
      <tr><td>Conferência</td><td><span class="k">Conf</span> → número → <span class="k">Conf</span></td></tr>
      <tr><td>Caixa postal</td><td><span class="k">*97</span> e a senha do ramal</td></tr></table>
      <h2>Se o telefone ficar sem linha</h2><ol><li>Confira o cabo de rede (a luz da porta precisa piscar).</li>
      <li>Tire o telefone da tomada por 10 segundos e ligue de novo.</li><li>Ainda sem linha? Fale com o suporte e diga o número do ramal.</li></ol>
      <p class="rod">Ingline Systems · este manual fica na Central de ajuda, junto com os vídeos.</p></body></html>"""
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-proxy-server'])
        pg = b.new_page(); pg.set_content(html); pg.pdf(path=destino, format='A4', print_background=True); b.close()

if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as pasta:
        mp4, manual = os.path.join(pasta, 'transferir.mp4'), os.path.join(pasta, 'manual.pdf')
        video(mp4); pdf(manual)
        b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
        saida = os.path.join(RAIZ, 'apps/web/src/api/portal-demo-midia.ts')
        with open(saida, 'w') as o:
            o.write('/**\n * O vídeo e o PDF de exemplo do portal do cliente na PRÉVIA (Patch 1.8).\n'
                    ' * Gerado por scripts/gerar-midia-portal-demo.py — não edite à mão.\n */\n')
            o.write(f"export const VIDEO_TRANSFERIR = 'data:video/mp4;base64,{b64(mp4)}';\n")
            o.write(f"export const PDF_MANUAL_RAMAL = 'data:application/pdf;base64,{b64(manual)}';\n")
        print('vídeo', os.path.getsize(mp4), 'bytes; pdf', os.path.getsize(manual), 'bytes ->', saida)
