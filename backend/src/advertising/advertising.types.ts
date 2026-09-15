export type JsonRecord = Record<string, unknown>;

export interface DecisionContext extends JsonRecord {
    placementCode: string;
    surface: string;
    clientKind: string;
    locale: string;
    formFactor: string;
    objectClass?: string;
    contentCategory?: string;
    geography?: { countryCode: string; regionCode?: string; cityCode?: string };
    connectivity: string;
    criticalState: boolean;
    providerConsent: boolean;
    capToken?: string;
}

export interface CampaignInput extends JsonRecord {
    advertiserName: string;
    advertiserLegalId: string;
    timezone: string;
    startsAt: string;
    endsAt: string;
    currency: string;
    budgetMinor: number;
    billingModel: string;
    rateMinor: number;
    priorityTier: string;
    cap24Hours: number;
    cap7Days: number;
    placementIds: string[];
    targetRules: TargetRuleInput[];
    legalLabel: { label: string; advertiserName: string; registrationToken: string | null; disclosure: string | null };
    policyVersion: string;
}

export interface CampaignRevisionInput extends CampaignInput {
    expectedVersion: number;
    creativeIds: string[];
}

export interface TargetRuleInput extends JsonRecord {
    dimension: string;
    operator: string;
    values: string[];
}

export interface CreativeInput extends JsonRecord {
    campaignId: string;
    expectedCampaignVersion: number;
    format: string;
    assetId: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
    altText: string;
    headline?: string;
    body?: string;
    landingUrl: string;
    approvedRedirectHosts: string[];
}
