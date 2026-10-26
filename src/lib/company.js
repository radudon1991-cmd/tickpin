// Company information data layer — identity, classification and
// recent filings come through our own serverless relay at
// /api/company, which fetches the SEC EDGAR submissions payload
// server-side (see api/company.js).

const COMPANY_URL = (cik) => `/api/company?cik=${encodeURIComponent(cik)}`

const companyCache = new Map()

export async function fetchCompanyInfo(cik) {
  const key = (cik || '').toString().replace(/\D/g, '')
  if (companyCache.has(key)) return companyCache.get(key)
  const res = await fetch(COMPANY_URL(key))
  if (!res.ok) throw new Error(`Company info fetch failed for CIK ${key}: ${res.status}`)
  const data = await res.json()
  companyCache.set(key, data)
  return data
}
