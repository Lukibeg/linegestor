/**
 * Verificação em duas etapas (TOTP) — o código de 6 dígitos que muda a cada 30 segundos,
 * do Google Authenticator, Authy, 1Password e afins.
 *
 * Como funciona, em uma frase: o servidor e o telefone guardam o MESMO segredo; cada um
 * calcula um número a partir do segredo + do relógio, e os números batem. Nada trafega
 * entre os dois — por isso funciona até com o telefone sem internet.
 *
 * É o padrão RFC 6238 (HMAC-SHA1, 6 dígitos, janela de 30 s). Escrito aqui à mão, em vez de
 * trazer uma biblioteca, porque são 30 linhas e assim não dependemos de mais ninguém.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648)
const PASSO = 30; // segundos
const DIGITOS = 6;

/** Segredo novo, em base32 — é o que vira o QR Code. */
export function gerarSegredo(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let saida = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) saida += ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
  return saida;
}

function base32ParaBytes(s: string): Buffer {
  const limpo = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Segredo inválido');
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** O código válido num instante (por padrão, agora). */
export function codigo(segredo: string, quando: number = Date.now()): string {
  const contador = Math.floor(quando / 1000 / PASSO);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const mac = createHmac('sha1', base32ParaBytes(segredo)).update(msg).digest();
  const desloc = mac[mac.length - 1]! & 0x0f;
  const num = ((mac[desloc]! & 0x7f) << 24) | (mac[desloc + 1]! << 16) | (mac[desloc + 2]! << 8) | mac[desloc + 3]!;
  return String(num % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/**
 * Confere o código digitado. Aceita o anterior e o seguinte (`janela`) porque o relógio do
 * telefone raramente bate no segundo com o do servidor. Comparação de tempo constante.
 */
export function conferir(segredo: string, digitado: string, janela = 1, quando = Date.now()): boolean {
  const limpo = (digitado ?? '').replace(/\D/g, '');
  if (limpo.length !== DIGITOS) return false;
  const alvo = Buffer.from(limpo);
  for (let i = -janela; i <= janela; i++) {
    const esperado = Buffer.from(codigo(segredo, quando + i * PASSO * 1000));
    if (esperado.length === alvo.length && timingSafeEqual(esperado, alvo)) return true;
  }
  return false;
}

/** O endereço que vira QR Code — é o que o aplicativo do telefone lê. */
export function endereco(segredo: string, conta: string, emissor = 'Ingline Gestão'): string {
  const e = encodeURIComponent(emissor);
  return `otpauth://totp/${e}:${encodeURIComponent(conta)}?secret=${segredo}&issuer=${e}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO}`;
}

/** Códigos de recuperação: para quando o telefone some. Cada um só serve uma vez. */
export function gerarCodigosDeRecuperacao(quantos = 10): string[] {
  return Array.from({ length: quantos }, () => {
    const bruto = randomBytes(5).toString('hex').toUpperCase(); // 10 caracteres
    return `${bruto.slice(0, 5)}-${bruto.slice(5)}`;
  });
}
