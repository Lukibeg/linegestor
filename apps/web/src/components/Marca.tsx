/**
 * A marca da Ingline Gestão.
 *
 * `Logotipo` é a versão completa (símbolo + "INGLINE GESTÃO"), para telas grandes —
 * entrada no sistema, cabeçalho do menu aberto. Vem em duas artes: a de fundo claro e a
 * de fundo escuro, e o CSS mostra a certa conforme o tema (ver styles.css).
 *
 * `Simbolo` é só o símbolo, para lugares pequenos: menu recolhido, selos, avatar.
 */
import logoClaro from '../assets/ingline-gestao.png';
import logoEscuro from '../assets/ingline-gestao-escuro.png';
import simbolo from '../assets/ingline-simbolo.png';

export function Logotipo({ altura = 30, className = '' }: { altura?: number; className?: string }) {
  const estilo = { height: altura, width: 'auto' } as const;
  return (
    <span className={`inline-flex shrink-0 ${className}`}>
      <img className="marca-claro" src={logoClaro} alt="Ingline Gestão" style={estilo} />
      <img className="marca-escuro" src={logoEscuro} alt="Ingline Gestão" style={estilo} aria-hidden />
    </span>
  );
}

export function Simbolo({ tamanho = 28, className = '', titulo = 'Ingline Gestão' }: { tamanho?: number; className?: string; titulo?: string }) {
  return <img src={simbolo} alt={titulo} title={titulo} width={tamanho} height={tamanho} className={`shrink-0 object-contain ${className}`} style={{ width: tamanho, height: tamanho }} />;
}
