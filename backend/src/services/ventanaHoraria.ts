/**
 * Logica de ventanas horarias para la programacion de pedidos.
 *
 * Son funciones puras: no tocan la base de datos ni Express. El controlador
 * les pasa las ventanas ya ocupadas y ellas solo hacen cuentas con fechas.
 * Asi se pueden probar aisladas y reutilizar en otros modulos.
 *
 * Las horas se interpretan en la zona horaria del servidor: "07:00" es
 * las 7 de la manana en la hora local de la maquina que corre el backend.
 */

export interface VentanaHoraria {
  inicio: Date;
  fin: Date;
}

/**
 * Horario operativo del deposito, en horas enteras (07:00 a 17:00).
 * Si el equipo lo cambia, alcanza con tocar estos dos valores.
 */
export const HORARIO_OPERATIVO = {
  horaApertura: 7,
  horaCierre: 17
} as const;

const MS_POR_MINUTO = 60 * 1000;

/**
 * Calcula la ventana de un pedido: empieza en la fecha programada
 * y termina cuando se cumple la duracion estimada.
 */
export const calcularVentana = (inicio: Date, duracionMinutos: number): VentanaHoraria => ({
  inicio: new Date(inicio.getTime()),
  fin: new Date(inicio.getTime() + duracionMinutos * MS_POR_MINUTO)
});

/**
 * Devuelve la apertura y el cierre del horario operativo del dia de `fecha`.
 * Se trabaja sobre copias: setHours modifica el Date original.
 */
export const limitesDelDia = (fecha: Date): VentanaHoraria => {
  const apertura = new Date(fecha.getTime());
  apertura.setHours(HORARIO_OPERATIVO.horaApertura, 0, 0, 0);

  const cierre = new Date(fecha.getTime());
  cierre.setHours(HORARIO_OPERATIVO.horaCierre, 0, 0, 0);

  return { inicio: apertura, fin: cierre };
};

/**
 * Indica si una ventana entra completa dentro del horario operativo de su dia.
 */
export const estaDentroDelHorario = (ventana: VentanaHoraria): boolean => {
  const { inicio: apertura, fin: cierre } = limitesDelDia(ventana.inicio);
  return ventana.inicio >= apertura && ventana.fin <= cierre;
};

/**
 * Dos ventanas se solapan si cada una empieza antes de que termine la otra.
 *
 * La comparacion es estricta a proposito: un pedido de 09:00 a 10:00 y otro
 * de 10:00 a 11:00 NO se solapan, porque uno termina justo cuando empieza
 * el otro. Con <= esos dos turnos consecutivos se rechazarian sin motivo.
 */
export const seSolapan = (a: VentanaHoraria, b: VentanaHoraria): boolean =>
  a.inicio < b.fin && b.inicio < a.fin;

/**
 * Busca el primer hueco libre de `duracionMinutos` a partir de `desde`,
 * dentro del horario operativo de ESE mismo dia.
 *
 * Arranca en `desde` (o en la apertura, si `desde` es mas temprano) y, cada
 * vez que el candidato choca con una ventana ocupada, salta al final de esa
 * ventana y vuelve a probar. Como el candidato solo avanza, el ciclo termina.
 *
 * Devuelve null si ya no queda lugar ese dia.
 */
export const buscarSiguienteHueco = (
  desde: Date,
  duracionMinutos: number,
  ocupadas: VentanaHoraria[]
): VentanaHoraria | null => {
  const { inicio: apertura, fin: cierre } = limitesDelDia(desde);

  let candidato = calcularVentana(desde < apertura ? apertura : desde, duracionMinutos);

  while (candidato.fin <= cierre) {
    const choque = ocupadas.find((ocupada) => seSolapan(candidato, ocupada));

    if (!choque) {
      return candidato;
    }

    candidato = calcularVentana(choque.fin, duracionMinutos);
  }

  return null;
};

/**
 * Junta `cantidad` ventanas libres a partir de `desde`, para ofrecerlas
 * como alternativa cuando el horario pedido esta ocupado.
 *
 * Primero recorre lo que queda del mismo dia; si no alcanza, sigue con
 * los dias siguientes desde la apertura, hasta `diasMaximos` dias despues.
 * Cada alternativa arranca donde termina la anterior, asi no se pisan entre si.
 */
export const buscarAlternativas = (
  desde: Date,
  duracionMinutos: number,
  ocupadas: VentanaHoraria[],
  cantidad = 3,
  diasMaximos = 7
): VentanaHoraria[] => {
  const alternativas: VentanaHoraria[] = [];

  for (let dia = 0; dia <= diasMaximos && alternativas.length < cantidad; dia++) {
    let cursor: Date;

    if (dia === 0) {
      cursor = desde;
    } else {
      cursor = new Date(desde.getTime());
      cursor.setDate(cursor.getDate() + dia);
      cursor.setHours(HORARIO_OPERATIVO.horaApertura, 0, 0, 0);
    }

    while (alternativas.length < cantidad) {
      const hueco = buscarSiguienteHueco(cursor, duracionMinutos, ocupadas);

      if (!hueco) {
        break;
      }

      alternativas.push(hueco);
      cursor = hueco.fin;
    }
  }

  return alternativas;
};
