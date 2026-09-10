import { Award } from "lucide-react";
import { BenefitsCatalog } from "@/components/benefits/catalog-list";

export function Benefits() {
  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-serif text-[#000033] flex items-center gap-3">
            <Award className="h-8 w-8 text-[#C5A059]" />
            Benefits Catalogue
          </h1>
          <p className="text-[#000033]/60 mt-1">
            Manage company-wide benefits — pension, health, life assurance, allowances and more.
          </p>
        </header>

        <BenefitsCatalog />
      </div>
    </div>
  );
}
