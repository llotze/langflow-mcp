import { LangflowFlow, FlowDiffOperation } from '../types.js';

export interface HistoryEntry {
  /** Unique identifier for this history entry */
  id: string;
  
  /** Flow ID this entry belongs to */
  flowId: string;
  
  /** Complete flow snapshot before operations */
  beforeState: LangflowFlow;
  
  /** Complete flow snapshot after operations */
  afterState: LangflowFlow;
  
  /** Operations that were applied */
  operations: FlowDiffOperation[];
  
  /** Timestamp of when operations were applied */
  timestamp: number;
  
  /** Optional description of what changed */
  description?: string;
  
  /** User/agent that made the change */
  actor?: string;
}

export interface UndoRedoState {
  /** Current position in history */
  currentIndex: number;
  
  /** All history entries (ordered oldest to newest) */
  entries: HistoryEntry[];
  
  /** Maximum number of history entries to keep */
  maxEntries: number;
}

/**
 * FlowHistory manages undo/redo state for Langflow flows.
 * 
 * Stores complete flow snapshots before and after each operation set,
 * allowing precise rollback and replay of changes.
 */
export class FlowHistory {
  /** History per flow ID */
  private history: Map<string, UndoRedoState> = new Map();
  
  /** Default max entries per flow */
  private readonly DEFAULT_MAX_ENTRIES = 50;

  /**
   * Records a new history entry after operations are applied.
   * 
   * @param flowId - Flow that was modified
   * @param beforeState - Flow state before operations
   * @param afterState - Flow state after operations
   * @param operations - Operations that were applied
   * @param description - Optional description
   * @param actor - Who/what made the change
   */
  push(
    flowId: string,
    beforeState: LangflowFlow,
    afterState: LangflowFlow,
    operations: FlowDiffOperation[],
    description?: string,
    actor?: string
  ): void {
    let state = this.history.get(flowId);
    
    if (!state) {
      state = {
        currentIndex: -1,
        entries: [],
        maxEntries: this.DEFAULT_MAX_ENTRIES
      };
      this.history.set(flowId, state);
    }

    // When pushing new entry, discard any "future" entries after current position
    if (state.currentIndex < state.entries.length - 1) {
      state.entries = state.entries.slice(0, state.currentIndex + 1);
    }

    // Create new entry
    const entry: HistoryEntry = {
      id: `${flowId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      flowId,
      beforeState: this.cloneFlow(beforeState),
      afterState: this.cloneFlow(afterState),
      operations,
      timestamp: Date.now(),
      description,
      actor
    };

    state.entries.push(entry);
    state.currentIndex = state.entries.length - 1;

    // Enforce max entries limit (remove oldest)
    if (state.entries.length > state.maxEntries) {
      const removeCount = state.entries.length - state.maxEntries;
      state.entries.splice(0, removeCount);
      state.currentIndex -= removeCount;
    }
  }

  /**
   * Undo the last operation set.
   * 
   * @param flowId - Flow to undo changes for
   * @returns Previous flow state, or null if nothing to undo
   */
  undo(flowId: string): LangflowFlow | null {
    const state = this.history.get(flowId);
    
    if (!state || state.currentIndex < 0) {
      return null; // Nothing to undo
    }

    const entry = state.entries[state.currentIndex];
    state.currentIndex--;

    return this.cloneFlow(entry.beforeState);
  }

  /**
   * Redo the next operation set.
   * 
   * @param flowId - Flow to redo changes for
   * @returns Next flow state, or null if nothing to redo
   */
  redo(flowId: string): LangflowFlow | null {
    const state = this.history.get(flowId);
    
    if (!state || state.currentIndex >= state.entries.length - 1) {
      return null; // Nothing to redo
    }

    state.currentIndex++;
    const entry = state.entries[state.currentIndex];

    return this.cloneFlow(entry.afterState);
  }

  /**
   * Check if undo is available.
   */
  canUndo(flowId: string): boolean {
    const state = this.history.get(flowId);
    return state ? state.currentIndex >= 0 : false;
  }

  /**
   * Check if redo is available.
   */
  canRedo(flowId: string): boolean {
    const state = this.history.get(flowId);
    return state ? state.currentIndex < state.entries.length - 1 : false;
  }

  /**
   * Get current history position info.
   */
  getHistoryInfo(flowId: string): {
    canUndo: boolean;
    canRedo: boolean;
    currentIndex: number;
    totalEntries: number;
    entries: Array<{ id: string; description?: string; timestamp: number }>;
  } | null {
    const state = this.history.get(flowId);
    
    if (!state) {
      return null;
    }

    return {
      canUndo: this.canUndo(flowId),
      canRedo: this.canRedo(flowId),
      currentIndex: state.currentIndex,
      totalEntries: state.entries.length,
      entries: state.entries.map(e => ({
        id: e.id,
        description: e.description,
        timestamp: e.timestamp
      }))
    };
  }

  /**
   * Clear all history for a flow.
   */
  clear(flowId: string): void {
    this.history.delete(flowId);
  }

  /**
   * Clear all history.
   */
  clearAll(): void {
    this.history.clear();
  }

  /**
   * Get a specific history entry.
   */
  getEntry(flowId: string, entryId: string): HistoryEntry | null {
    const state = this.history.get(flowId);
    if (!state) return null;
    
    return state.entries.find(e => e.id === entryId) || null;
  }

  /**
   * Jump to a specific point in history.
   * 
   * @param flowId - Flow ID
   * @param entryId - Target entry ID
   * @returns Flow state at that point, or null if not found
   */
  jumpTo(flowId: string, entryId: string): LangflowFlow | null {
    const state = this.history.get(flowId);
    if (!state) return null;

    const index = state.entries.findIndex(e => e.id === entryId);
    if (index === -1) return null;

    state.currentIndex = index;
    return this.cloneFlow(state.entries[index].afterState);
  }

  private cloneFlow(flow: LangflowFlow): LangflowFlow {
    return JSON.parse(JSON.stringify(flow));
  }
}