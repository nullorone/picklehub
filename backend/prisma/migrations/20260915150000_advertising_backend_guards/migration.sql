DROP TRIGGER "campaign_revisions_immutable" ON "campaign_revisions";

CREATE FUNCTION "advertising_campaign_revision_approval_only"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.reviewed_by_user_id IS NULL AND OLD.approved_at IS NULL
        AND NEW.reviewed_by_user_id IS NOT NULL AND NEW.approved_at IS NOT NULL
        AND ROW(NEW.id, NEW.campaign_id, NEW.revision, NEW.advertiser_name, NEW.advertiser_legal_id, NEW.timezone,
            NEW.starts_at, NEW.ends_at, NEW.currency, NEW.budget_minor, NEW.billing_model, NEW.rate_minor,
            NEW.priority_tier, NEW.cap_24_hours, NEW.cap_7_days, NEW.placement_ids, NEW.creative_ids,
            NEW.legal_label, NEW.legal_disclosure, NEW.registration_token, NEW.policy_version, NEW.snapshot_hash,
            NEW.submitted_by_user_id, NEW.created_at)
        IS NOT DISTINCT FROM
        ROW(OLD.id, OLD.campaign_id, OLD.revision, OLD.advertiser_name, OLD.advertiser_legal_id, OLD.timezone,
            OLD.starts_at, OLD.ends_at, OLD.currency, OLD.budget_minor, OLD.billing_model, OLD.rate_minor,
            OLD.priority_tier, OLD.cap_24_hours, OLD.cap_7_days, OLD.placement_ids, OLD.creative_ids,
            OLD.legal_label, OLD.legal_disclosure, OLD.registration_token, OLD.policy_version, OLD.snapshot_hash,
            OLD.submitted_by_user_id, OLD.created_at) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'campaign revision snapshot is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "campaign_revisions_immutable" BEFORE UPDATE OR DELETE ON "campaign_revisions"
    FOR EACH ROW EXECUTE FUNCTION "advertising_campaign_revision_approval_only"();

DROP TRIGGER "ad_delivery_events_append_only" ON "ad_delivery_events";
CREATE TRIGGER "ad_delivery_events_append_only" BEFORE UPDATE ON "ad_delivery_events"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();

ALTER TABLE "ad_provider_policies"
    ADD COLUMN "policy_version" VARCHAR(32) NOT NULL
        CHECK ("policy_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$');

DROP TRIGGER "ad_delivery_events_budget_frequency_guard" ON "ad_delivery_events";
CREATE TRIGGER "ad_delivery_events_budget_frequency_guard" BEFORE INSERT ON "ad_delivery_events"
    FOR EACH ROW WHEN (NEW."kind" <> 'RESERVATION_RELEASED') EXECUTE FUNCTION "advertising_delivery_guard"();

CREATE FUNCTION "advertising_expired_reservation_release_guard"() RETURNS TRIGGER AS $$
DECLARE
    issued_row ad_delivery_events%ROWTYPE;
BEGIN
    SELECT * INTO issued_row FROM ad_delivery_events
        WHERE delivery_id = NEW.delivery_id AND kind = 'ISSUED' FOR UPDATE;
    IF NOT FOUND OR issued_row.source <> NEW.source OR issued_row.campaign_id <> NEW.campaign_id
        OR issued_row.campaign_revision_id <> NEW.campaign_revision_id
        OR issued_row.creative_id <> NEW.creative_id OR issued_row.placement_id <> NEW.placement_id
        OR NEW.occurred_at < issued_row.token_expires_at THEN
        RAISE EXCEPTION 'release must reference an expired issued reservation' USING ERRCODE = '23514';
    END IF;
    UPDATE campaigns SET reserved_minor = reserved_minor - issued_row.reserved_minor
        WHERE id = NEW.campaign_id AND reserved_minor >= issued_row.reserved_minor;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reservation already finalized or released' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ad_delivery_events_expired_release_guard" BEFORE INSERT ON "ad_delivery_events"
    FOR EACH ROW WHEN (NEW."kind" = 'RESERVATION_RELEASED')
    EXECUTE FUNCTION "advertising_expired_reservation_release_guard"();
