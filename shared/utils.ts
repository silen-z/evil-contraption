/**
 * Removes element on given index by swapping last element into its place
 * and truncating the array by one
 * @return {E} the removed element from the array
 */
export function swapRemove<E>(array: Array<E>, index: number): E {
  if (index >= array.length) {
    throw Error("index out of bounds");
  }

  const removed = array[index]!;
  array[index] = array[array.length - 1]!;
  array.length = array.length - 1;
  return removed;
}

export function findSingleDiff<T>(superset: Set<T>, subset: Set<T>): T | null {
  if (superset.size !== subset.size + 1) {
    return null;
  }

  const result = new Set(superset);
  for (const e of subset) {
    result.delete(e);
  }

  if (result.size === 1) {
    return result.values().next().value;
  }

  return null;
}

export function* range(start: number, end?: number): Generator<number> {
  if (end === undefined) {
    end = start;
    start = 0;
  }

  let i = start;
  while (i < end) {
    yield i;
    i++;
  }
}

export type Assign<P, N> = { [K in keyof (P & N)]: K extends keyof N ? N[K] : K extends keyof P ? P[K] : never };
// type AssignSingleKey<P, K extends string, V> = K extends keyof P ? { [N in K]: V } : P & { [N in K]: V };
