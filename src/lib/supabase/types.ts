export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Views: {
      /** 0009: 채점 결과를 펼친 오답 단건 view. RLS는 quiz_attempts에서 상속. */
      wrong_items_v: {
        Row: {
          attempt_id: string;
          owner_id: string;
          quiz_id: string;
          attempted_at: string;
          material_id: string | null;
          course_id: string | null;
          quiz_title: string;
          quiz_difficulty: "쉬움" | "보통" | "어려움";
          question_id: number;
          submitted: string | null;
          correct_answer: string;
          explanation: string;
          evidence: string | null;
          evidence_page: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** 0009: attempt + quiz 한 줄 join view — 다시보기 페이지 단일 select. */
      attempt_summary_v: {
        Row: {
          attempt_id: string;
          owner_id: string;
          quiz_id: string;
          score: number;
          total: number;
          duration_ms: number | null;
          attempted_at: string;
          results: Json;
          answers: Json;
          material_id: string | null;
          course_id: string | null;
          quiz_title: string;
          quiz_difficulty: "쉬움" | "보통" | "어려움";
          questions: Json;
          watermark: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          university: string | null;
          department: string | null;
          year: number | null;
          semester_year: number | null;
          semester_term: "spring" | "fall" | null;
          weak_spots: string[] | null;
          preferred_style: "visual" | "text" | "practice" | null;
          weekly_hours: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          university?: string | null;
          department?: string | null;
          year?: number | null;
          semester_year?: number | null;
          semester_term?: "spring" | "fall" | null;
          weak_spots?: string[] | null;
          preferred_style?: "visual" | "text" | "practice" | null;
          weekly_hours?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          professor: string | null;
          target_grade: "A+" | "A" | "B+" | "B" | null;
          color: string | null;
          archived: boolean;
          schedule: Json | null;
          location: string | null;
          term_start: string | null;
          term_end: string | null;
          /** 0010: semester=정규 강의, personal=자격증·개인 공부 */
          category: "semester" | "personal";
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          professor?: string | null;
          target_grade?: "A+" | "A" | "B+" | "B" | null;
          color?: string | null;
          archived?: boolean;
          schedule?: Json | null;
          location?: string | null;
          term_start?: string | null;
          term_end?: string | null;
          category?: "semester" | "personal";
        };
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          owner_id: string;
          course_id: string | null;
          source_material_id: string | null;
          kind: "exam" | "assignment" | "presentation" | "class" | "etc";
          title: string;
          notes: string | null;
          starts_at: string;
          ends_at: string | null;
          all_day: boolean;
          weight_percent: number | null;
          confidence: number | null;
          confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          course_id?: string | null;
          source_material_id?: string | null;
          kind: Database["public"]["Tables"]["events"]["Row"]["kind"];
          title: string;
          notes?: string | null;
          starts_at: string;
          ends_at?: string | null;
          all_day?: boolean;
          weight_percent?: number | null;
          confidence?: number | null;
          confirmed?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      materials: {
        Row: {
          id: string;
          owner_id: string;
          course_id: string | null;
          title: string;
          type: "lecture" | "assignment" | "exam" | "team" | "syllabus" | "notice";
          original_filename: string | null;
          mime_type: string | null;
          storage_path: string | null;
          original_storage_path: string | null;
          page_count: number | null;
          full_text: string | null;
          extracted_keywords: string[] | null;
          summary_payload: Json | null;
          summary_keywords: string[] | null;
          summary_model_id: string | null;
          last_summarized_at: string | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          course_id?: string | null;
          title: string;
          type: Database["public"]["Tables"]["materials"]["Row"]["type"];
          original_filename?: string | null;
          mime_type?: string | null;
          storage_path?: string | null;
          original_storage_path?: string | null;
          page_count?: number | null;
          full_text?: string | null;
          extracted_keywords?: string[] | null;
          summary_payload?: Json | null;
          summary_keywords?: string[] | null;
          summary_model_id?: string | null;
          last_summarized_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["materials"]["Insert"]>;
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          owner_id: string;
          material_id: string | null;
          tool: string;
          model_id: string;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          cost_usd: number;
          status: "ok" | "rejected" | "error";
          error_message: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          material_id?: string | null;
          tool: string;
          model_id: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          cost_usd?: number;
          status?: "ok" | "rejected" | "error";
          error_message?: string | null;
          payload?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["generations"]["Insert"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          owner_id: string;
          material_id: string | null;
          tool: string;
          status: "pending" | "running" | "done" | "error" | "cancelled";
          input_params: Record<string, unknown>;
          result: Record<string, unknown> | null;
          error_message: string | null;
          model_id: string | null;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          cost_usd: number;
          generation_id: string | null;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          material_id?: string | null;
          tool: string;
          status?: "pending" | "running" | "done" | "error" | "cancelled";
          input_params?: Record<string, unknown>;
          result?: Record<string, unknown> | null;
          error_message?: string | null;
          model_id?: string | null;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          cost_usd?: number;
          generation_id?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
      quizzes: {
        Row: {
          id: string;
          owner_id: string;
          material_id: string | null;
          course_id: string | null;
          title: string;
          difficulty: "쉬움" | "보통" | "어려움";
          question_count: number;
          questions: Json;
          watermark: string;
          model_id: string;
          generation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          material_id?: string | null;
          course_id?: string | null;
          title: string;
          difficulty?: "쉬움" | "보통" | "어려움";
          question_count: number;
          questions: Json;
          watermark: string;
          model_id: string;
          generation_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quizzes"]["Insert"]>;
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          id: string;
          owner_id: string;
          quiz_id: string;
          answers: Json;
          /** 채점 결과 (0009 마이그레이션부터). 그 이전 attempt는 빈 배열. */
          results: Json;
          score: number;
          total: number;
          duration_ms: number | null;
          status: "completed" | "abandoned";
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          quiz_id: string;
          answers: Json;
          results?: Json;
          score: number;
          total: number;
          duration_ms?: number | null;
          status?: "completed" | "abandoned";
        };
        Update: Partial<Database["public"]["Tables"]["quiz_attempts"]["Insert"]>;
        Relationships: [];
      };
    };
  };
}
