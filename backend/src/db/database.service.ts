import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import * as path from 'path';
import { SCHEMA_SQL } from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: Database;

  onModuleInit() {
    const dbPath = process.env.VETO_DB_PATH || path.resolve(process.cwd(), 'veto.sqlite');
    this.logger.log(`Connecting to SQLite database at: ${dbPath}`);

    this.db = new DatabaseConstructor(dbPath);

    // High performance and durability configuration
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');

    // Run schema creation
    this.db.exec(SCHEMA_SQL);
    this.logger.log('Database schema initialized.');
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
      this.logger.log('Database connection closed.');
    }
  }

  /**
   * Returns the raw better-sqlite3 Database instance for repositories.
   */
  get connection(): Database {
    if (!this.db) {
      throw new Error('Database connection is not initialized.');
    }
    return this.db;
  }
}
