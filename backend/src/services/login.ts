/**
 * Decision del paso siguiente del login.
 *
 * Vive aparte del controlador y sin tocar Express ni la base a proposito.
 * Es la regla que decide si alguien entra al sistema o se queda a mitad de
 * camino, y conviene poder ejercitarla entera con los cuatro casos posibles
 * en una prueba unitaria, sin levantar un servidor ni sembrar usuarios.
 */

/** Los tres finales posibles de un intento de login con credenciales validas. */
export const PASOS_DE_LOGIN = ['ACCESO_DIRECTO', 'VERIFICAR_MFA', 'CONFIGURAR_MFA'] as const;

export type PasoDeLogin = (typeof PASOS_DE_LOGIN)[number];

/** Lo unico del usuario que interviene en la decision. */
export interface EstadoMfaDelUsuario {
  /** El Administrador le exige el segundo factor. */
  mfaObligatorio: boolean;
  /** El usuario ya configuro y confirmo su autenticador. */
  twoFactorEnabled: boolean;
}

/**
 * Decide como sigue el login de un usuario cuya contrasena ya se valido.
 *
 *   mfaObligatorio  twoFactorEnabled  ->  resultado
 *   false           false                 ACCESO_DIRECTO   token definitivo
 *   false           true                  VERIFICAR_MFA    pide el codigo
 *   true            false                 CONFIGURAR_MFA   lo manda a armarlo
 *   true            true                  VERIFICAR_MFA    pide el codigo
 *
 * El orden de las dos comprobaciones no es casual: twoFactorEnabled se
 * mira PRIMERO. Quien ya tiene el autenticador configurado tiene que
 * escribir su codigo, le sea obligatorio o no; mandarlo a configurarlo de
 * nuevo le regeneraria el secreto y le dejaria inservible la entrada que
 * ya tiene en la aplicacion del celular.
 *
 * Al reves tambien importa: mfaObligatorio sin configurar no puede
 * devolver un token definitivo, porque seria la forma mas facil de
 * saltearse la exigencia del administrador: bastaria con no configurarlo
 * nunca.
 */
export const decidirPasoDeLogin = (estado: EstadoMfaDelUsuario): PasoDeLogin => {
  if (estado.twoFactorEnabled) {
    return 'VERIFICAR_MFA';
  }

  if (estado.mfaObligatorio) {
    return 'CONFIGURAR_MFA';
  }

  return 'ACCESO_DIRECTO';
};
