-- Optional sales context. It is neither marketing attribution nor diagnosis input.
BEGIN;

ALTER TABLE sales_activity
  ADD COLUMN referral_person_name TEXT;

COMMIT;
