import { NotFoundError } from "../../utils/errors";
import { createModuleLogger } from "../../utils/logger";
import { persistBuffer, type PersistedFile } from "../../utils/storage";
import { getEnvConfig } from "../config/config.service";

import type { NormalizedSourceDocument, SourceFetchParams } from "./types";

type CompanyTickerEntry = {
  cik: string;
  title: string;
};

type SecFilingsResponse = {
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
};

const COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const BROWSE_EDGAR_URL = "https://www.sec.gov/cgi-bin/browse-edgar";

const formatCik = (cik: string) => cik.padStart(10, "0");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SecFilingsService {
  private readonly logger = createModuleLogger("sources:sec");
  private readonly rateLimitMs = 200;
  private lastRequestAt = 0;
  private readonly fetchFn: typeof fetch;
  private readonly companyIndex = new Map<string, CompanyTickerEntry>();
  private companyIndexLoaded = false;

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  private getUserAgent() {
    const { credentials } = getEnvConfig();
    const email = credentials.secEmail ?? "contact@fin-rag.local";
    return `FullStackFinance/0.1 (${email})`;
  }

  private async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.rateLimitMs) {
      await wait(this.rateLimitMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private async loadCompanyIndex() {
    if (this.companyIndexLoaded) {
      return;
    }
    await this.throttle();
    const response = await this.fetchFn(COMPANY_TICKERS_URL, {
      headers: {
        "User-Agent": this.getUserAgent(),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load SEC ticker index: ${response.status} ${response.statusText}`);
    }

    const raw = (await response.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;
    Object.values(raw).forEach((entry) => {
      this.companyIndex.set(entry.ticker.toUpperCase(), {
        cik: entry.cik_str.toString(),
        title: entry.title,
      });
    });

    this.companyIndexLoaded = true;
    this.logger.info({ count: this.companyIndex.size }, "Loaded SEC company ticker index");
  }

  private async resolveTicker(ticker: string) {
    try {
      await this.loadCompanyIndex();
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to load SEC ticker index; falling back to lookup");
    }
    const normalized = ticker.trim().toUpperCase();
    const entry = this.companyIndex.get(normalized);
    if (entry) {
      return entry;
    }

    const fallback = await this.lookupTickerViaBrowseEdgar(normalized);
    if (fallback) {
      this.companyIndex.set(normalized, fallback);
      return fallback;
    }

    throw new NotFoundError(`SEC filings not found for ticker ${normalized}`);
  }

  private async lookupTickerViaBrowseEdgar(ticker: string): Promise<CompanyTickerEntry | null> {
    const params = new URLSearchParams({
      CIK: ticker,
      owner: "exclude",
      action: "getcompany",
      output: "atom",
    });

    await this.throttle();
    const response = await this.fetchFn(`${BROWSE_EDGAR_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": this.getUserAgent(),
        Accept: "application/atom+xml, text/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      this.logger.error(
        { ticker, status: response.status, statusText: response.statusText },
        "Browse-Edgar lookup failed",
      );
      return null;
    }

    const xml = await response.text();
    const cikMatch = xml.match(/<cik>(\d+)<\/cik>/i);
    const cikValue = cikMatch?.[1];
    if (!cikValue) {
      this.logger.warn({ ticker }, "Browse-Edgar response did not include a CIK");
      return null;
    }
    const nameMatch = xml.match(/<conformed-name>([^<]+)<\/conformed-name>/i);
    const resolvedName = nameMatch?.[1]?.trim();

    return {
      cik: cikValue,
      title: resolvedName && resolvedName.length > 0 ? resolvedName : ticker,
    };
  }

  private async fetchFilingsFeed(cik: string): Promise<SecFilingsResponse> {
    await this.throttle();
    const response = await this.fetchFn(
      `https://data.sec.gov/submissions/CIK${formatCik(cik)}.json`,
      {
        headers: {
          "User-Agent": this.getUserAgent(),
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`SEC filings request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as SecFilingsResponse;
  }

  private sanitizeDocumentName(primaryDocument: string) {
    const base = primaryDocument.split(/[\\/]/).pop() ?? primaryDocument;
    return base.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private async downloadPrimaryDocument(
    cik: string,
    accessionNumber: string,
    primaryDocument: string,
  ): Promise<PersistedFile & { url: string; contentType?: string }> {
    const sanitizedAccession = accessionNumber.replace(/-/g, "");
    const downloadUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${sanitizedAccession}/${primaryDocument}`;

    await this.throttle();
    const response = await this.fetchFn(downloadUrl, {
      headers: {
        "User-Agent": this.getUserAgent(),
        Accept: "text/plain,application/octet-stream",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download SEC document ${downloadUrl}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? undefined;
    const persisted = await persistBuffer(
      buffer,
      pathSegmentForTicker(cik),
      `${sanitizedAccession}-${this.sanitizeDocumentName(primaryDocument)}`,
    );

    return {
      ...persisted,
      url: downloadUrl,
      contentType,
    };
  }

  async fetchFilings(
    ticker: string,
    params: SourceFetchParams = {},
  ): Promise<NormalizedSourceDocument[]> {
    const company = await this.resolveTicker(ticker);
    const feed = await this.fetchFilingsFeed(company.cik);

    const recent = feed.filings?.recent;
    if (!recent) {
      return [];
    }

    const start = params.cursor ? Number.parseInt(params.cursor, 10) || 0 : 0;
    const limit = params.limit ?? 10;

    const indices = Array.from(
      { length: recent.accessionNumber.length },
      (_, index) => index,
    ).slice(start, start + limit);

    const documents: NormalizedSourceDocument[] = [];

    for (const index of indices) {
      const accessionNumber = recent.accessionNumber[index];
      if (!accessionNumber) {
        this.logger.warn({ index }, "Skipping filing without accession number");
        continue;
      }
      const primaryDocument = recent.primaryDocument[index];
      const formValue = recent.form[index] ?? "UNKNOWN";

      if (!primaryDocument) {
        this.logger.warn({ accessionNumber }, "Skipping filing without primary document");
        continue;
      }

      try {
        const persisted = await this.downloadPrimaryDocument(
          company.cik,
          accessionNumber,
          primaryDocument,
        );

        documents.push({
          sourceType: "sec",
          ticker: ticker.toUpperCase(),
          title: recent.primaryDocDescription[index] ?? formValue,
          formType: formValue,
          url: persisted.url,
          contentType: persisted.contentType,
          textPath: persisted.path,
          textHash: persisted.hash,
          bytes: persisted.bytes,
          publishedAt: recent.filingDate[index] ? new Date(recent.filingDate[index]) : undefined,
          metadata: {
            cik: company.cik,
            accessionNumber,
            reportDate: recent.reportDate[index],
            primaryDocument,
            companyName: company.title,
          },
        });
      } catch (error) {
        this.logger.error({ err: error, accessionNumber }, "Failed to process SEC filing");
      }
    }

    return documents;
  }
}

const pathSegmentForTicker = (ticker: string) => `sec/${ticker.toUpperCase()}`;
