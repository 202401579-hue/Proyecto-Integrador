import { HeapBinario } from '../cola/heapBinario';

/**
 * HeapBinario — estructura generica de la cola de prioridad (Sprint 6).
 *
 * Se prueba contra un sort() con el mismo comparador: si ambos dan la misma
 * secuencia, el heap esta ordenando igual que la referencia conocida.
 */

const comparadorNumeros = (a: number, b: number): number => a - b;

/** Arreglo pseudoaleatorio pero reproducible (sin Math.random en el test). */
const generarArreglo = (n: number): number[] => {
  const arreglo: number[] = [];
  let semilla = 12345;
  for (let i = 0; i < n; i++) {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    arreglo.push(semilla % 1000);
  }
  return arreglo;
};

describe('HeapBinario — orden de extraccion', () => {
  it('extrae en el mismo orden que un sort con el mismo comparador (50 elementos)', () => {
    const items = generarArreglo(50);
    const heap = new HeapBinario<number>(comparadorNumeros);
    for (const item of items) {
      heap.insertar(item);
    }

    const extraidos: number[] = [];
    while (!heap.estaVacio()) {
      extraidos.push(heap.extraer() as number);
    }

    const esperado = [...items].sort(comparadorNumeros);
    expect(extraidos).toEqual(esperado);
  });

  it('desdeArreglo da el mismo resultado que insertar uno por uno', () => {
    const items = generarArreglo(50);

    const heapInsertado = new HeapBinario<number>(comparadorNumeros);
    for (const item of items) {
      heapInsertado.insertar(item);
    }

    const heapDesdeArreglo = HeapBinario.desdeArreglo(items, comparadorNumeros);

    const extraerTodo = (heap: HeapBinario<number>): number[] => {
      const salida: number[] = [];
      while (!heap.estaVacio()) {
        salida.push(heap.extraer() as number);
      }
      return salida;
    };

    expect(extraerTodo(heapDesdeArreglo)).toEqual(extraerTodo(heapInsertado));
  });

  it('extraer en heap vacio devuelve undefined', () => {
    const heap = new HeapBinario<number>(comparadorNumeros);
    expect(heap.extraer()).toBeUndefined();
    expect(heap.estaVacio()).toBe(true);
    expect(heap.tamano()).toBe(0);
  });

  it('resuelve los empates de forma deterministica (mismo orden de insercion, mismo resultado)', () => {
    const items = [5, 3, 3, 1, 3, 2, 1];

    const heapA = HeapBinario.desdeArreglo(items, comparadorNumeros);
    const heapB = HeapBinario.desdeArreglo([...items], comparadorNumeros);

    const extraerTodo = (heap: HeapBinario<number>): number[] => {
      const salida: number[] = [];
      while (!heap.estaVacio()) {
        salida.push(heap.extraer() as number);
      }
      return salida;
    };

    const extraidosA = extraerTodo(heapA);
    const extraidosB = extraerTodo(heapB);

    expect(extraidosA).toEqual(extraidosB);
    expect(extraidosA).toEqual([...items].sort(comparadorNumeros));
  });

  it('verTope devuelve el elemento mas prioritario sin quitarlo', () => {
    const heap = new HeapBinario<number>(comparadorNumeros);
    heap.insertar(10);
    heap.insertar(2);
    heap.insertar(7);

    expect(heap.verTope()).toBe(2);
    expect(heap.tamano()).toBe(3);
    expect(heap.verTope()).toBe(2);
  });
});
