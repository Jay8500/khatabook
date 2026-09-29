import { Injectable, inject } from '@angular/core';
import { Row } from '../types/models';
import { SupabaseService } from './supabase.service';

/** Table access through the crud_* RPCs (via encrypt-rpc); RLS decides what is allowed. */
@Injectable({ providedIn: 'root' })
export class CrudService {
  private readonly supabase = inject(SupabaseService);

  list<T = Row>(table: string, filter: Row = {}, order?: string): Promise<T[]> {
    return this.supabase.callSecureRpc<T[]>('crud_list', {
      p_table: table,
      p_filter: filter,
      p_order: order ?? null,
    });
  }

  upsert<T = Row>(table: string, row: Row): Promise<T> {
    return this.supabase.callSecureRpc<T>('crud_upsert', { p_table: table, p_row: row });
  }

  /** Changes only the given columns of the row with this primary key. */
  update<T = Row>(table: string, id: string, changes: Row): Promise<T> {
    return this.supabase.callSecureRpc<T>('crud_update', {
      p_table: table,
      p_id: id,
      p_changes: changes,
    });
  }

  remove(table: string, id: string): Promise<number> {
    return this.supabase.callSecureRpc<number>('crud_delete', { p_table: table, p_id: id });
  }
}
