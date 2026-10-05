// Undo/Redo über Zustands-Schnappschüsse. Aufrufer sorgt für Unveränderlichkeit (Copy-on-Write).
export class History {
  constructor(limit = 100) { this.limit = limit; this.undoStack = []; this.redoStack = []; }

  push(state) {
    this.undoStack.push(state);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  }

  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  }

  clear() { this.undoStack = []; this.redoStack = []; }
}
