export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          is_test: boolean
          key: string
          updated_at: string
          value: Json
          visibility: string
        }
        Insert: {
          description?: string | null
          is_test?: boolean
          key: string
          updated_at?: string
          value: Json
          visibility?: string
        }
        Update: {
          description?: string | null
          is_test?: boolean
          key?: string
          updated_at?: string
          value?: Json
          visibility?: string
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          created_at: string
          duration_days: number
          features: Json
          id: string
          is_active: boolean
          is_test: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          duration_days: number
          features?: Json
          id?: string
          is_active?: boolean
          is_test?: boolean
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          duration_days?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_test?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_test: boolean
          name: string
          permissions: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_test?: boolean
          name: string
          permissions?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_test?: boolean
          name?: string
          permissions?: Json
        }
        Relationships: []
      }
      shops: {
        Row: {
          created_at: string
          id: string
          is_test: boolean
          name: string
          owner_user_id: string
          subscription_expires_at: string | null
          subscription_plan_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_test?: boolean
          name: string
          owner_user_id: string
          subscription_expires_at?: string | null
          subscription_plan_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_test?: boolean
          name?: string
          owner_user_id?: string
          subscription_expires_at?: string | null
          subscription_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shops_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reminders: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          is_test: boolean
          message: string
          qty: number | null
          reminder_date: string
          shop_id: string
          stock_id: string
          threshold: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          is_test?: boolean
          message: string
          qty?: number | null
          reminder_date?: string
          shop_id: string
          stock_id: string
          threshold?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          is_test?: boolean
          message?: string
          qty?: number | null
          reminder_date?: string
          shop_id?: string
          stock_id?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reminders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reminders_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      stocks: {
        Row: {
          created_at: string
          id: string
          is_test: boolean
          low_stock_threshold: number | null
          product_name: string
          qty: number
          shop_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_test?: boolean
          low_stock_threshold?: number | null
          product_name: string
          qty?: number
          shop_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_test?: boolean
          low_stock_threshold?: number | null
          product_name?: string
          qty?: number
          shop_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocks_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_test: boolean
          issue_type: string
          shop_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_test?: boolean
          issue_type: string
          shop_id?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_test?: boolean
          issue_type?: string
          shop_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          created_at: string
          id: string
          is_test: boolean
          phone: string | null
          preferences: Json
          role_id: string | null
          shop_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id: string
          is_test?: boolean
          phone?: string | null
          preferences?: Json
          role_id?: string | null
          shop_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_test?: boolean
          phone?: string | null
          preferences?: Json
          role_id?: string | null
          shop_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_profile_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_profile_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_purchases: {
        Row: {
          bill_photo_url: string | null
          created_at: string
          id: string
          is_test: boolean
          items: Json
          purchase_date: string
          scanned_data: Json | null
          shop_id: string
          total_price: number
          vendor_id: string | null
        }
        Insert: {
          bill_photo_url?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          items?: Json
          purchase_date?: string
          scanned_data?: Json | null
          shop_id: string
          total_price?: number
          vendor_id?: string | null
        }
        Update: {
          bill_photo_url?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          items?: Json
          purchase_date?: string
          scanned_data?: Json | null
          shop_id?: string
          total_price?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_purchases_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_purchases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          id: string
          is_test: boolean
          location: string | null
          name: string
          phone: string | null
          shop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_test?: boolean
          location?: string | null
          name: string
          phone?: string | null
          shop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_test?: boolean
          location?: string | null
          name?: string
          phone?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_trusted_write: { Args: never; Returns: undefined }
      can_access_shop: { Args: { p_shop_id: string }; Returns: boolean }
      complete_onboarding: {
        Args: { p_shop_name: string; p_username: string }
        Returns: Json
      }
      crud_assert_table: { Args: { p_table: string }; Returns: undefined }
      crud_columns: { Args: { p_table: string }; Returns: string[] }
      crud_delete: { Args: { p_id: string; p_table: string }; Returns: number }
      crud_list: {
        Args: {
          p_filter?: Json
          p_limit?: number
          p_order?: string
          p_table: string
        }
        Returns: Json
      }
      crud_pk: { Args: { p_table: string }; Returns: string }
      crud_update: {
        Args: { p_changes: Json; p_id: string; p_table: string }
        Returns: Json
      }
      crud_upsert: { Args: { p_row: Json; p_table: string }; Returns: Json }
      current_test_mode: { Args: never; Returns: boolean }
      default_low_stock_threshold: { Args: never; Returns: number }
      end_trusted_write: { Args: never; Returns: undefined }
      generate_stock_reminders: { Args: never; Returns: number }
      get_my_context: { Args: never; Returns: Json }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      is_admin_phone: { Args: { p_phone: string }; Returns: boolean }
      is_trusted_write: { Args: never; Returns: boolean }
      my_shop_ids: { Args: never; Returns: string[] }
      normalize_phone: { Args: { p: string }; Returns: string }
      role_id_by_setting: { Args: { p_setting: string }; Returns: string }
      schedule_stock_reminder_cron: { Args: never; Returns: undefined }
      set_my_preferences: { Args: { p_preferences: Json }; Returns: Json }
      setting: { Args: { p_key: string }; Returns: Json }
      setting_text: { Args: { p_key: string }; Returns: string }
      sync_admin_roles: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
