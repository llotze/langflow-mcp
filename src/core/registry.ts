/* DEPRECATED */

import Database from 'better-sqlite3';
import { LangflowComponent, ComponentSearchQuery } from '../types.js'; 

export class ComponentRegistry {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT,
        description TEXT,
        category TEXT,
        subcategory TEXT,
        
        -- Template and metadata
        template_schema TEXT,
        parameters_schema TEXT,
        base_classes TEXT,
        
        -- Input/Output
        input_types TEXT,
        output_types TEXT,
        field_order TEXT,
        
        -- Flags
        tool_mode BOOLEAN DEFAULT 0,
        legacy BOOLEAN DEFAULT 0,
        beta BOOLEAN DEFAULT 0,
        frozen BOOLEAN DEFAULT 0,
        
        -- Documentation
        documentation_link TEXT,
        documentation_content TEXT,
        
        -- UI
        icon TEXT,
        
        -- Search
        search_text TEXT,
        
        -- Timestamps
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
      CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);
      CREATE INDEX IF NOT EXISTS idx_components_tool_mode ON components(tool_mode);
      CREATE INDEX IF NOT EXISTS idx_components_legacy ON components(legacy);
      CREATE INDEX IF NOT EXISTS idx_components_search ON components(search_text);
    `);
  }

  /**
   * Register a component in the database
   */
  public async registerComponent(component: LangflowComponent, docs?: string): Promise<void> {
    const searchText = `${component.name} ${component.display_name} ${component.description} ${component.category}`.toLowerCase();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO components (
        name, display_name, description, category, subcategory,
        parameters_schema, base_classes, input_types, output_types, field_order,
        tool_mode, legacy, beta, frozen,
        documentation_link, documentation_content, icon, search_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      component.name,
      component.display_name,
      component.description,
      component.category,
      component.subcategory || null,
      JSON.stringify(component.parameters),
      JSON.stringify(component.base_classes || []),
      JSON.stringify(component.input_types || []),
      JSON.stringify(component.output_types || []),
      JSON.stringify(component.field_order || []),
      component.tool_mode ? 1 : 0,
      component.legacy ? 1 : 0,
      component.beta ? 1 : 0,
      component.frozen ? 1 : 0,
      component.documentation_link || null,
      docs || null,
      component.icon || null,
      searchText
    );
  }

  /**
   * Get all components
   */
  public getAllComponents(): LangflowComponent[] {
    const stmt = this.db.prepare('SELECT * FROM components ORDER BY category, name');
    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToComponent(row));
  }

  /**
   * Search components
   */
  public searchComponents(query: ComponentSearchQuery): LangflowComponent[] {
    let sql = 'SELECT * FROM components WHERE 1=1';
    const params: any[] = [];

    // Add filters
    if (query.category) {
      sql += ' AND category = ?';
      params.push(query.category);
    }

    if (query.tool_mode !== undefined) {
      sql += ' AND tool_mode = ?';
      params.push(query.tool_mode ? 1 : 0);
    }

    if (query.legacy !== undefined) {
      sql += ' AND legacy = ?';
      params.push(query.legacy ? 1 : 0);
    }

    // Add text search using LIKE (simpler than FTS5)
    if (query.query) {
      sql += ' AND search_text LIKE ?';
      params.push(`%${query.query.toLowerCase()}%`);
    }

    sql += ' ORDER BY category, name';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.rowToComponent(row));
  }

  /**
   * Get a component by name
   */
  public getComponent(name: string): LangflowComponent | null {
    const stmt = this.db.prepare('SELECT * FROM components WHERE name = ?');
    const row = stmt.get(name) as any;
    return row ? this.rowToComponent(row) : null;
  }

  /**
   * Get component documentation
   */
  public getComponentDocs(name: string): string | null {
    const stmt = this.db.prepare('SELECT documentation_content FROM components WHERE name = ?');
    const row = stmt.get(name) as any;
    return row?.documentation_content || null;
  }

  /**
   * Get all categories
   */
  public getCategories(): string[] {
    const stmt = this.db.prepare('SELECT DISTINCT category FROM components ORDER BY category');
    const rows = stmt.all() as any[];
    return rows.map(row => row.category);
  }

  /**
   * Convert database row to component
   */
  private rowToComponent(row: any): LangflowComponent {
    return {
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory,
      parameters: JSON.parse(row.parameters_schema || '[]'),
      input_types: JSON.parse(row.input_types || '[]'),
      output_types: JSON.parse(row.output_types || '[]'),
      tool_mode: row.tool_mode === 1,
      legacy: row.legacy === 1,
      beta: row.beta === 1,
      documentation_link: row.documentation_link,
      icon: row.icon,
      base_classes: JSON.parse(row.base_classes || '[]'),
      frozen: row.frozen === 1,
      field_order: JSON.parse(row.field_order || '[]'),
    };
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }
}
