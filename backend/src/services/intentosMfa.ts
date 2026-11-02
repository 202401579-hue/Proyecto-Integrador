/**
 * Limite de intentos del segundo factor.
 *
 * Un codigo TOTP son seis digitos: un millon de combinaciones. Sin un
 * limite, probarlas todas contra un endpoint publico es cuestion de un
 * script y un rato, y el segundo factor dejaria de serlo.
 *
 * ---------------------------------------------------------------------
 * Por que se cuenta por jti y no por usuario
 * ---------------------------------------------------------------------
 * El jti identifica al token temporal concreto. Contar por usuario
 * dejaria que cualquiera bloqueara la cuenta ajena a propósito: bastaria
 * con conocer un correo y mandar codigos equivocados hasta agotarle los
 * intentos al dueno. Contando por token, el que se queda sin intentos es
 * el atacante; el usuario legitimo vuelve a iniciar sesion, recibe un
 * token nuevo con otro jti y arranca de cero.
 *
 * Eso no debilita la defensa: para conseguir un token temporal nuevo hay
 * que volver a poner la contrasena correcta. Quien no la tiene no puede
 * renovar sus intentos.
 *
 * ---------------------------------------------------------------------
 * Por que en memoria
 * ---------------------------------------------------------------------
 * El contador vive en un Map del proceso, no en MongoDB. Es deliberado y
 * tiene un limite conocido que conviene decir en voz alta:
 *
 *   - Si el servidor se reinicia, los contadores se pierden. En la
 *     practica importa poco: los tokens temporales duran cinco minutos,
 *     asi que lo que se pierde es a lo sumo el conteo de los ultimos
 *     cinco minutos, y reiniciar el servidor no es algo que un atacante
 *     pueda provocar.
 *
 *   - Si manana se levantan DOS instancias del backend detras de un
 *     balanceador, cada una llevaria su propio conteo y el limite real
 *     pasaria a ser de cinco por instancia. Ahi si habria que mover esto
 *     a una coleccion de Mongo o a Redis.
 *
 * Para el alcance de este proyecto (una instancia) alcanza, y evita una
 * escritura en la base por cada codigo equivocado.
 */

/** Codigos incorrectos que se toleran antes de cortar. */
export const LIMITE_DE_INTENTOS = 5;

interface Conteo {
  fallidos: number;
  /** Momento en que vence el token temporal, en milisegundos. */
  expiraEn: number;
}

const conteos = new Map<string, Conteo>();

/**
 * Descarta los conteos cuyo token ya vencio.
 *
 * Se llama en cada escritura en lugar de con un setInterval: un
 * temporizador activo mantendria vivo el proceso y habria que acordarse de
 * apagarlo en las pruebas. El Map no pasa de unas pocas entradas, porque
 * cada una desaparece a los cinco minutos.
 */
const purgarVencidos = (ahora: number): void => {
  for (const [jti, conteo] of conteos) {
    if (conteo.expiraEn <= ahora) {
      conteos.delete(jti);
    }
  }
};

/** Cuantos codigos incorrectos lleva este token temporal. */
export const intentosFallidos = (jti: string): number => {
  const conteo = conteos.get(jti);

  if (!conteo || conteo.expiraEn <= Date.now()) {
    return 0;
  }

  return conteo.fallidos;
};

/** true si este token ya gasto todos sus intentos y hay que cortar con 429. */
export const superoElLimite = (jti: string): boolean =>
  intentosFallidos(jti) >= LIMITE_DE_INTENTOS;

/**
 * Anota un codigo incorrecto y devuelve cuantos intentos quedan.
 *
 * `expiraEnSegundos` es el claim exp del token temporal: cuando ese token
 * muere, su conteo deja de tener sentido y se puede descartar.
 */
export const registrarIntentoFallido = (jti: string, expiraEnSegundos: number): number => {
  const ahora = Date.now();
  purgarVencidos(ahora);

  const previo = conteos.get(jti);
  const fallidos = (previo?.fallidos ?? 0) + 1;

  conteos.set(jti, { fallidos, expiraEn: expiraEnSegundos * 1000 });

  return Math.max(LIMITE_DE_INTENTOS - fallidos, 0);
};

/**
 * Borra el conteo de un token. Se llama cuando el codigo fue correcto: ese
 * token ya cumplio su proposito y no hay nada mas que contarle.
 */
export const olvidarIntentos = (jti: string): void => {
  conteos.delete(jti);
};

/** Solo para las pruebas: deja el contador como recien arrancado. */
export const reiniciarContadores = (): void => {
  conteos.clear();
};
