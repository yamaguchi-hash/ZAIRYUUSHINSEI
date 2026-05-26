CREATE TYPE "public"."applicant_document_type" AS ENUM('passport_front', 'passport_data_page', 'residence_card_front', 'residence_card_back');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'documents_requested', 'documents_collecting', 'ocr_processing', 'questionnaire_sent', 'under_review', 'approved', 'submitted', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."application_type" AS ENUM('certification', 'change', 'renewal', 'permanent_residence', 'reentry');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('not_submitted', 'submitted', 'approved', 'resubmit_required');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('applicant', 'hr_manager', 'expert', 'admin');--> statement-breakpoint
CREATE TABLE "applicant_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_type" "applicant_document_type" NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"ocr_extracted_data" jsonb,
	"ocr_processed_at" timestamp,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applicant_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"family_name_en" text NOT NULL,
	"given_name_en" text NOT NULL,
	"family_name_ja" text,
	"given_name_ja" text,
	"gender" text,
	"date_of_birth" date,
	"nationality" text NOT NULL,
	"passport_number" text,
	"passport_expiry" date,
	"residence_card_number" text,
	"current_visa_type" text,
	"current_visa_expiry" date,
	"phone" text,
	"email_address" text,
	"japan_address" text,
	"education_history" jsonb,
	"work_history" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_document_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"document_requirement_id" uuid,
	"document_name" text NOT NULL,
	"is_required_by_expert" boolean DEFAULT false NOT NULL,
	"status" "document_status" DEFAULT 'not_submitted' NOT NULL,
	"file_url" text,
	"file_name" text,
	"file_size" integer,
	"mime_type" text,
	"ocr_extracted_data" jsonb,
	"expert_notes" text,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"snapshot_type" text NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"organization_id" uuid,
	"application_type" "application_type" NOT NULL,
	"visa_type" text NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"case_number" text,
	"expert_user_id" uuid,
	"hr_user_id" uuid,
	"draft_data" jsonb,
	"ocr_data" jsonb,
	"consistency_check_result" jsonb,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp,
	"approved_by" uuid,
	"submitted_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applications_case_number_unique" UNIQUE("case_number")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"field_key" text,
	"old_value" text,
	"new_value" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requirement_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visa_type" text NOT NULL,
	"application_type" text NOT NULL,
	"document_name" text NOT NULL,
	"document_name_en" text,
	"description" text,
	"is_always_required" boolean DEFAULT false NOT NULL,
	"conditions" jsonb,
	"pdf_mapping_coordinates" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"corporate_number" varchar(13),
	"name_ja" text NOT NULL,
	"name_en" text,
	"postal_code" varchar(8),
	"prefecture" text,
	"city" text,
	"address_line" text,
	"phone" text,
	"capital" real,
	"employee_count" integer,
	"fiscal_year_end" text,
	"category" text,
	"industry" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_field_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visa_type" text NOT NULL,
	"application_type" text NOT NULL,
	"form_version" text NOT NULL,
	"field_key" text NOT NULL,
	"page_number" integer NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real,
	"height" real,
	"field_type" text NOT NULL,
	"max_length" integer,
	"font_size" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"question_ja" text NOT NULL,
	"question_en" text,
	"question_native" text,
	"native_language" text,
	"answer_type" text NOT NULL,
	"options" jsonb,
	"answer" text,
	"answered_at" timestamp,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact_email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text,
	"role" "user_role" DEFAULT 'applicant' NOT NULL,
	"tenant_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "applicant_documents" ADD CONSTRAINT "applicant_documents_applicant_id_applicant_master_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_documents" ADD CONSTRAINT "applicant_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_master" ADD CONSTRAINT "applicant_master_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_master" ADD CONSTRAINT "applicant_master_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_checklist" ADD CONSTRAINT "application_document_checklist_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_checklist" ADD CONSTRAINT "application_document_checklist_document_requirement_id_document_requirement_master_id_fk" FOREIGN KEY ("document_requirement_id") REFERENCES "public"."document_requirement_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_checklist" ADD CONSTRAINT "application_document_checklist_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_snapshots" ADD CONSTRAINT "application_snapshots_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_applicant_master_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_organization_master_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_expert_user_id_users_id_fk" FOREIGN KEY ("expert_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_hr_user_id_users_id_fk" FOREIGN KEY ("hr_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_master" ADD CONSTRAINT "organization_master_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;