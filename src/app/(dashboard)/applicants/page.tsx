import { getApplicants } from "@/actions/applicants";
import { ApplicantsPageClient } from "./applicants-page-client";

export default async function ApplicantsPage() {
  const applicants = await getApplicants();
  return <ApplicantsPageClient applicants={applicants} />;
}
