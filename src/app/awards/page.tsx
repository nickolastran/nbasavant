import { NoData } from '@/components/NoData';

export const metadata = { title: 'Awards' };

export default function AwardsPage() {
  return (
    <NoData
      title="Awards"
      blurb="MVP, Defensive Player of the Year, Rookie of the Year, Sixth Man, Most Improved and the All-NBA teams, with vote shares."
      source="Award voting is published separately from the box scores this site ingests, and no table for it exists in prisma/schema.prisma yet. In the meantime, Stat Leaders shows who the ballots would be arguing about."
      columns={['Season', 'Award', 'Winner', 'Team', 'Share', 'Runner-up']}
    />
  );
}
