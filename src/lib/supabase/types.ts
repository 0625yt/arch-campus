export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Views: Record<string, never>;
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
        };
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>;
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
          page_count: number | null;
          full_text: string | null;
          extracted_keywords: string[] | null;
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
          page_count?: number | null;
          full_text?: string | null;
          extracted_keywords?: string[] | null;
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
