export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          author_id: string;
          body: string;
          category: Database["public"]["Enums"]["feedback_category"];
          created_at: string;
          edited_at: string | null;
          helpful_at: string | null;
          id: string;
          is_helpful: boolean;
          parent_id: string | null;
          resolved_at: string | null;
          status: Database["public"]["Enums"]["comment_status"];
          time_ms: number | null;
          track_id: string;
          version_id: string | null;
        };
        Insert: {
          author_id?: string;
          body: string;
          category?: Database["public"]["Enums"]["feedback_category"];
          created_at?: string;
          edited_at?: string | null;
          helpful_at?: string | null;
          id?: string;
          is_helpful?: boolean;
          parent_id?: string | null;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["comment_status"];
          time_ms?: number | null;
          track_id: string;
          version_id?: string | null;
        };
        Update: {
          author_id?: string;
          body?: string;
          category?: Database["public"]["Enums"]["feedback_category"];
          created_at?: string;
          edited_at?: string | null;
          helpful_at?: string | null;
          id?: string;
          is_helpful?: boolean;
          parent_id?: string | null;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["comment_status"];
          time_ms?: number | null;
          track_id?: string;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "track_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      email_queue: {
        Row: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          id: number;
          notification_id: string;
          sent_at: string | null;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          id?: never;
          notification_id: string;
          sent_at?: string | null;
          user_id: string;
        };
        Update: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          id?: never;
          notification_id?: string;
          sent_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_queue_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: true;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_queue_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      genres: {
        Row: {
          id: number;
          name: string;
          slug: string;
        };
        Insert: {
          id?: never;
          name: string;
          slug: string;
        };
        Update: {
          id?: never;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      link_hosts: {
        Row: {
          host: string;
        };
        Insert: {
          host: string;
        };
        Update: {
          host?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          action: string | null;
          actor_id: string | null;
          comment_id: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          reason: string | null;
          target: Database["public"]["Enums"]["report_target"] | null;
          track_id: string | null;
          user_id: string;
        };
        Insert: {
          action?: string | null;
          actor_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          reason?: string | null;
          target?: Database["public"]["Enums"]["report_target"] | null;
          track_id?: string | null;
          user_id: string;
        };
        Update: {
          action?: string | null;
          actor_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          reason?: string | null;
          target?: Database["public"]["Enums"]["report_target"] | null;
          track_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_key: string | null;
          avatar_url: string | null;
          banned_at: string | null;
          bio: string;
          created_at: string;
          daw: string;
          display_name: string;
          email_notifications: boolean;
          handle: string;
          id: string;
          links: Json;
          reputation: number;
          role: Database["public"]["Enums"]["user_role"];
          working_on: string;
        };
        Insert: {
          avatar_key?: string | null;
          avatar_url?: string | null;
          banned_at?: string | null;
          bio?: string;
          created_at?: string;
          daw?: string;
          display_name: string;
          email_notifications?: boolean;
          handle: string;
          id: string;
          links?: Json;
          reputation?: number;
          role?: Database["public"]["Enums"]["user_role"];
          working_on?: string;
        };
        Update: {
          avatar_key?: string | null;
          avatar_url?: string | null;
          banned_at?: string | null;
          bio?: string;
          created_at?: string;
          daw?: string;
          display_name?: string;
          email_notifications?: boolean;
          handle?: string;
          id?: string;
          links?: Json;
          reputation?: number;
          role?: Database["public"]["Enums"]["user_role"];
          working_on?: string;
        };
        Relationships: [];
      };
      reactions: {
        Row: {
          created_at: string;
          kind: Database["public"]["Enums"]["reaction_kind"];
          track_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          kind: Database["public"]["Enums"]["reaction_kind"];
          track_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          kind?: Database["public"]["Enums"]["reaction_kind"];
          track_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          comment_id: string | null;
          created_at: string;
          details: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reported_text: string;
          reporter_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
          target_type: Database["public"]["Enums"]["report_target"];
          track_id: string | null;
          version_id: string | null;
        };
        Insert: {
          comment_id?: string | null;
          created_at?: string;
          details?: string;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reported_text?: string;
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_type: Database["public"]["Enums"]["report_target"];
          track_id?: string | null;
          version_id?: string | null;
        };
        Update: {
          comment_id?: string | null;
          created_at?: string;
          details?: string;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reported_text?: string;
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_type?: Database["public"]["Enums"]["report_target"];
          track_id?: string | null;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "track_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      reputation_levels: {
        Row: {
          comments_per_hour: number;
          id: string;
          min_helpful: number;
          name: string;
          reactions_per_hour: number;
          reports_per_day: number;
          tracks_per_day: number;
          tracks_per_week: number;
        };
        Insert: {
          comments_per_hour: number;
          id: string;
          min_helpful: number;
          name: string;
          reactions_per_hour?: number;
          reports_per_day: number;
          tracks_per_day: number;
          tracks_per_week: number;
        };
        Update: {
          comments_per_hour?: number;
          id?: string;
          min_helpful?: number;
          name?: string;
          reactions_per_hour?: number;
          reports_per_day?: number;
          tracks_per_day?: number;
          tracks_per_week?: number;
        };
        Relationships: [];
      };
      reserved_handles: {
        Row: {
          handle: string;
        };
        Insert: {
          handle: string;
        };
        Update: {
          handle?: string;
        };
        Relationships: [];
      };
      track_upload_ips: {
        Row: {
          created_at: string;
          ip: unknown;
          track_id: string;
        };
        Insert: {
          created_at?: string;
          ip: unknown;
          track_id: string;
        };
        Update: {
          created_at?: string;
          ip?: unknown;
          track_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "track_upload_ips_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: true;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      track_versions: {
        Row: {
          audio_key: string;
          created_at: string;
          duration_ms: number;
          id: string;
          loudness: number | null;
          note: string;
          peaks_key: string;
          track_id: string;
          version_no: number;
        };
        Insert: {
          audio_key: string;
          created_at?: string;
          duration_ms: number;
          id?: string;
          loudness?: number | null;
          note?: string;
          peaks_key: string;
          track_id: string;
          version_no: number;
        };
        Update: {
          audio_key?: string;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          loudness?: number | null;
          note?: string;
          peaks_key?: string;
          track_id?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "track_versions_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      tracks: {
        Row: {
          audio_key: string;
          comment_count: number;
          created_at: string;
          description: string;
          duration_ms: number;
          feedback_wants: Database["public"]["Enums"]["feedback_category"][];
          genre_id: number;
          id: string;
          level: Database["public"]["Enums"]["track_level"] | null;
          owner_id: string;
          peaks_key: string;
          play_count: number;
          published_at: string;
          reaction_counts: Json;
          slug: string;
          status: Database["public"]["Enums"]["track_status"];
          tags: string[];
          title: string;
          waveform_color: string | null;
        };
        Insert: {
          audio_key: string;
          comment_count?: number;
          created_at?: string;
          description?: string;
          duration_ms: number;
          feedback_wants?: Database["public"]["Enums"]["feedback_category"][];
          genre_id: number;
          id?: string;
          level?: Database["public"]["Enums"]["track_level"] | null;
          owner_id: string;
          peaks_key: string;
          play_count?: number;
          published_at?: string;
          reaction_counts?: Json;
          slug?: string;
          status?: Database["public"]["Enums"]["track_status"];
          tags?: string[];
          title: string;
          waveform_color?: string | null;
        };
        Update: {
          audio_key?: string;
          comment_count?: number;
          created_at?: string;
          description?: string;
          duration_ms?: number;
          feedback_wants?: Database["public"]["Enums"]["feedback_category"][];
          genre_id?: number;
          id?: string;
          level?: Database["public"]["Enums"]["track_level"] | null;
          owner_id?: string;
          peaks_key?: string;
          play_count?: number;
          published_at?: string;
          reaction_counts?: Json;
          slug?: string;
          status?: Database["public"]["Enums"]["track_status"];
          tags?: string[];
          title?: string;
          waveform_color?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tracks_genre_id_fkey";
            columns: ["genre_id"];
            isOneToOne: false;
            referencedRelation: "genres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      trust_rules: {
        Row: {
          auto_hide_reports: number;
          giver_min_age_days: number;
          helpful_per_giver: number;
          id: boolean;
          reporter_min_age_days: number;
          reporter_min_reputation: number;
        };
        Insert: {
          auto_hide_reports: number;
          giver_min_age_days: number;
          helpful_per_giver: number;
          id?: boolean;
          reporter_min_age_days: number;
          reporter_min_reputation: number;
        };
        Update: {
          auto_hide_reports?: number;
          giver_min_age_days?: number;
          helpful_per_giver?: number;
          id?: boolean;
          reporter_min_age_days?: number;
          reporter_min_reputation?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_resolve_report: {
        Args: {
          p_reason?: string;
          p_report: string;
          p_status: Database["public"]["Enums"]["report_status"];
        };
        Returns: undefined;
      };
      admin_set_banned: {
        Args: { p_banned: boolean; p_user: string };
        Returns: undefined;
      };
      admin_set_comment_status: {
        Args: {
          p_comment: string;
          p_reason?: string;
          p_status: Database["public"]["Enums"]["comment_status"];
        };
        Returns: undefined;
      };
      admin_set_track_status: {
        Args: {
          p_reason?: string;
          p_status: Database["public"]["Enums"]["track_status"];
          p_track: string;
        };
        Returns: undefined;
      };
      admin_stats: {
        Args: never;
        Returns: {
          comments_today: number;
          helpful_today: number;
          live_comments: number;
          live_tracks: number;
          north_star_30d_hits: number;
          north_star_30d_tracks: number;
          north_star_all_hits: number;
          north_star_all_tracks: number;
          open_reports: number;
          reports_today: number;
          tracks_today: number;
          users_today: number;
          users_total: number;
          waiting_tracks: number;
        }[];
      };
      can_upload_avatar: { Args: { p_name: string }; Returns: boolean };
      can_upload_object: {
        Args: { p_extension: string; p_name: string };
        Returns: boolean;
      };
      email_batch: {
        Args: { p_daily_budget?: number; p_limit?: number };
        Returns: {
          email: string;
          items: Json;
          queue_ids: number[];
          total: number;
          user_id: string;
        }[];
      };
      feed_latest: {
        Args: { p_genre?: string; p_page?: number; p_page_size?: number };
        Returns: {
          audio_key: string;
          comment_count: number;
          created_at: string;
          description: string;
          duration_ms: number;
          feedback_wants: Database["public"]["Enums"]["feedback_category"][];
          genre_id: number;
          id: string;
          level: Database["public"]["Enums"]["track_level"] | null;
          owner_id: string;
          peaks_key: string;
          play_count: number;
          published_at: string;
          reaction_counts: Json;
          slug: string;
          status: Database["public"]["Enums"]["track_status"];
          tags: string[];
          title: string;
          waveform_color: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "tracks";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      feed_needs_ears: {
        Args: { p_genre?: string; p_page?: number; p_page_size?: number };
        Returns: {
          audio_key: string;
          comment_count: number;
          created_at: string;
          description: string;
          duration_ms: number;
          feedback_wants: Database["public"]["Enums"]["feedback_category"][];
          genre_id: number;
          id: string;
          level: Database["public"]["Enums"]["track_level"] | null;
          owner_id: string;
          peaks_key: string;
          play_count: number;
          published_at: string;
          reaction_counts: Json;
          slug: string;
          status: Database["public"]["Enums"]["track_status"];
          tags: string[];
          title: string;
          waveform_color: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "tracks";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      feed_trending: {
        Args: { p_genre?: string; p_page?: number; p_page_size?: number };
        Returns: {
          audio_key: string;
          comment_count: number;
          created_at: string;
          description: string;
          duration_ms: number;
          feedback_wants: Database["public"]["Enums"]["feedback_category"][];
          genre_id: number;
          id: string;
          level: Database["public"]["Enums"]["track_level"] | null;
          owner_id: string;
          peaks_key: string;
          play_count: number;
          published_at: string;
          reaction_counts: Json;
          slug: string;
          status: Database["public"]["Enums"]["track_status"];
          tags: string[];
          title: string;
          waveform_color: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "tracks";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      forget_expired_upload_reservations: { Args: never; Returns: undefined };
      is_admin: { Args: never; Returns: boolean };
      mark_emails_failed: { Args: { p_ids: number[] }; Returns: undefined };
      mark_emails_sent: { Args: { p_ids: number[] }; Returns: undefined };
      orphaned_upload_objects: {
        Args: { p_limit?: number };
        Returns: {
          bucket_id: string;
          name: string;
        }[];
      };
      reputation_level: {
        Args: { p_helpful: number };
        Returns: {
          comments_per_hour: number;
          id: string;
          min_helpful: number;
          name: string;
          reactions_per_hour: number;
          reports_per_day: number;
          tracks_per_day: number;
          tracks_per_week: number;
        };
        SetofOptions: {
          from: "*";
          to: "reputation_levels";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reserve_upload: { Args: { p_track?: string }; Returns: string };
      track_under_review: { Args: { p_track: string }; Returns: boolean };
      track_upload_allowance: { Args: never; Returns: number };
    };
    Enums: {
      comment_status: "live" | "hidden" | "deleted";
      feedback_category:
        "mix" | "arrangement" | "vocals" | "sound_design" | "vibe";
      notification_kind: "comment" | "reply" | "helpful" | "moderation";
      reaction_kind: "fire" | "heart" | "eyes" | "headphones";
      report_reason:
        "spam" | "harassment" | "hate" | "copyright" | "ai_generated" | "other";
      report_status: "open" | "resolved" | "dismissed";
      report_target: "track" | "comment";
      track_level: "beginner" | "intermediate" | "advanced";
      track_status: "processing" | "live" | "hidden" | "deleted";
      user_role: "user" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      comment_status: ["live", "hidden", "deleted"],
      feedback_category: [
        "mix",
        "arrangement",
        "vocals",
        "sound_design",
        "vibe",
      ],
      notification_kind: ["comment", "reply", "helpful", "moderation"],
      reaction_kind: ["fire", "heart", "eyes", "headphones"],
      report_reason: [
        "spam",
        "harassment",
        "hate",
        "copyright",
        "ai_generated",
        "other",
      ],
      report_status: ["open", "resolved", "dismissed"],
      report_target: ["track", "comment"],
      track_level: ["beginner", "intermediate", "advanced"],
      track_status: ["processing", "live", "hidden", "deleted"],
      user_role: ["user", "admin"],
    },
  },
} as const;
