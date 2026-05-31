import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  pgEnum,
  varchar,
  date,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["applicant", "hr_manager", "expert", "admin"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "draft", "documents_requested", "documents_collecting", "ocr_processing",
  "questionnaire_sent", "under_review", "approved", "submitted", "completed", "rejected", "cancelled",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "not_submitted", "submitted", "approved", "resubmit_required",
]);

export const applicationTypeEnum = pgEnum("application_type", [
  "certification", "change", "renewal", "permanent_residence", "reentry",
]);

export const applicantDocumentTypeEnum = pgEnum("applicant_document_type", [
  "passport_front", "passport_data_page", "residence_card_front", "residence_card_back",
]);

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("applicant"),
  tenantId: uuid("tenant_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  contactEmail: text("contact_email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Organization master ───────────────────────────────────────────────────────
export const organizationMaster = pgTable("organization_master", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  corporateNumber: varchar("corporate_number", { length: 13 }),
  nameJa: text("name_ja").notNull(),
  nameEn: text("name_en"),
  postalCode: varchar("postal_code", { length: 8 }),
  prefecture: text("prefecture"),
  city: text("city"),
  addressLine: text("address_line"),
  phone: text("phone"),
  capital: real("capital"),              // 資本金（円）
  annualSales: real("annual_sales"),     // 年間売上金額（円）
  employeeCount: integer("employee_count"), // 常勤職員数
  fiscalYearEnd: text("fiscal_year_end"),
  category: text("category"),
  industry: text("industry"),
  // ── 追加フィールド ────────────────────────────────────────────────────────
  workersAccidentInsuranceNo: text("workers_accident_insurance_no"),  // 労働災害保険番号
  employmentInsuranceNo: text("employment_insurance_no"),              // 雇用保険事業者番号
  representativeTitle: text("representative_title"),                   // 代表者役職
  representativeName: text("representative_name"),                     // 代表者氏名
  email: text("email"),                                                // メールアドレス
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Applicant master ──────────────────────────────────────────────────────────
export const applicantMaster = pgTable("applicant_master", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").references(() => users.id),
  familyNameEn: text("family_name_en").notNull(),
  givenNameEn: text("given_name_en").notNull(),
  familyNameJa: text("family_name_ja"),
  givenNameJa: text("given_name_ja"),
  gender: text("gender"),
  dateOfBirth: date("date_of_birth"),
  nationality: text("nationality").notNull(),
  passportNumber: text("passport_number"),
  passportExpiry: date("passport_expiry"),
  residenceCardNumber: text("residence_card_number"),
  currentVisaType: text("current_visa_type"),
  currentVisaExpiry: date("current_visa_expiry"),
  phone: text("phone"),
  emailAddress: text("email_address"),
  postalCode: text("postal_code"),
  japanPrefecture: text("japan_prefecture"),
  japanCity: text("japan_city"),
  japanAddressLine: text("japan_address_line"),
  japanAddress: text("japan_address"),   // 後方互換用（prefecture+city+addressLine の結合値）
  educationHistory: jsonb("education_history"),
  workHistory: jsonb("work_history"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Applications ─────────────────────────────────────────────────────────────
export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  applicantId: uuid("applicant_id").notNull().references(() => applicantMaster.id),
  organizationId: uuid("organization_id").references(() => organizationMaster.id),
  applicationType: applicationTypeEnum("application_type").notNull(),
  visaType: text("visa_type").notNull(),
  status: applicationStatusEnum("status").notNull().default("draft"),
  caseNumber: text("case_number").unique(),
  expertUserId: uuid("expert_user_id").references(() => users.id),
  hrUserId: uuid("hr_user_id").references(() => users.id),
  draftData: jsonb("draft_data"),
  formData: jsonb("form_data"),
  ocrData: jsonb("ocr_data"),
  consistencyCheckResult: jsonb("consistency_check_result"),
  isApproved: boolean("is_approved").notNull().default(false),
  approvedAt: timestamp("approved_at"),
  approvedBy: uuid("approved_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Application snapshots ────────────────────────────────────────────────────
export const applicationSnapshots = pgTable("application_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  snapshotType: text("snapshot_type").notNull(),
  snapshotData: jsonb("snapshot_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Document requirement master ──────────────────────────────────────────────
export const documentRequirementMaster = pgTable("document_requirement_master", {
  id: uuid("id").defaultRandom().primaryKey(),
  visaType: text("visa_type").notNull(),
  applicationType: text("application_type").notNull(),
  documentName: text("document_name").notNull(),
  documentNameEn: text("document_name_en"),
  description: text("description"),
  isAlwaysRequired: boolean("is_always_required").notNull().default(false),
  conditions: jsonb("conditions"),
  pdfMappingCoordinates: jsonb("pdf_mapping_coordinates"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Application document checklist ───────────────────────────────────────────
export const applicationDocumentChecklist = pgTable("application_document_checklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  documentRequirementId: uuid("document_requirement_id").references(() => documentRequirementMaster.id),
  documentName: text("document_name").notNull(),
  isRequiredByExpert: boolean("is_required_by_expert").notNull().default(false),
  status: documentStatusEnum("status").notNull().default("not_submitted"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  ocrExtractedData: jsonb("ocr_extracted_data"),
  expertNotes: text("expert_notes"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Questionnaire ────────────────────────────────────────────────────────────
export const questionnaireQuestions = pgTable("questionnaire_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  fieldKey: text("field_key").notNull(),
  questionJa: text("question_ja").notNull(),
  questionEn: text("question_en"),
  questionNative: text("question_native"),
  nativeLanguage: text("native_language"),
  answerType: text("answer_type").notNull(),
  options: jsonb("options"),
  answer: text("answer"),
  answeredAt: timestamp("answered_at"),
  isRequired: boolean("is_required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Audit log ────────────────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  applicationId: uuid("application_id").references(() => applications.id),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  fieldKey: text("field_key"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── PDF field mapping ────────────────────────────────────────────────────────
export const pdfFieldMapping = pgTable("pdf_field_mapping", {
  id: uuid("id").defaultRandom().primaryKey(),
  visaType: text("visa_type").notNull(),
  applicationType: text("application_type").notNull(),
  formVersion: text("form_version").notNull(),
  fieldKey: text("field_key").notNull(),
  pageNumber: integer("page_number").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width"),
  height: real("height"),
  fieldType: text("field_type").notNull(),
  maxLength: integer("max_length"),
  fontSize: real("font_size"),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Applicant documents ──────────────────────────────────────────────────────
export const applicantDocuments = pgTable("applicant_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicantId: uuid("applicant_id").references(() => applicantMaster.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  documentType: applicantDocumentTypeEnum("document_type").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  ocrExtractedData: jsonb("ocr_extracted_data"),
  ocrProcessedAt: timestamp("ocr_processed_at"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  applications: many(applications),
}));

export const applicantMasterRelations = relations(applicantMaster, ({ one, many }) => ({
  tenant: one(tenants, { fields: [applicantMaster.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [applicantMaster.userId], references: [users.id] }),
  applications: many(applications),
  documents: many(applicantDocuments),
}));

export const applicantDocumentsRelations = relations(applicantDocuments, ({ one }) => ({
  applicant: one(applicantMaster, { fields: [applicantDocuments.applicantId], references: [applicantMaster.id] }),
  tenant: one(tenants, { fields: [applicantDocuments.tenantId], references: [tenants.id] }),
}));

export const organizationMasterRelations = relations(organizationMaster, ({ one, many }) => ({
  tenant: one(tenants, { fields: [organizationMaster.tenantId], references: [tenants.id] }),
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  tenant: one(tenants, { fields: [applications.tenantId], references: [tenants.id] }),
  applicant: one(applicantMaster, { fields: [applications.applicantId], references: [applicantMaster.id] }),
  organization: one(organizationMaster, { fields: [applications.organizationId], references: [organizationMaster.id] }),
  expert: one(users, { fields: [applications.expertUserId], references: [users.id] }),
  snapshots: many(applicationSnapshots),
  documentChecklist: many(applicationDocumentChecklist),
  questionnaire: many(questionnaireQuestions),
  auditLogs: many(auditLog),
}));

export const applicationDocumentChecklistRelations = relations(applicationDocumentChecklist, ({ one }) => ({
  application: one(applications, { fields: [applicationDocumentChecklist.applicationId], references: [applications.id] }),
  documentRequirement: one(documentRequirementMaster, {
    fields: [applicationDocumentChecklist.documentRequirementId],
    references: [documentRequirementMaster.id],
  }),
}));
