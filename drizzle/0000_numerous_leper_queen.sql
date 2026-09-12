CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'state_transition', 'login', 'login_failed', 'permission_denied', 'export', 'impersonate');--> statement-breakpoint
CREATE TYPE "public"."availability_source" AS ENUM('host', 'rm', 'ops', 'import');--> statement-breakpoint
CREATE TYPE "public"."booking_cancel_reason" AS ENUM('host_unavailable', 'resident_withdrew', 'payment_failed', 'verification_failed', 'duplicate', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_state" AS ENUM('initiated', 'pending_host_confirmation', 'fee_pending', 'confirmed', 'moved_in', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."call_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."call_disposition" AS ENUM('connected', 'no_answer', 'busy', 'invalid_number', 'switched_off', 'call_back_later', 'wrong_person', 'failed');--> statement-breakpoint
CREATE TYPE "public"."consent_actor" AS ENUM('self', 'guardian');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('lead_contact', 'call_recording', 'marketing', 'data_processing', 'partner_sharing');--> statement-breakpoint
CREATE TYPE "public"."consent_state" AS ENUM('granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."dsr_kind" AS ENUM('access', 'correction', 'erasure', 'consent_withdrawal');--> statement-breakpoint
CREATE TYPE "public"."dsr_state" AS ENUM('received', 'verifying_identity', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."fee_basis" AS ENUM('flat', 'percent_of_gbv', 'percent_of_monthly_rent');--> statement-breakpoint
CREATE TYPE "public"."fee_kind" AS ENUM('facilitation_fee', 'renting_commission', 'service_fee', 'access_to_market_fee');--> statement-breakpoint
CREATE TYPE "public"."fee_payer" AS ENUM('resident', 'host');--> statement-breakpoint
CREATE TYPE "public"."gender_policy" AS ENUM('any', 'male_only', 'female_only', 'co_ed_segregated_floors');--> statement-breakpoint
CREATE TYPE "public"."gst_supply_type" AS ENUM('intra_state', 'inter_state', 'export_of_service');--> statement-breakpoint
CREATE TYPE "public"."lead_channel" AS ENUM('organic_search', 'paid_search', 'paid_social', 'organic_social', 'direct', 'referral', 'partner', 'whatsapp', 'click_to_call', 'offline');--> statement-breakpoint
CREATE TYPE "public"."lead_lost_reason" AS ENUM('no_inventory_match', 'budget_too_low', 'unreachable', 'booked_elsewhere', 'plans_changed', 'price_objection', 'location_objection', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_state" AS ENUM('new', 'assigned', 'contacting', 'qualified', 'shortlist_shared', 'negotiating', 'booking_initiated', 'won', 'lost', 'disqualified', 'nurture');--> statement-breakpoint
CREATE TYPE "public"."listing_state" AS ENUM('draft', 'submitted', 'in_verification', 'changes_requested', 'live', 'paused', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'floor_plan');--> statement-breakpoint
CREATE TYPE "public"."media_moderation_state" AS ENUM('pending', 'approved', 'rejected_duplicate', 'rejected_quality', 'rejected_other');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'whatsapp', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_state" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."org_member_role" AS ENUM('owner', 'manager', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('facilitation_fee', 'service_fee');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('created', 'pending', 'authorized', 'captured', 'failed', 'refund_pending', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('pbsa', 'coliving', 'homeshare');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('rm', 'rm_lead', 'ops', 'verifier', 'finance', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."tax_document_type" AS ENUM('tax_invoice', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'safety_critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_state" AS ENUM('open', 'in_progress', 'waiting_on_resident', 'waiting_on_host', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_audience" AS ENUM('resident', 'host', 'staff');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('pending', 'docs_received', 'in_review', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."verification_subject" AS ENUM('organization', 'property');--> statement-breakpoint
CREATE TYPE "public"."verification_tier" AS ENUM('none', 'documents_checked', 'photos_verified', 'onground_audited');--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination" text NOT NULL,
	"channel" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"mfa_satisfied" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_mfa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"totp_secret_encrypted" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"recovery_code_hashes" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_mfa_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "staff_role" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" "user_audience" NOT NULL,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"full_name" text,
	"preferred_locale" text DEFAULT 'en-IN' NOT NULL,
	"date_of_birth" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"anonymised_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"available_count" integer DEFAULT 0 NOT NULL,
	"available_from" timestamp with time zone,
	"source" "availability_source" NOT NULL,
	"confirmed_by" uuid,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"aliases" text[],
	"city" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"location" geometry(point) NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid,
	"kind" "media_kind" DEFAULT 'image' NOT NULL,
	"storage_path" text NOT NULL,
	"alt_text" text,
	"width" integer,
	"height" integer,
	"byte_size" integer,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"moderation_state" "media_moderation_state" DEFAULT 'pending' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"perceptual_hash" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_member_role" DEFAULT 'manager' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text,
	"gstin" text,
	"pan_number" text,
	"contact_email" text,
	"contact_phone" text,
	"commission_rate_bps" integer,
	"verification_tier" "verification_tier" DEFAULT 'none' NOT NULL,
	"verified_at" timestamp with time zone,
	"onboarded_by" uuid,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"property_type" "property_type" NOT NULL,
	"gender_policy" "gender_policy" DEFAULT 'any' NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"locality" text,
	"city" text NOT NULL,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"location" geometry(point),
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"house_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"listing_state" "listing_state" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"verification_tier" "verification_tier" DEFAULT 'none' NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_expires_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "properties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"occupancy" smallint DEFAULT 1 NOT NULL,
	"has_private_bathroom" boolean DEFAULT false NOT NULL,
	"area_sqft" integer,
	"rent_amount_minor" bigint NOT NULL,
	"rent_currency" char(3) DEFAULT 'INR' NOT NULL,
	"deposit_amount_minor" bigint,
	"deposit_currency" char(3),
	"min_tenure_months" smallint DEFAULT 1 NOT NULL,
	"max_tenure_months" smallint,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" "verification_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_tier" "verification_tier" NOT NULL,
	"granted_tier" "verification_tier",
	"state" "verification_state" DEFAULT 'pending' NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_paths" text[],
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_note" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"agent_user_id" uuid,
	"direction" "call_direction" NOT NULL,
	"disposition" "call_disposition",
	"provider_call_id" text,
	"provider" text,
	"masked_number" text,
	"started_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"recording_path" text,
	"recording_consent_captured" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_providerCallId_unique" UNIQUE("provider_call_id")
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"body" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" uuid,
	"contact_name" text,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"phone_verified_at" timestamp with time zone,
	"guardian_name" text,
	"guardian_phone" text,
	"requirement_city" text,
	"requirement_country" text DEFAULT 'IN',
	"budget_max_amount_minor" bigint,
	"budget_currency" char(3),
	"requirement_property_type" "property_type",
	"requirement_occupancy" smallint,
	"requirement_gender_policy" "gender_policy",
	"move_in_date" timestamp with time zone,
	"tenure_months" smallint,
	"institution_id" uuid,
	"requirement_notes" text,
	"channel" "lead_channel" DEFAULT 'direct' NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"gclid" text,
	"fbclid" text,
	"referrer_url" text,
	"landing_page_path" text,
	"partner_id" uuid,
	"state" "lead_state" DEFAULT 'new' NOT NULL,
	"lost_reason" "lead_lost_reason",
	"assigned_to_user_id" uuid,
	"assigned_at" timestamp with time zone,
	"sla_first_call_due_at" timestamp with time zone,
	"first_call_attempted_at" timestamp with time zone,
	"first_call_connected_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"contact_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "shortlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shortlist_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"rm_note" text,
	"quoted_rent_amount_minor" bigint,
	"quoted_rent_currency" char(3),
	"quoted_deposit_amount_minor" bigint,
	"quoted_deposit_currency" char(3),
	"resident_interest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"public_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"message" text,
	"shared_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlists_publicToken_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"lead_id" uuid,
	"resident_user_id" uuid,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid,
	"organization_id" uuid NOT NULL,
	"closed_by_user_id" uuid,
	"state" "booking_state" DEFAULT 'initiated' NOT NULL,
	"cancel_reason" "booking_cancel_reason",
	"move_in_date" timestamp with time zone NOT NULL,
	"tenure_months" smallint NOT NULL,
	"monthly_rent_amount_minor" bigint NOT NULL,
	"monthly_rent_currency" char(3) DEFAULT 'INR' NOT NULL,
	"deposit_amount_minor" bigint,
	"deposit_currency" char(3),
	"gross_value_amount_minor" bigint,
	"gross_value_currency" char(3),
	"facilitation_fee_amount_minor" bigint,
	"facilitation_fee_currency" char(3),
	"facilitation_fee_rule_id" uuid,
	"host_commission_amount_minor" bigint,
	"host_commission_currency" char(3),
	"host_commission_rule_id" uuid,
	"host_confirmation_requested_at" timestamp with time zone,
	"host_confirmed_at" timestamp with time zone,
	"host_confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"moved_in_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "fee_kind" NOT NULL,
	"payer" "fee_payer" NOT NULL,
	"basis" "fee_basis" NOT NULL,
	"flat_amount_minor" bigint,
	"flat_currency" char(3),
	"rate_bps" integer,
	"min_amount_minor" bigint,
	"max_amount_minor" bigint,
	"property_type" "property_type",
	"city" text,
	"organization_id" uuid,
	"priority" smallint DEFAULT 0 NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"tax_rate_bps" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"booking_count" integer DEFAULT 0 NOT NULL,
	"gross_booking_value_minor" bigint,
	"commission_amount_minor" bigint NOT NULL,
	"tax_amount_minor" bigint,
	"total_payable_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"tax_document_id" uuid,
	"issued_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"payer_user_id" uuid,
	"purpose" "payment_purpose" DEFAULT 'facilitation_fee' NOT NULL,
	"state" "payment_state" DEFAULT 'created' NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"gross_currency" char(3) DEFAULT 'INR' NOT NULL,
	"tax_amount_minor" bigint,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"provider_payment_link_id" text,
	"payment_link_url" text,
	"method" text,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"refunded_amount_minor" bigint,
	"refunded_at" timestamp with time zone,
	"provider_refund_id" text,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_providerPaymentId_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "tax_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "tax_document_type" DEFAULT 'tax_invoice' NOT NULL,
	"series" text NOT NULL,
	"financial_year" text NOT NULL,
	"serial_number" integer NOT NULL,
	"document_number" text NOT NULL,
	"booking_id" uuid,
	"payment_id" uuid,
	"revises_document_id" uuid,
	"billed_to_name" text NOT NULL,
	"billed_to_gstin" text,
	"billed_to_address" text,
	"place_of_supply_state_code" text NOT NULL,
	"supply_type" "gst_supply_type" NOT NULL,
	"sac_code" text,
	"taxable_amount_minor" bigint NOT NULL,
	"cgst_amount_minor" bigint,
	"sgst_amount_minor" bigint,
	"igst_amount_minor" bigint,
	"total_amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_documents_documentNumber_unique" UNIQUE("document_number")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"lead_id" uuid,
	"subject_identifier" text,
	"purpose" "consent_purpose" NOT NULL,
	"state" "consent_state" DEFAULT 'granted' NOT NULL,
	"actor" "consent_actor" DEFAULT 'self' NOT NULL,
	"policy_version" text NOT NULL,
	"notice_text" text,
	"ip_address" text,
	"user_agent" text,
	"captured_via" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"subject_identifier" text NOT NULL,
	"kind" "dsr_kind" NOT NULL,
	"state" "dsr_state" DEFAULT 'received' NOT NULL,
	"request_note" text,
	"due_at" timestamp with time zone,
	"handled_by_user_id" uuid,
	"resolution_note" text,
	"completed_at" timestamp with time zone,
	"export_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid,
	"anonymous_id" text,
	"session_id" text,
	"lead_id" uuid,
	"booking_id" uuid,
	"property_id" uuid,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"variables" text[],
	"provider_template_name" text,
	"approval_state" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"template_key" text,
	"channel" "notification_channel" NOT NULL,
	"state" "notification_state" DEFAULT 'queued' NOT NULL,
	"recipient_user_id" uuid,
	"recipient_address" text NOT NULL,
	"lead_id" uuid,
	"booking_id" uuid,
	"rendered_body" text,
	"variables" jsonb,
	"provider" text,
	"provider_message_id" text,
	"provider_status" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"suppression_reason" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"raised_by_user_id" uuid,
	"contact_phone" text,
	"contact_email" text,
	"lead_id" uuid,
	"booking_id" uuid,
	"property_id" uuid,
	"subject" text NOT NULL,
	"body" text,
	"category" text,
	"state" "ticket_state" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"assigned_to_user_id" uuid,
	"respond_by" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_mfa" ADD CONSTRAINT "staff_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_onboarded_by_users_id_fk" FOREIGN KEY ("onboarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resident_user_id_users_id_fk" FOREIGN KEY ("resident_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_facilitation_fee_rule_id_fee_rules_id_fk" FOREIGN KEY ("facilitation_fee_rule_id") REFERENCES "public"."fee_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_commission_rule_id_fee_rules_id_fk" FOREIGN KEY ("host_commission_rule_id") REFERENCES "public"."fee_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("host_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_statements" ADD CONSTRAINT "host_statements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_statements" ADD CONSTRAINT "host_statements_tax_document_id_tax_documents_id_fk" FOREIGN KEY ("tax_document_id") REFERENCES "public"."tax_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_codes_destination_idx" ON "otp_codes" USING btree ("destination","purpose");--> statement-breakpoint
CREATE INDEX "otp_codes_expires_idx" ON "otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_roles_user_role_key" ON "staff_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "staff_roles_user_idx" ON "staff_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone") WHERE "users"."phone" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email") WHERE "users"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_audience_idx" ON "users" USING btree ("audience");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_room_type_key" ON "availability" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "availability_confirmed_idx" ON "availability" USING btree ("last_confirmed_at");--> statement-breakpoint
CREATE INDEX "institutions_city_idx" ON "institutions" USING btree ("city");--> statement-breakpoint
CREATE INDEX "institutions_location_idx" ON "institutions" USING gist ("location");--> statement-breakpoint
CREATE INDEX "media_property_idx" ON "media" USING btree ("property_id","sort_order");--> statement-breakpoint
CREATE INDEX "media_moderation_idx" ON "media" USING btree ("moderation_state");--> statement-breakpoint
CREATE INDEX "media_phash_idx" ON "media" USING btree ("perceptual_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_key" ON "org_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organizations_tier_idx" ON "organizations" USING btree ("verification_tier");--> statement-breakpoint
CREATE INDEX "properties_org_idx" ON "properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "properties_city_idx" ON "properties" USING btree ("city");--> statement-breakpoint
CREATE INDEX "properties_state_idx" ON "properties" USING btree ("listing_state");--> statement-breakpoint
CREATE INDEX "properties_location_idx" ON "properties" USING gist ("location");--> statement-breakpoint
CREATE INDEX "properties_live_city_idx" ON "properties" USING btree ("city","property_type") WHERE "properties"."listing_state" = 'live';--> statement-breakpoint
CREATE INDEX "room_types_property_idx" ON "room_types" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "room_types_rent_idx" ON "room_types" USING btree ("rent_amount_minor");--> statement-breakpoint
CREATE INDEX "verifications_subject_idx" ON "verifications" USING btree ("subject","subject_id");--> statement-breakpoint
CREATE INDEX "verifications_state_idx" ON "verifications" USING btree ("state");--> statement-breakpoint
CREATE INDEX "calls_lead_idx" ON "calls" USING btree ("lead_id","started_at");--> statement-breakpoint
CREATE INDEX "calls_agent_idx" ON "calls" USING btree ("agent_user_id","started_at");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_activities_kind_idx" ON "lead_activities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "leads_state_idx" ON "leads" USING btree ("state");--> statement-breakpoint
CREATE INDEX "leads_assigned_idx" ON "leads" USING btree ("assigned_to_user_id","state");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("contact_phone");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_city_idx" ON "leads" USING btree ("requirement_city");--> statement-breakpoint
CREATE INDEX "leads_sla_open_idx" ON "leads" USING btree ("sla_first_call_due_at") WHERE "leads"."first_call_attempted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "leads_attribution_idx" ON "leads" USING btree ("utm_source","utm_campaign","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_items_unique" ON "shortlist_items" USING btree ("shortlist_id","property_id","room_type_id");--> statement-breakpoint
CREATE INDEX "shortlist_items_shortlist_idx" ON "shortlist_items" USING btree ("shortlist_id","sort_order");--> statement-breakpoint
CREATE INDEX "shortlists_lead_idx" ON "shortlists" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_unique" ON "wishlist_items" USING btree ("user_id","property_id");--> statement-breakpoint
CREATE INDEX "bookings_state_idx" ON "bookings" USING btree ("state");--> statement-breakpoint
CREATE INDEX "bookings_property_idx" ON "bookings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "bookings_org_idx" ON "bookings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bookings_lead_idx" ON "bookings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bookings_closed_by_idx" ON "bookings" USING btree ("closed_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "fee_rules_lookup_idx" ON "fee_rules" USING btree ("kind","priority");--> statement-breakpoint
CREATE INDEX "fee_rules_org_idx" ON "fee_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fee_rules_active_idx" ON "fee_rules" USING btree ("kind","effective_from") WHERE "fee_rules"."effective_to" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "host_statements_period_key" ON "host_statements" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "host_statements_org_idx" ON "host_statements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_state_idx" ON "payments" USING btree ("state");--> statement-breakpoint
CREATE INDEX "payments_paid_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_documents_serial_key" ON "tax_documents" USING btree ("series","financial_year","serial_number");--> statement-breakpoint
CREATE INDEX "tax_documents_booking_idx" ON "tax_documents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "tax_documents_issued_idx" ON "tax_documents" USING btree ("issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_key" ON "webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_unprocessed_idx" ON "webhook_events" USING btree ("received_at") WHERE "webhook_events"."processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_request_idx" ON "audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "consents_user_purpose_idx" ON "consents" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "consents_subject_idx" ON "consents" USING btree ("subject_identifier","purpose");--> statement-breakpoint
CREATE INDEX "consents_lead_idx" ON "consents" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "dsr_state_idx" ON "data_subject_requests" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "dsr_subject_idx" ON "data_subject_requests" USING btree ("subject_identifier");--> statement-breakpoint
CREATE INDEX "events_name_occurred_idx" ON "events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "events_lead_idx" ON "events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "events_booking_idx" ON "events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "events_attribution_idx" ON "events" USING btree ("utm_source","utm_campaign","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_templates_key_key" ON "notification_templates" USING btree ("key","channel","locale");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_user_id","queued_at");--> statement-breakpoint
CREATE INDEX "notifications_lead_idx" ON "notifications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "notifications_state_idx" ON "notifications" USING btree ("state","queued_at");--> statement-breakpoint
CREATE INDEX "notifications_provider_msg_idx" ON "notifications" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "support_tickets_state_idx" ON "support_tickets" USING btree ("state","priority");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_idx" ON "support_tickets" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_safety_open_idx" ON "support_tickets" USING btree ("respond_by") WHERE "support_tickets"."priority" = 'safety_critical' AND "support_tickets"."first_responded_at" IS NULL;