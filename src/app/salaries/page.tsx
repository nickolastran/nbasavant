import { NoData } from '@/components/NoData';

export const metadata = { title: 'Salaries' };

export default function SalariesPage() {
  return (
    <NoData
      title="Salaries"
      blurb="Cap sheets by team: every contract, its guaranteed money, option years and the room left under the tax."
      source="Contract data comes from a different source than the statistical feed this site ingests, and no table for it exists in prisma/schema.prisma yet."
      columns={['Team', 'Player', 'Pos', 'This season', 'Years left', 'Total', 'Type']}
    />
  );
}
