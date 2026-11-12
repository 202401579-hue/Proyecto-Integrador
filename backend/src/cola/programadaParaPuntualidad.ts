import { Puntualidad } from '../models/Pedido';
import { Tolerancias } from '../services/puntualidad';
import { calcularVentana, VentanaHoraria } from '../services/ventanaHoraria';

/**
 * Elige con cuanta anticipacion o atraso, respecto de una llegada ya
 * decidida, tiene que empezar la ventana de un pedido para que
 * clasificarLlegada() (services/puntualidad.ts) la clasifique como
 * `objetivo`. Es la cuenta inversa de clasificarLlegada: en vez de partir
 * de la ventana y la llegada para sacar la puntualidad, parte de la
 * puntualidad que se quiere demostrar y de la llegada ya fijada, y
 * devuelve la ventana que hace falta.
 *
 * Los margenes se alejan del borde exacto de cada tolerancia a proposito:
 * la llegada real de una demo en vivo (POST /api/llegadas) nunca cae en el
 * segundo exacto calculado aqui, y un margen angosto podria aterrizar del
 * otro lado del limite.
 *
 * AUSENTE no esta soportado: no tiene sentido sembrar un pedido para
 * "demostrar" una ausencia registrando una llegada, porque una llegada
 * registrada nunca puede clasificar AUSENTE (esa clasificacion es, por
 * definicion, la de un pedido que nunca llego).
 */
const diferenciaEnMinutosParaObjetivo = (objetivo: Puntualidad, tolerancias: Tolerancias): number => {
  switch (objetivo) {
    case 'ANTICIPADO':
      // Mas de anticipadoMinutos antes del inicio: 10 minutos de margen de sobra.
      return -(tolerancias.anticipadoMinutos + 10);

    case 'A TIEMPO':
      // El centro de la zona A TIEMPO es la llegada exacta al inicio de la
      // ventana (diferencia 0): el margen hacia cualquiera de los dos lados
      // es como minimo el menor de los dos margenes configurados.
      return 0;

    case 'TARDÍO': {
      // El punto medio entre el margen tardio y el limite de ausencia:
      // siempre estrictamente mayor que tardioMinutos y estrictamente menor
      // que ausenteMinutos, sin importar que tan separados esten los dos.
      const centro = (tolerancias.tardioMinutos + tolerancias.ausenteMinutos) / 2;
      return Math.round(centro);
    }

    default:
      throw new Error(`programadaParaPuntualidad no admite el objetivo "${objetivo}"`);
  }
};

/**
 * Ventana (inicioVentana/finVentana) que hay que programar para que, al
 * registrar la llegada en `llegadaPrevista`, el pedido quede clasificado
 * como `objetivo`.
 */
export const programadaParaPuntualidad = (
  objetivo: Puntualidad,
  llegadaPrevista: Date,
  tolerancias: Tolerancias,
  duracionMinutos: number
): VentanaHoraria => {
  const diferenciaMinutos = diferenciaEnMinutosParaObjetivo(objetivo, tolerancias);
  const inicioCalculado = new Date(llegadaPrevista.getTime() - diferenciaMinutos * 60 * 1000);

  return calcularVentana(inicioCalculado, duracionMinutos);
};
