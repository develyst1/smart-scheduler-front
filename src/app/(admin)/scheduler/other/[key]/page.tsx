import OtherSeriesContent from "@/components/partials/OtherSeries/OtherSeriesContent";

// REQ-101 / SPEC-088 Part A (TASK-429) — the Manage-plan page of an ECA/Free/KOL series. A calendar sub-page: the
// route guard treats `/scheduler/other/*` as `menu:calendar` (`ROUTE_ALIASES`); the server guards the routes.
export default async function OtherSeriesPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <OtherSeriesContent seriesKey={decodeURIComponent(key)} />;
}
