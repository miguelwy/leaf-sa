import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/common/layout-primitives";
import { PlannedFeature } from "@/components/common/planned-feature";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";

export const metadata: Metadata = { title: "Enablement" };

export default function EnablementPage() {
  return (
    <div className="space-y-6">
      <SetBreadcrumbs items={[{ label: "Enablement" }]} />
      <PageHeader title="Enablement" description="Your personal learning tracker, independent from customer data." />
      <PlannedFeature
        icon={GraduationCap}
        title="Enablement tracker"
        phase="Phase 4"
        summary="Learning paths, courses, certifications and study notes."
        bullets={[
          "Learning paths and categories (e.g. Data Modeling, Atlas Architecture, Search and Vector Search, Pre-sales Skills).",
          "Courses, certifications and technical topics with completion status and deadlines.",
          "Study notes and resource links, with progress tracking on the dashboard.",
        ]}
      />
    </div>
  );
}
