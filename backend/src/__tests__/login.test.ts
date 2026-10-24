import { decidirPasoDeLogin, PASOS_DE_LOGIN } from '../services/login';

/**
 * PU-19 y PU-20 — Decision del paso siguiente del login (Sprint 5).
 *
 * HU-006 / CU-06: con las credenciales ya validadas, el sistema decide si
 * la sesion se abre en el acto, si hay que pedir el codigo del segundo
 * factor o si hay que mandar al usuario a configurarlo.
 *
 * Son pruebas unitarias de verdad: la funcion no toca Express ni MongoDB,
 * recibe los dos booleanos del usuario y devuelve el paso. Por eso se
 * pueden cubrir los CUATRO casos posibles sin levantar nada, que es
 * exactamente lo que se quiere de una regla que decide quien entra.
 */

describe('RN-15 — decidirPasoDeLogin(): los cuatro casos posibles', () => {
  it('PU-19: sin MFA obligatorio y sin MFA configurado, entra directo', () => {
    expect(decidirPasoDeLogin({ mfaObligatorio: false, twoFactorEnabled: false })).toBe(
      'ACCESO_DIRECTO'
    );
  });

  it('PU-19: con el MFA ya configurado, hay que verificar el codigo', () => {
    expect(decidirPasoDeLogin({ mfaObligatorio: false, twoFactorEnabled: true })).toBe(
      'VERIFICAR_MFA'
    );
  });

  it('PU-19: con MFA obligatorio y sin configurar, hay que configurarlo', () => {
    expect(decidirPasoDeLogin({ mfaObligatorio: true, twoFactorEnabled: false })).toBe(
      'CONFIGURAR_MFA'
    );
  });

  it('PU-19: con MFA obligatorio Y ya configurado, verifica (no reconfigura)', () => {
    // Es el caso que justifica el orden de las comprobaciones. Mandarlo a
    // configurar le regeneraria el secreto y le dejaria inservible la
    // entrada que ya tiene cargada en el celular.
    expect(decidirPasoDeLogin({ mfaObligatorio: true, twoFactorEnabled: true })).toBe(
      'VERIFICAR_MFA'
    );
  });
});

describe('RN-15 — garantias de la decision', () => {
  /** Las cuatro combinaciones de los dos booleanos. */
  const COMBINACIONES = [
    { mfaObligatorio: false, twoFactorEnabled: false },
    { mfaObligatorio: false, twoFactorEnabled: true },
    { mfaObligatorio: true, twoFactorEnabled: false },
    { mfaObligatorio: true, twoFactorEnabled: true }
  ];

  it('PU-20: siempre devuelve uno de los tres pasos declarados', () => {
    for (const combinacion of COMBINACIONES) {
      expect(PASOS_DE_LOGIN).toContain(decidirPasoDeLogin(combinacion));
    }
  });

  it('PU-20: nunca entrega acceso directo si el MFA es obligatorio', () => {
    // Si lo hiciera, saltearse la exigencia del administrador seria tan
    // facil como no configurar nunca el segundo factor.
    const conExigencia = COMBINACIONES.filter((c) => c.mfaObligatorio);

    for (const combinacion of conExigencia) {
      expect(decidirPasoDeLogin(combinacion)).not.toBe('ACCESO_DIRECTO');
    }
  });

  it('PU-20: nunca entrega acceso directo si el MFA ya esta configurado', () => {
    // Quien activo el segundo factor espera que se lo pidan. Dejarlo pasar
    // de largo seria desactivarselo sin avisar.
    const yaConfigurado = COMBINACIONES.filter((c) => c.twoFactorEnabled);

    for (const combinacion of yaConfigurado) {
      expect(decidirPasoDeLogin(combinacion)).toBe('VERIFICAR_MFA');
    }
  });

  it('PU-20: el unico camino al acceso directo es sin exigencia y sin configurar', () => {
    const directos = COMBINACIONES.filter(
      (c) => decidirPasoDeLogin(c) === 'ACCESO_DIRECTO'
    );

    expect(directos).toEqual([{ mfaObligatorio: false, twoFactorEnabled: false }]);
  });
});
