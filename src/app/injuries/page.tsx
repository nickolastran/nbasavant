import { NoData } from '@/components/NoData';

export const metadata = { title: 'Injuries' };

export default function InjuriesPage() {
  return (
    <NoData
      title="Injuries"
      blurb="The league-wide report: who is out, doubtful, questionable or probable, and since when."
      source="Injury status is a live feed with no historical archive in the current ingest, and no table for it exists in prisma/schema.prisma yet."
      columns={['Team', 'Player', 'Pos', 'Status', 'Injury', 'Updated']}
    />
  );
}
