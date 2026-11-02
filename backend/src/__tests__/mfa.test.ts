import {
  esFormatoDeCodigoDeRecuperacion,
  esFormatoDeCodigoValido,
  generarCodigosDeRecuperacion,
  hashearCodigosDeRecuperacion,
  normalizarCodigo,
  posicionDelCodigoDeRecuperacion
} from '../services/mfa';
import {
  intentosFallidos,
  LIMITE_DE_INTENTOS,
  olvidarIntentos,
  registrarIntentoFallido,
  reiniciarContadores,
  superoElLimite
} from '../services/intentosMfa';
import { CANTIDAD_CODIGOS_RECUPERACION } from '../models/Usuario';

/**
 * PU-21 a PU-25 — Segundo factor: formato del codigo, codigos de
 * recuperacion y limite de intentos (Sprint 5).
 *
 * HU-006 / CU-06. Nada de esto toca Express ni MongoDB: son las piezas
 * puras del MFA, y poder ejercitarlas sueltas importa porque son las que
 * deciden si un codigo entra o no.
 */

describe('RN-16 — esFormatoDeCodigoValido(): exactamente seis digitos', () => {
  it('PU-21: acepta seis digitos', () => {
    expect(esFormatoDeCodigoValido('123456')).toBe(true);
    expect(esFormatoDeCodigoValido('000000')).toBe(true);
    expect(esFormatoDeCodigoValido('999999')).toBe(true);
  });

  it('PU-21: acepta los ceros a la izquierda', () => {
    // Un codigo TOTP arranca con cero una de cada diez veces. Si se
    // rechazara, el segundo factor fallaria el 10% de las veces sin que
    // el usuario hiciera nada mal.
    expect(esFormatoDeCodigoValido('012345')).toBe(true);
    expect(esFormatoDeCodigoValido('000123')).toBe(true);
  });

  it('PU-21: tolera los espacios de un copiar y pegar', () => {
    expect(esFormatoDeCodigoValido(' 123456 ')).toBe(true);
  });

  it('PU-22: rechaza cualquier largo que no sea seis', () => {
    expect(esFormatoDeCodigoValido('12345')).toBe(false);
    expect(esFormatoDeCodigoValido('1234567')).toBe(false);
    expect(esFormatoDeCodigoValido('')).toBe(false);
  });

  it('PU-22: rechaza lo que no sean digitos', () => {
    expect(esFormatoDeCodigoValido('12345a')).toBe(false);
    expect(esFormatoDeCodigoValido('abcdef')).toBe(false);
    expect(esFormatoDeCodigoValido('12.345')).toBe(false);
    expect(esFormatoDeCodigoValido('-12345')).toBe(false);
    expect(esFormatoDeCodigoValido('１２３４５６')).toBe(false);
  });

  it('PU-22: rechaza lo que no es ni texto ni numero entero', () => {
    // Un cliente puede mandar cualquier cosa en el JSON: la funcion recibe
    // unknown justamente para que ninguna de esas cosas llegue a speakeasy.
    expect(esFormatoDeCodigoValido(undefined)).toBe(false);
    expect(esFormatoDeCodigoValido(null)).toBe(false);
    expect(esFormatoDeCodigoValido({})).toBe(false);
    expect(esFormatoDeCodigoValido([])).toBe(false);
    expect(esFormatoDeCodigoValido(true)).toBe(false);
    expect(esFormatoDeCodigoValido(123456.5)).toBe(false);
  });

  it('PU-22: acepta un numero entero de seis cifras', () => {
    expect(esFormatoDeCodigoValido(123456)).toBe(true);
    expect(esFormatoDeCodigoValido(12345)).toBe(false);
  });
});

describe('RN-16 — codigos de recuperacion', () => {
  it('PU-23: genera la cantidad que declara el modelo', () => {
    expect(generarCodigosDeRecuperacion()).toHaveLength(CANTIDAD_CODIGOS_RECUPERACION);
    expect(CANTIDAD_CODIGOS_RECUPERACION).toBe(8);
  });

  it('PU-23: todos tienen el formato XXXXX-XXXXX', () => {
    for (const codigo of generarCodigosDeRecuperacion()) {
      expect(esFormatoDeCodigoDeRecuperacion(codigo)).toBe(true);
    }
  });

  it('PU-23: no usan caracteres que se confunden al copiarlos a mano', () => {
    // El usuario los transcribe de un papel, muchas veces meses despues.
    // 0/O y 1/I/L son justo los que se leen mal.
    for (const codigo of generarCodigosDeRecuperacion(50)) {
      expect(codigo).not.toMatch(/[01OIL]/);
    }
  });

  it('PU-23: no se repiten entre si', () => {
    const codigos = generarCodigosDeRecuperacion(100);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('PU-23: dos tandas distintas no coinciden', () => {
    const primera = generarCodigosDeRecuperacion();
    const segunda = generarCodigosDeRecuperacion();
    expect(primera.some((c) => segunda.includes(c))).toBe(false);
  });

  it('PU-24: un codigo TOTP no pasa por codigo de recuperacion, ni al reves', () => {
    expect(esFormatoDeCodigoDeRecuperacion('123456')).toBe(false);
    expect(esFormatoDeCodigoValido('ABCDE-FGHJK')).toBe(false);
  });

  it('PU-24: el formato de recuperacion rechaza lo que no cuadra', () => {
    expect(esFormatoDeCodigoDeRecuperacion('ABCDEFGHJK')).toBe(false);
    expect(esFormatoDeCodigoDeRecuperacion('ABCD-EFGHJ')).toBe(false);
    expect(esFormatoDeCodigoDeRecuperacion('ABCDE-FGHI0')).toBe(false);
    expect(esFormatoDeCodigoDeRecuperacion(undefined)).toBe(false);
  });

  it('PU-24: se aceptan en minuscula, porque nadie los escribe en mayuscula', () => {
    const codigo = generarCodigosDeRecuperacion(1)[0];
    expect(esFormatoDeCodigoDeRecuperacion(codigo.toLowerCase())).toBe(true);
    expect(normalizarCodigo(` ${codigo.toLowerCase()} `)).toBe(codigo);
  });

  it('PU-24: hashearlos no deja ninguno en texto plano, y se pueden volver a encontrar',
    async () => {
      const codigos = generarCodigosDeRecuperacion();
      const hashes = await hashearCodigosDeRecuperacion(codigos);

      expect(hashes).toHaveLength(codigos.length);
      for (const hash of hashes) {
        expect(hash.startsWith('$2')).toBe(true);
        expect(codigos).not.toContain(hash);
      }

      // Cada codigo tiene que encontrarse en su propia posicion...
      expect(await posicionDelCodigoDeRecuperacion(codigos[0], hashes)).toBe(0);
      expect(await posicionDelCodigoDeRecuperacion(codigos[7], hashes)).toBe(7);
      // ...y uno inventado, en ninguna.
      expect(await posicionDelCodigoDeRecuperacion('ZZZZZ-ZZZZZ', hashes)).toBe(-1);
    },
    30000
  );
});

describe('RN-17 — limite de intentos por token temporal', () => {
  /** Vencimiento del token temporal, en segundos, cinco minutos adelante. */
  const dentroDeCincoMinutos = (): number => Math.floor(Date.now() / 1000) + 300;

  beforeEach(() => {
    reiniciarContadores();
  });

  it('PU-25: un token nuevo arranca sin intentos gastados', () => {
    expect(intentosFallidos('token-nuevo')).toBe(0);
    expect(superoElLimite('token-nuevo')).toBe(false);
  });

  it('PU-25: corta recien despues del quinto codigo incorrecto', () => {
    const jti = 'token-a';

    for (let i = 1; i <= LIMITE_DE_INTENTOS; i += 1) {
      const restantes = registrarIntentoFallido(jti, dentroDeCincoMinutos());
      expect(restantes).toBe(LIMITE_DE_INTENTOS - i);
      // Durante los cinco primeros todavia se puede seguir probando.
      expect(superoElLimite(jti)).toBe(i === LIMITE_DE_INTENTOS);
    }

    expect(intentosFallidos(jti)).toBe(LIMITE_DE_INTENTOS);
    expect(superoElLimite(jti)).toBe(true);
  });

  it('PU-25: el conteo es por token, no por usuario', () => {
    // Es lo que impide que alguien bloquee la cuenta ajena a proposito:
    // agotar un token no afecta a los demas.
    const agotado = 'token-agotado';
    for (let i = 0; i < LIMITE_DE_INTENTOS; i += 1) {
      registrarIntentoFallido(agotado, dentroDeCincoMinutos());
    }

    expect(superoElLimite(agotado)).toBe(true);
    expect(superoElLimite('otro-token-del-mismo-usuario')).toBe(false);
    expect(intentosFallidos('otro-token-del-mismo-usuario')).toBe(0);
  });

  it('PU-25: un codigo acertado borra el conteo del token', () => {
    const jti = 'token-b';
    registrarIntentoFallido(jti, dentroDeCincoMinutos());
    registrarIntentoFallido(jti, dentroDeCincoMinutos());
    expect(intentosFallidos(jti)).toBe(2);

    olvidarIntentos(jti);
    expect(intentosFallidos(jti)).toBe(0);
  });

  it('PU-25: el conteo de un token ya vencido deja de contar', () => {
    // Cuando el token temporal muere, su conteo no tiene a quien limitar:
    // para volver a intentar hay que iniciar sesion de nuevo, y eso exige
    // la contrasena correcta. Se anota el intento con un vencimiento que
    // ya paso, que es como queda un conteo cuyo token expiro.
    const jti = 'token-vencido';
    const hadeUnMinuto = Math.floor(Date.now() / 1000) - 60;

    for (let i = 0; i < LIMITE_DE_INTENTOS; i += 1) {
      registrarIntentoFallido(jti, hadeUnMinuto);
    }

    expect(intentosFallidos(jti)).toBe(0);
    expect(superoElLimite(jti)).toBe(false);
  });

  it('PU-25: anotar un token nuevo descarta los conteos ya vencidos', () => {
    const vencido = 'token-viejo';
    registrarIntentoFallido(vencido, Math.floor(Date.now() / 1000) - 60);

    // Esta escritura dispara la purga de los vencidos.
    registrarIntentoFallido('token-vigente', dentroDeCincoMinutos());

    expect(intentosFallidos(vencido)).toBe(0);
    expect(intentosFallidos('token-vigente')).toBe(1);
  });
});
