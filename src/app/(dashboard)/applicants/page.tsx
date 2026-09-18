import { getApplicants } from "@/actions/applicants";
import { getOrganizations } from "@/actions/organizations";
import { ApplicantsPageClient } from "./applicants-page-client";

export default async function ApplicantsPage() {
  const applicants = await getApplicants();
  const organizations = await getOrganizations();
  return (
    <ApplicantsPageClient
      applicants={applicants}
      organizations={organizations.map((o) => ({ id: o.id, nameJa: o.nameJa }))}
    />
  );
}
