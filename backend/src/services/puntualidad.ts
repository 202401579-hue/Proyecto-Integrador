import { Puntualidad } from '../models/Pedido';

/**
 * Clasificacion de la puntualidad de un arribo (HU-02).
 *
 * Funciones puras: no tocan la base ni Express. Reciben la hora de llegada,
 * el inicio de la ventana y los margenes, y devuelven el estado. Los margenes
 * salen de la coleccion parametros (ver configuracionOperativa.ts), pero eso
 * lo resuelve quien las llama.
 */

export interface Tolerancias {
  /** Minutos antes del inicio a partir de los cuales la llegada es ANTICIPADO. */
  anticipadoMinutos: number;
  /** Minutos despues del inicio que todavia se consideran A TIEMPO. */
  tardioMinutos: number;
  /** Minutos despues del inicio a partir de los cuales el pedido es AUSENTE. */
  ausenteMinutos: number;
}

const MS_POR_MINUTO = 60 * 1000;

/**
 * Minutos entre el inicio de la ventana y la llegada real. Negativo si el
 * camion llego antes de la hora, positivo si llego despues.
 *
 * Se redondea al minuto porque es la unidad en la que estan expresadas las
 * tolerancias: informar "llego 7.483 minutos tarde" no le sirve a nadie.
 */
export const minutosDeDiferencia = (llegada: Date, inicioVentana: Date): number =>
  Math.round((llegada.getTime() - inicioVentana.getTime()) / MS_POR_MINUTO);

/**
 * Momento a partir del cual un pedido sin llegada se considera AUSENTE.
 * Lo usa tanto la clasificacion como el control de ausencias.
 */
export const limiteDeAusencia = (inicioVentana: Date, tolerancias: Tolerancias): Date =>
  new Date(inicioVentana.getTime() + tolerancias.ausenteMinutos * MS_POR_MINUTO);

/**
 * Clasifica la puntualidad de una llegada contra el inicio de su ventana.
 *
 * Con los valores por defecto (15, 15 y 60 minutos) y una ventana que empieza
 * a las 09:00:
 *
 *   hasta 08:44   -> ANTICIPADO   (mas de 15 min antes)
 *   08:45 a 09:15 -> A TIEMPO     (dentro de los margenes)
 *   09:16 a 10:00 -> TARDÍO       (paso el margen, no el limite)
 *   10:01 en mas  -> AUSENTE      (paso el limite de ausencia)
 *
 * Los limites se comparan con <=, asi que el minuto exacto del margen cuenta
 * a favor del proveedor: llegar 15 minutos tarde todavia es A TIEMPO.
 */
export const clasificarLlegada = (
  llegada: Date,
  inicioVentana: Date,
  tolerancias: Tolerancias
): Puntualidad => {
  const diferencia = minutosDeDiferencia(llegada, inicioVentana);

  if (diferencia < -tolerancias.anticipadoMinutos) {
    return 'ANTICIPADO';
  }

  if (diferencia <= tolerancias.tardioMinutos) {
    return 'A TIEMPO';
  }

  if (diferencia <= tolerancias.ausenteMinutos) {
    return 'TARDÍO';
  }

  return 'AUSENTE';
};
