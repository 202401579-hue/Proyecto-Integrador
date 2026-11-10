/**
 * Heap binario generico, implementado sobre un arreglo (sin libreria externa).
 *
 * El arreglo representa un arbol binario completo: el hijo izquierdo del
 * nodo en la posicion i esta en 2i+1 y el derecho en 2i+2; el padre de la
 * posicion i esta en Math.floor((i-1)/2).
 *
 * El comparador decide el orden: comparador(a, b) < 0 significa que "a" va
 * antes que "b" (a es mas prioritario y queda mas arriba, hacia la raiz).
 * Con eso el mismo heap sirve para una cola de minimos o de maximos segun
 * como se escriba el comparador.
 */
export class HeapBinario<T> {
  private datos: T[];
  private readonly comparador: (a: T, b: T) => number;

  constructor(comparador: (a: T, b: T) => number) {
    this.comparador = comparador;
    this.datos = [];
  }

  /**
   * Construye un heap a partir de un arreglo ya existente.
   *
   * O(n): hace heapify de abajo hacia arriba (desde el ultimo padre hasta la
   * raiz), en vez de insertar los n elementos uno por uno, que seria
   * O(n log n).
   */
  static desdeArreglo<T>(items: T[], comparador: (a: T, b: T) => number): HeapBinario<T> {
    const heap = new HeapBinario<T>(comparador);
    heap.datos = [...items];

    const ultimoPadre = Math.floor(heap.datos.length / 2) - 1;
    for (let i = ultimoPadre; i >= 0; i--) {
      heap.siftDown(i);
    }

    return heap;
  }

  /** O(log n): agrega al final y sube el elemento mientras sea mas prioritario que su padre. */
  insertar(elemento: T): void {
    this.datos.push(elemento);
    this.siftUp(this.datos.length - 1);
  }

  /**
   * O(log n): quita y devuelve el elemento mas prioritario (la raiz).
   * Mueve el ultimo elemento a la raiz y lo hunde hasta su lugar.
   * Devuelve undefined si el heap esta vacio.
   */
  extraer(): T | undefined {
    if (this.datos.length === 0) {
      return undefined;
    }

    const tope = this.datos[0];
    const ultimo = this.datos.pop() as T;

    if (this.datos.length > 0) {
      this.datos[0] = ultimo;
      this.siftDown(0);
    }

    return tope;
  }

  /** O(1): devuelve el elemento mas prioritario sin quitarlo. */
  verTope(): T | undefined {
    return this.datos[0];
  }

  /** O(1): cantidad de elementos en el heap. */
  tamano(): number {
    return this.datos.length;
  }

  /** O(1): true si el heap no tiene elementos. */
  estaVacio(): boolean {
    return this.datos.length === 0;
  }

  /** O(log n): sube el elemento en `indice` mientras sea mas prioritario que su padre. */
  private siftUp(indice: number): void {
    let actual = indice;
    while (actual > 0) {
      const padre = Math.floor((actual - 1) / 2);
      if (this.comparador(this.datos[actual], this.datos[padre]) >= 0) {
        break;
      }
      this.intercambiar(actual, padre);
      actual = padre;
    }
  }

  /** O(log n): hunde el elemento en `indice` intercambiando con el hijo mas prioritario. */
  private siftDown(indice: number): void {
    let actual = indice;
    const n = this.datos.length;

    while (true) {
      const izquierdo = 2 * actual + 1;
      const derecho = 2 * actual + 2;
      let masPrioritario = actual;

      if (izquierdo < n && this.comparador(this.datos[izquierdo], this.datos[masPrioritario]) < 0) {
        masPrioritario = izquierdo;
      }
      if (derecho < n && this.comparador(this.datos[derecho], this.datos[masPrioritario]) < 0) {
        masPrioritario = derecho;
      }
      if (masPrioritario === actual) {
        break;
      }

      this.intercambiar(actual, masPrioritario);
      actual = masPrioritario;
    }
  }

  /** O(1): intercambia dos posiciones del arreglo interno. */
  private intercambiar(i: number, j: number): void {
    const temporal = this.datos[i];
    this.datos[i] = this.datos[j];
    this.datos[j] = temporal;
  }
}
