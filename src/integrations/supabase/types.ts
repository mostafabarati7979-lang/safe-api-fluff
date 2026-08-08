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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_explanations: {
        Row: {
          created_at: string
          explanation: string
          model: string | null
          question_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          explanation: string
          model?: string | null
          question_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          explanation?: string
          model?: string | null
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_explanations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          api_key: string | null
          cache_enabled: boolean
          id: boolean
          model: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          cache_enabled?: boolean
          id?: boolean
          model?: string
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          cache_enabled?: boolean
          id?: boolean
          model?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attempt_answers: {
        Row: {
          answered_at: string
          attempt_id: string
          id: string
          is_correct: boolean | null
          question_id: string
          score_awarded: number
          selected_option_id: string | null
        }
        Insert: {
          answered_at?: string
          attempt_id: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          score_awarded?: number
          selected_option_id?: string | null
        }
        Update: {
          answered_at?: string
          attempt_id?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          score_awarded?: number
          selected_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
      exam_assignments: {
        Row: {
          assigned_at: string
          candidate_id: string
          exam_id: string
          id: string
        }
        Insert: {
          assigned_at?: string
          candidate_id: string
          exam_id: string
          id?: string
        }
        Update: {
          assigned_at?: string
          candidate_id?: string
          exam_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_assignments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          candidate_id: string
          category_ids: string[] | null
          correct_count: number
          earned_score: number
          exam_id: string
          expires_at: string
          id: string
          incorrect_count: number
          passed: boolean
          started_at: string
          status: string
          submitted_at: string | null
          total_score: number
          unanswered_count: number
        }
        Insert: {
          candidate_id: string
          category_ids?: string[] | null
          correct_count?: number
          earned_score?: number
          exam_id: string
          expires_at: string
          id?: string
          incorrect_count?: number
          passed?: boolean
          started_at?: string
          status?: string
          submitted_at?: string | null
          total_score?: number
          unanswered_count?: number
        }
        Update: {
          candidate_id?: string
          category_ids?: string[] | null
          correct_count?: number
          earned_score?: number
          exam_id?: string
          expires_at?: string
          id?: string
          incorrect_count?: number
          passed?: boolean
          started_at?: string
          status?: string
          submitted_at?: string | null
          total_score?: number
          unanswered_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_categories: {
        Row: {
          category_id: string
          exam_id: string
          id: string
        }
        Insert: {
          category_id: string
          exam_id: string
          id?: string
        }
        Update: {
          category_id?: string
          exam_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_categories_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          display_order: number
          exam_id: string
          id: string
          question_id: string
          score: number
        }
        Insert: {
          display_order?: number
          exam_id: string
          id?: string
          question_id: string
          score?: number
        }
        Update: {
          display_order?: number
          exam_id?: string
          id?: string
          question_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          access_type: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          max_attempts: number
          passing_score: number
          randomize_options: boolean
          randomize_questions: boolean
          show_correct_answers: boolean
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          access_type?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          max_attempts?: number
          passing_score?: number
          randomize_options?: boolean
          randomize_questions?: boolean
          show_correct_answers?: boolean
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          access_type?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          max_attempts?: number
          passing_score?: number
          randomize_options?: boolean
          randomize_questions?: boolean
          show_correct_answers?: boolean
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          mobile: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          mobile?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          mobile?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_options: {
        Row: {
          display_order: number
          id: string
          is_correct: boolean
          option_text: string
          question_id: string
        }
        Insert: {
          display_order?: number
          id?: string
          is_correct?: boolean
          option_text: string
          question_id: string
        }
        Update: {
          display_order?: number
          id?: string
          is_correct?: boolean
          option_text?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_reports: {
        Row: {
          admin_note: string | null
          attempt_id: string | null
          created_at: string
          description: string | null
          exam_id: string | null
          id: string
          question_id: string
          reason: string
          reporter_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          attempt_id?: string | null
          created_at?: string
          description?: string | null
          exam_id?: string | null
          id?: string
          question_id: string
          reason: string
          reporter_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          attempt_id?: string | null
          created_at?: string
          description?: string | null
          exam_id?: string | null
          id?: string
          question_id?: string
          reason?: string
          reporter_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          default_score: number
          difficulty: string
          id: string
          question_text: string
          status: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_score?: number
          difficulty?: string
          id?: string
          question_text: string
          status?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_score?: number
          difficulty?: string
          id?: string
          question_text?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_delivery_logs: {
        Row: {
          created_at: string
          id: string
          mobile_masked: string
          provider_status: number | null
          purpose: string
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          mobile_masked: string
          provider_status?: number | null
          purpose?: string
          success?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          mobile_masked?: string
          provider_status?: number | null
          purpose?: string
          success?: boolean
        }
        Relationships: []
      }
      sms_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          mobile: string
          request_ip: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          mobile: string
          request_ip?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          mobile?: string
          request_ip?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_exam_question: {
        Args: { p_exam_id: string; p_question_id: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      assign_candidates: {
        Args: { p_candidate_ids: string[]; p_exam_id: string }
        Returns: undefined
      }
      claim_first_admin: { Args: never; Returns: undefined }
      delete_category: { Args: { p_id: string }; Returns: undefined }
      delete_exam: { Args: { p_id: string }; Returns: undefined }
      get_attempt_review: { Args: { p_attempt_id: string }; Returns: Json }
      get_attempt_state: { Args: { p_attempt_id: string }; Returns: Json }
      get_exam_topics: {
        Args: { p_exam_id: string }
        Returns: {
          category_id: string
          category_name: string
          question_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_questions: {
        Args: {
          p_category_ids: string[]
          p_exam_id: string
          p_exam_title: string
          p_rows: Json
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      list_question_reports: {
        Args: never
        Returns: {
          admin_note: string
          created_at: string
          description: string
          exam_title: string
          id: string
          question_id: string
          question_text: string
          reason: string
          reporter_email: string
          reporter_name: string
          status: string
        }[]
      }
      log_audit: {
        Args: {
          _action: string
          _details?: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
      remove_exam_question: {
        Args: { p_exam_id: string; p_question_id: string }
        Returns: undefined
      }
      report_question: {
        Args: {
          p_attempt_id?: string
          p_description?: string
          p_exam_id?: string
          p_question_id: string
          p_reason: string
        }
        Returns: string
      }
      save_answer: {
        Args: {
          p_attempt_id: string
          p_option_id: string
          p_question_id: string
        }
        Returns: undefined
      }
      save_exam: {
        Args: {
          p_access_type: string
          p_category_id: string
          p_description: string
          p_duration_minutes: number
          p_id: string
          p_max_attempts: number
          p_passing_score: number
          p_randomize_options: boolean
          p_randomize_questions: boolean
          p_show_correct_answers: boolean
          p_slug: string
          p_status: string
          p_title: string
        }
        Returns: string
      }
      save_question: {
        Args: {
          p_category_id: string
          p_difficulty: string
          p_id: string
          p_options: Json
          p_score: number
          p_status: string
          p_text: string
        }
        Returns: string
      }
      set_exam_categories: {
        Args: { p_category_ids: string[]; p_exam_id: string }
        Returns: undefined
      }
      start_attempt: {
        Args: { p_category_ids?: string[]; p_exam_id: string }
        Returns: string
      }
      submit_attempt: { Args: { p_attempt_id: string }; Returns: Json }
      unassign_candidate: {
        Args: { p_candidate_id: string; p_exam_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "candidate"
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
      app_role: ["admin", "candidate"],
    },
  },
} as const
