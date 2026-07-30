import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from './crypto';

const key = randomBytes(32).toString('base64');

describe('crypto de credenciais', () => {
  it('devolve o texto original na ida e volta', () => {
    const secret = 'senha-serasa-123';

    expect(decryptSecret(encryptSecret(secret, key), key)).toBe(secret);
  });

  it('gera saída diferente a cada cifra, pelo IV aleatório', () => {
    expect(encryptSecret('igual', key)).not.toBe(encryptSecret('igual', key));
  });

  it('recusa texto cifrado adulterado', () => {
    const [iv, tag, ciphertext] = encryptSecret('senha', key).split('.');
    const mexido = [iv, tag, Buffer.from('outra coisa').toString('base64url')].join('.');

    expect(() => decryptSecret(mexido, key)).toThrow();
  });

  it('recusa chave de outro tamanho', () => {
    expect(() => encryptSecret('x', randomBytes(16).toString('base64'))).toThrow(
      /32 bytes/,
    );
  });

  it('não decifra com outra chave', () => {
    const outra = randomBytes(32).toString('base64');

    expect(() => decryptSecret(encryptSecret('senha', key), outra)).toThrow();
  });
});
