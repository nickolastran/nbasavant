import { NoData } from '@/components/NoData';

export const metadata = { title: 'Transactions' };

export default function TransactionsPage() {
  return (
    <NoData
      title="Transactions"
      blurb="Signings, trades, waivers, two-way conversions and G League assignments, newest first."
      source="The ingest in scripts/ingest.ts pulls box scores and season totals from basketball-reference; the transaction log is a separate feed and no table for it exists in prisma/schema.prisma yet."
      columns={['Date', 'Team', 'Type', 'Player', 'Details']}
    />
  );
}
