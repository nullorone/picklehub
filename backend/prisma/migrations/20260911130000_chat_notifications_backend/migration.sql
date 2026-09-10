-- Backfill conversations for matches published before the communication projector is deployed.
INSERT INTO conversations (
    id, match_id, state, write_closes_at, retention_expires_at, created_at, updated_at
)
SELECT
    md5(random()::text || clock_timestamp()::text || match.id::text)::uuid,
    match.id,
    CASE
        WHEN match.state IN ('CANCELLED', 'DISPUTED', 'VOIDED') THEN 'READ_ONLY'::conversation_state
        ELSE 'WRITABLE'::conversation_state
    END,
    CASE
        WHEN match.state IN ('CANCELLED', 'DISPUTED', 'VOIDED') THEN match.updated_at
        WHEN match.state = 'COMPLETED' THEN match.updated_at + INTERVAL '7 days'
        ELSE NULL
    END,
    CASE
        WHEN match.state IN ('CANCELLED', 'DISPUTED', 'VOIDED', 'COMPLETED') THEN match.updated_at + INTERVAL '180 days'
        ELSE NULL
    END,
    COALESCE(match.published_at, match.created_at),
    CURRENT_TIMESTAMP
FROM matches AS match
WHERE match.state <> 'DRAFT'
ON CONFLICT (match_id) DO NOTHING;

INSERT INTO conversation_memberships (
    id, conversation_id, user_id, access_granted_at, access_revoked_at, access_through_sequence,
    read_access_expires_at
)
SELECT
    md5(random()::text || clock_timestamp()::text || participant.id::text)::uuid,
    conversation.id,
    participant.user_id,
    participant.joined_at,
    CASE WHEN participant.state = 'LEFT' THEN participant.resolved_at ELSE NULL END,
    CASE WHEN participant.state = 'LEFT' THEN conversation.latest_sequence ELSE NULL END,
    CASE WHEN participant.state = 'LEFT' THEN participant.resolved_at + INTERVAL '30 days' ELSE NULL END
FROM match_participants AS participant
JOIN conversations AS conversation ON conversation.match_id = participant.match_id
WHERE participant.state IN ('ACTIVE', 'PLAYED', 'CANCELLED', 'LEFT')
  AND (
      participant.state <> 'LEFT'
      OR participant.resolved_at IS NOT NULL
  )
ON CONFLICT DO NOTHING;
