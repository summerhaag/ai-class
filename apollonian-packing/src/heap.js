// Minimal array-based binary max-heap, ordered by a numeric priority stored
// on each item (item.priority). Used to always expand the largest/most
// visually significant frontier next, instead of an arbitrary queue order.
export class MaxHeap {
  constructor(items = []) {
    this.items = items;
    for (let i = (this.items.length >> 1) - 1; i >= 0; i--) this._siftDown(i);
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(item) {
    this.items.push(item);
    this._siftUp(this.items.length - 1);
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  // Removes items matching predicate and restores heap order. O(n) — meant
  // for infrequent bulk cleanup (eviction), not per-frame use.
  removeWhere(predicate) {
    this.items = this.items.filter((i) => !predicate(i));
    for (let i = (this.items.length >> 1) - 1; i >= 0; i--) this._siftDown(i);
  }

  _siftUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority >= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this.items.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let largest = i;
      if (l < n && this.items[l].priority > this.items[largest].priority) largest = l;
      if (r < n && this.items[r].priority > this.items[largest].priority) largest = r;
      if (largest === i) break;
      [this.items[i], this.items[largest]] = [this.items[largest], this.items[i]];
      i = largest;
    }
  }
}
