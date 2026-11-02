import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { CANTIDAD_CODIGOS_RECUPERACION } from '../models/Usuario';

/**
 * Segundo factor basado en TOTP (contrasena de un solo uso basada en tiempo).
 *
 * El autenticador del celular y el servidor comparten un secreto y miran el
 * mismo reloj: los dos calculan el mismo codigo de seis digitos, que cambia
 * cada treinta segundos. Nunca viaja nada entre ellos, por eso funciona sin
 * internet en el telefono.
 */

/** Nombre que la aplicacion autenticadora muestra encima del codigo. */
export const EMISOR = 'SumaControl';

/**
 * Tolerancia en pasos de 30 segundos hacia atras y hacia adelante.
 *
 * Con window: 1 tambien se aceptan el codigo anterior y el siguiente, o sea
 * una ventana total de minuto y medio. Hace falta: entre que el usuario lee
 * el codigo y lo termina de escribir puede cambiar el periodo, y los relojes
 * del celular y del servidor nunca estan perfectamente sincronizados.
 */
export const VENTANA_TOTP = 1;

/** Un codigo TOTP son exactamente seis digitos. */
const FORMATO_TOTP = /^\d{6}$/;

/** Un codigo de recuperacion son dos grupos de cinco caracteres. */
const FORMATO_RECUPERACION = /^[A-Z2-9]{5}-[A-Z2-9]{5}$/;

/**
 * Alfabeto de los codigos de recuperacion.
 *
 * Se excluyen 0, O, 1, I y L a proposito: el usuario los copia a mano de un
 * papel, muchas veces meses despues, y esos cinco caracteres son los que se
 * confunden entre si. Un codigo valido que el usuario no puede tipear bien
 * no sirve de nada.
 */
const ALFABETO_RECUPERACION = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Valida el FORMATO del codigo del autenticador, sin mirar si es correcto.
 *
 * Es una funcion pura y por eso esta separada de la verificacion: permite
 * contestar 400 ("esto no tiene forma de codigo") antes de gastar una
 * comprobacion criptografica y, sobre todo, antes de gastarle al usuario uno
 * de sus cinco intentos. Equivocarse de campo no deberia costar un intento.
 *
 * Acepta tambien un numero porque un cliente descuidado puede mandar 123456
 * sin comillas. Ojo con eso: en JSON, 012345 llega como 12345 y se rechaza,
 * que es lo correcto, porque el codigo que el usuario vio en pantalla tenia
 * seis digitos y el que llego tiene cinco.
 */
export const esFormatoDeCodigoValido = (codigo: unknown): boolean => {
  if (typeof codigo === 'string') {
    return FORMATO_TOTP.test(codigo.trim());
  }

  if (typeof codigo === 'number' && Number.isInteger(codigo)) {
    return FORMATO_TOTP.test(String(codigo));
  }

  return false;
};

/** Valida el formato de un codigo de recuperacion (XXXXX-XXXXX). */
export const esFormatoDeCodigoDeRecuperacion = (codigo: unknown): boolean =>
  typeof codigo === 'string' && FORMATO_RECUPERACION.test(codigo.trim().toUpperCase());

/** Normaliza lo que mando el cliente a un texto comparable. */
export const normalizarCodigo = (codigo: unknown): string =>
  String(codigo ?? '').trim().toUpperCase();

/**
 * Genera un secreto nuevo en Base32, que es el formato que entienden
 * Google Authenticator y el resto de las aplicaciones autenticadoras.
 */
export const generarSecreto = (): string =>
  speakeasy.generateSecret({ length: 20 }).base32;

/**
 * Arma la URI otpauth:// que se convierte en el codigo QR.
 *
 * Lleva el secreto adentro: es lo que el celular lee al escanear. Por eso
 * esta URI se devuelve UNA vez, en la respuesta del setup, y no se guarda
 * ni se vuelve a mostrar en ningun listado.
 *
 * La etiqueta va como "SumaControl:correo" ademas del parametro issuer.
 * Es la forma que recomienda la especificacion del formato otpauth y
 * resuelve un detalle practico: las aplicaciones que no leen el parametro
 * issuer muestran solo la etiqueta, y un listado con tres entradas que
 * dicen nada mas el correo no deja distinguir de que sistema es cada una.
 */
export const construirOtpauthUrl = (secreto: string, correo: string): string =>
  speakeasy.otpauthURL({
    secret: secreto,
    encoding: 'base32',
    label: `${EMISOR}:${correo}`,
    issuer: EMISOR
  });

/** Comprueba un codigo TOTP contra el secreto del usuario. */
export const verificarCodigoTotp = (secreto: string, codigo: string): boolean =>
  speakeasy.totp.verify({
    secret: secreto,
    encoding: 'base32',
    token: codigo,
    window: VENTANA_TOTP
  });

/**
 * Genera los codigos de recuperacion en texto plano. El llamador los
 * muestra una sola vez y guarda unicamente los hashes.
 *
 * Se usa randomInt del modulo crypto y no Math.random(): estos codigos
 * saltean el segundo factor completo, asi que tienen que ser tan
 * impredecibles como una contrasena.
 */
export const generarCodigosDeRecuperacion = (
  cantidad: number = CANTIDAD_CODIGOS_RECUPERACION
): string[] => {
  const generarGrupo = (): string =>
    Array.from({ length: 5 }, () =>
      ALFABETO_RECUPERACION[randomInt(ALFABETO_RECUPERACION.length)]
    ).join('');

  return Array.from({ length: cantidad }, () => `${generarGrupo()}-${generarGrupo()}`);
};

/**
 * Hashea los codigos con bcrypt, igual que una contrasena.
 *
 * Guardarlos en claro convertiria un vistazo a la base en un salteo
 * completo del segundo factor, que es justo lo que el segundo factor
 * deberia impedir.
 */
export const hashearCodigosDeRecuperacion = async (codigos: string[]): Promise<string[]> => {
  const salt = await bcrypt.genSalt(10);
  return Promise.all(codigos.map((codigo) => bcrypt.hash(codigo, salt)));
};

/**
 * Busca el codigo entre los hashes guardados y devuelve su posicion, o -1.
 *
 * Recorre TODOS los hashes aunque ya haya encontrado el correcto. Cortar
 * antes haria que la respuesta tardara distinto segun en que posicion
 * estuviera el codigo acertado, y ese tiempo es informacion que se le
 * estaria regalando a quien prueba codigos a ciegas.
 */
export const posicionDelCodigoDeRecuperacion = async (
  codigo: string,
  hashes: string[]
): Promise<number> => {
  let encontrada = -1;

  for (let i = 0; i < hashes.length; i += 1) {
    const coincide = await bcrypt.compare(codigo, hashes[i]);

    if (coincide && encontrada === -1) {
      encontrada = i;
    }
  }

  return encontrada;
};
