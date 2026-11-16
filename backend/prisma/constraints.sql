CREATE OR REPLACE FUNCTION reject_negotiation_history_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Negotiation history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS negotiation_history_is_immutable ON "NegotiationEvent";
CREATE TRIGGER negotiation_history_is_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON "NegotiationEvent"
FOR EACH STATEMENT EXECUTE FUNCTION reject_negotiation_history_change();
