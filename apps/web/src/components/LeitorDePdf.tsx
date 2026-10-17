/**
 * O LEITOR DE PDF do Gestor (Patch 2.0.1 — o pedido do Luan na prévia, em 17/10: "quero tbm que eu possa
 * previsualizar os documentos e imagens aqui sem ter que baixar"): o PDF anexado (a proposta, o contrato)
 * abre numa janela dentro do sistema, página por página, sem baixar.
 *
 * Quem desenha as páginas é o PDF.js, e não o leitor de PDF do navegador: a política de segurança do site
 * (`object-src 'none'`, decisão 0042) não deixa o leitor do navegador abrir dentro do Gestor — e continua
 * igual. O PDF.js só é carregado quando um PDF abre (o resto do sistema não fica mais pesado), roda o
 * trabalho pesado num worker do próprio Gestor e nunca executa o JavaScript que venha dentro do PDF. Cada
 * página vira uma imagem (canvas) na largura da janela; até 60 páginas (o resto, baixando).
 */
import { useEffect, useRef, useState } from 'react';
import { Spinner } from './ui/index.js';

/** Mais do que isso, só baixando (uma proposta tem poucas páginas; um manual de 300 travaria a tela). */
const MAX_PAGINAS = 60;

type Estado = { fase: 'lendo' } | { fase: 'erro'; mensagem: string } | { fase: 'pronto'; paginas: number; desenhadas: number };

export default function LeitorDePdf({ id, nome, carregar }: {
  /** o anexo (trocar o id recomeça a leitura) */
  id: string;
  nome: string;
  /** os bytes do arquivo (o servidor, ou a prévia) */
  carregar: () => Promise<ArrayBuffer>;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: 'lendo' });
  const ler = useRef(carregar);
  ler.current = carregar;

  useEffect(() => {
    let parou = false;
    let documento: { destroy: () => Promise<void> } | null = null;
    const alvo = caixa.current;
    setEstado({ fase: 'lendo' });
    (async () => {
      try {
        const [pdfjs, worker, bytes] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
          ler.current(),
        ]);
        if (parou || !alvo) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        // sem wasm (a política do site não deixa compilar): as imagens raras que pedem wasm ficam de fora
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWasm: false, enableXfa: false }).promise;
        documento = doc;
        if (parou) return;
        const total = Math.min(doc.numPages, MAX_PAGINAS);
        setEstado({ fase: 'pronto', paginas: doc.numPages, desenhadas: 0 });
        const largura = Math.max(240, alvo.clientWidth);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (let n = 1; n <= total; n++) {
          if (parou) return;
          const pagina = await doc.getPage(n);
          const natural = pagina.getViewport({ scale: 1 });
          // na largura da janela (nunca maior que 2×), nítida na tela de alta densidade
          const escala = Math.min(2, largura / natural.width);
          const vista = pagina.getViewport({ scale: escala * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vista.width);
          canvas.height = Math.floor(vista.height);
          canvas.style.width = `${Math.floor(vista.width / dpr)}px`;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'block mx-auto bg-white rounded-sm shadow-sm ring-1 ring-line';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${nome}: página ${n} de ${doc.numPages}`);
          canvas.dataset.pagina = String(n);
          alvo.appendChild(canvas);
          await pagina.render({ canvas, viewport: vista }).promise;
          pagina.cleanup();
          if (!parou) setEstado({ fase: 'pronto', paginas: doc.numPages, desenhadas: n });
        }
      } catch (e) {
        if (parou) return;
        const nomeDoErro = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
        setEstado({
          fase: 'erro',
          mensagem: nomeDoErro === 'PasswordException'
            ? 'Este PDF tem senha: baixe o arquivo para abrir no computador.'
            : nomeDoErro === 'InvalidPDFException'
              ? 'Este arquivo não é um PDF que dê para abrir (pode estar com defeito). Baixe para conferir no computador.'
              : 'Não deu para mostrar este PDF aqui. Baixe o arquivo para abrir no computador.',
        });
      }
    })();
    return () => {
      parou = true;
      void documento?.destroy();
      if (alvo) alvo.replaceChildren();
    };
  }, [id, nome]);

  return (
    <div className="flex flex-col gap-2 min-w-0" data-leitor-pdf={estado.fase}>
      {estado.fase === 'lendo' && <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted"><Spinner /> Abrindo o PDF…</p>}
      {estado.fase === 'erro' && <p className="rounded-lg bg-bad-soft text-bad p-3 text-[13.5px]" role="alert">{estado.mensagem}</p>}
      {estado.fase === 'pronto' && (
        <p className="text-[12px] text-muted text-center" aria-live="polite">
          {estado.desenhadas < Math.min(estado.paginas, MAX_PAGINAS)
            ? <>Desenhando a página {estado.desenhadas + 1} de {estado.paginas}…</>
            : estado.paginas === 1 ? '1 página' : `${estado.paginas} páginas`}
          {estado.paginas > MAX_PAGINAS && ` · aqui aparecem as ${MAX_PAGINAS} primeiras; baixe para ver o resto`}
        </p>
      )}
      {/* as páginas entram aqui (o React não mexe dentro desta caixa) */}
      <div ref={caixa} className="flex flex-col gap-3 min-w-0" id="leitor-pdf-paginas" />
    </div>
  );
}
