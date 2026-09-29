import { auth } from "@/lib/auth";
import { getOrganizations } from "@/actions/organizations";
import { Building2 } from "lucide-react";
import { AddOrganizationForm } from "./add-organization-form";
import { OrganizationList } from "./organization-list";

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">顧客名簿（法人）<span className="text-base font-normal text-gray-400 ml-2">／ 所属機関マスター</span></h1>
          <p className="text-gray-500 text-sm mt-1">法人のお客様（受入企業・所属機関を含む）　全 {organizations.length} 件</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AddOrganizationForm />
        </div>

        <div className="lg:col-span-2">
          <OrganizationList organizations={organizations} />
        </div>
      </div>
    </div>
  );
}
