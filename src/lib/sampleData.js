// SAMPLE rows that show the exact shape of each tab while the server-side
// ingest jobs are being wired up. Every table built from this file is
// labelled "SAMPLE" in the UI — never present these as real figures.
// Real data sources:
//   Insider trades  -> SEC EDGAR Form 4 filings (ingest/edgar_ingest.py)
//   Ownership       -> SEC EDGAR 13F-HR filings (ingest/edgar_ingest.py)
//   Short interest  -> FINRA twice-monthly file  (ingest/finra_short.py)
//   Short volume    -> FINRA Reg SHO daily files (ingest/finra_short.py)

export const sampleInsiderTrades = [
  { date: '2026-10-14', insider: 'J. Example', role: 'Chief Financial Officer', type: 'Buy', shares: 12500, price: 214.3, value: 2678750 },
  { date: '2026-10-09', insider: 'M. Example', role: 'Director', type: 'Buy', shares: 4000, price: 209.85, value: 839400 },
  { date: '2026-09-28', insider: 'R. Example', role: 'Chief Executive Officer', type: 'Sell', shares: 30000, price: 221.1, value: 6633000 },
]

export const sampleOwnership = [
  { holder: 'Example Capital Management', shares: 148200000, change: 3200000, pctOut: 0.98, filed: 'Q2 2026' },
  { holder: 'Example Index Advisors', shares: 121500000, change: -1150000, pctOut: 0.8, filed: 'Q2 2026' },
  { holder: 'Example Global Funds', shares: 86400000, change: 5910000, pctOut: 0.57, filed: 'Q2 2026' },
]

export const sampleShortInterest = [
  { settlement: '2026-09-30', shortInterest: 118400000, avgDailyVolume: 51200000, daysToCover: 2.3 },
  { settlement: '2026-09-15', shortInterest: 121900000, avgDailyVolume: 49800000, daysToCover: 2.4 },
  { settlement: '2026-08-31', shortInterest: 115200000, avgDailyVolume: 53400000, daysToCover: 2.2 },
]

export const dataSources = {
  insider: {
    source: 'SEC EDGAR — Form 4 (insider transaction filings)',
    cadence: 'Filed within 2 business days of each trade; ingest polls nightly',
  },
  ownership: {
    source: 'SEC EDGAR — Form 13F-HR (institutions over $100M AUM)',
    cadence: 'Quarterly, filed within 45 days of quarter end',
  },
  short: {
    source: 'FINRA — equity short interest file + Reg SHO daily short volume',
    cadence: 'Short interest: twice monthly (published 7th business day after settlement). Short volume: daily',
  },
}
