export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          changed_fields: string[]
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_fields?: string[]
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_fields?: string[]
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          contact_page: string | null
          created_at: string
          created_by: string
          dedupe_key: string | null
          email: string | null
          id: string
          industry: string
          location: string
          name: string
          organization_id: string
          phone: string | null
          social_urls: Json
          source_notes: string | null
          source_observed_at: string
          source_type: string
          source_url: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_page?: string | null
          created_at?: string
          created_by?: string
          dedupe_key?: string | null
          email?: string | null
          id?: string
          industry: string
          location: string
          name: string
          organization_id: string
          phone?: string | null
          social_urls?: Json
          source_notes?: string | null
          source_observed_at?: string
          source_type?: string
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_page?: string | null
          created_at?: string
          created_by?: string
          dedupe_key?: string | null
          email?: string | null
          id?: string
          industry?: string
          location?: string
          name?: string
          organization_id?: string
          phone?: string | null
          social_urls?: Json
          source_notes?: string | null
          source_observed_at?: string
          source_type?: string
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_review_points: {
        Row: {
          confidence: string
          id: string
          last_researched_date: string | null
          observation: string
          organization_id: string
          pillar: string
          recommendation: string
          review_id: string
          source_url: string | null
          verification_status: string
        }
        Insert: {
          confidence?: string
          id?: string
          last_researched_date?: string | null
          observation?: string
          organization_id: string
          pillar: string
          recommendation?: string
          review_id: string
          source_url?: string | null
          verification_status?: string
        }
        Update: {
          confidence?: string
          id?: string
          last_researched_date?: string | null
          observation?: string
          organization_id?: string
          pillar?: string
          recommendation?: string
          review_id?: string
          source_url?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_review_points_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_review_points_organization_id_review_id_fkey"
            columns: ["organization_id", "review_id"]
            isOneToOne: false
            referencedRelation: "growth_reviews"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      growth_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          lead_id: string
          organization_id: string
          revision: number
          suggested_offer: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          organization_id: string
          revision?: number
          suggested_offer?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          organization_id?: string
          revision?: number
          suggested_offer?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_reviews_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          filename: string
          fingerprint: string
          id: string
          label: string
          mapping: Json
          organization_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          filename: string
          fingerprint: string
          id?: string
          label: string
          mapping: Json
          organization_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          filename?: string
          fingerprint?: string
          id?: string
          label?: string
          mapping?: Json
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          duplicate_reason: string | null
          errors: Json
          id: string
          lead_id: string | null
          organization_id: string
          payload: Json | null
          raw_row: Json
          row_number: number
          status: string
        }
        Insert: {
          batch_id: string
          duplicate_reason?: string | null
          errors?: Json
          id?: string
          lead_id?: string | null
          organization_id: string
          payload?: Json | null
          raw_row: Json
          row_number: number
          status: string
        }
        Update: {
          batch_id?: string
          duplicate_reason?: string | null
          errors?: Json
          id?: string
          lead_id?: string | null
          organization_id?: string
          payload?: Json | null
          raw_row?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          lead_id: string
          organization_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          id?: string
          lead_id: string
          organization_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          lead_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      leads: {
        Row: {
          audit_hypothesis_not_verified: string | null
          business_id: string
          created_at: string
          created_by: string
          estimated_value_cents: number | null
          id: string
          next_follow_up: string | null
          organization_id: string
          research_metadata: Json
          research_priority: string | null
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
        }
        Insert: {
          audit_hypothesis_not_verified?: string | null
          business_id: string
          created_at?: string
          created_by?: string
          estimated_value_cents?: number | null
          id?: string
          next_follow_up?: string | null
          organization_id: string
          research_metadata?: Json
          research_priority?: string | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Update: {
          audit_hypothesis_not_verified?: string | null
          business_id?: string
          created_at?: string
          created_by?: string
          estimated_value_cents?: number | null
          id?: string
          next_follow_up?: string | null
          organization_id?: string
          research_metadata?: Json
          research_priority?: string | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_business_id_fkey"
            columns: ["organization_id", "business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      outreach_drafts: {
        Row: {
          call_script: string
          created_at: string
          email_draft: string
          id: string
          lead_id: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          call_script?: string
          created_at?: string
          email_draft?: string
          id?: string
          lead_id: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          call_script?: string
          created_at?: string
          email_draft?: string
          id?: string
          lead_id?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_drafts_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_growth_review: {
        Args: { expected_revision: number; lead: string; org: string }
        Returns: undefined
      }
      commit_prospect_import: {
        Args: { batch: string; org: string }
        Returns: string
      }
      create_organization: {
        Args: { organization_name: string }
        Returns: string
      }
      create_prospect: { Args: { payload: Json }; Returns: string }
      crm_summary: { Args: { org: string }; Returns: Json }
      preview_prospect_import: {
        Args: {
          batch_label: string
          field_mapping: Json
          file_fingerprint: string
          file_name: string
          org: string
          rows: Json
        }
        Returns: string
      }
      prospect_import_summary: {
        Args: { batch?: string; org: string }
        Returns: Json
      }
      save_growth_review: {
        Args: {
          expected_revision: number
          lead: string
          offer: string
          org: string
          points: Json
        }
        Returns: undefined
      }
      save_outreach_draft: {
        Args: {
          email_body: string
          follow_up?: string
          lead: string
          opening_script: string
          org: string
        }
        Returns: undefined
      }
    }
    Enums: {
      pipeline_status:
        | "Discovered"
        | "Researching"
        | "Qualified"
        | "Ready for Outreach"
        | "Contacted"
        | "Replied"
        | "Meeting Scheduled"
        | "Audit Delivered"
        | "Proposal Sent"
        | "Won"
        | "Lost"
        | "Suppressed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      pipeline_status: [
        "Discovered",
        "Researching",
        "Qualified",
        "Ready for Outreach",
        "Contacted",
        "Replied",
        "Meeting Scheduled",
        "Audit Delivered",
        "Proposal Sent",
        "Won",
        "Lost",
        "Suppressed",
      ],
    },
  },
} as const
