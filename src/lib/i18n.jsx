import { createContext, useContext, useEffect, useState } from 'react'

// TickPin interface strings. Only interface chrome lives here — source
// data (ticker symbols, company names, holder names, news headlines,
// numbers, dates, prices) is never translated.
//
// Professional financial Thai, neutral register, no gendered
// particles (this is product UI, not personal speech).

const STRINGS = {
  // ---- nav / chrome -------------------------------------------------
  'nav.tagline': {
    en: 'market data from primary sources',
    th: 'ข้อมูลตลาดจากแหล่งข้อมูลปฐมภูมิ',
  },
  'nav.dashboard': { en: 'Dashboard', th: 'แดชบอร์ด' },
  'nav.backToSite': { en: 'Back to site', th: 'กลับสู่เว็บไซต์' },
  'nav.admin': { en: 'Admin', th: 'ผู้ดูแลระบบ' },
  'nav.logout': { en: 'Log out', th: 'ออกจากระบบ' },
  'nav.login': { en: 'Log in', th: 'เข้าสู่ระบบ' },
  'nav.signup': { en: 'Sign up', th: 'สมัครสมาชิก' },
  'nav.heroTitle': {
    en: 'Every number, straight from the filing.',
    th: 'ทุกตัวเลข ตรงจากเอกสารที่ยื่นจริง',
  },
  'nav.lede': {
    en: 'Institutional ownership, insider trades, short interest and financials — rebuilt from SEC EDGAR and FINRA primary data. No scraping, no copied scores.',
    th: 'การถือครองของสถาบัน การซื้อขายของคนวงใน ชอร์ตอินเทอเรสต์ และงบการเงิน — สร้างขึ้นใหม่จากข้อมูลปฐมภูมิของ SEC EDGAR และ FINRA ไม่มีการดึงข้อมูลจากเว็บอื่น ไม่มีคะแนนที่ลอกมา',
  },
  'nav.searchPlaceholder': {
    en: 'Search by ticker or company name… (e.g. AAPL)',
    th: 'ค้นหาด้วยสัญลักษณ์หุ้นหรือชื่อบริษัท… (เช่น AAPL)',
  },
  'nav.searchLoading': {
    en: 'Loading SEC ticker list…',
    th: 'กำลังโหลดรายชื่อหุ้นของ SEC…',
  },
  'nav.searchAria': { en: 'Search tickers', th: 'ค้นหาหุ้น' },
  'nav.tickersError': {
    en: 'Ticker list failed to load: {error}',
    th: 'โหลดรายชื่อหุ้นไม่สำเร็จ: {error}',
  },
  'nav.yourWatchlist': { en: 'Your watchlist:', th: 'รายการเฝ้าดูของคุณ:' },
  'nav.starterWatchlist': { en: 'Starter watchlist:', th: 'รายการเฝ้าดูเริ่มต้น:' },
  'nav.watching': { en: '★ Watching', th: '★ กำลังเฝ้าดู' },
  'nav.watch': { en: '☆ Watch', th: '☆ เฝ้าดู' },
  'nav.footer': {
    en: 'Data: SEC EDGAR & FINRA public files. Not investment advice. Short interest figures are snapshots as of their settlement dates, never live values.',
    th: 'ข้อมูล: เอกสารสาธารณะจาก SEC EDGAR และ FINRA ไม่ใช่คำแนะนำการลงทุน ตัวเลขชอร์ตอินเทอเรสต์เป็นข้อมูล ณ วันที่ชำระราคา ไม่ใช่ค่าแบบเรียลไทม์',
  },
  'common.source': { en: 'Source:', th: 'แหล่งข้อมูล:' },
  'common.cadence': { en: 'Cadence:', th: 'รอบการอัปเดต:' },
  'common.sampleBadge': {
    en: 'SAMPLE — ingest pending',
    th: 'ข้อมูลตัวอย่าง — รอการนำเข้าข้อมูลจริง',
  },

  // ---- tabs ----------------------------------------------------------
  'tabs.overview': { en: 'Overview', th: 'ภาพรวม' },
  'tabs.info': { en: 'Info', th: 'ข้อมูลบริษัท' },
  'tabs.insider': { en: 'Insider Trades', th: 'การซื้อขายของคนวงใน' },
  'tabs.ownership': { en: 'Institutional Ownership', th: 'การถือครองของสถาบัน' },
  'tabs.short': { en: 'Short Interest', th: 'ชอร์ตอินเทอเรสต์' },
  'tabs.smc': { en: 'SMC Analysis', th: 'การวิเคราะห์ SMC' },
  'tabs.news': { en: 'News', th: 'ข่าว' },

  // ---- source notes (per tab) ----------------------------------------
  'source.insiderText': {
    en: 'SEC EDGAR — Form 4 (insider transaction filings)',
    th: 'SEC EDGAR — แบบฟอร์ม 4 (เอกสารรายงานการซื้อขายของคนวงใน)',
  },
  'source.insiderCadence': {
    en: 'Filed within 2 business days of each trade; ingest polls nightly',
    th: 'ยื่นภายใน 2 วันทำการหลังการซื้อขายแต่ละครั้ง ระบบนำเข้าข้อมูลตรวจสอบทุกคืน',
  },
  'source.ownershipText': {
    en: 'SEC EDGAR — Form 13F-HR (institutions over $100M AUM)',
    th: 'SEC EDGAR — แบบฟอร์ม 13F-HR (สถาบันที่มีสินทรัพย์ภายใต้การบริหารเกิน 100 ล้านดอลลาร์)',
  },
  'source.ownershipCadence': {
    en: 'Quarterly, filed within 45 days of quarter end',
    th: 'รายไตรมาส ยื่นภายใน 45 วันหลังสิ้นไตรมาส',
  },
  'source.shortText': {
    en: 'FINRA — equity short interest file + Reg SHO daily short volume',
    th: 'FINRA — ไฟล์ชอร์ตอินเทอเรสต์ของหุ้น + ปริมาณการขายชอร์ตรายวันตาม Reg SHO',
  },
  'source.shortCadence': {
    en: 'Short interest: twice monthly (published 7th business day after settlement). Short volume: daily',
    th: 'ชอร์ตอินเทอเรสต์: เดือนละสองครั้ง (เผยแพร่ในวันทำการที่ 7 หลังวันที่ชำระราคา) ปริมาณการขายชอร์ต: รายวัน',
  },

  // ---- overview --------------------------------------------------------
  'overview.loading': {
    en: 'Loading live financials from SEC EDGAR…',
    th: 'กำลังโหลดข้อมูลงบการเงินแบบเรียลไทม์จาก SEC EDGAR…',
  },
  'overview.error': {
    en: 'Live financials could not be loaded from EDGAR just now. The nightly ingest job will cache these in our database so this page never depends on a live call.',
    th: 'ไม่สามารถโหลดข้อมูลงบการเงินจาก EDGAR ได้ในขณะนี้ ระบบนำเข้าข้อมูลรายคืนจะจัดเก็บข้อมูลเหล่านี้ไว้ในฐานข้อมูลของเรา เพื่อให้หน้านี้ไม่ต้องพึ่งการเรียกข้อมูลแบบเรียลไทม์',
  },
  'overview.revenue': { en: 'Revenue (latest period)', th: 'รายได้ (งวดล่าสุด)' },
  'overview.netIncome': { en: 'Net income (latest period)', th: 'กำไรสุทธิ (งวดล่าสุด)' },
  'overview.totalAssets': { en: 'Total assets', th: 'สินทรัพย์รวม' },
  'overview.cash': { en: 'Cash & equivalents', th: 'เงินสดและรายการเทียบเท่าเงินสด' },
  'overview.sharesOutstanding': {
    en: 'Shares outstanding',
    th: 'จำนวนหุ้นที่ออกจำหน่ายแล้ว',
  },
  'overview.periodEnding': {
    en: 'period ending {end} · filed {filed}',
    th: 'งวดสิ้นสุด {end} · ยื่นเมื่อ {filed}',
  },
  'overview.notReported': { en: 'not reported', th: 'ไม่มีรายงาน' },
  'overview.sourceNote': {
    en: 'SEC EDGAR XBRL companyfacts for {name}. Values deduped by period end, keeping the most recently filed figure.',
    th: 'ข้อมูล XBRL companyfacts จาก SEC EDGAR ของ {name} ค่าที่ซ้ำกันตามวันสิ้นงวดจะถูกตัดออก โดยเก็บตัวเลขจากเอกสารที่ยื่นล่าสุด',
  },

  // ---- insider trades ---------------------------------------------------
  'insider.heading': {
    en: 'Insider buying — real prices from Form 4',
    th: 'การซื้อของคนวงใน — ราคาจริงจากแบบฟอร์ม 4',
  },
  'insider.summary': {
    en: '{count} open-market purchases · {shares} shares bought at a weighted average of {avg} · {from} to {to}',
    th: 'การซื้อในตลาดเปิด {count} รายการ · ซื้อทั้งหมด {shares} หุ้น ที่ราคาเฉลี่ยถ่วงน้ำหนัก {avg} · ตั้งแต่ {from} ถึง {to}',
  },
  'insider.noBuys': {
    en: 'No open-market insider purchases in the recent filings — buys shown anywhere else would be grants or option exercises, not market buys.',
    th: 'ไม่พบการซื้อในตลาดเปิดของคนวงในในเอกสารที่ยื่นล่าสุด — การได้หุ้นที่แสดงที่อื่นจะเป็นหุ้นที่ได้รับจัดสรรหรือการใช้สิทธิออปชัน ไม่ใช่การซื้อในตลาด',
  },
  'insider.colInsider': { en: 'Insider', th: 'คนวงใน' },
  'insider.colRole': { en: 'Role', th: 'ตำแหน่ง' },
  'insider.colSharesBought': { en: 'Shares bought', th: 'จำนวนหุ้นที่ซื้อ' },
  'insider.colAvgBuyPrice': { en: 'Avg buy price', th: 'ราคาซื้อเฉลี่ย' },
  'insider.colBuys': { en: 'Buys', th: 'จำนวนครั้งที่ซื้อ' },
  'insider.colMostRecentBuy': { en: 'Most recent buy', th: 'การซื้อครั้งล่าสุด' },
  'insider.colDate': { en: 'Date', th: 'วันที่' },
  'insider.colType': { en: 'Type', th: 'ประเภท' },
  'insider.colShares': { en: 'Shares', th: 'จำนวนหุ้น' },
  'insider.colPrice': { en: 'Price', th: 'ราคา' },
  'insider.colValue': { en: 'Value', th: 'มูลค่า' },
  'insider.realNote': {
    en: "Real trades parsed from this issuer's 12 most recent Form 4 filings on SEC EDGAR (ingest/edgar_form4.py).",
    th: 'รายการซื้อขายจริงที่แยกข้อมูลจากแบบฟอร์ม 4 ล่าสุด 12 ฉบับของผู้ออกหลักทรัพย์รายนี้บน SEC EDGAR',
  },
  'insider.noneFound': {
    en: "No Form 4 filings found for {ticker} in EDGAR's recent-filing window — foreign private issuers (e.g. 20-F filers) are exempt from Form 4 insider reporting, so there are no insider trades to show.",
    th: 'ไม่พบเอกสารแบบฟอร์ม 4 ของ {ticker} ในช่วงเอกสารล่าสุดของ EDGAR — ผู้ออกหลักทรัพย์ต่างประเทศ (เช่น ผู้ยื่นแบบ 20-F) ได้รับการยกเว้นจากการรายงานการซื้อขายของคนวงในตามแบบฟอร์ม 4 จึงไม่มีรายการซื้อขายของคนวงในให้แสดง',
  },

  // ---- institutional ownership -------------------------------------------
  'owners.intro': {
    en: '{count} institutional holders reported this stock in their latest Form 13F filings.',
    th: 'ผู้ถือหุ้นสถาบัน {count} ราย รายงานการถือหุ้นนี้ในเอกสารแบบฟอร์ม 13F ล่าสุดของตน',
  },
  'owners.holders': { en: 'Institutional holders', th: 'จำนวนผู้ถือหุ้นสถาบัน' },
  'owners.holdersMeta': { en: 'filers in the table below', th: 'ผู้ยื่นเอกสารในตารางด้านล่าง' },
  'owners.sharesReported': { en: 'Shares reported', th: 'จำนวนหุ้นที่รายงาน' },
  'owners.sharesReportedMeta': {
    en: "sum of each filer's latest position",
    th: 'ผลรวมสถานะล่าสุดของผู้ยื่นแต่ละราย',
  },
  'owners.reportedValue': { en: 'Reported value', th: 'มูลค่าที่รายงาน' },
  'owners.reportedValueMeta': {
    en: "filers' own as-filed figures",
    th: 'ตัวเลขตามที่ผู้ยื่นรายงานไว้',
  },
  'owners.pctOutstanding': { en: '% outstanding reported', th: '% ของหุ้นทั้งหมดที่รายงาน' },
  'owners.pctOutstandingMeta': {
    en: 'sum of per-filer % — periods differ per row',
    th: 'ผลรวม % ของผู้ยื่นแต่ละราย — แต่ละแถวเป็นคนละงวดกัน',
  },
  'owners.increased': { en: 'Positions increased', th: 'สถานะที่เพิ่มขึ้น' },
  'owners.increasedMeta': {
    en: '{count} of them brand-new positions',
    th: 'ในจำนวนนี้ {count} รายเป็นสถานะใหม่ทั้งหมด',
  },
  'owners.decreased': { en: 'Positions decreased', th: 'สถานะที่ลดลง' },
  'owners.decreasedMeta': {
    en: "vs the same filer's previous period",
    th: 'เทียบกับงวดก่อนหน้าของผู้ยื่นรายเดียวกัน',
  },
  'owners.top5': { en: 'Top 5 concentration', th: 'สัดส่วนผู้ถือรายใหญ่ 5 อันดับแรก' },
  'owners.top5Meta': {
    en: 'of reported shares held by the 5 largest holders',
    th: 'ของหุ้นที่รายงาน ซึ่งถือโดยผู้ถือรายใหญ่ที่สุด 5 ราย',
  },
  'owners.top10': { en: 'Top 10 concentration', th: 'สัดส่วนผู้ถือรายใหญ่ 10 อันดับแรก' },
  'owners.top10Meta': {
    en: 'of reported shares held by the 10 largest holders',
    th: 'ของหุ้นที่รายงาน ซึ่งถือโดยผู้ถือรายใหญ่ที่สุด 10 ราย',
  },
  'owners.avgMark': { en: 'Avg holder mark', th: 'ราคาประเมินเฉลี่ยของผู้ถือหุ้น' },
  'owners.nowPrice': { en: 'now {price}', th: 'ปัจจุบัน {price}' },
  'owners.vsMark': { en: 'vs mark', th: 'เทียบกับราคาประเมิน' },
  'owners.avgMarkMetaPlain': {
    en: 'period-end reported value ÷ shares',
    th: 'มูลค่าที่รายงาน ณ สิ้นงวด ÷ จำนวนหุ้น',
  },
  'owners.markNote': {
    en: 'Avg holder mark = total period-end reported value ÷ total shares across common-stock (Shares) positions only — an estimate of where holders were marked at quarter-end, not their purchase cost.',
    th: 'ราคาประเมินเฉลี่ยของผู้ถือหุ้น = มูลค่าที่รายงานรวม ณ สิ้นงวด ÷ จำนวนหุ้นรวม เฉพาะสถานะหุ้นสามัญ (Shares) เท่านั้น — เป็นค่าประมาณของราคาที่ผู้ถือหุ้นถูกประเมินไว้ ณ สิ้นไตรมาส ไม่ใช่ต้นทุนการซื้อจริง',
  },
  'owners.colHolder': { en: 'Holder', th: 'ผู้ถือหุ้น' },
  'owners.colType': { en: 'Type', th: 'ประเภท' },
  'owners.colShares': { en: 'Shares', th: 'จำนวนหุ้น' },
  'owners.colChange': { en: 'Change', th: 'การเปลี่ยนแปลง' },
  'owners.colReportedValue': { en: 'Reported value', th: 'มูลค่าที่รายงาน' },
  'owners.colPctOutstanding': { en: '% outstanding', th: '% ของหุ้นทั้งหมด' },
  'owners.colPeriod': { en: 'Period', th: 'งวด' },
  'owners.colFiled': { en: 'Filed', th: 'วันที่ยื่น' },
  'owners.showingNote': {
    en: 'Showing the {shown} largest positions of {total} reported holders — the complete table is in the data file this page loads (/owners/{ticker}.json).',
    th: 'แสดงสถานะที่ใหญ่ที่สุด {shown} อันดับ จากผู้ถือที่รายงานทั้งหมด {total} ราย — ตารางฉบับเต็มอยู่ในไฟล์ข้อมูลที่หน้านี้โหลด (/owners/{ticker}.json)',
  },
  'owners.realNote': {
    en: "Real holdings parsed from SEC Form 13F filings (SEC bulk Form 13F data sets, plus EDGAR filings for managers on notice status). Each row is that filer's own latest reported period — periods differ per filer and are shown per row. Change is versus the same filer's previous period. Reported value is the filer's own as-filed figure.",
    th: 'ข้อมูลการถือครองจริงที่แยกจากเอกสารแบบฟอร์ม 13F ของ SEC (ชุดข้อมูล 13F จำนวนมากของ SEC และเอกสาร EDGAR ของผู้จัดการกองทุนที่มีสถานะแจ้งล่วงหน้า) แต่ละแถวคืองวดที่รายงานล่าสุดของผู้ยื่นรายนั้น ๆ — แต่ละรายเป็นคนละงวดกันและแสดงไว้ในแต่ละแถว การเปลี่ยนแปลงเทียบกับงวดก่อนหน้าของผู้ยื่นรายเดียวกัน มูลค่าที่รายงานเป็นตัวเลขตามที่ผู้ยื่นรายงานไว้',
  },
  'owners.noneFound': {
    en: 'No Form 13F holders found for {ticker} in the latest processed filings.',
    th: 'ไม่พบผู้ถือหุ้นตามแบบฟอร์ม 13F ของ {ticker} ในเอกสารล่าสุดที่ประมวลผลแล้ว',
  },
  'owners.loading': {
    en: 'Loading reported holders…',
    th: 'กำลังโหลดข้อมูลผู้ถือหุ้นที่รายงาน…',
  },

  // ---- short interest ------------------------------------------------------
  'short.colSettlement': { en: 'Settlement date', th: 'วันที่ชำระราคา' },
  'short.colShortInterest': { en: 'Short interest', th: 'ชอร์ตอินเทอเรสต์' },
  'short.colAvgDailyVolume': { en: 'Avg daily volume', th: 'ปริมาณซื้อขายเฉลี่ยต่อวัน' },
  'short.colDaysToCover': { en: 'Days to cover', th: 'จำนวนวันในการปิดสถานะ (Days to Cover)' },
  'short.realNote': {
    en: "Real short interest from FINRA's Consolidated Short Interest file (ingest/finra_short_interest.py), cross-checked against Nasdaq's published short-interest table. Each row is a twice-monthly snapshot as of its settlement date — never a live figure.",
    th: 'ชอร์ตอินเทอเรสต์จริงจากไฟล์ Consolidated Short Interest ของ FINRA ตรวจสอบเทียบกับตารางชอร์ตอินเทอเรสต์ที่ Nasdaq เผยแพร่ แต่ละแถวเป็นข้อมูล ณ วันที่ชำระราคา ซึ่งเผยแพร่เดือนละสองครั้ง — ไม่ใช่ตัวเลขแบบเรียลไทม์',
  },
  'short.noneFound': {
    en: 'FINRA reports no short interest rows for {ticker} in the latest published settlement periods.',
    th: 'FINRA ไม่มีข้อมูลชอร์ตอินเทอเรสต์ของ {ticker} ในงวดการชำระราคาล่าสุดที่เผยแพร่',
  },

  // ---- SMC analysis ---------------------------------------------------------
  'smc.loading': { en: 'Loading price history…', th: 'กำลังโหลดประวัติราคา…' },
  'smc.error': {
    en: 'Daily price history could not be loaded for {ticker} just now, so the SMC analysis cannot be computed. Please try selecting the company again later.',
    th: 'ไม่สามารถโหลดประวัติราคารายวันของ {ticker} ได้ในขณะนี้ จึงคำนวณการวิเคราะห์ SMC ไม่ได้ โปรดลองเลือกบริษัทนี้อีกครั้งภายหลัง',
  },
  'smc.dailyTrend': { en: 'Daily trend', th: 'แนวโน้มรายวัน' },
  'smc.dailyTrendMeta': {
    en: 'market structure on daily candles',
    th: 'โครงสร้างตลาดจากกราฟแท่งเทียนรายวัน',
  },
  'smc.weeklyBias': { en: 'Weekly bias', th: 'ทิศทางรายสัปดาห์' },
  'smc.weeklyBiasMeta': {
    en: 'higher-timeframe reference',
    th: 'กรอบเวลาที่ใหญ่กว่า เพื่อใช้อ้างอิง',
  },
  'smc.signals5y': { en: 'Signals (5y)', th: 'สัญญาณ (5 ปี)' },
  'smc.signalsMeta': {
    en: 'signals over the full price history',
    th: 'สัญญาณจากประวัติราคาทั้งหมด',
  },
  'smc.tpRate': { en: 'TP hit rate', th: 'อัตราการแตะ TP' },
  'smc.tpRateMeta': { en: 'of closed signals', th: 'ของสัญญาณที่ปิดแล้ว' },
  'smc.trendUp': { en: 'Uptrend', th: 'แนวโน้มขาขึ้น' },
  'smc.trendDown': { en: 'Downtrend', th: 'แนวโน้มขาลง' },
  'smc.trendNone': { en: 'No clear trend', th: 'ไม่มีแนวโน้มชัดเจน' },
  'smc.checklistTitle': {
    en: 'Entry checklist (latest bar)',
    th: 'เช็กลิสต์การเข้าเทรด (แท่งล่าสุด)',
  },
  'smc.check.trend': { en: 'Trend direction', th: 'ทิศทางแนวโน้ม' },
  'smc.check.zone': { en: 'Zone on trend side', th: 'โซนฝั่งเดียวกับแนวโน้ม' },
  'smc.check.liquidity': { en: 'Liquidity level', th: 'ระดับสภาพคล่อง' },
  'smc.check.sweep': { en: 'Liquidity swept', th: 'สภาพคล่องถูกกวาดแล้ว' },
  'smc.check.rejection': { en: 'Rejection candle', th: 'แท่งเทียนปฏิเสธราคา' },
  'smc.check.retest': { en: 'Retest confirmation', th: 'การยืนยันด้วยการทดสอบซ้ำ (Retest)' },
  'smc.activeZones': { en: 'Active zones', th: 'โซนที่ยังใช้งานอยู่' },
  'smc.noActiveZones': { en: 'No active zones.', th: 'ไม่มีโซนที่ยังใช้งานอยู่' },
  'smc.colSide': { en: 'Side', th: 'ฝั่ง' },
  'smc.colRange': { en: 'Range', th: 'ช่วงราคา' },
  'smc.colTested': { en: 'Tested', th: 'จำนวนครั้งที่ถูกทดสอบ' },
  'smc.demand': { en: 'Demand', th: 'อุปสงค์ (Demand)' },
  'smc.supply': { en: 'Supply', th: 'อุปทาน (Supply)' },
  'smc.testedTimes': { en: 'Tested {n}×', th: 'ถูกทดสอบ {n} ครั้ง' },
  'smc.nearestLiquidity': { en: 'Nearest liquidity', th: 'สภาพคล่องที่ใกล้ที่สุด' },
  'smc.bslAbove': { en: 'Buy-side liquidity (above)', th: 'สภาพคล่องฝั่งซื้อ (ด้านบน)' },
  'smc.lastClose': { en: 'Last close', th: 'ราคาปิดล่าสุด' },
  'smc.sslBelow': { en: 'Sell-side liquidity (below)', th: 'สภาพคล่องฝั่งขาย (ด้านล่าง)' },
  'smc.signalHistory': { en: 'Signal history', th: 'ประวัติสัญญาณ' },
  'smc.signalSummary': {
    en: '{total} signals · {tp} TP · {sl} SL · {open} open · {expired} expired',
    th: 'สัญญาณ {total} รายการ · TP {tp} รายการ · SL {sl} รายการ · เปิดอยู่ {open} รายการ · หมดอายุ {expired} รายการ',
  },
  'smc.colDate': { en: 'Date', th: 'วันที่' },
  'smc.colEntry': { en: 'Entry', th: 'ราคาเข้า' },
  'smc.colOutcome': { en: 'Outcome', th: 'ผลลัพธ์' },
  'smc.buy': { en: 'BUY', th: 'ซื้อ (BUY)' },
  'smc.sell': { en: 'SELL', th: 'ขาย (SELL)' },
  'smc.outcomeTp': { en: 'TP hit', th: 'แตะ TP' },
  'smc.outcomeSl': { en: 'SL hit', th: 'แตะ SL' },
  'smc.outcomeOpen': { en: 'Open', th: 'เปิดอยู่' },
  'smc.outcomeExpired': { en: 'Expired', th: 'หมดอายุ' },
  'smc.noSignals': {
    en: 'No signals in the available price history.',
    th: 'ไม่มีสัญญาณในประวัติราคาที่มีอยู่',
  },
  'smc.sourceNote': {
    en: 'Prices from Yahoo Finance daily candles via our relay; SMC analysis computed in-browser from those candles; weekly candles provide the higher-timeframe bias. Analysis of public price data — not investment advice.',
    th: 'ราคาจากกราฟแท่งเทียนรายวันของ Yahoo Finance ผ่านระบบถ่ายทอดของเรา การวิเคราะห์ SMC คำนวณในเบราว์เซอร์จากแท่งเทียนเหล่านั้น แท่งเทียนรายสัปดาห์ให้ทิศทางของกรอบเวลาที่ใหญ่กว่า เป็นการวิเคราะห์ข้อมูลราคาสาธารณะ — ไม่ใช่คำแนะนำการลงทุน',
  },

  // ---- news ------------------------------------------------------------------
  'news.loading': { en: 'Loading news for {ticker}…', th: 'กำลังโหลดข่าวของ {ticker}…' },
  'news.error': {
    en: 'News for {ticker} could not be loaded just now. Please try again later.',
    th: 'ไม่สามารถโหลดข่าวของ {ticker} ได้ในขณะนี้ โปรดลองอีกครั้งภายหลัง',
  },
  'news.none': { en: 'No recent news found for {ticker}.', th: 'ไม่พบข่าวล่าสุดของ {ticker}' },
  'news.via': { en: 'News via Yahoo Finance.', th: 'ข่าวจาก Yahoo Finance' },

  // ---- info tab ---------------------------------------------------------------
  'info.monthsShort': {
    en: 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec',
    th: 'ม.ค.|ก.พ.|มี.ค.|เม.ย.|พ.ค.|มิ.ย.|ก.ค.|ส.ค.|ก.ย.|ต.ค.|พ.ย.|ธ.ค.',
  },
  'info.lastClose': { en: 'Last close', th: 'ราคาปิดล่าสุด' },
  'info.dayChange': { en: 'Day change', th: 'การเปลี่ยนแปลงประจำวัน' },
  'info.vsPrevClose': { en: 'vs previous close', th: 'เทียบกับราคาปิดก่อนหน้า' },
  'info.dayRange': { en: 'Day range', th: 'ช่วงราคาในวัน' },
  'info.dayRangeMeta': { en: 'last bar low – high', th: 'ต่ำสุด – สูงสุดของแท่งล่าสุด' },
  'info.volume': { en: 'Volume', th: 'ปริมาณการซื้อขาย' },
  'info.volumeMeta': { en: 'shares, last bar', th: 'จำนวนหุ้น ของแท่งล่าสุด' },
  'info.high52': { en: '52-week high', th: 'ราคาสูงสุดใน 52 สัปดาห์' },
  'info.low52': { en: '52-week low', th: 'ราคาต่ำสุดใน 52 สัปดาห์' },
  'info.weekMeta': { en: 'last 252 bars', th: 'จากแท่งล่าสุด 252 แท่ง' },
  'info.marketCap': { en: 'Market cap', th: 'มูลค่าตลาด' },
  'info.marketCapMeta': {
    en: 'last close × shares outstanding',
    th: 'ราคาปิดล่าสุด × จำนวนหุ้นที่ออกจำหน่ายแล้ว',
  },
  'info.barNote': {
    en: 'Latest daily bar ({date}) — not a streaming quote.',
    th: 'แท่งรายวันล่าสุด ({date}) — ไม่ใช่ราคาแบบสตรีมมิงเรียลไทม์',
  },
  'info.barNoteNoDate': {
    en: 'Latest daily bar — not a streaming quote.',
    th: 'แท่งรายวันล่าสุด — ไม่ใช่ราคาแบบสตรีมมิงเรียลไทม์',
  },
  'info.noPrices': {
    en: 'Price history is not available for {ticker} just now, so no quote strip can be shown.',
    th: 'ประวัติราคาของ {ticker} ไม่พร้อมใช้งานในขณะนี้ จึงแสดงแถบราคาไม่ได้',
  },
  'info.companyWebsite': { en: 'Company website', th: 'เว็บไซต์บริษัท' },
  'info.secFilings': { en: 'SEC filings', th: 'เอกสารที่ยื่นต่อ SEC สหรัฐฯ' },
  'info.latestAnnual': {
    en: 'Latest annual report ({form})',
    th: 'รายงานประจำปีล่าสุด ({form})',
  },
  'info.yahooFinance': { en: 'Yahoo Finance', th: 'Yahoo Finance' },
  'info.googleFinance': { en: 'Google Finance', th: 'Google Finance' },
  'info.loading': {
    en: 'Loading company information from SEC EDGAR…',
    th: 'กำลังโหลดข้อมูลบริษัทจาก SEC EDGAR…',
  },
  'info.error': {
    en: 'Company details from EDGAR could not be loaded just now. The quote and the links above do not depend on that feed.',
    th: 'ไม่สามารถโหลดรายละเอียดบริษัทจาก EDGAR ได้ในขณะนี้ ราคาและลิงก์ด้านบนไม่ต้องพึ่งพาฟีดดังกล่าว',
  },
  'info.factsTitle': { en: 'Company facts', th: 'ข้อมูลบริษัท' },
  'info.industry': { en: 'Industry', th: 'อุตสาหกรรม' },
  'info.notReported': { en: 'not reported', th: 'ไม่มีรายงาน' },
  'info.exchange': { en: 'Exchange', th: 'ตลาดหลักทรัพย์' },
  'info.exchangeMeta': { en: 'listing exchange', th: 'ตลาดที่จดทะเบียน' },
  'info.headquarters': { en: 'Headquarters', th: 'สำนักงานใหญ่' },
  'info.businessAddressOnFile': {
    en: 'business address on file',
    th: 'ที่อยู่ธุรกิจตามที่บันทึกไว้',
  },
  'info.phone': { en: 'Phone', th: 'โทรศัพท์' },
  'info.phoneMeta': { en: 'as filed with the SEC', th: 'ตามที่ยื่นต่อ SEC สหรัฐฯ' },
  'info.fiscalYearEnd': { en: 'Fiscal year end', th: 'วันสิ้นงวดบัญชี' },
  'info.fiscalYearEndMeta': { en: 'month / day', th: 'เดือน / วัน' },
  'info.incorporated': { en: 'Incorporated', th: 'จดทะเบียนจัดตั้ง' },
  'info.incorporatedMeta': {
    en: 'state / country of incorporation',
    th: 'รัฐ / ประเทศที่จดทะเบียนจัดตั้ง',
  },
  'info.entityCategory': { en: 'Entity category', th: 'ประเภทนิติบุคคล' },
  'info.entityCategoryMeta': { en: 'SEC filer category', th: 'ประเภทผู้ยื่นตามเกณฑ์ของ SEC สหรัฐฯ' },
  'info.recentFilings': { en: 'Recent filings', th: 'เอกสารที่ยื่นล่าสุด' },
  'info.colForm': { en: 'Form', th: 'แบบฟอร์ม' },
  'info.colFiled': { en: 'Filed', th: 'วันที่ยื่น' },
  'info.colReportDate': { en: 'Report date', th: 'วันที่ของรายงาน' },
  'info.filingsNote': {
    en: 'Filed with the SEC via EDGAR — updates within minutes of filing.',
    th: 'ยื่นต่อ SEC สหรัฐฯ ผ่าน EDGAR — อัปเดตภายในไม่กี่นาทีหลังการยื่น',
  },

  // ---- auth modal ---------------------------------------------------------------
  'auth.titleLogin': { en: 'Log in to TickPin', th: 'เข้าสู่ระบบ TickPin' },
  'auth.titleSignup': { en: 'Create your TickPin account', th: 'สร้างบัญชี TickPin ของคุณ' },
  'auth.titleForgot': { en: 'Reset your password', th: 'รีเซ็ตรหัสผ่าน' },
  'auth.titleNewPassword': { en: 'Choose a new password', th: 'ตั้งรหัสผ่านใหม่' },
  'auth.notConfigured': {
    en: 'Accounts are being set up — please check back shortly.',
    th: 'ระบบบัญชีกำลังอยู่ระหว่างการตั้งค่า — โปรดกลับมาตรวจสอบอีกครั้งเร็ว ๆ นี้',
  },
  'auth.continueGoogle': { en: 'Continue with Google', th: 'ดำเนินการต่อด้วย Google' },
  'auth.orEmail': { en: 'or with email', th: 'หรือด้วยอีเมล' },
  'auth.forgotIntro': {
    en: 'Enter the email you signed up with and we will send you a link to set a new password.',
    th: 'กรอกอีเมลที่คุณใช้สมัครสมาชิก แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้',
  },
  'auth.newPasswordIntro': {
    en: 'Almost there — pick a new password for your account.',
    th: 'เกือบเสร็จแล้ว — เลือกรหัสผ่านใหม่สำหรับบัญชีของคุณ',
  },
  'auth.emailPlaceholder': { en: 'Email address', th: 'ที่อยู่อีเมล' },
  'auth.passwordPlaceholder': { en: 'Password', th: 'รหัสผ่าน' },
  'auth.newPasswordPlaceholder': { en: 'New password', th: 'รหัสผ่านใหม่' },
  'auth.repeatPasswordPlaceholder': { en: 'Repeat new password', th: 'ยืนยันรหัสผ่านใหม่' },
  'auth.forgotLink': { en: 'Forgot your password?', th: 'ลืมรหัสผ่าน?' },
  'auth.accountCreated': {
    en: 'Account created — check your email to confirm it, then log in.',
    th: 'สร้างบัญชีเรียบร้อย — โปรดตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วเข้าสู่ระบบ',
  },
  'auth.resetSent': {
    en: 'If an account exists for that email, a password reset link is on its way. Check your inbox.',
    th: 'หากมีบัญชีที่ใช้อีเมลนี้ ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปให้แล้ว โปรดตรวจสอบกล่องจดหมายของคุณ',
  },
  'auth.passwordMismatch': {
    en: 'The two passwords do not match.',
    th: 'รหัสผ่านทั้งสองไม่ตรงกัน',
  },
  'auth.genericError': {
    en: 'Something went wrong. Please try again.',
    th: 'เกิดข้อผิดพลาด โปรดลองอีกครั้ง',
  },
  'auth.pleaseWait': { en: 'Please wait…', th: 'โปรดรอสักครู่…' },
  'auth.login': { en: 'Log in', th: 'เข้าสู่ระบบ' },
  'auth.signup': { en: 'Sign up', th: 'สมัครสมาชิก' },
  'auth.sendResetLink': { en: 'Send reset link', th: 'ส่งลิงก์รีเซ็ต' },
  'auth.saveNewPassword': { en: 'Save new password', th: 'บันทึกรหัสผ่านใหม่' },
  'auth.newHere': { en: 'New here?', th: 'ยังไม่มีบัญชี?' },
  'auth.createAccount': { en: 'Create an account', th: 'สร้างบัญชี' },
  'auth.alreadyHave': { en: 'Already have an account?', th: 'มีบัญชีอยู่แล้ว?' },
  'auth.close': { en: 'Close', th: 'ปิด' },

  // ---- admin panel ----------------------------------------------------------------
  'admin.title': { en: 'Admin — Members', th: 'ผู้ดูแลระบบ — สมาชิก' },
  'admin.loading': { en: 'Loading members…', th: 'กำลังโหลดรายชื่อสมาชิก…' },
  'admin.countLine': {
    en: '{members} member{ms} · {admins} admin{as}',
    th: 'สมาชิก {members} คน · ผู้ดูแลระบบ {admins} คน',
  },
  'admin.colMember': { en: 'Member', th: 'สมาชิก' },
  'admin.colEmail': { en: 'Email', th: 'อีเมล' },
  'admin.colJoined': { en: 'Joined', th: 'วันที่เข้าร่วม' },
  'admin.colRole': { en: 'Role', th: 'บทบาท' },
  'admin.roleAdmin': { en: 'Admin', th: 'ผู้ดูแลระบบ' },
  'admin.roleMember': { en: 'Member', th: 'สมาชิก' },
  'admin.makeAdmin': { en: 'Make admin', th: 'ตั้งเป็นผู้ดูแลระบบ' },
  'admin.removeAdmin': { en: 'Remove admin', th: 'ถอดถอนผู้ดูแลระบบ' },
  'admin.confirmMake': {
    en: 'Make {email} an admin? Admins can manage members.',
    th: 'ตั้ง {email} เป็นผู้ดูแลระบบหรือไม่? ผู้ดูแลระบบสามารถจัดการสมาชิกได้',
  },
  'admin.confirmRemove': {
    en: 'Remove admin from {email}?',
    th: 'ถอดถอนสิทธิ์ผู้ดูแลระบบของ {email} หรือไม่?',
  },

  // ---- dashboard ----------------------------------------------------------------------
  'dash.loadingDashboard': {
    en: 'Loading your dashboard…',
    th: 'กำลังโหลดแดชบอร์ดของคุณ…',
  },
  'dash.title': { en: 'My Dashboard', th: 'แดชบอร์ดของฉัน' },
  'dash.loginTitle': {
    en: 'Log in to build your own dashboard',
    th: 'เข้าสู่ระบบเพื่อสร้างแดชบอร์ดของคุณเอง',
  },
  'dash.loginNote': {
    en: 'Sign in to save a personal watchlist, see live closes and sparklines for your stocks, and get a news feed for the companies you follow.',
    th: 'เข้าสู่ระบบเพื่อบันทึกรายการเฝ้าดูส่วนตัว ดูราคาปิดและกราฟเส้นย่อของหุ้นของคุณ และรับฟีดข่าวของบริษัทที่คุณติดตาม',
  },
  'dash.login': { en: 'Log in', th: 'เข้าสู่ระบบ' },
  'dash.myWatchlist': { en: 'My Watchlist', th: 'รายการเฝ้าดูของฉัน' },
  'dash.loadingWatchlist': {
    en: 'Loading your watchlist…',
    th: 'กำลังโหลดรายการเฝ้าดูของคุณ…',
  },
  'dash.emptyWatchlist': {
    en: 'Your watchlist is empty — add your first stock with the box below.',
    th: 'รายการเฝ้าดูของคุณยังว่างอยู่ — เพิ่มหุ้นตัวแรกด้วยช่องค้นหาด้านล่าง',
  },
  'dash.remove': { en: 'Remove', th: 'นำออก' },
  'dash.removeAria': {
    en: 'Remove {ticker} from watchlist',
    th: 'นำ {ticker} ออกจากรายการเฝ้าดู',
  },
  'dash.openTitle': { en: 'Open {ticker}', th: 'เปิด {ticker}' },
  'dash.addStock': { en: 'Add a stock', th: 'เพิ่มหุ้น' },
  'dash.addPlaceholder': {
    en: 'Search by ticker or company name…',
    th: 'ค้นหาด้วยสัญลักษณ์หุ้นหรือชื่อบริษัท…',
  },
  'dash.addAria': {
    en: 'Add a stock to your watchlist',
    th: 'เพิ่มหุ้นลงในรายการเฝ้าดูของคุณ',
  },
  'dash.alreadyAdded': { en: 'already added', th: 'เพิ่มแล้ว' },
  'dash.newsTitle': { en: 'News for your watchlist', th: 'ข่าวสำหรับรายการเฝ้าดูของคุณ' },
  'dash.newsEmptyList': {
    en: 'Add stocks above and their latest headlines will appear here.',
    th: 'เพิ่มหุ้นด้านบน แล้วพาดหัวข่าวล่าสุดของหุ้นเหล่านั้นจะปรากฏที่นี่',
  },
  'dash.loadingNews': {
    en: 'Loading news for your watchlist…',
    th: 'กำลังโหลดข่าวสำหรับรายการเฝ้าดูของคุณ…',
  },
  'dash.noNews': {
    en: 'No recent news found for your watchlist.',
    th: 'ไม่พบข่าวล่าสุดสำหรับรายการเฝ้าดูของคุณ',
  },
  'dash.newsVia': { en: 'News via Yahoo Finance.', th: 'ข่าวจาก Yahoo Finance' },
}

export { STRINGS }

const LangContext = createContext(null)
const STORAGE_KEY = 'tickpin-lang'

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'en' || saved === 'th') return saved
    } catch {
      // storage unavailable (private mode etc.) — fall through to default
    }
    return 'th'
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore — language simply won't persist
    }
  }, [lang])

  function t(key, params) {
    const entry = STRINGS[key]
    let text = entry ? (entry[lang] ?? entry.en ?? key) : key
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value))
      }
    }
    return text
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>')
  return ctx
}
