/**
 * Database types matching `supabase/migrations/`.
 *
 * Regenerate after any migration rather than editing by hand:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 *
 * These are checked in so that typechecking and CI do not require database
 * access, and so schema changes show up as a reviewable diff.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** Matches the `goal` check constraint on `profiles`. */
export type ProfileGoal = 'eye_comfort' | 'posture' | 'habit' | 'curiosity';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          baseline_blinks_per_minute: number | null;
          onboarded_at: string | null;
          goal: ProfileGoal | null;
          daily_target_sessions: number;
          default_session_seconds: number;
          show_landmarks: boolean;
          onboarding_step: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          baseline_blinks_per_minute?: number | null;
          onboarded_at?: string | null;
          goal?: ProfileGoal | null;
          daily_target_sessions?: number;
          default_session_seconds?: number;
          show_landmarks?: boolean;
          onboarding_step?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          baseline_blinks_per_minute?: number | null;
          onboarded_at?: string | null;
          goal?: ProfileGoal | null;
          daily_target_sessions?: number;
          default_session_seconds?: number;
          show_landmarks?: boolean;
          onboarding_step?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          blink_count: number;
          blinks_per_minute: number | null;
          mean_blink_duration_ms: number | null;
          mean_yaw: number | null;
          mean_pitch: number | null;
          mean_roll: number | null;
          posture_score: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          blink_count?: number;
          blinks_per_minute?: number | null;
          mean_blink_duration_ms?: number | null;
          mean_yaw?: number | null;
          mean_pitch?: number | null;
          mean_roll?: number | null;
          posture_score?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          started_at?: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          blink_count?: number;
          blinks_per_minute?: number | null;
          mean_blink_duration_ms?: number | null;
          mean_yaw?: number | null;
          mean_pitch?: number | null;
          mean_roll?: number | null;
          posture_score?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
